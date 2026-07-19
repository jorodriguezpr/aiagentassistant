#!/usr/bin/env bash
# =============================================================================
#  AI Agent Assistant — Interactive Installer
#  https://github.com/jorodriguezpr/aiagentassistant
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/jorodriguezpr/aiagentassistant/main/gitdeploy/install.sh | bash
#  Or:
#    wget -O install.sh https://raw.githubusercontent.com/jorodriguezpr/aiagentassistant/main/gitdeploy/install.sh
#    chmod +x install.sh && ./install.sh
# =============================================================================

set -euo pipefail

# ─── Colors ─────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'
BOLD='\033[1m'; NC='\033[0m'

# ─── Constants ───────────────────────────────────────────────────────────────

REPO_URL="https://github.com/jorodriguezpr/aiagentassistant.git"
INSTALL_BASE="/opt/aiagentassistant"
APP_DIR="$INSTALL_BASE/app"
PORTAL_DIR="$INSTALL_BASE/portal"
INSTALL_USER="aiagent"
INSTALL_HOME="$INSTALL_BASE"
NODE_MAJOR="20"
TMP_DIR="/tmp/aiagentassistant-install-$$"

# ─── Helpers ─────────────────────────────────────────────────────────────────

banner() {
cat << 'EOF'

  ╔══════════════════════════════════════════════════════════╗
  ║          AI Agent Assistant — Installer v1.0             ║
  ║    Multi-Agent Orchestrator with Telegram Integration    ║
  ╚══════════════════════════════════════════════════════════╝

EOF
}

step()    { echo -e "\n${BOLD}${BLUE}▶ Step $1:${NC} ${BOLD}$2${NC}"; }
ok()      { echo -e "  ${GREEN}✓${NC} $*"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $*"; }
info()    { echo -e "  ${CYAN}ℹ${NC} $*"; }
err()     { echo -e "\n  ${RED}✗ ERROR:${NC} $*" >&2; }
die()     { err "$*"; exit 1; }
section() { echo -e "\n${BOLD}${MAGENTA}━━━ $* ━━━${NC}"; }

ask() {
  local prompt="$1" default="${2:-}" var
  if [[ -n "$default" ]]; then
    read -rp "  → $prompt [$default]: " var </dev/tty
    echo "${var:-$default}"
  else
    read -rp "  → $prompt: " var </dev/tty
    echo "$var"
  fi
}

ask_secret() {
  local prompt="$1" var
  read -rsp "  → $prompt: " var </dev/tty; echo >&2
  echo "$var"
}

ask_yn() {
  local prompt="$1" default="${2:-n}" var
  read -rp "  → $prompt (y/n) [$default]: " var </dev/tty
  var="${var:-$default}"
  [[ "${var,,}" == "y" ]]
}

server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}' || \
  ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || \
  echo "YOUR_SERVER_IP"
}

spin() {
  local pid=$! frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' i=1 rc=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${CYAN}%s${NC} %s" "${frames:$((i%${#frames})):1}" "$1"
    i=$((i+1)); sleep 0.1
  done
  wait "$pid" || rc=$?
  if [[ $rc -eq 0 ]]; then
    printf "\r  ${GREEN}✓${NC} %s\n" "$1"
  else
    printf "\r  ${RED}✗${NC} %s (failed — exit %s)\n" "$1" "$rc" >&2
  fi
  return $rc
}

# ─── Phase 0: Pre-flight ─────────────────────────────────────────────────────

