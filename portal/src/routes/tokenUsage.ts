import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { requireAdmin } from '../middleware/auth';

export const tokenUsageRouter = Router();

const USAGE_FILE = path.join(
  process.env.PORTAL_AGENT_APP_DIR || '/opt/aiagentassistant/app',
  'data', 'token-usage.json'
);

function readUsage(): any {
  try {
    if (!fs.existsSync(USAGE_FILE)) return { providers: {}, entries: [], lastUpdated: null };
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  } catch {
    return { providers: {}, entries: [], lastUpdated: null };
  }
}

tokenUsageRouter.get('/', (_req: Request, res: Response) => {
  const data = readUsage();
  const entries: any[] = data.entries || [];

  // Aggregate stats
  const byProvider: Record<string, number> = {};
  const byModel:    Record<string, number> = {};
  let totalPrompt = 0, totalCompletion = 0, totalAll = 0;

  for (const e of entries) {
    totalPrompt     += e.promptTokens     || 0;
    totalCompletion += e.completionTokens || 0;
    totalAll        += e.totalTokens      || 0;
    if (e.provider) byProvider[e.provider] = (byProvider[e.provider] || 0) + (e.totalTokens || 0);
    if (e.model)    byModel[e.model]       = (byModel[e.model]    || 0) + (e.totalTokens || 0);
  }

  res.json({
    summary: { totalPrompt, totalCompletion, total: totalAll, entryCount: entries.length, lastUpdated: data.lastUpdated },
    byProvider,
    byModel,
    recent: entries.slice(-50).reverse(),
  });
});

tokenUsageRouter.post('/reset', requireAdmin, (_req: Request, res: Response) => {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const backup = USAGE_FILE.replace('.json', `.backup-${Date.now()}.json`);
      fs.copyFileSync(USAGE_FILE, backup);
    }
    fs.writeFileSync(USAGE_FILE, JSON.stringify({ providers: {}, entries: [], lastUpdated: new Date().toISOString() }, null, 2));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
