#!/usr/bin/env node

/**
 * AI Agent Assistant (AiAgentAssistant)
 * AiTalk - AI Console Chat Tool
 * Chat with your AI provider directly from the terminal
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { AIProvider, ChatMessage, AITool } from '../utils/AIProvider';
import { AIToolExecutor, AI_TOOLS as TOOL_DEFINITIONS } from '../utils/AITools';
import { 
  configureEmailSkill, 
  sendEmailSkill, 
  readEmailSkill, 
  listEmailFoldersSkill, 
  emailStatsSkill, 
  listEmailAccountsSkill,
  setDefaultEmailSkill
} from '../skills/EmailSkills';
import { listScheduledTasksSkill } from '../skills/SchedulingSkills';
import logger from '../utils/logger';
import { CliFormatter } from './CliFormatter';

/**
 * Load configuration from .env, .env.secure, or environment variables
 * Priority: Environment variables > .env.secure > .env > defaults
 */
function loadConfig(): any {
  // Load .env file first
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  // Try to load .env.secure (for encrypted credentials)
  const envSecurePath = path.join(process.cwd(), '.env.secure');
  if (fs.existsSync(envSecurePath)) {
    try {
      dotenv.config({ path: envSecurePath });
    } catch (error) {
      logger.warn({ error: String(error) }, 'Warning: Could not load .env.secure');
    }
  }

  // Get values from environment (or use defaults)
  const config = {
    provider: process.env.AI_PROVIDER || 'anthropic',
    apiKey: process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-3-sonnet-20240229',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  };

  return config;
}

/**
 * Main AiTalk CLI
 */
class AiTalk {
  private aiProvider: AIProvider | null = null;
  private toolExecutor: AIToolExecutor | null = null;
  private conversationHistory: ChatMessage[] = [];
  private aiTools: AITool[] = [];
  private rl: readline.Interface;
  private running: boolean = true;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Initialize the AI provider
   */
  async initialize(): Promise<boolean> {
    try {
      const config = loadConfig();

      if (!config.apiKey) {
        CliFormatter.printError(
          `No API key found. Please set AI_API_KEY in:`
        );
        console.log('  • Environment variable: export AI_API_KEY="your-key"');
        console.log('  • .env file in current directory');
        console.log('  • .env.secure file in current directory');
        return false;
      }

      // Initialize AI Provider
      this.aiProvider = new AIProvider({
        provider: config.provider as any,
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      });

      // Initialize tool executor (with dummy orchestrator)
      this.toolExecutor = new AIToolExecutor({
        dispatchTask: async (action: string, payload: any) => ({
          status: 'dispatched',
          action,
          payload,
        }),
      });

      // Convert tool definitions to AI tool format
      this.aiTools = TOOL_DEFINITIONS.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));

      // Initialize conversation with system message
      this.conversationHistory.push({
        role: 'system',
        content: `You are an advanced AI assistant with access to powerful tools.

You have access to:
- think: Analyze problems step by step
- execute_command: Execute shell commands
- dispatch_task: Dispatch tasks to worker agents
- read_file: Read file contents
- write_file: Write to files
- get_orchestrator_info: Get developer and system info
- send_email: Send emails (uses default account or specified account)
- read_emails: Read emails from configured accounts
- list_email_accounts: List all configured email accounts
- set_default_email_account: Set the default email account

⭐ CRITICAL - EMAIL OPERATIONS:
- ALWAYS use the send_email tool for sending emails (never use mail/sendmail/mailx system commands)
- ALWAYS use the read_emails tool for reading emails
- DO NOT attempt to use Linux mail command - use the send_email tool instead
- If asked to send an email: extract recipient, subject, and body, then use send_email tool
- The system has email accounts configured and ready - use them!

Email capability: You can send, read, and manage emails on behalf of the user.
If asked to send an email, use the send_email tool directly.
If multiple accounts are configured, you'll use the default unless otherwise specified.

Be direct, helpful, and use tools to accomplish tasks.`,
      });

      // Show initialization info
      CliFormatter.printInfo(`Provider: ${config.provider} | Model: ${config.model}`);
      const envPath = path.join(process.cwd(), '.env');
      const envSecurePath = path.join(process.cwd(), '.env.secure');
      const sources = [];
      if (fs.existsSync(envPath)) sources.push('.env');
      if (fs.existsSync(envSecurePath)) sources.push('.env.secure');
      if (sources.length > 0) {
        CliFormatter.printInfo(`Config loaded from: ${sources.join(', ')}`);
      }

      return true;
    } catch (error) {
      CliFormatter.printError(`Failed to initialize: ${String(error)}`);
      return false;
    }
  }

  /**
   * Process user input
   */
  private async processInput(input: string): Promise<void> {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    // Handle commands
    if (trimmed.startsWith('/')) {
      await this.handleCommand(trimmed);
      return;
    }

    // Regular chat
    await this.chat(trimmed);
  }

  /**
   * Handle slash commands
   */
  private async handleCommand(command: string): Promise<void> {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '/help':
        CliFormatter.printHelp();
        this.printEmailCommands();
        break;

      case '/task':
        this.printTaskInfo();
        break;

      case '/email':
        await this.handleEmailCommand(args);
        break;

      case '/scheduled':
        await this.handleScheduledCommand();
        break;

      case '/clear':
        this.conversationHistory = [this.conversationHistory[0]]; // Keep system message
        CliFormatter.printCleared();
        break;

      case '/status':
        this.printStatus();
        break;

      case '/exit':
        this.running = false;
        CliFormatter.printExit();
        break;

      default:
        CliFormatter.printWarning(`Unknown command: ${cmd}`);
        console.log('Type /help for available commands');
    }
  }

  /**
   * Handle scheduled tasks command
   */
  private async handleScheduledCommand(): Promise<void> {
    try {
      CliFormatter.printInfo('Fetching scheduled tasks...');
      
      const result = await listScheduledTasksSkill.execute();

      if (result.success) {
        if (result.tasks.length === 0) {
          console.log();
          CliFormatter.printInfo('📅 No scheduled tasks found.');
          console.log();
          console.log('Create tasks using AI:');
          console.log('  "Schedule a daily email to me at 9 AM with system status"');
          console.log('  "Create a weekly backup task"');
          console.log();
          return;
        }

        console.log();
        console.log(CliFormatter.BRIGHT + CliFormatter.CYAN + `📅 Scheduled Tasks (${result.tasks.length})` + CliFormatter.RESET);
        console.log();

        result.tasks.forEach((task: any, idx: number) => {
          const status = task.enabled ? '✅ Active' : '⏸️ Paused';
          const typeIcon = task.type === 'email' ? '📧' : '⚙️';
          
          console.log(`${CliFormatter.BRIGHT}${idx + 1}. ${typeIcon} ${task.name}${CliFormatter.RESET}`);
          console.log(`   Status: ${status}`);
          console.log(`   Schedule: ${CliFormatter.CYAN}${task.schedule}${CliFormatter.RESET}`);
          
          if (task.type === 'email' && task.emailTo) {
            console.log(`   To: ${task.emailTo}`);
          }
          
          if (task.runCount > 0) {
            console.log(`   Runs: ${task.runCount}`);
            if (task.lastRun) {
              const lastRun = new Date(task.lastRun);
              console.log(`   Last: ${lastRun.toLocaleString()}`);
            }
          } else {
            console.log(`   Runs: 0 (not executed yet)`);
          }
          
          console.log(`   ID: ${CliFormatter.DIM}${task.id}${CliFormatter.RESET}`);
          console.log();
        });

        console.log(CliFormatter.YELLOW + '💡 Manage Tasks via AI:' + CliFormatter.RESET);
        console.log('  • "Pause the daily email task"');
        console.log(`  • "Resume task ${result.tasks[0]?.id?.substring(0, 10)}..."`);
        console.log('  • "Delete the system status task"');
        console.log('  • "Create a new hourly task..."');
        console.log();
      } else {
        CliFormatter.printError(`Failed to retrieve scheduled tasks: ${result.error}`);
      }
    } catch (error: any) {
      CliFormatter.printError(`Error: ${error?.message || error}`);
    }
  }

  /**
   * Handle email commands
   */
  private async handleEmailCommand(args: string[]): Promise<void> {
    const subcommand = args[0]?.toLowerCase() || 'help';

    try {
      if (subcommand === 'help' || subcommand === 'setup' && args.length === 1) {
        this.printEmailHelp();
        return;
      }

      if (subcommand === 'setup') {
        const provider = args[1];
        
        // Check if custom provider - needs more arguments
        if (provider && provider.toLowerCase() === 'custom') {
          // Format: /email setup custom accountName smtpHost smtpPort email password imapHost imapPort [insecure]
          const accountName = args[2];
          const smtpHost = args[3];
          const smtpPort = args[4];
          const email = args[5];
          const password = args[6];
          const imapHost = args[7];
          const imapPort = args[8];
          const insecure = args[9] === 'insecure'; // Optional: disable SSL verification

          if (!accountName || !smtpHost || !smtpPort || !email || !password || !imapHost || !imapPort) {
            CliFormatter.printError('Missing parameters for custom provider.');
            CliFormatter.printInfo('Usage: /email setup custom [account] [smtp_host] [smtp_port] [email] [password] [imap_host] [imap_port] [insecure]');
            CliFormatter.printInfo('Example: /email setup custom myaccount smtp.zoho.com 587 user@domain.com password imap.zoho.com 993');
            CliFormatter.printInfo('For self-signed certificates: /email setup custom myaccount mail.example.com 587 user@domain.com password mail.example.com 993 insecure');
            return;
          }

          CliFormatter.animateThinking(1500);
          const result = await configureEmailSkill.execute({
            accountName,
            provider: 'custom',
            email,
            password,
            smtpHost,
            smtpPort: parseInt(smtpPort),
            imapHost,
            imapPort: parseInt(imapPort),
            smtpSecurity: 'tls',
            imapSecurity: 'ssl',
            displayName: email.split('@')[0],
            rejectUnauthorized: !insecure, // false if insecure is specified
          });

          if (result.success) {
            CliFormatter.printInfo(`✅ Email Configured: ${result.accountName}`);
            CliFormatter.printInfo(`   Email: ${result.email}`);
            CliFormatter.printInfo(`   Provider: Custom`);
            CliFormatter.printInfo(`   SMTP: ${smtpHost}:${smtpPort}`);
            CliFormatter.printInfo(`   IMAP: ${imapHost}:${imapPort}`);
            CliFormatter.printInfo(`   SSL Verification: ${insecure ? '❌ Disabled (insecure)' : '✅ Enabled'}`);
            CliFormatter.printInfo(`   SMTP Latency: ${result.smtpLatency}`);
            CliFormatter.printInfo(`   IMAP Latency: ${result.imapLatency}`);
          } else {
            CliFormatter.printError(`Setup Failed: ${result.error}`);
            if (result.error?.includes('certificate') && !insecure) {
              CliFormatter.printInfo(`💡 SSL Certificate Error? For self-signed certificates, add "insecure" at the end:`);
              CliFormatter.printInfo(`   /email setup custom ${accountName} ${smtpHost} ${smtpPort} ${email} ${password} ${imapHost} ${imapPort} insecure`);
            }
            if (result.hint) {
              CliFormatter.printInfo(`💡 Hint: ${result.hint}`);
            }
          }
          return;
        }

        // Standard provider setup (gmail, outlook, yahoo, etc)
        const email = args[2];
        const password = args.slice(3).join(' ');

        if (!provider || !email || !password) {
          CliFormatter.printError('Missing parameters. Usage: /email setup [provider] [email] [password]');
          CliFormatter.printInfo('Or for custom: /email setup custom [account] [smtp_host] [smtp_port] [email] [password] [imap_host] [imap_port]');
          return;
        }

        CliFormatter.animateThinking(1500);
        const accountName = `${email.split('@')[0]}_${provider.toLowerCase()}`;
        const result = await configureEmailSkill.execute({
          accountName,
          provider: provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase(),
          email,
          password,
          displayName: email.split('@')[0],
        });

        if (result.success) {
          CliFormatter.printInfo(`✅ Email Configured: ${result.accountName}`);
          CliFormatter.printInfo(`   Email: ${result.email}`);
          CliFormatter.printInfo(`   Provider: ${result.provider}`);
          CliFormatter.printInfo(`   SMTP Latency: ${result.smtpLatency}`);
          CliFormatter.printInfo(`   IMAP Latency: ${result.imapLatency}`);
        } else {
          CliFormatter.printError(`Setup Failed: ${result.error}`);
        }
        return;
      }

      if (subcommand === 'send') {
        const accountName = args[1];
        const to = args[2];
        const subject = args[3];
        const body = args.slice(4).join(' ');

        if (!accountName || !to || !subject) {
          CliFormatter.printError('Usage: /email send [account] [to] [subject] [body]');
          return;
        }

        CliFormatter.animateThinking(2000);
        const result = await sendEmailSkill.execute({
          accountName,
          to,
          subject,
          body,
        });

        if (result.success) {
          CliFormatter.printInfo(`✅ Email Sent to ${result.to.join(', ')}`);
          CliFormatter.printInfo(`   Subject: ${result.subject}`);
          CliFormatter.printInfo(`   Message ID: ${result.messageId}`);
        } else {
          CliFormatter.printError(`Send Failed: ${result.error}`);
        }
        return;
      }

      if (subcommand === 'read') {
        const accountName = args[1];
        const folder = args[2] || 'INBOX';
        const count = parseInt(args[3]) || 10;

        if (!accountName) {
          CliFormatter.printError('Usage: /email read [account] [folder] [count]');
          return;
        }

        CliFormatter.animateThinking(2000);
        const result = await readEmailSkill.execute({
          accountName,
          folder,
          count,
          unreadOnly: false,
        });

        if (result.success && result.emails && result.emails.length > 0) {
          CliFormatter.printInfo(`📧 Emails from ${folder} (${result.count})`);
          result.emails.slice(0, 5).forEach((email: any, idx: number) => {
            console.log(
              `${idx + 1}. ${email.unread ? '🆕' : '✓'} ${email.subject}`
            );
            console.log(`   From: ${email.from}`);
            console.log(`   ${email.preview}\n`);
          });
        } else {
          CliFormatter.printError(`No Emails Found: ${result.error || 'Account not found'}`);
        }
        return;
      }

      if (subcommand === 'folders') {
        const accountName = args[1];

        if (!accountName) {
          CliFormatter.printError('Usage: /email folders [account]');
          return;
        }

        CliFormatter.animateThinking(1500);
        const result = await listEmailFoldersSkill.execute({ accountName });

        if (result.success && result.folders) {
          CliFormatter.printInfo(`📁 Folders in ${accountName} (${result.count})`);
          result.folders.slice(0, 10).forEach((folder: any) => {
            console.log(
              `   ${folder.name}: ${folder.messages} messages (${folder.unread} unread)`
            );
          });
        } else {
          CliFormatter.printError(`Error: ${result.error}`);
        }
        return;
      }

      if (subcommand === 'stats') {
        const accountName = args[1];

        if (!accountName) {
          CliFormatter.printError('Usage: /email stats [account]');
          return;
        }

        CliFormatter.animateThinking(1500);
        const result = await emailStatsSkill.execute({ accountName });

        if (result.success) {
          const stats = result.statistics;
          CliFormatter.printInfo(`📊 Email Statistics: ${result.accountName}`);
          console.log(`   Email: ${result.email}`);
          console.log(`   Sent: ${stats.totalSent}`);
          console.log(`   Received: ${stats.totalReceived}`);
          console.log(`   Failed: ${stats.failedAttempts}`);
          console.log(`   Avg Send Time: ${stats.averageSendTime}`);
          console.log(`   Avg Read Time: ${stats.averageReadTime}`);
          console.log(`   Last Sent: ${stats.lastSent || 'Never'}`);
          console.log(`   Last Received: ${stats.lastReceived || 'Never'}`);
        } else {
          CliFormatter.printError(`Error: ${result.error}`);
        }
        return;
      }

      if (subcommand === 'accounts') {
        CliFormatter.animateThinking(1000);
        const result = await listEmailAccountsSkill.execute({});

        if (result.success) {
          if (result.count === 0) {
            CliFormatter.printInfo(result.message);
          } else {
            CliFormatter.printInfo(`📧 Configured Email Accounts (${result.count})`);
            result.accounts.forEach((account: any, idx: number) => {
              console.log(`   ${idx + 1}. ${account.name}`);
              console.log(`      Email: ${account.email}`);
              console.log(`      Provider: ${account.provider}`);
              console.log(`      Last used: ${account.lastUsed || 'Never'}\n`);
            });
          }
        } else {
          CliFormatter.printError(`Error: ${result.error}`);
        }
        return;
      }

      if (subcommand === 'change' || subcommand === 'default') {
        const accountName = args[1];

        if (!accountName) {
          CliFormatter.printError('Missing account name. Usage: /email change [account]');
          CliFormatter.printInfo('To see available accounts: /email accounts');
          return;
        }

        CliFormatter.animateThinking(1000);
        const result = await setDefaultEmailSkill.execute({ accountName });

        if (result.success) {
          CliFormatter.printInfo(`✅ ${result.message}`);
          CliFormatter.printInfo(`   Default account: ${result.defaultAccount}`);
        } else {
          CliFormatter.printError(`Error: ${result.error}`);
        }
        return;
      }

      // Default - show available email commands
      this.printEmailCommands();
    } catch (error) {
      CliFormatter.printError(`Email Error: ${String(error)}`);
    }
  }

  /**
   * Print email command help
   */
  private printEmailHelp(): void {
    console.log(`
📧 Email Setup Guide

Supported Providers:
  • Gmail
  • Outlook (Microsoft)
  • Yahoo Mail
  • ProtonMail
  • Yandex
  • Zoho
  • Custom IMAP/SMTP

Setup Commands:

FOR KNOWN PROVIDERS:
  /email setup [provider] [email] [password]
  
  Example (Gmail):
  /email setup Gmail user@gmail.com AppPassword123
  
  Example (Outlook):
  /email setup Outlook user@outlook.com MyPassword

FOR CUSTOM SERVERS:
  /email setup custom [account] [smtp_host] [smtp_port] [email] [password] [imap_host] [imap_port] [insecure]
  
  Example (Zoho):
  /email setup custom myaccount smtp.zoho.com 587 user@domain.com password imap.zoho.com 993
  
  Example (ProtonMail Bridge):
  /email setup custom protonmail 127.0.0.1 1025 user@protonmail.com password 127.0.0.1 1143

FOR SELF-SIGNED CERTIFICATES:
  Add "insecure" at the end to disable SSL verification:
  /email setup custom myaccount mail.example.com 587 user@domain.com password mail.example.com 993 insecure
  
  ⚠️ Use only with trusted internal servers!

Important:
  • Gmail/Yahoo: Use App-specific passwords
  • ProtonMail: Requires ProtonMail Bridge
  • Credentials stored securely in keyring
  • Custom: Use TLS (port 587) or SSL (port 993 for IMAP)
  • "insecure" flag disables certificate verification (use carefully!)

Other Commands:
  /email send    - Send an email (uses default account if not specified)
  /email read    - Read emails
  /email folders - List folders
  /email stats   - Show statistics
  /email accounts- List accounts
  /email change  - Set default account for sending
    `);
  }

  /**
   * Print email commands summary
   */
  private printEmailCommands(): void {
    console.log(`
📧 Email Commands:
  /email setup [provider] [email] [password]                       - Configure known provider
  /email setup custom [acct] [smtp] [port] [email] [pwd] [imap] [port] [insecure] - Custom server
  /email send [to] [subject] [body]                              - Send email (uses default account)
  /email send [account] [to] [subject] [body]                    - Send email from specific account
  /email read [account] [folder] [count]                         - Read emails
  /email folders [account]                                       - List folders
  /email stats [account]                                         - Show statistics
  /email accounts                                                - List all accounts
  /email change [account]                                        - Set default account
  /email help                                                    - Show detailed help
    `);
  }

  /**
   * Print status information
   */
  private printStatus(): void {
    const toolCalls = this.conversationHistory.filter(
      msg => msg.role === 'tool'
    ).length;

    CliFormatter.printStatus({
      provider: this.aiProvider?.getConfig().provider || 'unknown',
      model: this.aiProvider?.getConfig().model || 'unknown',
      messageCount: this.conversationHistory.length,
      toolCalls,
    });
  }

  /**
   * Print task information
   */
  private printTaskInfo(): void {
    console.log(`
📋 Task Management

To view all pending, queued, and running tasks, use the Telegram bot command:
  /task - Shows all active tasks across the system

The AITalk CLI doesn't have real-time access to the task queue, but you can:
  1. Use the Telegram bot /task command for full details
  2. Use /status in Telegram to see system overview
  3. Use /agents to list connected worker agents

For monitoring tasks in AITalk:
  • Ask the AI directly: "Show me the status of all tasks"
  • The AI can dispatch tasks and monitor their execution
  • Tool calls in your conversation are tracked above

💡 Tip: For best task monitoring, use the Telegram bot which has direct access
to the orchestrator and real-time task queue information.
    `);
  }

  /**
   * Chat with AI
   */
  private async chat(userMessage: string): Promise<void> {
    if (!this.aiProvider || !this.toolExecutor) {
      CliFormatter.printError('AI provider not initialized');
      return;
    }

    CliFormatter.printUserMessage(userMessage);

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Tool calling loop
    let maxIterations = 15;
    let iteration = 0;
    let finalResponse = '';

    while (iteration < maxIterations) {
      iteration++;

      try {
        CliFormatter.printThinking();

        // Get AI response
        const response = await this.aiProvider.chatCompletion(
          this.conversationHistory,
          this.aiTools
        );

        // Clear thinking indicator
        process.stdout.write('\r' + ' '.repeat(20) + '\r');

        // Handle tool calls
        if (response.toolCalls && response.toolCalls.length > 0) {
          // Add assistant message with tool calls
          this.conversationHistory.push({
            role: 'assistant',
            content: response.content || '',
            tool_calls: response.toolCalls,
          });

          // Execute each tool
          for (const toolCall of response.toolCalls) {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              CliFormatter.printToolExecution(toolCall.function.name, args);

              const result = await this.toolExecutor.execute(
                toolCall.function.name,
                args
              );

              CliFormatter.printToolResult(toolCall.function.name, result);

              // Add tool result to history
              this.conversationHistory.push({
                role: 'tool',
                content: JSON.stringify(result, null, 2),
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
              });
            } catch (error: any) {
              logger.error({ error: error.message }, 'Tool execution error');
              this.conversationHistory.push({
                role: 'tool',
                content: JSON.stringify({ error: error.message }),
                tool_call_id: toolCall.id,
                name: toolCall.function.name,
              });
            }
          }

          // Continue loop
          continue;
        }

        // No more tool calls - we have final response
        finalResponse = response.content;
        this.conversationHistory.push({
          role: 'assistant',
          content: finalResponse,
        });
        break;
      } catch (error: any) {
        CliFormatter.printError(`AI error: ${String(error)}`);
        break;
      }

      // Safety check
      if (iteration >= maxIterations) {
        CliFormatter.printWarning('Max iterations reached');
        break;
      }
    }

    // Print final response
    if (finalResponse) {
      CliFormatter.printAiResponse(finalResponse);
    }

    // Trim history (keep system + last 10 messages)
    if (this.conversationHistory.length > 11) {
      const systemMsg = this.conversationHistory[0];
      const recent = this.conversationHistory.slice(-10);
      this.conversationHistory = [systemMsg, ...recent];
    }
  }

  /**
   * Main event loop
   */
  async run(): Promise<void> {
    CliFormatter.printWelcome();

    if (!(await this.initialize())) {
      this.rl.close();
      process.exit(1);
    }

    return new Promise(() => {
      this.rl.on('line', async (line: string) => {
        await this.processInput(line);

        if (this.running) {
          CliFormatter.printPrompt();
        } else {
          this.rl.close();
          process.exit(0);
        }
      });

      CliFormatter.printPrompt();
    });
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    const aiTalk = new AiTalk();
    await aiTalk.run();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
