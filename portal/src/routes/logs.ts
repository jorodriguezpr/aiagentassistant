import { Router, Request, Response } from 'express';
import { spawnLogStream } from '../utils/serviceControl';

export const logsRouter = Router();

// SSE stream — GET /api/logs/stream
logsRouter.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const lines = parseInt(String(req.query.lines || '100'), 10);
  const child = spawnLogStream(Math.min(lines, 500));

  const sendLine = (data: Buffer) => {
    const text = data.toString().replace(/\n/g, '\\n');
    res.write(`data: ${text}\n\n`);
  };

  child.stdout.on('data', sendLine);
  child.stderr.on('data', sendLine);

  // Keep-alive heartbeat every 20s
  const hb = setInterval(() => res.write(': heartbeat\n\n'), 20_000);

  req.on('close', () => {
    clearInterval(hb);
    child.kill();
  });
});
