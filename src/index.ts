/**
 * AI Agent Assistant (AiAgentAssistant)
 * Main Entry Point
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import 'dotenv/config';
import express from 'express';
import { MessageBus } from './core/MessageBus';
import { MasterOrchestrator } from './core/Orchestrator';
import { WorkerAgent } from './core/WorkerAgent';
import { TelegramGateway } from './gateways/TelegramGateway';
import { WebChatGateway } from './gateways/WebChatGateway';
import { WhatsAppGateway } from './gateways/WhatsAppGateway';
import { DiscordGateway } from './gateways/DiscordGateway';
import { initializeScheduler, setNLScriptRunner } from './skills/SchedulingSkills';
import { getScript } from './utils/NLScriptManager.js';
import { AI_TOOLS as TOOL_DEFINITIONS, AIToolExecutor } from './utils/AITools';
import {
  echoSkill,
  weatherSkill,
  calculatorSkill,
  dataProcessingSkill,
  notificationSkill,
  delaySkill,
  queryDatabaseSkill,
} from './skills/ExampleSkills';
import {
  webSearchSkill,
  webScrapingSkill,
  codeGenerationSkill,
  codeAnalysisSkill,
  documentGenerationSkill,
  sendEmailSkill,
  slackNotificationSkill,
  sendSMSSkill,
  dataAnalysisSkill,
  dataTransformationSkill,
  dataValidationSkill,
  fileUploadSkill,
  ocrSkill,
  pdfProcessingSkill,
  databaseQuerySkill,
  databaseUpsertSkill,
  apiCallSkill,
  webhookTriggerSkill,
  scheduleTaskSkill,
  executeWorkflowSkill,
  knowledgeBaseQuerySkill,
  contextMemorySkill,
  imageProcessingSkill,
  transcriptionSkill,
} from './skills/EnterpriseSkills';
import {
  aiChatSkill,
  aiGenerateCodeSkill,
  aiCodeReviewSkill,
  aiExplainCodeSkill,
  aiDebugSkill,
  aiAnalyzeTextSkill,
  aiAnswerQuestionSkill,
  aiSelectModelSkill,
  aiInfoSkill,
  getOrchestratorInfoSkill,
} from './skills/AISkills';
import { createAIProviderFromEnv } from './utils/AIProvider';
import { loadCredentials } from './utils/CredentialManager';
import { allITKnowledgeSkills } from './skills/ITKnowledgeSkill';
import logger from './utils/logger';

const app = express();
app.use(express.json());

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const API_PORT = parseInt(process.env.API_PORT || '3000');
// Note: TELEGRAM_BOT_TOKEN and AI_API_KEY loaded from keyring at startup

// Global instances
let messageBus: MessageBus;
let orchestrator: MasterOrchestrator;
const workers: WorkerAgent[] = [];
let telegramGateway: TelegramGateway | null = null;
let webChatGateway: WebChatGateway | null = null;
let whatsappGateway: WhatsAppGateway | null = null;
let discordGateway: DiscordGateway | null = null;

/**
 * Initialize the system
 */
