import { exec, spawn } from 'child_process';
import { CONFIG } from '../config';

export type ServiceAction = 'start' | 'stop' | 'restart';

export interface ServiceStatus {
  active: boolean;
  state:  string;   // 'active', 'inactive', 'failed', etc.
  pid?:   number;
  uptime?: string;
}

export function getStatus(): Promise<ServiceStatus> {
  return new Promise(resolve => {
    exec(`systemctl show ${CONFIG.AGENT_SERVICE} --property=ActiveState,MainPID,ActiveEnterTimestamp --no-pager`, (err, stdout) => {
      const props: Record<string, string> = {};
      for (const line of stdout.split('\n')) {
        const [k, v] = line.split('=');
        if (k && v !== undefined) props[k.trim()] = v.trim();
      }
      const state = props['ActiveState'] || 'unknown';
      const pid   = parseInt(props['MainPID'] || '0', 10) || undefined;

      let uptime: string | undefined;
      if (props['ActiveEnterTimestamp'] && state === 'active') {
        const since = new Date(props['ActiveEnterTimestamp']);
        if (!isNaN(since.getTime())) {
          const sec = Math.floor((Date.now() - since.getTime()) / 1000);
          if (sec < 60) uptime = `${sec}s`;
          else if (sec < 3600) uptime = `${Math.floor(sec / 60)}m`;
          else uptime = `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
        }
      }

      resolve({ active: state === 'active', state, pid, uptime });
    });
  });
}

export function controlService(action: ServiceAction): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`systemctl ${action} ${CONFIG.AGENT_SERVICE}`, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout || `Service ${action} issued`);
    });
  });
}

export function spawnLogStream(lines: number = 100) {
  return spawn('journalctl', [
    '-n', String(lines),
    '-f',
    '-u', CONFIG.AGENT_SERVICE,
    '--output', 'short-iso',
    '--no-pager',
  ]);
}
