/**
 * AI Agent Assistant (AiAgentAssistant)
 * Credential Manager - Secure credential storage
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logger';

const execAsync = promisify(exec);

/**
 * Credential Manager using Linux Kernel Keyring with File Fallback
 * 
 * Provides secure credential storage using the kernel keyring service.
 * Falls back to file-based storage when keyring is not available (Windows/WSL).
 * Credentials are stored in kernel memory and are not accessible via /proc.
 * Auto-clears on logout/reboot unless persisted.
 */
export class CredentialManager {
  private keyringHelper: string;
  private useKeyring: boolean = true;
  private credentialDir: string;

  constructor(keyringHelperPath?: string) {
    // Try environment variable first, then absolute path, then relative
    if (keyringHelperPath) {
      this.keyringHelper = keyringHelperPath;
    } else if (process.env.KEYRING_HELPER_PATH) {
      this.keyringHelper = process.env.KEYRING_HELPER_PATH;
    } else {
      // Default: resolve from project root
      // In production: /opt/aiagentassistant/app/scripts/keyring-helper.sh
      // When running from dist: resolve to ../scripts/keyring-helper.sh
      const scriptPath = path.resolve(__dirname, '../../scripts/keyring-helper.sh');
      if (fs.existsSync(scriptPath)) {
        this.keyringHelper = scriptPath;
      } else {
        // Fallback to working directory relative path
        this.keyringHelper = path.resolve(process.cwd(), 'scripts/keyring-helper.sh');
      }
    }

    // Setup fallback file storage location
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    this.credentialDir = path.join(homeDir, '.config', 'aiagentassistant', 'credentials');
    if (!fs.existsSync(this.credentialDir)) {
      fs.mkdirSync(this.credentialDir, { recursive: true, mode: 0o700 });
    }
    
    logger.debug({ path: this.keyringHelper }, 'CredentialManager initialized with keyring helper path');
  }

  /**
   * Check if keyring-helper.sh exists and is executable
   */
  private keyringAvailable(): boolean {
    return fs.existsSync(this.keyringHelper);
  }

  /**
   * Store a credential - uses keyring if available, falls back to file
   */
  async setCredential(key: string, value: string): Promise<void> {
    // Try keyring first if available
    if (this.keyringAvailable()) {
      try {
        await execAsync(`${this.keyringHelper} set "${key}" "${value}"`);
        logger.info({ key }, 'Credential stored in keyring');
        return;
      } catch (error: any) {
        const errorMsg = error.message || '';
        if (errorMsg.includes('keyctl: command not found')) {
          logger.warn('keyctl not available, falling back to file storage');
          this.useKeyring = false;
        } else {
          logger.warn(`Keyring storage failed (${error.message}), falling back to file storage`);
          this.useKeyring = false;
        }
      }
    }

    // Fallback: store in file
    try {
      const credPath = path.join(this.credentialDir, `${key}.txt`);
      fs.writeFileSync(credPath, value, { mode: 0o600 });
      logger.info({ key, path: credPath }, 'Credential stored in file (keyring not available)');
    } catch (error: any) {
      logger.error({ key, error: error.message }, 'Failed to store credential in file');
      throw new Error(`Failed to store credential: ${error.message}`);
    }
  }

  /**
   * Retrieve a credential - tries keyring first, falls back to file
   */
  async getCredential(key: string): Promise<string> {
    // Try keyring first if available
    if (this.keyringAvailable() && this.useKeyring) {
      try {
        const { stdout } = await execAsync(`${this.keyringHelper} get "${key}"`);
        return stdout.trim();
      } catch (error: any) {
        logger.warn(`Keyring retrieval failed, falling back to file storage: ${error.message}`);
        this.useKeyring = false;
      }
    }

    // Fallback: retrieve from file
    try {
      const credPath = path.join(this.credentialDir, `${key}.txt`);
      if (!fs.existsSync(credPath)) {
        throw new Error(`Credential not found: ${key}`);
      }
      return fs.readFileSync(credPath, 'utf-8').trim();
    } catch (error: any) {
      logger.error({ key, error: error.message }, 'Failed to retrieve credential from file');
      throw new Error(`Failed to retrieve credential: ${error.message}`);
    }
  }

