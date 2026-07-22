/**
 * AI Agent Assistant (AiAgentAssistant)
 * Autonomous State - shared persisted state for the autonomous monitor and
 * delegation-gated action tools
 *
 * Single source of truth for state.json: observations (the "consciousness
 * stream"), delegations (what the admin has explicitly allowed the agent to
 * act on), and the action log (audit trail of autonomous actions taken).
 * Used by both AutonomousMonitor.ts (writes observations) and AITools.ts
 * (reads delegations to gate actions, writes to the action log).
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const STATE_DIR = path.join(HOME_DIR, '.config', 'aiagentassistant', 'autonomous');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

const MAX_OBSERVATIONS = 200;
const MAX_ACTION_LOG = 200;

export type ObservationSeverity = 'info' | 'warning' | 'critical';
export type ObservationCategory = 'system' | 'tickets' | 'security' | 'clients' | 'backup';

export interface Observation {
  id: string;
  timestamp: string;
  category: ObservationCategory;
  severity: ObservationSeverity;
  summary: string;
  detail?: any;
}

export type DelegationScope = 'tickets' | 'services' | 'clients' | 'security' | 'backup' | 'dns' | 'mail' | 'databases' | 'ftp' | 'ssl';

export interface DelegationActions {
  autoReplyTickets?: boolean;
  autoUpdateTicketStatus?: boolean;
  autoRestartServices?: boolean;
  autoSuspendClients?: boolean;
  autoRetryBackup?: boolean;
  autoManageDnsRecords?: boolean;
  autoManageMailAccounts?: boolean;
  autoManageDatabases?: boolean;
  autoManageFtpAccounts?: boolean;
  autoManageSsl?: boolean;
}

export interface Delegation {
  id: string;
  scope: DelegationScope;
  description: string;
  // Free-text guidance the AI uses when acting within this delegation's scope
  // (e.g. how to word replies, what to prioritize, when to escalate). Falls
  // back to `description` if left blank, since that's where earlier
  // delegations already put this kind of guidance before this field existed.
  instructions?: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  actions: DelegationActions;
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  action: string;
  target: string;
  result: any;
  delegationId: string;
}

// Per-category control over the Telegram channel specifically — the panel's
// own bell notification always fires for a critical observation regardless of
// this setting; this only mutes/unmutes Telegram pings per category (e.g. a
// backup that's known-overdue and being worked on shouldn't re-ping every
// 5-minute cycle until it's fixed).
export type NotifyCategories = Record<ObservationCategory, boolean>;

export interface AgentState {
  version: 1;
  autonomousEnabled: boolean;
  notifyCategories: NotifyCategories;
  lastCheckAt: string | null;
  observations: Observation[];
  delegations: Delegation[];
  actionLog: ActionLogEntry[];
}

function defaultState(): AgentState {
  return {
    version: 1,
    autonomousEnabled: true,
    notifyCategories: { system: true, tickets: true, security: true, clients: true, backup: true },
    lastCheckAt: null,
    observations: [],
    delegations: [],
    actionLog: [],
  };
}

/**
 * Loads state.json fresh from disk every call (creating the directory/file on
 * first use). Deliberately NOT cached in memory: SysAdminHCP's panel process
 * writes to this same file directly (delegation create/toggle, the
 * autonomousEnabled switch) from a completely separate process — an in-memory
 * cache here would mean those changes stay invisible to this already-running
 * process until it restarts, which defeats the point of a live toggle/edit.
 * The file is small, so re-reading it every cycle/action-gate check is cheap.
 */
export function loadAutonomousState(): AgentState {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }

  if (!fs.existsSync(STATE_FILE)) {
    const fresh = defaultState();
    saveAutonomousState(fresh);
    return fresh;
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to parse autonomous state.json, resetting to default');
    return defaultState();
  }
}

export function saveAutonomousState(state: AgentState): void {
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

export function addObservation(state: AgentState, obs: Omit<Observation, 'id' | 'timestamp'>): void {
  state.observations.unshift({
    id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...obs,
  });
  if (state.observations.length > MAX_OBSERVATIONS) {
    state.observations.length = MAX_OBSERVATIONS;
  }
}

/** Finds the active delegation (if any) covering the given scope. */
export function findActiveDelegation(state: AgentState, scope: DelegationScope): Delegation | undefined {
  return state.delegations.find(d => d.scope === scope && d.active);
}
