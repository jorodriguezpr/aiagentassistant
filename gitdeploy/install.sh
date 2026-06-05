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
    read -rp "  → $prompt [$default]: " var
    echo "${var:-$default}"
  else
    read -rp "  → $prompt: " var
    echo "$var"
  fi
}

ask_secret() {
  local prompt="$1" var
  read -rsp "  → $prompt: " var; echo >&2
  echo "$var"
}

ask_yn() {
  local prompt="$1" default="${2:-n}" var
  read -rp "  → $prompt (y/n) [$default]: " var
  var="${var:-$default}"
  [[ "${var,,}" == "y" ]]
}

server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}' || \
  ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || \
  echo "YOUR_SERVER_IP"
}

spin() {
  local pid=$! frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' i=0 rc=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${CYAN}%s${NC} %s" "${frames:$((i%${#frames})):1}" "$1"
    ((i++)); sleep 0.1
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
      systemctl stop aiagentassistant aiagentassistant-portal 2>/dev/null || true
    else
      die "Aborted by user."
    fi
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
    "$PORTAL_DIR" \
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

  { cd "$APP_DIR" && npm install --no-audit --no-fund >"$npm_log" 2>&1; } &
  spin "Installing app npm packages" || {
    err "npm install (app) failed. Details:"
    tail -30 "$npm_log" >&2
    rm -f "$npm_log"
    die "npm install failed in $APP_DIR — check Node.js version (need 18+) and internet connection."
  }

  { cd "$APP_DIR" && npm run build >"$npm_log" 2>&1; } &
  spin "Compiling TypeScript (app)" || {
    err "TypeScript build (app) failed. Details:"
    tail -30 "$npm_log" >&2
    rm -f "$npm_log"
    die "Build failed in $APP_DIR — check the output above for TypeScript errors."
  }

  ok "Main application built"

  # ── Portal ────────────────────────────────────────────────────────────────
  cp -r "$REPO/portal/src"          "$PORTAL_DIR/"
  cp -r "$REPO/portal/public"       "$PORTAL_DIR/"
  cp    "$REPO/portal/package.json" "$PORTAL_DIR/"
  cp    "$REPO/portal/package-lock.json" "$PORTAL_DIR/" 2>/dev/null || true
  cp    "$REPO/portal/tsconfig.json" "$PORTAL_DIR/"
  cp    "$REPO/portal/setup.js"     "$PORTAL_DIR/"

  { cd "$PORTAL_DIR" && npm install --no-audit --no-fund >"$npm_log" 2>&1; } &
  spin "Installing portal npm packages" || {
    err "npm install (portal) failed. Details:"
    tail -30 "$npm_log" >&2
    rm -f "$npm_log"
    die "npm install failed in $PORTAL_DIR"
  }

  { cd "$PORTAL_DIR" && npm run build >"$npm_log" 2>&1; } &
  spin "Compiling TypeScript (portal)" || {
    err "TypeScript build (portal) failed. Details:"
    tail -30 "$npm_log" >&2
    rm -f "$npm_log"
    die "Build failed in $PORTAL_DIR — check the output above for TypeScript errors."
  }
  rm -f "$npm_log"

  ok "Admin portal built"

  # ── Copy system config files ──────────────────────────────────────────────
  cp "$REPO/gitdeploy/config/aiagent-sudoers"                       /tmp/aiagent-sudoers-install
  cp "$REPO/gitdeploy/systemd/aiagentassistant.service"             /tmp/aiagentassistant.service
  cp "$REPO/gitdeploy/systemd/aiagentassistant-portal.service"      /tmp/aiagentassistant-portal.service

  # ── Permissions ───────────────────────────────────────────────────────────
  chown -R "$INSTALL_USER:$INSTALL_USER" "$APP_DIR"
  chown -R root:root "$PORTAL_DIR"
  chmod 755 "$APP_DIR" "$PORTAL_DIR"

  rm -rf "$TMP_DIR"
  ok "Temporary build files cleaned up"
}

