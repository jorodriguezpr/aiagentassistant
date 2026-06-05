/**
 * AI Agent Assistant (AiAgentAssistant)
 * Email Skills - Send and receive emails
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { Skill } from '../types';
import { EmailCredentialManager } from '../utils/EmailCredentialManager';
import { EmailValidator } from '../utils/EmailValidator';
import { getEmailService } from '../utils/EmailService';
import logger from '../utils/logger';

/**
 * Email Skills - Complete email management for AI agents
 */

export const configureEmailSkill: Skill = {
  name: 'configure_email',
  description: 'Configure and validate a new email account',
  execute: async (params: Record<string, any>) => {
    try {
      const { accountName, provider, email, password, smtpHost, smtpPort, imapHost, imapPort } = params;

      if (!accountName || !email || !password) {
        return {
          success: false,
          error: 'Missing parameters: accountName, email, password',
        };
      }

      const credentialMgr = EmailCredentialManager.getInstance();
      let credentials;

      // Handle custom provider
      if (provider && provider.toLowerCase() === 'custom') {
        if (!smtpHost || !smtpPort || !imapHost || !imapPort) {
          return {
            success: false,
            error: 'For custom provider, must provide: smtpHost, smtpPort, imapHost, imapPort',
          };
        }

        credentials = {
          email,
          displayName: email.split('@')[0],
          smtpHost,
          smtpPort: parseInt(smtpPort),
          smtpUser: email,
          smtpPassword: password,
          smtpSecurity: (params.smtpSecurity || 'tls') as 'tls' | 'ssl' | 'none',
          imapHost,
          imapPort: parseInt(imapPort),
          imapUser: email,
          imapPassword: password,
          imapSecurity: (params.imapSecurity || 'tls') as 'tls' | 'ssl' | 'none',
          provider: 'custom',
          rejectUnauthorized: params.rejectUnauthorized !== false, // Pass through SSL verification setting
        };
      } else {
        // Handle known providers (gmail, outlook, yahoo, etc)
        const providerConfig = EmailValidator.getProviderConfig(provider);

        if (!providerConfig) {
          return {
            success: false,
            error: `Unknown provider: ${provider}. Use 'custom' for custom servers or choose from: gmail, outlook, yahoo, protonmail, yandex, zoho`,
          };
        }

        credentials = {
          email,
          displayName: email.split('@')[0],
          smtpHost: providerConfig.smtpHost,
          smtpPort: providerConfig.smtpPort,
          smtpUser: email,
          smtpPassword: password,
          smtpSecurity: providerConfig.security as 'tls' | 'ssl' | 'none',
          imapHost: providerConfig.imapHost,
          imapPort: providerConfig.imapPort,
          imapUser: email,
          imapPassword: password,
          imapSecurity: providerConfig.security as 'tls' | 'ssl' | 'none',
          provider: provider.toLowerCase(),
          rejectUnauthorized: params.rejectUnauthorized !== false, // Pass through SSL verification setting
        };
      }

      // Test connection
      const testResult = await EmailValidator.testConnection(credentials as any);
      if (!testResult.smtp.success || !testResult.imap.success) {
        return {
          success: false,
          error: 'Connection test failed',
          smtp: testResult.smtp,
          imap: testResult.imap,
        };
      }

      // Store credentials
      await credentialMgr.storeCredentials(accountName, credentials as any);

      logger.info(`Email account ${accountName} configured`);
      return {
        success: true,
        accountName,
        email,
        provider,
        message: `Account configured successfully`,
      };
    } catch (error: any) {
      logger.error('configure_email error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed',
      };
    }
  },
};

