/**
 * AI Agent Assistant (AiAgentAssistant)
 * Code Generation Skills - Meta-programming capabilities
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { Skill } from '../types';

/**
 * CodeGenerationSkills - Meta-programming capabilities
 * Allows the AI system to create new skills and modify itself
 */

// Storage for generated skills
const generatedSkillsDir = path.join(process.cwd(), 'src', 'skills', 'generated');

// Ensure generated skills directory exists
if (!fs.existsSync(generatedSkillsDir)) {
  fs.mkdirSync(generatedSkillsDir, { recursive: true });
  logger.info({ dir: generatedSkillsDir }, '📁 Created generated skills directory');
}

/**
 * Generate a new skill based on requirements
 */
export const generateNewSkillSkill: Skill = {
  name: 'generate_new_skill',
  description: 'Generate a new TypeScript skill based on requirements. Creates the skill code, saves it, and provides instructions for integration.',
  execute: async (args: any) => {
    try {
      logger.info({ args }, '🔄 Generating new skill');

      const { skillName, description, parameters, implementation, dependencies } = args;

      // Validate skill name
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(skillName)) {
        return {
          success: false,
          error: 'Skill name must be alphanumeric and start with a letter'
        };
      }

      // Generate TypeScript code for the skill
      const skillCode = generateSkillCode(skillName, description, parameters, implementation);

      // Save to generated skills directory
      const filename = `${skillName.charAt(0).toUpperCase()}${skillName.slice(1)}Skill.ts`;
      const filePath = path.join(generatedSkillsDir, filename);

      fs.writeFileSync(filePath, skillCode, 'utf-8');
      logger.info({ filePath, skillName }, '✅ Generated new skill file');

      // Generate integration instructions
      const integrationSteps = generateIntegrationInstructions(skillName, filename, dependencies);

      return {
        success: true,
        skillName,
        filePath,
        code: skillCode,
        integrationSteps,
        message: `✅ Skill "${skillName}" generated successfully!\n\nFile: ${filePath}\n\n${integrationSteps}`
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to generate skill');
      return {
        success: false,
        error: error.message || 'Failed to generate skill'
      };
    }
  }
};

/**
 * List all generated skills
 */
export const listGeneratedSkillsSkill: Skill = {
  name: 'list_generated_skills',
  description: 'List all AI-generated skills in the system',
  execute: async (args: any = {}) => {
    try {
      const files = fs.readdirSync(generatedSkillsDir);
      const skillFiles = files.filter(f => f.endsWith('.ts'));

      const skills = skillFiles.map(file => {
        const filePath = path.join(generatedSkillsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Extract skill name and description from code
        const nameMatch = content.match(/name:\s*'([^']+)'/);
        const descMatch = content.match(/description:\s*'([^']+)'/);

        return {
          file,
          name: nameMatch ? nameMatch[1] : 'unknown',
          description: descMatch ? descMatch[1] : 'No description',
          path: filePath
        };
      });

      return {
        success: true,
        count: skills.length,
        skills,
        directory: generatedSkillsDir
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to list generated skills');
      return {
        success: false,
        error: error.message
      };
    }
  }
};

/**
 * View the code of a generated skill
 */
export const viewGeneratedSkillSkill: Skill = {
  name: 'view_generated_skill',
  description: 'View the TypeScript code of a generated skill',
  execute: async (args: any) => {
    try {
      const { skillName } = args;
      const filename = `${skillName.charAt(0).toUpperCase()}${skillName.slice(1)}Skill.ts`;
      const filePath = path.join(generatedSkillsDir, filename);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `Skill "${skillName}" not found in generated skills directory`
        };
      }

      const code = fs.readFileSync(filePath, 'utf-8');

      return {
        success: true,
        skillName,
        filePath,
        code
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to view generated skill');
      return {
        success: false,
        error: error.message
      };
    }
  }
};

/**
 * Delete a generated skill
 */
