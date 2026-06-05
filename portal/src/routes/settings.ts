import { Router, Request, Response } from 'express';
import { readEnv, writeEnv, ENV_SCHEMA } from '../utils/envEditor';
import { requireAdmin } from '../middleware/auth';

export const settingsRouter = Router();

settingsRouter.get('/', (_req: Request, res: Response) => {
  try {
    const values = readEnv();
    res.json({ schema: ENV_SCHEMA, values });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.put('/', requireAdmin, (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'Invalid body — expected key/value object' });
    return;
  }

  // Validate keys against schema
  const allowedKeys = new Set(
    ENV_SCHEMA.flatMap(s => s.fields.map(f => f.key))
  );
  const unknown = Object.keys(updates).filter(k => !allowedKeys.has(k));
  if (unknown.length) {
    res.status(400).json({ error: `Unknown keys: ${unknown.join(', ')}` });
    return;
  }

  try {
    writeEnv(updates);
    res.json({ ok: true, updated: Object.keys(updates).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
