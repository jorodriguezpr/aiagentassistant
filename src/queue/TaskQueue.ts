import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { ContextLibrary, ContextType } from '../knowledge/ContextLibrary';

/**
 * Task status
 */
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Task priority
 */
export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * Task context snapshot
 */
export interface TaskContext {
  conversationHistory?: any[];
  userRequest: string;
  reasoning?: string; // AI's reasoning for the task
  toolsNeeded?: string[];
  dependencies?: string[]; // IDs of other tasks this depends on
  estimatedDuration?: number; // Estimated time in seconds
  retryCount?: number;
  lastError?: string;
  contextLibraryId?: string; // Link to context library entry
  metadata?: Record<string, any>;
}

/**
 * Task entry
 */
export interface Task {
  id: string;
  status: TaskStatus;
  priority: TaskPriority;
  title: string;
  description: string;
  context: TaskContext;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  userId?: string;
  chatId?: number;
  result?: any;
  errorHistory?: Array<{
    timestamp: string;
    error: string;
    retryCount: number;
  }>;
}

/**
 * Task Queue Configuration
 */
export interface TaskQueueConfig {
  maxRetries?: number;
  retryDelay?: number; // Delay between retries in ms
  autoRetry?: boolean;
  persistPath?: string;
}

/**
 * Task Queue with Context Preservation
 * 
 * Features:
 * - Persistent storage of tasks
 * - Full context preservation (conversation, reasoning, dependencies)
 * - Priority-based execution
 * - Automatic retry on failure
 * - Task dependencies tracking
 * - Integration with context library
 * - Progress tracking and reporting
 */
export class TaskQueue {
  private queuePath: string;
  private tasks: Map<string, Task>;
  private contextLibrary: ContextLibrary;
  private config: Required<TaskQueueConfig>;

  constructor(config?: TaskQueueConfig, contextLibrary?: ContextLibrary) {
    this.config = {
      maxRetries: config?.maxRetries || 3,
      retryDelay: config?.retryDelay || 5000,
      autoRetry: config?.autoRetry !== false,
      persistPath: config?.persistPath || path.join(
        process.env.HOME || process.env.USERPROFILE || '/root',
        '.aiagent',
        'task-queue.json'
      ),
    };

    this.queuePath = this.config.persistPath;
    this.tasks = new Map();
    this.contextLibrary = contextLibrary || new ContextLibrary();

    this.loadQueue();

    logger.info({ 
      queuePath: this.queuePath, 
      taskCount: this.tasks.size 
    }, '📋 Task queue initialized');
  }

  /**
   * Add a new task to the queue
   */
  async addTask(
    title: string,
    description: string,
    context: TaskContext,
    priority: TaskPriority = TaskPriority.NORMAL,
    userId?: string,
    chatId?: number
  ): Promise<string> {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const task: Task = {
      id,
      status: TaskStatus.PENDING,
      priority,
      title,
      description,
      context,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId,
      chatId,
    };

    this.tasks.set(id, task);
    await this.saveQueue();

    // Store in context library for future reference
    const contextId = await this.contextLibrary.storeContext(
      ContextType.PATTERN,
      `Task: ${title}`,
      JSON.stringify({ task, context }, null, 2),
      ['task', 'queue', priority, ...title.split(' ').slice(0, 3)],
      {
        taskId: id,
        priority,
        status: task.status,
      },
      userId,
      chatId
    );

    // Link back to context library
    task.context.contextLibraryId = contextId;
    await this.saveQueue();

    logger.info({ 
      id, 
      title, 
      priority,
      contextId 
    }, '✅ Task added to queue');

    return id;
  }

