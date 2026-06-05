/**
 * AI Agent Assistant (AiAgentAssistant)
 * Base Agent Class
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentConfig, Skill, Message, AgentState } from '../types';
import { MessageBus } from './MessageBus';
import logger from '../utils/logger';

/**
 * Base Agent class - foundation for all agents (orchestrator and workers)
 */
export abstract class Agent {
  protected id: string;
  protected name: string;
  protected type: 'worker' | 'orchestrator';
  protected skills: Map<string, Skill>;
  protected messageBus: MessageBus;
  protected maxConcurrentTasks: number;
  protected maxModelCalls: number;
  protected activeTasks: number = 0;
  protected isRunning: boolean = false;
  protected metadata?: Record<string, any>;
  protected modelCallCount: number = 0;

  constructor(config: AgentConfig, messageBus: MessageBus) {
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.type = config.type;
    this.maxConcurrentTasks = config.maxConcurrentTasks || 10;
    this.maxModelCalls = config.maxModelCalls || 20;
    this.messageBus = messageBus;
    this.skills = new Map();
    this.metadata = config.metadata;

    // Register skills
    config.skills.forEach((skill) => {
      this.registerSkill(skill);
    });

    logger.info(
      { agentId: this.id, name: this.name, type: this.type, skills: config.skills.length },
      'Agent created'
    );
  }

  /**
   * Get agent ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get agent type
   */
  getType(): 'worker' | 'orchestrator' {
    return this.type;
  }

  /**
   * Get agent metadata
   */
  getMetadata(): Record<string, any> | undefined {
    return this.metadata;
  }

  /**
   * Register a skill/capability
   */
  registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
    logger.debug(
      { agentId: this.id, skillName: skill.name },
      'Skill registered'
    );
  }

  /**
   * Get available skills
   */
  getSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Check if agent has a specific skill
   */
  hasSkill(skillName: string): boolean {
    return this.skills.has(skillName);
  }

  /**
   * Execute a skill
   */
  async executeSkill(skillName: string, params: Record<string, any> = {}): Promise<any> {
    const skill = this.skills.get(skillName);
    if (!skill) {
      throw new Error(`Skill "${skillName}" not found on agent ${this.id}`);
    }

    try {
      this.activeTasks++;
      const result = await skill.execute(params);
      return result;
    } finally {
      this.activeTasks--;
    }
  }

  /**
   * Send a message to another agent
   */
  protected async sendMessage(
    to: string,
    action: string,
    payload: Record<string, any> = {}
  ): Promise<string> {
    return this.messageBus.sendMessage(
      this.id,
      to,
      action,
      payload,
      'request'
    );
  }

  /**
   * Broadcast a message to all agents
   */
  protected async broadcastMessage(
    action: string,
    payload: Record<string, any> = {}
  ): Promise<string[]> {
    return this.messageBus.broadcast(this.id, action, payload);
  }

  /**
   * Get agent state
   */
  getState(): AgentState {
    return {
      agentId: this.id,
      isReady: this.isRunning && this.activeTasks < this.maxConcurrentTasks,
      activeTasks: this.activeTasks,
      lastHeartbeat: Date.now(),
      skills: this.getSkills(),
    };
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    await this.messageBus.registerAgent(this.id);
    await this.messageBus.subscribe(this.id, this.handleMessage.bind(this));
    this.isRunning = true;

    logger.info({ agentId: this.id, name: this.name }, 'Agent started');
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    logger.info({ agentId: this.id, name: this.name }, 'Agent stopped');
  }

  /**
   * Handle incoming messages - to be overridden by subclasses
   */
  protected abstract handleMessage(message: Message): Promise<void>;

  /**
   * Check if agent can accept new tasks
   */
  canAcceptTask(): boolean {
    return this.isRunning && this.activeTasks < this.maxConcurrentTasks;
  }
}

export default Agent;
