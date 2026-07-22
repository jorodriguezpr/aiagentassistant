/**
 * AI Agent Assistant (AiAgentAssistant)
 * Autonomous Monitor - periodic, observation-only awareness of the SysAdminHCP panel
 *
 * Every 5 minutes, checks panel system health, open tickets, and intrusion
 * activity via the existing hcp_* tools, and records what it found as
 * "observations" in a persisted state file. This phase never mutates the
 * panel — deterministic threshold rules decide severity, not an AI call, so
 * behavior is cheap, fast, and easy to verify. Acting on delegated
 * responsibilities is a later, separately-gated phase.
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import logger from '../utils/logger';
import { AIToolExecutor, AI_TOOLS } from '../utils/AITools';
import { AIProvider, ChatMessage } from '../utils/AIProvider';
import { AgentState, ObservationCategory, loadAutonomousState, saveAutonomousState, addObservation, appendActionLog, findActiveDelegation } from '../utils/AutonomousState';

const DISK_WARNING_PERCENT = 90;
const MEMORY_WARNING_PERCENT = 90;
const BACKUP_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const TICKET_LOOP_MAX_ITERATIONS = 8;

// The curated, delegation-gated SysAdminHCP tool subset the ticket-handling
// agent loop is allowed to use — deliberately excludes execute_command/
// write_file/etc. Each action tool (hcp_reply_ticket, hcp_restart_service,
// hcp_suspend_client, ...) still re-checks its own delegation gate at call
// time regardless of being offered here, so exposing the full hcp_* roster
// is safe even though only 'tickets' actions are exercised by this loop today.
// AIProvider.chatCompletion expects the {type:'function', function:{...}}
// shape (see TelegramGateway's own conversion) — AI_TOOLS itself is flat.
const HCP_TOOLS = AI_TOOLS
  .filter((t) => t.name.startsWith('hcp_'))
  .map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));

/**
 * Minimal Telegram sender interface — accepts the real TelegramGateway or
 * any object with a compatible sendMessage method, so this file doesn't need
 * to import the (large) gateway module directly.
 */
export interface TelegramNotifier {
  sendMessage(chatId: number | string, text: string): Promise<void>;
}

export class AutonomousMonitor {
  private executor: AIToolExecutor;
  private telegram: TelegramNotifier | null;
  private adminChatId: string | null;
  private aiProvider: AIProvider | null;

