/**
 * IT Admin Automation Skill - Complete Rewrite
 * Handles complex multi-step administrative tasks autonomously
 * Executes sequential commands with error handling and reporting
 * Features AI-driven plan generation for custom tasks not in predefined library
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 */

import logger from '../utils/logger.js';
import { userPreferencesManager } from '../utils/UserPreferencesManager.js';
import { AIProvider, ChatMessage } from '../utils/AIProvider.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExecutionStep {
  stepNumber: number;
  command: string;
  description: string;
  expectedOutput?: string[];
  errorPatterns?: string[];
  isOptional?: boolean;
  rollbackCommand?: string;
}

export interface ExecutionPlan {
  taskName: string;
  totalSteps: number;
  estimatedTime: string;
  steps: ExecutionStep[];
  preChecks: string[];
  postVerification: string[];
  rollbackPlan?: ExecutionStep[];
}

export interface TaskResult {
  success: boolean;
  taskName: string;
  completedSteps: number;
  totalSteps: number;
  output: string[];
  errors: string[];
  warnings: string[];
  executionTime: number;
  details: string;
}

/**
 * Predefined LAMP stack installation plan
 */
const LAMP_STACK_PLAN: ExecutionPlan = {
  taskName: 'Install LAMP Stack (Apache, MySQL, PHP 8.3)',
  totalSteps: 10,
  estimatedTime: '15:00',
  steps: [
    { stepNumber: 1, command: 'apt update', description: 'Update package manager' },
    { stepNumber: 2, command: 'apt install -y apache2', description: 'Install Apache web server' },
    { stepNumber: 3, command: 'apt install -y mysql-server', description: 'Install MySQL database server' },
    { stepNumber: 4, command: 'apt install -y php8.3 php8.3-mysql php8.3-curl php8.3-gd php8.3-xml php8.3-json', description: 'Install PHP 8.3 and modules' },
    { stepNumber: 5, command: 'a2enmod php8.3', description: 'Enable PHP module in Apache' },
    { stepNumber: 6, command: 'a2enmod rewrite', description: 'Enable rewrite module' },
    { stepNumber: 7, command: 'systemctl restart apache2', description: 'Restart Apache' },
    { stepNumber: 8, command: 'systemctl enable apache2', description: 'Enable Apache on boot' },
    { stepNumber: 9, command: 'systemctl enable mysql', description: 'Enable MySQL on boot' },
    { stepNumber: 10, command: 'systemctl status apache2 && systemctl status mysql', description: 'Verify services are running' },
  ],
  preChecks: ['which apt', 'whoami'],
  postVerification: ['apache2 -version', 'mysql --version', 'php --version'],
};

/**
 * Predefined WordPress installation plan
 */
const WORDPRESS_PLAN: ExecutionPlan = {
  taskName: 'Install and Configure WordPress',
  totalSteps: 8,
  estimatedTime: '20:00',
  steps: [
    { stepNumber: 1, command: 'cd /var/www/html && wget https://wordpress.org/latest.tar.gz', description: 'Download WordPress' },
    { stepNumber: 2, command: 'cd /var/www/html && tar -xzf latest.tar.gz', description: 'Extract WordPress' },
    { stepNumber: 3, command: 'cp /var/www/html/wordpress/wp-config-sample.php /var/www/html/wordpress/wp-config.php', description: 'Create WordPress config' },
    { stepNumber: 4, command: 'chown -R www-data:www-data /var/www/html/wordpress', description: 'Set permissions' },
    { stepNumber: 5, command: 'chmod -R 755 /var/www/html/wordpress', description: 'Set directory permissions' },
    { stepNumber: 6, command: 'a2enmod rewrite && systemctl reload apache2', description: 'Enable rewrite and reload Apache' },
    { stepNumber: 7, command: 'curl http://localhost/wordpress/', description: 'Verify WordPress is accessible' },
    { stepNumber: 8, command: 'echo "✅ WordPress installed. Visit http://your-domain/wordpress to configure"', description: 'Confirm installation' },
  ],
  preChecks: ['which apache2', 'which mysql', 'which php'],
  postVerification: ['curl -I http://localhost/wordpress'],
};

/**
 * Get predefined plan by task type
 */
