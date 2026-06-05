/**
 * AI Agent Assistant (AiAgentAssistant)
 * Event Bus — structured agent event stream with Redis persistence
 *
 * Emits typed lifecycle events (task.started, phase.changed, tool.called, etc.)
 * in-process via EventEmitter and persists them to Redis LPUSH lists keyed by
 * traceId so every request's full event timeline can be replayed or audited.
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import logger from './logger';

// ─── Event type union ───────────────────────────────────────────────────────

export type AgentEventType =
  | 'task.started'
  | 'task.completed'
  | 'task.error'
  | 'task.cancelled'
  | 'phase.changed'
  | 'tool.called'
  | 'tool.result';

interface AgentEventBase {
  type: AgentEventType;
  traceId: string;
  chatId: number;
  /** ISO-8601 timestamp */
  timestamp: string;
}

export interface TaskStartedEvent extends AgentEventBase {
  type: 'task.started';
  taskId: string | null;
  message: string;
}

export interface TaskCompletedEvent extends AgentEventBase {
  type: 'task.completed';
  taskId: string | null;
  toolCallCount: number;
}

export interface TaskErrorEvent extends AgentEventBase {
  type: 'task.error';
  taskId: string | null;
  error: string;
}

export interface TaskCancelledEvent extends AgentEventBase {
  type: 'task.cancelled';
  taskId: string | null;
}

export interface PhaseChangedEvent extends AgentEventBase {
  type: 'phase.changed';
  taskId: string | null;
  from: string;
  to: string;
}

export interface ToolCalledEvent extends AgentEventBase {
  type: 'tool.called';
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent extends AgentEventBase {
  type: 'tool.result';
  toolName: string;
  durationMs: number;
  success: boolean;
}

export type AgentEvent =
  | TaskStartedEvent
  | TaskCompletedEvent
  | TaskErrorEvent
  | TaskCancelledEvent
  | PhaseChangedEvent
  | ToolCalledEvent
  | ToolResultEvent;

// ─── Redis config ────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const EVENT_KEY_PREFIX = 'aiagent:events:';
const TTL_SECONDS = 86_400; // 24 hours

// ─── EventBus class ──────────────────────────────────────────────────────────

class EventBus extends EventEmitter {
  private redisClient: RedisClientType | null = null;
  private connecting = false;

  private async getRedis(): Promise<RedisClientType | null> {
    if (this.redisClient?.isOpen) return this.redisClient;
    if (this.connecting) return null;
    this.connecting = true;
    try {
      const client = createClient({ url: REDIS_URL }) as RedisClientType;
      client.on('error', err => logger.warn({ err }, 'EventBus Redis error'));
      await client.connect();
      this.redisClient = client;
      logger.info('EventBus Redis client connected');
      return client;
    } catch (err) {
      logger.warn({ err }, 'EventBus: Redis unavailable — events are in-process only');
      return null;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Emit a typed agent event.
   * Fires in-process listeners synchronously, then persists to Redis asynchronously.
   */
  async emit_event(event: AgentEvent): Promise<void> {
    // In-process subscribers
    this.emit(event.type, event);
    this.emit('*', event);

    // Persist to Redis (best-effort — never throws)
    try {
      const redis = await this.getRedis();
      if (redis) {
        const key = EVENT_KEY_PREFIX + event.traceId;
        await redis.lPush(key, JSON.stringify(event));
        await redis.expire(key, TTL_SECONDS);
      }
    } catch (err) {
      logger.warn({ err, eventType: event.type }, 'EventBus: failed to persist event');
    }
  }

  /**
   * Retrieve all events for a given traceId in chronological order.
   */
  async getEvents(traceId: string): Promise<AgentEvent[]> {
    try {
      const redis = await this.getRedis();
      if (!redis) return [];
      const raw = await redis.lRange(EVENT_KEY_PREFIX + traceId, 0, -1);
      // lPush prepends, so the list is newest-first; reverse to get chronological order
      return raw.reverse().map(r => JSON.parse(r) as AgentEvent);
    } catch (err) {
      logger.warn({ err, traceId }, 'EventBus: failed to fetch events');
      return [];
    }
  }
}

export const eventBus = new EventBus();
export default eventBus;
