/**
 * AI Agent Assistant (AiAgentAssistant)
 * WhatsApp Gateway - Bot integration using whatsapp-web.js
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { Client, LocalAuth, Message } from 'whatsapp-web.js';
const qrcode = require('qrcode-terminal');
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

export interface WhatsAppConfig {
  sessionName?: string;
  puppeteerOptions?: any;
}

/**
 * WhatsAppGateway: Interface for WhatsApp bot integration with AI support
 * Uses whatsapp-web.js for WhatsApp Web automation
 */
export class WhatsAppGateway {
  private client: Client;
  private config: WhatsAppConfig;
  private orchestrator: any;
  private aiProvider: AIProvider | null;
  private toolExecutor: AIToolExecutor;
  private messageHandlers: Map<string, (message: Message) => Promise<void>>;
  private conversationHistory: Map<string, ChatMessage[]>;
  private aiTools: AITool[];
  private isReady: boolean = false;

  constructor(config: WhatsAppConfig, orchestrator: any, aiProvider: AIProvider | null = null) {
    this.config = config;
    this.orchestrator = orchestrator;
    this.aiProvider = aiProvider;
    this.toolExecutor = new AIToolExecutor(orchestrator);
    this.messageHandlers = new Map();
    this.conversationHistory = new Map();

    // Convert tool definitions to AI tool format
    this.aiTools = TOOL_DEFINITIONS.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    // Initialize WhatsApp client with local authentication
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: config.sessionName || 'aiagentassistant',
      }),
      puppeteer: config.puppeteerOptions || {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    logger.info({ 
      sessionName: config.sessionName || 'aiagentassistant',
      aiEnabled: !!aiProvider,
      toolsCount: this.aiTools.length 
    }, 'WhatsApp gateway initialized');

    this.setupEventHandlers();
  }

  /**
   * Setup WhatsApp client event handlers
   */
  private setupEventHandlers(): void {
    // QR code for authentication
    this.client.on('qr', (qr) => {
      logger.info('WhatsApp QR Code received. Scan with your phone:');
      qrcode.generate(qr, { small: true });
    });

    // Client is ready
    this.client.on('ready', () => {
      this.isReady = true;
      logger.info('✅ WhatsApp client is ready!');
    });

    // Authentication success
    this.client.on('authenticated', () => {
      logger.info('✅ WhatsApp authenticated successfully');
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      logger.error({ error: msg }, '❌ WhatsApp authentication failed');
    });

    // Client disconnected
    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      logger.warn({ reason }, '⚠️ WhatsApp client disconnected');
    });

    // Handle incoming messages
    this.client.on('message', async (msg) => {
      await this.handleMessage(msg);
    });
  }

  /**
   * Handle incoming WhatsApp messages
   */
  private async handleMessage(msg: Message): Promise<void> {
    try {
      const text = msg.body.trim();
      const chatId = msg.from;
      const contact = await msg.getContact();
      
      logger.info({
        from: chatId,
        name: contact.name || contact.pushname,
        text: text.substring(0, 100),
        isGroup: msg.from.includes('@g.us'),
      }, '[WHATSAPP] Incoming message');

      // Ignore group messages unless bot is mentioned
      if (msg.from.includes('@g.us') && !text.includes('@aiagent')) {
        return;
      }

      // Handle commands (starting with !)
      if (text.startsWith('!')) {
        await this.handleCommand(msg, text);
        return;
      }

      // AI chat for regular messages
      if (this.aiProvider) {
        await this.handleAIChat(msg, text, chatId);
      } else {
        await msg.reply('AI is not enabled. Use commands starting with ! (e.g., !help)');
      }
    } catch (error) {
      logger.error({ error, from: msg.from }, 'Error handling WhatsApp message');
      await msg.reply(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle command messages
   */
  private async handleCommand(msg: Message, text: string): Promise<void> {
    const parts = text.split(' ');
    const command = parts[0].substring(1).toLowerCase(); // Remove !
    const args = parts.slice(1);

    logger.info({ command, args, from: msg.from }, '[WHATSAPP] Command received');

    switch (command) {
      case 'start':
      case 'help':
        await msg.reply(
          `🤖 *AI Agent Assistant*\n\n` +
          `Available commands:\n` +
          `!help - Show this menu\n` +
          `!status - Show system status\n` +
          `!email - Email commands\n` +
          `!scheduled - List scheduled tasks\n` +
          `!clear - Clear conversation\n\n` +
          `Just send a message to chat with AI!`
        );
        break;

      case 'status':
        await this.handleStatus(msg);
        break;

      case 'email':
        await this.handleEmailCommand(msg, args);
        break;

      case 'scheduled':
        await this.handleScheduledCommand(msg);
        break;

      case 'clear':
        this.conversationHistory.delete(msg.from);
        await msg.reply('✅ Conversation history cleared');
        break;

      default:
        await msg.reply(`❌ Unknown command: ${command}\nUse !help to see available commands`);
    }
  }

  /**
   * Handle status command
   */
  private async handleStatus(msg: Message): Promise<void> {
    const chatId = msg.from;
    const history = this.conversationHistory.get(chatId) || [];
    const workers = this.orchestrator?.getWorkers?.() || [];

    const statusMessage = 
      `📊 *AI Agent Assistant Status*\n\n` +
      `👤 *Your Session*\n` +
      `├─ Chat ID: ${chatId}\n` +
      `├─ History: ${history.length} messages\n` +
      `└─ Status: ${history.length > 0 ? '✅ Active' : '🆕 Fresh'}\n\n` +
      `🤖 *System*\n` +
      `├─ AI: ${this.aiProvider ? '✅ Enabled' : '❌ Disabled'}\n` +
      `├─ Workers: ${workers.length}\n` +
      `└─ Tools: ${this.aiTools.length}`;

    await msg.reply(statusMessage);
  }

  /**
   * Handle email commands
   */
  private async handleEmailCommand(msg: Message, args: string[]): Promise<void> {
    const subcommand = (args[0] || 'help').toLowerCase();

    if (subcommand === 'help' || args.length === 0) {
      await msg.reply(
        `📧 *Email Commands*\n\n` +
        `!email accounts - List configured accounts\n` +
        `!email send - Send an email\n` +
        `!email read - Read emails\n\n` +
        `For full setup, use the Telegram bot or CLI`
      );
      return;
    }

    if (subcommand === 'accounts') {
      const result = await listEmailAccountsSkill.execute({});
      if (result.success && result.count > 0) {
        let message = `📧 *Email Accounts* (${result.count})\n\n`;
        result.accounts.forEach((account: any, idx: number) => {
          message += `${idx + 1}. ${account.name}\n`;
          message += `   Email: ${account.email}\n`;
          message += `   Provider: ${account.provider}\n\n`;
        });
        await msg.reply(message);
      } else {
        await msg.reply('No email accounts configured. Use Telegram bot or CLI for setup.');
      }
    }

    // Add more email subcommands as needed
  }

  /**
   * Handle scheduled tasks command
   */
  private async handleScheduledCommand(msg: Message): Promise<void> {
    const result = await listScheduledTasksSkill.execute();

    if (result.success) {
      if (result.tasks.length === 0) {
        await msg.reply('📅 No scheduled tasks found.');
        return;
      }

      let message = `📅 *Scheduled Tasks* (${result.tasks.length})\n\n`;
      result.tasks.forEach((task: any, idx: number) => {
        const status = task.enabled ? '✅' : '⏸️';
        message += `${idx + 1}. ${status} ${task.name}\n`;
        message += `   Schedule: ${task.schedule}\n`;
        if (task.runCount > 0) {
          message += `   Runs: ${task.runCount}\n`;
        }
        message += '\n';
      });

      await msg.reply(message);
    } else {
      await msg.reply(`❌ Error: ${result.error}`);
    }
  }

  /**
   * Handle AI chat
   */
  private async handleAIChat(msg: Message, text: string, chatId: string): Promise<void> {
    if (!this.aiProvider) return;

    try {
      // Show typing indicator
      const chat = await msg.getChat();
      await chat.sendStateTyping();

      const history = this.conversationHistory.get(chatId) || [];

      // Add system message if first message
      if (history.length === 0) {
        history.push({
          role: 'system',
          content: 'You are an AI assistant in a WhatsApp chat. Keep responses concise and mobile-friendly. Use *bold* for emphasis and simple formatting.',
        });
      }

      // Add user message
      history.push({ role: 'user', content: text });

      // Get AI response with tools
      const response = await this.aiProvider.chatCompletion(history, this.aiTools);

      // Handle tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        logger.info({ toolCalls: response.toolCalls.length }, 'AI requested tool calls');
        
        // Add assistant message with tool calls
        history.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls,
        });

        // Execute each tool call
        for (const toolCall of response.toolCalls) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            logger.info({ toolName: toolCall.function.name, args }, 'Executing tool from AI');
            
            const result = await this.toolExecutor.execute(toolCall.function.name, args);

            logger.info({ toolName: toolCall.function.name, result }, 'Tool execution result');

            // Add tool result to history
            history.push({
              role: 'tool',
              content: JSON.stringify(result, null, 2),
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            });
          } catch (error) {
            logger.error({ error, toolCall }, 'Tool execution failed');
            history.push({
              role: 'tool',
              content: JSON.stringify({ error: String(error) }),
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
            });
          }
        }

        // Get final response
        const finalResponse = await this.aiProvider.chatCompletion(history, this.aiTools);
        history.push({ role: 'assistant', content: finalResponse.content || '' });
        
        await msg.reply(finalResponse.content || '✅ Task completed');
      } else {
        // No tool calls, just respond
        history.push({ role: 'assistant', content: response.content || '' });
        await msg.reply(response.content || 'No response generated');
      }

      // Keep conversation history manageable (last 50 messages)
      if (history.length > 50) {
        const systemMsg = history[0];
        history.splice(1, history.length - 50);
        history.unshift(systemMsg);
      }

      this.conversationHistory.set(chatId, history);
    } catch (error) {
      logger.error({ error, chatId }, 'Error in WhatsApp AI chat');
      await msg.reply(`❌ AI Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Register a custom message handler
   */
  registerHandler(
    command: string,
    handler: (message: Message) => Promise<void>
  ): void {
    this.messageHandlers.set(command, handler);
    logger.debug({ command }, 'WhatsApp handler registered');
  }

  /**
   * Start the gateway
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting WhatsApp gateway...');
      await this.client.initialize();
      logger.info('✅ WhatsApp gateway started successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      logger.error({ 
        errorMessage, 
        errorStack,
        errorType: error?.constructor?.name 
      }, '❌ Failed to start WhatsApp gateway');
      throw error;
    }
  }

  /**
   * Stop the gateway
   */
  async stop(): Promise<void> {
    try {
      logger.info('Stopping WhatsApp gateway...');
      await this.client.destroy();
      this.isReady = false;
      logger.info('✅ WhatsApp gateway stopped');
    } catch (error) {
      logger.error({ error }, '❌ Error stopping WhatsApp gateway');
      throw error;
    }
  }

  /**
   * Check if client is ready
   */
  isClientReady(): boolean {
    return this.isReady;
  }
}

export default WhatsAppGateway;
