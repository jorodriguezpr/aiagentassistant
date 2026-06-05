/**
 * AI Agent Assistant (AiAgentAssistant)
 * Email Service - SMTP/IMAP email functionality
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Type stubs for modules without @types
type ImapCallback = (err: Error | null, mailbox?: any) => void;
type ImapSearchCallback = (err: Error | null, results?: any[]) => void;
type ParsedMail = any;
type ImapMessage = any;
type ImapBoxes = any;
import {
  EmailCredentials,
  EmailMessage,
  EmailSendResult,
  EmailReadResult,
  ReceivedEmail,
  EmailFolder,
  EmailStats,
  EmailConfig as EmailConfigType,
} from '../types/EmailTypes';
import { EmailCredentialManager } from './EmailCredentialManager';
import { EmailValidator } from './EmailValidator';
import logger from './logger';

/**
 * Backward compatibility - old EmailConfig
 */
export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  };
  from: {
    name: string;
    email: string;
  };
}

/**
 * Comprehensive Email Service
 * Handles both SMTP (sending) and IMAP (reading)
 */
export class EmailService {
  private smtpTransporter: Transporter | null = null;
  private imapConnection: any | null = null;
  private credentials: EmailCredentials | null = null;
  private config: EmailConfigType | null = null;
  private stats: EmailStats = {
    totalSent: 0,
    totalReceived: 0,
    failedAttempts: 0,
    averageSendTime: 0,
    averageReadTime: 0,
  };
  private static instance: EmailService;
  private connectedSMTP = false;
  private connectedIMAP = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Initialize email service with credentials (new API)
   */
  async initializeWithCredentials(
    credentialsOrName: EmailCredentials | string,
    config?: Partial<EmailConfigType>
  ): Promise<boolean> {
    try {
      // Load credentials if string (from keyring)
      if (typeof credentialsOrName === 'string') {
        const credManager = EmailCredentialManager.getInstance();
        const creds = await credManager.getCredentials(credentialsOrName);
        if (!creds) {
          logger.error({ name: credentialsOrName }, 'Credentials not found in keyring');
          return false;
        }
        this.credentials = creds;
      } else {
        this.credentials = credentialsOrName;
      }

      // Validate credentials
      const validation = EmailValidator.validateCredentials(this.credentials);
      if (!validation.valid) {
        logger.error({ errors: validation.errors }, 'Invalid credentials');
        return false;
      }

      // Set configuration
      this.config = {
        credentials: this.credentials,
        retryAttempts: config?.retryAttempts || 3,
        retryDelay: config?.retryDelay || 1000,
        timeout: config?.timeout || 10000,
        maxConnections: config?.maxConnections || 5,
      };

      // Test connections
      const test = await EmailValidator.testConnection(this.credentials);
      if (!test.smtp.success) {
        logger.error({ error: test.smtp.error }, 'SMTP connection test failed');
        return false;
      }
      if (!test.imap.success) {
        logger.error({ error: test.imap.error }, 'IMAP connection test failed');
        return false;
      }

      // Initialize SMTP transporter
      const rejectUnauthorized = this.credentials.rejectUnauthorized !== false; // Default: true
      this.smtpTransporter = nodemailer.createTransport({
        host: this.credentials.smtpHost,
        port: this.credentials.smtpPort,
        secure: this.credentials.smtpSecurity === 'ssl',
        auth: {
          user: this.credentials.smtpUser,
          pass: this.credentials.smtpPassword,
        },
        tls: {
          rejectUnauthorized,
        },
      });

      this.connectedSMTP = true;

      logger.info(
        { email: this.credentials.email, provider: this.credentials.provider },
        'Email service initialized successfully'
      );

      return true;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to initialize email service'
      );
      return false;
    }
  }

  /**
   * Backward compatibility - old initialize method
   */
  async initialize(config?: EmailConfig): Promise<void> {
    try {
      // If no config provided, try to load from environment
      if (!config) {
        config = await this.loadConfigFromEnv();
      }

      // Create SMTP transporter
      this.smtpTransporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.auth,
        connectionTimeout: 10000,
        socketTimeout: 10000,
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
      });

      // Verify connection
      await this.smtpTransporter.verify();
      this.connectedSMTP = true;

      logger.info(
        {
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure,
          user: config.smtp.auth?.user,
        },
        'Email service initialized (backward compatible)'
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to initialize email service');
      throw error;
    }
  }

  /**
   * Load email configuration from environment variables
   */
  private async loadConfigFromEnv(): Promise<EmailConfig> {
    let smtpPassword = process.env.SMTP_PASSWORD || '';

    let emailPassword = process.env.EMAIL_PASSWORD || smtpPassword;

    const config: EmailConfig = {
      smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || process.env.EMAIL_USER || '',
          pass: emailPassword || smtpPassword,
        },
      },
      from: {
        name: process.env.EMAIL_FROM_NAME || 'AI Agent Assistant',
        email: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
      },
    };

    if (!config.smtp.auth?.user || !config.smtp.auth?.pass) {
      throw new Error('SMTP credentials not configured');
    }

    return config;
  }

  /**
   * Send an email
   */
  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.smtpTransporter || !this.connectedSMTP) {
      return {
        success: false,
        error: 'Email service not initialized or SMTP not connected',
        timestamp: new Date(),
      };
    }

    if (!this.credentials) {
      return {
        success: false,
        error: 'No email credentials loaded',
        timestamp: new Date(),
      };
    }

    const startTime = Date.now();
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < (this.config?.retryAttempts || 3)) {
      try {
        const mailOptions = {
          from: message.from || `${this.credentials.displayName || ''} <${this.credentials.email}>`,
          to: message.to,
          cc: message.cc,
          bcc: message.bcc,
          subject: message.subject,
          text: message.text,
          html: message.html,
          replyTo: message.replyTo,
          attachments: message.attachments,
          headers: message.headers,
        };

        const info = await this.smtpTransporter.sendMail(mailOptions);

        const sendTime = Date.now() - startTime;
        this.stats.totalSent++;
        this.stats.lastSentTime = new Date();
        this.stats.averageSendTime =
          (this.stats.averageSendTime * (this.stats.totalSent - 1) + sendTime) / this.stats.totalSent;

        logger.info(
          { messageId: info.messageId, sendTime, to: message.to },
          'Email sent successfully'
        );

        return {
          success: true,
          messageId: info.messageId,
          timestamp: new Date(),
        };
      } catch (error) {
        attempts++;
        lastError = error instanceof Error ? error.message : String(error);
        logger.warn(
          { attempt: attempts, error: lastError },
          'Failed to send email, retrying...'
        );

        if (attempts < (this.config?.retryAttempts || 3)) {
          await this.delay(this.config?.retryDelay || 1000);
        }
      }
    }

    this.stats.failedAttempts++;
    return {
      success: false,
      error: lastError || 'Failed to send email after retries',
      timestamp: new Date(),
    };
  }

  /**
   * Connect to IMAP server
   */
  private connectIMAP(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.credentials) {
        reject(new Error('Credentials not set'));
        return;
      }

      try {
        const rejectUnauthorized = this.credentials.rejectUnauthorized !== false; // Default: true
        this.imapConnection = new Imap({
          user: this.credentials.imapUser,
          password: this.credentials.imapPassword,
          host: this.credentials.imapHost,
          port: this.credentials.imapPort,
          tls: this.credentials.imapSecurity !== 'none',
          tlsOptions: { rejectUnauthorized },
        });

        const timeout = setTimeout(() => {
          if (this.imapConnection) {
            this.imapConnection.destroy();
          }
          reject(new Error('IMAP connection timeout'));
        }, this.config?.timeout || 10000);

        this.imapConnection.on('ready', () => {
          clearTimeout(timeout);
          this.connectedIMAP = true;
          resolve();
        });

        this.imapConnection.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });

        this.imapConnection.on('end', () => {
          this.connectedIMAP = false;
        });

        this.imapConnection.connect();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Read emails from a folder
   */
  async readEmails(
    folder: string = 'INBOX',
    limit: number = 10,
    unreadOnly: boolean = false
  ): Promise<EmailReadResult> {
    if (!this.credentials) {
      return {
        success: false,
        error: 'Email service not initialized',
        count: 0,
      };
    }

    const startTime = Date.now();

    try {
      if (!this.connectedIMAP) {
        await this.connectIMAP();
      }

      if (!this.imapConnection) {
        return {
          success: false,
          error: 'IMAP connection failed',
          count: 0,
        };
      }

      return new Promise((resolve) => {
        try {
          this.imapConnection!.openBox(folder, false, (err: any, mailbox: any) => {
            if (err) {
              logger.error(
                { error: err.message, folder },
                'Failed to open mailbox'
              );
              resolve({
                success: false,
                error: err.message,
                count: 0,
              });
              return;
            }

            const searchCriteria = unreadOnly ? ['UNSEEN'] : ['ALL'];
            this.imapConnection!.search(searchCriteria, (err: any, results: any) => {
              if (err) {
                logger.error({ error: err.message }, 'Search failed');
                resolve({
                  success: false,
                  error: err.message,
                  count: 0,
                });
                return;
              }

              if (!results || results.length === 0) {
                resolve({
                  success: true,
                  emails: [],
                  count: 0,
                  folder,
                });
                return;
              }

              const messageIds = results.slice(-limit);
              const f = this.imapConnection!.fetch(messageIds, { bodies: '' });
              const emails: ReceivedEmail[] = [];

              f.on('message', (msg: any, seqno: any) => {
                let email: Partial<ReceivedEmail> = {
                  id: String(seqno),
                  attachments: [],
                };

                msg.on('body', (stream: any) => {
                  simpleParser(stream, async (err: any, parsed: any) => {
                    if (err) {
                      logger.error({ error: err.message }, 'Failed to parse email');
                      return;
                    }

                    email.from = parsed.from?.text || '';
                    email.to = parsed.to?.text || '';
                    email.subject = parsed.subject || '';
                    email.text = parsed.text;
                    email.html = parsed.html;
                    email.date = parsed.date;

                    if (parsed.attachments && parsed.attachments.length > 0) {
                      email.attachments = parsed.attachments.map((att: any) => ({
                        filename: att.filename || 'unnamed',
                        contentType: att.contentType,
                      }));
                    }
                  });
                });

                msg.on('attributes', (attrs: any) => {
                  email.read = !attrs.flags.includes('\\Unseen');
                });

                msg.on('end', () => {
                  if (email.from && email.to && email.subject) {
                    emails.push(email as ReceivedEmail);
                  }
                });
              });

              f.on('error', (err: any) => {
                logger.error({ error: err.message }, 'Fetch error');
                resolve({
                  success: false,
                  error: err.message,
                  count: 0,
                });
              });

              f.on('end', () => {
                const readTime = Date.now() - startTime;
                this.stats.totalReceived += emails.length;
                this.stats.lastReceivedTime = new Date();
                this.stats.averageReadTime =
                  (this.stats.averageReadTime * (this.stats.totalReceived - emails.length) +
                    readTime) /
                  Math.max(1, this.stats.totalReceived);

                resolve({
                  success: true,
                  emails,
                  count: emails.length,
                  folder,
                });
              });
            });
          });
        } catch (error) {
          logger.error(
            { error: error instanceof Error ? error.message : String(error) },
            'Error reading emails'
          );
          resolve({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            count: 0,
          });
        }
      });
    } catch (error) {
      this.stats.failedAttempts++;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        count: 0,
      };
    }
  }

  /**
   * Get list of folders
   */
  async getFolders(): Promise<EmailFolder[]> {
    if (!this.connectedIMAP) {
      await this.connectIMAP();
    }

    if (!this.imapConnection) {
      return [];
    }

    return new Promise((resolve) => {
      this.imapConnection!.getBoxes((err: Error | null, boxes: ImapBoxes) => {
        if (err) {
          logger.error({ error: err.message }, 'Failed to get folders');
          resolve([]);
          return;
        }

        const folders: EmailFolder[] = [];

        const processBox = (box: any, name: string) => {
          folders.push({
            name,
            path: name,
            unreadCount: 0,
            totalCount: 0,
          });

          if (box.children) {
            for (const key in box.children) {
              processBox(box.children[key], `${name}/${key}`);
            }
          }
        };

        for (const key in boxes) {
          processBox(boxes[key], key);
        }

        resolve(folders);
      });
    });
  }

  /**
   * Get email statistics
   */
  getStats(): EmailStats {
    return { ...this.stats };
  }

  /**
   * Get current email configuration
   */
  getConfig(): EmailConfigType | null {
    return this.config || null;
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    try {
      if (this.imapConnection && this.connectedIMAP) {
        this.imapConnection.end();
        this.connectedIMAP = false;
      }
      if (this.smtpTransporter) {
        this.smtpTransporter.close();
        this.connectedSMTP = false;
      }
      logger.info('Email service connections closed');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error closing email service'
      );
    }
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.smtpTransporter) {
      return false;
    }

    try {
      await this.smtpTransporter.verify();
      return true;
    } catch (error) {
      logger.error({ error }, 'SMTP connection verification failed');
      return false;
    }
  }

  /**
   * Utility: delay function for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Export singleton
 */
export function getEmailService(): EmailService {
  return EmailService.getInstance();
}
