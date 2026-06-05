import { Router, Request, Response } from 'express';
import Redis from 'ioredis';
import { requireAdmin } from '../middleware/auth';
import { readEnv } from '../utils/envEditor';

export const tasksRouter = Router();

function getRedis(): Redis {
  const env = readEnv();
  const url = env['REDIS_URL'] || 'redis://localhost:6379';
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
}

async function withRedis<T>(fn: (r: Redis) => Promise<T>): Promise<T> {
  const redis = getRedis();
  try {
    await redis.connect();
    return await fn(redis);
  } finally {
    redis.disconnect();
  }
}

// ── List all checkpointed tasks ───────────────────────────────
tasksRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const tasks = await withRedis(async redis => {
      const keys = await redis.keys('aiagent:checkpoint:*');
      if (!keys.length) return [];

      const results: any[] = [];
      for (const key of keys) {
        try {
          const raw = await redis.get(key);
          if (!raw) continue;
          const data = JSON.parse(raw);
          // Strip large history array — just count entries
          const historyLen = Array.isArray(data.history) ? data.history.length : 0;
          const { history: _, ...safe } = data;
          results.push({ ...safe, historyLen, redisKey: key });
        } catch {}
      }

      // Sort newest first
      return results.sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || 0).getTime() -
        new Date(a.updatedAt || a.createdAt || 0).getTime()
      );
    });

    res.json(tasks);
  } catch (err: any) {
    res.status(503).json({ error: `Redis unavailable: ${err.message}` });
  }
});

// ── Delete (cancel) a checkpoint ─────────────────────────────
tasksRouter.delete('/:taskId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    // Validate format to prevent arbitrary key deletion
    if (!/^[\w\-.:]+$/.test(taskId)) {
      res.status(400).json({ error: 'Invalid taskId' });
      return;
    }

    await withRedis(async redis => {
      const key = `aiagent:checkpoint:${taskId}`;
      const data = await redis.get(key);
      if (!data) throw Object.assign(new Error('Task not found'), { status: 404 });

      // Remove checkpoint + any chat index entry
      const parsed = JSON.parse(data);
      await redis.del(key);
      if (parsed.chatId) {
        await redis.srem(`aiagent:chat_checkpoints:${parsed.chatId}`, taskId);
      }
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
