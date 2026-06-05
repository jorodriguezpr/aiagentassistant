import * as fs from 'fs';
import { CONFIG } from '../config';

// Returns active (uncommented) key→value map
export function readEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(CONFIG.AGENT_ENV_PATH, 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match) result[match[1]] = match[2].trim();
    }
  } catch {}
  return result;
}

// Update specific keys in .env preserving all other lines (comments, blanks, order)
// Empty string value → comments out the key. Non-empty → activates/updates it.
export function writeEnv(updates: Record<string, string>): void {
  const raw = fs.readFileSync(CONFIG.AGENT_ENV_PATH, 'utf8');
  const lines = raw.split('\n');
  const handled = new Set<string>();

  const newLines = lines.map(line => {
    // Match active key
    const active = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (active && active[1] in updates) {
      handled.add(active[1]);
      const val = updates[active[1]];
      return val === '' ? `#${active[1]}=` : `${active[1]}=${val}`;
    }
    // Match commented key
    const commented = line.match(/^#\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (commented && commented[1] in updates) {
      handled.add(commented[1]);
      const val = updates[commented[1]];
      return val === '' ? line : `${commented[1]}=${val}`;
    }
    return line;
  });

  // Append any keys that weren't in the file at all
  for (const [key, val] of Object.entries(updates)) {
    if (!handled.has(key) && val !== '') {
      newLines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(CONFIG.AGENT_ENV_PATH, newLines.join('\n'));
}

// Schema definition for the UI — defines tabs, fields, types
export const ENV_SCHEMA = [
  {
    id: 'ai',
    label: 'AI Provider',
    icon: 'bi-cpu',
    fields: [
      { key: 'AI_PROVIDER', label: 'Provider', type: 'select', options: ['ollama', 'ollama-cloud', 'anthropic', 'openai', 'github-copilot', 'lemonade', 'gemini'], description: 'Which AI provider to use' },
      { key: 'AI_MODEL',    label: 'Model',    type: 'text',   description: 'Model name (depends on provider)' },
      { key: 'AI_MAX_TOKENS',   label: 'Max Tokens',   type: 'number', description: 'Max tokens per response' },
      { key: 'AI_TEMPERATURE',  label: 'Temperature',  type: 'number', description: '0.0–1.0 creativity level' },
      { key: 'ANTHROPIC_API_KEY',    label: 'Anthropic API Key',    type: 'password', description: 'claude-* models' },
      { key: 'OPENAI_API_KEY',       label: 'OpenAI API Key',       type: 'password', description: 'gpt-* and o-series models' },
      { key: 'OLLAMA_BASE_URL',      label: 'Ollama Base URL',      type: 'text',     description: 'Local Ollama URL (default: http://172.27.112.1:11434)' },
      { key: 'OLLAMA_CLOUD_API_KEY', label: 'Ollama Cloud API Key', type: 'password', description: 'Ollama Cloud key' },
      { key: 'AI_API_KEY',           label: 'GitHub Copilot Key',   type: 'password', description: 'For github-copilot provider' },
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'bi-telegram',
    fields: [
      { key: 'TELEGRAM_BOT_TOKEN',    label: 'Bot Token',    type: 'password', description: 'From @BotFather' },
      { key: 'TELEGRAM_WEBHOOK_URL',  label: 'Webhook URL',  type: 'text',     description: 'Public URL for webhook' },
      { key: 'TELEGRAM_WEBHOOK_PORT', label: 'Webhook Port', type: 'number',   description: 'Port the webhook listens on' },
    ],
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: 'bi-discord',
    fields: [
      { key: 'ENABLE_DISCORD',        label: 'Enable Discord',   type: 'boolean', description: '' },
      { key: 'DISCORD_BOT_TOKEN',     label: 'Bot Token',        type: 'password', description: 'Discord bot token' },
      { key: 'DISCORD_COMMAND_PREFIX', label: 'Command Prefix',  type: 'text',    description: 'Prefix for commands (e.g. !)' },
      { key: 'DISCORD_STATUS',        label: 'Bot Status',       type: 'text',    description: 'Status text shown in Discord' },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'bi-whatsapp',
    fields: [
      { key: 'ENABLE_WHATSAPP',       label: 'Enable WhatsApp',  type: 'boolean', description: '' },
      { key: 'WHATSAPP_SESSION_NAME', label: 'Session Name',     type: 'text',    description: 'WhatsApp session identifier' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: 'bi-gear',
    fields: [
      { key: 'LOG_LEVEL',   label: 'Log Level',   type: 'select', options: ['debug', 'info', 'warn', 'error'], description: '' },
      { key: 'NODE_ENV',    label: 'Environment', type: 'select', options: ['development', 'production'],       description: '' },
      { key: 'API_PORT',    label: 'API Port',    type: 'number', description: 'Main orchestrator HTTP port' },
      { key: 'API_HOST',    label: 'API Host',    type: 'text',   description: '' },
      { key: 'REDIS_URL',   label: 'Redis URL',   type: 'text',   description: '' },
      { key: 'ENABLE_AUTO_TOOL_INSTALLATION', label: 'Auto Tool Install', type: 'boolean', description: 'Auto-install missing tools (sshpass, etc.)' },
    ],
  },
  {
    id: 'agent',
    label: 'Agent',
    icon: 'bi-diagram-3',
    fields: [
      { key: 'ORCHESTRATOR_ID',       label: 'Orchestrator ID',         type: 'text',   description: '' },
      { key: 'ORCHESTRATOR_NAME',     label: 'Orchestrator Name',       type: 'text',   description: '' },
      { key: 'WORKER_AGENTS_COUNT',   label: 'Worker Agent Count',      type: 'number', description: '' },
      { key: 'MAX_CONCURRENT_TASKS',  label: 'Max Concurrent Tasks',    type: 'number', description: '' },
    ],
  },
];