  /**
   * Get next pending task based on priority
   */
  getNextTask(): Task | null {
    const priorityOrder = [
      TaskPriority.URGENT,
      TaskPriority.HIGH,
      TaskPriority.NORMAL,
      TaskPriority.LOW,
    ];

    for (const priority of priorityOrder) {
      for (const task of this.tasks.values()) {
        // Check if task is pending and has no pending dependencies
        if (
          task.status === TaskStatus.PENDING &&
          task.priority === priority &&
          !this.hasPendingDependencies(task)
        ) {
          return task;
        }
      }
    }

    return null;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): Task | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    result?: any,
    error?: string
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn({ taskId }, '❌ Task not found for status update');
      return false;
    }

    const previousStatus = task.status;
    task.status = status;
    task.updatedAt = new Date().toISOString();

    if (status === TaskStatus.IN_PROGRESS && !task.startedAt) {
      task.startedAt = new Date().toISOString();
    }

    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      task.completedAt = new Date().toISOString();
    }

    if (result !== undefined) {
      task.result = result;
    }

    if (error) {
      if (!task.errorHistory) {
        task.errorHistory = [];
      }

      task.errorHistory.push({
        timestamp: new Date().toISOString(),
        error,
        retryCount: task.context.retryCount || 0,
      });

      task.context.lastError = error;
    }

    await this.saveQueue();

    // Store outcome in context library
    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      await this.contextLibrary.storeContext(
        status === TaskStatus.COMPLETED ? ContextType.SUCCESS : ContextType.ERROR,
        `${status === TaskStatus.COMPLETED ? 'Success' : 'Failed'}: ${task.title}`,
        JSON.stringify({ task, result, error }, null, 2),
        ['task', status, task.priority],
        {
          taskId,
          previousStatus,
          duration: task.startedAt && task.completedAt
            ? new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()
            : undefined,
        },
        task.userId,
        task.chatId
      );
    }

    logger.info({ 
      taskId, 
      previousStatus, 
      newStatus: status 
    }, '📊 Task status updated');

    return true;
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn({ taskId }, '❌ Task not found for retry');
      return false;
    }

    if (task.status !== TaskStatus.FAILED) {
      logger.warn({ taskId, status: task.status }, '⚠️ Only failed tasks can be retried');
      return false;
    }

    // Check retry count
    const retryCount = (task.context.retryCount || 0) + 1;
    if (retryCount > this.config.maxRetries) {
      logger.warn({ taskId, retryCount }, '❌ Max retries exceeded');
      return false;
    }

    task.context.retryCount = retryCount;
    task.status = TaskStatus.PENDING;
    task.updatedAt = new Date().toISOString();

    await this.saveQueue();

    logger.info({ taskId, retryCount }, '🔄 Task queued for retry');
    return true;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
      logger.warn({ taskId, status: task.status }, '⚠️ Cannot cancel completed/cancelled task');
      return false;
    }

    task.status = TaskStatus.CANCELLED;
    task.updatedAt = new Date().toISOString();
    task.completedAt = new Date().toISOString();

    await this.saveQueue();

    logger.info({ taskId }, '🚫 Task cancelled');
    return true;
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.status === status);
  }

  /**
   * Get tasks by user
   */
  getTasksByUser(userId: string): Task[] {
    return Array.from(this.tasks.values()).filter(t => t.userId === userId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<TaskPriority, number>;
    avgCompletionTime?: number;
    successRate?: number;
  } {
    const byStatus: Record<TaskStatus, number> = {
      [TaskStatus.PENDING]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.COMPLETED]: 0,
      [TaskStatus.FAILED]: 0,
      [TaskStatus.CANCELLED]: 0,
    };

    const byPriority: Record<TaskPriority, number> = {
      [TaskPriority.LOW]: 0,
      [TaskPriority.NORMAL]: 0,
      [TaskPriority.HIGH]: 0,
      [TaskPriority.URGENT]: 0,
    };

    let totalCompletionTime = 0;
    let completedCount = 0;
    let successCount = 0;

    for (const task of this.tasks.values()) {
      byStatus[task.status]++;
      byPriority[task.priority]++;

      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
        completedCount++;
        if (task.status === TaskStatus.COMPLETED) {
          successCount++;
        }

        if (task.startedAt && task.completedAt) {
          const duration = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
          totalCompletionTime += duration;
        }
      }
    }

    return {
      total: this.tasks.size,
      byStatus,
      byPriority,
      avgCompletionTime: completedCount > 0 ? totalCompletionTime / completedCount : undefined,
      successRate: completedCount > 0 ? successCount / completedCount : undefined,
    };
  }

  /**
   * Check if task has pending dependencies
   */
  private hasPendingDependencies(task: Task): boolean {
    if (!task.context.dependencies || task.context.dependencies.length === 0) {
      return false;
    }

    for (const depId of task.context.dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask || depTask.status !== TaskStatus.COMPLETED) {
        return true; // Has pending dependency
      }
    }

    return false;
  }

  /**
   * Load queue from disk
   */
  private loadQueue(): void {
    try {
      const queueDir = path.dirname(this.queuePath);
      if (!fs.existsSync(queueDir)) {
        fs.mkdirSync(queueDir, { recursive: true });
      }

      if (fs.existsSync(this.queuePath)) {
        const queueData = fs.readFileSync(this.queuePath, 'utf8');
        const parsed = JSON.parse(queueData);

        for (const task of parsed.tasks || []) {
          this.tasks.set(task.id, task);
        }

        logger.info({ taskCount: this.tasks.size }, '📂 Loaded task queue');
      } else {
        logger.info('📂 No existing queue found, creating new queue');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to load task queue');
    }
  }

  /**
   * Save queue to disk
   */
  private async saveQueue(): Promise<void> {
    try {
      const queueData = {
        version: '1.0',
        lastModified: new Date().toISOString(),
        tasks: Array.from(this.tasks.values()),
      };

      const tempPath = this.queuePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(queueData, null, 2), 'utf8');
      fs.renameSync(tempPath, this.queuePath);

      logger.debug({ taskCount: this.tasks.size }, '💾 Task queue saved');
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to save task queue');
      throw error;
    }
  }

  /**
   * Clean up old completed/cancelled tasks
   */
  async cleanup(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let cleanedCount = 0;

    for (const [id, task] of this.tasks.entries()) {
      if (
        (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) &&
        task.completedAt &&
        new Date(task.completedAt) < cutoffDate
      ) {
        this.tasks.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      await this.saveQueue();
      logger.info({ cleanedCount, daysToKeep }, '🧹 Cleaned up old tasks');
    }

    return cleanedCount;
  }
}

// Export singleton instance
let _queueInstance: TaskQueue | null = null;

export function getTaskQueue(config?: TaskQueueConfig, contextLibrary?: ContextLibrary): TaskQueue {
  if (!_queueInstance) {
    _queueInstance = new TaskQueue(config, contextLibrary);
  }
  return _queueInstance;
}
