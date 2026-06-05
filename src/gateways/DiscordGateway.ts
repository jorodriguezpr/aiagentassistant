/**
 * AI Agent Assistant (AiAgentAssistant)
 * Discord Gateway - Bot integration using discord.js
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { 
  Client, 
  GatewayIntentBits, 
  Message, 
  Partials,
  ActivityType 
} from 'discord.js';
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

export interface DiscordConfig {
  token: string;
  prefix?: string;
  statusMessage?: string;
}

/**
 * DiscordGateway: Interface for Discord bot integration with AI support
 * Uses discord.js for Discord bot functionality
 */
export class DiscordGateway {
  private client: Client;
  private config: DiscordConfig;
  private orchestrator: any;
  private aiProvider: AIProvider | null;
  private toolExecutor: AIToolExecutor;
  private messageHandlers: Map<string, (message: Message) => Promise<void>>;
  private conversationHistory: Map<string, ChatMessage[]>;
  private aiTools: AITool[];
  private commandPrefix: string;

  constructor(config: DiscordConfig, orchestrator: any, aiProvider: AIProvider | null = null) {
    this.config = config;
    this.orchestrator = orchestrator;
    this.aiProvider = aiProvider;
    this.toolExecutor = new AIToolExecutor(orchestrator);
    this.messageHandlers = new Map();
    this.conversationHistory = new Map();
    this.commandPrefix = config.prefix || '!';

    // Convert tool definitions to AI tool format
    this.aiTools = TOOL_DEFINITIONS.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    // Initialize Discord client with necessary intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    });

    logger.info({ 
      token: config.token.substring(0, 10) + '...', 
      aiEnabled: !!aiProvider,
      toolsCount: this.aiTools.length,
      prefix: this.commandPrefix 
    }, 'Discord gateway initialized');

    this.setupEventHandlers();
  }

  /**
   * Setup Discord client event handlers
   */
  private setupEventHandlers(): void {
    // Client is ready
    this.client.on('ready', () => {
      logger.info(`✅ Discord bot logged in as ${this.client.user?.tag}`);
      
      // Set bot status
      this.client.user?.setPresence({
        activities: [{
          name: this.config.statusMessage || 'AI Agent Assistant | !help',
          type: ActivityType.Playing,
        }],
        status: 'online',
      });
    });

    // Handle incoming messages
    this.client.on('messageCreate', async (message) => {
      await this.handleMessage(message);
    });

    // Handle errors
    this.client.on('error', (error) => {
      logger.error({ error }, '❌ Discord client error');
    });
  }

