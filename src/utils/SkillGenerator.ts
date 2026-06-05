import logger from './logger.js';
import { AIProvider } from './AIProvider.js';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execPromise = promisify(exec);

export interface SkillGenerationRequest {
  skillName: string;
  description: string;
  category?: string;
  parameters?: Array<{ name: string; type: string; description: string; required: boolean }>;
  requiresToolInstallation?: boolean;
  toolPackageName?: string;
}

export interface SkillGenerationResult {
  success: boolean;
  skillName: string;
  functionName: string;
  message: string;
  error?: string;
  generatedCode?: string;
  compilationLog?: string;
  deploymentStatus?: string;
}

/**
 * SkillGenerator - Autonomous skill creation framework
 * 
 * This utility allows the agent to create new skills dynamically by:
 * 1. Using AI to generate skill code based on description
 * 2. Modifying SystemCommandSkills.ts to add the skill
 * 3. Modifying AITools.ts to add tool definition and execution
 * 4. Optionally modifying AIProvider.ts to add to a category
 * 5. Compiling TypeScript
 * 6. Deploying to production
 * 7. Restarting service
 */
export class SkillGenerator {
  private aiProvider: AIProvider;
  private projectRoot: string;

  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider;
    // Detect if running in Windows or WSL
    this.projectRoot = process.platform === 'win32' 
      ? 'C:\\PythonProjects\\AiAgentAssistant'
      : '/mnt/c/PythonProjects/AiAgentAssistant';
  }

  /**
   * Generate a new skill based on description
   */
  async generateSkill(request: SkillGenerationRequest): Promise<SkillGenerationResult> {
    logger.info({ request }, 'Starting skill generation');

    try {
      // Step 1: Generate skill code using AI
      const skillCode = await this.generateSkillCode(request);
      
      if (!skillCode) {
        return {
          success: false,
          skillName: request.skillName,
          functionName: '',
          message: 'Failed to generate skill code',
          error: 'AI did not return valid skill code',
        };
      }

      // Step 2: Parse generated code to extract function name
      const functionName = this.extractFunctionName(skillCode);
      
      if (!functionName) {
        return {
          success: false,
          skillName: request.skillName,
          functionName: '',
          message: 'Failed to extract function name from generated code',
          error: 'Could not parse function name',
          generatedCode: skillCode,
        };
      }

      // Step 3: Validate skill code syntax
      const syntaxCheck = await this.validateSkillSyntax(skillCode);
      
      if (!syntaxCheck.valid) {
        return {
          success: false,
          skillName: request.skillName,
          functionName,
          message: 'Generated code has syntax errors',
          error: syntaxCheck.error,
          generatedCode: skillCode,
        };
      }

      // Step 4: Add skill to SystemCommandSkills.ts
      await this.addSkillToSystemCommandSkills(skillCode, functionName, request);

      // Step 5: Add tool definition to AITools.ts
      await this.addToolDefinitionToAITools(request, functionName);

      // Step 6: Add tool execution case to AITools.ts
      await this.addToolExecutionToAITools(request, functionName);

      // Step 7: Optionally add to AIProvider.ts category
      if (request.category) {
        await this.addToCategoryInAIProvider(request);
      }

      // Step 8: Compile TypeScript
      const compilationResult = await this.compileTypeScript();
      
      if (!compilationResult.success) {
        return {
          success: false,
          skillName: request.skillName,
          functionName,
          message: 'Compilation failed',
          error: compilationResult.error,
          generatedCode: skillCode,
          compilationLog: compilationResult.log,
        };
      }

      // Step 9: Deploy to production
      const deploymentResult = await this.deployToProduction();
      
      if (!deploymentResult.success) {
        return {
          success: false,
          skillName: request.skillName,
          functionName,
          message: 'Deployment failed',
          error: deploymentResult.error,
          generatedCode: skillCode,
          compilationLog: compilationResult.log,
          deploymentStatus: deploymentResult.message,
        };
      }

      // Step 10: Restart service
      const restartResult = await this.restartService();
      
      if (!restartResult.success) {
        return {
          success: false,
          skillName: request.skillName,
          functionName,
          message: 'Service restart failed',
          error: restartResult.error,
          generatedCode: skillCode,
          compilationLog: compilationResult.log,
          deploymentStatus: deploymentResult.message,
        };
      }

      return {
        success: true,
        skillName: request.skillName,
        functionName,
        message: `Skill '${request.skillName}' created successfully and deployed`,
        generatedCode: skillCode,
        compilationLog: compilationResult.log,
        deploymentStatus: 'Service restarted successfully',
      };

    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Skill generation failed');
      return {
        success: false,
        skillName: request.skillName,
        functionName: '',
        message: 'Skill generation failed with unexpected error',
        error: error.message,
      };
    }
  }

  /**
   * Generate skill code using AI
   */
  private async generateSkillCode(request: SkillGenerationRequest): Promise<string> {
    const prompt = `You are a TypeScript code generator for creating skills in an AI agent system.

Generate a complete TypeScript skill function based on this description:
- Skill Name: ${request.skillName}
- Description: ${request.description}
${request.parameters ? `- Parameters: ${JSON.stringify(request.parameters, null, 2)}` : ''}
${request.requiresToolInstallation ? `- Requires Tool: ${request.toolPackageName}` : ''}

The skill MUST follow this exact pattern:

\`\`\`typescript
/**
 * [Brief description]
 */
export const ${this.camelCaseToSnakeCase(request.skillName)}Skill: Skill = {
  name: '${request.skillName}',
  description: '${request.description}',
  execute: async (params: Record<string, any>) => {
    // Extract and validate parameters
    ${request.parameters?.map(p => `const ${p.name} = params.${p.name};`).join('\n    ') || ''}
    
    ${request.parameters?.filter(p => p.required).map(p => 
      `if (!${p.name}) {\n      throw new Error('${p.name} parameter is required');\n    }`
    ).join('\n    ') || ''}

    logger.info({ ${request.parameters?.map(p => p.name).join(', ') || ''} }, 'Executing ${request.skillName}');

    try {
      // TODO: Implement skill logic here
      ${request.requiresToolInstallation ? `
      // Check if tool is installed
      const toolInstalled = await isToolInstalled('${request.toolPackageName}');
      if (!toolInstalled) {
        return {
          success: false,
          error: 'Required tool ${request.toolPackageName} is not installed',
          installCommand: getInstallCommand('${request.toolPackageName}'),
        };
      }
      ` : ''}
      
      // Execute command or logic
      const result = await executeCommand('your-command-here');
      
      return {
        success: true,
        ${request.parameters?.map(p => `${p.name},`).join('\n        ') || ''}
        output: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Skill execution failed');
      throw new Error(\`Failed to execute ${request.skillName}: \${error.message}\`);
    }
  },
};
\`\`\`

IMPORTANT RULES:
1. Export the skill as a const with the exact name pattern: ${this.camelCaseToSnakeCase(request.skillName)}Skill
2. Use the Skill type from '../types/index.js'
3. Include proper error handling and logging
4. Validate all required parameters
5. Return a structured result object with success, data, and timestamp
6. Include JSDoc comments
7. Use executeCommand() for shell commands
8. Use isToolInstalled() and getInstallCommand() if tool installation is needed

Return ONLY the TypeScript code, no explanations.`;

    const response = await this.aiProvider.chatCompletion([
      { role: 'system', content: 'You are a TypeScript code generator. Return only valid TypeScript code.' },
      { role: 'user', content: prompt }
    ]);

    // Extract code from markdown code blocks if present
    let code = response.content || '';
    const codeBlockMatch = code.match(/```(?:typescript|ts)?\n([\s\S]+?)\n```/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1];
    }

    return code.trim();
  }

  /**
   * Extract function name from generated code
   */
  private extractFunctionName(code: string): string | null {
    const match = code.match(/export\s+const\s+(\w+)\s*:/);
    return match ? match[1] : null;
  }

  /**
   * Validate TypeScript syntax (basic check)
   */
  private async validateSkillSyntax(code: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Basic syntax checks
      if (!code.includes('export const')) {
        return { valid: false, error: 'Missing export statement' };
      }
      
      if (!code.includes(': Skill =')) {
        return { valid: false, error: 'Missing Skill type annotation' };
      }
      
      if (!code.includes('execute: async')) {
        return { valid: false, error: 'Missing execute function' };
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Add skill to SystemCommandSkills.ts
   */
  private async addSkillToSystemCommandSkills(
    skillCode: string, 
    functionName: string, 
    request: SkillGenerationRequest
  ): Promise<void> {
    const filePath = path.join(this.projectRoot, 'src/skills/SystemCommandSkills.ts');
    let content = fs.readFileSync(filePath, 'utf-8');

    // Add to TOOL_PACKAGES registry if tool installation is needed
    if (request.requiresToolInstallation && request.toolPackageName) {
      const toolPackageEntry = `  '${request.toolPackageName}': { apt: '${request.toolPackageName}', description: 'Tool for ${request.description}' },`;
      
      // Find the TOOL_PACKAGES section and add entry
      const toolPackagesMatch = content.match(/(const TOOL_PACKAGES: Record<string, ToolPackageInfo> = {[\s\S]*?)(};)/);
      if (toolPackagesMatch) {
        const before = toolPackagesMatch[1];
        const after = toolPackagesMatch[2];
        content = content.replace(toolPackagesMatch[0], `${before}\n${toolPackageEntry}\n${after}`);
      }
    }

    // Insert skill code before the export array
    const exportArrayMatch = content.match(/(export const systemCommandSkills: Skill\[\] = \[)/);
    if (exportArrayMatch) {
      const insertPosition = content.indexOf(exportArrayMatch[0]);
      content = content.slice(0, insertPosition) + 
                `\n${skillCode}\n\n` + 
                content.slice(insertPosition);
    } else {
      throw new Error('Could not find systemCommandSkills export array');
    }

    // Add to export array
    const exportArrayEnd = content.match(/  executeRemoteCommandSkill,\n\];/);
    if (exportArrayEnd) {
      content = content.replace(
        exportArrayEnd[0],
        `  executeRemoteCommandSkill,\n  // 🆕 Generated Skill\n  ${functionName},\n];`
      );
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    logger.info({ functionName }, 'Added skill to SystemCommandSkills.ts');
  }

  /**
   * Add tool definition to AITools.ts
   */
  private async addToolDefinitionToAITools(request: SkillGenerationRequest, functionName: string): Promise<void> {
    const filePath = path.join(this.projectRoot, 'src/utils/AITools.ts');
    let content = fs.readFileSync(filePath, 'utf-8');

    // Add import
    const importMatch = content.match(/(import {[\s\S]*?executeRemoteCommandSkill,\n} from '\.\.\/skills\/SystemCommandSkills\.js';)/);
    if (importMatch) {
      content = content.replace(
        importMatch[0],
        `${importMatch[0].slice(0, -2)},\n  ${functionName},\n} from '../skills/SystemCommandSkills.js';`
      );
    }

    // Generate tool definition
    const toolDefinition = `    {
      type: 'function' as const,
      function: {
        name: '${request.skillName}',
        description: '${request.description}',
        parameters: {
          type: 'object',
          properties: {
${request.parameters?.map(p => `            ${p.name}: {
              type: '${p.type}',
              description: '${p.description}',
            },`).join('\n') || ''}
          },
          required: [${request.parameters?.filter(p => p.required).map(p => `'${p.name}'`).join(', ') || ''}],
        },
      },
    },`;

    // Insert before closing bracket of tools array
    const toolsArrayMatch = content.match(/(\/\/ Add more tools as needed\n  \];)/);
    if (toolsArrayMatch) {
      content = content.replace(
        toolsArrayMatch[0],
        `${toolDefinition}\n    // Add more tools as needed\n  ];`
      );
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    logger.info({ skillName: request.skillName }, 'Added tool definition to AITools.ts');
  }

  /**
   * Add tool execution case to AITools.ts
   */
  private async addToolExecutionToAITools(request: SkillGenerationRequest, functionName: string): Promise<void> {
    const filePath = path.join(this.projectRoot, 'src/utils/AITools.ts');
    let content = fs.readFileSync(filePath, 'utf-8');

    // Generate execution case
    const executionCase = `      case '${request.skillName}':
        return await ${functionName}.execute(args);
`;

    // Insert before default case in switch statement
    const defaultCaseMatch = content.match(/(      default:\n        throw new Error\(`Unknown tool: \${toolName}`\);)/);
    if (defaultCaseMatch) {
      content = content.replace(
        defaultCaseMatch[0],
        `${executionCase}\n${defaultCaseMatch[0]}`
      );
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    logger.info({ skillName: request.skillName }, 'Added tool execution to AITools.ts');
  }

  /**
   * Add to category in AIProvider.ts
   */
  private async addToCategoryInAIProvider(request: SkillGenerationRequest): Promise<void> {
    if (!request.category) return;

    const filePath = path.join(this.projectRoot, 'src/utils/AIProvider.ts');
    let content = fs.readFileSync(filePath, 'utf-8');

    // Find the category and add tool name
    const categoryPattern = new RegExp(
      `(toolNames: \\[\\n[\\s\\S]*?)(\\],\\n      \\},\\n      \\{\\n        name: '${request.category}')`,
      'm'
    );
    
    const match = content.match(categoryPattern);
    if (match) {
      content = content.replace(
        categoryPattern,
        `$1        '${request.skillName}',\n      $2`
      );
      
      fs.writeFileSync(filePath, content, 'utf-8');
      logger.info({ category: request.category, skillName: request.skillName }, 'Added to category in AIProvider.ts');
    }
  }

  /**
   * Compile TypeScript
   */
  private async compileTypeScript(): Promise<{ success: boolean; log?: string; error?: string }> {
    try {
      logger.info('Compiling TypeScript...');
      
      const { stdout, stderr } = await execPromise(
        'cd /mnt/c/PythonProjects/AiAgentAssistant && npm run build',
        { shell: '/bin/bash' }
      );
      
      const log = stdout + stderr;
      
      if (log.includes('error TS')) {
        return {
          success: false,
          log,
          error: 'TypeScript compilation errors detected',
        };
      }

      return { success: true, log };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        log: error.stdout + error.stderr,
      };
    }
  }

  /**
   * Deploy to production
   */
  private async deployToProduction(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      logger.info('Deploying to production...');
      
      await execPromise(
        'sudo cp -r /mnt/c/PythonProjects/AiAgentAssistant/dist/* /opt/aiagentassistant/app/dist/',
        { shell: '/bin/bash' }
      );
      
      return { success: true, message: 'Deployed successfully' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Restart service
   */
  private async restartService(): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Restarting service...');
      
      await execPromise(
        'sudo systemctl restart aiagentassistant.service',
        { shell: '/bin/bash' }
      );
      
      // Wait for service to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Convert camelCase to snake_case
   */
  private camelCaseToSnakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }
}
