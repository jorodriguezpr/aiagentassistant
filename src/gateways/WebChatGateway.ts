/**
 * AI Agent Assistant - Web Chat Gateway
 * Exposes the same AI loop as TelegramGateway via HTTP/SSE for the admin portal.
 */

import { Router, Request, Response } from 'express';
import { AIProvider, ChatMessage, AITool } from '../utils/AIProvider';
import { AIToolExecutor, AI_TOOLS as TOOL_DEFINITIONS } from '../utils/AITools';
import { getCredentialManager } from '../utils/CredentialManager';
import RequestAnalyzer from '../utils/RequestAnalyzer.js';
import { listScheduledTasksSkill } from '../skills/SchedulingSkills';
import { getExperienceKB } from '../knowledge/ExperienceKnowledgeBase';
import { parseSteps, createScript, getScript, listScripts, deleteScript } from '../utils/NLScriptManager.js';
import { DagPlan, PlanStep, StepStatus, validatePlanDag } from '../core/PlanExecutor';
import { saveCheckpoint } from '../utils/TaskCheckpoint';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { describeToolCall } from '../utils/toolDescription';

// ─── Re-use sanitisers from TelegramGateway ────────────────────────────────

const NETWORK_TOOLS_WHITELIST = [
  'dns_lookup','reverse_dns_lookup','ping_host','port_check','get_public_ip',
  'traceroute','whois_lookup','geoip_lookup','open_ports_scan','active_connections',
  'network_statistics','arp_table','list_network_interfaces',
  'ssh_login','ssh_add_key','execute_remote_command','upload_file','download_file',
  'run_playbook','check_remote_progress','get_credential',
  'it_knowledge_search','it_knowledge_get','it_knowledge_list','it_knowledge_stats',
  'it_knowledge_create','it_knowledge_add_step','it_knowledge_mark_result',
  'execute_command',
];