  constructor(executor: AIToolExecutor, telegram: TelegramNotifier | null, aiProvider: AIProvider | null = null) {
    this.executor = executor;
    this.telegram = telegram;
    this.aiProvider = aiProvider;
    // Reuses the same allow-listed admin chat already configured for Telegram
    this.adminChatId = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',')[0]?.trim() || null;
  }

  async runCycle(): Promise<void> {
    const state = loadAutonomousState();

    if (state.autonomousEnabled === false) {
      logger.info('AutonomousMonitor: disabled via panel toggle, skipping cycle');
      return;
    }

    logger.info('AutonomousMonitor: starting check cycle');

    const criticalMessages: { category: ObservationCategory; message: string }[] = [];

    await this.checkSystemHealth(state, criticalMessages);
    await this.checkTickets(state, criticalMessages);
    await this.checkSecurity(state, criticalMessages);
    await this.checkBackups(state, criticalMessages);

    // Gated action calls made during this cycle (e.g. hcp_reply_ticket,
    // hcp_retry_backup) each independently read + appended to actionLog on
    // disk via gateAction/appendActionLog. Blindly saving the state object
    // held since the top of this cycle would clobber those writes — reload
    // fresh and only overlay what this cycle itself is responsible for.
    const latest = loadAutonomousState();
    latest.lastCheckAt = new Date().toISOString();
    latest.observations = state.observations;
    saveAutonomousState(latest);

    for (const { category, message } of criticalMessages) {
      await this.notifyAdmin(latest, category, message);
    }

    logger.info({ observationCount: state.observations.length }, 'AutonomousMonitor: check cycle complete');
  }

  private async checkSystemHealth(state: AgentState, criticalMessages: { category: ObservationCategory; message: string }[]): Promise<void> {
    try {
      const result = await this.executor.execute('hcp_get_system_health', {});
      if (!result?.success) {
        addObservation(state, { category: 'system', severity: 'warning', summary: `Could not reach panel: ${result?.error || 'unknown error'}` });
        return;
      }

      const services = result.services?.services || {};
      // monitoringEnabled comes from the panel's Services -> Service Management toggle
      // (defaults to true) -- an admin excludes an installed-but-unused alternate driver
      // (e.g. Nginx sitting alongside the actually-active Apache) so it isn't flagged as down.
      const downServices = Object.values(services).filter((s: any) => s?.isInstalled && !s?.isRunning && s?.monitoringEnabled !== false);
      if (downServices.length > 0) {
        const names = downServices.map((s: any) => s.name).join(', ');
        const msg = `${downServices.length} installed service(s) not running: ${names}`;
        addObservation(state, { category: 'system', severity: 'critical', summary: msg, detail: downServices });
        criticalMessages.push({ category: 'system', message: `🚨 SysAdminHCP: ${msg}` });
      }

      // /api/system/disk returns { disk: [{filesystem,size,used,avail,usePercent,mount}, ...] },
      // one row per mounted filesystem -- usePercent is a string like "45%". Prefer the row for
      // "/", falling back to the first row if "/" isn't present (e.g. a container/chroot setup).
      const diskRows: any[] = Array.isArray(result.disk?.disk) ? result.disk.disk : [];
      const diskRow = diskRows.find((d: any) => d?.mount === '/') || diskRows[0];
      const diskPercent = diskRow ? parseInt(String(diskRow.usePercent).replace('%', ''), 10) : NaN;
      if (!isNaN(diskPercent) && diskPercent >= DISK_WARNING_PERCENT) {
        const msg = `Disk usage at ${diskPercent}% (threshold ${DISK_WARNING_PERCENT}%)`;
        addObservation(state, { category: 'system', severity: 'warning', summary: msg });
      }

      // /api/system/memory returns { memory: {total,used,free,buffers,cached,swapTotal,swapUsed,swapFree} }
      // in MiB (plain numbers, no unit parsing needed).
      const mem = result.memory?.memory;
      if (mem && typeof mem.total === 'number' && mem.total > 0) {
        const memPercent = Math.round((mem.used / mem.total) * 100);
        if (memPercent >= MEMORY_WARNING_PERCENT) {
          const msg = `Memory usage at ${memPercent}% (${mem.used}MiB / ${mem.total}MiB, threshold ${MEMORY_WARNING_PERCENT}%)`;
          addObservation(state, { category: 'system', severity: 'warning', summary: msg });
        }
      }

      if (downServices.length === 0) {
        addObservation(state, { category: 'system', severity: 'info', summary: 'All installed services running normally' });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'AutonomousMonitor: system health check failed');
    }
  }

  private async checkTickets(state: AgentState, criticalMessages: { category: ObservationCategory; message: string }[]): Promise<void> {
    try {
      // Ticket status is one of open | answered | client-reply | closed (not
      // a simple open/closed pair) -- fetching only 'open' misses a ticket
      // the instant a client replies to it, since the panel auto-advances
      // its status to 'client-reply'. Fetch everything and exclude just the
      // genuinely-done 'closed' state client-side.
      const result = await this.executor.execute('hcp_list_tickets', {});
      if (!result?.success) {
        addObservation(state, { category: 'tickets', severity: 'warning', summary: `Could not check tickets: ${result?.error || 'unknown error'}` });
        return;
      }

      const tickets = (result.tickets || []).filter((t: any) => t.status !== 'closed');
      if (tickets.length > 0) {
        addObservation(state, {
          category: 'tickets',
          severity: 'info',
          summary: `${tickets.length} active ticket(s): ${tickets.slice(0, 5).map((t: any) => t.ticketNumber).join(', ')}`,
          detail: tickets.map((t: any) => ({ id: t.nname, number: t.ticketNumber, subject: t.subject, priority: t.priority, status: t.status })),
        });
      }

      const delegation = findActiveDelegation(state, 'tickets');
      if (delegation?.actions.autoReplyTickets && this.aiProvider) {
        for (const ticket of tickets) {
          await this.autoHandleTicket(state, ticket, delegation, criticalMessages);
        }
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'AutonomousMonitor: ticket check failed');
    }
  }

  /**
   * Handles a single open ticket like a real sysadmin would: investigates
   * using the curated hcp_* tool set (HCP_TOOLS — no shell access), then
   * either replies to the client directly or escalates to the human admin.
   * This is a genuine multi-turn tool-calling loop, not a single yes/no
   * classification — the agent can check DNS zones, service status, client
   * details, etc. before deciding how to respond, the same way it would in
   * an interactive chat.
   *
   * Escalation is intentionally the exception, not the default: only for
   * situations the agent judges genuinely critical/dangerous, or where the
   * client explicitly asks for a human. A missing detail should produce a
   * clarifying reply to the client, not an immediate hand-off.
   *
   * Delegation.instructions (falling back to .description) is threaded into
   * the system prompt so the admin's own written guidance actually steers
   * behavior — the field is what makes each delegation distinct, not just a
   * label in the UI.
   *
   * Each outcome (reply or escalate) is recorded in actionLog with a
   * timestamp — re-processing is gated on message recency, not a one-time
   * flag: skipped only while the client hasn't said anything new since our
   * last action (last message is admin-authored, or no client message newer
   * than our last logged action for this ticket). Once the client replies
   * again, the ticket is picked back up on the next cycle.
   */
  private async autoHandleTicket(state: AgentState, ticketSummary: any, delegation: any, criticalMessages: { category: ObservationCategory; message: string }[]): Promise<void> {
    const ticketId = ticketSummary.nname || ticketSummary.id;
    if (!ticketId) return;

    try {
      const detail = await this.executor.execute('hcp_get_ticket', { id: ticketId });
      if (!detail?.success) return;

      const ticket = detail.ticket || {};
      const replies: any[] = detail.replies || []; // oldest-first (TicketService.getReplies sorts ascending by createdate)
      const lastMessage = replies[replies.length - 1];

      // If the most recent message is from an admin (human or this agent,
      // both recorded identically as authorType 'admin'), we're waiting on
      // the client — nothing to do yet.
      if (lastMessage && lastMessage.authorType === 'admin') return;

      // Otherwise the client has the last word (or this is a brand-new
      // ticket with no replies at all). Only actually re-run the agent if
      // that's genuinely NEW since our last action on this ticket — actionLog
      // is newest-first, so .find() here gets the most recent one, not just
      // the first ever. Without this check, a ticket we've already replied to
      // once would be silently ignored forever even after a client wrote
      // back, which is exactly the "first reply works, then nothing happens"
      // bug this replaces.
      const priorAction = state.actionLog.find(
        (a) => (a.action === 'reply_ticket' || a.action === 'escalate_ticket') && a.target === ticketId
      );
      if (priorAction) {
        const priorActionTime = new Date(priorAction.timestamp).getTime();
        const lastClientMsgTime = lastMessage ? new Date(lastMessage.createdate).getTime() : 0;
        if (lastClientMsgTime <= priorActionTime) return; // nothing new since we last acted
      }

      const label = ticket.ticketNumber || ticketSummary.ticketNumber || ticketId;
      const thread = replies.map((r) => `[${r.authorType || 'client'}] ${r.body || ''}`).join('\n');
      const customInstructions = (delegation.instructions || delegation.description || '').trim();

      const systemPrompt = `You are a capable, experienced sysadmin supporting SysAdminHCP, a hosting control panel — handling this client support ticket exactly the way a competent, careful human sysadmin on staff would. Your focus is SysAdminHCP itself: its features, configuration, the OS it runs on, security, and maintenance. You are not a generic IT assistant here — every ticket is about this product or the server it runs on.

How to work a ticket, in order:
1. If the question is about how SysAdminHCP works, how to use or configure a feature, what an edition/plan includes, pricing, or its API — call hcp_search_docs FIRST. It searches SysAdminHCP's real FAQ, wiki, manuals, editions/feature list, and API reference. Answer from what it returns. Do not go hunting through live system state for something that is actually a documentation question — that wastes turns and tends to produce a worse, less accurate answer than the docs already have.
2. If the question is about the client's actual account/server state (is a service down, what's my DNS record, why is mail failing, etc.), investigate with the read-only hcp_ tools to check real data — don't guess or assume.
3. Take direct action when you have the tools and enough verified information to do so safely (e.g. restart a service that's actually confirmed down).
4. If hcp_search_docs returns nothing relevant and live investigation doesn't resolve it either, say so plainly and either ask the client a clarifying question or escalate — don't keep calling more tools hoping something turns up.

Escalate to the human admin (hcp_notify_admin) ONLY for: (a) something genuinely critical or risky (security incident, data-loss risk, anything you are not confident is safe), or (b) the client explicitly asking to speak with a human. A missing detail is NOT a reason to escalate — reply to the client and ask a clarifying question instead, exactly like a real sysadmin would before doing anything account-specific.

Never invent information you haven't actually verified through a tool call (docs search counts as verification for product-knowledge questions).

You must finish by calling exactly one of hcp_reply_ticket (an answer, a fix confirmation, or a clarifying question to the client) or hcp_notify_admin (only per the escalation rule above) — don't stop after just investigating, and never call either of them more than once for this ticket.

Admin's own instructions for this delegation (scope: ${delegation.scope}):
${customInstructions || '(none provided)'}`;

      const userPrompt = `Ticket ${label}
Subject: ${ticket.subject || ticketSummary.subject}
Priority: ${ticket.priority || ticketSummary.priority}
Description: ${ticket.description || '(no description provided)'}
${thread ? `\nConversation so far:\n${thread}` : ''}

Handle this ticket now.`;

      const history: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      let finalAction: 'replied' | 'escalated' | null = null;
      for (let iter = 0; iter < TICKET_LOOP_MAX_ITERATIONS && !finalAction; iter++) {
        const response = await this.aiProvider!.chatCompletion(history, HCP_TOOLS as any);

        if (!response.toolCalls?.length) {
          // Model stopped without calling reply/notify. Treat any plain-text
          // content as the reply rather than silently doing nothing — but
          // don't loop forever if it also has nothing to say.
          if (response.content?.trim()) {
            const reply = await this.executor.execute('hcp_reply_ticket', { id: ticketId, message: response.content.trim() });
            if (reply?.success) {
              finalAction = 'replied';
              addObservation(state, { category: 'tickets', severity: 'info', summary: `Auto-replied to ticket ${label} (delegated)` });
            }
          }
          break;
        }

        history.push({ role: 'assistant', content: response.content || '', tool_calls: response.toolCalls });
        for (const tc of response.toolCalls) {
          // A single model response can contain multiple tool_calls at once — without this guard,
          // two hcp_reply_ticket calls in the same response (or a retry after a transient error on
          // an already-successful reply) would both execute before `finalAction` is ever checked,
          // posting a real duplicate reply to the client. Mirrors the fix applied to BillCP's
          // agentCycle.ts after the same symptom was observed there.
          if ((tc.function.name === 'hcp_reply_ticket' && finalAction === 'replied') ||
              (tc.function.name === 'hcp_notify_admin' && finalAction === 'escalated')) {
            history.push({
              role: 'tool',
              content: JSON.stringify({ success: false, error: 'already_done', hint: `This ticket was already ${finalAction} in this pass — do not call this tool again.` }),
              tool_call_id: tc.id,
              name: tc.function.name,
            });
            continue;
          }

          let args: any = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* leave empty */ }
          // Ticket-scoped tools always act on THIS ticket regardless of what the model passed.
          if (tc.function.name === 'hcp_reply_ticket' || tc.function.name === 'hcp_get_ticket' || tc.function.name === 'hcp_update_ticket_status') {
            args.id = ticketId;
          }

          let result: any;
          try { result = await this.executor.execute(tc.function.name, args); }
          catch (e: any) { result = { success: false, error: e.message }; }
          history.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: tc.id, name: tc.function.name });

          if (tc.function.name === 'hcp_reply_ticket' && result?.success) {
            finalAction = 'replied';
            addObservation(state, { category: 'tickets', severity: 'info', summary: `Auto-replied to ticket ${label} (delegated)` });
          } else if (tc.function.name === 'hcp_notify_admin') {
            finalAction = 'escalated';
            appendActionLog(state, { action: 'escalate_ticket', target: ticketId, result: { success: true, reason: args.message || '' }, delegationId: delegation.id });
            addObservation(state, { category: 'tickets', severity: 'warning', summary: `Ticket ${label} escalated to admin` });
            criticalMessages.push({ category: 'tickets', message: `🎫 Ticket ${label} needs your attention: ${args.message || 'the agent escalated this without a reason'}` });
          }
        }
      }

      if (!finalAction) {
        logger.warn({ ticketId }, 'AutonomousMonitor: ticket handling loop ended without a final reply or escalation');
      }
    } catch (error: any) {
      logger.error({ error: error.message, ticketId }, 'AutonomousMonitor: ticket auto-handling failed');
    }
  }

  private async checkSecurity(state: AgentState, criticalMessages: { category: ObservationCategory; message: string }[]): Promise<void> {
    try {
      const result = await this.executor.execute('hcp_get_intrusion_activity', {});
      if (!result?.success) {
        addObservation(state, { category: 'security', severity: 'warning', summary: `Could not check intrusion activity: ${result?.error || 'unknown error'}` });
        return;
      }

      const activity = result.activity;
      if (activity && activity.totalAttempts > 0) {
        const msg = `${activity.totalAttempts} intrusion attempt(s) from ${activity.uniqueIps} unique IP(s), ${activity.activeBlocks} currently blocked`;
        addObservation(state, { category: 'security', severity: 'info', summary: msg, detail: activity });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'AutonomousMonitor: security check failed');
    }
  }

  private async checkBackups(state: AgentState, criticalMessages: { category: ObservationCategory; message: string }[]): Promise<void> {
    try {
      const result = await this.executor.execute('hcp_get_backup_health', {});
      if (!result?.success) {
        addObservation(state, { category: 'backup', severity: 'warning', summary: `Could not check backup health: ${result?.error || 'unknown error'}` });
        return;
      }

      const { overdue, recentFailures = [], lastBackupAt, scheduleConfigured, backupDiskUsagePercent } = result;
      const hasProblem = overdue || recentFailures.length > 0;

      if (hasProblem) {
        const parts: string[] = [];
        if (overdue) parts.push(`overdue (last: ${lastBackupAt || 'never'})`);
        if (recentFailures.length > 0) parts.push(`${recentFailures.length} recent failure(s)`);
        const msg = `Backup issue: ${parts.join(', ')}`;
        addObservation(state, { category: 'backup', severity: 'critical', summary: msg, detail: result });
        criticalMessages.push({ category: 'backup', message: `🚨 SysAdminHCP: ${msg}` });

        const delegation = findActiveDelegation(state, 'backup');
        if (delegation?.actions.autoRetryBackup) {
          const recentRetry = state.actionLog.find(
            (a) => a.action === 'retry_backup' && Date.now() - new Date(a.timestamp).getTime() < BACKUP_RETRY_COOLDOWN_MS
          );
          if (!recentRetry) {
            const retryResult = await this.executor.execute('hcp_retry_backup', {});
            if (retryResult?.success) {
              addObservation(state, { category: 'backup', severity: 'info', summary: 'Auto-retried backup (delegated)' });
            } else {
              addObservation(state, { category: 'backup', severity: 'warning', summary: `Auto-retry backup failed: ${retryResult?.error || 'unknown error'}` });
            }
          } else {
            logger.info('AutonomousMonitor: backup retry skipped, still within 6h cooldown');
          }
        }
      } else if (typeof backupDiskUsagePercent === 'number' && backupDiskUsagePercent >= DISK_WARNING_PERCENT) {
        addObservation(state, { category: 'backup', severity: 'warning', summary: `Backup disk usage at ${backupDiskUsagePercent}% (threshold ${DISK_WARNING_PERCENT}%)` });
      } else if (!scheduleConfigured) {
        addObservation(state, { category: 'backup', severity: 'info', summary: lastBackupAt ? `No backup schedule configured (last manual backup: ${lastBackupAt})` : 'No backup schedule configured and no backup found yet' });
      } else {
        addObservation(state, { category: 'backup', severity: 'info', summary: `Backups healthy (last: ${lastBackupAt})` });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'AutonomousMonitor: backup health check failed');
    }
  }

  private async notifyAdmin(state: AgentState, category: ObservationCategory, message: string): Promise<void> {
    // Panel bell notification — always attempted, independent of Telegram
    // config or the per-category Telegram toggle below (that toggle only
    // mutes the Telegram channel specifically, e.g. a known-overdue backup
    // you don't want re-pinging every 5 minutes while you work on it).
    try {
      await this.executor.execute('hcp_notify_admin', { severity: 'critical', title: 'Autonomous Monitor Alert', message });
    } catch (error: any) {
      logger.error({ error: error.message }, 'AutonomousMonitor: failed to push panel notification');
    }

    if (state.notifyCategories?.[category] === false) {
      logger.info({ category }, 'AutonomousMonitor: Telegram notification muted for this category, skipping');
      return;
    }

    if (!this.telegram || !this.adminChatId) {
      logger.warn({ message }, 'AutonomousMonitor: critical observation, but no Telegram admin chat configured to notify');
      return;
    }
    try {
      await this.telegram.sendMessage(this.adminChatId, message);
    } catch (error: any) {
      logger.error({ error: error.message }, 'AutonomousMonitor: failed to send Telegram notification');
    }
  }
}