export const deleteGeneratedSkillSkill: Skill = {
  name: 'delete_generated_skill',
  description: 'Delete a generated skill file (does not unregister from active tools)',
  execute: async (args: any) => {
    try {
      const { skillName } = args;
      const filename = `${skillName.charAt(0).toUpperCase()}${skillName.slice(1)}Skill.ts`;
      const filePath = path.join(generatedSkillsDir, filename);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `Skill "${skillName}" not found`
        };
      }

      fs.unlinkSync(filePath);
      logger.info({ skillName, filePath }, '🗑️ Deleted generated skill');

      return {
        success: true,
        skillName,
        message: `✅ Deleted skill "${skillName}". Note: If it was registered in AITools.ts, you need to remove it manually and rebuild.`
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to delete generated skill');
      return {
        success: false,
        error: error.message
      };
    }
  }
};

/**
 * Helper: Generate TypeScript code for a skill
 */
function generateSkillCode(
  skillName: string,
  description: string,
  parameters: any,
  implementation: string
): string {
  const capitalizedName = skillName.charAt(0).toUpperCase() + skillName.slice(1);
  
  // Generate parameter schema
  const paramSchema = parameters || {
    type: 'object',
    properties: {},
    required: []
  };

  return `import { Skill } from '../../types';
import logger from '../../utils/logger';

/**
 * ${capitalizedName}Skill - ${description}
 * Auto-generated by CodeGenerationSkills
 */

export const ${skillName}Skill: Skill = {
  name: '${skillName}',
  description: '${description.replace(/'/g, "\\'")}',
  parameters: ${JSON.stringify(paramSchema, null, 2)},
  execute: async (args: any) => {
    try {
      logger.info({ args }, '🔄 Executing ${skillName}');

      // Implementation:
      // ${implementation.replace(/\n/g, '\n      // ')}

      // TODO: Implement the actual logic here
      const result = {
        message: 'Skill "${skillName}" executed successfully (placeholder implementation)',
        args
      };

      logger.info({ result }, '✅ ${capitalizedName} completed');

      return {
        success: true,
        ...result
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ ${capitalizedName} failed');
      return {
        success: false,
        error: error.message || 'Failed to execute ${skillName}'
      };
    }
  }
};

export default ${skillName}Skill;
`;
}

/**
 * Helper: Generate integration instructions
 */
function generateIntegrationInstructions(
  skillName: string,
  filename: string,
  dependencies?: string[]
): string {
  let instructions = `📝 Integration Steps:\n\n`;

  if (dependencies && dependencies.length > 0) {
    instructions += `1. Install dependencies:\n`;
    instructions += `   npm install ${dependencies.join(' ')}\n\n`;
  }

  instructions += `${dependencies ? '2' : '1'}. Import the skill in src/utils/AITools.ts:\n`;
  instructions += `   import { ${skillName}Skill } from '../skills/generated/${filename.replace('.ts', '')}';\n\n`;

  instructions += `${dependencies ? '3' : '2'}. Add to AI_TOOLS array in AITools.ts:\n`;
  instructions += `   {\n`;
  instructions += `     type: 'function',\n`;
  instructions += `     function: {\n`;
  instructions += `       name: ${skillName}Skill.name,\n`;
  instructions += `       description: ${skillName}Skill.description,\n`;
  instructions += `       parameters: ${skillName}Skill.parameters\n`;
  instructions += `     }\n`;
  instructions += `   },\n\n`;

  instructions += `${dependencies ? '4' : '3'}. Add case handler in execute() method:\n`;
  instructions += `   case '${skillName}':\n`;
  instructions += `     return await this.${skillName}(args);\n\n`;

  instructions += `${dependencies ? '5' : '4'}. Add private method in AIToolExecutor class:\n`;
  instructions += `   private async ${skillName}(args: any) {\n`;
  instructions += `     return await ${skillName}Skill.execute(args);\n`;
  instructions += `   }\n\n`;

  instructions += `${dependencies ? '6' : '5'}. Rebuild and restart:\n`;
  instructions += `   npm run build\n`;
  instructions += `   sudo systemctl restart aiagentassistant\n\n`;

  instructions += `⚠️ Note: These steps currently require manual execution. Future updates will automate this process.`;

  return instructions;
}

