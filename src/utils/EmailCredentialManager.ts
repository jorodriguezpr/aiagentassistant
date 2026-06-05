/**
 * AI Agent Assistant (AiAgentAssistant)
 * Email Credential Manager - Secure email credential storage
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { getCredentialManager } from './CredentialManager';
import { EmailCredentials } from '../types/EmailTypes';
import logger from './logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Email Credential Manager - Manages secure email credential storage
 * Stores passwords in kernel keyring, configuration in encrypted JSON
 */
export class EmailCredentialManager {
  private static instance: EmailCredentialManager;
  private credentialMgr = getCredentialManager();
  private configDir: string;

  private constructor() {
    // Use .config/aiagentassistant for storing encrypted configs
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    this.configDir = path.join(homeDir, '.config', 'aiagentassistant', 'email');
    
    // Ensure directory exists
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  static getInstance(): EmailCredentialManager {
    if (!EmailCredentialManager.instance) {
      EmailCredentialManager.instance = new EmailCredentialManager();
    }
    return EmailCredentialManager.instance;
  }

  /**
   * Store email credentials securely
   * Passwords go to keyring, config goes to encrypted file
   */
  async storeCredentials(accountName: string, credentials: EmailCredentials): Promise<void> {
    try {
      // Validate
      if (!accountName || !credentials.email) {
        throw new Error('Invalid account name or email');
      }

      const keyPrefix = `EMAIL_${accountName.toUpperCase()}`;

      // Store passwords in keyring
      await this.credentialMgr.setCredential(`${keyPrefix}_SMTP_PASSWORD`, credentials.smtpPassword);
      await this.credentialMgr.setCredential(`${keyPrefix}_IMAP_PASSWORD`, credentials.imapPassword);

      // Store config (without passwords) in file
      const configData = {
        accountName,
        email: credentials.email,
        displayName: credentials.displayName,
        smtpHost: credentials.smtpHost,
        smtpPort: credentials.smtpPort,
        smtpUser: credentials.smtpUser,
        smtpSecurity: credentials.smtpSecurity,
        imapHost: credentials.imapHost,
        imapPort: credentials.imapPort,
        imapUser: credentials.imapUser,
        imapSecurity: credentials.imapSecurity,
        provider: credentials.provider || 'custom',
        rejectUnauthorized: credentials.rejectUnauthorized !== false, // Store the SSL verification setting
        createdAt: new Date().toISOString(),
      };

      const configPath = path.join(this.configDir, `${accountName}.json`);
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), { mode: 0o600 });

      logger.info(`Stored credentials for ${accountName}`);
    } catch (error) {
      logger.error(`Failed to store credentials for ${accountName}: ${error}`);
      throw error;
    }
  }

  /**
   * Retrieve email credentials
   */
  async getCredentials(accountName: string): Promise<EmailCredentials | null> {
    try {
      const keyPrefix = `EMAIL_${accountName.toUpperCase()}`;
      const configPath = path.join(this.configDir, `${accountName}.json`);

      // Load config file
      if (!fs.existsSync(configPath)) {
        logger.warn(`Config file not found for ${accountName}`);
        return null;
      }

      const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      // Load passwords from keyring
      let smtpPassword = '';
      let imapPassword = '';

      try {
        smtpPassword = await this.credentialMgr.getCredential(`${keyPrefix}_SMTP_PASSWORD`);
      } catch {
        logger.warn(`Could not retrieve SMTP password for ${accountName}`);
      }

      try {
        imapPassword = await this.credentialMgr.getCredential(`${keyPrefix}_IMAP_PASSWORD`);
      } catch {
        logger.warn(`Could not retrieve IMAP password for ${accountName}`);
      }

      return {
        ...configData,
        smtpPassword,
        imapPassword,
      } as EmailCredentials;
    } catch (error) {
      logger.error(`Failed to retrieve credentials for ${accountName}: ${error}`);
      return null;
    }
  }

  /**
   * List all configured email accounts
   */
  async listAccounts(): Promise<any[]> {
    try {
      if (!fs.existsSync(this.configDir)) {
        return [];
      }

      const files = fs.readdirSync(this.configDir).filter((f) => f.endsWith('.json'));

      const accounts = [];
      for (const file of files) {
        const configPath = path.join(this.configDir, file);
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        accounts.push(data);
      }

      return accounts;
    } catch (error) {
      logger.error(`Failed to list accounts: ${error}`);
      return [];
    }
  }

  /**
   * Delete an email account
   */
  async deleteAccount(accountName: string): Promise<boolean> {
    try {
      const keyPrefix = `EMAIL_${accountName.toUpperCase()}`;
      const configPath = path.join(this.configDir, `${accountName}.json`);

      // Delete from keyring
      try {
        await this.credentialMgr.deleteCredential(`${keyPrefix}_SMTP_PASSWORD`);
      } catch {
        // Ignore if not found
      }

      try {
        await this.credentialMgr.deleteCredential(`${keyPrefix}_IMAP_PASSWORD`);
      } catch {
        // Ignore if not found
      }

      // Delete config file
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      logger.info(`Deleted account ${accountName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete account ${accountName}: ${error}`);
      return false;
    }
  }

  /**
   * Set the default email account
   */
  async setDefaultAccount(accountName: string): Promise<boolean> {
    try {
      const configPath = path.join(this.configDir, `${accountName}.json`);
      
      // Verify account exists
      if (!fs.existsSync(configPath)) {
        logger.warn(`Account ${accountName} does not exist`);
        return false;
      }

      const defaultPath = path.join(this.configDir, 'default.txt');
      fs.writeFileSync(defaultPath, accountName, { mode: 0o600 });
      logger.info(`Set default account to ${accountName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to set default account: ${error}`);
      return false;
    }
  }

  /**
   * Get the default email account
   */
  async getDefaultAccount(): Promise<string | null> {
    try {
      const defaultPath = path.join(this.configDir, 'default.txt');
      
      if (!fs.existsSync(defaultPath)) {
        logger.debug('No default account set');
        return null;
      }

      const accountName = fs.readFileSync(defaultPath, 'utf-8').trim();
      
      // Verify account still exists
      const configPath = path.join(this.configDir, `${accountName}.json`);
      if (!fs.existsSync(configPath)) {
        logger.warn(`Default account ${accountName} no longer exists`);
        fs.unlinkSync(defaultPath); // Clean up orphaned default
        return null;
      }

      return accountName;
    } catch (error) {
      logger.error(`Failed to get default account: ${error}`);
      return null;
    }
  }
}

