import { Router, Request, Response } from 'express';
import * as http from 'http';
import { readEnv } from '../utils/envEditor';

export const chatRouter = Router();

function getAgentBase(): { host: string; port: number } {
  const env = readEnv();
  const port = parseInt(env['API_PORT'] || '3000');
  return { host: '127.0.0.1', port };
}

// Generic proxy — forwards the request to the main service and pipes the response back.
// For SSE (GET /stream), this keeps the connection alive with chunked transfer.
function proxyRequest(
  method: string,
  path: string,
  body: any,
  req: Request,
  res: Response,
  sse = false
): void {
  const { host, port } = getAgentBase();
  const bodyStr = body ? JSON.stringify(body) : '';

  const options: http.RequestOptions = {
    hostname: host,
    port,
    path: `/api/webchat${path}`,
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    if (sse) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      proxyRes.pipe(res);
      req.on('close', () => proxyReq.destroy());
      // Disable socket timeout for SSE — connection must stay open indefinitely
      proxyReq.setTimeout(0);
      (proxyReq as any).socket?.setTimeout(0);
    } else {
      res.status(proxyRes.statusCode || 200);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Main service unavailable: ${err.message}` });
    }
  });

  if (bodyStr) proxyReq.write(bodyStr);
  proxyReq.end();
}

// SSE stream
chatRouter.get('/stream/:sessionId', (req: Request, res: Response) => {
  proxyRequest('GET', `/stream/${req.params.sessionId}`, null, req, res, true);
});

// Send message
chatRouter.post('/message', (req: Request, res: Response) => {
  proxyRequest('POST', '/message', req.body, req, res);
});

// Approve / deny HITL
chatRouter.post('/approve', (req: Request, res: Response) => {
  proxyRequest('POST', '/approve', req.body, req, res);
});

// Cancel active loop
chatRouter.post('/cancel/:sessionId', (req: Request, res: Response) => {
  proxyRequest('POST', `/cancel/${req.params.sessionId}`, {}, req, res);
});

// Clear history
chatRouter.delete('/history/:sessionId', (req: Request, res: Response) => {
  proxyRequest('DELETE', `/history/${req.params.sessionId}`, null, req, res);
});

// List sessions
chatRouter.get('/sessions', (req: Request, res: Response) => {
  proxyRequest('GET', '/sessions', null, req, res);
});