preflight() {
  banner

  [[ $EUID -eq 0 ]] || die "This installer must run as root (use: sudo bash install.sh)"

  # OS check
  if ! command -v apt-get &>/dev/null; then
    die "This installer requires a Debian/Ubuntu-based system (apt-get not found)"
  fi
  local os_id="" os_ver=""
  [[ -f /etc/os-release ]] && { source /etc/os-release; os_id="$ID"; os_ver="${VERSION_ID:-}"; }
  if [[ "$os_id" != "ubuntu" && "$os_id" != "debian" ]]; then
    warn "OS '$os_id' is not officially tested. Proceeding anyway…"
  else
    ok "OS detected: $PRETTY_NAME"
  fi

  # Internet check
  if ! curl -fsSL --max-time 5 https://github.com >/dev/null 2>&1; then
    die "No internet connection. Please check network and retry."
  fi
  ok "Internet connectivity confirmed"

  # Existing install check
  if systemctl is-active --quiet aiagentassistant 2>/dev/null; then
    warn "An existing installation is running."
    if ask_yn "Do you want to reinstall / update it?" "n"; then
      info "Stopping existing services…"
      systemctl stop aiagentassistant 2>/dev/null || true
    else
      die "Aborted by user."
    fi
  fi

  # Decommission the standalone admin portal from older installs — this is
  # the SysAdminHCP-integrated flavor, which is managed entirely from the
  # SysAdminHCP control panel's own AI Agent menu and never runs the portal.
  if systemctl list-unit-files 2>/dev/null | grep -q '^aiagentassistant-portal\.service'; then
    warn "Removing standalone admin portal from a previous install (not used by the SysAdminHCP integration)…"
    systemctl stop aiagentassistant-portal 2>/dev/null || true
    systemctl disable aiagentassistant-portal 2>/dev/null || true
    rm -f /etc/systemd/system/aiagentassistant-portal.service
    systemctl daemon-reload 2>/dev/null || true
    rm -rf "$PORTAL_DIR"
    ok "Standalone admin portal removed"
  fi
}

# ─── Phase 1: System Dependencies ────────────────────────────────────────────

install_deps() {
  step 1 "Installing system dependencies"

  apt-get update -qq
  apt-get install -y --no-install-recommends \
    curl wget git ca-certificates gnupg \
    redis-server redis-tools \
    build-essential python3 \
    sshpass whois traceroute dnsutils net-tools \
    chromium-browser || \
  apt-get install -y --no-install-recommends \
    curl wget git ca-certificates gnupg \
    redis-server redis-tools \
    build-essential python3 \
    sshpass whois traceroute dnsutils net-tools 2>/dev/null || true
  ok "Base packages installed"

  # Node.js via NodeSource if not already at v18+
  local cur_major=0
  if command -v node &>/dev/null; then
    cur_major=$(node -e 'process.stdout.write(process.version.split(".")[0].replace("v",""))' 2>/dev/null || echo 0)
  fi
  if [[ "$cur_major" -lt 18 ]]; then
    info "Installing Node.js ${NODE_MAJOR}.x via NodeSource…"
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null
  fi
  ok "Node.js $(node -v) / npm $(npm -v)"
  ok "Redis $(redis-server --version | awk '{print $3}')"
}

# ─── Phase 2: User & Directories ─────────────────────────────────────────────

setup_dirs() {
  step 2 "Creating service user and directory layout"

  if ! id "$INSTALL_USER" &>/dev/null; then
    useradd --system --home "$INSTALL_HOME" --shell /bin/bash \
            --create-home "$INSTALL_USER" 2>/dev/null || \
    useradd --system --home "$INSTALL_HOME" --shell /bin/bash "$INSTALL_USER"
    ok "User '$INSTALL_USER' created"
  else
    ok "User '$INSTALL_USER' already exists"
  fi

  # Add to sudo group for diagnostics
  usermod -aG sudo "$INSTALL_USER" 2>/dev/null || true

  mkdir -p \
    "$APP_DIR/dist" \
    "$APP_DIR/scripts" \
    "$APP_DIR/data" \
    "$APP_DIR/src" \
    "$INSTALL_HOME/.ssh" \
    "$INSTALL_HOME/.config"

  chown -R "$INSTALL_USER:$INSTALL_USER" "$INSTALL_BASE"
  ok "Directory layout: $INSTALL_BASE"
}

# ─── Phase 3: Download & Build ───────────────────────────────────────────────

