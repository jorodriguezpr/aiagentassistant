import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { requireAdmin } from '../middleware/auth';

export const emailAccountsRouter = Router();

const AGENT_HOME = process.env.PORTAL_AGENT_HOME || '/opt/aiagentassistant';
const EMAIL_DIR  = path.join(AGENT_HOME, '.config', 'aiagentassistant', 'email');
const CRED_DIR   = path.join(AGENT_HOME, '.config', 'aiagentassistant', 'credentials');

function listAccounts(): any[] {
  try {
    if (!fs.existsSync(EMAIL_DIR)) return [];
    return fs.readdirSync(EMAIL_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(EMAIL_DIR, f), 'utf8')); } catch { return null; }
      })
      .filter(Boolean);
  } catch { return []; }
}

function getDefault(): string | null {
  try {
    const fp = path.join(EMAIL_DIR, 'default.txt');
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8').trim() : null;
  } catch { return null; }
}

// Read password from credential file fallback (keyring fallback path)
function readCredFile(key: string): string {
  try {
    const fp = path.join(CRED_DIR, `${key}.txt`);
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8').trim() : '';
  } catch { return ''; }
}

emailAccountsRouter.get('/', (_req: Request, res: Response) => {
  const accounts = listAccounts();
  const defaultAcc = getDefault();
  res.json({ accounts, default: defaultAcc });
});

emailAccountsRouter.get('/:name/passwords', requireAdmin, (req: Request, res: Response) => {
  const prefix = `EMAIL_${req.params.name.toUpperCase()}`;
  res.json({
    smtpPassword: readCredFile(`${prefix}_SMTP_PASSWORD`),
    imapPassword: readCredFile(`${prefix}_IMAP_PASSWORD`),
  });
});

emailAccountsRouter.put('/:name', requireAdmin, (req: Request, res: Response) => {
  const configPath = path.join(EMAIL_DIR, `${req.params.name}.json`);
  if (!fs.existsSync(configPath)) { res.status(404).json({ error: 'Account not found' }); return; }
  try {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const allowed = ['displayName','smtpHost','smtpPort','smtpUser','smtpSecurity',
                     'imapHost','imapPort','imapUser','imapSecurity','rejectUnauthorized','provider'];
    for (const k of allowed) {
      if (req.body[k] !== undefined) existing[k] = req.body[k];
    }
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), { mode: 0o600 });

    // Save passwords to credential files if provided
    const prefix = `EMAIL_${req.params.name.toUpperCase()}`;
    if (req.body.smtpPassword) {
      fs.mkdirSync(CRED_DIR, { recursive: true });
      fs.writeFileSync(path.join(CRED_DIR, `${prefix}_SMTP_PASSWORD.txt`), req.body.smtpPassword, { mode: 0o600 });
    }
    if (req.body.imapPassword) {
      fs.mkdirSync(CRED_DIR, { recursive: true });
      fs.writeFileSync(path.join(CRED_DIR, `${prefix}_IMAP_PASSWORD.txt`), req.body.imapPassword, { mode: 0o600 });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

emailAccountsRouter.post('/:name/default', requireAdmin, (req: Request, res: Response) => {
  const configPath = path.join(EMAIL_DIR, `${req.params.name}.json`);
  if (!fs.existsSync(configPath)) { res.status(404).json({ error: 'Account not found' }); return; }
  fs.writeFileSync(path.join(EMAIL_DIR, 'default.txt'), req.params.name, { mode: 0o600 });
  res.json({ ok: true });
});

emailAccountsRouter.delete('/:name', requireAdmin, (req: Request, res: Response) => {
  const configPath = path.join(EMAIL_DIR, `${req.params.name}.json`);
  if (!fs.existsSync(configPath)) { res.status(404).json({ error: 'Account not found' }); return; }
  fs.unlinkSync(configPath);
  // Also remove credential files if present
  const prefix = `EMAIL_${req.params.name.toUpperCase()}`;
  for (const k of [`${prefix}_SMTP_PASSWORD`, `${prefix}_IMAP_PASSWORD`]) {
    try { fs.unlinkSync(path.join(CRED_DIR, `${k}.txt`)); } catch {}
  }
  res.json({ ok: true });
});
