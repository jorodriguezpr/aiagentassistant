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
import { AIToolExecutor } from '../utils/AITools';
import { AgentState, loadAutonomousState, saveAutonomousState, addObservation } from '../utils/AutonomousState';

const DISK_WARNING_PERCENT = 90;

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

  constructor(executor: AIToolExecutor, telegram: TelegramNotifier | null) {
    this.executor = executor;
    this.telegram = telegram;
    // Reuses the same allow-listed admin chat already configured for Telegram
    this.adminChatId = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',')[0]?.trim() || null;
  }

  async runCycle(): Promise<void> {
    const state = loadAutonomousState();
    logger.info('AutonomousMonitor: starting check cycle');

    const criticalMessages: string[] = [];

    await this.checkSystemHealth(state, criticalMessages);
    await this.checkTickets(state, criticalMessages);
    await this.checkSecurity(state, criticalMessages);

    state.lastCheckAt = new Date().toISOString();
    saveAutonomousState(state);

    for (const msg of criticalMessages) {
      await this.notifyAdmin(msg);
    }

    logger.info({ observationCount: state.observations.length }, 'AutonomousMonitor: check cycle complete');
  }

  private async checkSystemHealth(state: AgentState, criticalMessages: string[]): Promise<void> {
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
        criticalMessages.push(`🚨 SysAdminHCP: ${msg}`);
      }

      const diskPercent = result.disk?.usedPercent ?? result.disk?.disk?.usedPercent;
      if (typeof diskPercent === 'number' && diskPercent >= DISK_WARNING_PERCENT) {
        const msg = `Disk usage at ${diskPercent}% (threshold ${DISK_WARNING_PERCENT}%)`;
        addObservation(state, { category: 'system', severity: 'warning', summary: msg });
      }

      if (downServices.length === 0) {
        addObservation(state, { category: 'system', severity: 'info', summary: 'All installed services running normally' });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'AutonomousMonitor: system health check failed');
    }
  }

  private async checkTickets(state: AgentState, criticalMessages: string[]): Promise<void> {
    try {
      const result = await this.executor.execute('hcp_list_tickets', { status: 'open' });
      if (!result?.success) {
        addObservation(state, { category: 'tickets', severity: 'warning', summary: `Could not check tickets: ${result?.error || 'unknown error'}` });
        return;
      }

      const tickets = result.tickets || [];
      if (tickets.length > 0) {
        addObservation(state, {
          category: 'tickets',
          severity: 'info',
          summary: `${tickets.length} open ticket(s): ${tickets.slice(0, 5).map((t: any) => t.ticketNumber).join(', ')}`,
          detail: tickets.map((t: any) => ({ id: t.nname, number: t.ticketNumber, subject: t.subject, priority: t.priority })),
        });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'AutonomousMonitor: ticket check failed');
    }
  }

  private async checkSecurity(state: AgentState, criticalMessages: string[]): Promise<void> {
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

  private async notifyAdmin(message: string): Promise<void> {
    // Panel bell notification — always attempted, independent of Telegram config.
    try {
      await this.executor.execute('hcp_notify_admin', { severity: 'critical', title: 'Autonomous Monitor Alert', message });
    } catch (error: any) {
      logger.error({ error: error.message }, 'AutonomousMonitor: failed to push panel notification');
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