async function initializeSystem(): Promise<void> {
  logger.info('🚀 Initializing Multi-Agent Orchestrator System...');

  // 0. Load credentials from kernel keyring (or fallback to .env)
  try {
    logger.info('🔐 Loading credentials from kernel keyring...');
    const credentials = await loadCredentials();
    
    // Set loaded credentials into process.env for other modules to use
    Object.entries(credentials).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    logger.info({ count: Object.keys(credentials).length }, '✅ Credentials loaded from keyring');
  } catch (error: any) {
    logger.warn({ error: error.message }, '⚠️ Failed to load credentials from keyring, using environment variables');
  }

  // 1. Create message bus
  messageBus = new MessageBus({ redisUrl: REDIS_URL });
  logger.info('✅ Message bus created');

  // 2. Create master orchestrator
  orchestrator = new MasterOrchestrator(
    {
      id: process.env.ORCHESTRATOR_ID || 'master-orchestrator',
      name: process.env.ORCHESTRATOR_NAME || 'Master Orchestrator',
      type: 'orchestrator',
      description: 'Central orchestration agent',
      skills: [
        // Orchestrator can have its own skills
        echoSkill,
      ],
      metadata: {
        developer: {
          name: 'Jose Rodriguez Arroyo',
          email: 'jrpcone@gmail.com',
          github: 'https://github.com/jorodriguezpr/',
        },
        version: '1.0.0',
        projectName: 'AI Agent Assistant',
        description: 'Multi-agent orchestration system with AI integration',
      },
    },
    messageBus
  );

  await orchestrator.start();
  logger.info('✅ Master orchestrator started');

  // 3. Create worker agents with enterprise skills organized by category

  // Worker 1: Web & Research Agent - Search, scraping, research
  const worker1 = new WorkerAgent(
    {
      id: 'worker-web',
      name: 'Web Research Agent',
      type: 'worker',
      description: 'Web search, scraping, and information retrieval',
      skills: [
        webSearchSkill,
        webScrapingSkill,
        knowledgeBaseQuerySkill,
      ],
      maxConcurrentTasks: 5,
    },
    messageBus
  );
  await worker1.start();
  workers.push(worker1);
  orchestrator.registerWorkerAgent('worker-web', 'Web Research Agent');
  logger.info('✅ Web Research Worker Agent started');

  // Worker 2: Code & Development Agent - Code generation, analysis, API calls
  const worker2 = new WorkerAgent(
    {
      id: 'worker-code',
      name: 'Code Development Agent',
      type: 'worker',
      description: 'Code generation, analysis, and API integration',
      skills: [
        codeGenerationSkill,
        codeAnalysisSkill,
        apiCallSkill,
        webhookTriggerSkill,
      ],
      maxConcurrentTasks: 8,
    },
    messageBus
  );
  await worker2.start();
  workers.push(worker2);
  orchestrator.registerWorkerAgent('worker-code', 'Code Development Agent');
  logger.info('✅ Code Development Worker Agent started');

  // Worker 3: Data & Analytics Agent - Data analysis, transformation, validation
  const worker3 = new WorkerAgent(
    {
      id: 'worker-analytics',
      name: 'Data Analytics Agent',
      type: 'worker',
      description: 'Data analysis, transformation, and validation',
      skills: [
        dataAnalysisSkill,
        dataTransformationSkill,
        dataValidationSkill,
        databaseQuerySkill,
        databaseUpsertSkill,
      ],
      maxConcurrentTasks: 10,
    },
    messageBus
  );
  await worker3.start();
  workers.push(worker3);
  orchestrator.registerWorkerAgent('worker-analytics', 'Data Analytics Agent');
  logger.info('✅ Data Analytics Worker Agent started');

  // Worker 4: Communication Agent - Email, Slack, SMS, notifications
  const worker4 = new WorkerAgent(
    {
      id: 'worker-communication',
      name: 'Communication Agent',
      type: 'worker',
      description: 'Email, Slack, SMS, and notification delivery',
      skills: [
        sendEmailSkill,
        slackNotificationSkill,
        sendSMSSkill,
        notificationSkill,
      ],
      maxConcurrentTasks: 15,
    },
    messageBus
  );
  await worker4.start();
  workers.push(worker4);
  orchestrator.registerWorkerAgent('worker-communication', 'Communication Agent');
  logger.info('✅ Communication Worker Agent started');

  // Worker 5: Document & File Processing Agent - PDF, OCR, file upload, processing
  const worker5 = new WorkerAgent(
    {
      id: 'worker-documents',
      name: 'Document Processing Agent',
      type: 'worker',
      description: 'PDF processing, OCR, and file management',
      skills: [
        pdfProcessingSkill,
        ocrSkill,
        fileUploadSkill,
        documentGenerationSkill,
      ],
      maxConcurrentTasks: 6,
    },
    messageBus
  );
  await worker5.start();
  workers.push(worker5);
  orchestrator.registerWorkerAgent('worker-documents', 'Document Processing Agent');
  logger.info('✅ Document Processing Worker Agent started');

  // Worker 6: Media & Content Agent - Image processing, transcription, media handling
  const worker6 = new WorkerAgent(
    {
      id: 'worker-media',
      name: 'Media Processing Agent',
      type: 'worker',
      description: 'Image processing, audio transcription, and media handling',
      skills: [
        imageProcessingSkill,
        transcriptionSkill,
      ],
      maxConcurrentTasks: 4,
    },
    messageBus
  );
  await worker6.start();
  workers.push(worker6);
  orchestrator.registerWorkerAgent('worker-media', 'Media Processing Agent');
  logger.info('✅ Media Processing Worker Agent started');

  // Worker 7: Workflow & Scheduling Agent - Task scheduling, workflow execution, and IT knowledge
  const worker7 = new WorkerAgent(
    {
      id: 'worker-workflow',
      name: 'Workflow Orchestration Agent',
      type: 'worker',
      description: 'Task scheduling, workflow execution, context management, and IT knowledge base',
      skills: [
        scheduleTaskSkill,
        executeWorkflowSkill,
        contextMemorySkill,
        // IT Experience Knowledge Base - self-learning from successful operations
        ...allITKnowledgeSkills,
      ],
      maxConcurrentTasks: 12,
    },
    messageBus
  );
  await worker7.start();
  workers.push(worker7);
  orchestrator.registerWorkerAgent('worker-workflow', 'Workflow Orchestration Agent');
  logger.info('✅ Workflow Orchestration Worker Agent started');

  // Worker 8: Utilities & Legacy Skills Agent - Backward compatibility
  const worker8 = new WorkerAgent(
    {
      id: 'worker-utilities',
      name: 'Utilities Agent',
      type: 'worker',
      description: 'General utilities: echo, calculator, weather, delays',
      skills: [
        echoSkill,
        calculatorSkill,
        weatherSkill,
        delaySkill,
        dataProcessingSkill,
      ],
      maxConcurrentTasks: 5,
    },
    messageBus
  );
  await worker8.start();
  workers.push(worker8);
  orchestrator.registerWorkerAgent('worker-utilities', 'Utilities Agent');
  logger.info('✅ Utilities Worker Agent started');

  // Worker 9: AI Agent - GitHub Copilot 2026 powered AI assistant
  const aiProvider = createAIProviderFromEnv();
  
  if (aiProvider) {
    const worker9 = new WorkerAgent(
      {
        id: 'worker-ai',
        name: 'AI Assistant Agent',
        type: 'worker',
        description: 'GitHub Copilot 2026 AI for chat, code, and analysis',
        skills: [
          aiChatSkill(aiProvider),
          aiGenerateCodeSkill(aiProvider),
          aiCodeReviewSkill(aiProvider),
          aiExplainCodeSkill(aiProvider),
          aiDebugSkill(aiProvider),
          aiAnalyzeTextSkill(aiProvider),
          aiAnswerQuestionSkill(aiProvider),
          aiSelectModelSkill(aiProvider),
          aiInfoSkill(aiProvider),
          getOrchestratorInfoSkill(orchestrator),
        ],
        maxConcurrentTasks: 10,
      },
      messageBus
    );
    await worker9.start();
    workers.push(worker9);
    orchestrator.registerWorkerAgent('worker-ai', 'AI Assistant Agent');
    logger.info('✅ AI Assistant Worker Agent started (GitHub Copilot 2026)');
  } else {
    logger.warn('⚠️ AI API key not set, AI features disabled');
  }

  // 4. Initialize Telegram Gateway if token is provided
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (TELEGRAM_TOKEN) {
    telegramGateway = new TelegramGateway(
      {
        token: TELEGRAM_TOKEN,
      },
      orchestrator,
      aiProvider // Pass AI provider to enable AI chat in Telegram
    );
    await telegramGateway.start();
    logger.info('✅ Telegram gateway started');
  } else {
    logger.warn('⚠️ TELEGRAM_BOT_TOKEN not set, skipping Telegram gateway');
  }

  // 5. Initialize WhatsApp Gateway if enabled
  const ENABLE_WHATSAPP = process.env.ENABLE_WHATSAPP === 'true';
  if (ENABLE_WHATSAPP) {
    try {
      whatsappGateway = new WhatsAppGateway(
        {
          sessionName: process.env.WHATSAPP_SESSION_NAME || 'aiagentassistant',
          puppeteerOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            // Let Puppeteer use its own Chrome (installed via: npx puppeteer browsers install chrome)
          },
        },
        orchestrator,
        aiProvider
      );
      await whatsappGateway.start();
      logger.info('✅ WhatsApp gateway started - scan QR code if prompted');
    } catch (error) {
      logger.error({ error }, '❌ Failed to start WhatsApp gateway');
    }
  } else {
    logger.info('ℹ️ WhatsApp gateway disabled (set ENABLE_WHATSAPP=true to enable)');
  }

  // 6. Initialize Discord Gateway if enabled
  const ENABLE_DISCORD = process.env.ENABLE_DISCORD === 'true';
  const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (ENABLE_DISCORD && DISCORD_TOKEN) {
    try {
      discordGateway = new DiscordGateway(
        {
          token: DISCORD_TOKEN,
          prefix: process.env.DISCORD_COMMAND_PREFIX || '!',
          statusMessage: process.env.DISCORD_STATUS || 'AI Agent Assistant | !help',
        },
        orchestrator,
        aiProvider
      );
      await discordGateway.start();
      logger.info('✅ Discord gateway started');
    } catch (error) {
      logger.error({ error }, '❌ Failed to start Discord gateway');
    }
  } else if (ENABLE_DISCORD && !DISCORD_TOKEN) {
    logger.warn('⚠️ ENABLE_DISCORD=true but DISCORD_BOT_TOKEN not set');
  } else {
    logger.info('ℹ️ Discord gateway disabled (set ENABLE_DISCORD=true to enable)');
  }

  // 7. Initialize Web Chat Gateway (admin portal chat)
  webChatGateway = new WebChatGateway(orchestrator, aiProvider);
  app.use('/api/webchat', webChatGateway.getRouter());
  logger.info('✅ Web Chat Gateway started on /api/webchat');

  // 8. Initialize Task Scheduler
  initializeScheduler();

  // Register NL script runner so scheduled nlscript tasks can invoke the AI loop
  if (aiProvider) {
    const scheduledToolExecutor = new AIToolExecutor(orchestrator, aiProvider);
    setNLScriptRunner(async (scriptName: string) => {
      const script = getScript(scriptName);
      if (!script) {
        logger.error({ scriptName }, 'Scheduled NL script not found');
        return;
      }
      const prompt = `Execute this script named "${scriptName}":\n${script.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`;
      const history: any[] = [{ role: 'user', content: prompt }];
      const MAX_ITER = 60;
      for (let iter = 0; iter < MAX_ITER; iter++) {
        const response = await aiProvider!.chatCompletion(history, TOOL_DEFINITIONS as any);
        if (response.toolCalls?.length) {
          history.push({ role: 'assistant', content: response.content || '', tool_calls: response.toolCalls });
          for (const tc of response.toolCalls) {
            let args: any;
            try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
            try {
              const result = await scheduledToolExecutor.execute(tc.function.name, args);
              logger.info({ scriptName, tool: tc.function.name }, 'Scheduled NL script tool result');
              history.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: tc.id, name: tc.function.name });
            } catch (e: any) {
              history.push({ role: 'tool', content: JSON.stringify({ error: e.message }), tool_call_id: tc.id, name: tc.function.name });
            }
          }
        } else {
          logger.info({ scriptName, response: response.content?.slice(0, 200) }, 'Scheduled NL script completed');
          break;
        }
      }
    });
  }

  logger.info('✅ Task scheduler initialized');

  logger.info('🎉 System initialized successfully!');
}