# ─── Phase 4: Interactive Configuration ──────────────────────────────────────

configure() {
  step 4 "Interactive configuration"
  echo ""
  echo -e "  ${BOLD}We need a few things to get your AI Agent running.${NC}"
  echo -e "  You can update everything later from the Admin Portal.\n"

  # ── Telegram ──────────────────────────────────────────────────────────────
  section "Telegram Bot"
  echo "  Get your bot token from @BotFather on Telegram."
  echo "  Send /newbot, follow the steps, and paste the token below."
  echo ""
  local TELEGRAM_TOKEN=""
  while [[ -z "$TELEGRAM_TOKEN" ]]; do
    TELEGRAM_TOKEN=$(ask "Telegram Bot Token")
    [[ -z "$TELEGRAM_TOKEN" ]] && warn "Telegram token is required. Please enter it."
  done

  # ── AI Provider ───────────────────────────────────────────────────────────
  section "AI Provider"
  echo "  Select your AI provider:"
  echo ""
  echo "    1) Anthropic Claude   (claude-opus-4-7)  ★ Recommended"
  echo "    2) OpenAI             (gpt-4-turbo)"
  echo "    3) GitHub Copilot     (gpt-4o) — free with GitHub Copilot subscription"
  echo "    4) Ollama Local       (needs Ollama running on this server)"
  echo "    5) Ollama Cloud       (ollama.com — free tier available)"
  echo ""
  local provider_choice
  provider_choice=$(ask "Choice" "1")

  local AI_PROVIDER AI_MODEL AI_API_KEY="" OLLAMA_URL="" OLLAMA_CLOUD_KEY="" GITHUB_COPILOT_KEY="" EXTRA_ENV=""

  case "$provider_choice" in
    1)
      AI_PROVIDER="anthropic"
      AI_MODEL="claude-opus-4-7"
      echo ""
      echo "  Get your key at: https://console.anthropic.com"
      AI_API_KEY=$(ask_secret "Anthropic API Key (sk-ant-...)")
      EXTRA_ENV="ANTHROPIC_API_KEY=${AI_API_KEY}"
      ;;
    2)
      AI_PROVIDER="openai"
      AI_MODEL="gpt-4-turbo"
      echo ""
      echo "  Get your key at: https://platform.openai.com/api-keys"
      AI_API_KEY=$(ask_secret "OpenAI API Key (sk-...)")
      EXTRA_ENV="OPENAI_API_KEY=${AI_API_KEY}"
      ;;
    3)
      AI_PROVIDER="github-copilot"
      AI_MODEL="gpt-4o"
      echo ""
      echo "  Use a GitHub Personal Access Token with Copilot scope."
      AI_API_KEY=$(ask_secret "GitHub PAT Token (github_pat_...)")
      GITHUB_COPILOT_KEY="$AI_API_KEY"
      EXTRA_ENV="GITHUB_COPILOT_API_KEY=${AI_API_KEY}"
      ;;
    4)
      AI_PROVIDER="ollama"
      AI_MODEL=$(ask "Ollama model name" "llama3:latest")
      OLLAMA_URL=$(ask "Ollama base URL" "http://localhost:11434")
      AI_API_KEY="ollama"
      EXTRA_ENV="OLLAMA_BASE_URL=${OLLAMA_URL}"
      ;;
    5)
      AI_PROVIDER="ollama-cloud"
      AI_MODEL=$(ask "Ollama Cloud model" "llama3.3")
      echo ""
      echo "  Get your key at: https://ollama.com (free tier available)"
      OLLAMA_CLOUD_KEY=$(ask_secret "Ollama Cloud API Key")
      AI_API_KEY="$OLLAMA_CLOUD_KEY"
      EXTRA_ENV="OLLAMA_CLOUD_API_KEY=${OLLAMA_CLOUD_KEY}"
      ;;
    *)
      AI_PROVIDER="anthropic"; AI_MODEL="claude-opus-4-7"
      warn "Invalid choice — defaulting to Anthropic. Configure in the portal after install."
      ;;
  esac

  ok "AI Provider: $AI_PROVIDER / Model: $AI_MODEL"

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
ORCHESTRATOR_NAME=Master Orchestrator
WORKER_AGENTS_COUNT=3
MAX_CONCURRENT_TASKS=10

