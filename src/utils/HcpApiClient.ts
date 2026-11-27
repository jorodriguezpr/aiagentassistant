/**
 * AI Agent Assistant (AiAgentAssistant)
 * HCP API Client - Bridge to the SysAdminHCP control panel's REST API
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import axios, { AxiosInstance } from 'axios';
import logger from './logger';
import { getCredentialManager } from './CredentialManager';

const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // panel JWT is 24h; refresh at 23h to be safe

/**
 * Talks to a SysAdminHCP panel over its admin REST API, authenticating via a
 * self-service API key (minted from the panel's own Settings page) exchanged
 * for a bearer JWT at POST /api/auth/api-login. The key is read from the same
 * credential store CredentialManager already uses — the admin adds it once
 * via the panel's Credentials UI (see readme/HCP_INTEGRATION docs).
 */
export class HcpApiClient {
  private baseUrl: string | null = null;
  private http: AxiosInstance | null = null;
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private loginInFlight: Promise<string> | null = null;

  private getBaseUrl(): string {
    if (!this.baseUrl) {
      this.baseUrl = (process.env.SYSADMINHCP_API_URL || '').replace(/\/+$/, '');
      if (!this.baseUrl) {
        throw new Error('SYSADMINHCP_API_URL is not configured. Set it in .env to the panel URL, e.g. https://your-server:7777');
      }
    }
    return this.baseUrl;
  }

  private getHttp(): AxiosInstance {
    if (!this.http) {
      this.http = axios.create({
        baseURL: this.getBaseUrl(),
        timeout: 10000,
        // Panel servers commonly run on a self-signed cert until Let's Encrypt is issued
        httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
      });
    }
    return this.http;
  }

