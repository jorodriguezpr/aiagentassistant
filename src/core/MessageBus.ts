/**
 * AI Agent Assistant (AiAgentAssistant)
 * Message Bus - Redis-backed message queue
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import Queue from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { Message, MessageBusOptions } from '../types';
import logger from '../utils/logger';

/**
 * MessageBus: Central communication hub for all agents
 * Uses Bull (Redis-backed queue) for reliable message delivery
 */
export class MessageBus {
  private queue: Queue.Queue<Message>;
  private handlers: Map<string, (message: Message) => Promise<void>>;
  private agentQueues: Map<string, Queue.Queue<Message>>;

  constructor(private options: MessageBusOptions = {}) {
    this.handlers = new Map();
    this.agentQueues = new Map();

    const redisUrl = options.redisUrl || 'redis://localhost:6379';

    // Main queue for all messages
    this.queue = new Queue<Message>('messages', redisUrl, {
      defaultJobOptions: {
        attempts: options.maxRetries || 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
      },
    });

    this.queue.on('error', (err) => {
      logger.error({ err }, 'Message bus error');
    });
  }

  /**
   * Register an agent on the message bus
   */
  async registerAgent(agentId: string): Promise<void> {
    const redisUrl = this.options.redisUrl || 'redis://localhost:6379';
    const agentQueue = new Queue<Message>(`agent-${agentId}`, redisUrl);

    this.agentQueues.set(agentId, agentQueue);
    logger.info({ agentId }, 'Agent registered on message bus');
  }

  /**
   * Send a message from one agent to another
   */
  async sendMessage(
    from: string,
    to: string,
    action: string,
    payload: Record<string, any> = {},
    type: 'request' | 'response' | 'event' | 'command' = 'request'
  ): Promise<string> {
    const message: Message = {
      id: uuidv4(),
      from,
      to,
      type,
      action,
      payload,
      timestamp: Date.now(),
      correlationId: uuidv4(),
    };

    const agentQueue = this.agentQueues.get(to);
    if (!agentQueue) {
      throw new Error(`Agent ${to} is not registered on the message bus`);
    }

    await agentQueue.add(message, {
      jobId: message.id,
    });

    logger.debug(
      { from, to, action, messageId: message.id },
      'Message sent'
    );

    return message.id;
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(
    from: string,
    action: string,
    payload: Record<string, any> = {}
  ): Promise<string[]> {
    const messageIds: string[] = [];

    for (const [agentId] of this.agentQueues) {
      if (agentId !== from) {
        const messageId = await this.sendMessage(
          from,
          agentId,
          action,
          payload,
          'event'
        );
        messageIds.push(messageId);
      }
    }

    logger.info(
      { from, recipientCount: messageIds.length },
      'Broadcast sent'
    );

    return messageIds;
  }

  /**
   * Subscribe to messages for an agent
   */
  async subscribe(
    agentId: string,
    handler: (message: Message) => Promise<void>
  ): Promise<void> {
    const agentQueue = this.agentQueues.get(agentId);
    if (!agentQueue) {
      throw new Error(`Agent ${agentId} is not registered`);
    }

    agentQueue.process(async (job) => {
      try {
        await handler(job.data);
      } catch (error) {
        logger.error(
          { agentId, messageId: job.data.id, error },
          'Error processing message'
        );
        throw error;
      }
    });

    logger.info({ agentId }, 'Agent subscribed to messages');
  }

  /**
   * Get pending messages for an agent
   */
  async getPendingMessages(agentId: string): Promise<Message[]> {
    const agentQueue = this.agentQueues.get(agentId);
    if (!agentQueue) {
      return [];
    }

    const jobs = await agentQueue.getWaiting();
    return jobs.map((job) => job.data);
  }

  /**
   * Check if agent is connected
   */
  isAgentConnected(agentId: string): boolean {
    return this.agentQueues.has(agentId);
  }

  /**
   * Get all connected agents
   */
  getConnectedAgents(): string[] {
    return Array.from(this.agentQueues.keys());
  }

  /**
   * Close the message bus
   */
  async close(): Promise<void> {
    await this.queue.close();
    for (const [, queue] of this.agentQueues) {
      await queue.close();
    }
    logger.info('Message bus closed');
  }
}

export default MessageBus;
