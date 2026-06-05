/**
 * AI Agent Assistant - IT Knowledge Skills
 * Exposes the ExperienceKnowledgeBase as agent-callable skills.
 *
 * @author Jose Rodriguez Arroyo
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Skill } from '../types';
import { getExperienceKB, PlaybookCategory } from '../knowledge/ExperienceKnowledgeBase';
import { getCredentialManager } from '../utils/CredentialManager';
import logger from '../utils/logger';

const execAsync = promisify(exec);

const kb = getExperienceKB();

function categoryFromString(s: string): PlaybookCategory {
  const map: Record<string, PlaybookCategory> = {
    install:      PlaybookCategory.INSTALL,
    configure:    PlaybookCategory.CONFIGURE,
    troubleshoot: PlaybookCategory.TROUBLESHOOT,
    monitor:      PlaybookCategory.MONITOR,
    backup:       PlaybookCategory.BACKUP,
    security:     PlaybookCategory.SECURITY,
    network:      PlaybookCategory.NETWORK,
    database:     PlaybookCategory.DATABASE,
    webserver:    PlaybookCategory.WEBSERVER,
    general:      PlaybookCategory.GENERAL,
  };
  return map[s?.toLowerCase()] || PlaybookCategory.GENERAL;
}

export const itKnowledgeSearchSkill: Skill = {
  name: 'it_knowledge_search',
  description: 'Search the internal IT/sysadmin knowledge base for relevant playbooks. Call this BEFORE querying external AI providers.',
  execute: async (params: Record<string, any>) => {
    const results = kb.search(params.query as string, {
      minScore: (params.minScore as number) ?? 0.25,
      limit:    (params.limit    as number) ?? 3,
    });

    if (results.length === 0) {
      return { success: true, found: false, message: 'No relevant playbooks found in local knowledge base.', results: [] };
    }

    return {
      success:      true,
      found:        true,
      count:        results.length,
      results:      results.map(r => ({
        id:              r.playbook.id,
        title:           r.playbook.title,
        category:        r.playbook.category,
        targetOS:        r.playbook.targetOS,
        targetService:   r.playbook.targetService,
        relevanceScore:  Math.round(r.relevanceScore * 100) + '%',
        matchedKeywords: r.matchedKeywords,
        successRate:     `${r.playbook.successCount}/${r.playbook.successCount + r.playbook.failureCount}`,
        stepCount:       r.playbook.steps.length,
        summary:         r.playbook.description,
        notes:           r.playbook.notes,
      })),
      contextBlock: kb.buildContextForAI(params.query as string),
    };
  },
};

export const itKnowledgeCreateSkill: Skill = {
  name: 'it_knowledge_create',
  description: 'Save a new IT playbook to the knowledge base.',
  execute: async (params: Record<string, any>) => {
    try {
      const steps = ((params.steps as any[]) || []).map((s: any, idx: number) => ({
        stepNumber:     idx + 1,
        description:    s.description || s.command || `Step ${idx + 1}`,
        command:        s.command,
        expectedOutput: s.expectedOutput,
        success:        true,
        timestamp:      new Date().toISOString(),
      }));

      const id = await kb.createPlaybook({
        title:         params.title as string,
        description:   params.description as string,
        category:      categoryFromString(params.category as string),
        keywords:      Array.isArray(params.keywords) ? params.keywords : [params.keywords],
        targetOS:      params.targetOS as string | undefined,
        targetService: params.targetService as string | undefined,
        steps,
        notes:         params.notes as string | undefined,
        author:        params.author as string | undefined,
      });

      logger.info({ id, title: params.title }, 'Playbook created via skill');
      return { success: true, playbookId: id, message: `Playbook "${params.title}" saved to knowledge base.` };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

export const itKnowledgeAddStepSkill: Skill = {
  name: 'it_knowledge_add_step',
  description: 'Append a new step to an existing playbook.',
  execute: async (params: Record<string, any>) => {
    const ok = await kb.addStep(params.playbookId as string, {
      description:    params.description as string,
      command:        params.command as string | undefined,
      expectedOutput: params.expectedOutput as string | undefined,
      success:        params.success !== false,
    });
    return ok
      ? { success: true, message: 'Step added.' }
      : { success: false, error: `Playbook ${params.playbookId} not found.` };
  },
};

export const itKnowledgeListSkill: Skill = {
  name: 'it_knowledge_list',
  description: 'List all playbooks in the knowledge base, with optional filtering.',
  execute: async (params: Record<string, any>) => {
    const list = kb.listPlaybooks({
      category:      params.category ? categoryFromString(params.category as string) : undefined,
      targetOS:      params.targetOS as string | undefined,
      targetService: params.targetService as string | undefined,
      limit:         (params.limit as number) ?? 20,
    });

    return {
      success:   true,
      count:     list.length,
      playbooks: list.map(pb => ({
        id:            pb.id,
        title:         pb.title,
        category:      pb.category,
        targetOS:      pb.targetOS,
        targetService: pb.targetService,
        steps:         pb.steps.length,
        successRate:   `${pb.successCount}/${pb.successCount + pb.failureCount}`,
        lastUsed:      pb.lastUsed,
        updatedAt:     pb.updatedAt,
      })),
    };
  },
};

export const itKnowledgeGetSkill: Skill = {
  name: 'it_knowledge_get',
  description: 'Retrieve a specific playbook with all its steps.',
  execute: async (params: Record<string, any>) => {
    const pb = kb.getPlaybook(params.playbookId as string);
    if (!pb) return { success: false, error: `Playbook ${params.playbookId} not found.` };

    return {
      success:  true,
      playbook: {
        id:            pb.id,
        title:         pb.title,
        description:   pb.description,
        category:      pb.category,
        targetOS:      pb.targetOS,
        targetService: pb.targetService,
        keywords:      pb.keywords,
        successCount:  pb.successCount,
        failureCount:  pb.failureCount,
        notes:         pb.notes,
        version:       pb.version,
        createdAt:     pb.createdAt,
        updatedAt:     pb.updatedAt,
        lastUsed:      pb.lastUsed,
        steps:         pb.steps.map(s => ({
          step:           s.stepNumber,
          description:    s.description,
          command:        s.command,
          expectedOutput: s.expectedOutput,
          success:        s.success,
        })),
      },
    };
  },
};

export const itKnowledgeMarkResultSkill: Skill = {
  name: 'it_knowledge_mark_result',
  description: 'Record that a playbook was used and whether it succeeded. Improves future recommendations.',
  execute: async (params: Record<string, any>) => {
    await kb.markUsed(params.playbookId as string, params.success as boolean, params.notes as string | undefined);
    return { success: true, message: `Playbook result recorded (${params.success ? 'success' : 'failure'}).` };
  },
};

export const itKnowledgeStartSessionSkill: Skill = {
  name: 'it_knowledge_start_session',
  description: 'Start a learning session to track remote commands. Returns a sessionId to use with record_command.',
  execute: async (params: Record<string, any>) => {
    const sessionId = kb.startSession(params.host as string | undefined, params.description as string | undefined);
    return { success: true, sessionId, message: `Session ${sessionId} started. Pass sessionId to it_knowledge_record_command.` };
  },
};

export const itKnowledgeRecordCommandSkill: Skill = {
  name: 'it_knowledge_record_command',
  description: 'Record a remote command and its output into the active learning session.',
  execute: async (params: Record<string, any>) => {
    const id = kb.addCommandToSession(params.sessionId as string, {
      command:         params.command as string,
      output:          (params.output as string) || '',
      exitCode:        (params.exitCode as number) ?? 0,
      host:            params.host as string | undefined,
      username:        params.username as string | undefined,
      durationMs:      params.durationMs as number | undefined,
      taskDescription: params.taskDesc as string | undefined,
    });
    return { success: true, commandId: id };
  },
};

export const itKnowledgeCommitSessionSkill: Skill = {
  name: 'it_knowledge_commit_session',
  description: 'Commit a successful session as a reusable playbook. Call when the full installation/task completes successfully.',
  execute: async (params: Record<string, any>) => {
    const id = await kb.commitSession(params.sessionId as string, {
      title:         params.title as string,
      description:   params.description as string,
      category:      categoryFromString(params.category as string),
      keywords:      Array.isArray(params.keywords) ? params.keywords : [params.keywords],
      targetOS:      params.targetOS as string | undefined,
      targetService: params.targetService as string | undefined,
      notes:         params.notes as string | undefined,
    });

    if (!id) return { success: false, error: 'Session not found or is empty.' };

    return {
      success:    true,
      playbookId: id,
      message:    `Session committed as playbook "${params.title}" (ID: ${id}). This experience will guide future similar tasks.`,
    };
  },
};

export const itKnowledgeDiscardSessionSkill: Skill = {
  name: 'it_knowledge_discard_session',
  description: 'Discard a failed session without saving it.',
  execute: async (params: Record<string, any>) => {
    kb.discardSession(params.sessionId as string);
    return { success: true, message: `Session ${params.sessionId} discarded.` };
  },
};

export const itKnowledgeStatsSkill: Skill = {
  name: 'it_knowledge_stats',
  description: 'Get statistics about the internal knowledge base (playbook count, categories, top services).',
  execute: async (_params: Record<string, any>) => {
    const stats = kb.getStats();
    return { success: true, ...stats };
  },
};

export const itKnowledgeDeleteSkill: Skill = {
  name: 'it_knowledge_delete',
  description: 'Delete a playbook from the knowledge base.',
  execute: async (params: Record<string, any>) => {
    const ok = await kb.deletePlaybook(params.playbookId as string);
    return ok
      ? { success: true, message: `Playbook ${params.playbookId} deleted.` }
      : { success: false, error: `Playbook ${params.playbookId} not found.` };
  },
};

export const allITKnowledgeSkills: Skill[] = [
  itKnowledgeSearchSkill,
  itKnowledgeCreateSkill,
  itKnowledgeAddStepSkill,
  itKnowledgeListSkill,
  itKnowledgeGetSkill,
  itKnowledgeMarkResultSkill,
  itKnowledgeStartSessionSkill,
  itKnowledgeRecordCommandSkill,
  itKnowledgeCommitSessionSkill,
  itKnowledgeDiscardSessionSkill,
  itKnowledgeStatsSkill,
  itKnowledgeDeleteSkill,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Steps whose commands run in the background and should not block execution.
// 'screen -' catches "screen -dmS ..." session launches without matching "apt-get install screen wget"
const BACKGROUND_KEYWORDS = ['screen -', 'nohup ', '&"', "& '", 'tee /root/'];

function isBackgroundStep(description: string, command?: string): boolean {
  // Only flag as background when the COMMAND itself launches a background process.
  // Never key off description words like "installer" — that would flag prerequisite
  // install steps (apt-get install screen "needed for installer") as background.
  const desc = description.toLowerCase();
  return (
    desc.includes('screen session') ||
    desc.includes('poll') ||
    desc.includes('wait for') ||
    BACKGROUND_KEYWORDS.some(kw => (command || '').includes(kw))
  );
}

/**
 * Prepare a playbook command for remote execution:
 * 1. Replace <HOST> placeholder with the actual host.
 * 2. If the command itself starts with "ssh root@<host> '...'" (commands written
 *    to be run locally), strip the outer ssh wrapper and return only the inner
 *    command — run_playbook already wraps everything in sshpass+ssh.
 */