function sanitizeText(text: string, toolName?: string): string {
  if (!text) return text;
  if (!toolName || !NETWORK_TOOLS_WHITELIST.includes(toolName)) {
    text = text.replace(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, '[REDACTED_IP]');
  }
  text = text.replace(/(["']?password["']?\s*[:=]\s*["'])[^"']+(["'])/gi, '$1[REDACTED]$2');
  text = text.replace(/(["']?\w*[Kk]ey[Pp]ath?["']?\s*[:=]\s*["'])[^"']+(["'])/gi, '$1[REDACTED]$2');
  text = text.replace(/ssh-rsa\s+[A-Za-z0-9+/=]+/g, 'ssh-rsa [REDACTED]');
  return text;
}

function sanitizeToolCalls(toolCalls: any[]): any[] {
  if (!toolCalls) return toolCalls;
  return toolCalls.map(tc => {
    const s = { ...tc };
    if (s.function?.arguments) {
      try {
        const args = JSON.parse(s.function.arguments);
        if (args.password) args.password = '[REDACTED]';
        if (args.keyPath) args.keyPath = '[REDACTED]';
        if (args.publicKeyPath) args.publicKeyPath = '[REDACTED]';
        s.function.arguments = JSON.stringify(args);
      } catch { s.function.arguments = sanitizeText(s.function.arguments); }
    }
    return s;
  });
}

function sanitizeToolDefs(tools: AITool[]): AITool[] {
  if (!tools) return tools;
  return tools.map(t => JSON.parse(JSON.stringify(t)));
}

// ─── Plan detection ─────────────────────────────────────────────────────────

function detectPlan(text: string): DagPlan | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*?"(?:steps|plan)"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[0]);
    if (Array.isArray(data.steps) && data.steps.length >= 2) {
      const steps: PlanStep[] = data.steps.map((s: any, i: number) => ({
        id: String(s.id ?? `s${i + 1}`),
        description: String(s.description ?? s),
        dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(String) : [],
        status: 'pending' as StepStatus,
      }));
      if (validatePlanDag(steps)) return null;
      return { steps, risks: Array.isArray(data.risks) ? data.risks : [] };
    }
    if (Array.isArray(data.plan) && data.plan.length >= 2) {
      const steps: PlanStep[] = data.plan.map((desc: string, i: number) => ({
        id: `s${i + 1}`, description: String(desc),
        dependsOn: i > 0 ? [`s${i}`] : [], status: 'pending' as StepStatus,
      }));
      return { steps, risks: Array.isArray(data.risks) ? data.risks : [] };
    }
  } catch { /* not JSON */ }
  return null;
}

// ─── Destructive op detection ────────────────────────────────────────────────

function isDestructiveToolCall(toolName: string, args: any): string | null {
  const DESTRUCTIVE = new Set(['delete_pdf', 'delcred']);
  if (DESTRUCTIVE.has(toolName)) return `\`${toolName}\`(${JSON.stringify(args).substring(0, 80)})`;
  if (toolName === 'execute_command' || toolName === 'execute_remote_command') {
    const cmd = String(args.command || args.cmd || '');
    const patterns: Array<[RegExp, string]> = [
      [/rm\s+-[a-z]*r[a-z]*f\b/i, 'recursive force-delete'],
      [/rm\s+-[a-z]*f[a-z]*r\b/i, 'recursive force-delete'],
      [/systemctl\s+stop\b/i,      'service stop'],
      [/systemctl\s+disable\b/i,   'service disable'],
      [/DROP\s+TABLE/i,            'SQL DROP TABLE'],
      [/DROP\s+DATABASE/i,         'SQL DROP DATABASE'],
      [/TRUNCATE\s+TABLE/i,        'SQL TRUNCATE TABLE'],
      [/iptables.*-D\b/i,          'firewall rule delete'],
      [/iptables.*-F\b/i,          'firewall flush'],
      [/\bmkfs\b/,                 'filesystem format'],
      [/\bdd\s+if=/,               'raw disk write'],
      [/\bfdisk\b/,                'partition editor'],
      [/shutdown\s/i,              'system shutdown'],
      [/\breboot\b/i,              'system reboot'],
      [/\binit\s+[06]\b/,          'system halt/reboot'],
    ];
    for (const [pat, label] of patterns) {
      if (pat.test(cmd)) {
        const host = args.host ? ` on ${args.host}` : '';
        return `${label}${host}: \`${cmd.substring(0, 200)}\``;
      }
    }
  }
  return null;
}

// ─── SSE helper ─────────────────────────────────────────────────────────────

interface SseClient {
  res: Response;
  sessionId: string;
}

function sseWrite(res: Response, data: object): void {
  try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
}

// ─── Session ─────────────────────────────────────────────────────────────────

interface WebChatSession {
  sessionId: string;
  history: ChatMessage[];
  abort: AbortController;
  sseClients: Set<SseClient>;
  pendingApprovals: Map<string, (approved: boolean) => void>;
  pendingNLScript?: { name: string; description?: string };
  pendingPlaybookImport?: boolean;
  lastActivity: number;
}

// ─── System prompt (identical to TelegramGateway) ───────────────────────────

const SYSTEM_PROMPT = `You are an autonomous agentic AI assistant. You MUST complete every task fully — never stop mid-task.

⚡ AGENTIC EXECUTION RULES (HIGHEST PRIORITY — override everything else):
1. NEVER send a text response to the user until the ENTIRE task is 100% complete and verified
2. After EVERY tool result, immediately call the NEXT required tool — never pause to narrate
3. If a tool fails, immediately try an alternative approach — NEVER give up after one failure
4. Do NOT say "Let me now do X" and then stop — actually DO X by calling the tool
5. Do NOT say "I'll check X" — check it NOW with a tool call in this same response
6. A task is complete only when you have confirmed success with actual tool output, not by assumption
7. If you are unsure what tool to call next, think silently and then call it — do not ask the user
8. Keep calling tools until the task is fully done, then send ONE clear summary to the user

🌐 WEB RESEARCH RULES (CRITICAL):
- For ANY web search, URL lookup, or website investigation: use web_search or fetch_web_content DIRECTLY
- NEVER use dispatch_task for web searches — dispatch_task does NOT return search results
- NEVER call dispatch_task with action "search_web" or "get_task_result" — these skills do not exist
- Pattern: web_search(query) → fetch_web_content(url) → report findings

📋 PLAN-FIRST PROTOCOL (for multi-step tasks):
- If a task will require MORE than 2 tool calls, output ONLY a JSON plan first (no tool calls yet):
  {
    "steps": [
      {"id": "s1", "description": "describe action", "dependsOn": []},
      {"id": "s2", "description": "describe action", "dependsOn": ["s1"]},
      {"id": "s3", "description": "independent action that can run alongside s2", "dependsOn": ["s1"]}
    ],
    "risks": ["possible risk"]
  }
- Use "dependsOn" to express real ordering constraints. Steps with no dependsOn run in PARALLEL with other no-dependency steps.
- Then STOP and wait for approval before calling any tools
- Once approved you will receive [PLAN_APPROVED] — proceed to execute the steps in order
- For simple 1-2 tool tasks (e.g. "check disk space", "send an email"), skip the plan and act directly
- Do NOT include a plan for tasks where you will use the knowledge base playbook (run_playbook handles planning)

You are a helpful AI assistant with access to various tools for system administration, file operations, and information gathering. You have an internal self-learning knowledge base that grows with every successful operation.

🧠 KNOWLEDGE-FIRST APPROACH (CRITICAL - always follow this):
1. For ANY IT/sysadmin task (install, configure, troubleshoot, etc.) call it_knowledge_search FIRST
2. If relevant playbooks are found (relevanceScore > 40%), follow those steps — they come from past successful operations
3. If no knowledge is found, proceed using your training and external AI capabilities
4. During multi-step tasks (installations, configurations), ALWAYS:
   a. Call it_knowledge_start_session at the beginning to track commands
   b. Call it_knowledge_record_command after each remote command execution
   c. If the task SUCCEEDS: call it_knowledge_commit_session to save the playbook
   d. If the task FAILS: call it_knowledge_discard_session

📚 LEARNING PROTOCOL for remote server tasks:
- Start every installation/configuration with: it_knowledge_start_session
- After EVERY execute_remote_command call: record it with it_knowledge_record_command
- When the full task succeeds: commit with it_knowledge_commit_session
- This ensures future identical tasks are executed without external AI queries

Available capabilities:
- Internal knowledge base (it_knowledge_*) - experience from past successful operations
- System commands for managing services and processes
- File read/write operations
- Credential storage (passwords, SSH keys, API tokens stored securely)
- Email sending (use send_email tool, not system mail commands)
- Web searches and content fetching
- PDF document generation
- Task scheduling
- Remote server management

For credential operations:
- Use get_credential to retrieve stored passwords, API keys, or SSH keys from secure storage
- Passwords and credentials are already stored — try multiple key formats if one fails
- Try these key formats in order: "username@hostname", then "hostname"
- Examples: If first key "technologixpr.com" fails, try "root@technologixpr.com"
- CRITICAL — YOU CANNOT SAVE CREDENTIALS: You do NOT have access to set_credential. AI models normalize and lowercase text, which corrupts passwords. If the user asks you to save a credential, reply: "Please type: /savecred <key> <value> — I cannot save credentials because I may alter the case of the password."

🎛️ CONTROL PANEL DETECTION (CRITICAL — follow exactly):
- To detect which control panel is installed on a server, call **control_panel_status(host)** — ONE call, done.
- NEVER manually check panels with multiple execute_remote_command calls. control_panel_status detects all panels (cPanel, CWP, Plesk, DirectAdmin, ISPConfig, Webmin, HestiaCP, KloxoNG, CyberPanel, aaPanel, Froxlor) in a single SSH round-trip and returns the name, version, and admin URL.
- It auto-loads the vault password — you do not need to call get_credential first.

📋 BRIEF PLAN (REQUIRED before any SSH work):
- Before executing ANY SSH or remote server task, output a single plain-text line starting with "**Plan:**" that lists what you will do in 2-4 steps. Example: "**Plan:** 1. Connect to server 2. Detect control panel 3. Report findings". Then immediately proceed — no approval needed.

For remote server operations:
⚠️ CRITICAL — SSH TOOL RULES (read carefully):
- **execute_remote_command** is the ONLY tool that runs a command on a remote server. Use it directly.
- **ssh_login** only TESTS connectivity (adds a key or verifies the host is reachable). It does NOT hold an open shell session. After ssh_login returns, there is NO active remote session — any execute_command after it runs LOCALLY on this machine, NOT on the remote server.
- **execute_command** ALWAYS runs on the LOCAL machine. NEVER use it to run commands on a remote server.
- To run a command on a remote server: call execute_remote_command(host, command, username, password or keyPath)
- Do NOT call ssh_login first and then execute_command — that is wrong and will run the command locally.

🔑 SSH AUTHENTICATION — USE EXACTLY WHAT THE USER SPECIFIES:
- If the user says "use the vault password" or "use password": call get_credential("root@HOST") or get_credential("HOST") to retrieve it, then pass it as the 'password' parameter to execute_remote_command. Do NOT try SSH key first — use password directly.
- If the user provides a keyPath or says "use SSH key": pass keyPath to execute_remote_command. Do NOT try password.
- If the user says nothing about auth method: use keyPath="/opt/aiagentassistant/.ssh/id_rsa" for known managed servers.

Known server mappings (key is pre-installed):
- technologixpr.com, s1.technologixpr.com, 192.254.73.46 → same server → keyPath="/opt/aiagentassistant/.ssh/id_rsa", username=root
- **NEVER ASK FOR SSH KEY PATH** - it is already set up and working

CRITICAL — INSTALLATION TASKS MUST USE THE KNOWLEDGE BASE PLAYBOOK:
- For ANY software installation (ISPConfig, cPanel, Plesk, DirectAdmin, Webmin, HestiaCP, etc.):
  1. ALWAYS call it_knowledge_search FIRST with the software name
  2. If a playbook is found (relevanceScore > 0.3), call run_playbook immediately — DO NOT improvise commands
  3. The playbook has VERIFIED, WORKING commands — your training data may have outdated or wrong URLs
  4. NEVER skip run_playbook to try your own installation approach — it will fail
- ISPConfig FACTS (your training data has wrong URLs — use these instead):
  - Correct autoinstaller URL: https://get.ispconfig.org (NOT /ispconfig3_install/auto_installer.sh — that returns 404)
  - Correct install command: wget -O - https://get.ispconfig.org | sh -s -- --use-ftp-ports=40110-40210 --unattended-upgrades
  - NEVER use: https://www.ispconfig.org/ispconfig3_install/ (always 404)

For email operations:
- Use send_email tool with recipient, subject, and body
- Use read_emails to check messages
- Use list_email_accounts to see configured accounts

For web research:
- Use web_search to find information
- Use fetch_web_content to get page content

For PDF generation:
- generate_text_pdf for plain text
- generate_html_pdf for HTML content
- generate_report_pdf for structured reports

For task scheduling:
- Use create_scheduled_task to schedule recurring automation
- Schedule formats: "every 30 minutes", "hourly", "daily", "daily at 3pm", "weekly", or cron expressions
- Task types: 'email' (send scheduled emails) or 'command' (execute commands)

🔁 TYPED ERROR RECOVERY (tool results may include errorType):
- errorType: TRANSIENT   → retry: true  — retry the SAME tool call immediately
- errorType: STATE       → retry: true  — wait retryDelaySecs seconds, then retry the SAME tool call
- errorType: PERMISSION  → retry: false — do NOT retry; explain to user why it failed and what access is needed
- errorType: NOT_FOUND   → retry: false — do NOT retry same call; check prerequisites or try alternative approach
- errorType: FATAL       → retry: false — stop immediately and report to user with full error details

CRITICAL - Error Handling and Approval:
- ONLY report errors when tools actually fail with error messages
- If a tool succeeds, report the success - do NOT present hypothetical problems
- Do NOT ask "What would you like to do?" after successful tool calls
- Do NOT ask for approval unless the action is destructive (delete, remove, shutdown) or truly uncertain
- When a connection succeeds, report the results - do NOT say "encountering issues"
- Execute commands directly - users expect immediate action, not approval requests
- Only present multi-step plans for approval if they involve multiple servers or critical changes
- **NEVER ask for SSH key path for technologixpr.com - it is already configured**

CRITICAL - Task Independence:
- **Each task MUST execute independently without referencing previous tasks**
- Do NOT number responses as "Part 1", "Part 2", "Part 3", etc.
- Do NOT mention previous tasks or continue from earlier context
- Treat every user request as a fresh, standalone task

Be helpful and efficient. Use appropriate tools to complete requests. Provide clear feedback about actions taken.`;

// ─── WebChatGateway ───────────────────────────────────────────────────────────

export class WebChatGateway {
  private sessions = new Map<string, WebChatSession>();
  private aiProvider: AIProvider | null;
  private toolExecutor: AIToolExecutor;
  private requestAnalyzer: RequestAnalyzer;
  private aiTools: AITool[];
  private router: Router;

  constructor(orchestrator: any, aiProvider: AIProvider | null) {
    this.aiProvider = aiProvider;
    this.toolExecutor = new AIToolExecutor(orchestrator, aiProvider);
    this.requestAnalyzer = new RequestAnalyzer();
    this.aiTools = TOOL_DEFINITIONS.map(tool => ({
      type: 'function' as const,
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
    this.router = Router();
    this.setupRoutes();

    // Clean up stale sessions every 30 min
    setInterval(() => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [id, session] of this.sessions) {
        if (session.lastActivity < cutoff && session.sseClients.size === 0) {
          this.sessions.delete(id);
        }
      }
    }, 30 * 60 * 1000);
  }

  getRouter(): Router { return this.router; }

  // ─── SSE broadcast ───────────────────────────────────────────────────────

  private broadcast(session: WebChatSession, data: object): void {
    for (const client of session.sseClients) {
      sseWrite(client.res, data);
    }
  }

  // ─── Approval request (HITL) ─────────────────────────────────────────────

  private async requestApproval(session: WebChatSession, opId: string, description: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const timeout = setTimeout(() => {
        session.pendingApprovals.delete(opId);
        resolve(false);
      }, 5 * 60 * 1000);

      session.pendingApprovals.set(opId, (approved) => {
        clearTimeout(timeout);
        session.pendingApprovals.delete(opId);
        resolve(approved);
      });

      this.broadcast(session, { type: 'hitl', opId, description });
    });
  }

  // ─── Validate history ────────────────────────────────────────────────────

  private validateHistory(history: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];
    const seenToolCallIds = new Set<string>();
    for (const msg of history) {
      if (msg.role === 'tool' && msg.tool_call_id) {
        if (seenToolCallIds.has(msg.tool_call_id)) continue;
        seenToolCallIds.add(msg.tool_call_id);
      }
      result.push(msg);
    }
    return result;
  }

  private estimateTokens(history: ChatMessage[]): number {
    return history.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0) / 4, 0);
  }

  // ─── Slash command handler ────────────────────────────────────────────────

  private async handleCommand(session: WebChatSession, text: string): Promise<boolean> {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case '/clear': {
        session.history = [];
        this.broadcast(session, { type: 'system', content: '🗑️ Conversation history cleared.' });
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/cancel': {
        if (session.abort) {
          session.abort.abort();
          session.abort = new AbortController();
        }
        this.broadcast(session, { type: 'system', content: '🛑 Task cancelled.' });
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/status': {
        const toolCalls = session.history.filter(m => m.role === 'tool').length;
        const msg = [
          `📊 **Session Status**`,
          `• Messages: ${session.history.length}`,
          `• Tool calls: ${toolCalls}`,
          `• Provider: ${this.aiProvider?.getConfig().provider ?? 'none'}`,
          `• Model: ${this.aiProvider?.getConfig().model ?? 'none'}`,
        ].join('\n');
        this.broadcast(session, { type: 'system', content: msg });
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/savecred': {
        const key = parts[1];
        const value = parts.slice(2).join(' ');
        if (!key || !value) {
          this.broadcast(session, { type: 'system', content: '❌ Usage: /savecred <key> <value>' });
          this.broadcast(session, { type: 'done' });
          return true;
        }
        try {
          const cm = getCredentialManager();
          await cm.setCredential(key, value);
          this.broadcast(session, { type: 'system', content: `✅ Credential saved: \`${key}\`` });
        } catch (e: any) {
          this.broadcast(session, { type: 'system', content: `❌ Failed: ${e.message}` });
        }
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/getcred': {
        const key = parts[1];
        if (!key) {
          this.broadcast(session, { type: 'system', content: '❌ Usage: /getcred <key>' });
          this.broadcast(session, { type: 'done' });
          return true;
        }
        try {
          const cm = getCredentialManager();
          const val = await cm.getCredential(key);
          if (val) {
            this.broadcast(session, { type: 'system', content: `🔑 \`${key}\` = \`${val}\`` });
          } else {
            this.broadcast(session, { type: 'system', content: `❌ Credential not found: \`${key}\`` });
          }
        } catch (e: any) {
          this.broadcast(session, { type: 'system', content: `❌ Failed: ${e.message}` });
        }
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/delcred': {
        const key = parts[1];
        if (!key) {
          this.broadcast(session, { type: 'system', content: '❌ Usage: /delcred <key>' });
          this.broadcast(session, { type: 'done' });
          return true;
        }
        try {
          const cm = getCredentialManager();
          await cm.deleteCredential(key);
          this.broadcast(session, { type: 'system', content: `✅ Credential deleted: \`${key}\`` });
        } catch (e: any) {
          this.broadcast(session, { type: 'system', content: `❌ Failed: ${e.message}` });
        }
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/listnlscripts': {
        try {
          const scripts = listScripts();
          if (!scripts.length) {
            this.broadcast(session, { type: 'system', content: '📝 No NL scripts saved.' });
          } else {
            const list = scripts.map((s: any) => `• **${s.name}**: ${s.description || '(no description)'}`).join('\n');
            this.broadcast(session, { type: 'system', content: `📝 **NL Scripts (${scripts.length}):**\n${list}` });
          }
        } catch (e: any) {
          this.broadcast(session, { type: 'system', content: `❌ ${e.message}` });
        }
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/savenlscript': {
        const name = parts.slice(1).join(' ');
        if (!name) {
          this.broadcast(session, { type: 'system', content: '❌ Usage: /savenlscript <name>\nThen send the script steps.' });
          this.broadcast(session, { type: 'done' });
          return true;
        }
        session.pendingNLScript = { name };
        this.broadcast(session, { type: 'system', content: `📝 Send the steps for script **"${name}"** (one per line):` });
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/deletenlscript': {
        const name = parts.slice(1).join(' ');
        if (!name) {
          this.broadcast(session, { type: 'system', content: '❌ Usage: /deletenlscript <name>' });
          this.broadcast(session, { type: 'done' });
          return true;
        }
        try {
          deleteScript(name);
          this.broadcast(session, { type: 'system', content: `✅ NL script deleted: "${name}"` });
        } catch (e: any) {
          this.broadcast(session, { type: 'system', content: `❌ ${e.message}` });
        }
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/scheduled': {
        try {
          const result = await listScheduledTasksSkill.execute();
          if (!result.success || !result.tasks.length) {
            this.broadcast(session, { type: 'system', content: '📅 No scheduled tasks.' });
          } else {
            const list = result.tasks.map((t: any) =>
              `• **${t.name}** — ${t.schedule} — ${t.enabled ? '✅ Active' : '⏸️ Paused'}`
            ).join('\n');
            this.broadcast(session, { type: 'system', content: `📅 **Scheduled Tasks:**\n${list}` });
          }
        } catch (e: any) {
          this.broadcast(session, { type: 'system', content: `❌ ${e.message}` });
        }
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/help': {
        const helpText = [
          '**Available Commands:**',
          '/clear — wipe conversation history',
          '/cancel — stop running AI task',
          '/status — show session info',
          '/savecred <key> <value> — save credential',
          '/getcred <key> — retrieve credential',
          '/delcred <key> — delete credential',
          '/savenlscript <name> — start saving an NL script',
          '/listnlscripts — list all NL scripts',
          '/deletenlscript <name> — delete an NL script',
          '/runnlscript <name> — run an NL script via AI',
          '/scheduled — list scheduled tasks',
          '/help — show this help',
        ].join('\n');
        this.broadcast(session, { type: 'system', content: helpText });
        this.broadcast(session, { type: 'done' });
        return true;
      }

      case '/runnlscript': {
        const name = parts.slice(1).join(' ');
        if (!name) {
          this.broadcast(session, { type: 'system', content: '❌ Usage: /runnlscript <name>' });
          this.broadcast(session, { type: 'done' });
          return true;
        }
        try {
          const script = getScript(name);
          if (!script) {
            this.broadcast(session, { type: 'system', content: `❌ Script not found: "${name}"` });
            this.broadcast(session, { type: 'done' });
            return true;
          }
          const prompt = `Execute this script named "${name}":\n${script.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`;
          // Fall through to AI with this synthesized prompt
          await this.runAILoop(session, prompt);
        } catch (e: any) {
          this.broadcast(session, { type: 'system', content: `❌ ${e.message}` });
          this.broadcast(session, { type: 'done' });
        }
        return true;
      }

      default:
        return false; // not a handled command
    }
  }

  // ─── Main AI loop ─────────────────────────────────────────────────────────

  private async runAILoop(session: WebChatSession, userMessage: string): Promise<void> {
    if (!this.aiProvider) {
      this.broadcast(session, { type: 'error', message: 'AI provider not configured.' });
      this.broadcast(session, { type: 'done' });
      return;
    }

    const history = session.history;

    // Init system prompt
    if (!history.length) {
      history.push({ role: 'system', content: SYSTEM_PROMPT });
    }

    // Add user message
    history.push({ role: 'user', content: userMessage });

    const abortSignal = session.abort.signal;
    let finalResponse = '';
    let planApproved = false;
    let taskId: string | null = null;
    let iteration = 0;
    let stepCounter = 0;
    const MAX_ITERATIONS = 240;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      if (abortSignal.aborted) {
        this.broadcast(session, { type: 'cancelled' });
        this.broadcast(session, { type: 'done' });
        return;
      }

      if (iteration >= MAX_ITERATIONS) {
        finalResponse = `⚠️ **Maximum iterations reached (${MAX_ITERATIONS} tool calls)**\n\n` +
          `Reply **"continue"** to allow ${MAX_ITERATIONS} more iterations, or **"stop"** to finish.`;
        history.push({ role: 'assistant', content: finalResponse });
        this.broadcast(session, { type: 'message', content: finalResponse });
        this.broadcast(session, { type: 'done' });
        return;
      }

      this.broadcast(session, { type: 'thinking' });

      // Context compression
      if (this.estimateTokens(history) > 50_000) {
        this.broadcast(session, { type: 'system', content: '🗜️ Context getting large — summarizing earlier steps...' });
        const sys = history.find(m => m.role === 'system')!;
        const recent = history.slice(-20);
        history.splice(0, history.length, sys, ...recent);
      }

      const validHistory = this.validateHistory(history);
      if (validHistory.length !== history.length) {
        history.splice(0, history.length, ...validHistory);
      }

      let response: any;
      const TRANSIENT = ['socket hang up', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'read ECONNRESET', 'write ECONNRESET'];
      let lastErr: any;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await this.aiProvider.chatCompletion(history, sanitizeToolDefs(this.aiTools));
          lastErr = null;
          break;
        } catch (e: any) {
          lastErr = e;
          const isTransient = TRANSIENT.some(t => (e.message || '').includes(t) || e.code === t);
          if (isTransient && attempt === 0) {
            this.broadcast(session, { type: 'system', content: '⚡ Network hiccup — retrying…' });
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          break;
        }
      }
      if (lastErr) {
        this.broadcast(session, { type: 'error', message: `AI error: ${lastErr.message}` });
        this.broadcast(session, { type: 'done' });
        return;
      }

      // Plan-first detection
      if (!planApproved && !response.toolCalls?.length && response.content) {
        const plan = detectPlan(response.content);
        if (plan) {
          history.push({ role: 'assistant', content: response.content });
          const opId = `plan_${session.sessionId}_${Date.now()}`;

          taskId = await saveCheckpoint({
            taskId: taskId ?? undefined,
            chatId: 0, userId: 0,
            originalMessage: userMessage,
            model: this.aiProvider.getConfig().model ?? 'unknown',
            history: [...history],
            toolCallCount: iteration,
            description: `[web-planning] ${plan.steps.slice(0, 2).map(s => s.description).join(' → ')}`,
            phase: 'planning',
            planApproved: false,
          }) ?? taskId;

          const approved = await this.requestApproval(session, opId,
            JSON.stringify({ steps: plan.steps, risks: plan.risks })
          );

          if (approved) {
            planApproved = true;
            history.push({ role: 'user', content: '[PLAN_APPROVED] Please proceed with executing the plan.' });
          } else {
            finalResponse = '❌ Plan not approved. Please provide updated instructions.';
            history.push({ role: 'assistant', content: finalResponse });
            this.broadcast(session, { type: 'message', content: finalResponse });
            this.broadcast(session, { type: 'done' });
            return;
          }
          continue;
        }
      }

      // Tool calls
      if (response.toolCalls?.length) {
        history.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: sanitizeToolCalls(response.toolCalls),
        });

        // Deduplicate
        const uniqueCalls = response.toolCalls.filter(
          (tc: any, idx: number, arr: any[]) => arr.findIndex((t: any) => t.id === tc.id) === idx
        );

        // HITL check
        const deniedIds = new Set<string>();
        const destructive: Array<{ id: string; desc: string }> = [];
        for (const tc of uniqueCalls) {
          let args: any;
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
          const desc = isDestructiveToolCall(tc.function.name, args);
          if (desc) destructive.push({ id: tc.id, desc });
        }
        if (destructive.length > 0) {
          const opId = `${session.sessionId}_${Date.now()}`;
          const summary = destructive.length === 1
            ? destructive[0].desc
            : `${destructive.length} destructive operations:\n${destructive.map(d => `• ${d.desc}`).join('\n')}`;
          const approved = await this.requestApproval(session, opId, summary);
          if (!approved) destructive.forEach(d => deniedIds.add(d.id));
        }

        // Execute tools in parallel
        const toolResults = await Promise.all(
          uniqueCalls.map(async (tc: any) => {
            let args: any;
            try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

            const stepNum = ++stepCounter;
            const stepText = describeToolCall(tc.function.name, args);

            if (deniedIds.has(tc.id)) {
              this.broadcast(session, { type: 'tool_call', name: tc.function.name, args, denied: true, stepNumber: stepNum, stepText: stepText + ' [denied]' });
              return {
                role: 'tool' as const,
                content: JSON.stringify({ success: false, error: 'HITL_DENIED: Operation denied by user.' }),
                tool_call_id: tc.id,
                name: tc.function.name,
              };
            }

            this.broadcast(session, { type: 'tool_call', name: tc.function.name, args, stepNumber: stepNum, stepText });

            try {
              const result = await this.toolExecutor.execute(tc.function.name, args);
              const sanitized = sanitizeText(JSON.stringify(result), tc.function.name);
              this.broadcast(session, { type: 'tool_result', name: tc.function.name, success: true, output: sanitized, stepNumber: stepNum });
              return {
                role: 'tool' as const,
                content: sanitized,
                tool_call_id: tc.id,
                name: tc.function.name,
              };
            } catch (e: any) {
              this.broadcast(session, { type: 'tool_result', name: tc.function.name, success: false, output: e.message, stepNumber: stepNum });
              return {
                role: 'tool' as const,
                content: JSON.stringify({ error: e.message }),
                tool_call_id: tc.id,
                name: tc.function.name,
              };
            }
          })
        );

        for (const r of toolResults) history.push(r);
        continue;
      }

      // Final text response
      finalResponse = response.content || '';
      history.push({ role: 'assistant', content: finalResponse });
      this.broadcast(session, { type: 'message', content: finalResponse });
      break;
    }

    this.broadcast(session, { type: 'done' });
  }

  // ─── Express routes ───────────────────────────────────────────────────────

  private setupRoutes(): void {
    // GET /api/webchat/stream/:sessionId — SSE connection
    this.router.get('/stream/:sessionId', (req: Request, res: Response) => {
      const { sessionId } = req.params;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      if (!this.sessions.has(sessionId)) {
        this.sessions.set(sessionId, {
          sessionId,
          history: [],
          abort: new AbortController(),
          sseClients: new Set(),
          pendingApprovals: new Map(),
          lastActivity: Date.now(),
        });
      }

      const session = this.sessions.get(sessionId)!;
      const client: SseClient = { res, sessionId };
      session.sseClients.add(client);

      // Send welcome on first connect
      sseWrite(res, { type: 'connected', sessionId });

      // Heartbeat — keeps nginx/proxies from closing idle SSE connections
      const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
      }, 25_000);

      req.on('close', () => {
        clearInterval(heartbeat);
        session.sseClients.delete(client);
      });
    });

    // POST /api/webchat/message — send a message
    this.router.post('/message', async (req: Request, res: Response) => {
      const { sessionId, text } = req.body;
      if (!sessionId || !text) {
        res.status(400).json({ error: 'sessionId and text are required' });
        return;
      }

      if (!this.sessions.has(sessionId)) {
        this.sessions.set(sessionId, {
          sessionId,
          history: [],
          abort: new AbortController(),
          sseClients: new Set(),
          pendingApprovals: new Map(),
          lastActivity: Date.now(),
        });
      }

      const session = this.sessions.get(sessionId)!;
      session.lastActivity = Date.now();

      res.json({ ok: true });

      // Handle pending NL script steps
      if (session.pendingNLScript) {
        const { name } = session.pendingNLScript;
        session.pendingNLScript = undefined;
        try {
          const steps = parseSteps(text);
          createScript(name, steps, '');
          this.broadcast(session, { type: 'system', content: `✅ NL script saved: "${name}" (${steps.length} steps)` });
        } catch (e: any) {
          this.broadcast(session, { type: 'system', content: `❌ Failed to save script: ${e.message}` });
        }
        this.broadcast(session, { type: 'done' });
        return;
      }

      // Handle slash commands
      if (text.trim().startsWith('/')) {
        const handled = await this.handleCommand(session, text.trim());
        if (handled) return;
      }

      // Run AI loop
      this.runAILoop(session, text).catch(e => {
        logger.error({ error: e.message }, 'WebChatGateway AI loop error');
        this.broadcast(session, { type: 'error', message: e.message });
        this.broadcast(session, { type: 'done' });
      });
    });

    // POST /api/webchat/approve — respond to HITL prompt
    this.router.post('/approve', (req: Request, res: Response) => {
      const { sessionId, opId, approved } = req.body;
      if (!sessionId || !opId) {
        res.status(400).json({ error: 'sessionId and opId are required' });
        return;
      }
      const session = this.sessions.get(sessionId);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      const resolver = session.pendingApprovals.get(opId);
      if (!resolver) { res.status(404).json({ error: 'Approval request not found or expired' }); return; }
      resolver(!!approved);
      res.json({ ok: true });
    });

    // POST /api/webchat/cancel/:sessionId — cancel active loop
    this.router.post('/cancel/:sessionId', (req: Request, res: Response) => {
      const session = this.sessions.get(req.params.sessionId);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      session.abort.abort();
      session.abort = new AbortController();
      res.json({ ok: true });
    });

    // DELETE /api/webchat/history/:sessionId — clear history
    this.router.delete('/history/:sessionId', (req: Request, res: Response) => {
      const session = this.sessions.get(req.params.sessionId);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      session.history = [];
      this.broadcast(session, { type: 'system', content: '🗑️ Conversation history cleared.' });
      res.json({ ok: true });
    });

    // GET /api/webchat/sessions — list active sessions
    this.router.get('/sessions', (_req: Request, res: Response) => {
      const list = Array.from(this.sessions.values()).map(s => ({
        sessionId: s.sessionId,
        messageCount: s.history.length,
        sseClients: s.sseClients.size,
        lastActivity: new Date(s.lastActivity).toISOString(),
      }));
      res.json(list);
    });
  }
}
