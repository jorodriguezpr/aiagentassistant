/**
 * AI Agent Assistant (AiAgentAssistant)
 * Logger - Pino-based logging utility with automatic redaction
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';
import { getLogRedactor } from './LogRedactor';

/** Per-request trace context — set once in Telegraf middleware, inherited by all async children */
export interface TraceContext {
  traceId: string;
  chatId?: number;
}
export const traceStore = new AsyncLocalStorage<TraceContext>();

// Initialize log redactor for automatic sensitive data filtering
const redactor = getLogRedactor({
  enabled: process.env.LOG_REDACTION_DISABLED !== 'true', // Enable by default
  redactEmails: false, // Keep emails visible by default
});

// Base pino logger — mixin automatically injects traceId/chatId from AsyncLocalStorage
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  mixin() {
    return traceStore.getStore() ?? {};
  },
});

/**
 * Redacting logger wrapper
 * Automatically redacts sensitive information before logging
 */
class RedactingLogger {
  private logger: pino.Logger;
  private redactor: any;

  constructor(logger: pino.Logger, redactor: any) {
    this.logger = logger;
    this.redactor = redactor;
  }

  /**
   * Redact message and metadata before logging
   */
  private redactArgs(msgOrObj: any, msg?: any, ...args: any[]): [any, any?, ...any[]] {
    // Case 1: logger.info({ obj }, 'message', ...args)
    if (typeof msgOrObj === 'object' && msgOrObj !== null) {
      const redactedObj = this.redactor.redactObject(msgOrObj);
      
      if (msg !== undefined) {
        const redactedMsg = typeof msg === 'string' ? this.redactor.redact(msg) : msg;
        return [redactedObj, redactedMsg, ...args];
      }
      
      return [redactedObj];
    }

    // Case 2: logger.info('message', ...args)
    if (typeof msgOrObj === 'string') {
      const redactedMsg = this.redactor.redact(msgOrObj);
      return [redactedMsg, ...args];
    }

    // Fallback - no redaction needed
    return [msgOrObj, msg, ...args];
  }

  trace(msgOrObj: any, msg?: any, ...args: any[]): void {
    const redacted = this.redactArgs(msgOrObj, msg, ...args);
    this.logger.trace(...redacted);
  }

  debug(msgOrObj: any, msg?: any, ...args: any[]): void {
    const redacted = this.redactArgs(msgOrObj, msg, ...args);
    this.logger.debug(...redacted);
  }

  info(msgOrObj: any, msg?: any, ...args: any[]): void {
    const redacted = this.redactArgs(msgOrObj, msg, ...args);
    this.logger.info(...redacted);
  }

  warn(msgOrObj: any, msg?: any, ...args: any[]): void {
    const redacted = this.redactArgs(msgOrObj, msg, ...args);
    this.logger.warn(...redacted);
  }

  error(msgOrObj: any, msg?: any, ...args: any[]): void {
    const redacted = this.redactArgs(msgOrObj, msg, ...args);
    this.logger.error(...redacted);
  }

  fatal(msgOrObj: any, msg?: any, ...args: any[]): void {
    const redacted = this.redactArgs(msgOrObj, msg, ...args);
    this.logger.fatal(...redacted);
  }

  // Expose child logger creation
  child(bindings: any): RedactingLogger {
    const redactedBindings = this.redactor.redactObject(bindings);
    const childLogger = this.logger.child(redactedBindings);
    return new RedactingLogger(childLogger, this.redactor);
  }
}

// Export redacting logger as default
const logger = new RedactingLogger(baseLogger, redactor);

export default logger;

// Also export redactor for manual redaction when needed
export { redactor };