  private async ensureToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
      return this.token;
    }

    // Dedupe concurrent callers (e.g. getSystemHealth's Promise.all fan-out) so
    // they share a single login request instead of each firing their own.
    if (this.loginInFlight) {
      return this.loginInFlight;
    }

    this.loginInFlight = (async () => {
      try {
        const credManager = getCredentialManager();
        const apiKey = await credManager.getCredential('SYSADMINHCP_API_KEY');
        if (!apiKey) {
          throw new Error('SYSADMINHCP_API_KEY not found. Add it via the panel\'s Settings → Credentials page.');
        }

        const response = await this.getHttp().post('/api/auth/api-login', { apiKey });
        const token = response.data?.token;
        if (!token) {
          throw new Error('Panel login did not return a token');
        }

        this.token = token;
        this.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
        logger.info('HcpApiClient: authenticated with panel, token cached');
        return token;
      } finally {
        this.loginInFlight = null;
      }
    })();

    return this.loginInFlight;
  }

  private async request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: any): Promise<T> {
    const token = await this.ensureToken();
    try {
      const res = await this.getHttp().request({
        method,
        url: path,
        data: body,
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Token may have been invalidated server-side (panel restart, key revoked) — retry once
        this.token = null;
        const token2 = await this.ensureToken();
        const res = await this.getHttp().request({
          method,
          url: path,
          data: body,
          headers: { Authorization: `Bearer ${token2}` },
        });
        return res.data;
      }
      throw error;
    }
  }

  // ─── Read-only (Phase 1) ──────────────────────────────────────────────────

  async getSystemHealth(): Promise<any> {
    const [services, disk, memory, cpu] = await Promise.all([
      this.request('GET', '/api/system/services'),
      this.request('GET', '/api/system/disk').catch(() => null),
      this.request('GET', '/api/system/memory').catch(() => null),
      this.request('GET', '/api/system/cpu-sample').catch(() => null),
    ]);
    return { services, disk, memory, cpu };
  }

  async listTickets(status?: string): Promise<any> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request('GET', `/api/tickets${qs}`);
  }

  async getTicket(id: string): Promise<any> {
    return this.request('GET', `/api/tickets/${encodeURIComponent(id)}`);
  }

  async listClients(): Promise<any> {
    return this.request('GET', '/api/clients');
  }

  async getBackupHealth(): Promise<any> {
    return this.request('GET', '/api/backups/health');
  }

  async getIntrusionActivity(): Promise<any> {
    const [activity, topAttackers, blocklist] = await Promise.all([
      this.request('GET', '/api/intrusion/activity').catch(() => null),
      this.request('GET', '/api/intrusion/top-attackers').catch(() => null),
      this.request('GET', '/api/intrusion/blocklist').catch(() => null),
    ]);
    return { activity, topAttackers, blocklist };
  }

  async getDnsZone(domainName: string): Promise<any> {
    return this.request('GET', `/api/dns/zones/${encodeURIComponent(domainName)}`);
  }

  async getMailDomain(domainName: string): Promise<any> {
    return this.request('GET', `/api/mail/domains/${encodeURIComponent(domainName)}`);
  }

  async listDatabases(clientName?: string): Promise<any> {
    const qs = clientName ? `?clientName=${encodeURIComponent(clientName)}` : '';
    return this.request('GET', `/api/databases${qs}`);
  }

  async listDatabaseUsers(clientName?: string): Promise<any> {
    const qs = clientName ? `?clientName=${encodeURIComponent(clientName)}` : '';
    return this.request('GET', `/api/databases/users${qs}`);
  }

  async listFtpAccounts(domainName?: string): Promise<any> {
    const qs = domainName ? `?domainName=${encodeURIComponent(domainName)}` : '';
    return this.request('GET', `/api/ftp${qs}`);
  }

  async listSslCertificates(): Promise<any> {
    return this.request('GET', '/api/letsencrypt/certificates');
  }

  // ─── Actions (Phase 3 — gated by delegation at the call site) ────────────

  async replyTicket(id: string, message: string): Promise<any> {
    // Panel route expects { body }, not { message } -- matches theme/index.html's own reply call.
    return this.request('POST', `/api/tickets/${encodeURIComponent(id)}/reply`, { body: message });
  }

  async updateTicketStatus(id: string, status: string): Promise<any> {
    return this.request('PUT', `/api/tickets/${encodeURIComponent(id)}/status`, { status });
  }

  /**
   * Installs packages through the panel (SysAdminHCP 8.3.0+): the panel's root helper installs only names from its
   * approved lists (the panel's packages + common admin tools) and notifies the admin. The agent has no sudo.
   */
  async installPackages(packages: string[]): Promise<any> {
    // its own request: an install can take minutes (the shared client times out after 10 s)
    const send = async () => {
      const token = await this.ensureToken();
      const res = await this.getHttp().request({
        method: 'POST', url: '/api/aiagent/packages/install', data: { packages },
        timeout: 15 * 60 * 1000, headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    };
    try {
      return await send();
    } catch (error: any) {
      if (error.response?.status !== 401) throw error;
      this.token = null;   // token invalidated server-side (panel restart, key revoked): retry once
      return send();
    }
  }

  async restartService(serviceType: string, driverName: string): Promise<any> {
    return this.request('POST', '/api/system/services/restart', { serviceType, driverName, action: 'restart' });
  }

  async suspendClient(username: string): Promise<any> {
    return this.request('POST', `/api/clients/${encodeURIComponent(username)}/suspend`);
  }

  async retryBackup(): Promise<any> {
    return this.request('POST', '/api/backups', { backupType: 'full', target: 'all', destination: 'local' });
  }

  async unsuspendClient(username: string): Promise<any> {
    return this.request('POST', `/api/clients/${encodeURIComponent(username)}/unsuspend`);
  }

  async addDnsRecord(domainName: string, record: { recordType: string; hostname: string; content: string; ttl?: number; priority?: number; weight?: number; port?: number }): Promise<any> {
    return this.request('POST', `/api/dns/zones/${encodeURIComponent(domainName)}/records`, record);
  }

  async updateDnsRecord(domainName: string, recordId: string, updates: { recordType?: string; hostname?: string; content?: string; ttl?: number; priority?: number; weight?: number }): Promise<any> {
    return this.request('PUT', `/api/dns/zones/${encodeURIComponent(domainName)}/records/${encodeURIComponent(recordId)}`, updates);
  }

  async deleteDnsRecord(domainName: string, recordId: string): Promise<any> {
    return this.request('DELETE', `/api/dns/zones/${encodeURIComponent(domainName)}/records/${encodeURIComponent(recordId)}`);
  }

  // ─── Mail actions ─────────────────────────────────────────────────────────

  async createMailAccount(params: { username: string; domainName: string; password: string; quota?: number; clientName?: string }): Promise<any> {
    return this.request('POST', '/api/mail/accounts', params);
  }

  async deleteMailAccount(username: string): Promise<any> {
    // Route param is matched against the account's stored nname, which for accounts created
    // by createMailAccount() is the bare username (not user@domain) -- see mail2.ts's comment
    // on why nname deliberately stores the bare form.
    return this.request('DELETE', `/api/mail/accounts/${encodeURIComponent(username)}`);
  }

  async changeMailPassword(username: string, password: string): Promise<any> {
    return this.request('POST', `/api/mail/accounts/${encodeURIComponent(username)}/change-password`, { password });
  }

  async setMailQuota(username: string, quota: number): Promise<any> {
    return this.request('POST', `/api/mail/accounts/${encodeURIComponent(username)}/quota`, { quota });
  }

  async toggleMailAccount(username: string, enable: boolean): Promise<any> {
    return this.request('POST', `/api/mail/accounts/${encodeURIComponent(username)}/toggle`, { enable });
  }

  async setMailCatchall(domainName: string, email: string): Promise<any> {
    return this.request('POST', `/api/mail/domains/${encodeURIComponent(domainName)}/catchall`, { email });
  }

  async removeMailCatchall(domainName: string): Promise<any> {
    return this.request('DELETE', `/api/mail/domains/${encodeURIComponent(domainName)}/catchall`);
  }

  async addMailForward(email: string, destination: string, keepCopy?: boolean): Promise<any> {
    return this.request('POST', '/api/mail/forwards', { email, destination, keepCopy });
  }

  async deleteMailForward(email: string): Promise<any> {
    return this.request('DELETE', `/api/mail/forwards/${encodeURIComponent(email)}`);
  }

  // ─── Database actions ─────────────────────────────────────────────────────

  async createDatabase(dbName: string, clientName?: string, charset?: string, collation?: string): Promise<any> {
    return this.request('POST', '/api/databases', { dbName, clientName, charset, collation });
  }

  async deleteDatabase(dbName: string): Promise<any> {
    // Route matches by nname, which createDatabase's route derives as `db_${dbName}`.
    return this.request('DELETE', `/api/databases/${encodeURIComponent(`db_${dbName}`)}`);
  }

  async createDatabaseUser(dbUserName: string, password: string, host?: string, clientName?: string): Promise<any> {
    return this.request('POST', '/api/databases/users', { dbUserName, password, host, clientName });
  }

  async grantDatabasePrivileges(dbUserName: string, dbName: string, privileges: string[]): Promise<any> {
    // Route matches the user by nname, which createDatabaseUser's route derives as `dbuser_${dbUserName}`.
    return this.request('POST', `/api/databases/users/${encodeURIComponent(`dbuser_${dbUserName}`)}/grant`, { dbName, privileges });
  }

  // ─── FTP actions ───────────────────────────────────────────────────────────

  async createFtpAccount(params: { username: string; password: string; domainName?: string; homedir?: string; quota?: number; clientName?: string }): Promise<any> {
    return this.request('POST', '/api/ftp', params);
  }

  async deleteFtpAccount(username: string): Promise<any> {
    return this.request('DELETE', `/api/ftp/${encodeURIComponent(username)}`);
  }

  async changeFtpPassword(username: string, password: string): Promise<any> {
    return this.request('POST', `/api/ftp/${encodeURIComponent(username)}/change-password`, { password });
  }

  // ─── SSL / Let's Encrypt actions ───────────────────────────────────────────

  async issueSslCertificate(domainName: string, email?: string, additionalDomains?: string[]): Promise<any> {
    return this.request('POST', '/api/letsencrypt/issue', { domainName, email, additionalDomains });
  }

  async renewSslCertificate(domainName: string): Promise<any> {
    return this.request('POST', '/api/letsencrypt/renew', { domainName });
  }

  async revokeSslCertificate(domainName: string): Promise<any> {
    return this.request('POST', '/api/letsencrypt/revoke', { domainName });
  }

  // ─── Notification (Phase 5 — not gated by delegation) ────────────────────

  async notify(severity: 'info' | 'warning' | 'critical', title: string, message: string): Promise<any> {
    return this.request('POST', '/api/aiagent/notify', { severity, title, message });
  }
}

let hcpApiClient: HcpApiClient | null = null;

export function getHcpApiClient(): HcpApiClient {
  if (!hcpApiClient) {
    hcpApiClient = new HcpApiClient();
  }
  return hcpApiClient;
}
