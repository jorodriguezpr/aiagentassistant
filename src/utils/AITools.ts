/**
 * AI Agent Assistant (AiAgentAssistant)
 * AI Tools - Tool definitions and execution
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import logger, { traceStore } from './logger';
import { eventBus } from './EventBus';
import { SkillGenerator } from './SkillGenerator.js';
import { getCredentialManager } from './CredentialManager';
import { getHcpApiClient } from './HcpApiClient';
import { HCP_TOOLS } from '../tools/hcpTools';
import { loadAutonomousState, findActiveDelegation, appendActionLog, DelegationActions } from './AutonomousState';
import {
  sendEmailSkill,
  readEmailSkill,
  listEmailAccountsSkill,
  setDefaultEmailSkill,
} from '../skills/EmailSkills';
import {
  webSearchSkill,
  fetchWebContentSkill,
  searchAndExtractSkill,
  findFinancialSourcesSkill,
} from '../skills/WebSearchSkills';
import {
  generateTextPDFSkill,
  generateHTMLPDFSkill,
  generateWebPagePDFSkill,
  generateReportPDFSkill,
  listPDFsSkill,
  deletePDFSkill,
} from '../skills/PDFSkills';
import {
  createScheduledTaskSkill,
  listScheduledTasksSkill,
  deleteScheduledTaskSkill,
  pauseScheduledTaskSkill,
  resumeScheduledTaskSkill,
} from '../skills/SchedulingSkills';
import {
  generateNewSkillSkill,
  listGeneratedSkillsSkill,
  listAllSkillsSkill,
  viewGeneratedSkillSkill,
  deleteGeneratedSkillSkill,
} from '../skills/CodeGenerationSkills';
import {
  logAiTokenUsageSkill,
  getAiTokenUsageSkill,
  resetAiTokenUsageSkill,
  exportAiTokenUsageSkill,
} from '../skills/generated/LogAiTokenUsageSkill';
import {
  dnsLookupSkill,
  reverseDnsLookupSkill,
  pingHostSkill,
  portCheckSkill,
  getPublicIpSkill,
  tracerouteSkill,
  whoisLookupSkill,
  getSystemInfoSkill,
  listNetworkInterfacesSkill,
  dnsResolverCheckSkill,
  sslCertificateCheckSkill,
  bandwidthTestSkill,
  serviceStatusSkill,
  logAnalysisSkill,
  processMonitoringSkill,
  checkToolAvailabilitySkill,
  installSystemPackageSkill,
  // 🔥 Top 10 Priority Skills
  dockerManagementSkill,
  diskUsageAnalysisSkill,
  gitOperationsSkill,
  openPortsScanSkill,
  memoryDetailsSkill,
  firewallRulesSkill,
  failedLoginAttemptsSkill,
  databaseOperationsSkill,
  activeConnectionsSkill,
  webServerConfigTestSkill,
  // 👥 Next 4 Skills
  userManagementSkill,
  cronJobsSkill,
  fileSearchSkill,
  hardwareInfoSkill,
  // 🔧 System Administration (6 Skills)
  filePermissionAuditSkill,
  resourceHistorySkill,
  systemLimitsSkill,
  ioStatisticsSkill,
  packageManagementListSkill,
  mountPointsSkill,
  // 🌐 Network & Diagnostics (7 Skills)
  networkStatisticsSkill,
  routeTableSkill,
  mtuDiscoverySkill,
  arpTableSkill,
  wifiDiagnosticsSkill,
  bridgeVlanInfoSkill,
  connectionTrackingSkill,
  // 🌐 Web Hosting & Server (10 Skills)
  virtualHostListSkill,
  emailServerTestSkill,
  dnsPropagationCheckSkill,
  websiteUptimeSkill,
  backupVerificationSkill,
  quotaUsageSkill,
  sslMultiDomainCheckSkill,
  ftpStatusSkill,
  controlPanelStatusSkill,
  phpConfigurationSkill,
  // 🔐 Security & Hardening (8 Skills)
  sshKeyManagementSkill,
  securityUpdatesSkill,
  intrusionDetectionSkill,
  passwordPolicySkill,
  macStatusSkill,
  auditLogsSkill,
  rootkitScanSkill,
  dnsSecuritySkill,
  // 📊 Monitoring & Performance (8 Skills)
  systemLoadAnalysisSkill,
  cpuTemperatureSkill,
  performanceBottleneckSkill,
  metricsDashboardSkill,
  alertStatusSkill,
  resourceTrendsSkill,
  topResourceUsersSkill,
  responseTimeTestSkill,
  // 🔧 Development & DevOps (12 Skills)
  packageAuditSkill,
  buildStatusSkill,
  apiTestingSkill,
  codeQualitySkill,
  dependencyTreeSkill,
  testExecutionSkill,
  environmentCheckSkill,
  assetAnalysisSkill,
  cicdStatusSkill,
  debugPortCheckSkill,
  codeMetricsSkill,
  secretsScanSkill,
  // 🔐 Remote Server & SSH (5 Skills)
  sshLoginSkill,
  sshAddKeySkill,
  uploadFileSkill,
  downloadFileSkill,
  executeRemoteCommandSkill,
} from '../skills/SystemCommandSkills';
import {
  itKnowledgeSearchSkill,
  itKnowledgeCreateSkill,
  itKnowledgeAddStepSkill,
  itKnowledgeListSkill,
  itKnowledgeGetSkill,
  itKnowledgeMarkResultSkill,
  itKnowledgeStartSessionSkill,
  itKnowledgeRecordCommandSkill,
  itKnowledgeCommitSessionSkill,
  itKnowledgeDiscardSessionSkill,
  itKnowledgeStatsSkill,
  itKnowledgeDeleteSkill,
  runPlaybookSkill,
  checkRemoteProgressSkill,
} from '../skills/ITKnowledgeSkill';

const execAsync = promisify(exec);

/**
 * AI Tool Definition
 */
export interface AITool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * AI Tools available to the assistant
 */
