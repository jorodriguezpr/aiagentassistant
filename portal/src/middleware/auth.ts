import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { CONFIG } from '../config';
import { findUser } from '../utils/userStore';

export interface AuthPayload {
  userId:       string;
  username:     string;
  role:         string;
  totpVerified: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// Full auth — JWT must have totpVerified: true
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[CONFIG.COOKIE_NAME];
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    const payload = jwt.verify(token, CONFIG.JWT_SECRET) as AuthPayload;
    if (!payload.totpVerified) {
      const user = findUser(payload.username);
      res.status(401).json({ error: 'TOTP required', requiresTotp: true, needsSetup: !user?.totpSecret });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

// Pre-auth — any valid JWT (used for TOTP setup/verify endpoints)
export function requireAnyAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[CONFIG.COOKIE_NAME];
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  try {
    req.user = jwt.verify(token, CONFIG.JWT_SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') { res.status(403).json({ error: 'Forbidden' }); return; }
  next();
}

// 5-minute pre-auth token — issued after password OK, before TOTP verified
export function signPreAuthToken(payload: Omit<AuthPayload, 'totpVerified'>): string {
  return jwt.sign({ ...payload, totpVerified: false }, CONFIG.JWT_SECRET, { expiresIn: 300 });
}

// Full 24h token — issued after TOTP verified
export function signToken(payload: Omit<AuthPayload, 'totpVerified'>): string {
  return jwt.sign({ ...payload, totpVerified: true }, CONFIG.JWT_SECRET, { expiresIn: 86400 });
}