download_build() {
  step 3 "Downloading and building application (this may take a few minutes)"
  mkdir -p "$TMP_DIR"

  info "Cloning repository…"
  local clone_log="/tmp/aiagentassistant-clone-$$.log"
  { git clone --depth=1 "$REPO_URL" "$TMP_DIR/repo" >"$clone_log" 2>&1; } &
  spin "Fetching source from GitHub" || {
    err "git clone failed. Details:"
    cat "$clone_log" >&2
    rm -f "$clone_log"
    die "Could not clone $REPO_URL\n  Verify the repository is public and the URL is correct, then retry."
  }
  rm -f "$clone_log"

  local REPO="$TMP_DIR/repo"

  # ── Main app ──────────────────────────────────────────────────────────────
  info "Installing app dependencies…"
  cp -r "$REPO/src"              "$APP_DIR/"
  cp    "$REPO/package.json"     "$APP_DIR/"
  cp    "$REPO/package-lock.json" "$APP_DIR/" 2>/dev/null || true
  cp    "$REPO/tsconfig.json"    "$APP_DIR/"
  cp    "$REPO/.env.example"     "$APP_DIR/" 2>/dev/null || true

  # Startup script
  cp    "$REPO/gitdeploy/scripts/start-with-keyring.sh" "$APP_DIR/scripts/"
  chmod +x "$APP_DIR/scripts/start-with-keyring.sh"

  # Puppeteer: use system chromium if available, skip internal download
  export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1
  CHROMIUM_PATH=$(command -v chromium-browser || command -v chromium || echo "")
  [[ -n "$CHROMIUM_PATH" ]] && export PUPPETEER_EXECUTABLE_PATH="$CHROMIUM_PATH"

  local npm_log="/tmp/aiagentassistant-npm-$$.log"

  info "Running npm install for app (may take 1-3 minutes)…"
  cd "$APP_DIR"
  npm install --no-audit --no-fund >"$npm_log" 2>&1 || {
    err "npm install (app) failed. Details:"
    tail -40 "$npm_log" >&2
    rm -f "$npm_log"
    die "npm install failed in $APP_DIR — check Node.js version (need 18+) and internet connection."
  }
  ok "App packages installed"

  info "Compiling TypeScript (app)…"
  npm run build >"$npm_log" 2>&1 || {
    err "TypeScript build (app) failed. Details:"
    tail -40 "$npm_log" >&2
    rm -f "$npm_log"
    die "Build failed in $APP_DIR — see TypeScript errors above."
  }
  ok "Main application built"
  rm -f "$npm_log"

  # No separate admin portal is built or installed here — this installer ships
  # the SysAdminHCP-integrated flavor of AI Agent Assistant. All management
  # (chat, settings, credentials, scheduled tasks, autonomous delegation) is
  # done from the SysAdminHCP control panel's own "AI Agent" menu, which talks
  # only to the core agent API on port 3000. The standalone portal/ web app in
  # this repo is not part of that integration and must not run alongside it.

  # ── Knowledge base (playbooks) ───────────────────────────────────────────
  mkdir -p "$APP_DIR/data"
  local bundled_kb="$REPO/data/experience-kb.json"
  local installed_kb="$APP_DIR/data/experience-kb.json"
  if [[ -f "$bundled_kb" ]]; then
    if [[ -f "$installed_kb" ]]; then
      # Reinstall: merge bundled playbooks that don't already exist
      node -e "
        const fs = require('fs');
        const existing = JSON.parse(fs.readFileSync('$installed_kb', 'utf8'));
        const bundled  = JSON.parse(fs.readFileSync('$bundled_kb',   'utf8'));
        const ids = new Set((existing.playbooks || []).map(p => p.id));
        const added = (bundled.playbooks || []).filter(p => !ids.has(p.id));
        existing.playbooks = [...(existing.playbooks || []), ...added];
        fs.writeFileSync('$installed_kb', JSON.stringify(existing, null, 2));
        console.log('  Merged ' + added.length + ' new playbook(s) into existing knowledge base');
      " 2>/dev/null || cp "$bundled_kb" "$installed_kb"
    else
      cp "$bundled_kb" "$installed_kb"
    fi
    ok "IT knowledge base installed ($(node -e "const f=require('fs'),k=JSON.parse(f.readFileSync('$installed_kb'));process.stdout.write(String((k.playbooks||[]).length))" 2>/dev/null || echo '?') playbooks)"
  fi

  # ── Copy system config files ──────────────────────────────────────────────
  cp "$REPO/gitdeploy/config/aiagent-sudoers"                       /tmp/aiagent-sudoers-install
  cp "$REPO/gitdeploy/systemd/aiagentassistant.service"             /tmp/aiagentassistant.service

  # ── Permissions ───────────────────────────────────────────────────────────
  chown -R "$INSTALL_USER:$INSTALL_USER" "$APP_DIR"
  chmod 755 "$APP_DIR"

  rm -rf "$TMP_DIR"
  ok "Temporary build files cleaned up"
}