/**
 * List ALL skills - both built-in and generated
 */
export const listAllSkillsSkill: Skill = {
  name: 'list_all_skills',
  description: 'List all available skills in the system (built-in + generated)',
  execute: async (args: any = {}) => {
    try {
      // Built-in skills organized by category
      const builtInSkills: Record<string, Array<{ name: string; description: string }>> = {
        'Email & Communication': [
          { name: 'send_email', description: 'Send emails with attachments' },
          { name: 'read_emails', description: 'Read and fetch emails from accounts' },
          { name: 'list_email_accounts', description: 'List all configured email accounts' },
          { name: 'set_default_email_account', description: 'Set default email account' }
        ],
        'Web & Search': [
          { name: 'web_search', description: 'Search the web' },
          { name: 'fetch_web_content', description: 'Fetch and parse web content' },
          { name: 'search_and_extract', description: 'Search and extract specific data' },
          { name: 'find_financial_sources', description: 'Find financial information' }
        ],
        'PDF Generation': [
          { name: 'generate_text_pdf', description: 'Generate PDF from text' },
          { name: 'generate_html_pdf', description: 'Generate PDF from HTML' },
          { name: 'generate_webpage_pdf', description: 'Capture webpage as PDF' },
          { name: 'generate_report_pdf', description: 'Generate formatted report PDF' },
          { name: 'list_pdfs', description: 'List generated PDFs' },
          { name: 'delete_pdf', description: 'Delete PDF files' }
        ],
        'Scheduling & Automation': [
          { name: 'create_scheduled_task', description: 'Create scheduled tasks' },
          { name: 'list_scheduled_tasks', description: 'List all scheduled tasks' },
          { name: 'delete_scheduled_task', description: 'Delete scheduled tasks' },
          { name: 'pause_scheduled_task', description: 'Pause scheduled tasks' },
          { name: 'resume_scheduled_task', description: 'Resume paused tasks' }
        ],
        'AI & Code Generation': [
          { name: 'aiChat', description: 'AI conversation' },
          { name: 'aiGenerateCode', description: 'Generate code' },
          { name: 'aiCodeReview', description: 'Code review' },
          { name: 'aiExplainCode', description: 'Explain code' },
          { name: 'aiDebug', description: 'Debug code' },
          { name: 'aiAnalyzeText', description: 'Analyze text' },
          { name: 'aiAnswer', description: 'Answer questions' },
          { name: 'generate_new_skill', description: 'Generate new AI skills' },
          { name: 'list_generated_skills', description: 'List generated skills' },
          { name: 'view_generated_skill', description: 'View skill details' },
          { name: 'delete_generated_skill', description: 'Delete skills' }
        ],
        'Network Diagnostics': [
          { name: 'dns_lookup', description: 'DNS lookups' },
          { name: 'reverse_dns_lookup', description: 'Reverse DNS' },
          { name: 'ping_host', description: 'Ping hosts' },
          { name: 'port_check', description: 'Check open ports' },
          { name: 'get_public_ip', description: 'Get public IP' },
          { name: 'traceroute', description: 'Trace network routes' },
          { name: 'whois_lookup', description: 'WHOIS information' },
          { name: 'network_statistics', description: 'Network stats' },
          { name: 'route_table', description: 'View routing table' },
          { name: 'arp_table', description: 'ARP table' },
          { name: 'connection_tracking', description: 'Track connections' },
          { name: 'mtu_discovery', description: 'MTU discovery' },
          { name: 'wifi_diagnostics', description: 'WiFi diagnostics' },
          { name: 'bridge_vlan_info', description: 'VLAN info' },
          { name: 'virtual_host_list', description: 'Virtual hosts' },
          { name: 'list_network_interfaces', description: 'Network interfaces' },
          { name: 'dns_resolver_check', description: 'DNS resolver check' },
          { name: 'dns_propagation_check', description: 'DNS propagation' },
          { name: 'dns_security', description: 'DNS security check' }
        ],
        'System & Performance': [
          { name: 'get_system_info', description: 'System information' },
          { name: 'hardware_info', description: 'Hardware details' },
          { name: 'disk_usage_analysis', description: 'Disk usage' },
          { name: 'memory_details', description: 'Memory usage' },
          { name: 'process_monitoring', description: 'Process monitoring' },
          { name: 'service_status', description: 'Service status' },
          { name: 'log_analysis', description: 'Analyze logs' },
          { name: 'cpu_temperature', description: 'CPU temperature' },
          { name: 'system_load_analysis', description: 'System load' },
          { name: 'performance_bottleneck', description: 'Find bottlenecks' },
          { name: 'resource_history', description: 'Resource history' },
          { name: 'resource_trends', description: 'Resource trends' },
          { name: 'top_resource_users', description: 'Top resource consumers' },
          { name: 'bandwidth_test', description: 'Bandwidth testing' }
        ],
        'Security & Administration': [
          { name: 'firewall_rules', description: 'Firewall configuration' },
          { name: 'user_management', description: 'Manage users' },
          { name: 'cron_jobs', description: 'Manage cron jobs' },
          { name: 'file_search', description: 'Search files' },
          { name: 'file_permission_audit', description: 'File permissions' },
          { name: 'ssh_key_management', description: 'SSH keys' },
          { name: 'security_updates', description: 'Security updates' },
          { name: 'intrusion_detection', description: 'Intrusion detection' },
          { name: 'password_policy', description: 'Password policies' },
          { name: 'rootkit_scan', description: 'Rootkit scanning' },
          { name: 'audit_logs', description: 'Audit logs' },
          { name: 'mac_status', description: 'MAC filtering' }
        ],
        'Database & Services': [
          { name: 'docker_management', description: 'Docker operations' },
          { name: 'database_operations', description: 'Database management' },
          { name: 'ssl_certificate_check', description: 'SSL certificates' },
          { name: 'ssl_multi_domain_check', description: 'Multi-domain SSL' },
          { name: 'email_server_test', description: 'Email server test' },
          { name: 'website_uptime', description: 'Website uptime' },
          { name: 'ftp_status', description: 'FTP status' },
          { name: 'control_panel_status', description: 'Control panel' },
          { name: 'php_configuration', description: 'PHP config' }
        ],
        'SSH & Remote Access': [
          { name: 'ssh_login', description: 'SSH login to servers' },
          { name: 'ssh_add_key', description: 'Add SSH keys' },
          { name: 'upload_file', description: 'Upload files via SCP' },
          { name: 'download_file', description: 'Download files from servers' },
          { name: 'execute_remote_command', description: 'Execute remote commands' }
        ],
        'Orchestration & Management': [
          { name: 'orchestrator_status', description: 'Orchestrator status' },
          { name: 'list_agents', description: 'List agents' },
          { name: 'dispatch_task', description: 'Dispatch tasks to agents' },
          { name: 'get_orchestrator_info', description: 'Orchestrator info' },
          { name: 'execute_command', description: 'Execute system commands' }
        ],
        'File & Credential Management': [
          { name: 'read_file', description: 'Read files' },
          { name: 'write_file', description: 'Write files' },
          { name: 'get_credential', description: 'Get stored credentials' },
          { name: 'set_credential', description: 'Set/store credentials' }
        ],
        'Token & Usage Monitoring': [
          { name: 'log_ai_token_usage', description: 'Log token usage' },
          { name: 'get_ai_token_usage', description: 'Get usage stats' },
          { name: 'reset_ai_token_usage', description: 'Reset counters' },
          { name: 'export_ai_token_usage', description: 'Export usage data' }
        ],
        'Utilities': [
          { name: 'think', description: 'AI thinking/reasoning' },
          { name: 'generate_skill', description: 'Generate custom skills' }
        ],
        'Advanced Diagnostics': [
          { name: 'active_connections', description: 'Active connections' },
          { name: 'open_ports_scan', description: 'Port scanning' },
          { name: 'git_operations', description: 'Git operations' },
          { name: 'backup_verification', description: 'Backup verification' },
          { name: 'quota_usage', description: 'Quota usage' },
          { name: 'mount_points', description: 'Mount points' },
          { name: 'system_limits', description: 'System limits' },
          { name: 'io_statistics', description: 'I/O stats' },
          { name: 'package_management_list', description: 'Package listing' },
          { name: 'install_system_package', description: 'Install packages' },
          { name: 'check_tool_availability', description: 'Check tools' }
        ],
        'Development & DevOps': [
          { name: 'api_testing', description: 'API testing' },
          { name: 'code_quality', description: 'Code quality analysis' },
          { name: 'dependency_tree', description: 'Dependency analysis' },
          { name: 'test_execution', description: 'Run tests' },
          { name: 'build_status', description: 'Build status' },
          { name: 'environment_check', description: 'Environment check' },
          { name: 'cicd_status', description: 'CI/CD status' },
          { name: 'code_metrics', description: 'Code metrics' },
          { name: 'secrets_scan', description: 'Scan for secrets' },
          { name: 'debug_port_check', description: 'Debug ports' },
          { name: 'response_time_test', description: 'Response time' },
          { name: 'metrics_dashboard', description: 'Metrics dashboard' },
          { name: 'asset_analysis', description: 'Asset analysis' },
          { name: 'package_audit', description: 'Package audit' },
          { name: 'alert_status', description: 'Alert status' }
        ]
      };

      // Count built-in skills
      let totalBuiltIn = 0;
      for (const category in builtInSkills) {
        totalBuiltIn += builtInSkills[category].length;
      }

      // Get generated skills
      let generatedSkills: any[] = [];
      try {
        const files = fs.readdirSync(generatedSkillsDir);
        const skillFiles = files.filter(f => f.endsWith('.ts'));

        generatedSkills = skillFiles.map(file => {
          const filePath = path.join(generatedSkillsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          
          const nameMatch = content.match(/name:\s*'([^']+)'/);
          const descMatch = content.match(/description:\s*'([^']+)'/);

          return {
            name: nameMatch ? nameMatch[1] : 'unknown',
            description: descMatch ? descMatch[1] : 'No description',
            generated: true
          };
        });
      } catch (err) {
        logger.warn('Could not load generated skills');
      }

      // Format as concise text response for Telegram
      let response = `📚 **System Skills Inventory**\n\n`;
      response += `**Total Skills:** ${totalBuiltIn + generatedSkills.length}\n`;
      response += `├─ Built-in: ${totalBuiltIn}\n`;
      response += `└─ Generated: ${generatedSkills.length}\n\n`;

      // Add category summaries (counts only)
      response += `**Categories:**\n`;
      for (const category in builtInSkills) {
        response += `• ${category}: ${builtInSkills[category].length} skills\n`;
      }

      // Add generated skills if any
      if (generatedSkills.length > 0) {
        response += `\n**Generated Skills:**\n`;
        generatedSkills.forEach((skill: any) => {
          response += `• ${skill.name}: ${skill.description}\n`;
        });
      }

      response += `\n💡 *For detailed skill lists by category, ask: "show me [category] skills"*`;

      return {
        success: true,
        message: response,
        summary: {
          total_built_in: totalBuiltIn,
          total_generated: generatedSkills.length,
          total_all: totalBuiltIn + generatedSkills.length
        }
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to list all skills');
      return {
        success: false,
        error: error.message
      };
    }
  }
};

export default {
  generateNewSkillSkill,
  listGeneratedSkillsSkill,
  listAllSkillsSkill,
  viewGeneratedSkillSkill,
  deleteGeneratedSkillSkill
};
