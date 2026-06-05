/**
 * AI Agent Assistant (AiAgentAssistant)
 * Master Orchestrator - Central coordination agent
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { v4 as uuidv4 } from 'uuid';
import { Agent } from './Agent';
import { Message, AgentConfig } from '../types';
import logger, { traceStore } from '../utils/logger';

/**
 * MasterOrchestrator: Central coordination agent
 * Routes requests to appropriate worker agents
 * Manages agent lifecycle and communication
 */
export class MasterOrchestrator extends Agent {
  private workerAgents: Map<string, any>;
  private taskQueue: Array<{
    id: string;
    targetAgent: string;
    action: string;
    payload: Record<string, any>;
    timestamp: number;
  }>;
  /** Pending result promises keyed by correlationId — resolved when worker responds */
  private pendingResults = new Map<string, {
    resolve: (result: any) => void;
    reject:  (error: any)  => void;
    timer:   ReturnType<typeof setTimeout>;
  }>();

  constructor(config: AgentConfig, messageBus: any) {
    if (config.type !== 'orchestrator') {
      throw new Error('MasterOrchestrator must have type "orchestrator"');
    }
    super(config, messageBus);
    this.workerAgents = new Map();
    this.taskQueue = [];
  }

  /**
   * Register a worker agent
   */
  registerWorkerAgent(agentId: string, agentName: string): void {
    this.workerAgents.set(agentId, {
      id: agentId,
      name: agentName,
      isHealthy: true,
      lastHeartbeat: Date.now(),
      taskCount: 0,
    });

    logger.info(
      { orchestratorId: this.id, workerId: agentId, workerName: agentName },
      'Worker agent registered'
    );
  }

  /**
   * Get list of registered workers
   */
  getWorkers(): Array<{ id: string; name: string; isHealthy: boolean }> {
    return Array.from(this.workerAgents.values()).map((w) => ({
      id: w.id,
      name: w.name,
      isHealthy: w.isHealthy,
    }));
  }

  /**
   * Find the best worker for a task
   */
  private findBestWorker(skillRequired?: string): string | null {
    let bestWorker = null;
    let leastTasks = Infinity;

    for (const [workerId, workerInfo] of this.workerAgents) {
      if (workerInfo.isHealthy && workerInfo.taskCount < leastTasks) {
        bestWorker = workerId;
        leastTasks = workerInfo.taskCount;
      }
    }

    return bestWorker;
  }

