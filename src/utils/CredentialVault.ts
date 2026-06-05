import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import logger from './logger';

/**
 * Credential types supported by the vault
 */
export enum CredentialType {
  SSH_KEY = 'ssh_key',
  PASSWORD = 'password',
  API_KEY = 'api_key',
  TOKEN = 'token',
  CERTIFICATE = 'certificate',
}

/**
 * Stored credential interface
 */
export interface StoredCredential {
  id: string;
  type: CredentialType;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  encryptedValue: string;
  iv: string; // Initialization vector for AES encryption
  metadata?: Record<string, any>;
}

/**
 * Credential vault for secure storage of passwords, SSH keys, and API tokens
 * 
 * Features:
 * - AES-256-GCM encryption at rest
 * - Persistent storage in JSON file
 * - Query/retrieve credentials by name or ID
 * - Automatic credential rotation tracking
 * - Metadata support for additional context
 */
export class CredentialVault {
  private vaultPath: string;
  private masterKey: Buffer;
  private credentials: Map<string, StoredCredential>;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32; // 256 bits

  constructor(vaultPath?: string, masterPassword?: string) {
    // Default vault location in user's config directory
    this.vaultPath = vaultPath || path.join(
      process.env.HOME || process.env.USERPROFILE || '/root',
      '.aiagent',
      'credentials.vault'
    );

    // Generate or derive master key from password
    const password = masterPassword || process.env.VAULT_MASTER_PASSWORD || 'default-key-change-me';
    this.masterKey = crypto.scryptSync(password, 'salt', this.KEY_LENGTH);
    
    this.credentials = new Map();
    this.loadVault();

    logger.info({ vaultPath: this.vaultPath }, '🔐 Credential vault initialized');
  }

  /**
   * Store a new credential
   */
  async storeCredential(
    type: CredentialType,
    name: string,
    value: string,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const id = crypto.randomUUID();
    const { encryptedValue, iv } = this.encrypt(value);

    const credential: StoredCredential = {
      id,
      type,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      encryptedValue,
      iv,
      metadata,
    };

    this.credentials.set(id, credential);
    await this.saveVault();

    logger.info({ 
      id, 
      type, 
      name, 
      hasDescription: !!description 
    }, '✅ Credential stored in vault');

    return id;
  }

  /**
   * Retrieve a credential by name or ID
   */
  getCredential(nameOrId: string): string | null {
    // Try by ID first
    let credential = this.credentials.get(nameOrId);

    // If not found, search by name
    if (!credential) {
      for (const cred of this.credentials.values()) {
        if (cred.name === nameOrId) {
          credential = cred;
          break;
        }
      }
    }

    if (!credential) {
      logger.warn({ nameOrId }, '❌ Credential not found in vault');
      return null;
    }

    // Decrypt and return
    const decrypted = this.decrypt(credential.encryptedValue, credential.iv);
    
    logger.debug({ 
      id: credential.id, 
      name: credential.name, 
      type: credential.type 
    }, '🔓 Credential retrieved from vault');

    return decrypted;
  }

  /**
   * List all stored credentials (without decrypting values)
   */
  listCredentials(type?: CredentialType): Array<Omit<StoredCredential, 'encryptedValue' | 'iv'>> {
    const results: Array<Omit<StoredCredential, 'encryptedValue' | 'iv'>> = [];

    for (const cred of this.credentials.values()) {
      if (type && cred.type !== type) {
        continue;
      }

      results.push({
        id: cred.id,
        type: cred.type,
        name: cred.name,
        description: cred.description,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt,
        metadata: cred.metadata,
      });
    }

    return results;
  }

  /**
   * Update an existing credential
   */
  async updateCredential(
    nameOrId: string,
    newValue: string,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    // Find credential
    let credential: StoredCredential | undefined;
    let credentialId: string | undefined;

    // Try by ID first
    credential = this.credentials.get(nameOrId);
    if (credential) {
      credentialId = nameOrId;
    } else {
      // Search by name
      for (const [id, cred] of this.credentials.entries()) {
        if (cred.name === nameOrId) {
          credential = cred;
          credentialId = id;
          break;
        }
      }
    }

    if (!credential || !credentialId) {
      logger.warn({ nameOrId }, '❌ Credential not found for update');
      return false;
    }

    // Re-encrypt with new value
    const { encryptedValue, iv } = this.encrypt(newValue);
    
    credential.encryptedValue = encryptedValue;
    credential.iv = iv;
    credential.updatedAt = new Date().toISOString();
    
    if (description !== undefined) {
      credential.description = description;
    }
    
    if (metadata !== undefined) {
      credential.metadata = { ...credential.metadata, ...metadata };
    }

    this.credentials.set(credentialId, credential);
    await this.saveVault();

    logger.info({ 
      id: credentialId, 
      name: credential.name 
    }, '✅ Credential updated in vault');

    return true;
  }

