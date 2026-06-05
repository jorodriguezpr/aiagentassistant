/**
 * AnsibleImporter — converts an Ansible YAML playbook into
 * the internal PlaybookStep format used by ExperienceKnowledgeBase.
 */

import * as yaml from 'js-yaml';
import { PlaybookCategory } from '../knowledge/ExperienceKnowledgeBase.js';

export interface ImportedPlaybook {
  title: string;
  description: string;
  category: PlaybookCategory;
  keywords: string[];
  targetOS?: string;
  targetService?: string;
  steps: ImportedStep[];
}

export interface ImportedStep {
  description: string;
  command?: string;
  ignoreErrors: boolean;
}

// ─── Module converters ────────────────────────────────────────────────────────

function convertTask(task: Record<string, any>): ImportedStep {
  const description = String(task.name || 'Unnamed step');
  const ignoreErrors = task.ignore_errors === true || task.ignore_errors === 'true' || task.ignore_errors === 'yes';

  // Keys that are Ansible metadata, not module names
  const META = new Set([
    'name', 'when', 'ignore_errors', 'register', 'loop', 'loop_control',
    'become', 'vars', 'notify', 'tags', 'with_items', 'failed_when',
    'changed_when', 'no_log', 'environment', 'args', 'check_mode',
  ]);

  const moduleKey = Object.keys(task).find(k => !META.has(k));
  if (!moduleKey) return { description, ignoreErrors };

  const mod = task[moduleKey];
  const loop: any[] = task.loop || task.with_items || [];
  const loopItems = Array.isArray(loop) ? loop : (loop ? [loop] : []);

  let cmd: string | undefined = buildCommand(moduleKey, mod, description);

  // Expand loops: replace {{ item }} with each value
  if (cmd && loopItems.length > 0) {
    if (cmd.includes('{{ item }}') || cmd.includes('{{item}}')) {
      cmd = loopItems
        .map((item: any) => cmd!.replace(/\{\{\s*item\s*\}\}/g, String(item)))
        .join(' && ');
    }
  }

  return { description, command: cmd, ignoreErrors };
}