function getTaskPlan(taskDescription: string): ExecutionPlan | null {
  const desc = taskDescription.toLowerCase();
  
  if (desc.includes('lamp') || (desc.includes('php') && desc.includes('mysql') && desc.includes('apache'))) {
    return LAMP_STACK_PLAN;
  }
  
  if (desc.includes('wordpress')) {
    return WORDPRESS_PLAN;
  }
  
  return null;
}

/**
 * Generate execution plan using AI
 * Fallback for tasks not in predefined library
 */
async function generateAIPlan(taskDescription: string, aiProvider: AIProvider): Promise<ExecutionPlan | null> {
  try {
    const prompt = `You are an expert Linux system administrator. Generate a detailed step-by-step execution plan for the following administrative task.

Task: ${taskDescription}
OS: Ubuntu 24.04
Assume: Root access, full package manager access

Generate ONLY valid JSON response with this exact structure (no markdown, no explanations):
{
  "taskName": "Brief descriptive name",
  "totalSteps": number,
  "estimatedTime": "HH:MM format",
  "steps": [
    {
      "stepNumber": 1,
      "command": "apt update",
      "description": "Update package list",
      "expectedOutput": [""],
      "errorPatterns": ["E: ", "error"],
      "isOptional": false
    }
  ],
  "preChecks": ["whoami", "which apt"],
  "postVerification": ["systemctl status service-name"]
}

Requirements:
1. Use ONLY standard Ubuntu/Debian commands
2. Always start with package updates
3. Use non-interactive flags (-y for apt-get, --yes for flags)
4. Include verification commands
5. Handle services (install, enable, start)
6. Return ONLY valid JSON
7. Ensure all commands are idempotent where possible
8. Add helpful descriptions for each step`;

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: prompt,
      },
    ];

    logger.info({
      skill: 'ITAdminAutomation',
      action: 'generating_ai_plan',
      task: taskDescription,
    });

    const response = await aiProvider.chatCompletion(messages);
    const content = response.content;

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({
        skill: 'ITAdminAutomation',
        action: 'ai_plan_no_json',
        response: content.substring(0, 100),
      });
      return null;
    }

    const plan = JSON.parse(jsonMatch[0]) as ExecutionPlan;

    logger.info({
      skill: 'ITAdminAutomation',
      action: 'ai_plan_generated',
      taskName: plan.taskName,
      steps: plan.totalSteps,
    });

    return plan;
  } catch (error) {
    logger.error({
      skill: 'ITAdminAutomation',
      action: 'ai_plan_generation_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Execute a command on remote host via SSH
 */
async function executeRemoteCommand(command: string, host: string, username: string, port: number): Promise<string> {
  try {
    // Try to get SSH config if available, otherwise use default SSH
    const sshConfig = userPreferencesManager.getSSHConfig?.(host, username);
    const keyPath = sshConfig && typeof sshConfig === 'object' && 'keyPath' in sshConfig ? `-i ${(sshConfig as any).keyPath}` : '';
    const sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 ${keyPath} -p ${port} ${username}@${host} "${command.replace(/"/g, '\\"')}"`;

    logger.info({
      skill: 'ITAdminAutomation',
      action: 'executing_remote_command',
      host,
      port,
    });

    const { stdout, stderr } = await execAsync(sshCommand, { maxBuffer: 10 * 1024 * 1024 });

    if (stderr && !stderr.includes('Warning')) {
      logger.warn({
        skill: 'ITAdminAutomation',
        action: 'command_warning',
      });
    }

    return stdout || 'Command executed successfully';
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({
      skill: 'ITAdminAutomation',
      action: 'remote_command_failed',
      host,
      error: errorMsg,
    });
    throw error;
  }
}

/**
 * IT Admin Automation Skill - Main Export
 */
const itAdminAutomationSkill = {
  name: 'it_admin_automation',
  displayName: 'IT Admin Automation',
  description: 'Execute complex multi-step IT administration tasks autonomously with AI-driven plan generation',
  category: 'System Administration',
  enabled: true,

  /**
   * Execute an IT administration task with AI-driven planning
   */
  async execute(params: Record<string, any>): Promise<TaskResult> {
    const { taskDescription, host, username = 'root', port = 22, dryRun = false, aiProvider } = params;

    if (!taskDescription || !host) {
      return {
        success: false,
        taskName: 'Unknown',
        completedSteps: 0,
        totalSteps: 0,
        output: [],
        errors: ['taskDescription and host are required'],
        warnings: [],
        executionTime: 0,
        details: 'Missing required parameters',
      };
    }

    const startTime = Date.now();

    logger.info({
      skill: 'ITAdminAutomation',
      action: 'task_initiated',
      task: taskDescription.substring(0, 80),
      host,
      username,
      dryRun,
    });

    try {
      // Step 1: Try predefined plans first (fastest)
      let plan = getTaskPlan(taskDescription);

      if (!plan) {
        logger.info({
          skill: 'ITAdminAutomation',
          action: 'no_predefined_plan',
        });

        // Step 2: If no predefined plan and aiProvider available, use AI-driven generation
        if (aiProvider) {
          logger.info({
            skill: 'ITAdminAutomation',
            action: 'attempting_ai_plan_generation',
          });
          plan = await generateAIPlan(taskDescription, aiProvider);
        }
      } else {
        logger.info({
          skill: 'ITAdminAutomation',
          action: 'using_predefined_plan',
          planName: plan.taskName,
        });
      }

      if (!plan) {
        return {
          success: false,
          taskName: 'Unknown',
          completedSteps: 0,
          totalSteps: 0,
          output: [],
          errors: [`No plan found for task and AI plan generation failed or unavailable`],
          warnings: [],
          executionTime: Date.now() - startTime,
          details: 'Task planning failed - try providing more specific task description',
        };
      }

      // Dry run mode - return plan without execution
      if (dryRun) {
        logger.info({
          skill: 'ITAdminAutomation',
          action: 'dry_run_mode',
        });

        return {
          success: true,
          taskName: plan.taskName,
          completedSteps: 0,
          totalSteps: plan.totalSteps,
          output: [`🔍 DRY RUN - Plan generated but not executed`, `Task: ${plan.taskName}`, `Steps: ${plan.totalSteps}`, `Estimated Time: ${plan.estimatedTime}`],
          errors: [],
          warnings: [],
          executionTime: Date.now() - startTime,
          details: JSON.stringify(plan, null, 2),
        };
      }

      // Step 3: Execute the plan
      const output: string[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];
      let completedSteps = 0;

      for (const step of plan.steps) {
        logger.info({
          skill: 'ITAdminAutomation',
          action: 'executing_step',
          step: step.stepNumber,
        });

        try {
          const result = await executeRemoteCommand(step.command, host, username, port);
          output.push(`[Step ${step.stepNumber}/${plan.totalSteps}] ✅ ${step.description}`);
          if (result && result.length > 0) {
            output.push(result.substring(0, 500));
          }

          const hasError = step.errorPatterns?.some((pattern) => result.includes(pattern)) ?? false;
          if (hasError) {
            if (step.isOptional) {
              warnings.push(`Step ${step.stepNumber} optional - encountered errors but continuing`);
            } else {
              errors.push(`Step ${step.stepNumber} failed: ${step.description}`);
              break;
            }
          }

          completedSteps++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (step.isOptional) {
            warnings.push(`Step ${step.stepNumber} (optional) failed: ${step.description}`);
            completedSteps++;
          } else {
            errors.push(`Step ${step.stepNumber} failed: ${step.description}`);
            break;
          }
        }
      }

      // Step 4: Post-verification
      if (completedSteps > 0 && plan.postVerification.length > 0) {
        output.push(`\n📋 Post-Verification:`);
        for (const verification of plan.postVerification) {
          try {
            const result = await executeRemoteCommand(verification, host, username, port);
            output.push(`✅ Verification passed`);
          } catch (error) {
            warnings.push(`Verification command failed`);
          }
        }
      }

      logger.info({
        skill: 'ITAdminAutomation',
        action: 'task_completed',
        success: errors.length === 0,
        completedSteps,
        totalSteps: plan.totalSteps,
      });

      return {
        success: errors.length === 0,
        taskName: plan.taskName,
        completedSteps,
        totalSteps: plan.totalSteps,
        output,
        errors,
        warnings,
        executionTime: Date.now() - startTime,
        details: `Task completed: ${completedSteps}/${plan.totalSteps} steps successful`,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error({
        skill: 'ITAdminAutomation',
        action: 'execution_failed',
        host,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        taskName: 'Unknown',
        completedSteps: 0,
        totalSteps: 0,
        output: [],
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
        executionTime,
        details: 'Task execution failed unexpectedly',
      };
    }
  },
};

export default itAdminAutomationSkill;