  /**
   * Handle incoming Discord messages
   */
  private async handleMessage(message: Message): Promise<void> {
    try {
      // Ignore bot messages
      if (message.author.bot) return;

      const text = message.content.trim();
      const channelId = message.channel.id;
      const userId = message.author.id;
      const conversationId = `${channelId}-${userId}`;

      logger.info({
        author: message.author.tag,
        channelId,
        text: text.substring(0, 100),
        isDM: message.channel.isDMBased(),
      }, '[DISCORD] Incoming message');

      // Handle commands (starting with prefix)
      if (text.startsWith(this.commandPrefix)) {
        await this.handleCommand(message, text);
        return;
      }

      // Respond to all messages with AI chat (like Telegram)
      if (this.aiProvider) {
        // Remove mention from text if present
        const cleanText = text.replace(/<@!?\d+>/g, '').trim();
        await this.handleAIChat(message, cleanText, conversationId);
      } else {
        await message.reply('AI is not enabled. Use commands starting with ! (e.g., !help)');
      }
    } catch (error) {
      logger.error({ error, authorId: message.author.id }, 'Error handling Discord message');
      await message.reply(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle command messages
   */
  private async handleCommand(message: Message, text: string): Promise<void> {
    const parts = text.split(' ');
    const command = parts[0].substring(this.commandPrefix.length).toLowerCase();
    const args = parts.slice(1);

    logger.info({ command, args, author: message.author.tag }, '[DISCORD] Command received');

    switch (command) {
      case 'help':
        await this.handleHelp(message);
        break;

      case 'status':
        await this.handleStatus(message);
        break;

      case 'email':
        await this.handleEmailCommand(message, args);
        break;

      case 'scheduled':
        await this.handleScheduledCommand(message);
        break;

      case 'clear':
        const conversationId = `${message.channel.id}-${message.author.id}`;
        this.conversationHistory.delete(conversationId);
        await message.reply('✅ Conversation history cleared');
        break;

      case 'ping':
        const latency = Date.now() - message.createdTimestamp;
        await message.reply(`🏓 Pong! Latency: ${latency}ms | API Latency: ${Math.round(this.client.ws.ping)}ms`);
        break;

      default:
        await message.reply(`❌ Unknown command: ${command}\nUse ${this.commandPrefix}help to see available commands`);
    }
  }

  /**
   * Handle help command
   */
  private async handleHelp(message: Message): Promise<void> {
    const helpEmbed = {
      color: 0x0099ff,
      title: '🤖 AI Agent Assistant - Help',
      description: 'Available commands and features',
      fields: [
        {
          name: '📋 Basic Commands',
          value: 
            `\`${this.commandPrefix}help\` - Show this menu\n` +
            `\`${this.commandPrefix}status\` - Show system status\n` +
            `\`${this.commandPrefix}ping\` - Check bot latency\n` +
            `\`${this.commandPrefix}clear\` - Clear conversation history`,
        },
        {
          name: '📧 Email Commands',
          value: 
            `\`${this.commandPrefix}email accounts\` - List email accounts\n` +
            `\`${this.commandPrefix}email send\` - Send an email\n` +
            `\`${this.commandPrefix}email read\` - Read emails`,
        },
        {
          name: '📅 Task Commands',
          value: `\`${this.commandPrefix}scheduled\` - List scheduled tasks`,
        },
        {
          name: '🤖 AI Chat',
          value: 
            `Mention the bot or DM to chat with AI\n` +
            `Example: @${this.client.user?.tag} What's the weather?`,
        },
      ],
      footer: {
        text: 'AI Agent Assistant by Jose Rodriguez Arroyo',
      },
      timestamp: new Date().toISOString(),
    };

    await message.reply({ embeds: [helpEmbed] });
  }

  /**
   * Handle status command
   */
  private async handleStatus(message: Message): Promise<void> {
    const conversationId = `${message.channel.id}-${message.author.id}`;
    const history = this.conversationHistory.get(conversationId) || [];
    const workers = this.orchestrator?.getWorkers?.() || [];
    const guilds = this.client.guilds.cache.size;

    const statusEmbed = {
      color: 0x00ff00,
      title: '📊 System Status',
      fields: [
        {
          name: '👤 Your Session',
          value: 
            `Chat ID: \`${conversationId}\`\n` +
            `History: ${history.length} messages\n` +
            `Status: ${history.length > 0 ? '✅ Active' : '🆕 Fresh'}`,
          inline: true,
        },
        {
          name: '🤖 System',
          value: 
            `AI: ${this.aiProvider ? '✅ Enabled' : '❌ Disabled'}\n` +
            `Workers: ${workers.length}\n` +
            `Tools: ${this.aiTools.length}`,
          inline: true,
        },
        {
          name: '🌐 Discord Stats',
          value: 
            `Servers: ${guilds}\n` +
            `Uptime: ${Math.floor(process.uptime() / 60)}m\n` +
            `Ping: ${Math.round(this.client.ws.ping)}ms`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    await message.reply({ embeds: [statusEmbed] });
  }

  /**
   * Handle email commands
   */
  private async handleEmailCommand(message: Message, args: string[]): Promise<void> {
    const subcommand = (args[0] || 'help').toLowerCase();

    if (subcommand === 'help' || args.length === 0) {
      await message.reply(
        `📧 **Email Commands**\n\n` +
        `\`${this.commandPrefix}email accounts\` - List configured accounts\n` +
        `\`${this.commandPrefix}email send\` - Send an email\n` +
        `\`${this.commandPrefix}email read\` - Read emails\n\n` +
        `For full setup, use the Telegram bot or CLI`
      );
      return;
    }

    if (subcommand === 'accounts') {
      const result = await listEmailAccountsSkill.execute({});
      if (result.success && result.count > 0) {
        let description = '';
        result.accounts.forEach((account: any, idx: number) => {
          description += `**${idx + 1}. ${account.name}**\n`;
          description += `Email: ${account.email}\n`;
          description += `Provider: ${account.provider}\n\n`;
        });

        const embed = {
          color: 0x0099ff,
          title: `📧 Email Accounts (${result.count})`,
          description,
          timestamp: new Date().toISOString(),
        };

        await message.reply({ embeds: [embed] });
      } else {
        await message.reply('No email accounts configured. Use Telegram bot or CLI for setup.');
      }
    }

    // Add more email subcommands as needed
  }

  /**
   * Handle scheduled tasks command
   */
  private async handleScheduledCommand(message: Message): Promise<void> {
    const result = await listScheduledTasksSkill.execute();

    if (result.success) {
      if (result.tasks.length === 0) {
        await message.reply('📅 No scheduled tasks found.');
        return;
      }

      let description = '';
      result.tasks.forEach((task: any, idx: number) => {
        const status = task.enabled ? '✅' : '⏸️';
        description += `**${idx + 1}. ${status} ${task.name}**\n`;
        description += `Schedule: ${task.schedule}\n`;
        if (task.runCount > 0) {
          description += `Runs: ${task.runCount}\n`;
        }
        description += '\n';
      });

      const embed = {
        color: 0x0099ff,
        title: `📅 Scheduled Tasks (${result.tasks.length})`,
        description,
        timestamp: new Date().toISOString(),
      };

      await message.reply({ embeds: [embed] });
    } else {
      await message.reply(`❌ Error: ${result.error}`);
    }
  }

  /**
   * Handle AI chat
   */
  private async handleAIChat(message: Message, text: string, conversationId: string): Promise<void> {
    if (!this.aiProvider) return;

    try {
      // Show typing indicator (only if channel supports it)
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }

      const history = this.conversationHistory.get(conversationId) || [];

      // Add system message if first message
      if (history.length === 0) {
        history.push({
          role: 'system',
          content: 'You are an AI assistant in a Discord chat. Use Discord markdown formatting when appropriate. Keep responses clear and well-formatted.',
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
        
        // Split long messages if needed (Discord has 2000 char limit)
        await this.sendLongMessage(message, finalResponse.content || '✅ Task completed');
      } else {
        // No tool calls, just respond
        history.push({ role: 'assistant', content: response.content || '' });
        await this.sendLongMessage(message, response.content || 'No response generated');
      }

      // Keep conversation history manageable (last 50 messages)
      if (history.length > 50) {
        const systemMsg = history[0];
        history.splice(1, history.length - 50);
        history.unshift(systemMsg);
      }

      this.conversationHistory.set(conversationId, history);
    } catch (error) {
      logger.error({ error, conversationId }, 'Error in Discord AI chat');
      await message.reply(`❌ AI Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send long messages (split if over 2000 chars)
   */
  private async sendLongMessage(message: Message, content: string): Promise<void> {
    const MAX_LENGTH = 2000;
    
    if (content.length <= MAX_LENGTH) {
      await message.reply(content);
      return;
    }

    // Split into chunks
    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point (newline or space)
      let splitPoint = MAX_LENGTH;
      const lastNewline = remaining.lastIndexOf('\n', MAX_LENGTH);
      const lastSpace = remaining.lastIndexOf(' ', MAX_LENGTH);

      if (lastNewline > MAX_LENGTH - 200) {
        splitPoint = lastNewline + 1;
      } else if (lastSpace > MAX_LENGTH - 200) {
        splitPoint = lastSpace + 1;
      }

      chunks.push(remaining.substring(0, splitPoint));
      remaining = remaining.substring(splitPoint);
    }

    // Send chunks
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        await message.reply(chunks[i]);
      } else if ('send' in message.channel) {
        await message.channel.send(chunks[i]);
      }
      // Small delay to avoid rate limits
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
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
    logger.debug({ command }, 'Discord handler registered');
  }

  /**
   * Start the gateway
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting Discord gateway...');
      await this.client.login(this.config.token);
      logger.info('✅ Discord gateway started successfully');
    } catch (error) {
      logger.error({ error }, '❌ Failed to start Discord gateway');
      throw error;
    }
  }

  /**
   * Stop the gateway
   */
  async stop(): Promise<void> {
    try {
      logger.info('Stopping Discord gateway...');
      this.client.destroy();
      logger.info('✅ Discord gateway stopped');
    } catch (error) {
      logger.error({ error }, '❌ Error stopping Discord gateway');
      throw error;
    }
  }

  /**
   * Get Discord client
   */
  getClient(): Client {
    return this.client;
  }
}

export default DiscordGateway;
