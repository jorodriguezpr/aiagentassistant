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

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { AIToolExecutor } from '../utils/AITools';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const STATE_DIR = path.join(HOME_DIR, '.config', 'aiagentassistant', 'autonomous');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

const MAX_OBSERVATIONS = 200;
const MAX_ACTION_LOG = 200;
const DISK_WARNING_PERCENT = 90;

export type ObservationSeverity = 'info' | 'warning' | 'critical';
export type ObservationCategory = 'system' | 'tickets' | 'security' | 'clients';

export interface Observation {
  id: string;
  timestamp: string;
  category: ObservationCategory;
  severity: ObservationSeverity;
  summary: string;
  detail?: any;
}

export interface Delegation {
  id: string;
  scope: 'tickets' | 'services' | 'clients' | 'security';
  description: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  actions: {
    autoReplyTickets?: boolean;
    autoUpdateTicketStatus?: boolean;
    autoRestartServices?: boolean;
    autoSuspendClients?: boolean;
  };
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  action: string;
  target: string;
  result: any;
  delegationId: string;
}

export interface AgentState {
  version: 1;
  lastCheckAt: string | null;
  observations: Observation[];
  delegations: Delegation[];
  actionLog: ActionLogEntry[];
}

function defaultState(): AgentState {
  return { version: 1, lastCheckAt: null, observations: [], delegations: [], actionLog: [] };
}

let cachedState: AgentState | null = null;

/** Loads state.json (creating the directory/file on first use). Cached in memory after the first read. */
export function loadAutonomousState(): AgentState {
  if (cachedState) return cachedState;

  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }

  if (!fs.existsSync(STATE_FILE)) {
    cachedState = defaultState();
    saveAutonomousState(cachedState);
    return cachedState;
  }

  let loaded: AgentState;
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    loaded = { ...defaultState(), ...JSON.parse(raw) };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to parse autonomous state.json, resetting to default');
    loaded = defaultState();
  }
  cachedState = loaded;
  return loaded;
}

export function saveAutonomousState(state: AgentState): void {
  cachedState = state;
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to save autonomous state.json');
  }
}

export function appendActionLog(state: AgentState, entry: Omit<ActionLogEntry, 'id' | 'timestamp'>): void {
  state.actionLog.unshift({
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (state.actionLog.length > MAX_ACTION_LOG) {
    state.actionLog.length = MAX_ACTION_LOG;
  }
  saveAutonomousState(state);
}

function addObservation(state: AgentState, obs: Omit<Observation, 'id' | 'timestamp'>): void {
  state.observations.unshift({
    id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...obs,
  });
  if (state.observations.length > MAX_OBSERVATIONS) {
    state.observations.length = MAX_OBSERVATIONS;
  }
}

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
      const downServices = Object.values(services).filter((s: any) => s?.isInstalled && !s?.isRunning);
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
      if (!result?.success) return;

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
      if (!result?.success) return;

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
