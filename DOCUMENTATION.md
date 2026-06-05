# Documentation Index

**AI Agent Assistant** — Multi-Agent Orchestration System  
**Author:** Jose Rodriguez Arroyo · jrpcone@gmail.com · [github.com/jorodriguezpr](https://github.com/jorodriguezpr/)  
**Version:** 2.0 · Last updated: June 2026 · Status: ✅ Production Ready

---

## Start Here

### New user — installing on a fresh server

```bash
# One command installs everything
curl -fsSL https://raw.githubusercontent.com/jorodriguezpr/aiagentassistant/main/gitdeploy/install.sh | bash
```

The installer is interactive. It will ask for your Telegram bot token and AI provider key, then set everything up. When it finishes, it prints the Admin Portal URL and initial password.

→ See **[QUICKSTART_SECURITY.md](./QUICKSTART_SECURITY.md)** for what happens during install and first steps after.

### Already installed — need to configure something

→ Open the **Admin Portal** at `http://YOUR_SERVER:8085` (Settings tab)  
→ Or edit `/opt/aiagentassistant/app/.env` directly and restart

### Need to understand the AI tools

→ **[AI_INTEGRATION.md](./AI_INTEGRATION.md)** — all supported AI providers (Anthropic, OpenAI, Ollama Cloud, etc.) and configuration

### Need to know what the AI agent can do

→ **[ENTERPRISE_SKILLS.md](./ENTERPRISE_SKILLS.md)** — complete reference for all 140+ tools organized by category

---

## Documentation Files

| File | What it covers | Read if you… |
|------|---------------|--------------|
| [README.md](./README.md) | Full feature overview, architecture, all Telegram commands, .env reference | Want a complete picture |
| [QUICKSTART_SECURITY.md](./QUICKSTART_SECURITY.md) | Installer walkthrough, first steps, security model | Are installing for the first time |
| [AI_INTEGRATION.md](./AI_INTEGRATION.md) | All 6 AI providers, model selection, Ollama Cloud, switching providers | Are setting up or changing the AI provider |
| [ENTERPRISE_SKILLS.md](./ENTERPRISE_SKILLS.md) | 140+ AI tools reference — SSH, network, email, PDF, web search, credentials, knowledge base | Want to know what you can ask the agent to do |
| [SECURITY.md](./SECURITY.md) | Security architecture, kernel keyring, systemd hardening, sudo restrictions | Want to understand the security model |
| [ADVANCED.md](./ADVANCED.md) | Redis clustering, performance tuning, multi-instance | Are scaling or running in high-availability |

---

## Guided Paths

### Path 1 — First-time install (most users)

```
1. Run one-liner installer
   ↓
2. QUICKSTART_SECURITY.md — understand what was set up
   ↓
3. Admin Portal → Settings → verify AI provider
   ↓
4. Send a message in Telegram — talk to your agent
   ↓
5. ENTERPRISE_SKILLS.md — explore what it can do
```

### Path 2 — Changing or adding AI providers

```
1. AI_INTEGRATION.md — find your provider section
   ↓
2. Admin Portal → Settings → update AI_PROVIDER and API key
   ↓
3. Restart service: systemctl restart aiagentassistant
   ↓
4. /aimodel in Telegram to verify model in use
```

### Path 3 — DevOps / operations

```
1. README.md → Architecture section
   ↓
2. SECURITY.md — understand the service hardening
   ↓
3. ADVANCED.md — production tuning
   ↓
4. Useful commands below
```

---

## Quick Reference

### Service management
```bash
systemctl status aiagentassistant          # Is it running?
systemctl restart aiagentassistant         # Restart after .env changes
journalctl -u aiagentassistant -f          # Live logs
journalctl -u aiagentassistant -n 50       # Last 50 lines

systemctl status aiagentassistant-portal   # Portal running?
systemctl restart aiagentassistant-portal  # Restart portal
journalctl -u aiagentassistant-portal -f   # Portal live logs
```

### Configuration
```bash
nano /opt/aiagentassistant/app/.env        # Edit config
# Then:
systemctl restart aiagentassistant
```

### Rebuild after source update
```bash
cd /opt/aiagentassistant/app
npm run build
systemctl restart aiagentassistant
```

### Reset admin portal password
```bash
PORTAL_DATA_DIR=/opt/aiagentassistant/portal \
  node /opt/aiagentassistant/portal/setup.js --username admin --password NEWPASSWORD
systemctl restart aiagentassistant-portal
```

### Reinstall / update
```bash
curl -fsSL https://raw.githubusercontent.com/jorodriguezpr/aiagentassistant/main/gitdeploy/install.sh | bash
```

---

## File & Path Reference

| Path | Purpose |
|------|---------|
| `/opt/aiagentassistant/app/` | Main application files |
| `/opt/aiagentassistant/app/dist/` | Compiled JavaScript — deploy here |
| `/opt/aiagentassistant/app/.env` | Runtime configuration (all env vars) |
| `/opt/aiagentassistant/app/data/experience-kb.json` | IT knowledge base — do not overwrite |
| `/opt/aiagentassistant/app/data/token-usage.json` | Token usage metrics |
| `/opt/aiagentassistant/portal/` | Admin portal application |
| `/opt/aiagentassistant/portal/users.json` | Portal user accounts |
| `/opt/aiagentassistant/portal/.jwt_secret` | Portal JWT secret |
| `/etc/systemd/system/aiagentassistant.service` | Main service unit |
| `/etc/systemd/system/aiagentassistant-portal.service` | Portal service unit |
| `/etc/sudoers.d/aiagent` | Restricted sudo rules |

---

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript | 5.3+ |
| Runtime | Node.js | 18+ (20 recommended) |
| Bot framework | Telegraf | 4.14 |
| HTTP server | Express | 4.18 |
| Message bus | Redis | 6+ |
| Task queue | Bull | 4.14 |
| PDF generation | PDFKit | 0.13 |
| Logging | Pino | 8.17 |
| Admin portal | Express + Vanilla JS | — |

---

## Getting Help

| Problem | Where to look |
|---------|--------------|
| Service won't start | `journalctl -u aiagentassistant -n 50` |
| Portal not loading | `journalctl -u aiagentassistant-portal -n 30` |
| Redis errors | `redis-cli ping` / `systemctl status redis-server` |
| Wrong AI responses | Check `AI_PROVIDER` and `AI_MODEL` in `.env` |
| Telegram bot silent | Verify `TELEGRAM_BOT_TOKEN` in `.env` |
| Firewall blocking portal | `ufw allow 8085` |
| Full install troubleshooting | [README.md → Troubleshooting](./README.md#troubleshooting) |
| Security questions | [SECURITY.md](./SECURITY.md) |
