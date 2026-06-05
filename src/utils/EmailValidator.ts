/**
 * AI Agent Assistant (AiAgentAssistant)
 * Email Validator - Validate email configurations
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import * as nodemailer from 'nodemailer';
const Imap = require('imap');
import { EmailCredentials, EmailConnectionTest, EmailProviderConfig } from '../types/EmailTypes';
import logger from './logger';

// Type stub for IMAP
type IMapConnection = any;

/**
 * Email Validator - Validates credentials and provides provider configs
 */
export class EmailValidator {
  /**
   * Get provider configuration
   */
  static getProviderConfig(provider: string): EmailProviderConfig | null {
    const configs: Record<string, EmailProviderConfig> = {
      gmail: {
        name: 'gmail',
        displayName: 'Gmail',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        security: 'tls',
        requiresAppPassword: true,
        setupUrl: 'https://myaccount.google.com/apppasswords',
        notes: 'Requires 2FA and app-specific password',
      },
      outlook: {
        name: 'outlook',
        displayName: 'Outlook/Hotmail',
        smtpHost: 'smtp-mail.outlook.com',
        smtpPort: 587,
        imapHost: 'outlook.office365.com',
        imapPort: 993,
        security: 'tls',
        setupUrl: 'https://account.microsoft.com/account',
      },
      yahoo: {
        name: 'yahoo',
        displayName: 'Yahoo',
        smtpHost: 'smtp.mail.yahoo.com',
        smtpPort: 465,
        imapHost: 'imap.mail.yahoo.com',
        imapPort: 993,
        security: 'ssl',
        requiresAppPassword: true,
        setupUrl: 'https://account.yahoo.com/account/security',
      },
      protonmail: {
        name: 'protonmail',
        displayName: 'ProtonMail',
        smtpHost: 'smtp.protonmail.com',
        smtpPort: 587,
        imapHost: 'imap.protonmail.com',
        imapPort: 993,
        security: 'tls',
        notes: 'Requires IMAP/SMTP bridge setup',
      },
      yandex: {
        name: 'yandex',
        displayName: 'Yandex',
        smtpHost: 'smtp.yandex.com',
        smtpPort: 465,
        imapHost: 'imap.yandex.com',
        imapPort: 993,
        security: 'ssl',
      },
      zoho: {
        name: 'zoho',
        displayName: 'Zoho',
        smtpHost: 'smtp.zoho.com',
        smtpPort: 587,
        imapHost: 'imap.zoho.com',
        imapPort: 993,
        security: 'tls',
      },
    };

    return configs[provider.toLowerCase()] || null;
  }

  /**
   * Test email connection (SMTP and IMAP)
   */
  static async testConnection(credentials: EmailCredentials): Promise<EmailConnectionTest> {
    const result: EmailConnectionTest = {
      smtp: { success: false },
      imap: { success: false },
      email: credentials.email,
    };

    // Test SMTP
    try {
      const smtpStart = Date.now();
      const rejectUnauthorized = credentials.rejectUnauthorized !== false; // Default: true
      const transporter = nodemailer.createTransport({
        host: credentials.smtpHost,
        port: credentials.smtpPort,
        secure: credentials.smtpSecurity === 'ssl',
        auth: {
          user: credentials.smtpUser,
          pass: credentials.smtpPassword,
        },
        connectionTimeout: 5000,
        socketTimeout: 5000,
        tls: {
          rejectUnauthorized,
        },
      });

      await transporter.verify();
      result.smtp.success = true;
      result.smtp.latency = Date.now() - smtpStart;
      logger.info(`SMTP test passed for ${credentials.email} (${result.smtp.latency}ms)`);
    } catch (error) {
      result.smtp.error = error instanceof Error ? error.message : 'SMTP verification failed';
      logger.warn(`SMTP test failed for ${credentials.email}: ${result.smtp.error}`);
    }

    // Test IMAP
    try {
      const imapStart = Date.now();
      const rejectUnauthorized = credentials.rejectUnauthorized !== false; // Default: true
      const imap = new (Imap as any)({
        user: credentials.imapUser,
        password: credentials.imapPassword,
        host: credentials.imapHost,
        port: credentials.imapPort,
        tls: credentials.imapSecurity !== 'none',
        tlsOptions: { rejectUnauthorized },
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          try {
            imap.destroy();
          } catch (e) {}
          reject(new Error('IMAP connection timeout'));
        }, 5000);

        // Wait for ready event before opening box
        imap.on('ready', () => {
          clearTimeout(timeout);
          imap.openBox('INBOX', false, (err: Error | null) => {
            if (err) {
              try {
                imap.end();
              } catch (e) {}
              reject(err);
            } else {
              try {
                imap.end();
              } catch (e) {}
              resolve();
            }
          });
        });

        imap.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });

        // Start connection (Imap auto-connects on instantiation)
        try {
          imap.connect();
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });

      result.imap.success = true;
      result.imap.latency = Date.now() - imapStart;
      logger.info(`IMAP test passed for ${credentials.email} (${result.imap.latency}ms)`);
    } catch (error) {
      result.imap.error = error instanceof Error ? error.message : 'IMAP connection failed';
      logger.warn(`IMAP test failed for ${credentials.email}: ${result.imap.error}`);
    }

    return result;
  }

  /**
   * Validate email format
   */
  static validateEmailFormat(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get recommended ports based on security type
   */
  static getRecommendedPorts(securityType: 'tls' | 'ssl' | 'none'): { smtp: number; imap: number } {
    switch (securityType) {
      case 'ssl':
        return { smtp: 465, imap: 993 };
      case 'tls':
        return { smtp: 587, imap: 993 };
      case 'none':
        return { smtp: 25, imap: 143 };
      default:
        return { smtp: 587, imap: 993 };
    }
  }

  /**
   * Validate email credentials structure
   */
  static validateCredentials(credentials: EmailCredentials): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!credentials.email || !this.validateEmailFormat(credentials.email)) {
      errors.push('Invalid email address');
    }

    if (!credentials.smtpHost) {
      errors.push('Missing SMTP host');
    }

    if (!credentials.smtpPort || credentials.smtpPort < 1 || credentials.smtpPort > 65535) {
      errors.push('Invalid SMTP port');
    }

    if (!credentials.smtpUser || !credentials.smtpPassword) {
      errors.push('Missing SMTP credentials');
    }

    if (!credentials.imapHost) {
      errors.push('Missing IMAP host');
    }

    if (!credentials.imapPort || credentials.imapPort < 1 || credentials.imapPort > 65535) {
      errors.push('Invalid IMAP port');
    }

    if (!credentials.imapUser || !credentials.imapPassword) {
      errors.push('Missing IMAP credentials');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