# ─── Phase 4: Interactive Configuration ──────────────────────────────────────

configure() {
  step 4 "Interactive configuration"
  echo ""
  echo -e "  ${BOLD}Both Telegram and AI provider are optional — press Enter to skip${NC}"
  echo -e "  ${BOLD}and configure them later in the Admin Portal.${NC}\n"

  # ── Telegram ──────────────────────────────────────────────────────────────
  section "Telegram Bot (optional)"
  echo "  Get your bot token from @BotFather on Telegram."
  echo "  Send /newbot, follow the steps, and paste the token below."
  echo "  ${YELLOW}Press Enter to skip and configure later.${NC}"
  echo ""
  local TELEGRAM_TOKEN=""
  TELEGRAM_TOKEN=$(ask "Telegram Bot Token (or Enter to skip)")
  if [[ -z "$TELEGRAM_TOKEN" ]]; then
    warn "Telegram skipped — set TELEGRAM_BOT_TOKEN in the Admin Portal → Settings before using the bot."
    # Leave empty, not a placeholder string: the app only attempts to launch the
    # Telegram gateway when TELEGRAM_BOT_TOKEN is truthy, so a placeholder here
    # would make it try to launch with a bogus token instead of skipping cleanly.
  else
    ok "Telegram token saved"
  fi

  # ── AI Provider ───────────────────────────────────────────────────────────
  section "AI Provider (optional)"
  echo "  Select your AI provider:"
  echo ""
  echo "    1) Anthropic Claude   (claude-opus-4-7)  ★ Recommended"
  echo "    2) OpenAI             (gpt-4-turbo)"
  echo "    3) GitHub Copilot     (gpt-4o) — free with GitHub Copilot subscription"
  echo "    4) Ollama Local       (needs Ollama running on this server)"
  echo "    5) Ollama Cloud       (ollama.com — free tier available)"
  echo "    6) Skip               — configure later in Admin Portal"
  echo ""
  local provider_choice
  provider_choice=$(ask "Choice" "6")

  local AI_PROVIDER AI_MODEL AI_API_KEY="" OLLAMA_URL="" OLLAMA_CLOUD_KEY="" GITHUB_COPILOT_KEY="" EXTRA_ENV=""

  case "$provider_choice" in
    1)
      AI_PROVIDER="anthropic"
      AI_MODEL="claude-opus-4-7"
      echo ""
      echo "  Get your key at: https://console.anthropic.com"
      AI_API_KEY=$(ask_secret "Anthropic API Key (sk-ant-...)")
      EXTRA_ENV="ANTHROPIC_API_KEY=${AI_API_KEY}"
      ok "AI Provider: $AI_PROVIDER / Model: $AI_MODEL"
      ;;
    2)
      AI_PROVIDER="openai"
      AI_MODEL="gpt-4-turbo"
      echo ""
      echo "  Get your key at: https://platform.openai.com/api-keys"
      AI_API_KEY=$(ask_secret "OpenAI API Key (sk-...)")
      EXTRA_ENV="OPENAI_API_KEY=${AI_API_KEY}"
      ok "AI Provider: $AI_PROVIDER / Model: $AI_MODEL"
      ;;
    3)
      AI_PROVIDER="github-copilot"
      AI_MODEL="gpt-4o"
      echo ""
      echo "  Use a GitHub Personal Access Token with Copilot scope."
      AI_API_KEY=$(ask_secret "GitHub PAT Token (github_pat_...)")
      GITHUB_COPILOT_KEY="$AI_API_KEY"
      EXTRA_ENV="GITHUB_COPILOT_API_KEY=${AI_API_KEY}"
      ok "AI Provider: $AI_PROVIDER / Model: $AI_MODEL"
      ;;
    4)
      AI_PROVIDER="ollama"
      AI_MODEL=$(ask "Ollama model name" "llama3:latest")
      OLLAMA_URL=$(ask "Ollama base URL" "http://localhost:11434")
      AI_API_KEY="ollama"
      EXTRA_ENV="OLLAMA_BASE_URL=${OLLAMA_URL}"
      ok "AI Provider: $AI_PROVIDER / Model: $AI_MODEL"
      ;;
    5)
      AI_PROVIDER="ollama-cloud"
      AI_MODEL=$(ask "Ollama Cloud model" "llama3.3")
      echo ""
      echo "  Get your key at: https://ollama.com (free tier available)"
      OLLAMA_CLOUD_KEY=$(ask_secret "Ollama Cloud API Key")
      AI_API_KEY="$OLLAMA_CLOUD_KEY"
      EXTRA_ENV="OLLAMA_CLOUD_API_KEY=${OLLAMA_CLOUD_KEY}"
      ok "AI Provider: $AI_PROVIDER / Model: $AI_MODEL"
      ;;
    *)
      AI_PROVIDER="anthropic"
      AI_MODEL="claude-opus-4-7"
      AI_API_KEY="YOUR_API_KEY"
      EXTRA_ENV="ANTHROPIC_API_KEY=YOUR_API_KEY"
      warn "AI provider skipped — set AI_PROVIDER and API key in the Admin Portal → Settings."
      ;;
  esac

  # ── Optional: Discord ─────────────────────────────────────────────────────
  section "Optional Features"
  local ENABLE_DISCORD="false" DISCORD_TOKEN=""
  if ask_yn "Enable Discord bot?" "n"; then
    ENABLE_DISCORD="true"
    DISCORD_TOKEN=$(ask_secret "Discord Bot Token")
  fi

  local ENABLE_WHATSAPP="false"
  if ask_yn "Enable WhatsApp bot?" "n"; then
    ENABLE_WHATSAPP="true"
    warn "WhatsApp requires scanning a QR code on first start. Check logs: journalctl -u aiagentassistant -f"
  fi

  # ── Write .env ────────────────────────────────────────────────────────────
  cat > "$APP_DIR/.env" << ENV
