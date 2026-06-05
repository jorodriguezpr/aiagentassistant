/**
 * AI Agent Assistant (AiAgentAssistant)
 * Email Types and Interfaces
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

/**
 * Email Types and Interfaces
 */

export interface EmailCredentials {
  // SMTP Configuration
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecurity: 'tls' | 'ssl' | 'none'; // TLS recommended

  // IMAP Configuration
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  imapSecurity: 'tls' | 'ssl' | 'none';

  // Email Address
  email: string;
  displayName?: string;

  // Provider (for quick setup)
  provider?: 'gmail' | 'outlook' | 'yahoo' | 'custom';

  // Auto-TLS (auto-upgrade to TLS if available)
  autoTls?: boolean;

  // SSL/TLS verification (disable for self-signed certificates)
  rejectUnauthorized?: boolean; // Default: true (verify certificates). Set to false for self-signed certs
}

export interface EmailMessage {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
}

export interface EmailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
  encoding?: string;
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  date: Date;
  read: boolean;
  attachments: EmailAttachment[];
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, any>;
}

export interface EmailFolder {
  name: string;
  path: string;
  unreadCount: number;
  totalCount: number;
  flags?: string[];
  delimiter?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

export interface EmailReadResult {
  success: boolean;
  emails?: ReceivedEmail[];
  error?: string;
  count: number;
  folder?: string;
}

export interface EmailConnectionTest {
  smtp: {
    success: boolean;
    error?: string;
    latency?: number;
  };
  imap: {
    success: boolean;
    error?: string;
    latency?: number;
  };
  email: string;
}

export interface EmailConfig {
  credentials: EmailCredentials;
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
  maxConnections?: number;
}

export interface EmailStats {
  totalSent: number;
  totalReceived: number;
  failedAttempts: number;
  lastSentTime?: Date;
  lastReceivedTime?: Date;
  averageSendTime: number; // ms
  averageReadTime: number; // ms
}

export interface EmailProviderConfig {
  name: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  security: 'tls' | 'ssl';
  requiresAppPassword?: boolean;
  setupUrl?: string;
  notes?: string;
}
