#!/bin/bash
#
# AI Agent Assistant (AiAgentAssistant)
# Startup wrapper — loads credentials from kernel keyring before Node.js.
# Falls back gracefully to .env file if keyring is unavailable.
#
# @author Jose Rodriguez Arroyo
# @email jrpcone@gmail.com
# @github https://github.com/jorodriguezpr/
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
KEYRING_HELPER="$SCRIPT_DIR/keyring-helper.sh"

echo "🔐 Loading credentials from kernel keyring..."

get_credential() {
    local key="$1"
    local value
    if value=$("$KEYRING_HELPER" get "$key" 2>/dev/null); then
        echo "$value"
        return 0
    fi
    return 1
}

export_credential() {
    local key="$1"
    local value
    if value=$(get_credential "$key"); then
        export "$key=$value"
        echo "  ✅ Loaded: $key"
    else
        echo "  ⚠️  Not found in keyring: $key (will use .env)"
    fi
}

export_credential "TELEGRAM_BOT_TOKEN"
export_credential "AI_API_KEY"
export_credential "GITHUB_COPILOT_API_KEY"
export_credential "ANTHROPIC_API_KEY"
export_credential "OLLAMA_CLOUD_API_KEY"
export_credential "EMAIL_PASSWORD"
export_credential "SMTP_PASSWORD"
export_credential "DISCORD_BOT_TOKEN"

# Load .env file (non-keyring settings + fallback for any keys not in keyring)
if [ -f "$APP_DIR/.env" ]; then
    echo "📄 Loading .env file..."
    set -a
    source "$APP_DIR/.env"
    set +a
    echo "  ✅ Environment loaded from .env"
fi

echo "🚀 Starting AI Agent Assistant..."
cd "$APP_DIR"
exec node dist/index.js
