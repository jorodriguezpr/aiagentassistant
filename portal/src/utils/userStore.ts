import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { CONFIG } from '../config';

export interface PortalUser {
  id:           string;
  username:     string;
  passwordHash: string;
  role:         'admin' | 'viewer';
  createdAt:    string;
  totpSecret?:  string;
}

function load(): PortalUser[] {
  try {
    if (fs.existsSync(CONFIG.USERS_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.USERS_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function save(users: PortalUser[]): void {
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG.USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

export function listUsers(): Omit<PortalUser, 'passwordHash'>[] {
  return load().map(({ passwordHash: _, ...u }) => u);
}

export function findUser(username: string): PortalUser | null {
  return load().find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}

export async function verifyPassword(username: string, password: string): Promise<PortalUser | null> {
  const user = findUser(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function createUser(username: string, password: string, role: 'admin' | 'viewer' = 'admin'): Promise<Omit<PortalUser, 'passwordHash'>> {
  const users = load();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error(`User "${username}" already exists`);
  }
  const hash = await bcrypt.hash(password, 12);
  const user: PortalUser = {
    id:           `usr_${crypto.randomBytes(6).toString('hex')}`,
    username,
    passwordHash: hash,
    role,
    createdAt:    new Date().toISOString(),
  };
  users.push(user);
  save(users);
  const { passwordHash: _, ...safe } = user;
  return safe;
}

export async function changePassword(username: string, newPassword: string): Promise<boolean> {
  const users = load();
  const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return false;
  users[idx].passwordHash = await bcrypt.hash(newPassword, 12);
  save(users);
  return true;
}

export function deleteUser(username: string): boolean {
  const users = load();
  const filtered = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
  if (filtered.length === users.length) return false;
  save(filtered);
  return true;
}

export function saveTotpSecret(username: string, secret: string): boolean {
  const users = load();
  const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return false;
  users[idx].totpSecret = secret;
  save(users);
  return true;
}

export function removeTotpSecret(username: string): boolean {
  const users = load();
  const idx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (idx === -1) return false;
  delete users[idx].totpSecret;
  save(users);
  return true;
}
