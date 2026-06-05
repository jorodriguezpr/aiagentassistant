# Quick Start & Security Guide

This guide walks you through installing AI Agent Assistant on a fresh server and explains the security model that protects your credentials and system.

---

## Installation (One Command)

Run this on any Ubuntu 20.04+ or Debian 11+ server **as root**:

```bash
curl -fsSL https://raw.githubusercontent.com/jorodriguezpr/aiagentassistant/main/gitdeploy/install.sh | bash
```

Or download and inspect the script before running:

```bash
wget https://raw.githubusercontent.com/jorodriguezpr/aiagentassistant/main/gitdeploy/install.sh
cat install.sh      # review it
chmod +x install.sh
./install.sh
```

**What the installer asks you:**
1. Telegram Bot Token — get it from [@BotFather](https://t.me/botfather) on Telegram
2. AI Provider — choose from a numbered menu (Anthropic, OpenAI, GitHub, Ollama, Ollama Cloud)
3. API Key — for whichever provider you chose
4. Optional: Discord bot, WhatsApp

**What the installer does automatically:**
- Installs Node.js 20, Redis, Git, sshpass, and system tools
- Creates the `aiagent` system user with home at `/opt/aiagentassistant/`
- Clones the repository and builds the app from source
- Writes `/opt/aiagentassistant/app/.env` with your settings
- Installs sudoers rules so `aiagent` can manage packages and its own service
- Installs and enables both systemd services (`aiagentassistant` + `aiagentassistant-portal`)
- Creates the admin portal with a generated admin password
- Starts both services

**At the end, you get:**
```
╔══════════════════════════════════════════════════════════╗
║       ✅  Installation Complete!                          ║
╚══════════════════════════════════════════════════════════╝

  Admin Portal
  ┌─────────────────────────────────────────────────────┐
  │  URL:       http://192.168.1.100:8085               │
  │  Username:  admin                                    │
  │  Password:  Xy9mK2pLnQ3w                            │
  └─────────────────────────────────────────────────────┘
```

**Save the password** — it's only shown once. You can reset it later (see below).

---

## First Steps After Install

### 1. Open the Admin Portal

Go to `http://YOUR_SERVER_IP:8085` in your browser.  
Log in with **admin** and the password shown at the end of the install.

### 2. Verify AI Provider

Go to **Settings** → find `AI_PROVIDER` and `AI_MODEL`.  
Confirm the values match what you set during install. If you need to change providers, edit here.

### 3. Test in Telegram

Find your bot on Telegram and send:
```
/start
```
Then try a real task:
```
Check disk space on this server
```
You should see live step indicators appear as the agent works.

### 4. Add Credentials (Optional)

If you want the agent to SSH into remote servers, save credentials first:
```
/savecred root@192.168.1.50 yourpassword
```
Or use the Admin Portal → **Credentials** section.

---

## Security Model

### What is protected

The system runs as a **dedicated `aiagent` user** — not root — with strictly limited permissions.

| What | How it's protected |
|------|--------------------|
| API keys and tokens | In `/opt/aiagentassistant/app/.env` (mode 600, owned by aiagent) |
| Server credentials (SSH passwords) | In `/opt/aiagentassistant/app/data/` (readable only by aiagent) |
| Service | Systemd with `MemoryMax=512M`, `CPUQuota=80%`, `ReadWritePaths` restricted |
| Sudo access | Strictly limited: only `apt`, `systemctl` for its own service, `journalctl` |

### What the AI agent CAN do

✅ Execute commands on this server (as `aiagent` user)  
✅ SSH into remote servers using saved credentials  
✅ Install packages via `sudo apt-get`  
✅ Restart its own service via `sudo systemctl restart aiagentassistant`  
✅ Read and write files within `/opt/aiagentassistant/`  
✅ Search the web, send email, generate PDFs  
✅ Call any configured API  

### What the AI agent CANNOT do

❌ Run arbitrary `sudo` commands (only specific ones are allowed)  
❌ Modify files outside `/opt/aiagentassistant/`  
❌ Access other users' home directories  
❌ Escalate to root  
❌ Modify system configuration files  

### Sudoers rules

The installer creates `/etc/sudoers.d/aiagent`:

```
aiagent ALL=(root) NOPASSWD: /usr/bin/apt, /usr/bin/apt-get, /usr/bin/dpkg
aiagent ALL=(root) NOPASSWD: /bin/systemctl restart aiagentassistant, ...
aiagent ALL=(root) NOPASSWD: /bin/journalctl -u aiagentassistant
aiagent ALL=(root) NOPASSWD: /usr/bin/curl, /usr/bin/ping, /usr/bin/whois, ...
```

No wildcard `sudo ALL`. Only the specific commands listed.

---

## Credential Management

### Saving credentials via Telegram

```
/savecred root@192.168.1.50 mypassword
/savecred api_key_openai sk-abc123
/savecred mysql-root@192.168.1.50 dbpassword
```

### Saving credentials via Admin Portal

Go to `http://YOUR_SERVER:8085` → **Credentials** → Add Credential.

### Retrieving credentials

```
/getcred root@192.168.1.50
```

Or the AI agent retrieves them automatically when it needs to connect to a server.

### Deleting credentials

```
/delcred root@192.168.1.50
```

---

## Managing the Services

### Check status

```bash
systemctl status aiagentassistant
systemctl status aiagentassistant-portal
```

### View live logs

```bash
journalctl -u aiagentassistant -f
journalctl -u aiagentassistant-portal -f
```

### Restart after configuration changes

```bash
systemctl restart aiagentassistant
```

### Stop / start

```bash
systemctl stop aiagentassistant
systemctl start aiagentassistant
```

---

## Changing Configuration After Install

### Via Admin Portal (easiest)

1. Go to `http://YOUR_SERVER:8085`
2. Click **Settings**
3. Edit any `.env` variable
4. Save — the portal will offer to restart the service

### Via command line

```bash
nano /opt/aiagentassistant/app/.env
systemctl restart aiagentassistant
```

---

## Resetting the Admin Portal Password

```bash
PORTAL_DATA_DIR=/opt/aiagentassistant/portal \
  node /opt/aiagentassistant/portal/setup.js \
  --username admin --password YOURNEWPASSWORD

systemctl restart aiagentassistant-portal
```

---

## Monitoring

### Service logs (real-time)

```bash
journalctl -u aiagentassistant -f
```

### Last hour only

```bash
journalctl -u aiagentassistant --since "1 hour ago"
```

### Errors only

```bash
journalctl -u aiagentassistant -p err
```

### Check what sudo actions the agent took

```bash
grep aiagent /var/log/auth.log
```

---

## Updating the Agent

To pull the latest version and rebuild:

```bash
curl -fsSL https://raw.githubusercontent.com/jorodriguezpr/aiagentassistant/main/gitdeploy/install.sh | bash
```

The installer detects the existing installation and offers to update it without losing your `.env` configuration.

---

## Troubleshooting

### Service won't start

```bash
journalctl -u aiagentassistant -n 50 --no-pager
```

Common causes:
- Missing `.env` file → `ls -la /opt/aiagentassistant/app/.env`
- Node.js not found → `which node && node --version`
- Redis not running → `systemctl start redis-server`
- Build artifacts missing → `ls /opt/aiagentassistant/app/dist/index.js`

### Re-run the build manually

```bash
cd /opt/aiagentassistant/app
sudo -u aiagent npm run build
systemctl restart aiagentassistant
```

### Fix permissions

```bash
chown -R aiagent:aiagent /opt/aiagentassistant/app
chmod 600 /opt/aiagentassistant/app/.env
```

### Node.js not installed

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### Redis not running

```bash
systemctl enable --now redis-server
redis-cli ping   # should return PONG
```

---

## Further Reading

- [README.md](./README.md) — Full feature reference and all Telegram commands
- [AI_INTEGRATION.md](./AI_INTEGRATION.md) — Detailed AI provider configuration
- [ENTERPRISE_SKILLS.md](./ENTERPRISE_SKILLS.md) — What the agent can do (140+ tools)
- [SECURITY.md](./SECURITY.md) — Deep dive into the security architecture
- [DOCUMENTATION.md](./DOCUMENTATION.md) — Complete documentation index
