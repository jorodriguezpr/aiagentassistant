/**
 * AI Agent Assistant (AiAgentAssistant)
 * Task Checkpoint — Redis-backed conversation state persistence
 *
 * Saves AI agent task state after every tool batch so tasks can be resumed
 * across restarts or by the user via /resumetask.
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from './AIProvider';
import logger from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const KEY_PREFIX = 'aiagent:checkpoint:';
const CHAT_INDEX_PREFIX = 'aiagent:chat_checkpoints:';
const TTL_SECONDS = 86_400; // 24 hours

export type TaskPhase = 'planning' | 'executing' | 'validating';

export interface TaskCheckpoint {
  taskId: string;
  chatId: number;
  userId: number;
  originalMessage: string;
  model: string;
  history: ChatMessage[];
  toolCallCount: number;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Execution phase when checkpoint was saved — used to inject the right resume prompt */
  phase?: TaskPhase;
  /** Whether the plan-first JSON plan had been approved before the checkpoint was saved */
  planApproved?: boolean;
}

let _client: RedisClientType | null = null;
let _connecting = false;

async function getClient(): Promise<RedisClientType | null> {
  if (_client && _client.isOpen) return _client;
  if (_connecting) return null;
  _connecting = true;
  try {
    const client = createClient({ url: REDIS_URL }) as RedisClientType;
    client.on('error', (err) => logger.warn({ err }, 'Redis checkpoint client error'));
    await client.connect();
    _client = client;
    logger.info('Task checkpoint Redis client connected');
    return _client;
  } catch (err) {
    logger.warn({ err }, 'Task checkpoint: Redis unavailable — checkpointing disabled');
    return null;
  } finally {
    _connecting = false;
  }
}

export async function saveCheckpoint(cp: Omit<TaskCheckpoint, 'taskId' | 'createdAt' | 'updatedAt'> & { taskId?: string }): Promise<string | null> {
  const client = await getClient();
  if (!client) return null;

  const taskId = cp.taskId || uuidv4();
  const now = new Date().toISOString();
  const full: TaskCheckpoint = {
    ...cp,
    taskId,
    createdAt: cp.taskId ? (await loadCheckpoint(taskId))?.createdAt ?? now : now,
    updatedAt: now,
  };

  try {
    const key = KEY_PREFIX + taskId;
    const indexKey = CHAT_INDEX_PREFIX + cp.chatId;
    await client.setEx(key, TTL_SECONDS, JSON.stringify(full));
    await client.sAdd(indexKey, taskId);
    await client.expire(indexKey, TTL_SECONDS);
    return taskId;
  } catch (err) {
    logger.warn({ err, taskId }, 'Failed to save task checkpoint');
    return null;
  }
}

export async function loadCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const raw = await client.get(KEY_PREFIX + taskId);
    return raw ? (JSON.parse(raw) as TaskCheckpoint) : null;
  } catch (err) {
    logger.warn({ err, taskId }, 'Failed to load task checkpoint');
    return null;
  }
}

export async function listCheckpoints(chatId: number): Promise<TaskCheckpoint[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const ids = await client.sMembers(CHAT_INDEX_PREFIX + chatId);
    const results = await Promise.all(ids.map(id => loadCheckpoint(id)));
    return results
      .filter((cp): cp is TaskCheckpoint => cp !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    logger.warn({ err, chatId }, 'Failed to list task checkpoints');
    return [];
  }
}

export async function deleteCheckpoint(taskId: string, chatId: number): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.del(KEY_PREFIX + taskId);
    await client.sRem(CHAT_INDEX_PREFIX + chatId, taskId);
  } catch (err) {
    logger.warn({ err, taskId }, 'Failed to delete task checkpoint');
  }
}
