import { promises as fs } from 'fs';
import * as path from 'path';
import logger from './logger.js';

/**
 * SSH Host Configuration
 */
export interface SSHHostConfig {
  host: string;
  username?: string;
  port?: number;
  keyPath?: string;
  useKey?: boolean;
}

/**
 * User Preferences Structure
 */
export interface UserPreferences {
  sshHosts: { [hostIdentifier: string]: SSHHostConfig };
  lastUpdated: string;
}

/**
 * User Preferences Manager
 * Manages user-specific preferences like SSH host configurations
 */
export class UserPreferencesManager {
  private preferencesPath: string;
  private preferences: UserPreferences | null = null;

  constructor(preferencesPath?: string) {
    // Default to /opt/aiagentassistant/app/data/user-preferences.json in production
    // or local data directory in development
    this.preferencesPath =
      preferencesPath ||
      process.env.USER_PREFERENCES_PATH ||
      '/opt/aiagentassistant/app/data/user-preferences.json';
  }

  /**
   * Load preferences from disk
   */
  private async loadPreferences(): Promise<UserPreferences> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.preferencesPath);
      await fs.mkdir(dataDir, { recursive: true });

      // Try to read existing preferences
      const data = await fs.readFile(this.preferencesPath, 'utf-8');
      this.preferences = JSON.parse(data);
      logger.info({ path: this.preferencesPath }, 'User preferences loaded');
      return this.preferences!;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - create new preferences
        logger.info({ path: this.preferencesPath }, 'Creating new user preferences file');
        this.preferences = {
          sshHosts: {},
          lastUpdated: new Date().toISOString(),
        };
        await this.savePreferences();
        return this.preferences;
      }
      throw error;
    }
  }

  /**
   * Save preferences to disk
   */
  private async savePreferences(): Promise<void> {
    if (!this.preferences) {
      throw new Error('No preferences to save');
    }

    this.preferences.lastUpdated = new Date().toISOString();
    await fs.writeFile(
      this.preferencesPath,
      JSON.stringify(this.preferences, null, 2),
      'utf-8'
    );
    logger.info({ path: this.preferencesPath }, 'User preferences saved');
  }

  /**
   * Get SSH configuration for a specific host
   */
  async getSSHConfig(host: string, username?: string): Promise<SSHHostConfig | null> {
    if (!this.preferences) {
      await this.loadPreferences();
    }

    // Create host identifier (host or username@host)
    const hostId = username ? `${username}@${host}` : host;
    
    // Check for exact match first
    if (this.preferences!.sshHosts[hostId]) {
      logger.info({ hostId, config: this.preferences!.sshHosts[hostId] }, 'Found SSH config');
      return this.preferences!.sshHosts[hostId];
    }

    // Check for host-only match if username was provided
    if (username && this.preferences!.sshHosts[host]) {
      logger.info({ host, config: this.preferences!.sshHosts[host] }, 'Found SSH config (host-only)');
      return this.preferences!.sshHosts[host];
    }

    logger.info({ hostId }, 'No SSH config found for host');
    return null;
  }

  /**
   * Set SSH configuration for a specific host
   */
  async setSSHConfig(config: SSHHostConfig): Promise<void> {
    if (!this.preferences) {
      await this.loadPreferences();
    }

    // Create host identifier
    const hostId = config.username ? `${config.username}@${config.host}` : config.host;

    this.preferences!.sshHosts[hostId] = config;
    await this.savePreferences();

    logger.info({ hostId, config }, 'SSH config saved');
  }

  /**
   * List all saved SSH configurations
   */
  async listSSHConfigs(): Promise<SSHHostConfig[]> {
    if (!this.preferences) {
      await this.loadPreferences();
    }

    return Object.values(this.preferences!.sshHosts);
  }

  /**
   * Delete SSH configuration for a specific host
   */
  async deleteSSHConfig(host: string, username?: string): Promise<boolean> {
    if (!this.preferences) {
      await this.loadPreferences();
    }

    const hostId = username ? `${username}@${host}` : host;

    if (this.preferences!.sshHosts[hostId]) {
      delete this.preferences!.sshHosts[hostId];
      await this.savePreferences();
      logger.info({ hostId }, 'SSH config deleted');
      return true;
    }

    return false;
  }
}

// Singleton instance
export const userPreferencesManager = new UserPreferencesManager();
