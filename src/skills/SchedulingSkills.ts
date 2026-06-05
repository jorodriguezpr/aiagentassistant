/**
 * AI Agent Assistant (AiAgentAssistant)
 * Scheduling Skills - Task scheduling and automation
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

/**
 * SchedulingSkills: Task scheduling and automation capabilities
 * 
 * Features:
 * - Schedule recurring tasks (daily, hourly, weekly, custom cron)
 * - Send automated emails on schedule
 * - Execute commands on schedule
 * - Manage scheduled tasks (list, pause, resume, delete)
 * - Persistent task storage
 */

import * as cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { sendEmailSkill } from './EmailSkills';
import { executeCommandSkill } from './ExampleSkills';

// Storage path for scheduled tasks
const TASKS_DIR = path.join(process.env.HOME || '/root', '.config', 'aiagentassistant', 'scheduled-tasks');
const TASKS_FILE = path.join(TASKS_DIR, 'tasks.json');

// Ensure tasks directory exists
if (!fs.existsSync(TASKS_DIR)) {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

export interface ScheduledTask {
  id: string;
  name: string;
  type: 'email' | 'command' | 'custom';
  schedule: string; // Cron expression
  scheduleDescription: string; // Human-readable schedule
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  
  // Email-specific fields
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;
  emailAccount?: string;
  
  // Command-specific fields
  command?: string;
  
  // Custom action fields
  action?: string;
  payload?: any;
}

// Active cron jobs in memory
const activeJobs = new Map<string, cron.ScheduledTask>();

/**
 * Load scheduled tasks from persistent storage
 */
function loadTasks(): ScheduledTask[] {
  try {
    if (fs.existsSync(TASKS_FILE)) {
      const data = fs.readFileSync(TASKS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to load scheduled tasks');
  }
  return [];
}

/**
 * Save scheduled tasks to persistent storage
 */
function saveTasks(tasks: ScheduledTask[]): void {
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    logger.info({ taskCount: tasks.length }, 'Scheduled tasks saved');
  } catch (error) {
    logger.error({ error }, 'Failed to save scheduled tasks');
  }
}

/**
 * Generate unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse simple schedule strings into cron expressions
 */
function parseToCron(schedule: string): { cron: string; description: string } {
  const schedLower = schedule.toLowerCase().trim();
  
  // Daily patterns
  if (schedLower === 'daily' || schedLower === 'every day') {
    return { cron: '0 9 * * *', description: 'Daily at 9:00 AM' };
  }
  if (schedLower.match(/daily at (\d{1,2}):?(\d{2})?\s*(am|pm)?/i)) {
    const match = schedLower.match(/daily at (\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    let hour = parseInt(match![1]);
    const minute = match![2] ? parseInt(match![2]) : 0;
    const ampm = match![3]?.toLowerCase();
    
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    
    return { 
      cron: `${minute} ${hour} * * *`, 
      description: `Daily at ${hour}:${minute.toString().padStart(2, '0')}` 
    };
  }
  
  // Hourly patterns
  if (schedLower === 'hourly' || schedLower === 'every hour') {
    return { cron: '0 * * * *', description: 'Every hour' };
  }
  
  // Every N hours
  if (schedLower.match(/every (\d+) hours?/)) {
    const match = schedLower.match(/every (\d+) hours?/);
    const hours = parseInt(match![1]);
    return { cron: `0 */${hours} * * *`, description: `Every ${hours} hours` };
  }
  
  // Weekly patterns
  if (schedLower.match(/weekly|every week/)) {
    return { cron: '0 9 * * 1', description: 'Weekly on Monday at 9:00 AM' };
  }
  
  // Every N minutes
  if (schedLower.match(/every (\d+) minutes?/)) {
    const match = schedLower.match(/every (\d+) minutes?/);
    const minutes = parseInt(match![1]);
    return { cron: `*/${minutes} * * * *`, description: `Every ${minutes} minutes` };
  }
  
  // Weekday-specific
  const weekdays: { [key: string]: number } = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6
  };
  
  for (const [day, num] of Object.entries(weekdays)) {
    if (schedLower.includes(day)) {
      return { cron: `0 9 * * ${num}`, description: `Every ${day.charAt(0).toUpperCase() + day.slice(1)} at 9:00 AM` };
    }
  }
  
  // Assume it's already a cron expression
  if (cron.validate(schedule)) {
    return { cron: schedule, description: `Custom: ${schedule}` };
  }
  
  // Default to daily
  return { cron: '0 9 * * *', description: 'Daily at 9:00 AM (default)' };
}

/**
 * Execute a scheduled task
 */
async function executeTask(task: ScheduledTask): Promise<void> {
  logger.info({ taskId: task.id, taskName: task.name, taskType: task.type }, 'Executing scheduled task');
  
  try {
    if (task.type === 'email') {
      // Send scheduled email
      const emailResult = await sendEmailSkill.execute({
        to: task.emailTo!,
        subject: task.emailSubject!,
        body: task.emailBody!,
        account: task.emailAccount
      });
      
      logger.info({ taskId: task.id, result: emailResult }, 'Scheduled email sent');
      
    } else if (task.type === 'command') {
      // Execute scheduled command
      const cmdResult = await executeCommandSkill.execute({
        command: task.command!
      });
      
      logger.info({ taskId: task.id, result: cmdResult }, 'Scheduled command executed');
    }
    
    // Update task run statistics
    const tasks = loadTasks();
    const taskIndex = tasks.findIndex(t => t.id === task.id);
    if (taskIndex !== -1) {
      tasks[taskIndex].lastRun = new Date().toISOString();
      tasks[taskIndex].runCount += 1;
      saveTasks(tasks);
    }
    
  } catch (error) {
    logger.error({ error, taskId: task.id, taskName: task.name }, 'Failed to execute scheduled task');
  }
}

/**
 * Start a scheduled task (create cron job)
 */
function startTask(task: ScheduledTask): void {
  if (!task.enabled) {
    logger.info({ taskId: task.id, taskName: task.name }, 'Task is disabled, skipping');
    return;
  }
  
  if (activeJobs.has(task.id)) {
    logger.warn({ taskId: task.id, taskName: task.name }, 'Task already running');
    return;
  }
  
  try {
    const job = cron.schedule(task.schedule, async () => {
      await executeTask(task);
    }, {
      scheduled: true,
      timezone: 'America/New_York' // Default timezone
    });
    
    activeJobs.set(task.id, job);
    logger.info({ taskId: task.id, taskName: task.name, schedule: task.scheduleDescription }, 'Scheduled task started');
    
  } catch (error) {
    logger.error({ error, taskId: task.id, taskName: task.name }, 'Failed to start scheduled task');
  }
}

/**
 * Stop a scheduled task
 */
function stopTask(taskId: string): void {
  const job = activeJobs.get(taskId);
  if (job) {
    job.stop();
    activeJobs.delete(taskId);
    logger.info({ taskId }, 'Scheduled task stopped');
  }
}

/**
 * Initialize scheduling system - load and start all enabled tasks
 */
export function initializeScheduler(): void {
  logger.info('Initializing task scheduler...');
  
  const tasks = loadTasks();
  const enabledTasks = tasks.filter(t => t.enabled);
  
  for (const task of enabledTasks) {
    startTask(task);
  }
  
  logger.info({ 
    totalTasks: tasks.length, 
    enabledTasks: enabledTasks.length,
    activeJobs: activeJobs.size
  }, 'Task scheduler initialized');
}

/**
 * Create a scheduled task
 */
export const createScheduledTaskSkill = {
  name: 'create_scheduled_task',
  description: 'Create a new scheduled task for recurring automation',
  
  async execute(params: {
    name: string;
    type: 'email' | 'command';
    schedule: string;
    
    // Email task fields
    emailTo?: string;
    emailSubject?: string;
    emailBody?: string;
    emailAccount?: string;
    
    // Command task fields
    command?: string;
  }): Promise<any> {
    try {
      const { name, type, schedule } = params;
      
      logger.info({ name, type, schedule }, '🔄 Creating scheduled task...');
      
      // Validate required fields
      if (!name || !type || !schedule) {
        const error = 'Missing required fields: name, type, schedule';
        logger.warn({ params }, error);
        return {
          success: false,
          error,
          message: `❌ ${error}`
        };
      }
      
      logger.info({ schedule }, '🔄 Parsing schedule expression...');
      
      // Parse schedule
      const { cron: cronExpr, description: schedDesc } = parseToCron(schedule);
      
      logger.info({ cronExpr, schedDesc }, '✅ Schedule parsed successfully');
      
      // Validate cron expression
      if (!cron.validate(cronExpr)) {
        const error = `Invalid schedule expression: ${schedule}`;
        logger.error({ schedule, cronExpr }, error);
        return {
          success: false,
          error,
          message: `❌ ${error}. Try formats like "daily", "hourly", or cron syntax like "0 9 * * *"`
        };
      }
      
      logger.info({ type }, '🔄 Validating task parameters...');
      
      // Validate type-specific fields
      if (type === 'email') {
        if (!params.emailTo || !params.emailSubject || !params.emailBody) {
          const error = 'Email tasks require: emailTo, emailSubject, emailBody';
          logger.warn({ params }, error);
          return {
            success: false,
            error,
            message: `❌ ${error}`
          };
        }
        logger.info({ emailTo: params.emailTo }, '✅ Email parameters validated');
      } else if (type === 'command') {
        if (!params.command) {
          const error = 'Command tasks require: command';
          logger.warn({ params }, error);
          return {
            success: false,
            error,
            message: `❌ ${error}`
          };
        }
        logger.info({ command: params.command }, '✅ Command parameters validated');
      }
      
      logger.info('🔄 Creating task object...');
      
      // Create task
      const task: ScheduledTask = {
        id: generateTaskId(),
        name,
        type,
        schedule: cronExpr,
        scheduleDescription: schedDesc,
        enabled: true,
        createdAt: new Date().toISOString(),
        runCount: 0,
        
        emailTo: params.emailTo,
        emailSubject: params.emailSubject,
        emailBody: params.emailBody,
        emailAccount: params.emailAccount,
        
        command: params.command
      };
      
      logger.info({ taskId: task.id }, '🔄 Saving task to storage...');
      
      // Save task
      const tasks = loadTasks();
      tasks.push(task);
      saveTasks(tasks);
      
      logger.info({ taskId: task.id }, '🔄 Starting scheduled job...');
      
      // Start task
      startTask(task);
      
      logger.info({ taskId: task.id, taskName: name, schedule: schedDesc }, '✅ Scheduled task created and started');
      
      return {
        success: true,
        message: `✅ Scheduled task created: "${name}"\n📅 Schedule: ${schedDesc}\n🆔 Task ID: ${task.id}`,
        taskId: task.id,
        schedule: schedDesc,
        nextRun: 'Task will run according to schedule',
        task: {
          id: task.id,
          name: task.name,
          type: task.type,
          schedule: task.scheduleDescription,
          enabled: task.enabled
        }
      };
      
    } catch (error: any) {
      const errorMsg = error?.message || error?.toString() || 'Unknown error occurred';
      logger.error({ 
        error, 
        errorMessage: errorMsg,
        errorStack: error?.stack,
        params 
      }, '❌ Failed to create scheduled task');
      
      return {
        success: false,
        error: errorMsg,
        message: `❌ Failed to create scheduled task: ${errorMsg}\n\nPlease check the task parameters and try again.`,
        details: {
          errorType: error?.constructor?.name || 'Error',
          hint: 'Common issues: invalid schedule format, missing email fields, or system permission problems'
        }
      };
    }
  }
};

/**
 * List all scheduled tasks
 */
export const listScheduledTasksSkill = {
  name: 'list_scheduled_tasks',
  description: 'List all scheduled tasks with their status and details',
  
  async execute(): Promise<any> {
    try {
      const tasks = loadTasks();
      
      if (tasks.length === 0) {
        return {
          success: true,
          message: 'No scheduled tasks found',
          tasks: []
        };
      }
      
      const taskList = tasks.map(task => ({
        id: task.id,
        name: task.name,
        type: task.type,
        schedule: task.scheduleDescription,
        enabled: task.enabled,
        status: task.enabled ? '✅ Active' : '⏸️ Paused',
        createdAt: task.createdAt,
        lastRun: task.lastRun || 'Never',
        runCount: task.runCount,
        
        // Include details based on type
        details: task.type === 'email' 
          ? `To: ${task.emailTo}, Subject: ${task.emailSubject}`
          : task.type === 'command'
          ? `Command: ${task.command}`
          : ''
      }));
      
      return {
        success: true,
        message: `Found ${tasks.length} scheduled task(s)`,
        totalTasks: tasks.length,
        activeTasks: tasks.filter(t => t.enabled).length,
        tasks: taskList
      };
      
    } catch (error: any) {
      logger.error({ error }, 'Failed to list scheduled tasks');
      return {
        success: false,
        error: error.message || 'Failed to list scheduled tasks'
      };
    }
  }
};

/**
 * Delete a scheduled task
 */
export const deleteScheduledTaskSkill = {
  name: 'delete_scheduled_task',
  description: 'Delete a scheduled task permanently',
  
  async execute(params: { taskId?: string; taskName?: string }): Promise<any> {
    try {
      const { taskId, taskName } = params;
      
      if (!taskId && !taskName) {
        return {
          success: false,
          error: 'Must provide either taskId or taskName'
        };
      }
      
      const tasks = loadTasks();
      const taskIndex = tasks.findIndex(t => 
        (taskId && t.id === taskId) || (taskName && t.name === taskName)
      );
      
      if (taskIndex === -1) {
        return {
          success: false,
          error: `Task not found: ${taskId || taskName}`
        };
      }
      
      const task = tasks[taskIndex];
      
      // Stop the task if running
      stopTask(task.id);
      
      // Remove from storage
      tasks.splice(taskIndex, 1);
      saveTasks(tasks);
      
      logger.info({ taskId: task.id, taskName: task.name }, 'Deleted scheduled task');
      
      return {
        success: true,
        message: `✅ Deleted scheduled task: "${task.name}"`
      };
      
    } catch (error: any) {
      logger.error({ error }, 'Failed to delete scheduled task');
      return {
        success: false,
        error: error.message || 'Failed to delete scheduled task'
      };
    }
  }
};

/**
 * Pause a scheduled task
 */
export const pauseScheduledTaskSkill = {
  name: 'pause_scheduled_task',
  description: 'Temporarily pause a scheduled task',
  
  async execute(params: { taskId?: string; taskName?: string }): Promise<any> {
    try {
      const { taskId, taskName } = params;
      
      if (!taskId && !taskName) {
        return {
          success: false,
          error: 'Must provide either taskId or taskName'
        };
      }
      
      const tasks = loadTasks();
      const task = tasks.find(t => 
        (taskId && t.id === taskId) || (taskName && t.name === taskName)
      );
      
      if (!task) {
        return {
          success: false,
          error: `Task not found: ${taskId || taskName}`
        };
      }
      
      if (!task.enabled) {
        return {
          success: true,
          message: `Task "${task.name}" is already paused`
        };
      }
      
      // Stop the task
      stopTask(task.id);
      
      // Update task status
      task.enabled = false;
      saveTasks(tasks);
      
      logger.info({ taskId: task.id, taskName: task.name }, 'Paused scheduled task');
      
      return {
        success: true,
        message: `⏸️ Paused scheduled task: "${task.name}"`
      };
      
    } catch (error: any) {
      logger.error({ error }, 'Failed to pause scheduled task');
      return {
        success: false,
        error: error.message || 'Failed to pause scheduled task'
      };
    }
  }
};

/**
 * Resume a scheduled task
 */
export const resumeScheduledTaskSkill = {
  name: 'resume_scheduled_task',
  description: 'Resume a paused scheduled task',
  
  async execute(params: { taskId?: string; taskName?: string }): Promise<any> {
    try {
      const { taskId, taskName } = params;
      
      if (!taskId && !taskName) {
        return {
          success: false,
          error: 'Must provide either taskId or taskName'
        };
      }
      
      const tasks = loadTasks();
      const task = tasks.find(t => 
        (taskId && t.id === taskId) || (taskName && t.name === taskName)
      );
      
      if (!task) {
        return {
          success: false,
          error: `Task not found: ${taskId || taskName}`
        };
      }
      
      if (task.enabled) {
        return {
          success: true,
          message: `Task "${task.name}" is already active`
        };
      }
      
      // Enable and start the task
      task.enabled = true;
      saveTasks(tasks);
      startTask(task);
      
      logger.info({ taskId: task.id, taskName: task.name }, 'Resumed scheduled task');
      
      return {
        success: true,
        message: `▶️ Resumed scheduled task: "${task.name}"`
      };
      
    } catch (error: any) {
      logger.error({ error }, 'Failed to resume scheduled task');
      return {
        success: false,
        error: error.message || 'Failed to resume scheduled task'
      };
    }
  }
};