# AI Agent Assistant — generated by installer on $(date)
# Edit this file or use the Admin Portal to change settings.

NODE_ENV=production
LOG_LEVEL=info

# Redis (local)
REDIS_URL=redis://localhost:6379

# API Server
API_PORT=3000
API_HOST=0.0.0.0

# Telegram
TELEGRAM_BOT_TOKEN=${TELEGRAM_TOKEN}
TELEGRAM_WEBHOOK_URL=http://localhost:3000/telegram
TELEGRAM_WEBHOOK_PORT=3000

# AI Provider
AI_PROVIDER=${AI_PROVIDER}
AI_MODEL=${AI_MODEL}
AI_API_KEY=${AI_API_KEY}
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.7
${EXTRA_ENV}

# Agent
ORCHESTRATOR_ID=master-orchestrator
ORCHESTRATOR_NAME="Master Orchestrator"
WORKER_AGENTS_COUNT=3
MAX_CONCURRENT_TASKS=10

# Discord
ENABLE_DISCORD=${ENABLE_DISCORD}
DISCORD_BOT_TOKEN=${DISCORD_TOKEN}
DISCORD_COMMAND_PREFIX=!
DISCORD_STATUS="AI Agent | !help"

# WhatsApp
ENABLE_WHATSAPP=${ENABLE_WHATSAPP}
WHATSAPP_SESSION_NAME=aiagentassistant

