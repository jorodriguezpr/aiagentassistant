import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.env.PORTAL_DATA_DIR || '/opt/aiagentassistant/portal';

function loadOrCreateSecret(): string {
  const secretFile = path.join(DATA_DIR, '.jwt_secret');
  try {
    if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  } catch {}
  const secret = crypto.randomBytes(64).toString('hex');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  } catch {}
  return secret;
}

export const CONFIG = {
  PORT:           parseInt(process.env.PORTAL_PORT || '8085', 10),
  JWT_SECRET:     loadOrCreateSecret(),
  DATA_DIR,
  USERS_FILE:     path.join(DATA_DIR, 'users.json'),
  AGENT_ENV_PATH: process.env.PORTAL_AGENT_ENV_PATH || '/opt/aiagentassistant/.env',
  AGENT_SERVICE:  process.env.PORTAL_AGENT_SERVICE  || 'aiagentassistant',
  COOKIE_NAME:    'portal_token',
  SSL_CERT:       process.env.PORTAL_SSL_CERT || '',
  SSL_KEY:        process.env.PORTAL_SSL_KEY  || '',
};
