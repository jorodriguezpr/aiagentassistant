/**
 * AI Agent Assistant (AiAgentAssistant)
 * Core types and interfaces
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

/**
 * Core types and interfaces for the multi-agent system
 */

export interface Message {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'event' | 'command';
  action: string;
  payload: Record<string, any>;
  timestamp: number;
  correlationId?: string;
}

export interface Skill {
  name: string;
  description: string;
  execute: (params: Record<string, any>) => Promise<any>;
}

export interface DeveloperInfo {
  name: string;
  email: string;
  github: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  type: 'worker' | 'orchestrator';
  description: string;
  skills: Skill[];
  maxConcurrentTasks?: number;
  maxModelCalls?: number;
  metadata?: {
    developer?: DeveloperInfo;
    version?: string;
    [key: string]: any;
  };
}

export interface AgentState {
  agentId: string;
  isReady: boolean;
  activeTasks: number;
  lastHeartbeat: number;
  skills: string[];
}

export interface MessageBusOptions {
  redisUrl?: string;
  maxRetries?: number;
}

export interface TelegramConfig {
  token: string;
  webhookUrl?: string;
  webhookPort?: number;
}

export interface WhatsAppConfig {
  sessionName?: string;
  puppeteerOptions?: any;
}

export interface DiscordConfig {
  token: string;
  prefix?: string;
  statusMessage?: string;
}

export interface GatewayConfig {
  telegram?: TelegramConfig;
  whatsapp?: WhatsAppConfig;
  discord?: DiscordConfig;
}
