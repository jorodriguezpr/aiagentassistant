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
export type ObservationCategory = 'system' | 'tickets' | 'security' | 'clients';

export interface Observation {
  id: string;
  timestamp: string;
  category: ObservationCategory;
  severity: ObservationSeverity;
  summary: string;
  detail?: any;
}

export type DelegationScope = 'tickets' | 'services' | 'clients' | 'security';

export interface DelegationActions {
  autoReplyTickets?: boolean;
  autoUpdateTicketStatus?: boolean;
  autoRestartServices?: boolean;
  autoSuspendClients?: boolean;
}

export interface Delegation {
  id: string;
  scope: DelegationScope;
  description: string;
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