  /**
   * Delete a credential
   */
  async deleteCredential(nameOrId: string): Promise<boolean> {
    // Try by ID first
    if (this.credentials.has(nameOrId)) {
      this.credentials.delete(nameOrId);
      await this.saveVault();
      logger.info({ id: nameOrId }, '🗑️ Credential deleted from vault');
      return true;
    }

    // Search by name
    for (const [id, cred] of this.credentials.entries()) {
      if (cred.name === nameOrId) {
        this.credentials.delete(id);
        await this.saveVault();
        logger.info({ id, name: cred.name }, '🗑️ Credential deleted from vault');
        return true;
      }
    }

    logger.warn({ nameOrId }, '❌ Credential not found for deletion');
    return false;
  }

  /**
   * Encrypt a value using AES-256-GCM
   */
  private encrypt(plaintext: string): { encryptedValue: string; iv: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag for GCM mode
    const authTag = cipher.getAuthTag();

    return {
      encryptedValue: encrypted + ':' + authTag.toString('hex'),
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt a value using AES-256-GCM
   */
  private decrypt(encryptedValue: string, ivHex: string): string {
    const [encrypted, authTagHex] = encryptedValue.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Load vault from disk
   */
  private loadVault(): void {
    try {
      // Ensure vault directory exists
      const vaultDir = path.dirname(this.vaultPath);
      if (!fs.existsSync(vaultDir)) {
        fs.mkdirSync(vaultDir, { recursive: true });
      }

      // Load vault file if it exists
      if (fs.existsSync(this.vaultPath)) {
        const vaultData = fs.readFileSync(this.vaultPath, 'utf8');
        const parsed = JSON.parse(vaultData);

        for (const cred of parsed.credentials || []) {
          this.credentials.set(cred.id, cred);
        }

        logger.info({ 
          count: this.credentials.size 
        }, '📂 Loaded credentials from vault');
      } else {
        logger.info('📂 No existing vault found, creating new vault');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to load vault');
    }
  }

  /**
   * Save vault to disk
   */
  private async saveVault(): Promise<void> {
    try {
      const vaultData = {
        version: '1.0',
        lastModified: new Date().toISOString(),
        credentials: Array.from(this.credentials.values()),
      };

      // Write to temp file first, then rename (atomic operation)
      const tempPath = this.vaultPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(vaultData, null, 2), 'utf8');
      fs.renameSync(tempPath, this.vaultPath);

      // Set restrictive permissions (owner read/write only)
      fs.chmodSync(this.vaultPath, 0o600);

      logger.debug({ 
        count: this.credentials.size 
      }, '💾 Vault saved to disk');
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to save vault');
      throw error;
    }
  }

  /**
   * Export vault (for backup purposes)
   */
  exportVault(): string {
    const vaultData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      credentials: Array.from(this.credentials.values()),
    };

    return JSON.stringify(vaultData, null, 2);
  }

  /**
   * Import vault (for restore purposes)
   */
  async importVault(vaultJson: string): Promise<number> {
    try {
      const parsed = JSON.parse(vaultJson);
      let importedCount = 0;

      for (const cred of parsed.credentials || []) {
        this.credentials.set(cred.id, cred);
        importedCount++;
      }

      await this.saveVault();
      logger.info({ importedCount }, '📥 Vault imported successfully');

      return importedCount;
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to import vault');
      throw error;
    }
  }
}

// Export singleton instance
let _vaultInstance: CredentialVault | null = null;

export function getCredentialVault(): CredentialVault {
  if (!_vaultInstance) {
    _vaultInstance = new CredentialVault();
  }
  return _vaultInstance;
}
