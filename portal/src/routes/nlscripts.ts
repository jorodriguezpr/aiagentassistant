import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { requireAdmin } from '../middleware/auth';

export const nlscriptsRouter = Router();

const AGENT_HOME   = process.env.PORTAL_AGENT_HOME || '/opt/aiagentassistant';
const SCRIPTS_FILE = path.join(AGENT_HOME, '.config', 'aiagentassistant', 'nl-scripts.json');

function load(): any[] {
  try {
    if (!fs.existsSync(SCRIPTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SCRIPTS_FILE, 'utf8'));
  } catch { return []; }
}

function save(scripts: any[]): void {
  fs.mkdirSync(path.dirname(SCRIPTS_FILE), { recursive: true });
  fs.writeFileSync(SCRIPTS_FILE, JSON.stringify(scripts, null, 2));
}

nlscriptsRouter.get('/', (_req: Request, res: Response) => {
  res.json(load().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
});

nlscriptsRouter.post('/', requireAdmin, (req: Request, res: Response) => {
  const { name, steps, description } = req.body || {};
  if (!name || !Array.isArray(steps) || steps.length === 0) {
    res.status(400).json({ error: 'name and steps[] are required' });
    return;
  }
  const scripts = load();
  const key = String(name).toLowerCase().replace(/\s+/g, '-');
  if (scripts.find((s: any) => s.name === key)) {
    res.status(409).json({ error: `Script "${key}" already exists` });
    return;
  }
  const now = new Date().toISOString();
  const script = {
    id: `nls_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    name: key,
    description: description || undefined,
    steps,
    createdAt: now,
    updatedAt: now,
    runCount: 0,
  };
  scripts.push(script);
  save(scripts);
  res.status(201).json(script);
});

nlscriptsRouter.put('/:name', requireAdmin, (req: Request, res: Response) => {
  const { steps, description } = req.body || {};
  const scripts = load();
  const key = req.params.name.toLowerCase();
  const idx = scripts.findIndex((s: any) => s.name === key);
  if (idx === -1) { res.status(404).json({ error: 'Script not found' }); return; }
  if (steps && Array.isArray(steps)) scripts[idx].steps = steps;
  if (description !== undefined) scripts[idx].description = description;
  scripts[idx].updatedAt = new Date().toISOString();
  save(scripts);
  res.json(scripts[idx]);
});

nlscriptsRouter.delete('/:name', requireAdmin, (req: Request, res: Response) => {
  const scripts = load();
  const key = req.params.name.toLowerCase();
  const filtered = scripts.filter((s: any) => s.name !== key);
  if (filtered.length === scripts.length) { res.status(404).json({ error: 'Script not found' }); return; }
  save(filtered);
  res.json({ ok: true });
});