# Features
ENABLE_WEB_SEARCH=true
ENABLE_EMAIL=true
ENABLE_PDF_GENERATION=true
ENABLE_SCHEDULING=true
ENV

  chmod 600 "$APP_DIR/.env"
  chown "$INSTALL_USER:$INSTALL_USER" "$APP_DIR/.env"
  ok ".env written to $APP_DIR/.env"
}

# ─── Phase 5: System Configuration ───────────────────────────────────────────

install_system_config() {
  step 5 "Installing system configuration"

  # Sudoers
  install -m 440 /tmp/aiagent-sudoers-install /etc/sudoers.d/aiagent
  ok "Sudoers: /etc/sudoers.d/aiagent"

  # Redis
  systemctl enable redis-server >/dev/null 2>&1 || true
  systemctl start  redis-server >/dev/null 2>&1 || systemctl restart redis-server || true
  ok "Redis service enabled and started"

  # Systemd services
  install -m 644 /tmp/aiagentassistant.service        /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable aiagentassistant
  ok "Systemd services installed and enabled"

  # Cleanup temp service files
  rm -f /tmp/aiagent-sudoers-install /tmp/aiagentassistant.service
}

# ─── Phase 7: Start & Verify ─────────────────────────────────────────────────

start_services() {
  step 7 "Starting services"

  systemctl start aiagentassistant
  sleep 4

  local agent_ok=false

  if systemctl is-active --quiet aiagentassistant; then
    ok "AI Agent       : ${GREEN}running${NC} on port 3000"
    agent_ok=true
  else
    warn "AI Agent       : not running — check: journalctl -u aiagentassistant -n 30"
  fi

  $agent_ok || true
}

# ─── Phase 8: Summary ────────────────────────────────────────────────────────

summary() {
  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${GREEN}║       ✅  Installation Complete!                          ║${NC}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${BOLD}This is the SysAdminHCP-integrated flavor of AI Agent Assistant.${NC}"
  echo -e "  There is no separate admin portal — everything is managed from the"
  echo -e "  SysAdminHCP control panel's ${BOLD}AI Agent${NC} menu (chat, settings,"
  echo -e "  credentials, scheduled tasks, and Autonomous Mode delegation)."
  echo ""
  echo -e "  ${BOLD}Next Steps:${NC}"
  echo -e "  1. Open the SysAdminHCP control panel → ${BOLD}AI Agent${NC}"

  # Remind about skipped items
  local env_file="$APP_DIR/.env"
  if grep -q "^TELEGRAM_BOT_TOKEN=$" "$env_file" 2>/dev/null; then
    echo -e "  ${YELLOW}⚠  Telegram not configured — go to AI Agent → AI Settings → TELEGRAM_BOT_TOKEN${NC}"
  fi
  if grep -q "^AI_API_KEY=YOUR_API_KEY" "$env_file" 2>/dev/null; then
    echo -e "  ${YELLOW}⚠  AI provider not configured — go to AI Agent → AI Settings → AI_PROVIDER and API key${NC}"
  fi

  echo -e "  2. Set any skipped values under ${BOLD}AI Agent → AI Settings${NC}"
  echo -e "  3. Add server credentials under ${BOLD}AI Agent → Credentials${NC}"
  echo -e "  4. Chat with the agent from ${BOLD}AI Agent → AI Chat${NC}"
  echo ""
  echo -e "  ${BOLD}Useful commands:${NC}"
  echo -e "  • View logs  :  journalctl -u aiagentassistant -f"
  echo -e "  • Restart    :  systemctl restart aiagentassistant"
  echo -e "  • Status     :  systemctl status aiagentassistant"
  echo -e "  • Edit config:  nano ${APP_DIR}/.env"
  echo ""
  echo -e "  ${YELLOW}⚠  Save the password above — it won't be shown again.${NC}"
  echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  preflight
  install_deps
  setup_dirs
  download_build
  configure
  install_system_config
  start_services
  summary
}

main "$@"