function prepareRemoteCmd(raw: string, host: string): string {
  // Replace template placeholder
  let cmd = raw.replace(/<HOST>/gi, host);

  // Strip outer "ssh [flags] root@host 'inner'" or "ssh [flags] root@host \"inner\""
  const sshWrap = cmd.match(/^ssh\s+(?:-\S+\s+)*root@\S+\s+'([\s\S]+)'$/) ||
                  cmd.match(/^ssh\s+(?:-\S+\s+)*root@\S+\s+"([\s\S]+)"$/);
  if (sshWrap) {
    cmd = sshWrap[1];
  }

  return cmd;
}

function buildSshCmd(host: string, password: string, remoteCmd: string): string {
  const prepared = prepareRemoteCmd(remoteCmd, host);

  // Commands with embedded newlines (heredocs, multi-line scripts) cannot safely
  // be passed inside a single-quoted SSH argument — the quoting breaks at each newline.
  // Base64-encode and pipe through bash instead; base64 chars are all single-quote-safe.
  if (prepared.includes('\n')) {
    const b64 = Buffer.from(prepared).toString('base64');
    return `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${host} 'echo ${b64} | base64 -d | bash'`;
  }

  // Simple single-line command: escape single quotes for shell safety
  const escaped = prepared.replace(/'/g, `'\\''`);
  return `sshpass -p '${password}' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 root@${host} '${escaped}'`;
}

// ─── run_playbook ─────────────────────────────────────────────────────────────

export const runPlaybookSkill: Skill = {
  name: 'run_playbook',
  description:
    'Execute a knowledge-base playbook step-by-step on a remote server. ' +
    'Reports the result of every step. Long-running steps (installers, screen sessions) are ' +
    'launched in the background and marked as "background" so the agent can monitor them separately. ' +
    'Use check_remote_progress to poll background operations.',
  execute: async (params: Record<string, any>) => {
    const playbookId     = params.playbookId as string;
    const host           = params.host       as string;
    const credentialKey  = (params.credentialKey || `root@${host}`) as string;
    const startStep      = (params.startStep as number) || 1;
    const onStep         = typeof params.onStep === 'function' ? params.onStep as (info: any) => Promise<void> : null;

    if (!playbookId || !host) {
      return { success: false, error: 'playbookId and host are required' };
    }

    // Reject placeholder values that come from IP-redaction in conversation history
    if (/\[redacted/i.test(host) || host === '<HOST>' || host === 'REDACTED_IP') {
      return {
        success: false,
        error: `Invalid host "${host}". This is a placeholder, not a real IP address. ` +
               `Use the actual server IP (e.g. "192.254.73.46") when calling run_playbook.`,
      };
    }

    // Resolve credential
    let password: string;
    try {
      const mgr = getCredentialManager();
      password = await mgr.getCredential(credentialKey);
    } catch {
      return { success: false, error: `Credential not found for key: "${credentialKey}". Use /savecred to store it first.` };
    }

    const playbook = kb.getPlaybook(playbookId);
    if (!playbook) return { success: false, error: `Playbook not found: ${playbookId}` };

    const stepResults: any[] = [];
    let stoppedAtStep: number | null = null;

    for (const step of playbook.steps) {
      if (step.stepNumber < startStep) continue;

      const stepInfo: any = {
        step:        step.stepNumber,
        total:       playbook.steps.length,
        description: step.description,
      };

      if (!step.command) {
        stepInfo.status = 'skipped';
        stepInfo.reason = 'no command defined';
        stepResults.push(stepInfo);
        continue;
      }

      // Long-running / background steps: launch and stop sequential execution
      if (isBackgroundStep(step.description, step.command)) {
        try {
          const sshCmd = buildSshCmd(host, password, step.command);
          exec(sshCmd); // fire-and-forget
          stepInfo.status = 'background';
          stepInfo.note   = `Command launched in background. Use check_remote_progress to monitor.`;
          stepInfo.monitorHint = `check_remote_progress(host="${host}", credentialKey="${credentialKey}", logFile="/root/ispconfig-install.log", marker="ISPCONFIG_INSTALL_DONE")`;
        } catch (err: any) {
          stepInfo.status = 'error';
          stepInfo.error  = err.message;
        }
        stepResults.push(stepInfo);
        if (onStep) await onStep(stepInfo);
        stoppedAtStep = step.stepNumber;
        break;
      }

      // Normal step: execute and wait
      try {
        const sshCmd = buildSshCmd(host, password, step.command);
        const { stdout, stderr } = await execAsync(sshCmd, { timeout: 120_000 });
        const fullOutput = (stdout + stderr).trim();
        const matched    = !step.expectedOutput || fullOutput.includes(step.expectedOutput);
        const output     = fullOutput.substring(0, 600);

        stepInfo.status         = matched ? 'success' : 'warning';
        stepInfo.output         = output;
        stepInfo.expectedOutput = step.expectedOutput || null;
        if (!matched) stepInfo.note = `Expected "${step.expectedOutput}" not found in output`;

        logger.info({ step: step.stepNumber, status: stepInfo.status, host }, 'Playbook step executed');
      } catch (err: any) {
        stepInfo.status = 'error';
        // Show stderr/stdout from the failed command, not the command string itself
        const errDetail = (err.stderr || err.stdout || '').trim();
        stepInfo.error  = errDetail
          ? `Exit ${err.code ?? '?'}: ${errDetail}`.substring(0, 400)
          : err.message.substring(0, 400);
        stepResults.push(stepInfo);
        if (onStep) await onStep(stepInfo);
        stoppedAtStep = step.stepNumber;
        break;
      }

      stepResults.push(stepInfo);
      if (onStep) await onStep(stepInfo);
    }

    const successCount    = stepResults.filter(r => r.status === 'success').length;
    const errorCount      = stepResults.filter(r => r.status === 'error').length;
    const backgroundCount = stepResults.filter(r => r.status === 'background').length;

    return {
      success:        errorCount === 0,
      playbook:       playbook.title,
      host,
      stepsExecuted:  stepResults.length,
      totalSteps:     playbook.steps.length,
      successCount,
      errorCount,
      backgroundCount,
      stoppedAtStep,
      resumeFrom:     stoppedAtStep ? stoppedAtStep + 1 : null,
      steps:          stepResults,
      summary:        stepResults.map(r =>
        `[${r.status.toUpperCase()}] Step ${r.step}/${r.total}: ${r.description}` +
        (r.error ? ` — ${r.error}` : '') +
        (r.note  ? ` — ${r.note}`  : '')
      ).join('\n'),
    };
  },
};

// ─── check_remote_progress ────────────────────────────────────────────────────

export const checkRemoteProgressSkill: Skill = {
  name: 'check_remote_progress',
  description:
    'Poll a log file on a remote server to check the progress of a background operation ' +
    '(e.g. ISPConfig installer). Returns the last lines of the log and whether the completion ' +
    'marker has been found. Call this every 2-3 minutes while waiting for a background task.',
  execute: async (params: Record<string, any>) => {
    const host          = params.host          as string;
    const credentialKey = (params.credentialKey || `root@${host}`) as string;
    const logFile       = (params.logFile       || '/root/ispconfig-install.log') as string;
    const marker        = (params.marker        || 'ISPCONFIG_INSTALL_DONE') as string;
    const tailLines     = (params.tailLines     || 20) as number;

    if (!host) return { success: false, error: 'host is required' };
    if (/\[redacted/i.test(host) || host === '<HOST>') {
      return { success: false, error: `Invalid host "${host}" — use the real IP address.` };
    }

    let password: string;
    try {
      const mgr = getCredentialManager();
      password = await mgr.getCredential(credentialKey);
    } catch {
      return { success: false, error: `Credential not found: "${credentialKey}"` };
    }

    try {
      const remoteCmd = [
        `wc -l ${logFile} 2>/dev/null || echo "0 ${logFile}"`,
        `echo "---TAIL---"`,
        `tail -n ${tailLines} ${logFile} 2>/dev/null`,
        `echo "---MARKER---"`,
        `grep -c '${marker}' ${logFile} 2>/dev/null || echo 0`,
        `echo "---PROCS---"`,
        // Show active installer-related processes in one compact line each
        `ps -eo pid,comm,args --no-headers | grep -E 'apt-get|dpkg|php.*ispconfig|ispconfig.*sh|screen.*ispconfig' | grep -v grep | awk '{print $1,$2}' | head -5 || echo none`,
      ].join('; ');

      const sshCmd = buildSshCmd(host, password, remoteCmd);
      const { stdout } = await execAsync(sshCmd, { timeout: 30_000 });
      const output = stdout.trim();

      const [headerPart, tailPart, markerAndRest] = output.split(/---TAIL---|---MARKER---/);
      const [markerPart, procPart] = (markerAndRest || '').split(/---PROCS---/);

      const totalLines = parseInt((headerPart || '').trim().split(' ')[0] || '0', 10);
      const logTail    = (tailPart || '').trim();
      const markerHits = parseInt((markerPart || '0').trim(), 10);
      const done       = markerHits > 0;
      const activeProcs = (procPart || '').trim();
      const isActive   = activeProcs && activeProcs !== 'none';

      // Strip ANSI color codes, extract INFO/ERROR lines
      const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
      const statusLines = clean(logTail).split('\n')
        .filter(l => l.includes('[INFO]') || l.includes('[ERROR]') || l.includes(marker))
        .slice(-10)
        .join('\n');

      return {
        success:     true,
        host,
        logFile,
        totalLines,
        done,
        isActive,
        activeProcs: isActive ? activeProcs : null,
        marker,
        lastLines:   clean(logTail),
        statusLines: statusLines || clean(logTail).split('\n').slice(-5).join('\n'),
        message:     done
          ? `Installation complete! Marker "${marker}" found.`
          : isActive
            ? `Actively running (${totalLines} log lines). apt-get/dpkg in progress — log updates when current step finishes.`
            : `Screen session may have ended (${totalLines} log lines, no active apt/php processes).`,
      };
    } catch (err: any) {
      return { success: false, error: err.message.substring(0, 300) };
    }
  },
};

// Add after declaration to avoid "used before assigned" errors
allITKnowledgeSkills.push(runPlaybookSkill, checkRemoteProgressSkill);
