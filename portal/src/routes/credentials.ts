import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { requireAdmin } from '../middleware/auth';

export const credentialsRouter = Router();

const AGENT_HOME = process.env.PORTAL_AGENT_HOME || '/opt/aiagentassistant';
const CRED_DIR   = path.join(AGENT_HOME, '.config', 'aiagentassistant', 'credentials');

// Safe key name: only alphanumerics, @, ., -, _, :
function validKey(k: string): boolean {
  return /^[\w@.\-:]+$/.test(k) && k.length > 0 && k.length < 200;
}

function credPath(key: string): string {
  return path.join(CRED_DIR, `${key}.txt`);
}

function listKeys(): string[] {
  try {
    fs.mkdirSync(CRED_DIR, { recursive: true });
    return fs.readdirSync(CRED_DIR)
      .filter(f => f.endsWith('.txt'))
      .map(f => f.slice(0, -4))
      .sort();
  } catch (err: any) {
    // If root still can't read (unusual WSL config), fall back to runuser
    return [];
  }
}

function readValue(key: string): string | null {
  try {
    return fs.readFileSync(credPath(key), 'utf8').trim();
  } catch { return null; }
}

function writeValue(key: string, value: string): void {
  fs.mkdirSync(CRED_DIR, { recursive: true });
  fs.writeFileSync(credPath(key), value, { mode: 0o600 });
  // Ensure aiagent owns the file so the main service can also read it
  try { fs.chownSync(credPath(key), 999, 989); } catch {} // 999 = aiagent uid
}

function removeKey(key: string): boolean {
  const fp = credPath(key);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

// ── Routes ────────────────────────────────────────────────────

credentialsRouter.get('/', (_req: Request, res: Response) => {
  const keys = listKeys();
  // Return list of key names + metadata (no values)
  const result = keys.map(k => {
    try {
      const stat = fs.statSync(credPath(k));
      return { key: k, updatedAt: stat.mtime.toISOString(), size: stat.size };
    } catch {
      return { key: k, updatedAt: null, size: 0 };
    }
  });
  res.json(result);
});

// Reveal value (admin only)
credentialsRouter.get('/:key/value', requireAdmin, (req: Request, res: Response) => {
  const key = req.params.key;
  if (!validKey(key)) { res.status(400).json({ error: 'Invalid key name' }); return; }
  const val = readValue(key);
  if (val === null) { res.status(404).json({ error: 'Credential not found' }); return; }
  res.json({ value: val });
});

// Create or update
credentialsRouter.put('/:key', requireAdmin, (req: Request, res: Response) => {
  const key = req.params.key;
  if (!validKey(key)) { res.status(400).json({ error: 'Invalid key name' }); return; }
  const { value } = req.body || {};
  if (!value) { res.status(400).json({ error: 'value required' }); return; }
  try {
    writeValue(key, String(value));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new
credentialsRouter.post('/', requireAdmin, (req: Request, res: Response) => {
  const { key, value } = req.body || {};
  if (!key || !validKey(String(key))) { res.status(400).json({ error: 'Invalid or missing key' }); return; }
  if (!value) { res.status(400).json({ error: 'value required' }); return; }
  try {
    writeValue(String(key), String(value));
    res.status(201).json({ ok: true, key: String(key) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

credentialsRouter.delete('/:key', requireAdmin, (req: Request, res: Response) => {
  const key = req.params.key;
  if (!validKey(key)) { res.status(400).json({ error: 'Invalid key name' }); return; }
  const ok = removeKey(key);
  if (!ok) { res.status(404).json({ error: 'Credential not found' }); return; }
  res.json({ ok: true });
});