# Discord
ENABLE_DISCORD=${ENABLE_DISCORD}
DISCORD_BOT_TOKEN=${DISCORD_TOKEN}
DISCORD_COMMAND_PREFIX=!
DISCORD_STATUS=AI Agent | !help

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
  install -m 644 /tmp/aiagentassistant-portal.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable aiagentassistant aiagentassistant-portal
  ok "Systemd services installed and enabled"

  # Cleanup temp service files
  rm -f /tmp/aiagent-sudoers-install /tmp/aiagentassistant.service /tmp/aiagentassistant-portal.service
}

# ─── Phase 6: Portal Admin Setup ─────────────────────────────────────────────

setup_portal() {
  step 6 "Configuring admin portal"

  # JWT secret
  local jwt_secret
  jwt_secret=$(openssl rand -base64 48)
  echo "$jwt_secret" > "$PORTAL_DIR/.jwt_secret"
  chmod 600 "$PORTAL_DIR/.jwt_secret"
  ok "JWT secret generated"

  # Initial admin password
  ADMIN_PASS=$(openssl rand -base64 12 | tr -d '+/=\n' | head -c 16)

  PORTAL_DATA_DIR="$PORTAL_DIR" node "$PORTAL_DIR/setup.js" \
    --username admin \
    --password "$ADMIN_PASS" 2>&1 | sed 's/^/  /'

  ok "Admin user created (username: admin)"
}

# ─── Phase 7: Start & Verify ─────────────────────────────────────────────────

start_services() {
  step 7 "Starting services"

  systemctl start aiagentassistant-portal
  sleep 2
  systemctl start aiagentassistant
  sleep 4

  local portal_ok=false agent_ok=false

  if systemctl is-active --quiet aiagentassistant-portal; then
    ok "Admin Portal   : ${GREEN}running${NC} on port 8085"
    portal_ok=true
  else
    warn "Admin Portal   : not running — check: journalctl -u aiagentassistant-portal -n 30"
  fi

  if systemctl is-active --quiet aiagentassistant; then
    ok "AI Agent       : ${GREEN}running${NC} on port 3000"
    agent_ok=true
  else
    warn "AI Agent       : not running — check: journalctl -u aiagentassistant -n 30"
  fi

  $portal_ok || $agent_ok || true
}

# ─── Phase 8: Summary ────────────────────────────────────────────────────────

summary() {
  local ip
  ip=$(server_ip)

  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${GREEN}║       ✅  Installation Complete!                          ║${NC}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${BOLD}Admin Portal${NC}"
  echo -e "  ┌─────────────────────────────────────────────────────┐"
  echo -e "  │  URL:       ${CYAN}http://${ip}:8085${NC}"
  echo -e "  │  Username:  ${BOLD}admin${NC}"
  echo -e "  │  Password:  ${BOLD}${ADMIN_PASS}${NC}"
  echo -e "  └─────────────────────────────────────────────────────┘"
  echo ""
  echo -e "  ${BOLD}Next Steps:${NC}"
  echo -e "  1. Open the Admin Portal in your browser"
  echo -e "  2. Login and go to ${BOLD}Settings → AI Provider${NC} to verify keys"
  echo -e "  3. Add server credentials under ${BOLD}Credentials${NC}"
  echo -e "  4. Talk to your AI Agent on Telegram!"
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

ADMIN_PASS=""

main() {
  preflight
  install_deps
  setup_dirs
  download_build
  configure
  install_system_config
  setup_portal
  start_services
  summary
}

main "$@"
