/**
 * AI Agent Assistant - Experience Knowledge Base
 * Self-learning IT/sysadmin knowledge engine
 *
 * Stores successful command sequences and installation playbooks.
 * When a user asks something, the orchestrator searches here first
 * before falling back to external AI providers.
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export enum PlaybookCategory {
  INSTALL    = 'install',
  CONFIGURE  = 'configure',
  TROUBLESHOOT = 'troubleshoot',
  MONITOR    = 'monitor',
  BACKUP     = 'backup',
  SECURITY   = 'security',
  NETWORK    = 'network',
  DATABASE   = 'database',
  WEBSERVER  = 'webserver',
  GENERAL    = 'general',
}

export interface PlaybookStep {
  stepNumber:     number;
  description:    string;
  command?:       string;   // exact shell/SSH command
  expectedOutput?: string;  // what a successful run looks like
  actualOutput?:  string;   // captured output from last run
  success:        boolean;
  durationMs?:    number;
  timestamp:      string;
}

export interface Playbook {
  id:             string;
  title:          string;
  description:    string;
  category:       PlaybookCategory;
  keywords:       string[];
  targetOS?:      string;   // 'ubuntu' | 'debian' | 'centos' | 'windows'
  targetService?: string;   // 'ispconfig' | 'nginx' | 'mysql' | 'apache'
  steps:          PlaybookStep[];
  successCount:   number;
  failureCount:   number;
  lastUsed?:      string;
  createdAt:      string;
  updatedAt:      string;
  notes?:         string;
  author?:        string;
  version:        number;
}

export interface CommandRecord {
  id:              string;
  command:         string;
  output:          string;
  exitCode:        number;  // 0 = success
  host?:           string;
  username?:       string;
  timestamp:       string;
  taskDescription?: string;
  durationMs?:     number;
  playbookId?:     string;  // set when captured into a playbook
}

export interface PlaybookSearchResult {
  playbook:        Playbook;
  relevanceScore:  number;    // 0–1
  matchedKeywords: string[];
}

export interface SessionBuffer {
  id:          string;
  startedAt:   string;
  host?:       string;
  commands:    CommandRecord[];
  description?: string;
}

// ─── Success/failure detection ────────────────────────────────────────────────

const SUCCESS_PATTERNS = [
  /installation\s+complete/i,
  /successfully\s+installed/i,
  /successfully\s+configured/i,
  /setup\s+complete/i,
  /service\s+started/i,
  /service\s+enabled/i,
  /configuration\s+(applied|saved|done)/i,
  /ispconfig\s+3?\s+has\s+been\s+installed/i,
  /installation\s+done/i,
  /\binstalled\b.*\bsuccessfully\b/i,
  /\[OK\]/,
  /Done\./,
];

const FAILURE_PATTERNS = [
  /error:/i,
  /fatal:/i,
  /command\s+not\s+found/i,
  /no\s+such\s+file/i,
  /permission\s+denied/i,
  /connection\s+(refused|timed\s+out)/i,
  /failed\s+to/i,
  /cannot\s+open/i,
  /unable\s+to/i,
];

function detectSuccess(output: string): boolean {
  return SUCCESS_PATTERNS.some(p => p.test(output));
}

function detectFailure(output: string): boolean {
  return FAILURE_PATTERNS.some(p => p.test(output));
}

// ─── ExperienceKnowledgeBase ──────────────────────────────────────────────────

export class ExperienceKnowledgeBase {
  private kbPath:         string;
  private historyPath:    string;
  private playbooks:      Map<string, Playbook>;
  private commandHistory: CommandRecord[];
  private keywordIndex:   Map<string, Set<string>>; // keyword → playbook IDs
  private activeSessions: Map<string, SessionBuffer>;

  constructor(kbPath?: string) {
    // Store data inside the app directory so it works regardless of which
    // user runs the service. __dirname resolves to dist/knowledge/ at runtime,
    // so ../../data lands at the app root (e.g. /opt/aiagentassistant/app/data).
    const baseDir = process.env.KB_DATA_DIR ||
      path.join(__dirname, '..', '..', 'data');
    this.kbPath      = kbPath || path.join(baseDir, 'experience-kb.json');
    this.historyPath = path.join(baseDir, 'command-history.json');

    this.playbooks      = new Map();
    this.commandHistory = [];
    this.keywordIndex   = new Map();
    this.activeSessions = new Map();

    this.load();

    logger.info({
      kbPath: this.kbPath,
      playbookCount: this.playbooks.size,
      commandCount:  this.commandHistory.length,
    }, 'ExperienceKnowledgeBase initialized');
  }

  // ─── Session management ──────────────────────────────────────────────────

  startSession(host?: string, description?: string): string {
    const id: string = `session_${Date.now()}`;
    this.activeSessions.set(id, {
      id,
      startedAt: new Date().toISOString(),
      host,
      commands:  [],
      description,
    });
    logger.info({ sessionId: id, host }, 'Knowledge session started');
    return id;
  }

  addCommandToSession(sessionId: string, record: Omit<CommandRecord, 'id' | 'timestamp'>): string {
    const session = this.activeSessions.get(sessionId);
    const full: CommandRecord = {
      id:        `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...record,
    };

    if (session) {
      session.commands.push(full);
    }

    // Always persist to global command history (last 1000)
    this.commandHistory.push(full);
    if (this.commandHistory.length > 1000) {
      this.commandHistory.shift();
    }
    this.saveHistory();

    return full.id;
  }

  /**
   * Commit an active session as a playbook when the task succeeds.
   */
  async commitSession(
    sessionId: string,
    opts: {
      title:         string;
      description:   string;
      category:      PlaybookCategory;
      keywords:      string[];
      targetOS?:     string;
      targetService?: string;
      notes?:        string;
      author?:       string;
    },
  ): Promise<string | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.commands.length === 0) {
      logger.warn({ sessionId }, 'Cannot commit empty or unknown session');
      return null;
    }

    const steps: PlaybookStep[] = session.commands.map((cmd, idx) => ({
      stepNumber:   idx + 1,
      description:  cmd.taskDescription || cmd.command,
      command:      cmd.command,
      actualOutput: cmd.output.slice(0, 2000), // trim huge outputs
      success:      cmd.exitCode === 0,
      durationMs:   cmd.durationMs,
      timestamp:    cmd.timestamp,
    }));

    const playbookId = await this.createPlaybook({ ...opts, steps });
    this.activeSessions.delete(sessionId);
    return playbookId;
  }

  discardSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  // ─── Playbook CRUD ───────────────────────────────────────────────────────

  async createPlaybook(data: {
    title:          string;
    description:    string;
    category:       PlaybookCategory;
    keywords:       string[];
    targetOS?:      string;
    targetService?: string;
    steps?:         PlaybookStep[];
    notes?:         string;
    author?:        string;
  }): Promise<string> {
    const id = `pb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const playbook: Playbook = {
      id,
      title:         data.title,
      description:   data.description,
      category:      data.category,
      keywords:      data.keywords.map(k => k.toLowerCase()),
      targetOS:      data.targetOS?.toLowerCase(),
      targetService: data.targetService?.toLowerCase(),
      steps:         data.steps || [],
      successCount:  1,
      failureCount:  0,
      createdAt:     now,
      updatedAt:     now,
      notes:         data.notes,
      author:        data.author,
      version:       1,
    };

    this.playbooks.set(id, playbook);
    this.indexPlaybook(playbook);
    await this.saveKnowledgeBase();

    logger.info({ id, title: playbook.title, steps: playbook.steps.length }, 'Playbook created');
    return id;
  }

  async addStep(playbookId: string, step: Omit<PlaybookStep, 'stepNumber' | 'timestamp'>): Promise<boolean> {
    const pb = this.playbooks.get(playbookId);
    if (!pb) return false;

    pb.steps.push({
      ...step,
      stepNumber: pb.steps.length + 1,
      timestamp:  new Date().toISOString(),
    });
    pb.updatedAt = new Date().toISOString();
    pb.version++;

    await this.saveKnowledgeBase();
    return true;
  }

  async markUsed(playbookId: string, success: boolean, notes?: string): Promise<void> {
    const pb = this.playbooks.get(playbookId);
    if (!pb) return;

    if (success) {
      pb.successCount++;
    } else {
      pb.failureCount++;
      if (notes) pb.notes = (pb.notes ? pb.notes + '\n' : '') + `[FAILURE] ${notes}`;
    }

    pb.lastUsed  = new Date().toISOString();
    pb.updatedAt = new Date().toISOString();
    await this.saveKnowledgeBase();
  }

  async updatePlaybook(playbookId: string, patch: {
    title?:         string;
    description?:   string;
    category?:      PlaybookCategory;
    keywords?:      string[];
    targetOS?:      string;
    targetService?: string;
    notes?:         string;
    steps?:         PlaybookStep[];
  }): Promise<boolean> {
    const pb = this.playbooks.get(playbookId);
    if (!pb) return false;

    // Re-index: remove old keywords then re-add after update
    for (const kw of pb.keywords) {
      this.keywordIndex.get(kw)?.delete(playbookId);
    }

    if (patch.title       !== undefined) pb.title       = patch.title;
    if (patch.description !== undefined) pb.description = patch.description;
    if (patch.category    !== undefined) pb.category    = patch.category;
    if (patch.keywords    !== undefined) pb.keywords    = patch.keywords.map(k => k.toLowerCase());
    if (patch.targetOS    !== undefined) pb.targetOS    = patch.targetOS?.toLowerCase();
    if (patch.targetService !== undefined) pb.targetService = patch.targetService?.toLowerCase();
    if (patch.notes       !== undefined) pb.notes       = patch.notes;
    if (patch.steps       !== undefined) pb.steps       = patch.steps;

    pb.updatedAt = new Date().toISOString();
    pb.version++;

    this.indexPlaybook(pb);
    await this.saveKnowledgeBase();
    logger.info({ playbookId, patch: Object.keys(patch) }, 'Playbook updated');
    return true;
  }

  async deletePlaybook(playbookId: string): Promise<boolean> {
    const pb = this.playbooks.get(playbookId);
    if (!pb) return false;

    // Remove from keyword index
    for (const kw of pb.keywords) {
      this.keywordIndex.get(kw)?.delete(playbookId);
    }

    this.playbooks.delete(playbookId);
    await this.saveKnowledgeBase();
    logger.info({ playbookId }, 'Playbook deleted');
    return true;
  }

  getPlaybook(playbookId: string): Playbook | null {
    return this.playbooks.get(playbookId) || null;
  }

  listPlaybooks(opts?: { category?: PlaybookCategory; targetOS?: string; targetService?: string; limit?: number }): Playbook[] {
    let list = Array.from(this.playbooks.values());

    if (opts?.category)      list = list.filter(p => p.category === opts.category);
    if (opts?.targetOS)      list = list.filter(p => p.targetOS === opts.targetOS?.toLowerCase());
    if (opts?.targetService) list = list.filter(p => p.targetService === opts.targetService?.toLowerCase());

    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return opts?.limit ? list.slice(0, opts.limit) : list;
  }

  // ─── Search ──────────────────────────────────────────────────────────────

  search(
    query: string,
    opts?: { category?: PlaybookCategory; minScore?: number; limit?: number },
  ): PlaybookSearchResult[] {
    const keywords  = this.tokenize(query);
    const results:  PlaybookSearchResult[] = [];

    for (const pb of this.playbooks.values()) {
      if (opts?.category && pb.category !== opts.category) continue;

      let score = 0;
      const matched: string[] = [];

      // Exact keyword matches in playbook keywords
      for (const kw of pb.keywords) {
        for (const q of keywords) {
          if (kw.includes(q) || q.includes(kw)) {
            score += 1.0;
            if (!matched.includes(kw)) matched.push(kw);
          }
        }
      }

      // Partial match in title (high value)
      const lowerTitle = pb.title.toLowerCase();
      for (const q of keywords) {
        if (lowerTitle.includes(q)) score += 0.8;
      }

      // Partial match in description
      const lowerDesc = pb.description.toLowerCase();
      for (const q of keywords) {
        if (lowerDesc.includes(q)) score += 0.4;
      }

      // Boost by success rate
      const total = pb.successCount + pb.failureCount;
      if (total > 0) {
        score *= 0.9 + 0.1 * (pb.successCount / total);
      }

      const maxScore = keywords.length * 2.2;
      const normalized = Math.min(score / maxScore, 1.0);

      if (normalized >= (opts?.minScore ?? 0.1)) {
        results.push({ playbook: pb, relevanceScore: normalized, matchedKeywords: matched });
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return opts?.limit ? results.slice(0, opts.limit) : results;
  }

  // ─── Auto-learn from remote command output ───────────────────────────────

  /**
   * Call this after every execute_remote_command.
   * Returns the commandRecord id for tracking.
   */
  async autoLearn(opts: {
    command:     string;
    output:      string;
    exitCode:    number;
    host?:       string;
    username?:   string;
    durationMs?: number;
    taskDesc?:   string;
    sessionId?:  string;
  }): Promise<{ recordId: string; successDetected: boolean; failureDetected: boolean }> {
    const successDetected = opts.exitCode === 0 && detectSuccess(opts.output);
    const failureDetected = opts.exitCode !== 0 || detectFailure(opts.output);

    const record: CommandRecord = {
      id:              `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      command:         opts.command,
      output:          opts.output.slice(0, 3000),
      exitCode:        opts.exitCode,
      host:            opts.host,
      username:        opts.username,
      timestamp:       new Date().toISOString(),
      taskDescription: opts.taskDesc,
      durationMs:      opts.durationMs,
    };

    if (opts.sessionId) {
      const session = this.activeSessions.get(opts.sessionId);
      if (session) {
        session.commands.push(record);
      }
    }

    this.commandHistory.push(record);
    if (this.commandHistory.length > 1000) this.commandHistory.shift();
    this.saveHistory();

    if (successDetected) {
      logger.info({ command: opts.command.slice(0, 80), host: opts.host }, 'Auto-learn: success pattern detected');
    }

    return { recordId: record.id, successDetected, failureDetected };
  }

  // ─── Build context for AI ────────────────────────────────────────────────

  /**
   * Returns a formatted string to inject into the AI system prompt.
   * The AI uses this to execute tasks with knowledge from past experience.
   */
  buildContextForAI(query: string, maxPlaybooks = 3): string {
    const results = this.search(query, { minScore: 0.3, limit: maxPlaybooks });
    if (results.length === 0) return '';

    const lines: string[] = [
      '--- EXPERIENCE KNOWLEDGE BASE ---',
      'The following playbooks from past successful operations are relevant to this task.',
      'Use them as a guide but adapt steps if the current environment differs.',
      '',
    ];

    for (const { playbook, relevanceScore } of results) {
      lines.push(`## Playbook: ${playbook.title} (confidence: ${Math.round(relevanceScore * 100)}%)`);
      lines.push(`Category: ${playbook.category} | OS: ${playbook.targetOS || 'any'} | Service: ${playbook.targetService || 'any'}`);
      lines.push(`Success rate: ${playbook.successCount}/${playbook.successCount + playbook.failureCount} runs`);
      if (playbook.notes) lines.push(`Notes: ${playbook.notes}`);
      lines.push('Steps:');

      for (const step of playbook.steps) {
        lines.push(`  ${step.stepNumber}. ${step.description}`);
        if (step.command) lines.push(`     Command: ${step.command}`);
        if (step.expectedOutput) lines.push(`     Expected: ${step.expectedOutput}`);
      }
      lines.push('');
    }

    lines.push('--- END KNOWLEDGE BASE ---');
    return lines.join('\n');
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  getStats(): {
    playbookCount:  number;
    commandCount:   number;
    categoryCounts: Record<string, number>;
    topServices:    Array<{ service: string; count: number }>;
  } {
    const categoryCounts: Record<string, number> = {};
    const serviceCounts:  Map<string, number>     = new Map();

    for (const pb of this.playbooks.values()) {
      categoryCounts[pb.category] = (categoryCounts[pb.category] || 0) + 1;
      if (pb.targetService) {
        serviceCounts.set(pb.targetService, (serviceCounts.get(pb.targetService) || 0) + 1);
      }
    }

    const topServices = Array.from(serviceCounts.entries())
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      playbookCount:  this.playbooks.size,
      commandCount:   this.commandHistory.length,
      categoryCounts,
      topServices,
    };
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .filter(w => !STOPWORDS.has(w));
  }

  private indexPlaybook(pb: Playbook): void {
    const allKeywords = [
      ...pb.keywords,
      ...this.tokenize(pb.title),
      ...this.tokenize(pb.description),
      ...(pb.targetOS      ? [pb.targetOS]      : []),
      ...(pb.targetService ? [pb.targetService] : []),
      pb.category,
    ];

    for (const kw of allKeywords) {
      if (!this.keywordIndex.has(kw)) this.keywordIndex.set(kw, new Set());
      this.keywordIndex.get(kw)!.add(pb.id);
    }
  }

  private load(): void {
    try {
      const dir = path.dirname(this.kbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(this.kbPath)) {
        const raw    = fs.readFileSync(this.kbPath, 'utf8');
        const parsed = JSON.parse(raw) as { playbooks?: Playbook[] };

        for (const pb of parsed.playbooks || []) {
          this.playbooks.set(pb.id, pb);
          this.indexPlaybook(pb);
        }
        logger.info({ count: this.playbooks.size }, 'Loaded playbooks from disk');
      }

      if (fs.existsSync(this.historyPath)) {
        const raw    = fs.readFileSync(this.historyPath, 'utf8');
        const parsed = JSON.parse(raw) as { commands?: CommandRecord[] };
        this.commandHistory = parsed.commands || [];
      }
    } catch (err: any) {
      logger.error({ error: err.message }, 'Failed to load ExperienceKnowledgeBase');
    }
  }

  private async saveKnowledgeBase(): Promise<void> {
    try {
      const data = {
        version:      '1.0',
        savedAt:      new Date().toISOString(),
        playbookCount: this.playbooks.size,
        playbooks:    Array.from(this.playbooks.values()),
      };
      const tmp = this.kbPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, this.kbPath);
    } catch (err: any) {
      logger.error({ error: err.message }, 'Failed to save knowledge base');
    }
  }

  private saveHistory(): void {
    try {
      const data = { savedAt: new Date().toISOString(), commands: this.commandHistory };
      const tmp  = this.historyPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, this.historyPath);
    } catch (err: any) {
      logger.error({ error: err.message }, 'Failed to save command history');
    }
  }
}

// Common English stop-words to skip during tokenization
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'was',
  'one', 'our', 'out', 'use', 'had', 'her', 'how', 'its', 'let', 'did',
  'get', 'has', 'him', 'his', 'may', 'new', 'now', 'put', 'run', 'say',
  'see', 'set', 'two', 'way', 'who', 'boy', 'did', 'she', 'too', 'via',
]);

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: ExperienceKnowledgeBase | null = null;

export function getExperienceKB(): ExperienceKnowledgeBase {
  if (!_instance) _instance = new ExperienceKnowledgeBase();
  return _instance;
}