  /**
   * Dispatch a task to a worker agent and AWAIT its result.
   * A correlationId is injected into the payload and echoed back by the worker
   * so handleWorkerResponse can resolve the correct pending Promise.
   */
  async dispatchTask(
    action: string,
    payload: Record<string, any> = {},
    targetAgent?: string,
    timeoutMs = 300_000   // 5 minutes default — covers most sysadmin tasks
  ): Promise<{ taskId: string; targetAgent: string; result: any }> {
    const agent = targetAgent || this.findBestWorker();

    if (!agent) {
      throw new Error('No healthy worker agents available');
    }

    const workerInfo = this.workerAgents.get(agent);
    if (!workerInfo) {
      throw new Error(`Worker agent ${agent} not found`);
    }

    // Thread correlationId (result matching) and traceId (log correlation) through the payload
    const correlationId = uuidv4();
    const traceId = traceStore.getStore()?.traceId;
    const taskId = await this.sendMessage(agent, action, {
      ...payload,
      _correlationId: correlationId,
      ...(traceId ? { _traceId: traceId } : {}),
    });
    workerInfo.taskCount++;
    workerInfo.lastHeartbeat = Date.now();

    logger.info(
      { orchestratorId: this.id, workerId: agent, action, taskId, correlationId },
      'Task dispatched to worker — awaiting result'
    );

    // Wait for the worker's response (or timeout)
    const result = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResults.delete(correlationId);
        reject(new Error(`Worker task "${action}" timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);
      this.pendingResults.set(correlationId, { resolve, reject, timer });
    });

    return { taskId, targetAgent: agent, result };
  }

  /**
   * Broadcast task to all workers
   */
  async broadcastTask(
    action: string,
    payload: Record<string, any> = {}
  ): Promise<Array<{ taskId: string; targetAgent: string; result: any }>> {
    const results: Array<{ taskId: string; targetAgent: string; result: any }> = [];

    for (const [workerId] of this.workerAgents) {
      const result = await this.dispatchTask(action, payload, workerId);
      results.push(result);
    }

    logger.info(
      { orchestratorId: this.id, taskCount: results.length },
      'Task broadcasted to all workers'
    );

    return results;
  }

  /**
   * Handle incoming messages
   */
  protected async handleMessage(message: Message): Promise<void> {
    logger.debug(
      { orchestratorId: this.id, messageId: message.id, action: message.action, from: message.from },
      'Orchestrator received message'
    );

    try {
      if (message.type === 'response') {
        // Handle response from worker
        await this.handleWorkerResponse(message);
      } else if (message.type === 'request' || message.type === 'command') {
        // Route request to appropriate worker
        const dispatchResult = await this.dispatchTask(message.action, message.payload);
        logger.debug(
          { orchestratorId: this.id, dispatchResult },
          'Request routed to worker'
        );
      }
    } catch (error) {
      logger.error(
        { orchestratorId: this.id, messageId: message.id, error },
        'Error handling message in orchestrator'
      );
    }
  }

  /**
   * Handle responses from workers — resolves the pending Promise registered in dispatchTask.
   */
  private async handleWorkerResponse(message: Message): Promise<void> {
    // Update worker health counters
    const workerInfo = this.workerAgents.get(message.from);
    if (workerInfo) {
      workerInfo.taskCount = Math.max(0, workerInfo.taskCount - 1);
      workerInfo.lastHeartbeat = Date.now();
    }

    // Resolve the waiting dispatchTask Promise
    const correlationId = message.payload?._correlationId;
    if (!correlationId || !this.pendingResults.has(correlationId)) {
      logger.debug(
        { orchestratorId: this.id, workerId: message.from, action: message.action, correlationId },
        'Worker response received (no pending caller — fire-and-forget task)'
      );
      return;
    }

    const pending = this.pendingResults.get(correlationId)!;
    clearTimeout(pending.timer);
    this.pendingResults.delete(correlationId);

    // Strip internal routing metadata before returning result to caller
    const { _correlationId, ...cleanPayload } = message.payload ?? {};

    if (message.action.endsWith(':error')) {
      logger.warn(
        { orchestratorId: this.id, workerId: message.from, action: message.action },
        'Worker returned error'
      );
      pending.reject(new Error(cleanPayload?.error || 'Worker returned an error'));
    } else {
      logger.info(
        { orchestratorId: this.id, workerId: message.from, action: message.action },
        'Worker result resolved to caller'
      );
      pending.resolve(cleanPayload);
    }
  }

  /**
   * Health check for workers
   */
  async healthCheck(): Promise<{
    orchestratorId: string;
    healthyWorkers: number;
    unhealthyWorkers: number;
    workers: Array<{ id: string; name: string; isHealthy: boolean }>;
  }> {
    const now = Date.now();
    const heartbeatTimeout = 300000; // 5 minutes — workers have no active heartbeat, only update on task dispatch/complete

    for (const [, workerInfo] of this.workerAgents) {
      const isStale = now - workerInfo.lastHeartbeat > heartbeatTimeout;
      workerInfo.isHealthy = !isStale;
    }

    const workers = this.getWorkers();
    const healthyCount = workers.filter((w) => w.isHealthy).length;
    const unhealthyCount = workers.filter((w) => !w.isHealthy).length;

    logger.info(
      { orchestratorId: this.id, healthy: healthyCount, unhealthy: unhealthyCount },
      'Health check completed'
    );

    return {
      orchestratorId: this.id,
      healthyWorkers: healthyCount,
      unhealthyWorkers: unhealthyCount,
      workers,
    };
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    id: string;
    name: string;
    type: string;
    isRunning: boolean;
    workers: number;
    activeTasks: number;
  } {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      isRunning: this.isRunning,
      workers: this.workerAgents.size,
      activeTasks: this.activeTasks,
    };
  }

  /**
   * Get all tasks (pending, queued, and running)
   */
  getAllTasks(): {
    pending: Array<any>;
    running: Array<{
      workerId: string;
      workerName: string;
      taskCount: number;
    }>;
    summary: {
      totalPending: number;
      totalRunning: number;
      totalTasks: number;
    };
  } {
    // Pending/queued tasks from task queue
    const pending = this.taskQueue.map((task) => ({
      id: task.id,
      action: task.action,
      targetAgent: task.targetAgent,
      timestamp: task.timestamp,
      age: Date.now() - task.timestamp,
    }));

    // Running tasks from worker agents
    const running = Array.from(this.workerAgents.values())
      .filter((w) => w.taskCount > 0)
      .map((w) => ({
        workerId: w.id,
        workerName: w.name,
        taskCount: w.taskCount,
      }));

    const totalRunning = running.reduce((sum, w) => sum + w.taskCount, 0);

    return {
      pending,
      running,
      summary: {
        totalPending: pending.length,
        totalRunning: totalRunning,
        totalTasks: pending.length + totalRunning,
      },
    };
  }
}


export default MasterOrchestrator;
