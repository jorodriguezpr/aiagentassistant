import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { requireAdmin } from '../middleware/auth';

export const playbooksRouter = Router();

const KB_FILE = path.join(
  process.env.PORTAL_AGENT_APP_DIR || '/opt/aiagentassistant/app',
  'data', 'experience-kb.json'
);

function load(): any {
  try {
    if (!fs.existsSync(KB_FILE)) return { playbooks: [] };
    return JSON.parse(fs.readFileSync(KB_FILE, 'utf8'));
  } catch { return { playbooks: [] }; }
}

function save(data: any): void {
  data.savedAt = new Date().toISOString();
  data.playbookCount = (data.playbooks || []).length;
  fs.mkdirSync(path.dirname(KB_FILE), { recursive: true });
  fs.writeFileSync(KB_FILE, JSON.stringify(data, null, 2));
}

playbooksRouter.get('/', (_req: Request, res: Response) => {
  const data = load();
  // Return summary list (without full step details for performance)
  const list = (data.playbooks || []).map((p: any) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    category: p.category,
    keywords: p.keywords,
    targetOS: p.targetOS,
    targetService: p.targetService,
    stepCount: (p.steps || []).length,
    successCount: p.successCount,
    failureCount: p.failureCount,
    lastUsed: p.lastUsed,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
  res.json(list);
});

playbooksRouter.get('/:id', (req: Request, res: Response) => {
  const data = load();
  const pb = (data.playbooks || []).find((p: any) => p.id === req.params.id);
  if (!pb) { res.status(404).json({ error: 'Playbook not found' }); return; }
  res.json(pb);
});

playbooksRouter.put('/:id', requireAdmin, (req: Request, res: Response) => {
  const { title, description, category, keywords, targetOS, targetService, steps, notes } = req.body || {};
  const data = load();
  const idx = (data.playbooks || []).findIndex((p: any) => p.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Playbook not found' }); return; }
  const pb = data.playbooks[idx];
  if (title !== undefined)         pb.title         = title;
  if (description !== undefined)   pb.description   = description;
  if (category !== undefined)      pb.category      = category;
  if (keywords !== undefined)      pb.keywords      = keywords;
  if (targetOS !== undefined)      pb.targetOS      = targetOS;
  if (targetService !== undefined) pb.targetService = targetService;
  if (steps !== undefined)         pb.steps         = steps;
  if (notes !== undefined)         pb.notes         = notes;
  pb.updatedAt = new Date().toISOString();
  save(data);
  res.json(pb);
});

playbooksRouter.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const data = load();
  const before = (data.playbooks || []).length;
  data.playbooks = (data.playbooks || []).filter((p: any) => p.id !== req.params.id);
  if (data.playbooks.length === before) { res.status(404).json({ error: 'Playbook not found' }); return; }
  save(data);
  res.json({ ok: true });
});
