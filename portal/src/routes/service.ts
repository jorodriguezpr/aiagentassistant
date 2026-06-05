import { Router, Request, Response } from 'express';
import { getStatus, controlService, ServiceAction } from '../utils/serviceControl';
import { requireAdmin } from '../middleware/auth';

export const serviceRouter = Router();

serviceRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const ALLOWED_ACTIONS = new Set<ServiceAction>(['start', 'stop', 'restart']);

serviceRouter.post('/:action', requireAdmin, async (req: Request, res: Response) => {
  const action = req.params.action as ServiceAction;
  if (!ALLOWED_ACTIONS.has(action)) {
    res.status(400).json({ error: `Invalid action. Use: start, stop, restart` });
    return;
  }

  try {
    await controlService(action);
    // Wait a moment then return fresh status
    await new Promise(r => setTimeout(r, 1500));
    const status = await getStatus();
    res.json({ ok: true, action, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
