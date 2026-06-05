#!/usr/bin/env node
/**
 * Portal setup script — create the initial admin user.
 * Run: node setup.js --username admin --password yourpassword
 *      node setup.js  (prompts interactively)
 */
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const DATA_DIR   = process.env.PORTAL_DATA_DIR || '/opt/aiagentassistant/portal';
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const out  = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username') out.username = args[++i];
    if (args[i] === '--password') out.password = args[++i];
    if (args[i] === '--role')     out.role     = args[++i];
  }
  return out;
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function main() {
  const args = parseArgs();

  const username = args.username || await prompt('Username [admin]: ') || 'admin';
  const password = args.password || await prompt('Password: ');
  const role     = args.role     || 'admin';

  if (!password) { console.error('Error: password is required'); process.exit(1); }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  let users = [];
  try { if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch {}

  const existing = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  const hash = await bcrypt.hash(password, 12);

  if (existing >= 0) {
    users[existing].passwordHash = hash;
    console.log(`✅ Password updated for user "${username}"`);
  } else {
    users.push({
      id:           `usr_${crypto.randomBytes(6).toString('hex')}`,
      username,
      passwordHash: hash,
      role,
      createdAt:    new Date().toISOString(),
    });
    console.log(`✅ User "${username}" created with role "${role}"`);
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
  console.log(`   Users file: ${USERS_FILE}`);
  console.log('   Done — start the portal with: systemctl start aiagentassistant-portal');
}

main().catch(e => { console.error(e.message); process.exit(1); });
