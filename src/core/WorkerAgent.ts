/**
 * AI Agent Assistant (AiAgentAssistant)
 * Worker Agent - Independent task execution
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { Agent } from './Agent';
import { Message, AgentConfig } from '../types';
import logger, { traceStore } from '../utils/logger';

/**
 * WorkerAgent: Specialized agent that processes tasks independently
 * Executes skills and reports results back to orchestrator
 */
export class WorkerAgent extends Agent {
  constructor(config: AgentConfig, messageBus: any) {
    if (config.type !== 'worker') {
      throw new Error('WorkerAgent must have type "worker"');
    }
    super(config, messageBus);
  }

  /**
   * Handle incoming messages
   */
  protected async handleMessage(message: Message): Promise<void> {
    logger.debug(
      { agentId: this.id, messageId: message.id, action: message.action },
      'Received message'
    );

    // Extract routing metadata injected by the orchestrator
    const correlationId = message.payload?._correlationId;
    const traceId       = message.payload?._traceId;

    // Restore the parent request's trace context — Bull jobs run in a fresh async
    // context so AsyncLocalStorage doesn't propagate automatically from TelegramGateway.
    const runInTrace = (fn: () => Promise<void>) =>
      traceId ? traceStore.run({ traceId }, fn) : fn();

    await runInTrace(async () => {
      try {
        if (message.type === 'request' || message.type === 'command') {
          const result = await this.processRequest(message);

          // Echo correlationId so Orchestrator.handleWorkerResponse resolves the right Promise
          await this.messageBus.sendMessage(
            this.id,
            message.from,
            `${message.action}:response`,
            { ...result, _correlationId: correlationId },
            'response'
          );
        }
      } catch (error) {
        logger.error(
          { agentId: this.id, messageId: message.id, error },
          'Error handling message'
        );

        // Echo correlationId in error response too
        await this.messageBus.sendMessage(
          this.id,
          message.from,
          `${message.action}:error`,
          { error: String(error), _correlationId: correlationId },
          'response'
        );
      }
    });
  }

  /**
   * Process incoming request — strips internal routing metadata before executing skill
   */
  private async processRequest(message: Message): Promise<any> {
    const { action, payload } = message;

    // Remove routing metadata injected by the orchestrator before passing to the skill
    const { _correlationId, _traceId, ...skillParams } = payload ?? {};

    logger.info(
      { agentId: this.id, action, payloadKeys: Object.keys(skillParams) },
      'Processing request'
    );

    const result = await this.executeSkill(action, skillParams);

    return {
      success: true,
      result,
      executedAt: Date.now(),
    };
  }

  /**
   * Get agent status summary
   */
  getStatus(): {
    id: string;
    name: string;
    type: string;
    isRunning: boolean;
    activeTasks: number;
    maxConcurrentTasks: number;
    skills: string[];
  } {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      isRunning: this.isRunning,
      activeTasks: this.activeTasks,
      maxConcurrentTasks: this.maxConcurrentTasks,
      skills: this.getSkills(),
    };
  }
}

export default WorkerAgent;