export const AI_TOOLS: AITool[] = [
  {
    name: 'execute_command',
    description: 'Execute a shell command on the system. Use for system operations, file management, process control, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute (bash/sh syntax for Linux)',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'orchestrator_status',
    description: 'Get the current status of the orchestrator system including active tasks, connected workers, and health.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_agents',
    description: 'List all connected worker agents with their capabilities and health status.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'dispatch_task',
    description: 'Delegate a task to a specialist worker agent and WAIT for the result (synchronous). Available worker skills — worker-web: webSearch(query, limit), scrapeWebpage(url, selectors); worker-code: generate_code, analyze_code, api_call. Do NOT use for web research — use web_search or fetch_web_content directly.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Worker skill name to invoke: webSearch, scrapeWebpage, generate_code, analyze_code, api_call.',
        },
        payload: {
          type: 'object',
          description: 'Parameters to pass to the worker skill.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Optional timeout in milliseconds (default 300000 = 5 min). Increase for long-running tasks.',
        },
      },
      required: ['action', 'payload'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to read',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file on the filesystem.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to write to',
        },
        content: {
          type: 'string',
          description: 'The content to write',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'think',
    description: 'Take time to analyze a problem deeply, break it down, and plan the approach before acting.',
    parameters: {
      type: 'object',
      properties: {
        problem: {
          type: 'string',
          description: 'The problem or question to analyze',
        },
      },
      required: ['problem'],
    },
  },
  {
    name: 'install_package',
    description: 'Install system packages using apt (requires sudo privileges). Use for installing software, dependencies, or updates.',
    parameters: {
      type: 'object',
      properties: {
        packages: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of package names to install',
        },
      },
      required: ['packages'],
    },
  },
  {
    name: 'update_system',
    description: 'Update package lists and upgrade installed packages (requires sudo privileges).',
    parameters: {
      type: 'object',
      properties: {
        upgrade: {
          type: 'boolean',
          description: 'Whether to upgrade packages after updating (default: true)',
        },
      },
    },
  },
  {
    name: 'remove_package',
    description: 'Remove system packages using apt (requires sudo privileges).',
    parameters: {
      type: 'object',
      properties: {
        packages: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of package names to remove',
        },
      },
      required: ['packages'],
    },
  },
  {
    name: 'get_credential',
    description: 'Retrieve a secure credential from the kernel keyring (e.g., API keys, passwords).',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The credential key to retrieve',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'set_credential',
    description: 'Store a secure credential in the kernel keyring. CRITICAL: The value MUST be passed EXACTLY as the user provided it — do NOT change case, do NOT lowercase, do NOT modify any characters. Passwords are case-sensitive.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The credential key (e.g. "root@192.254.73.46")',
        },
        value: {
          type: 'string',
          description: 'The credential value — copy it EXACTLY as given, preserving uppercase, lowercase, and special characters. Never modify the value.',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'get_orchestrator_info',
    description: 'Get information about the orchestrator system including developer information, version, and metadata.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'send_email',
    description: 'Send an email to a recipient with optional attachments. Uses the default email account or a specified account.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Email address of the recipient',
        },
        subject: {
          type: 'string',
          description: 'Subject line of the email',
        },
        body: {
          type: 'string',
          description: 'Body text of the email',
        },
        account: {
          type: 'string',
          description: 'Optional: Name of the email account to use. If not specified, uses the default account.',
        },
        attachments: {
          type: 'array',
          description: 'Optional: Array of file paths to attach to the email',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path of the attachment',
              },
              filename: {
                type: 'string',
                description: 'Optional: Custom filename for the attachment',
              },
            },
            required: ['path'],
          },
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'read_emails',
    description: 'Read emails from a configured email account.',
    parameters: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Name of the email account to read from',
        },
        folder: {
          type: 'string',
          description: 'Email folder to read from (e.g., INBOX, Sent, Drafts). Defaults to INBOX.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of emails to retrieve (default: 10)',
        },
        unreadOnly: {
          type: 'boolean',
          description: 'If true, only retrieve unread emails (default: false)',
        },
      },
      required: ['account'],
    },
  },
  {
    name: 'list_email_accounts',
    description: 'List all configured email accounts.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'set_default_email_account',
    description: 'Set the default email account for sending emails without specifying an account.',
    parameters: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Name of the email account to set as default',
        },
      },
      required: ['account'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information using Bing, Google, or DuckDuckGo. Returns a list of relevant web pages with titles, URLs, and snippets. Automatically tries multiple search engines.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (e.g., "current stock prices", "weather in New York", "latest news about AI")',
        },
        count: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_web_content',
    description: 'Fetch and extract text content from a specific web page URL. Returns the page title and extracted text content.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The complete URL of the web page to fetch (e.g., "https://example.com/article")',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_and_extract',
    description: 'Search for information and automatically fetch and extract content from the top results. This is a high-level tool that combines web search with content extraction.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of search results to return (default: 3)',
        },
        maxPages: {
          type: 'number',
          description: 'Maximum number of pages to fetch content from (default: 2)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_financial_sources',
    description: 'Find reliable sources for financial information, stock prices, and market data. Prioritizes trusted financial websites like Bloomberg, Reuters, CNBC, MarketWatch, etc.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The financial topic or query (e.g., "AAPL stock price", "S&P 500 today", "Tesla earnings")',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'generate_text_pdf',
    description: 'Generate a PDF document from plain text content. Perfect for creating reports, documents, or saving text as PDF.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The text content to include in the PDF',
        },
        title: {
          type: 'string',
          description: 'Optional title for the PDF document',
        },
        author: {
          type: 'string',
          description: 'Optional author name for the PDF metadata',
        },
        fontSize: {
          type: 'number',
          description: 'Optional font size (default: 12)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'generate_html_pdf',
    description: 'Generate a PDF document from HTML content. Automatically cleans HTML and extracts text.',
    parameters: {
      type: 'object',
      properties: {
        htmlContent: {
          type: 'string',
          description: 'The HTML content to convert to PDF',
        },
        title: {
          type: 'string',
          description: 'Optional title for the PDF document',
        },
        author: {
          type: 'string',
          description: 'Optional author name',
        },
        fontSize: {
          type: 'number',
          description: 'Optional font size (default: 11)',
        },
      },
      required: ['htmlContent'],
    },
  },
  {
    name: 'generate_webpage_pdf',
    description: 'Generate a PDF document from web page content. Ideal for saving web articles or pages with proper formatting.',
    parameters: {
      type: 'object',
      properties: {
        pageTitle: {
          type: 'string',
          description: 'The title of the web page',
        },
        pageUrl: {
          type: 'string',
          description: 'The URL of the web page (for reference)',
        },
        pageContent: {
          type: 'string',
          description: 'The text content from the web page',
        },
        author: {
          type: 'string',
          description: 'Optional author name',
        },
      },
      required: ['pageTitle', 'pageUrl', 'pageContent'],
    },
  },
  {
    name: 'generate_report_pdf',
    description: 'Generate a structured report PDF with sections, headings, and summary. Best for organized reports and documents.',
    parameters: {
      type: 'object',
      properties: {
        reportTitle: {
          type: 'string',
          description: 'The title of the report',
        },
        sections: {
          type: 'array',
          description: 'Array of report sections with headings and content',
          items: {
            type: 'object',
            properties: {
              heading: {
                type: 'string',
                description: 'Section heading',
              },
              content: {
                type: 'string',
                description: 'Section content',
              },
            },
          },
        },
        summary: {
          type: 'string',
          description: 'Optional summary or introduction for the report',
        },
      },
      required: ['reportTitle', 'sections'],
    },
  },
  {
    name: 'list_pdfs',
    description: 'List all generated PDF documents with their file sizes and creation dates.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_pdf',
    description: 'Delete a previously generated PDF document.',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'The filename of the PDF to delete',
        },
      },
      required: ['fileName'],
    },
  },
  {
    name: 'create_scheduled_task',
    description: 'Schedule a recurring task for automation (emails, local commands, remote SSH commands, system checks, or NL scripts). Supports natural language schedules.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'A descriptive name for the scheduled task (e.g., "Clear zombies on technologixpr.com")',
        },
        type: {
          type: 'string',
          enum: ['email', 'command', 'nlscript'],
          description: 'Type of task: "email" to send automated emails, "command" to run local/remote commands, "nlscript" to run a saved NL script via the AI',
        },
        schedule: {
          type: 'string',
          description: 'Schedule frequency: "daily", "hourly", "every 30 minutes", "every 3 hours", "daily at 9:00 AM", "weekly", or cron expression like "*/30 * * * *"',
        },
        emailTo: {
          type: 'string',
          description: 'For email tasks: recipient email address',
        },
        emailSubject: {
          type: 'string',
          description: 'For email tasks: email subject line',
        },
        emailBody: {
          type: 'string',
          description: 'For email tasks: email body content',
        },
        emailAccount: {
          type: 'string',
          description: 'For email tasks: optional email account to use (defaults to default account)',
        },
        command: {
          type: 'string',
          description: 'For command tasks: shell command to execute. For remote servers, use full SSH syntax: ssh -i /path/to/key user@host "remote_command". Escape quotes properly with backslashes.',
        },
        nlScriptName: {
          type: 'string',
          description: 'For nlscript tasks: the exact name of the saved NL script to run (use list_nl_scripts to find names)',
        },
      },
      required: ['name', 'type', 'schedule'],
    },
  },
  {
    name: 'list_scheduled_tasks',
    description: 'List all scheduled tasks with their details, status, and run history.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_scheduled_task',
    description: 'Permanently delete a scheduled task. Provide either taskId or taskName.',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The unique ID of the task to delete',
        },
        taskName: {
          type: 'string',
          description: 'The name of the task to delete',
        },
      },
    },
  },
  {
    name: 'pause_scheduled_task',
    description: 'Temporarily pause a scheduled task without deleting it. Can be resumed later.',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The unique ID of the task to pause',
        },
        taskName: {
          type: 'string',
          description: 'The name of the task to pause',
        },
      },
    },
  },
  {
    name: 'resume_scheduled_task',
    description: 'Resume a previously paused scheduled task.',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The unique ID of the task to resume',
        },
        taskName: {
          type: 'string',
          description: 'The name of the task to resume',
        },
      },
    },
  },
  {
    name: 'generate_new_skill',
    description: '🚀 META-PROGRAMMING: Generate a new TypeScript skill for the system. Creates code, saves it, and provides integration instructions. This allows the AI to program new capabilities on demand.',
    parameters: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: 'Name of the skill (camelCase, e.g., "weatherForecast", "databaseQuery")',
        },
        description: {
          type: 'string',
          description: 'What the skill does and when to use it',
        },
        parameters: {
          type: 'object',
          description: 'Expected parameters with their types and descriptions (JSON schema format)',
        },
        implementation: {
          type: 'string',
          description: 'Detailed implementation logic or pseudocode for what the skill should do',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'NPM packages needed (e.g., ["axios", "@types/node"])',
        },
      },
      required: ['skillName', 'description', 'implementation'],
    },
  },
  {
    name: 'list_generated_skills',
    description: 'List all AI-generated skills in the system with their names and descriptions.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'view_generated_skill',
    description: 'View the TypeScript source code of a generated skill.',
    parameters: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: 'Name of the skill to view',
        },
      },
      required: ['skillName'],
    },
  },
  {
    name: 'delete_generated_skill',
    description: 'Delete a generated skill file (does not unregister from active tools).',
    parameters: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: 'Name of the skill to delete',
        },
      },
      required: ['skillName'],
    },
  },
  {
    name: 'log_ai_token_usage',
    description: '📊 Log AI token usage by provider for monitoring and cost analysis. Tracks prompt tokens, completion tokens, and total usage per request.',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'The AI provider name (e.g., "github-copilot", "openai", "anthropic", "gemini")',
        },
        model: {
          type: 'string',
          description: 'The model name (e.g., "gpt-4o", "claude-3-sonnet")',
        },
        promptTokens: {
          type: 'number',
          description: 'Number of tokens in the prompt',
        },
        completionTokens: {
          type: 'number',
          description: 'Number of tokens in the completion',
        },
        totalTokens: {
          type: 'number',
          description: 'Total number of tokens used',
        },
        operation: {
          type: 'string',
          description: 'Optional description of the operation (e.g., "chat", "tool_call")',
        },
      },
      required: ['provider', 'model', 'totalTokens'],
    },
  },
  {
    name: 'get_ai_token_usage',
    description: '📊 Get AI token usage statistics and historical data. Can filter by provider, model, or time period for detailed usage analysis.',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'Optional: Filter by provider name',
        },
        model: {
          type: 'string',
          description: 'Optional: Filter by model name',
        },
        since: {
          type: 'string',
          description: 'Optional: ISO date string to filter entries since this date',
        },
        limit: {
          type: 'number',
          description: 'Optional: Limit number of recent entries to return (default: 100)',
        },
      },
    },
  },
  {
    name: 'reset_ai_token_usage',
    description: '🗑️ Reset AI token usage statistics. Use with caution - this clears all historical data (creates backup first).',
    parameters: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be set to true to confirm the reset',
        },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'export_ai_token_usage',
    description: '📄 Export AI token usage statistics to a formatted report file (JSON or CSV) for external analysis.',
    parameters: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['json', 'csv'],
          description: 'Export format: "json" or "csv"',
        },
        outputPath: {
          type: 'string',
          description: 'Optional: Custom output path for the export file',
        },
      },
      required: ['format'],
    },
  },
  // System Command Skills - Direct execution without AI prompting
  {
    name: 'dns_lookup',
    description: '🌐 Get IP address(es) for a domain name. Fast DNS lookup without needing to figure out the command - automatically uses dig/nslookup.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'The domain name to lookup (e.g., "google.com", "technologixpr.com")',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'reverse_dns_lookup',
    description: '🔍 Get domain name from an IP address (reverse DNS lookup).',
    parameters: {
      type: 'object',
      properties: {
        ip: {
          type: 'string',
          description: 'The IP address to lookup (e.g., "8.8.8.8")',
        },
      },
      required: ['ip'],
    },
  },
  {
    name: 'ping_host',
    description: '📡 Check if a host is reachable and measure network latency. Returns packet loss and average latency.',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'The hostname or IP address to ping',
        },
        count: {
          type: 'number',
          description: 'Number of ping packets to send (default: 4)',
        },
      },
      required: ['host'],
    },
  },
  {
    name: 'port_check',
    description: '🔌 Check if a specific port is open on a host. Useful for testing service availability.',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'The hostname or IP address',
        },
        port: {
          type: 'number',
          description: 'The port number to check (e.g., 80, 443, 22)',
        },
      },
      required: ['host', 'port'],
    },
  },
  {
    name: 'get_public_ip',
    description: '🌍 Get the public IP address of this system. Uses multiple reliable services.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'traceroute',
    description: '🗺️ Trace the network route to a host. Shows all hops and latency.',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'The hostname or IP address to trace',
        },
      },
      required: ['host'],
    },
  },
  {
    name: 'whois_lookup',
    description: '📋 Get WHOIS registration information for a domain.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'The domain name to lookup',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'get_system_info',
    description: '💻 Get basic system information (OS, hostname, uptime, memory).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_network_interfaces',
    description: '🔗 List all network interfaces and their IP addresses.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'dns_resolver_check',
    description: '🔧 Check which DNS servers are configured on the system.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ssl_certificate_check',
    description: '🔒 Check SSL certificate expiry date and validity for a domain. Useful for monitoring certificate expiration.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'The domain name to check (e.g., "google.com", "technologixpr.com")',
        },
        port: {
          type: 'number',
          description: 'The HTTPS port to check (default: 443)',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'bandwidth_test',
    description: '📶 Test internet connection speed (download/upload speeds and ping). Requires speedtest-cli installed.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'service_status',
    description: '⚙️ Check the status of a system service (systemd on Linux, Windows services on Windows).',
    parameters: {
      type: 'object',
      properties: {
        serviceName: {
          type: 'string',
          description: 'The name of the service to check (e.g., "nginx", "aiagentassistant", "redis-server")',
        },
      },
      required: ['serviceName'],
    },
  },
  {
    name: 'log_analysis',
    description: '📝 Analyze system logs by tailing recent entries or searching for specific patterns.',
    parameters: {
      type: 'object',
      properties: {
        logFile: {
          type: 'string',
          description: 'Path to the log file (e.g., "/var/log/syslog", "/var/log/nginx/access.log")',
        },
        lines: {
          type: 'number',
          description: 'Number of recent lines to show (default: 50)',
        },
        searchPattern: {
          type: 'string',
          description: 'Optional: Pattern to search for in the logs (grep/Select-String)',
        },
      },
      required: ['logFile'],
    },
  },
  {
    name: 'process_monitoring',
    description: '📊 Monitor running processes, CPU and memory usage. Can filter by process name.',
    parameters: {
      type: 'object',
      properties: {
        processName: {
          type: 'string',
          description: 'Optional: Filter by process name (e.g., "node", "nginx", "python")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of processes to return (default: 10)',
        },
      },
    },
  },
  {
    name: 'check_tool_availability',
    description: '🔧 Check if a system tool is installed and get installation instructions if missing. Useful before running commands that require specific tools.',
    parameters: {
      type: 'object',
      properties: {
        toolName: {
          type: 'string',
          description: 'Name of the tool to check (e.g., "dig", "nslookup", "traceroute", "whois", "openssl", "speedtest-cli", "curl", "wget")',
        },
      },
      required: ['toolName'],
    },
  },
  {
    name: 'install_system_package',
    description: '🛠️ Install a missing system tool or package. REQUIRES USER APPROVAL. Supports common network and system utilities. Ask the user for permission before calling this tool.',
    parameters: {
      type: 'object',
      properties: {
        toolName: {
          type: 'string',
          description: 'Name of the tool to install (e.g., "dig", "nslookup", "traceroute", "whois", "openssl", "speedtest-cli", "curl", "wget")',
        },
        userApproval: {
          type: 'boolean',
          description: 'Set to true only after the user explicitly approves the installation. NEVER set to true automatically.',
        },
      },
      required: ['toolName', 'userApproval'],
    },
  },
  // 🔥 TOP 10 PRIORITY SKILLS
  {
    name: 'docker_management',
    description: '🐳 Manage Docker containers - list running/stopped containers, images, stats, logs',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform: "ps" (containers), "images", "stats", "logs", "inspect"',
        },
        containerId: {
          type: 'string',
          description: 'Container ID or name for logs/inspect/stats (optional)',
        },
        all: {
          type: 'boolean',
          description: 'Show all containers including stopped (default: false)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'disk_usage_analysis',
    description: '💾 Analyze disk usage - show largest files/folders, disk space by directory',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to analyze (default: current directory)',
        },
        depth: {
          type: 'number',
          description: 'Directory depth to analyze (default: 2)',
        },
        topN: {
          type: 'number',
          description: 'Show top N largest items (default: 10)',
        },
      },
    },
  },
  {
    name: 'git_operations',
    description: '🔀 Git repository operations - status, branches, recent commits, diffs',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: "status", "branches", "log", "diff", "remote"',
        },
        path: {
          type: 'string',
          description: 'Repository path (default: current directory)',
        },
        count: {
          type: 'number',
          description: 'Number of commits to show for log (default: 10)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'open_ports_scan',
    description: '🔓 Scan for open ports on localhost or remote host',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Host to scan (default: localhost)',
        },
        method: {
          type: 'string',
          description: 'Scan method: "ss", "netstat", "nmap" (default: ss)',
        },
      },
    },
  },
  {
    name: 'memory_details',
    description: '🧠 Show detailed memory usage - RAM by process, available memory, swap',
    parameters: {
      type: 'object',
      properties: {
        detail: {
          type: 'string',
          description: 'Detail level: "summary", "processes", "full" (default: summary)',
        },
        topN: {
          type: 'number',
          description: 'Show top N memory-using processes (default: 10)',
        },
      },
    },
  },
  {
    name: 'firewall_rules',
    description: '🛡️ List firewall rules (iptables/ufw/firewalld)',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Firewall type: "ufw", "iptables", "firewalld", "auto" (default: auto)',
        },
      },
    },
  },
  {
    name: 'failed_login_attempts',
    description: '🚫 Show failed login attempts and suspicious IPs',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of recent attempts to show (default: 20)',
        },
      },
    },
  },
  {
    name: 'database_operations',
    description: '🗄️ Database operations - connection test, list databases, table info',
    parameters: {
      type: 'object',
      properties: {
        dbType: {
          type: 'string',
          description: 'Database type: "mysql", "postgres", "mongodb"',
        },
        action: {
          type: 'string',
          description: 'Action: "test", "list", "tables", "status"',
        },
        database: {
          type: 'string',
          description: 'Database name for tables action (optional)',
        },
        host: {
          type: 'string',
          description: 'Database host (default: localhost)',
        },
        port: {
          type: 'number',
          description: 'Database port (optional)',
        },
      },
      required: ['dbType', 'action'],
    },
  },
  {
    name: 'active_connections',
    description: '🔌 List all active network connections and states',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Filter: "all", "established", "listening", "time_wait" (default: all)',
        },
        protocol: {
          type: 'string',
          description: 'Protocol filter: "tcp", "udp", "all" (default: all)',
        },
      },
    },
  },
  {
    name: 'web_server_config_test',
    description: '✅ Test web server configuration syntax (nginx/apache)',
    parameters: {
      type: 'object',
      properties: {
        server: {
          type: 'string',
          description: 'Server type: "nginx", "apache", "auto" (default: auto)',
        },
      },
    },
  },
  // 👥 Next 4 Skills
  {
    name: 'user_management',
    description: '👥 Manage system users - list users, groups, user details, last login',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: "list", "groups", "details", "lastlogin", "whoami"',
        },
        username: {
          type: 'string',
          description: 'Username for details/groups/lastlogin actions (optional)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'cron_jobs',
    description: '⏰ List scheduled cron jobs for user or all users',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Scope: "user" (current/specific user), "all" (all users), "system" (system cron)',
        },
        username: {
          type: 'string',
          description: 'Specific username for user scope (optional)',
        },
      },
    },
  },
  {
    name: 'file_search',
    description: '🔍 Search for files by name, type, size, or modified date',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Starting path for search (default: current directory)',
        },
        pattern: {
          type: 'string',
          description: 'File name pattern to search for (e.g., "*.log", "config.*")',
        },
        fileType: {
          type: 'string',
          description: 'File type: "file", "directory", "link"',
        },
        minSize: {
          type: 'string',
          description: 'Minimum file size (e.g., "10M", "1G")',
        },
        maxSize: {
          type: 'string',
          description: 'Maximum file size (e.g., "100M", "5G")',
        },
        modifiedDays: {
          type: 'number',
          description: 'Files modified within this many days',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 50)',
        },
      },
    },
  },
  {
    name: 'hardware_info',
    description: '🖥️ Show detailed hardware information - CPU, memory, disk, hardware details',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Info category: "summary", "cpu", "memory", "disk", "pci", "usb", "all"',
        },
      },
    },
  },
  // 🔧 System Administration (7 Skills)
  {
    name: 'file_permission_audit',
    description: '🔒 Audit file permissions for security issues (world-writable, setuid, no owner)',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to audit (default: current directory)',
        },
        recursive: {
          type: 'boolean',
          description: 'Recursively check subdirectories (default: true)',
        },
        checkWorldWritable: {
          type: 'boolean',
          description: 'Check for world-writable files (default: true)',
        },
        checkSetuid: {
          type: 'boolean',
          description: 'Check for setuid/setgid files (default: true)',
        },
        checkNoOwner: {
          type: 'boolean',
          description: 'Check for files with no owner (default: true)',
        },
      },
    },
  },
  {
    name: 'resource_history',
    description: '📊 Show historical resource usage (requires sysstat/sar)',
    parameters: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Resource type: "cpu", "memory", "disk", "network", "summary"',
        },
        duration: {
          type: 'string',
          description: 'Time period: "1h", "6h", "24h", "7d"',
        },
      },
    },
  },
  {
    name: 'system_limits',
    description: '⚙️ Show system resource limits (ulimit, quotas, sysctl)',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Limit scope: "user", "system", "process", "all"',
        },
      },
    },
  },
  {
    name: 'io_statistics',
    description: '💾 Show disk I/O statistics (iostat, iotop)',
    parameters: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          description: 'Device name or "all" (default: all)',
        },
        interval: {
          type: 'number',
          description: 'Interval in seconds (default: 1)',
        },
        count: {
          type: 'number',
          description: 'Number of reports (default: 5)',
        },
      },
    },
  },
  {
    name: 'package_management_list',
    description: '📦 List installed packages (apt/dpkg)',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Filter: "all", "manual", "auto", "upgradable"',
        },
        search: {
          type: 'string',
          description: 'Search term to filter packages (optional)',
        },
      },
    },
  },
  {
    name: 'mount_points',
    description: '💿 Show filesystem mount points and usage',
    parameters: {
      type: 'object',
      properties: {
        showType: {
          type: 'string',
          description: 'Mount type: "all", "physical", "network", "virtual"',
        },
        showUsage: {
          type: 'boolean',
          description: 'Show disk usage (default: true)',
        },
      },
    },
  },
  // 🌐 Network & Diagnostics (8 Skills)
  {
    name: 'network_statistics',
    description: '📊 Show detailed network statistics (packets, errors, connections)',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category: "summary", "interfaces", "protocols", "errors", "drops"',
        },
      },
    },
  },
  {
    name: 'route_table',
    description: '🛣️ Show routing table and gateway information',
    parameters: {
      type: 'object',
      properties: {
        protocol: {
          type: 'string',
          description: 'Protocol: "all", "ipv4", "ipv6"',
        },
      },
    },
  },
  {
    name: 'mtu_discovery',
    description: '📏 Discover Path MTU to a destination',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Target host for MTU discovery',
        },
        maxSize: {
          type: 'number',
          description: 'Maximum packet size to test (default: 1500)',
        },
      },
    },
  },
  {
    name: 'arp_table',
    description: '📇 Show ARP cache entries (IP to MAC address mapping)',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Filter: "all", "reachable", "stale"',
        },
      },
    },
  },
  {
    name: 'wifi_diagnostics',
    description: '📶 Show WiFi connection information and signal strength',
    parameters: {
      type: 'object',
      properties: {
        interface: {
          type: 'string',
          description: 'WiFi interface name (default: auto-detect)',
        },
      },
    },
  },
  {
    name: 'bridge_vlan_info',
    description: '🌉 Show bridge and VLAN configuration',
    parameters: {
      type: 'object',
      properties: {
        showType: {
          type: 'string',
          description: 'Type: "all", "bridge", "vlan"',
        },
      },
    },
  },
  {
    name: 'connection_tracking',
    description: '🔗 Show connection tracking table (conntrack state)',
    parameters: {
      type: 'object',
      properties: {
        protocol: {
          type: 'string',
          description: 'Protocol filter: "all", "tcp", "udp"',
        },
        state: {
          type: 'string',
          description: 'Connection state filter: "all", "established", "time_wait"',
        },
      },
    },
  },
  {
    name: 'virtual_host_list',
    description: '🌐 List virtual hosts from Apache/Nginx configuration',
    parameters: {
      type: 'object',
      properties: {
        serverType: {
          type: 'string',
          description: 'Server type: "auto", "apache", "nginx"',
        },
      },
    },
  },
  {
    name: 'email_server_test',
    description: '📧 Test email server connectivity (SMTP/IMAP/POP3)',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Server hostname or IP',
        },
        protocol: {
          type: 'string',
          description: 'Protocol: "smtp", "smtps", "submission", "imap", "imaps", "pop3", "pop3s"',
        },
      },
    },
  },
  {
    name: 'dns_propagation_check',
    description: '🌍 Check DNS propagation across multiple public nameservers',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain name to check',
        },
        recordType: {
          type: 'string',
          description: 'DNS record type: "A", "AAAA", "MX", "TXT", "CNAME", "NS"',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'website_uptime',
    description: '🌐 Check website availability and response time',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL to check (including http:// or https://)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'backup_verification',
    description: '💾 Verify backup files and test archive integrity',
    parameters: {
      type: 'object',
      properties: {
        backupPath: {
          type: 'string',
          description: 'Path to backup directory (default: /backup)',
        },
      },
    },
  },
  {
    name: 'quota_usage',
    description: '📊 Show disk quota usage per user/group',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Quota scope: "user", "group", "all"',
        },
      },
    },
  },
  {
    name: 'ssl_multi_domain_check',
    description: '🔐 Check SSL certificates for multiple domains',
    parameters: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of domain names to check',
        },
      },
      required: ['domains'],
    },
  },
  {
    name: 'ftp_status',
    description: '📁 Check FTP/SFTP service status and active connections',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'control_panel_status',
    description: '🎛️ Detect which web hosting control panel is installed on a REMOTE server in a single SSH call. Checks cPanel/WHM, CWP, Plesk, DirectAdmin, ISPConfig, Webmin, HestiaCP, KloxoNG, CyberPanel, aaPanel, Froxlor. Returns panel name, version, and admin URL. Auto-loads vault password when none provided. USE THIS instead of running multiple execute_remote_command calls to check panels manually.',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote server IP or hostname',
        },
        username: {
          type: 'string',
          description: 'SSH username (default: root)',
        },
        password: {
          type: 'string',
          description: 'SSH password. Omit to auto-load from vault.',
        },
        keyPath: {
          type: 'string',
          description: 'Path to SSH private key file. Used when no password provided.',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
        },
      },
      required: ['host'],
    },
  },
  {
    name: 'php_configuration',
    description: '🐘 Show PHP version, modules, and configuration',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ssh_key_management',
    description: '🔐 Manage SSH keys - list, generate, show fingerprints',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action: "list", "check-permissions", "agent", "all"',
        },
      },
    },
  },
  {
    name: 'security_updates',
    description: '🔒 Check for available security updates',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'intrusion_detection',
    description: '🛡️ Check intrusion detection systems (fail2ban, AIDE)',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'password_policy',
    description: '🔑 Show system password policy and requirements',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mac_status',
    description: '🛡️ Check SELinux or AppArmor status (mandatory access control)',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'audit_logs',
    description: '📋 Check system audit logs (auditd)',
    parameters: {
      type: 'object',
      properties: {
        eventType: {
          type: 'string',
          description: 'Event type: "recent", "auth", "file", "all"',
        },
      },
    },
  },
  {
    name: 'rootkit_scan',
    description: '🔍 Scan for rootkits using chkrootkit or rkhunter',
    parameters: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Tool: "auto", "chkrootkit", "rkhunter"',
        },
      },
    },
  },
  {
    name: 'dns_security',
    description: '🌐 Check DNS security settings and DNSSEC validation',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain to check for DNSSEC (default: cloudflare.com)',
        },
      },
    },
  },
  {
    name: 'system_load_analysis',
    description: '📊 Analyze system load averages and breakdown by CPU/IO/processes',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: 'Time period to analyze (1m, 5m, 15m)',
        },
      },
    },
  },
  {
    name: 'cpu_temperature',
    description: '🌡️ Monitor CPU and system temperatures',
    parameters: {
      type: 'object',
      properties: {
        unit: {
          type: 'string',
          description: 'Temperature unit (celsius, fahrenheit)',
        },
      },
    },
  },
  {
    name: 'performance_bottleneck',
    description: '🔍 Identify performance bottlenecks (CPU, memory, disk, network)',
    parameters: {
      type: 'object',
      properties: {
        duration: {
          type: 'number',
          description: 'Duration to monitor in seconds (default: 5)',
        },
      },
    },
  },
  {
    name: 'metrics_dashboard',
    description: '📈 Display comprehensive system metrics dashboard',
    parameters: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Whether to refresh the metrics',
        },
      },
    },
  },
  {
    name: 'alert_status',
    description: '⚠️ Check system alerts, warnings, and critical messages',
    parameters: {
      type: 'object',
      properties: {
        severity: {
          type: 'string',
          description: 'Alert severity level (all, error, warning, critical)',
        },
        lines: {
          type: 'number',
          description: 'Number of recent lines to check (default: 50)',
        },
      },
    },
  },
  {
    name: 'resource_trends',
    description: '📉 Show historical resource usage trends (CPU, memory, disk)',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: 'Time period (1h, 6h, 24h)',
        },
        resource: {
          type: 'string',
          description: 'Resource type (cpu, memory, disk, all)',
        },
      },
    },
  },
  {
    name: 'top_resource_users',
    description: '🔝 List top processes consuming CPU, memory, or disk I/O',
    parameters: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Resource type (cpu, memory, disk, all)',
        },
        count: {
          type: 'number',
          description: 'Number of top processes to show (default: 10)',
        },
      },
    },
  },
  {
    name: 'response_time_test',
    description: '⏱️ Measure service response times (HTTP, ping, TCP)',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target URL or hostname to test',
        },
        type: {
          type: 'string',
          description: 'Test type (http, ping, tcp, all)',
        },
        count: {
          type: 'number',
          description: 'Number of tests to run (default: 5)',
        },
      },
    },
  },
  {
    name: 'package_audit',
    description: '🔍 Scan dependencies for vulnerabilities (npm, pip, composer)',
    parameters: {
      type: 'object',
      properties: {
        packageManager: {
          type: 'string',
          description: 'Package manager (npm, pip, composer, auto)',
        },
        fix: {
          type: 'boolean',
          description: 'Attempt to fix vulnerabilities automatically',
        },
      },
    },
  },
  {
    name: 'build_status',
    description: '🏗️ Check build/compilation status and errors',
    parameters: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project directory path (default: .)',
        },
        buildTool: {
          type: 'string',
          description: 'Build tool (npm, maven, make, auto)',
        },
      },
    },
  },
  {
    name: 'api_testing',
    description: '🌐 Test API endpoints (GET, POST, headers, authentication)',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'API endpoint URL to test (required)',
        },
        method: {
          type: 'string',
          description: 'HTTP method (GET, POST, PUT, PATCH, DELETE)',
        },
        headers: {
          type: 'object',
          description: 'HTTP headers as key-value pairs',
        },
        data: {
          type: 'string',
          description: 'Request body data (for POST/PUT/PATCH)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'code_quality',
    description: '✨ Run linters/formatters (eslint, pylint, black, prettier)',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to analyze (default: .)',
        },
        tool: {
          type: 'string',
          description: 'Specific tool (eslint, pylint, black, prettier, auto)',
        },
        fix: {
          type: 'boolean',
          description: 'Auto-fix issues if possible',
        },
      },
    },
  },
  {
    name: 'dependency_tree',
    description: '🌳 Show dependency tree and conflicts',
    parameters: {
      type: 'object',
      properties: {
        packageManager: {
          type: 'string',
          description: 'Package manager (npm, pip, composer, auto)',
        },
        depth: {
          type: 'number',
          description: 'Tree depth to display (default: 3)',
        },
      },
    },
  },
  {
    name: 'test_execution',
    description: '🧪 Run test suites (jest, pytest, mocha, phpunit)',
    parameters: {
      type: 'object',
      properties: {
        framework: {
          type: 'string',
          description: 'Test framework (jest, pytest, mocha, phpunit, auto)',
        },
        path: {
          type: 'string',
          description: 'Test directory path (default: .)',
        },
        verbose: {
          type: 'boolean',
          description: 'Verbose output',
        },
      },
    },
  },
  {
    name: 'environment_check',
    description: '🔧 Validate dev environment (node, python, php, java versions)',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Environment scope (node, python, php, java, all)',
        },
      },
    },
  },
  {
    name: 'asset_analysis',
    description: '📦 Analyze static assets (image sizes, CSS/JS files)',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to analyze (default: .)',
        },
        assetType: {
          type: 'string',
          description: 'Asset type (images, css, js, all)',
        },
      },
    },
  },
  {
    name: 'cicd_status',
    description: '🚀 Check CI/CD pipeline status (GitHub Actions, Jenkins)',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description: 'CI/CD platform (github, jenkins, gitlab, auto)',
        },
        project: {
          type: 'string',
          description: 'Project directory path (default: .)',
        },
      },
    },
  },
  {
    name: 'debug_port_check',
    description: '🐛 Find active debug ports and debugging processes',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Scope of check (all, node, python, java)',
        },
      },
    },
  },
  {
    name: 'code_metrics',
    description: '📊 Calculate code metrics (LOC, complexity, maintainability)',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to analyze (default: .)',
        },
        language: {
          type: 'string',
          description: 'Programming language (auto, js, py, php, java)',
        },
      },
    },
  },
  {
    name: 'secrets_scan',
    description: '🔐 Scan for exposed secrets, API keys, and passwords in code',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to scan (default: .)',
        },
        deep: {
          type: 'boolean',
          description: 'Deep scan including git history',
        },
      },
    },
  },
  {
    name: 'ssh_login',
    description: '🔐 SSH login to remote server (key or password auth)',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote server hostname or IP address (required)',
        },
        username: {
          type: 'string',
          description: 'Username for SSH login (default: current user)',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
        },
        password: {
          type: 'string',
          description: 'Password for password-based auth',
        },
        keyPath: {
          type: 'string',
          description: 'Path to SSH private key (default: ~/.ssh/id_rsa)',
        },
        useKey: {
          type: 'boolean',
          description: 'Use key authentication (default: true)',
        },
      },
      required: ['host'],
    },
  },
  {
    name: 'ssh_add_key',
    description: '🔑 Add SSH public key to remote server authorized_keys',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote server hostname or IP address (required)',
        },
        username: {
          type: 'string',
          description: 'Username (default: root)',
        },
        password: {
          type: 'string',
          description: 'Password for SSH access (required)',
        },
        publicKeyPath: {
          type: 'string',
          description: 'Path to SSH public key (default: ~/.ssh/id_rsa.pub)',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
        },
      },
      required: ['host', 'password'],
    },
  },
  {
    name: 'upload_file',
    description: '📤 Upload single or multiple files to remote server',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote server hostname or IP address (required)',
        },
        username: {
          type: 'string',
          description: 'Username (default: root)',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
        },
        localPath: {
          type: 'string',
          description: 'Local file path or array of paths (required)',
        },
        remotePath: {
          type: 'string',
          description: 'Remote destination path (default: /tmp/)',
        },
        keyPath: {
          type: 'string',
          description: 'Path to SSH private key (default: ~/.ssh/id_rsa)',
        },
        useKey: {
          type: 'boolean',
          description: 'Use key authentication (default: true)',
        },
      },
      required: ['host', 'localPath'],
    },
  },
  {
    name: 'download_file',
    description: '📥 Download single or multiple files from remote server',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote server hostname or IP address (required)',
        },
        username: {
          type: 'string',
          description: 'Username (default: root)',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
        },
        remotePath: {
          type: 'string',
          description: 'Remote file path or array of paths (required)',
        },
        localPath: {
          type: 'string',
          description: 'Local destination path (default: .)',
        },
        keyPath: {
          type: 'string',
          description: 'Path to SSH private key (default: ~/.ssh/id_rsa)',
        },
        useKey: {
          type: 'boolean',
          description: 'Use key authentication (default: true)',
        },
      },
      required: ['host', 'remotePath'],
    },
  },
  {
    name: 'execute_remote_command',
    description: '⚡ Execute command on remote server via SSH. SSH is stateless — always pass host (or connectionId) and command. Credentials are auto-loaded from vault. Supports both password and SSH key authentication.',
    parameters: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Remote server hostname or IP address. Also accepted as "connectionId".',
        },
        connectionId: {
          type: 'string',
          description: 'Alias for host — the remote server IP or hostname from a previous ssh_login call.',
        },
        username: {
          type: 'string',
          description: 'Username (default: root)',
        },
        port: {
          type: 'number',
          description: 'SSH port (default: 22)',
        },
        command: {
          type: 'string',
          description: 'Command to execute on remote server (required)',
        },
        password: {
          type: 'string',
          description: 'Password for SSH authentication (optional — auto-loaded from vault if omitted)',
        },
        keyPath: {
          type: 'string',
          description: 'Path to SSH private key (default: ~/.ssh/id_rsa)',
        },
        usePassword: {
          type: 'boolean',
          description: 'Use password authentication instead of SSH key (default: false)',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'generate_skill',
    description: '🔧 Generate a new skill dynamically based on description. The agent will create the skill code, compile it, deploy it, and restart the service automatically.',
    parameters: {
      type: 'object',
      properties: {
        skillName: {
          type: 'string',
          description: 'Name of the skill in snake_case (e.g., git_status, docker_ps)',
        },
        description: {
          type: 'string',
          description: 'Detailed description of what the skill should do',
        },
        category: {
          type: 'string',
          description: 'Category for the skill (e.g., system, devops, remote, monitoring)',
        },
        parameters: {
          type: 'array',
          description: 'Array of parameter definitions for the skill',
        },
        requiresToolInstallation: {
          type: 'boolean',
          description: 'Whether the skill requires a system tool to be installed',
        },
        toolPackageName: {
          type: 'string',
          description: 'Name of the package to install (if requiresToolInstallation is true)',
        },
      },
      required: ['skillName', 'description'],
    },
  },

  // ── Internal Experience Knowledge Base ────────────────────────────────────
  {
    name: 'it_knowledge_search',
    description: '🧠 Search the internal IT/sysadmin knowledge base BEFORE querying external AI. Returns matching playbooks with step-by-step procedures learned from past successful operations.',
    parameters: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Natural language query, e.g. "install ISPConfig Ubuntu"' },
        limit:    { type: 'number', description: 'Max results (default 3)' },
        minScore: { type: 'number', description: 'Minimum relevance 0-1 (default 0.25)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'it_knowledge_create',
    description: '🧠 Save a new IT/sysadmin playbook to the internal knowledge base for future use.',
    parameters: {
      type: 'object',
      properties: {
        title:         { type: 'string',  description: 'Short title for the playbook' },
        description:   { type: 'string',  description: 'What this playbook accomplishes' },
        category:      { type: 'string',  description: 'install|configure|troubleshoot|monitor|backup|security|network|database|webserver|general' },
        keywords:      { type: 'array',   description: 'Search keywords, e.g. ["ispconfig","ubuntu"]' },
        targetOS:      { type: 'string',  description: 'ubuntu|debian|centos|windows (optional)' },
        targetService: { type: 'string',  description: 'ispconfig|nginx|mysql|apache (optional)' },
        steps:         { type: 'array',   description: 'Array of {description, command?, expectedOutput?} objects' },
        notes:         { type: 'string',  description: 'Additional notes (optional)' },
      },
      required: ['title', 'description', 'category', 'keywords'],
    },
  },
  {
    name: 'it_knowledge_add_step',
    description: '🧠 Append a step to an existing playbook in the knowledge base.',
    parameters: {
      type: 'object',
      properties: {
        playbookId:     { type: 'string',  description: 'Playbook ID' },
        description:    { type: 'string',  description: 'Step description' },
        command:        { type: 'string',  description: 'Shell command (optional)' },
        expectedOutput: { type: 'string',  description: 'Expected output snippet (optional)' },
        success:        { type: 'boolean', description: 'Was this step confirmed to work?' },
      },
      required: ['playbookId', 'description'],
    },
  },
  {
    name: 'it_knowledge_list',
    description: '🧠 List all playbooks in the internal knowledge base.',
    parameters: {
      type: 'object',
      properties: {
        category:      { type: 'string', description: 'Filter by category (optional)' },
        targetOS:      { type: 'string', description: 'Filter by OS (optional)' },
        targetService: { type: 'string', description: 'Filter by service (optional)' },
        limit:         { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'it_knowledge_get',
    description: '🧠 Get a specific playbook with all its steps from the knowledge base.',
    parameters: {
      type: 'object',
      properties: {
        playbookId: { type: 'string', description: 'Playbook ID' },
      },
      required: ['playbookId'],
    },
  },
  {
    name: 'it_knowledge_mark_result',
    description: '🧠 Record whether a playbook worked. Improves future ranking and recommendations.',
    parameters: {
      type: 'object',
      properties: {
        playbookId: { type: 'string',  description: 'Playbook ID' },
        success:    { type: 'boolean', description: 'Did it work?' },
        notes:      { type: 'string',  description: 'Failure notes or adaptations (optional)' },
      },
      required: ['playbookId', 'success'],
    },
  },
  {
    name: 'it_knowledge_start_session',
    description: '🧠 Start a learning session to auto-capture remote commands for later saving as a playbook.',
    parameters: {
      type: 'object',
      properties: {
        host:        { type: 'string', description: 'Remote host being worked on' },
        description: { type: 'string', description: 'What you plan to do in this session' },
      },
    },
  },
  {
    name: 'it_knowledge_record_command',
    description: '🧠 Record a remote command and its output into the active learning session.',
    parameters: {
      type: 'object',
      properties: {
        sessionId:  { type: 'string', description: 'Session ID from it_knowledge_start_session' },
        command:    { type: 'string', description: 'The command executed' },
        output:     { type: 'string', description: 'Command output' },
        exitCode:   { type: 'number', description: '0 = success' },
        host:       { type: 'string', description: 'Remote host (optional)' },
        taskDesc:   { type: 'string', description: 'What this command does' },
      },
      required: ['sessionId', 'command', 'output'],
    },
  },
  {
    name: 'it_knowledge_commit_session',
    description: '🧠 Save a completed session as a reusable playbook. Call when the full task succeeds.',
    parameters: {
      type: 'object',
      properties: {
        sessionId:     { type: 'string', description: 'Session ID' },
        title:         { type: 'string', description: 'Playbook title' },
        description:   { type: 'string', description: 'What this playbook does' },
        category:      { type: 'string', description: 'install|configure|troubleshoot|...' },
        keywords:      { type: 'array',  description: 'Search keywords' },
        targetOS:      { type: 'string', description: 'Target OS (optional)' },
        targetService: { type: 'string', description: 'Target service (optional)' },
        notes:         { type: 'string', description: 'Additional notes (optional)' },
      },
      required: ['sessionId', 'title', 'description', 'category', 'keywords'],
    },
  },
  {
    name: 'it_knowledge_discard_session',
    description: '🧠 Discard a failed session without saving.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID to discard' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'it_knowledge_stats',
    description: '🧠 Get statistics about the internal knowledge base (playbook count, categories, top services).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'it_knowledge_delete',
    description: '🧠 Delete a playbook from the knowledge base.',
    parameters: {
      type: 'object',
      properties: {
        playbookId: { type: 'string', description: 'Playbook ID to delete' },
      },
      required: ['playbookId'],
    },
  },
  {
    name: 'run_playbook',
    description: '🚀 Execute a knowledge-base playbook step-by-step on a remote server. Runs each step via SSH, reports results, and launches long-running steps (installers, screen sessions) in the background. Use this instead of manually running each step one by one.',
    parameters: {
      type: 'object',
      properties: {
        playbookId:    { type: 'string', description: 'Playbook ID from it_knowledge_search or it_knowledge_list' },
        host:          { type: 'string', description: 'Remote server hostname or IP (e.g. 192.254.73.46)' },
        credentialKey: { type: 'string', description: 'Credential key for SSH password (default: root@<host>)' },
        startStep:     { type: 'number', description: 'Step number to start from (default: 1). Use to resume after a failure.' },
      },
      required: ['playbookId', 'host'],
    },
  },
  {
    name: 'check_remote_progress',
    description: '📊 Poll a log file on a remote server to check if a background operation (e.g. ISPConfig install) has completed. Returns the last log lines and whether the completion marker was found. Call every 2-3 minutes while waiting.',
    parameters: {
      type: 'object',
      properties: {
        host:          { type: 'string', description: 'Remote server hostname or IP' },
        credentialKey: { type: 'string', description: 'Credential key for SSH (default: root@<host>)' },
        logFile:       { type: 'string', description: 'Path to the log file on the remote server (default: /root/ispconfig-install.log)' },
        marker:        { type: 'string', description: 'String to look for that signals completion (default: ISPCONFIG_INSTALL_DONE)' },
        tailLines:     { type: 'number', description: 'How many log lines to return (default: 20)' },
      },
      required: ['host'],
    },
  },
  ...HCP_TOOLS,
];

/**
 * Tool Executor - executes AI tool calls
 */
/**
 * Classify a tool execution error into a structured type the AI can act on.
 * The AI receives the full object in its tool-result message, so errorType
 * drives its retry/escalate/skip decision.
 */
function classifyToolError(error: any, _toolName: string): {
  error: true;
  errorType: 'TRANSIENT' | 'PERMISSION' | 'NOT_FOUND' | 'STATE' | 'FATAL';
  retry: boolean;
  retryDelaySecs?: number;
  message: string;
} {
  const msg = String(error?.message || error || '');
  const low = msg.toLowerCase();

  if (/dpkg.*lock|apt.*lock|locked.*dpkg|lock.*held/i.test(low))
    return { error: true, errorType: 'STATE', retry: true, retryDelaySecs: 30,
      message: `DPKG_LOCKED — package manager is busy. Wait 30 s then retry the exact same command. (${msg})` };

  if (/econnrefused|connection refused/i.test(low))
    return { error: true, errorType: 'STATE', retry: true, retryDelaySecs: 10,
      message: `CONNECTION_REFUSED — service may still be starting. Wait 10 s then retry. (${msg})` };

  if (/timeout|etimedout|enotfound|socket hang up|network/i.test(low))
    return { error: true, errorType: 'TRANSIENT', retry: true,
      message: `NETWORK_ERROR — transient failure. Retry immediately. (${msg})` };

  if (/permission denied|eacces|not permitted|sudo.*password/i.test(low))
    return { error: true, errorType: 'PERMISSION', retry: false,
      message: `PERMISSION_DENIED — cannot proceed without elevated access. Do not retry; escalate to user. (${msg})` };

  if (/no such file|enoent|not found|does not exist/i.test(low))
    return { error: true, errorType: 'NOT_FOUND', retry: false,
      message: `NOT_FOUND — resource is missing. Verify prerequisites before trying an alternative. (${msg})` };

  if (/no space left|disk full|out of memory|oom killer|killed/i.test(low))
    return { error: true, errorType: 'FATAL', retry: false,
      message: `FATAL — ${msg}. Stop immediately and report to user.` };

  if (/unknown tool/i.test(low))
    return { error: true, errorType: 'NOT_FOUND', retry: false,
      message: `UNKNOWN_TOOL — ${msg}. Do not retry; choose a different tool.` };

  return { error: true, errorType: 'TRANSIENT', retry: true, message: msg };
}

export class AIToolExecutor {
  private orchestrator: any;
  private skillGenerator: SkillGenerator | null = null;
  private aiProvider: any = null;

  constructor(orchestrator: any, aiProvider?: any) {
    this.orchestrator = orchestrator;
    this.aiProvider = aiProvider || null;
  }

  /**
   * Public entry point — records timing and emits tool.called / tool.result events,
   * then delegates to the switch-based _executeInner.
   */
  async execute(toolName: string, args: any): Promise<any> {
    const startMs = Date.now();
    const ctx = traceStore.getStore();
    if (ctx?.traceId) {
      eventBus.emit_event({
        type: 'tool.called',
        traceId: ctx.traceId,
        chatId: ctx.chatId ?? 0,
        timestamp: new Date().toISOString(),
        toolName,
        args: args ?? {},
      }).catch(() => {});
    }

    const result = await this._executeInner(toolName, args);

    if (ctx?.traceId) {
      eventBus.emit_event({
        type: 'tool.result',
        traceId: ctx.traceId,
        chatId: ctx.chatId ?? 0,
        timestamp: new Date().toISOString(),
        toolName,
        durationMs: Date.now() - startMs,
        success: result?.error !== true,
      }).catch(() => {});
    }

    return result;
  }

  /**
   * Switch-based tool dispatch — all 142 tool cases live here.
   */
  private async _executeInner(toolName: string, args: any): Promise<any> {
    logger.info({ toolName, args }, 'Executing AI tool');

    try {
      switch (toolName) {
        case 'execute_command':
          return await this.executeCommand(args.command);

        case 'orchestrator_status':
          return await this.getOrchestratorStatus();

        case 'list_agents':
          return await this.listAgents();

        case 'dispatch_task':
          return await this.dispatchTask(args.action, args.payload, args.timeoutMs);

        case 'read_file':
          return await this.readFile(args.path);

        case 'write_file':
          return await this.writeFile(args.path, args.content);

        case 'think':
          return await this.think(args.problem);

        case 'install_package':
          return await this.installPackage(args.packages);

        case 'update_system':
          return await this.updateSystem(args.upgrade !== false);

        case 'remove_package':
          return await this.removePackage(args.packages);

        case 'hcp_get_system_health':
          return await this.hcpGetSystemHealth();

        case 'hcp_list_tickets':
          return await this.hcpListTickets(args.status);

        case 'hcp_get_ticket':
          return await this.hcpGetTicket(args.id);

        case 'hcp_list_clients':
          return await this.hcpListClients();

        case 'hcp_get_intrusion_activity':
          return await this.hcpGetIntrusionActivity();

        case 'hcp_reply_ticket':
          return await this.hcpReplyTicket(args.id, args.message);

        case 'hcp_update_ticket_status':
          return await this.hcpUpdateTicketStatus(args.id, args.status);

        case 'hcp_restart_service':
          return await this.hcpRestartService(args.serviceType, args.driverName);

        case 'hcp_suspend_client':
          return await this.hcpSuspendClient(args.username);

        case 'hcp_unsuspend_client':
          return await this.hcpUnsuspendClient(args.username);

        case 'get_credential':
          return await this.getCredential(args.key);

        case 'set_credential':
          return await this.setCredential(args.key, args.value);

        case 'get_orchestrator_info':
          return await this.getOrchestratorInfo();

        case 'send_email':
          return await this.sendEmail(args.to, args.subject, args.body, args.account, args.attachments);

        case 'read_emails':
          return await this.readEmails(args.account, args.folder, args.limit, args.unreadOnly);

        case 'list_email_accounts':
          return await this.listEmailAccounts();

        case 'set_default_email_account':
          return await this.setDefaultEmailAccount(args.account);

        case 'web_search':
          return await this.webSearch(args.query, args.count);

        case 'fetch_web_content':
          return await this.fetchWebContent(args.url);

        case 'search_and_extract':
          return await this.searchAndExtract(args.query, args.maxResults, args.maxPages);

        case 'find_financial_sources':
          return await this.findFinancialSources(args.topic);

        case 'generate_text_pdf':
          return await this.generateTextPDF(args.content, args.title, args.author, args.fontSize);

        case 'generate_html_pdf':
          return await this.generateHTMLPDF(args.htmlContent, args.title, args.author, args.fontSize);

        case 'generate_webpage_pdf':
          return await this.generateWebPagePDF(args.pageTitle, args.pageUrl, args.pageContent, args.author);

        case 'generate_report_pdf':
          return await this.generateReportPDF(args.reportTitle, args.sections, args.summary);

        case 'list_pdfs':
          return await this.listPDFs();

        case 'delete_pdf':
          return await this.deletePDF(args.fileName);

        // Scheduling tools
        case 'create_scheduled_task':
          return await this.createScheduledTask(args);

        case 'list_scheduled_tasks':
          return await this.listScheduledTasks();

        case 'delete_scheduled_task':
          return await this.deleteScheduledTask(args.taskId, args.taskName);

        case 'pause_scheduled_task':
          return await this.pauseScheduledTask(args.taskId, args.taskName);

        case 'resume_scheduled_task':
          return await this.resumeScheduledTask(args.taskId, args.taskName);

        // Code Generation tools
        case 'generate_new_skill':
          return await this.generateNewSkill(args);

        case 'list_generated_skills':
          return await this.listGeneratedSkills();

        case 'list_all_skills':
          return await this.listAllSkills();

        case 'view_generated_skill':
          return await this.viewGeneratedSkill(args.skillName);

        case 'delete_generated_skill':
          return await this.deleteGeneratedSkill(args.skillName);

        // AI Token Usage Monitoring
        case 'log_ai_token_usage':
          return await this.logAiTokenUsage(args);

        case 'get_ai_token_usage':
          return await this.getAiTokenUsage(args);

        case 'reset_ai_token_usage':
          return await this.resetAiTokenUsage(args);

        case 'export_ai_token_usage':
          return await this.exportAiTokenUsage(args);

        // System Command Skills - Direct execution
        case 'dns_lookup':
          return await dnsLookupSkill.execute(args);

        case 'reverse_dns_lookup':
          return await reverseDnsLookupSkill.execute(args);

        case 'ping_host':
          return await pingHostSkill.execute(args);

        case 'port_check':
          return await portCheckSkill.execute(args);

        case 'get_public_ip':
          return await getPublicIpSkill.execute(args);

        case 'traceroute':
          return await tracerouteSkill.execute(args);

        case 'whois_lookup':
          return await whoisLookupSkill.execute(args);

        case 'get_system_info':
          return await getSystemInfoSkill.execute(args);

        case 'list_network_interfaces':
          return await listNetworkInterfacesSkill.execute(args);

        case 'dns_resolver_check':
          return await dnsResolverCheckSkill.execute(args);

        case 'ssl_certificate_check':
          return await sslCertificateCheckSkill.execute(args);

        case 'bandwidth_test':
          return await bandwidthTestSkill.execute(args);

        case 'service_status':
          return await serviceStatusSkill.execute(args);

        case 'log_analysis':
          return await logAnalysisSkill.execute(args);

        case 'process_monitoring':
          return await processMonitoringSkill.execute(args);

        case 'check_tool_availability':
          return await checkToolAvailabilitySkill.execute(args);

        case 'install_system_package':
          return await installSystemPackageSkill.execute(args);

        // 🔥 Top 10 Priority Skills
        case 'docker_management':
          return await dockerManagementSkill.execute(args);

        case 'disk_usage_analysis':
          return await diskUsageAnalysisSkill.execute(args);

        case 'git_operations':
          return await gitOperationsSkill.execute(args);

        case 'open_ports_scan':
          return await openPortsScanSkill.execute(args);

        case 'memory_details':
          return await memoryDetailsSkill.execute(args);

        case 'firewall_rules':
          return await firewallRulesSkill.execute(args);

        case 'failed_login_attempts':
          return await failedLoginAttemptsSkill.execute(args);

        case 'database_operations':
          return await databaseOperationsSkill.execute(args);

        case 'active_connections':
          return await activeConnectionsSkill.execute(args);

        case 'web_server_config_test':
          return await webServerConfigTestSkill.execute(args);

        // 👥 Next 4 Skills
        case 'user_management':
          return await userManagementSkill.execute(args);

        case 'cron_jobs':
          return await cronJobsSkill.execute(args);

        case 'file_search':
          return await fileSearchSkill.execute(args);

        case 'hardware_info':
          return await hardwareInfoSkill.execute(args);

        // 🔧 System Administration (7 Skills)
        case 'file_permission_audit':
          return await filePermissionAuditSkill.execute(args);

        case 'resource_history':
          return await resourceHistorySkill.execute(args);

        case 'system_limits':
          return await systemLimitsSkill.execute(args);

        case 'io_statistics':
          return await ioStatisticsSkill.execute(args);

        case 'package_management_list':
          return await packageManagementListSkill.execute(args);

        case 'mount_points':
          return await mountPointsSkill.execute(args);

        // 🌐 Network & Diagnostics (8 Skills)
        case 'network_statistics':
          return await networkStatisticsSkill.execute(args);

        case 'route_table':
          return await routeTableSkill.execute(args);

        case 'mtu_discovery':
          return await mtuDiscoverySkill.execute(args);

        case 'arp_table':
          return await arpTableSkill.execute(args);

        case 'wifi_diagnostics':
          return await wifiDiagnosticsSkill.execute(args);

        case 'bridge_vlan_info':
          return await bridgeVlanInfoSkill.execute(args);

        case 'connection_tracking':
          return await connectionTrackingSkill.execute(args);

        case 'virtual_host_list':
          return await virtualHostListSkill.execute(args);

        case 'email_server_test':
          return await emailServerTestSkill.execute(args);

        case 'dns_propagation_check':
          return await dnsPropagationCheckSkill.execute(args);

        case 'website_uptime':
          return await websiteUptimeSkill.execute(args);

        case 'backup_verification':
          return await backupVerificationSkill.execute(args);

        case 'quota_usage':
          return await quotaUsageSkill.execute(args);

        case 'ssl_multi_domain_check':
          return await sslMultiDomainCheckSkill.execute(args);

        case 'ftp_status':
          return await ftpStatusSkill.execute(args);

        case 'control_panel_status':
          return await controlPanelStatusSkill.execute(args);

        case 'php_configuration':
          return await phpConfigurationSkill.execute(args);

        case 'ssh_key_management':
          return await sshKeyManagementSkill.execute(args);

        case 'security_updates':
          return await securityUpdatesSkill.execute(args);

        case 'intrusion_detection':
          return await intrusionDetectionSkill.execute(args);

        case 'password_policy':
          return await passwordPolicySkill.execute(args);

        case 'mac_status':
          return await macStatusSkill.execute(args);

        case 'audit_logs':
          return await auditLogsSkill.execute(args);

        case 'rootkit_scan':
          return await rootkitScanSkill.execute(args);

        case 'dns_security':
          return await dnsSecuritySkill.execute(args);

        case 'system_load_analysis':
          return await systemLoadAnalysisSkill.execute(args);

        case 'cpu_temperature':
          return await cpuTemperatureSkill.execute(args);

        case 'performance_bottleneck':
          return await performanceBottleneckSkill.execute(args);

        case 'metrics_dashboard':
          return await metricsDashboardSkill.execute(args);

        case 'alert_status':
          return await alertStatusSkill.execute(args);

        case 'resource_trends':
          return await resourceTrendsSkill.execute(args);

        case 'top_resource_users':
          return await topResourceUsersSkill.execute(args);

        case 'response_time_test':
          return await responseTimeTestSkill.execute(args);

        case 'package_audit':
          return await packageAuditSkill.execute(args);

        case 'build_status':
          return await buildStatusSkill.execute(args);

        case 'api_testing':
          return await apiTestingSkill.execute(args);

        case 'code_quality':
          return await codeQualitySkill.execute(args);

        case 'dependency_tree':
          return await dependencyTreeSkill.execute(args);

        case 'test_execution':
          return await testExecutionSkill.execute(args);

        case 'environment_check':
          return await environmentCheckSkill.execute(args);

        case 'asset_analysis':
          return await assetAnalysisSkill.execute(args);

        case 'cicd_status':
          return await cicdStatusSkill.execute(args);

        case 'debug_port_check':
          return await debugPortCheckSkill.execute(args);

        case 'code_metrics':
          return await codeMetricsSkill.execute(args);

        case 'secrets_scan':
          return await secretsScanSkill.execute(args);

        case 'ssh_login':
          return await sshLoginSkill.execute(args);

        case 'ssh_add_key':
          return await sshAddKeySkill.execute(args);

        case 'upload_file':
          return await uploadFileSkill.execute(args);

        case 'download_file':
          return await downloadFileSkill.execute(args);

        case 'execute_remote_command':
          return await executeRemoteCommandSkill.execute(args);

        // ── Internal Knowledge Base ──────────────────────────────────────
        case 'it_knowledge_search':
          return await itKnowledgeSearchSkill.execute(args);
        case 'it_knowledge_create':
          return await itKnowledgeCreateSkill.execute(args);
        case 'it_knowledge_add_step':
          return await itKnowledgeAddStepSkill.execute(args);
        case 'it_knowledge_list':
          return await itKnowledgeListSkill.execute(args);
        case 'it_knowledge_get':
          return await itKnowledgeGetSkill.execute(args);
        case 'it_knowledge_mark_result':
          return await itKnowledgeMarkResultSkill.execute(args);
        case 'it_knowledge_start_session':
          return await itKnowledgeStartSessionSkill.execute(args);
        case 'it_knowledge_record_command':
          return await itKnowledgeRecordCommandSkill.execute(args);
        case 'it_knowledge_commit_session':
          return await itKnowledgeCommitSessionSkill.execute(args);
        case 'it_knowledge_discard_session':
          return await itKnowledgeDiscardSessionSkill.execute(args);
        case 'it_knowledge_stats':
          return await itKnowledgeStatsSkill.execute(args);
        case 'it_knowledge_delete':
          return await itKnowledgeDeleteSkill.execute(args);
        case 'run_playbook':
          return await runPlaybookSkill.execute(args);
        case 'check_remote_progress':
          return await checkRemoteProgressSkill.execute(args);

        case 'generate_skill':
          return await this.generateSkill(args);

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      logger.error({ toolName, error: error.message }, 'Tool execution failed');
      return classifyToolError(error, toolName);
    }
  }

  /**
   * Execute a shell command
   */
  private async executeCommand(command: string): Promise<any> {
    logger.info({ command }, 'Executing shell command');

    // Check if user is trying to use mail/email system commands
    const emailCommandPatterns = /\b(mail|sendmail|mailx|ssmtp|postfix|exim)\b/i;
    if (emailCommandPatterns.test(command)) {
      logger.warn({ command }, 'User attempted to use system mail command - redirecting to email tools');
      return {
        success: false,
        error: 'Cannot use system mail commands. Use the send_email tool instead.',
        message: '❌ Email Sending Error\n\nDon\'t use system commands like "mail" or "sendmail". Instead, use the send_email tool which works with your configured email accounts.\n\nExample: send_email tool with:\n- to: recipient@example.com\n- subject: "Your Subject"\n- body: "Your message"\n\nThis will use your default configured email account automatically.',
        hint: 'Use the send_email tool for email operations',
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120000, // 2 minute timeout (remote SSH installs can be slow)
        maxBuffer: 1024 * 1024, // 1MB buffer
      });

      return {
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || '',
        code: error.code,
      };
    }
  }

  /**
   * Get orchestrator status
   */
  private async getOrchestratorStatus(): Promise<any> {
    const status = this.orchestrator.getStatus();
    const health = await this.orchestrator.healthCheck();

    return {
      name: status.name,
      id: status.id,
      running: status.isRunning,
      activeTasks: status.activeTasks,
      workers: health.workers.length,
      healthyWorkers: health.healthyWorkers,
      details: health,
    };
  }

  /**
   * List all agents
   */
  private async listAgents(): Promise<any> {
    const workers = this.orchestrator.getWorkers();

    return {
      count: workers.length,
      agents: workers.map((w: any) => ({
        id: w.id,
        name: w.name,
        healthy: w.isHealthy,
        skills: w.skills?.map((s: any) => s.name) || [],
      })),
    };
  }

  /**
   * Dispatch a task
   */
  private async dispatchTask(action: string, payload: any, timeoutMs?: number): Promise<any> {
    const dispatch = await this.orchestrator.dispatchTask(
      action,
      payload,
      undefined,
      timeoutMs ?? 300_000
    );

    return {
      success: true,
      taskId: dispatch.taskId,
      targetAgent: dispatch.targetAgent,
      result: dispatch.result,   // ← actual worker output, not just taskId
    };
  }

  /**
   * Read a file
   */
  private async readFile(path: string): Promise<any> {
    const fs = require('fs').promises;

    try {
      const content = await fs.readFile(path, 'utf-8');
      return {
        success: true,
        path,
        content,
        size: content.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Write a file
   */
  private async writeFile(path: string, content: string): Promise<any> {
    const fs = require('fs').promises;

    // Validate content parameter
    if (content === undefined || content === null) {
      return {
        success: false,
        error: 'Content parameter is required. Please provide the content to write to the file.',
      };
    }

    try {
      await fs.writeFile(path, content, 'utf-8');
      return {
        success: true,
        path,
        size: content.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Think - analyze a problem
   */
  private async think(problem: string): Promise<any> {
    // This is a meta-tool that signals the AI to think deeply
    // The AI will use this to structure its reasoning
    return {
      action: 'thinking',
      problem,
      note: 'Take time to analyze this problem step by step before responding',
    };
  }

  /**
   * Install system packages
   */
  private async installPackage(packages: string[]): Promise<any> {
    logger.info({ packages }, 'Installing packages');

    try {
      const packageList = packages.join(' ');
      const { stdout, stderr } = await execAsync(`sudo apt-get install -y ${packageList}`, {
        timeout: 300000, // 5 minutes
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      return {
        success: true,
        packages,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error: any) {
      return {
        success: false,
        packages,
        error: error.message,
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || '',
      };
    }
  }

  /**
   * Update system packages
   */
  private async updateSystem(upgrade: boolean = true): Promise<any> {
    logger.info({ upgrade }, 'Updating system');

    try {
      // Update package lists
      const { stdout: updateOut, stderr: updateErr } = await execAsync('sudo apt-get update', {
        timeout: 120000, // 2 minutes
      });

      let upgradeOut = '';
      let upgradeErr = '';

      // Upgrade packages if requested
      if (upgrade) {
        const result = await execAsync('sudo apt upgrade -y', {
          timeout: 600000, // 10 minutes
          maxBuffer: 10 * 1024 * 1024,
        });
        upgradeOut = result.stdout.trim();
        upgradeErr = result.stderr.trim();
      }

      return {
        success: true,
        updated: true,
        upgraded: upgrade,
        updateOutput: updateOut.trim(),
        upgradeOutput: upgradeOut,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || '',
      };
    }
  }

  /**
   * Remove system packages
   */
  private async removePackage(packages: string[]): Promise<any> {
    logger.info({ packages }, 'Removing packages');

    try {
      const packageList = packages.join(' ');
      const { stdout, stderr } = await execAsync(`sudo apt remove -y ${packageList}`, {
        timeout: 300000, // 5 minutes
      });

      // Auto-remove orphaned dependencies
      await execAsync('sudo apt autoremove -y', {
        timeout: 120000,
      });

      return {
        success: true,
        packages,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (error: any) {
      return {
        success: false,
        packages,
        error: error.message,
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || '',
      };
    }
  }

  /**
   * Get a credential from kernel keyring
   */
  // ─── SysAdminHCP bridge (read-only) ───────────────────────────────────────

  private async hcpGetSystemHealth(): Promise<any> {
    try {
      const health = await getHcpApiClient().getSystemHealth();
      return { success: true, ...health };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async hcpListTickets(status?: string): Promise<any> {
    try {
      const result = await getHcpApiClient().listTickets(status);
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async hcpGetTicket(id: string): Promise<any> {
    try {
      const result = await getHcpApiClient().getTicket(id);
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async hcpListClients(): Promise<any> {
    try {
      const result = await getHcpApiClient().listClients();
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async hcpGetIntrusionActivity(): Promise<any> {
    try {
      const result = await getHcpApiClient().getIntrusionActivity();
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── SysAdminHCP bridge (actions — delegation-gated) ──────────────────────

  /**
   * Checks for an active delegation on `scope` with `actionFlag` enabled.
   * Returns the delegation if allowed, or null (having already logged why)
   * if not — callers should return a not_delegated result in that case.
   */
  private gateAction(scope: 'tickets' | 'services' | 'clients' | 'security', actionFlag: keyof DelegationActions): { delegation: any; state: any } | null {
    const state = loadAutonomousState();
    const delegation = findActiveDelegation(state, scope);
    if (!delegation || !delegation.actions[actionFlag]) {
      return null;
    }
    return { delegation, state };
  }

  private notDelegatedResult(scope: string): any {
    return {
      success: false,
      error: 'not_delegated',
      hint: `This action is not delegated. Ask the admin to enable it under Autonomous Mode → ${scope}.`,
    };
  }

  private async hcpReplyTicket(id: string, message: string): Promise<any> {
    const gate = this.gateAction('tickets', 'autoReplyTickets');
    if (!gate) return this.notDelegatedResult('Tickets');
    try {
      const result = await getHcpApiClient().replyTicket(id, message);
      appendActionLog(gate.state, { action: 'reply_ticket', target: id, result, delegationId: gate.delegation.id });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async hcpUpdateTicketStatus(id: string, status: string): Promise<any> {
    const gate = this.gateAction('tickets', 'autoUpdateTicketStatus');
    if (!gate) return this.notDelegatedResult('Tickets');
    try {
      const result = await getHcpApiClient().updateTicketStatus(id, status);
      appendActionLog(gate.state, { action: 'update_ticket_status', target: `${id} -> ${status}`, result, delegationId: gate.delegation.id });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async hcpRestartService(serviceType: string, driverName: string): Promise<any> {
    const gate = this.gateAction('services', 'autoRestartServices');
    if (!gate) return this.notDelegatedResult('Services');
    try {
      const result = await getHcpApiClient().restartService(serviceType, driverName);
      appendActionLog(gate.state, { action: 'restart_service', target: `${serviceType}/${driverName}`, result, delegationId: gate.delegation.id });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async hcpSuspendClient(username: string): Promise<any> {
    const gate = this.gateAction('clients', 'autoSuspendClients');
    if (!gate) return this.notDelegatedResult('Clients');
    try {
      const result = await getHcpApiClient().suspendClient(username);
      appendActionLog(gate.state, { action: 'suspend_client', target: username, result, delegationId: gate.delegation.id });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async hcpUnsuspendClient(username: string): Promise<any> {
    const gate = this.gateAction('clients', 'autoSuspendClients');
    if (!gate) return this.notDelegatedResult('Clients');
    try {
      const result = await getHcpApiClient().unsuspendClient(username);
      appendActionLog(gate.state, { action: 'unsuspend_client', target: username, result, delegationId: gate.delegation.id });
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async getCredential(key: string): Promise<any> {
    logger.info({ key }, 'Retrieving credential');

    try {
      const manager = getCredentialManager();
      const value = await manager.getCredential(key);

      return {
        success: true,
        key,
        value,
        source: 'keyring',
      };
    } catch (error: any) {
      // Try environment fallback
      const envValue = process.env[key];
      if (envValue) {
        return {
          success: true,
          key,
          value: envValue,
          source: 'environment',
        };
      }

      return {
        success: false,
        key,
        error: error.message,
      };
    }
  }

  /**
   * Set a credential in kernel keyring
   */
  private async setCredential(key: string, value: string): Promise<any> {
    logger.info({ key }, 'Storing credential');

    try {
      const manager = getCredentialManager();
      await manager.setCredential(key, value);

      return {
        success: true,
        key,
        stored: true,
      };
    } catch (error: any) {
      return {
        success: false,
        key,
        error: error.message,
      };
    }
  }

  /**
   * Get orchestrator information including developer metadata
   */
  private async getOrchestratorInfo(): Promise<any> {
    logger.info('Getting orchestrator info');

    try {
      const metadata = this.orchestrator.getMetadata();
      const orchestratorId = this.orchestrator.getId();
      const orchestratorName = this.orchestrator.getName();
      const orchestratorType = this.orchestrator.getType();

      const info: any = {
        success: true,
        orchestrator: {
          id: orchestratorId,
          name: orchestratorName,
          type: orchestratorType,
        },
      };

      if (metadata) {
        info.metadata = metadata;
        
        if (metadata.developer) {
          info.developer = {
            name: metadata.developer.name,
            email: metadata.developer.email,
            github: metadata.developer.github,
          };
        }

        if (metadata.version) {
          info.version = metadata.version;
        }

        if (metadata.projectName) {
          info.projectName = metadata.projectName;
        }

        if (metadata.description) {
          info.description = metadata.description;
        }
      }

      return info;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send an email
   */
  private async sendEmail(
    to: string,
    subject: string,
    body: string,
    account?: string,
    attachments?: Array<{path: string; filename?: string}>
  ): Promise<any> {
    logger.info({ to, subject, account, hasAttachments: !!attachments }, 'AITools.sendEmail: Sending email');

    try {
      const result = await sendEmailSkill.execute({
        accountName: account,
        to,
        subject,
        body,
        attachments,
      });

      logger.info({ result }, 'AITools.sendEmail: Result from sendEmailSkill');

      if (result.success) {
        return {
          success: true,
          message: `✅ Email sent successfully to ${to}\n\nAccount: ${result.accountName}\nSubject: ${subject}\nMessage ID: ${result.messageId || 'N/A'}`,
          ...result,
        };
      } else {
        return {
          success: false,
          message: `❌ Failed to send email to ${to}\n\nError: ${result.error}`,
          error: result.error,
          ...result,
        };
      }
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack, to, subject }, 'AITools.sendEmail: Caught exception');
      return {
        success: false,
        message: `❌ Error sending email: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Read emails from an account
   */
  private async readEmails(
    account: string,
    folder?: string,
    limit?: number,
    unreadOnly?: boolean
  ): Promise<any> {
    logger.info({ account, folder, limit, unreadOnly }, 'Reading emails');

    try {
      const result = await readEmailSkill.execute({
        accountName: account,
        folder: folder || 'INBOX',
        limit: limit || 10,
        unreadOnly: unreadOnly || false,
      });

      if (result.success) {
        return {
          success: true,
          account,
          folder: folder || 'INBOX',
          count: result.emails?.length || 0,
          emails: result.emails || [],
          message: `Retrieved ${result.emails?.length || 0} emails from ${folder || 'INBOX'}`,
        };
      } else {
        return {
          success: false,
          message: `Failed to read emails: ${result.error}`,
          error: result.error,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Error reading emails: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * List configured email accounts
   */
  private async listEmailAccounts(): Promise<any> {
    logger.info('Listing email accounts');

    try {
      const result = await listEmailAccountsSkill.execute({});

      if (result.success) {
        return {
          success: true,
          count: result.count || 0,
          accounts: result.accounts || [],
          message: `${result.count || 0} email accounts configured`,
        };
      } else {
        return {
          success: false,
          message: `Failed to list accounts: ${result.error}`,
          error: result.error,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Error listing accounts: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Set the default email account
   */
  private async setDefaultEmailAccount(account: string): Promise<any> {
    logger.info({ account }, 'Setting default email account');

    try {
      const result = await setDefaultEmailSkill.execute({
        accountName: account,
      });

      if (result.success) {
        return {
          success: true,
          defaultAccount: account,
          message: `Default email account changed to ${account}`,
        };
      } else {
        return {
          success: false,
          message: `Failed to set default account: ${result.error}`,
          error: result.error,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Error setting default account: ${error.message}`,
        error: error.message,
      };
    }
  }

  /**
   * Web search
   */
  private async webSearch(query: string, count?: number): Promise<any> {
    logger.info({ query, count }, 'Performing web search');

    try {
      const results = await webSearchSkill(query, count || 10);

      return {
        success: true,
        query,
        resultsCount: results.length,
        results: results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.source,
        })),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Web search failed: ${error.message}`,
        hint: 'For Bing: set BING_SEARCH_API_KEY credential. For Google: set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID credentials. DuckDuckGo works without API keys but has limited results.',
      };
    }
  }

  /**
   * Fetch web content
   */
  private async fetchWebContent(url: string): Promise<any> {
    logger.info({ url }, 'Fetching web content');

    try {
      const content = await fetchWebContentSkill(url);

      if (content.success) {
        return {
          success: true,
          url: content.url,
          title: content.title,
          content: content.content,
          textLength: content.textLength,
        };
      } else {
        return {
          success: false,
          error: content.error,
          message: `Failed to fetch content from ${url}: ${content.error}`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Error fetching web content: ${error.message}`,
      };
    }
  }

  /**
   * Search and extract content
   */
  private async searchAndExtract(
    query: string,
    maxResults?: number,
    maxPages?: number
  ): Promise<any> {
    logger.info({ query, maxResults, maxPages }, 'Search and extract operation');

    try {
      const result = await searchAndExtractSkill(
        query,
        maxResults || 3,
        maxPages || 2
      );

      return {
        success: true,
        query: result.query,
        summary: result.summary,
        searchResults: result.searchResults.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })),
        extractedContent: result.extractedContent.map(c => ({
          url: c.url,
          title: c.title,
          contentPreview: c.content.substring(0, 500) + '...',
          fullContent: c.content,
          textLength: c.textLength,
          success: c.success,
        })),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Search and extract failed: ${error.message}`,
      };
    }
  }

  /**
   * Find financial sources
   */
  private async findFinancialSources(topic: string): Promise<any> {
    logger.info({ topic }, 'Finding financial sources');

    try {
      const results = await findFinancialSourcesSkill(topic);

      return {
        success: true,
        topic,
        resultsCount: results.length,
        results: results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          source: r.source,
        })),
        message: `Found ${results.length} reliable financial sources for "${topic}"`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to find financial sources: ${error.message}`,
      };
    }
  }

  /**
   * Generate PDF from text
   */
  private async generateTextPDF(
    content: string,
    title?: string,
    author?: string,
    fontSize?: number
  ): Promise<any> {
    logger.info({ contentLength: content.length }, 'Generating PDF from text');

    try {
      const result = await generateTextPDFSkill.execute({
        content,
        title,
        author,
        fontSize,
      });

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to generate PDF: ${error.message}`,
      };
    }
  }

  /**
   * Generate PDF from HTML
   */
  private async generateHTMLPDF(
    htmlContent: string,
    title?: string,
    author?: string,
    fontSize?: number
  ): Promise<any> {
    logger.info({ contentLength: htmlContent.length }, 'Generating PDF from HTML');

    try {
      const result = await generateHTMLPDFSkill.execute({
        htmlContent,
        title,
        author,
        fontSize,
      });

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to generate PDF: ${error.message}`,
      };
    }
  }

  /**
   * Generate PDF from web page
   */
  private async generateWebPagePDF(
    pageTitle: string,
    pageUrl: string,
    pageContent: string,
    author?: string
  ): Promise<any> {
    logger.info({ pageUrl }, 'Generating PDF from web page');

    try {
      const result = await generateWebPagePDFSkill.execute({
        pageTitle,
        pageUrl,
        pageContent,
        author,
      });

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to generate PDF: ${error.message}`,
      };
    }
  }

  /**
   * Generate report PDF
   */
  private async generateReportPDF(
    reportTitle: string,
    sections: Array<{ heading: string; content: string }>,
    summary?: string
  ): Promise<any> {
    logger.info({ reportTitle, sectionCount: sections.length }, 'Generating report PDF');

    try {
      const result = await generateReportPDFSkill.execute({
        reportTitle,
        sections,
        summary,
      });

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to generate report PDF: ${error.message}`,
      };
    }
  }

  /**
   * List PDFs
   */
  private async listPDFs(): Promise<any> {
    logger.info('Listing generated PDFs');

    try {
      const result = await listPDFsSkill.execute();

      return {
        success: true,
        count: result.count,
        pdfs: result.pdfs.map((p: any) => ({
          fileName: p.fileName,
          fileSize: `${(p.fileSize / 1024).toFixed(2)} KB`,
          createdAt: p.createdAt,
        })),
        message: `Found ${result.count} generated PDFs`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to list PDFs: ${error.message}`,
      };
    }
  }

  /**
   * Delete PDF
   */
  private async deletePDF(fileName: string): Promise<any> {
    logger.info({ fileName }, 'Deleting PDF');

    try {
      const result = await deletePDFSkill.execute({ fileName });

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to delete PDF: ${error.message}`,
      };
    }
  }

  /**
   * Create scheduled task
   */
  private async createScheduledTask(args: any): Promise<any> {
    logger.info({ args }, 'Creating scheduled task');

    try {
      const result = await createScheduledTaskSkill.execute(args);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to create scheduled task: ${error.message}`,
      };
    }
  }

  /**
   * List scheduled tasks
   */
  private async listScheduledTasks(): Promise<any> {
    logger.info('Listing scheduled tasks');

    try {
      const result = await listScheduledTasksSkill.execute();
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to list scheduled tasks: ${error.message}`,
      };
    }
  }

  /**
   * Delete scheduled task
   */
  private async deleteScheduledTask(taskId?: string, taskName?: string): Promise<any> {
    logger.info({ taskId, taskName }, 'Deleting scheduled task');

    try {
      const result = await deleteScheduledTaskSkill.execute({ taskId, taskName });
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to delete scheduled task: ${error.message}`,
      };
    }
  }

  /**
   * Pause scheduled task
   */
  private async pauseScheduledTask(taskId?: string, taskName?: string): Promise<any> {
    logger.info({ taskId, taskName }, 'Pausing scheduled task');

    try {
      const result = await pauseScheduledTaskSkill.execute({ taskId, taskName });
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to pause scheduled task: ${error.message}`,
      };
    }
  }

  /**
   * Resume scheduled task
   */
  private async resumeScheduledTask(taskId?: string, taskName?: string): Promise<any> {
    logger.info({ taskId, taskName }, 'Resuming scheduled task');

    try {
      const result = await resumeScheduledTaskSkill.execute({ taskId, taskName });
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to resume scheduled task: ${error.message}`,
      };
    }
  }

  /**
   * Generate new skill
   */
  private async generateNewSkill(args: any): Promise<any> {
    logger.info({ args }, '🚀 Generating new skill via meta-programming');

    try {
      const result = await generateNewSkillSkill.execute(args);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to generate skill: ${error.message}`,
      };
    }
  }

  /**
   * List generated skills
   */
  private async listGeneratedSkills(): Promise<any> {
    logger.info('Listing generated skills');

    try {
      const result = await listGeneratedSkillsSkill.execute({});
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to list generated skills: ${error.message}`,
      };
    }
  }

  /**
   * List all skills (built-in + generated)
   */
  private async listAllSkills(): Promise<any> {
    logger.info('Listing all skills (built-in + generated)');

    try {
      const result = await listAllSkillsSkill.execute({});
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to list all skills: ${error.message}`,
      };
    }
  }

  /**
   * View generated skill
   */
  private async viewGeneratedSkill(skillName: string): Promise<any> {
    logger.info({ skillName }, 'Viewing generated skill');

    try {
      const result = await viewGeneratedSkillSkill.execute({ skillName });
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to view generated skill: ${error.message}`,
      };
    }
  }

  /**
   * Delete generated skill
   */
  private async deleteGeneratedSkill(skillName: string): Promise<any> {
    logger.info({ skillName }, 'Deleting generated skill');

    try {
      const result = await deleteGeneratedSkillSkill.execute({ skillName });
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to delete generated skill: ${error.message}`,
      };
    }
  }

  /**
   * Log AI token usage
   */
  private async logAiTokenUsage(args: any): Promise<any> {
    logger.info({ args }, '📊 Logging AI token usage');

    try {
      const result = await logAiTokenUsageSkill.execute(args);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to log AI token usage: ${error.message}`,
      };
    }
  }

  /**
   * Get AI token usage statistics
   */
  private async getAiTokenUsage(args: any = {}): Promise<any> {
    logger.info({ args }, '📊 Getting AI token usage statistics');

    try {
      const result = await getAiTokenUsageSkill.execute(args);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to get AI token usage: ${error.message}`,
      };
    }
  }

  /**
   * Reset AI token usage statistics
   */
  private async resetAiTokenUsage(args: any): Promise<any> {
    logger.info({ args }, '🗑️ Resetting AI token usage');

    try {
      const result = await resetAiTokenUsageSkill.execute(args);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to reset AI token usage: ${error.message}`,
      };
    }
  }

  /**
   * Export AI token usage report
   */
  private async exportAiTokenUsage(args: any): Promise<any> {
    logger.info({ args }, '📄 Exporting AI token usage');

    try {
      const result = await exportAiTokenUsageSkill.execute(args);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to export AI token usage: ${error.message}`,
      };
    }
  }

  /**
   * Generate a new skill dynamically
   */
  private async generateSkill(args: any): Promise<any> {
    logger.info({ args }, '🔧 Generating new skill');

    try {
      // Initialize SkillGenerator if not already done
      if (!this.skillGenerator) {
        if (!this.aiProvider) {
          return {
            success: false,
            error: 'AIProvider not available',
            message: 'Cannot generate skills without AI provider. The gateway must be initialized with AI enabled.',
          };
        }
        
        this.skillGenerator = new SkillGenerator(this.aiProvider);
      }

      // Validate required parameters
      if (!args.skillName) {
        return {
          success: false,
          error: 'skillName parameter is required',
          message: 'Please provide a skill name in snake_case format',
        };
      }

      if (!args.description) {
        return {
          success: false,
          error: 'description parameter is required',
          message: 'Please provide a detailed description of what the skill should do',
        };
      }

      // Generate the skill
      const result = await this.skillGenerator.generateSkill({
        skillName: args.skillName,
        description: args.description,
        category: args.category,
        parameters: args.parameters,
        requiresToolInstallation: args.requiresToolInstallation,
        toolPackageName: args.toolPackageName,
      });

      return result;
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'Skill generation failed');
      return {
        success: false,
        error: error.message,
        message: `Failed to generate skill: ${error.message}`,
      };
    }
  }
}
