/**
 * Log Redaction Utility
 * 
 * Automatically redacts sensitive information from log messages to prevent
 * credential leakage in log files.
 * 
 * Features:
 * - Detects and redacts passwords in various formats
 * - Redacts SSH keys (private keys)
 * - Redacts API keys and tokens
 * - Redacts credit card numbers
 * - Redacts email addresses (optionally)
 * - Context-aware redaction based on field names
 */

export interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
  priority?: number; // Higher priority patterns are checked first
}

/**
 * Built-in redaction patterns
 */
const BUILTIN_PATTERNS: RedactionPattern[] = [
  // SSH Private Keys
  {
    name: 'ssh_private_key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/gi,
    replacement: '[REDACTED_SSH_PRIVATE_KEY]',
    priority: 100,
  },

  // Password in URLs (e.g., http://user:pass@host) — single-line only to avoid eating multi-line notes
  {
    name: 'password_in_url',
    pattern: /(\w+:\/\/[^:@\r\n]+:)([^@\r\n]+)(@[^\s]+)/g,
    replacement: '$1[REDACTED_PASSWORD]$3',
    priority: 90,
  },

  // sshpass commands with passwords
  {
    name: 'sshpass_password',
    pattern: /(sshpass\s+-p\s+['"]?)([^'"\\s]+)(['"]?)/gi,
    replacement: '$1[REDACTED_PASSWORD]$3',
    priority: 95,
  },

  // Password in command line flags (but not mkdir -p, rm -p, etc.)
  {
    name: 'password_flag',
    pattern: /(--password[=\s]+|--pass[=\s]+)([^'"\s]+)/gi,
    replacement: '$1[REDACTED_PASSWORD]',
    priority: 85,
  },

  // API Keys (various formats)
  {
    name: 'api_key_standard',
    pattern: /\b(api[_-]?key|apikey|api[_-]?token)(\s*[:=]\s*['"]?)([a-zA-Z0-9_\-]{20,})(['"]?)/gi,
    replacement: '$1$2[REDACTED_API_KEY]$4',
    priority: 80,
  },

  // Bearer tokens
  {
    name: 'bearer_token',
    pattern: /(bearer\s+)([a-zA-Z0-9_\-\.]{20,})/gi,
    replacement: '$1[REDACTED_TOKEN]',
    priority: 80,
  },

  // AWS credentials
  {
    name: 'aws_access_key',
    pattern: /\b((?:ASIA|AKIA)[0-9A-Z]{16})\b/g,
    replacement: '[REDACTED_AWS_KEY]',
    priority: 85,
  },

  // Generic secret keys (long alphanumeric strings in key positions)
  {
    name: 'generic_secret',
    pattern: /\b(secret|token|credential|key)(\s*[:=]\s*['"]?)([a-zA-Z0-9_\-\.]{32,})(['"]?)/gi,
    replacement: '$1$2[REDACTED_SECRET]$4',
    priority: 70,
  },

  // Credit card numbers (basic detection)
  {
    name: 'credit_card',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '[REDACTED_CREDIT_CARD]',
    priority: 90,
  },

  // Social Security Numbers (US format)
  {
    name: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED_SSN]',
    priority: 90,
  },

  // Email addresses (optional - sometimes needed in logs)
  {
    name: 'email',
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
    priority: 30, // Lower priority - only redact if specifically needed
  },
];

/**
 * Redaction configuration
 */
export interface RedactionConfig {
  enabled: boolean;
  patterns: RedactionPattern[];
  redactEmails?: boolean; // Whether to redact email addresses
  customPatterns?: RedactionPattern[]; // User-defined patterns
}

/**
 * Log Redactor class
 */
export class LogRedactor {
  private config: RedactionConfig;
  private allPatterns: RedactionPattern[];

  constructor(config?: Partial<RedactionConfig>) {
    this.config = {
      enabled: true,
      patterns: BUILTIN_PATTERNS,
      redactEmails: false,
      ...config,
    };

    // Combine built-in and custom patterns
    this.allPatterns = [
      ...this.config.patterns,
      ...(this.config.customPatterns || []),
    ];

    // Sort by priority (highest first)
    this.allPatterns.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Remove email pattern if not redacting emails
    if (!this.config.redactEmails) {
      this.allPatterns = this.allPatterns.filter(p => p.name !== 'email');
    }
  }

  /**
   * Redact sensitive information from a string
   */
  redact(input: string): string {
    if (!this.config.enabled || !input) {
      return input;
    }

    let redacted = input;

    for (const pattern of this.allPatterns) {
      redacted = redacted.replace(pattern.pattern, pattern.replacement);
    }

    return redacted;
  }

  /**
   * Redact sensitive information from an object (deep redaction)
   */
  redactObject(obj: any, visited: WeakSet<any> = new WeakSet()): any {
    if (!this.config.enabled) {
      return obj;
    }

    // Handle primitive types
    if (typeof obj === 'string') {
      return this.redact(obj);
    }

    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    // Detect circular references
    if (visited.has(obj)) {
      return '[Circular Reference]';
    }
    visited.add(obj);

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObject(item, visited));
    }

    // Handle Error objects specially
    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: this.redact(obj.message),
        stack: obj.stack ? this.redact(obj.stack) : undefined,
      };
    }

    // Handle objects
    const redacted: any = {};
    for (const key of Object.keys(obj)) {
      // Check if key name suggests sensitive data
      const lowerKey = key.toLowerCase();
      const isSensitiveKey = 
        lowerKey === 'password' ||
        lowerKey === 'secret' ||
        lowerKey === 'token' ||
        lowerKey === 'apikey' ||
        lowerKey === 'api_key' ||
        lowerKey === 'credential' ||
        lowerKey === 'auth' ||
        lowerKey === 'authorization';

      // Exception: Don't redact path-related fields even if they contain sensitive keywords
      const isPathField = 
        lowerKey.includes('path') ||
        lowerKey.includes('dir') ||
        lowerKey.includes('directory') ||
        lowerKey.includes('folder') ||
        lowerKey.includes('file');

      if (isSensitiveKey && !isPathField && typeof obj[key] === 'string') {
        // Fully redact sensitive fields
        redacted[key] = '[REDACTED]';
      } else {
        // Recursively redact values
        redacted[key] = this.redactObject(obj[key], visited);
      }
    }

    return redacted;
  }

  /**
   * Add a custom redaction pattern
   */
  addPattern(pattern: RedactionPattern): void {
    this.allPatterns.push(pattern);
    this.allPatterns.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Enable or disable redaction
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Check if a string contains potentially sensitive data
   */
  containsSensitiveData(input: string): boolean {
    if (!input) return false;

    for (const pattern of this.allPatterns) {
      if (pattern.pattern.test(input)) {
        return true;
      }
    }

    return false;
  }
}

// Export singleton instance
let _redactorInstance: LogRedactor | null = null;

export function getLogRedactor(config?: Partial<RedactionConfig>): LogRedactor {
  if (!_redactorInstance) {
    _redactorInstance = new LogRedactor(config);
  }
  return _redactorInstance;
}

/**
 * Quick redaction function for convenience
 */
export function redactSensitiveInfo(input: string | object): string | object {
  const redactor = getLogRedactor();
  
  if (typeof input === 'string') {
    return redactor.redact(input);
  } else {
    return redactor.redactObject(input);
  }
}