/**
 * Setup API routes
 */
function setupRoutes(): void {
  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      orchestrator: orchestrator.getStatus(),
    });
  });

  // Get system status
  app.get('/api/status', (req, res) => {
    res.json({
      orchestrator: orchestrator.getStatus(),
      workers: orchestrator.getWorkers(),
    });
  });

  // Get health check
  app.get('/api/health', async (req, res) => {
    try {
      const health = await orchestrator.healthCheck();
      res.json(health);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Get agents list
  app.get('/api/agents', (req, res) => {
    res.json({
      orchestrator: {
        id: orchestrator.getId(),
        name: orchestrator.getName(),
        type: orchestrator.getType(),
      },
      workers: orchestrator.getWorkers(),
      totalAgents: orchestrator.getWorkers().length + 1,
    });
  });

  // Execute task
  app.post('/api/execute', async (req, res) => {
    try {
      const { action, payload, targetAgent } = req.body;

      if (!action) {
        return res.status(400).json({ error: 'Action is required' });
      }

      const result = await orchestrator.dispatchTask(action, payload, targetAgent);
      return res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  });

  // Broadcast task
  app.post('/api/broadcast', async (req, res) => {
    try {
      const { action, payload } = req.body;

      if (!action) {
        return res.status(400).json({ error: 'Action is required' });
      }

      const results = await orchestrator.broadcastTask(action, payload);
      return res.json({
        success: true,
        taskCount: results.length,
        results,
      });
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  });

  logger.info('✅ API routes configured');
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize system
    await initializeSystem();

    // Setup routes
    setupRoutes();

    // Start Express server — bind to loopback only; not exposed externally
    app.listen(API_PORT, '127.0.0.1', () => {
      logger.info(`🌐 API server running on http://localhost:${API_PORT}`);
      logger.info(`📊 Health check: http://localhost:${API_PORT}/health`);
      logger.info(`📋 Status endpoint: http://localhost:${API_PORT}/api/status`);
    });
  } catch (error) {
    logger.error({ error }, 'Fatal error during startup');
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
  logger.info('🛑 Shutdown signal received...');

  try {
    // Stop all workers
    for (const worker of workers) {
      await worker.stop();
    }

    // Stop orchestrator
    await orchestrator.stop();

    // Stop Telegram gateway
    if (telegramGateway) {
      telegramGateway.stop();
    }

    // Close message bus
    await messageBus.close();

    logger.info('✅ System shut down gracefully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
});

// Start the server
startServer();
