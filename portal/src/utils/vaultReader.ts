/**
 * Mirrors the AES-256-GCM logic in src/utils/CredentialVault.ts
 * so the portal can read/write the credential vault without importing
 * the main project's code.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { readEnv } from './envEditor';

const ALGORITHM  = 'aes-256-gcm';
const KEY_LENGTH = 32;

const AGENT_HOME = process.env.PORTAL_AGENT_HOME || '/opt/aiagentassistant';
const VAULT_PATH = path.join(AGENT_HOME, '.aiagent', 'credentials.vault');

export interface VaultCredential {
  id:           string;
  type:         string;
  name:         string;
  description?: string;
  createdAt:    string;
  updatedAt:    string;
  encryptedValue: string;
  iv:           string;
  metadata?:    Record<string, any>;
}

function getMasterKey(): Buffer {
  // Read VAULT_MASTER_PASSWORD from the agent's .env (same key the main service uses)
  let pw: string;
  try {
    const env = readEnv();
    pw = env['VAULT_MASTER_PASSWORD'] || 'default-key-change-me';
  } catch {
    pw = 'default-key-change-me';
  }
  return crypto.scryptSync(pw, 'salt', KEY_LENGTH);
}

function encrypt(plaintext: string, key: Buffer): { encryptedValue: string; iv: string } {
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return { encryptedValue: enc + ':' + authTag.toString('hex'), iv: iv.toString('hex') };
}

function decrypt(encryptedValue: string, ivHex: string, key: Buffer): string {
  const [enc, authTagHex] = encryptedValue.split(':');
  const iv      = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

function loadVault(): VaultCredential[] {
  try {
    if (!fs.existsSync(VAULT_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
    return raw.credentials || [];
  } catch {
    return [];
  }
}

function saveVault(credentials: VaultCredential[]): void {
  const dir = path.dirname(VAULT_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = VAULT_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ version: '1.0', lastModified: new Date().toISOString(), credentials }, null, 2));
  fs.renameSync(tmp, VAULT_PATH);
  fs.chmodSync(VAULT_PATH, 0o600);
}

export function listCredentials(): Omit<VaultCredential, 'encryptedValue' | 'iv'>[] {
  return loadVault().map(({ encryptedValue: _, iv: __, ...safe }) => safe);
}

export function getCredentialValue(nameOrId: string): string | null {
  const key  = getMasterKey();
  const cred = loadVault().find(c => c.id === nameOrId || c.name === nameOrId);
  if (!cred) return null;
  try { return decrypt(cred.encryptedValue, cred.iv, key); } catch { return null; }
}

export function storeCredential(type: string, name: string, value: string, description?: string): string {
  const key  = getMasterKey();
  const { encryptedValue, iv } = encrypt(value, key);
  const id   = crypto.randomUUID();
  const now  = new Date().toISOString();
  const creds = loadVault();
  creds.push({ id, type, name, description, createdAt: now, updatedAt: now, encryptedValue, iv });
  saveVault(creds);
  return id;
}

export function updateCredential(nameOrId: string, newValue: string): boolean {
  const key   = getMasterKey();
  const creds = loadVault();
  const idx   = creds.findIndex(c => c.id === nameOrId || c.name === nameOrId);
  if (idx === -1) return false;
  const { encryptedValue, iv } = encrypt(newValue, key);
  creds[idx].encryptedValue = encryptedValue;
  creds[idx].iv = iv;
  creds[idx].updatedAt = new Date().toISOString();
  saveVault(creds);
  return true;
}

export function deleteCredential(nameOrId: string): boolean {
  const creds    = loadVault();
  const filtered = creds.filter(c => c.id !== nameOrId && c.name !== nameOrId);
  if (filtered.length === creds.length) return false;
  saveVault(filtered);
  return true;
}