export const sendEmailSkill: Skill = {
  name: 'send_email',
  description: 'Send an email with optional attachments (uses default account if not specified)',
  execute: async (params: Record<string, any>) => {
    try {
      let { accountName, to, subject, body, attachments } = params;

      if (!to || !subject) {
        return {
          success: false,
          error: 'Missing parameters: to, subject (accountName optional, uses default)',
        };
      }

      // If no account specified, use default
      if (!accountName) {
        const credentialMgr = EmailCredentialManager.getInstance();
        accountName = await credentialMgr.getDefaultAccount();
        
        if (!accountName) {
          return {
            success: false,
            error: 'No email account specified and no default account configured. Use /email change to set default.',
          };
        }
      }

      logger.info({ accountName, to, subject }, 'sendEmailSkill: Starting to send email');

      const service = getEmailService();
      
      logger.info({ accountName }, 'sendEmailSkill: Initializing service with credentials');
      await service.initializeWithCredentials(accountName);

      logger.info({ to, subject, hasAttachments: !!attachments }, 'sendEmailSkill: Calling service.sendEmail');
      const result = await service.sendEmail({
        to: Array.isArray(to) ? to : [to],
        subject,
        text: body,
        attachments: attachments || undefined,
      });

      logger.info({ result, accountName }, 'sendEmailSkill: sendEmail result');

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
        accountName, // Include account name in response
        to,
        subject,
      };
    } catch (error) {
      logger.error({ error, params }, 'send_email error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  },
};

export const readEmailSkill: Skill = {
  name: 'read_email',
  description: 'Read emails from a folder',
  execute: async (params: Record<string, any>) => {
    try {
      const { accountName, folder = 'INBOX', count = 10 } = params;

      if (!accountName) {
        return {
          success: false,
          error: 'Missing parameter: accountName',
        };
      }

      const service = getEmailService();
      await service.initializeWithCredentials(accountName);

      const result = await service.readEmails(folder, count);

      if (result.success && result.emails) {
        const formattedEmails = result.emails.map((email) => ({
          from: email.from,
          subject: email.subject,
          date: email.date?.toISOString(),
          unread: !email.read,
        }));

        return {
          success: true,
          folder,
          count: formattedEmails.length,
          emails: formattedEmails,
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to read',
      };
    } catch (error: any) {
      logger.error('read_email error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed',
      };
    }
  },
};

export const listEmailFoldersSkill: Skill = {
  name: 'list_email_folders',
  description: 'List email folders',
  execute: async (params: Record<string, any>) => {
    try {
      const { accountName } = params;

      if (!accountName) {
        return {
          success: false,
          error: 'Missing parameter: accountName',
        };
      }

      const service = getEmailService();
      await service.initializeWithCredentials(accountName);

      const folders = await service.getFolders();

      if (Array.isArray(folders)) {
        return {
          success: true,
          count: folders.length,
          folders: folders.map((f: any) => ({
            name: f.name,
            totalCount: f.totalCount,
            unreadCount: f.unreadCount,
          })),
        };
      }

      return {
        success: false,
        error: 'Failed to list folders',
      };
    } catch (error: any) {
      logger.error('list_email_folders error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed',
      };
    }
  },
};

export const emailStatsSkill: Skill = {
  name: 'email_stats',
  description: 'Get email statistics',
  execute: async (params: Record<string, any>) => {
    try {
      const { accountName } = params;

      if (!accountName) {
        return {
          success: false,
          error: 'Missing parameter: accountName',
        };
      }

      const service = getEmailService();
      await service.initializeWithCredentials(accountName);

      const stats = service.getStats();

      return {
        success: true,
        statistics: {
          totalSent: stats.totalSent,
          totalReceived: stats.totalReceived,
          failedAttempts: stats.failedAttempts,
          averageSendTime: `${stats.averageSendTime}ms`,
          averageReadTime: `${stats.averageReadTime}ms`,
        },
      };
    } catch (error: any) {
      logger.error('email_stats error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed',
      };
    }
  },
};

export const listEmailAccountsSkill: Skill = {
  name: 'list_email_accounts',
  description: 'List configured email accounts',
  execute: async (params: Record<string, any>) => {
    try {
      const credentialMgr = EmailCredentialManager.getInstance();
      const accounts = await credentialMgr.listAccounts();

      return {
        success: true,
        count: accounts.length,
        accounts: accounts.map((a: any) => ({
          name: a.accountName || a.name,
          email: a.email,
          provider: a.provider || 'custom',
        })),
      };
    } catch (error: any) {
      logger.error('list_email_accounts error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed',
      };
    }
  },
};

export const setDefaultEmailSkill: Skill = {
  name: 'set_default_email',
  description: 'Set the default email account to use for sending',
  execute: async (params: Record<string, any>) => {
    try {
      const { accountName } = params;

      if (!accountName) {
        return {
          success: false,
          error: 'Missing parameter: accountName',
        };
      }

      const credentialMgr = EmailCredentialManager.getInstance();
      const success = await credentialMgr.setDefaultAccount(accountName);

      if (!success) {
        return {
          success: false,
          error: `Account ${accountName} not found or does not exist`,
        };
      }

      return {
        success: true,
        message: `Default email account changed to ${accountName}`,
        defaultAccount: accountName,
      };
    } catch (error: any) {
      logger.error('set_default_email error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed',
      };
    }
  },
};

export const emailSkills = [
  configureEmailSkill,
  sendEmailSkill,
  readEmailSkill,
  listEmailFoldersSkill,
  emailStatsSkill,
  listEmailAccountsSkill,
  setDefaultEmailSkill,
];
