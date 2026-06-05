/**
 * NLScriptManager — stores and retrieves natural-language scripts.
 *
 * A NL script is an ordered list of natural-language steps that the AI
 * executes sequentially (SSH login, run commands, write logs, etc.).
 * Scripts are persisted to disk so they survive service restarts.
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

const DATA_DIR  = path.join(process.env.HOME || '/root', '.config', 'aiagentassistant');
const SAVE_FILE = path.join(DATA_DIR, 'nl-scripts.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export interface NLScript {
  id:           string;    // nls_<timestamp>_<rand>
  name:         string;    // slug used to reference the script
  description?: string;
  steps:        string[];  // natural-language steps in order
  createdAt:    string;
  updatedAt:    string;
  runCount:     number;
  lastRun?:     string;
}

// ─── In-memory store ─────────────────────────────────────────────────────────

let scripts: Map<string, NLScript> = new Map(); // keyed by name (lowercase)
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(SAVE_FILE)) {
      const list: NLScript[] = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
      for (const s of list) scripts.set(s.name.toLowerCase(), s);
      logger.info({ count: scripts.size }, 'NL scripts loaded');
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to load NL scripts');
  }
}

function save(): void {
  try {
    fs.writeFileSync(SAVE_FILE, JSON.stringify([...scripts.values()], null, 2));
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to save NL scripts');
  }
}

// ─── Step parser ──────────────────────────────────────────────────────────────

/**
 * Parse a free-form string into an ordered list of NL steps.
 * Supports:
 *   [1] step ; [2] step  (user's preferred format)
 *   1. step\n2. step
 *   Step 1: ...\nStep 2: ...
 *   Just newlines (each non-empty line = one step)
 */
export function parseSteps(raw: string): string[] {
  const text = raw.trim();

  // Format: [1] ... ; [2] ... (or just newline-separated [N] ...)
  if (/\[\d+\]/.test(text)) {
    return text
      .split(/[;\n]+/)
      .map(s => s.replace(/^\s*\[\d+\]\s*/, '').trim())
      .filter(Boolean);
  }

  // Format: numbered lines  1. step  or  1) step
  if (/^\d+[.)]\s/.test(text)) {
    return text
      .split(/\n/)
      .map(s => s.replace(/^\d+[.)]\s*/, '').trim())
      .filter(Boolean);
  }

  // Format: Step N: ...
  if (/^step\s+\d+[:)]/i.test(text)) {
    return text
      .split(/\n/)
      .map(s => s.replace(/^step\s+\d+[:)]\s*/i, '').trim())
      .filter(Boolean);
  }

  // Fallback: split by semicolons or newlines
  return text.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function createScript(name: string, steps: string[], description?: string): NLScript {
  load();
  const key = name.toLowerCase().replace(/\s+/g, '-');
  const now = new Date().toISOString();
  const script: NLScript = {
    id:          `nls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name:        key,
    description,
    steps,
    createdAt:   now,
    updatedAt:   now,
    runCount:    0,
  };
  scripts.set(key, script);
  save();
  logger.info({ name: key, steps: steps.length }, 'NL script created');
  return script;
}

export function getScript(name: string): NLScript | null {
  load();
  return scripts.get(name.toLowerCase().replace(/\s+/g, '-')) || null;
}

export function listScripts(): NLScript[] {
  load();
  return [...scripts.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function deleteScript(name: string): boolean {
  load();
  const key = name.toLowerCase().replace(/\s+/g, '-');
  if (!scripts.has(key)) return false;
  scripts.delete(key);
  save();
  return true;
}

export function markRun(name: string): void {
  load();
  const s = scripts.get(name.toLowerCase().replace(/\s+/g, '-'));
  if (!s) return;
  s.runCount++;
  s.lastRun = new Date().toISOString();
  s.updatedAt = s.lastRun;
  save();
}