  /**
   * Delete a credential - deletes from both keyring and file
   */
  async deleteCredential(key: string): Promise<void> {
    // Try keyring first if available
    if (this.keyringAvailable() && this.useKeyring) {
      try {
        await execAsync(`${this.keyringHelper} delete "${key}"`);
        logger.info({ key }, 'Credential deleted from keyring');
      } catch (error: any) {
        logger.warn(`Failed to delete from keyring: ${error.message}`);
      }
    }

    // Also delete from file if it exists
    const credPath = path.join(this.credentialDir, `${key}.txt`);
    if (fs.existsSync(credPath)) {
      try {
        fs.unlinkSync(credPath);
        logger.info({ key, path: credPath }, 'Credential deleted from file');
      } catch (error: any) {
        logger.error({ key, error: error.message }, 'Failed to delete credential from file');
        throw new Error(`Failed to delete credential: ${error.message}`);
      }
    }
  }

  /**
   * List all stored credentials (keys only, not values)
   */
  async listCredentials(): Promise<string[]> {
    const keys: string[] = [];

    // List from keyring if available
    if (this.keyringAvailable() && this.useKeyring) {
      try {
        const { stdout } = await execAsync(`${this.keyringHelper} list`);
        
        // Parse keyctl output to extract key names
        const lines = stdout.split('\n');
        for (const line of lines) {
          // Look for user keys in format: "123456789: --alswrv  1000  1000   user: KEY_NAME"
          const match = line.match(/user:\s+(\S+)/);
          if (match) {
            keys.push(match[1]);
          }
        }
      } catch (error: any) {
        logger.warn(`Failed to list keyring credentials: ${error.message}`);
      }
    }

    // List from file storage
    try {
      if (fs.existsSync(this.credentialDir)) {
        const files = fs.readdirSync(this.credentialDir).filter((f) => f.endsWith('.txt'));
        files.forEach((file) => {
          const key = file.replace('.txt', '');
          if (!keys.includes(key)) {
            keys.push(key);
          }
        });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to list file credentials');
    }
    
    return keys;
  }

  /**
   * Get a credential from keyring, fallback to environment variable
   */
  async getCredentialOrEnv(key: string, envVar?: string): Promise<string | null> {
    try {
      // Try keyring first
      return await this.getCredential(key);
    } catch {
      // Fallback to environment variable
      const envKey = envVar || key;
      return process.env[envKey] || null;
    }
  }

  /**
   * Migrate environment variables to kernel keyring
   */
  async migrateFromEnv(envVars: string[]): Promise<number> {
    let migrated = 0;
    
    for (const envVar of envVars) {
      const value = process.env[envVar];
      if (value) {
        try {
          await this.setCredential(envVar, value);
          migrated++;
          logger.info({ envVar }, 'Migrated credential to keyring');
        } catch (error: any) {
          logger.warn({ envVar, error: error.message }, 'Failed to migrate credential');
        }
      }
    }
    
    return migrated;
  }

  /**
   * Check if keyring is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('which keyctl');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance
 */
let credentialManager: CredentialManager | null = null;

export function getCredentialManager(): CredentialManager {
  if (!credentialManager) {
    credentialManager = new CredentialManager();
  }
  return credentialManager;
}

/**
 * Load credentials for the application
 * Tries keyring first, falls back to environment variables
 */
export async function loadCredentials(): Promise<Record<string, string>> {
  logger.info('🔐 Starting credential load from keyring...');
  
  const manager = getCredentialManager();
  const credentials: Record<string, string> = {};
  
  // List of sensitive credentials to load
  const credentialKeys = [
    'TELEGRAM_BOT_TOKEN',
    'AI_API_KEY',
    'GITHUB_COPILOT_API_KEY',
    'EMAIL_PASSWORD',
    'SMTP_PASSWORD',
    'DATABASE_PASSWORD',
    'REDIS_PASSWORD',
  ];
  
  logger.debug({ keys: credentialKeys }, 'Attempting to load credentials');
  
  for (const key of credentialKeys) {
    try {
      const value = await manager.getCredentialOrEnv(key);
      if (value) {
        credentials[key] = value;
        logger.debug({ key, source: value === process.env[key] ? 'env' : 'keyring' }, `Loaded ${key}`);
      }
    } catch (error: any) {
      logger.debug({ key, error: error.message }, 'Credential not found in keyring or env');
    }
  }
  
  logger.info({ count: Object.keys(credentials).length, keys: Object.keys(credentials) }, '✅ Credentials loaded');
  return credentials;
}
