import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { requireAdmin } from '../middleware/auth';

export const scheduledTasksRouter = Router();

const AGENT_HOME  = process.env.PORTAL_AGENT_HOME || '/opt/aiagentassistant';
const TASKS_FILE  = path.join(AGENT_HOME, '.config', 'aiagentassistant', 'scheduled-tasks', 'tasks.json');

function load(): any[] {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch { return []; }
}

function save(tasks: any[]): void {
  fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

scheduledTasksRouter.get('/', (_req: Request, res: Response) => {
  res.json(load());
});

scheduledTasksRouter.put('/:id', requireAdmin, (req: Request, res: Response) => {
  const tasks = load();
  const idx = tasks.findIndex((t: any) => t.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Task not found' }); return; }
  const { name, enabled, schedule, scheduleDescription } = req.body || {};
  if (name !== undefined)                tasks[idx].name                = name;
  if (typeof enabled === 'boolean')      tasks[idx].enabled             = enabled;
  if (schedule !== undefined)            tasks[idx].schedule            = schedule;
  if (scheduleDescription !== undefined) tasks[idx].scheduleDescription = scheduleDescription;
  save(tasks);
  res.json(tasks[idx]);
});

scheduledTasksRouter.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const tasks    = load();
  const filtered = tasks.filter((t: any) => t.id !== req.params.id);
  if (filtered.length === tasks.length) { res.status(404).json({ error: 'Task not found' }); return; }
  save(filtered);
  res.json({ ok: true });
});
