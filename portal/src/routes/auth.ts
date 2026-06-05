import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { generateSecret, generateURI, verifySync } from '../utils/totp';
import QRCode from 'qrcode';
import { verifyPassword, findUser, saveTotpSecret, removeTotpSecret } from '../utils/userStore';
import { signToken, signPreAuthToken, requireAuth, requireAnyAuth, requireAdmin } from '../middleware/auth';
import { CONFIG } from '../config';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again later' },
});

const totpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, try again later' },
});

// ── Login — issues pre-auth token; TOTP step always required ──────────────────
authRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const user = await verifyPassword(String(username), String(password));
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const preToken = signPreAuthToken({ userId: user.id, username: user.username, role: user.role });
  res.cookie(CONFIG.COOKIE_NAME, preToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 5 * 60 * 1000,
  });

  res.json({ ok: true, requiresTotp: true, needsSetup: !user.totpSecret });
});

// ── TOTP setup — generate secret + QR code ───────────────────────────────────
authRouter.get('/totp/setup', requireAnyAuth, async (req: Request, res: Response) => {
  const secret = generateSecret();
  const otpauth = generateURI({ issuer: 'AiAgentAssistant', label: req.user!.username, secret });
  const qrDataUrl = await QRCode.toDataURL(otpauth);
  res.json({ qrDataUrl, secret });
});

// ── TOTP setup confirm — verify first code and save secret ───────────────────
authRouter.post('/totp/setup', totpLimiter, requireAnyAuth, async (req: Request, res: Response) => {
  const { code, secret } = req.body || {};
  if (!code || !secret) {
    res.status(400).json({ error: 'Code and secret required' });
    return;
  }

  const isValid = verifySync({ token: String(code).replace(/\s/g, ''), secret: String(secret), epochTolerance: 30 }).valid;
  if (!isValid) {
    res.status(400).json({ error: 'Invalid or expired code — check your authenticator app time sync' });
    return;
  }

  saveTotpSecret(req.user!.username, String(secret));

  const user = findUser(req.user!.username)!;
  const fullToken = signToken({ userId: user.id, username: user.username, role: user.role });
  res.cookie(CONFIG.COOKIE_NAME, fullToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

// ── TOTP verify — check code during normal login ─────────────────────────────
authRouter.post('/totp/verify', totpLimiter, requireAnyAuth, async (req: Request, res: Response) => {
  const { code } = req.body || {};
  if (!code) {
    res.status(400).json({ error: 'Code required' });
    return;
  }

  const user = findUser(req.user!.username);
  if (!user?.totpSecret) {
    res.status(400).json({ error: 'TOTP not configured', needsSetup: true });
    return;
  }

  const isValid = verifySync({ token: String(code).replace(/\s/g, ''), secret: user.totpSecret, epochTolerance: 30 }).valid;
  if (!isValid) {
    res.status(400).json({ error: 'Invalid or expired code' });
    return;
  }

  const fullToken = signToken({ userId: user.id, username: user.username, role: user.role });
  res.cookie(CONFIG.COOKIE_NAME, fullToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

// ── Admin: reset another user's TOTP (e.g. lost phone) ───────────────────────
authRouter.delete('/totp/:username', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const ok = removeTotpSecret(req.params.username);
  if (!ok) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ok: true });
});

// ── Logout ────────────────────────────────────────────────────────────────────
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(CONFIG.COOKIE_NAME);
  res.json({ ok: true });
});

// ── Me ────────────────────────────────────────────────────────────────────────
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ username: req.user!.username, role: req.user!.role });
});