function buildCommand(module: string, val: any, desc: string): string | undefined {
  switch (module) {
    // ── Direct shell execution ──────────────────────────────────────────────
    case 'command':
    case 'shell':
    case 'raw':
      return typeof val === 'string' ? val : (val?.cmd || val?._raw_params);

    // ── Package managers ────────────────────────────────────────────────────
    case 'dnf':
    case 'yum':
    case 'package': {
      const pkgs = arrayOrString(val.name);
      const state = val.state || 'present';
      if (['present', 'installed', 'latest'].includes(state))
        return `dnf install -y ${pkgs}`;
      if (['absent', 'removed'].includes(state))
        return `dnf remove -y ${pkgs}`;
      return undefined;
    }
    case 'apt': {
      const pkgs = arrayOrString(val.name);
      const state = val.state || 'present';
      if (['present', 'installed', 'latest'].includes(state))
        return `DEBIAN_FRONTEND=noninteractive apt-get install -y ${pkgs}`;
      if (['absent', 'removed'].includes(state))
        return `apt-get remove -y ${pkgs}`;
      return undefined;
    }
    case 'pip': {
      const pkgs = arrayOrString(val.name);
      return `pip3 install ${pkgs}`;
    }

    // ── Service management ─────────────────────────────────────────────────
    case 'systemd':
    case 'service': {
      const name = val.name || '{{ item }}';
      const enabled = val.enabled === true || val.enabled === 'yes';
      const state = val.state;
      if (enabled && state === 'started') return `systemctl enable --now ${name}`;
      if (enabled)                        return `systemctl enable ${name}`;
      if (state === 'started')            return `systemctl start ${name}`;
      if (state === 'stopped')            return `systemctl stop ${name}`;
      if (state === 'restarted')          return `systemctl restart ${name}`;
      if (state === 'reloaded')           return `systemctl reload ${name}`;
      return undefined;
    }

    // ── File operations ─────────────────────────────────────────────────────
    case 'file': {
      const p = val.path || val.dest;
      const state = val.state;
      const mode = val.mode;
      let c: string | undefined;
      if (state === 'absent')    c = `rm -rf "${p}"`;
      else if (state === 'directory') c = `mkdir -p "${p}"`;
      else if (state === 'touch') c = `touch "${p}"`;
      if (c && mode) c += ` && chmod ${mode} "${p}"`;
      return c;
    }
    case 'copy': {
      const dest = val.dest;
      if (val.src) return `cp "${val.src}" "${dest}"`;
      if (val.content != null) {
        const escaped = String(val.content).replace(/'/g, "'\\''");
        return `printf '%s' '${escaped}' > "${dest}"`;
      }
      return undefined;
    }
    case 'template': {
      const src = val.src;
      const dest = val.dest;
      return src ? `cp "${src}" "${dest}"` : undefined;
    }

    // ── Text replacement ────────────────────────────────────────────────────
    case 'replace': {
      const p = val.path || val.dest;
      const regexp = String(val.regexp || '').replace(/'/g, "'\\''");
      const replace = String(val.replace ?? '').replace(/'/g, "'\\''").replace(/&/g, '\\&');
      return `sed -i 's/${escapeSed(val.regexp)}/${escapeSed(val.replace ?? '')}/g' "${p}"`;
    }
    case 'lineinfile': {
      const p = val.path || val.dest;
      if (val.line) return `echo '${val.line}' >> "${p}"`;
      return undefined;
    }

    // ── Downloads ───────────────────────────────────────────────────────────
    case 'get_url': {
      const url = val.url;
      const dest = val.dest;
      const mode = val.mode;
      let c = `wget -O "${dest}" "${url}"`;
      if (mode) c += ` && chmod ${mode} "${dest}"`;
      return c;
    }
    case 'uri': {
      const url = val.url;
      return `curl -s "${url}"`;
    }

    // ── Stat / exists check ─────────────────────────────────────────────────
    case 'stat': {
      const p = val.path;
      return `test -e "${p}" && echo "exists" || echo "not_exists"`;
    }

    // ── Debug / echo ─────────────────────────────────────────────────────────
    case 'debug': {
      const msg = val.msg || val.var || '';
      return `echo "${String(msg).replace(/"/g, '\\"')}"`;
    }
    case 'fail': {
      const msg = val.msg || 'Task failed';
      return `echo "${msg}" && exit 1`;
    }

    // ── Firewall ─────────────────────────────────────────────────────────────
    case 'firewalld': {
      const port = val.port;
      const state = val.state || 'enabled';
      const perm = val.permanent === true || val.permanent === 'yes' ? '--permanent ' : '';
      const zone = val.zone ? `--zone=${val.zone} ` : '';
      if (port) {
        return state === 'enabled'
          ? `firewall-cmd ${perm}${zone}--add-port=${port}`
          : `firewall-cmd ${perm}${zone}--remove-port=${port}`;
      }
      return undefined;
    }
    case 'ufw': {
      const rule = val.rule || 'allow';
      const port = val.port || val.to_port;
      return port ? `ufw ${rule} ${port}` : undefined;
    }

    // ── Cron ─────────────────────────────────────────────────────────────────
    case 'cron': {
      const job = val.job;
      const minute = val.minute || '*';
      const hour = val.hour || '*';
      if (job) return `(crontab -l 2>/dev/null; echo "${minute} ${hour} * * * ${job}") | crontab -`;
      return undefined;
    }

    // ── User management ───────────────────────────────────────────────────────
    case 'user': {
      const name = val.name;
      if (val.state === 'absent') return `userdel ${name}`;
      const groups = val.groups ? `-G ${val.groups}` : '';
      return `useradd ${groups} ${name}`;
    }
    case 'group': {
      const name = val.name;
      return val.state === 'absent' ? `groupdel ${name}` : `groupadd ${name}`;
    }

    // ── Git ───────────────────────────────────────────────────────────────────
    case 'git': {
      const repo = val.repo;
      const dest = val.dest;
      const version = val.version ? `-b ${val.version}` : '';
      return `git clone ${version} "${repo}" "${dest}"`;
    }

    // ── Archive ───────────────────────────────────────────────────────────────
    case 'unarchive': {
      const src = val.src;
      const dest = val.dest;
      return `tar -xf "${src}" -C "${dest}"`;
    }

    // ── Hostname ──────────────────────────────────────────────────────────────
    case 'hostname': {
      return `hostnamectl set-hostname "${val.name}"`;
    }

    default:
      return undefined;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arrayOrString(val: any): string {
  if (Array.isArray(val)) return val.join(' ');
  return String(val || '');
}

function escapeSed(s: string): string {
  return String(s ?? '').replace(/\//g, '\\/').replace(/&/g, '\\&');
}

function guessCategory(text: string): PlaybookCategory {
  const t = text.toLowerCase();
  if (/install|setup|deploy|download/.test(t)) return PlaybookCategory.INSTALL;
  if (/config|configure|set|change/.test(t))   return PlaybookCategory.CONFIGURE;
  if (/secure|security|firewall|selinux|ssl/.test(t)) return PlaybookCategory.SECURITY;
  if (/backup|dump|snapshot/.test(t))           return PlaybookCategory.BACKUP;
  if (/monitor|check|status|health/.test(t))    return PlaybookCategory.MONITOR;
  if (/trouble|fix|debug|repair/.test(t))       return PlaybookCategory.TROUBLESHOOT;
  if (/network|dns|ip|route|firewall/.test(t))  return PlaybookCategory.NETWORK;
  if (/database|mysql|mariadb|postgres/.test(t)) return PlaybookCategory.DATABASE;
  if (/web|nginx|apache|httpd|php/.test(t))     return PlaybookCategory.WEBSERVER;
  return PlaybookCategory.INSTALL;
}

function guessTargetOS(tasks: any[]): string | undefined {
  const text = JSON.stringify(tasks).toLowerCase();
  if (text.includes('almalinux') || text.includes('centos') || text.includes('rhel')) return 'almalinux';
  if (text.includes('ubuntu') || text.includes('debian') || text.includes('apt-get')) return 'ubuntu';
  if (/\bdnf\b|\byum\b/.test(text)) return 'almalinux';
  if (/\bapt\b/.test(text))         return 'ubuntu';
  return undefined;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseAnsiblePlaybook(yamlText: string): ImportedPlaybook {
  const doc = yaml.load(yamlText) as any;

  // Ansible playbooks are a list of plays; take the first play
  const play = Array.isArray(doc) ? doc[0] : doc;
  if (!play) throw new Error('Empty or invalid YAML');
  if (!play.tasks) throw new Error('No "tasks" key found — is this an Ansible playbook?');

  const title = String(play.name || 'Imported Playbook');
  const tasks: any[] = play.tasks || [];

  const steps = tasks.map(convertTask);
  const category = guessCategory(title);
  const targetOS = guessTargetOS(tasks);

  // Keywords: tokenize title + task names
  const keywordSource = [title, ...tasks.map((t: any) => t.name || '')].join(' ');
  const keywords = [...new Set(
    keywordSource
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
  )];

  return {
    title,
    description: `Imported from Ansible playbook. ${tasks.length} tasks converted.`,
    category,
    keywords,
    targetOS,
    steps,
  };
}

export function formatImportPreview(pb: ImportedPlaybook): string {
  const stepLines = pb.steps.map((s, i) => {
    const num = `${i + 1}`.padStart(2, ' ');
    const cmd = s.command
      ? `\n      \`${s.command.substring(0, 80)}${s.command.length > 80 ? '…' : ''}\``
      : ' _(no command — manual step)_';
    const ignore = s.ignoreErrors ? ' _(ignore errors)_' : '';
    return `  ${num}. ${s.description}${ignore}${cmd}`;
  });

  return (
    `📋 *Import Preview*\n\n` +
    `*Title:* ${pb.title}\n` +
    `*Category:* ${pb.category}\n` +
    `*OS:* ${pb.targetOS || 'any'}\n` +
    `*Steps:* ${pb.steps.length}\n\n` +
    `*Steps:*\n${stepLines.join('\n')}`
  );
}
