import { Skill } from '../types';
import { AIProvider, ChatMessage } from '../utils/AIProvider';
import logger from '../utils/logger';

/**
 * AI-Powered Skills using GitHub Copilot 2026 or other providers
 * These skills leverage AI for chat, code generation, analysis, and more
 */

/**
 * AI Chat Skill - General conversation with AI
 */
export const aiChatSkill = (aiProvider: AIProvider): Skill => ({
  name: 'aiChat',
  description: 'Chat with AI (supports context and conversation history)',
  execute: async (params: Record<string, any>) => {
    const { message, context, conversationHistory } = params;

    if (!message) {
      return {
        success: false,
        error: 'Message is required',
      };
    }

    try {
      const messages: ChatMessage[] = [];

      // Add system context if provided
      if (context) {
        messages.push({
          role: 'system',
          content: context,
        });
      }

      // Add conversation history if provided
      if (conversationHistory && Array.isArray(conversationHistory)) {
        messages.push(...conversationHistory);
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: message,
      });

      const response = await aiProvider.chatCompletion(messages);

      return {
        success: true,
        response: response.content,
        model: response.model,
        usage: response.usage,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'AI chat failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

/**
 * AI Code Generation Skill
 */
export const aiGenerateCodeSkill = (aiProvider: AIProvider): Skill => ({
  name: 'aiGenerateCode',
  description: 'Generate code using AI based on requirements',
  execute: async (params: Record<string, any>) => {
    const { requirements, language, framework, style } = params;

    if (!requirements) {
      return {
        success: false,
        error: 'Requirements are required',
      };
    }

    try {
      const systemPrompt = `You are an expert software developer. Generate clean, production-ready code based on user requirements.
Language: ${language || 'any appropriate language'}
Framework: ${framework || 'best practice'}
Style: ${style || 'clean and modular'}

Return only the code with brief comments. No explanations outside the code.`;

      const code = await aiProvider.complete(requirements, systemPrompt);

      return {
        success: true,
        code,
        language: language || 'auto-detected',
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'AI code generation failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

/**
 * AI Code Review Skill
 */
export const aiCodeReviewSkill = (aiProvider: AIProvider): Skill => ({
  name: 'aiCodeReview',
  description: 'Get AI-powered code review and suggestions',
  execute: async (params: Record<string, any>) => {
    const { code, language, focus } = params;

    if (!code) {
      return {
        success: false,
        error: 'Code is required',
      };
    }

    try {
      const systemPrompt = `You are an expert code reviewer. Analyze the code and provide:
1. Code quality issues
2. Security vulnerabilities
3. Performance improvements
4. Best practice violations
5. Suggestions for improvement

Focus on: ${focus || 'all aspects'}`;

      const prompt = `Review this ${language || ''} code:\n\n\`\`\`\n${code}\n\`\`\``;

      const review = await aiProvider.complete(prompt, systemPrompt);

      return {
        success: true,
        review,
        language: language || 'unknown',
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'AI code review failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

/**
 * AI Code Explanation Skill
 */
export const aiExplainCodeSkill = (aiProvider: AIProvider): Skill => ({
  name: 'aiExplainCode',
  description: 'Get AI explanation of code functionality',
  execute: async (params: Record<string, any>) => {
    const { code, language, level } = params;

    if (!code) {
      return {
        success: false,
        error: 'Code is required',
      };
    }

    try {
      const systemPrompt = `You are an expert programming teacher. Explain code clearly and concisely.
Explanation level: ${level || 'intermediate'}
Break down the code's purpose, logic, and key concepts.`;

      const prompt = `Explain this ${language || ''} code:\n\n\`\`\`\n${code}\n\`\`\``;

      const explanation = await aiProvider.complete(prompt, systemPrompt);

      return {
        success: true,
        explanation,
        language: language || 'unknown',
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'AI code explanation failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

/**
 * AI Debug Assistance Skill
 */
export const aiDebugSkill = (aiProvider: AIProvider): Skill => ({
  name: 'aiDebug',
  description: 'Get AI help debugging code and errors',
  execute: async (params: Record<string, any>) => {
    const { code, error, language, context } = params;

    if (!code && !error) {
      return {
        success: false,
        error: 'Code or error message is required',
      };
    }

    try {
      const systemPrompt = `You are an expert debugger. Analyze the error and provide:
1. Root cause analysis
2. Step-by-step fix
3. Prevention strategies
4. Related issues to check`;

      let prompt = `Debug this issue:\n\n`;
      if (error) prompt += `Error: ${error}\n\n`;
      if (code) prompt += `Code:\n\`\`\`${language || ''}\n${code}\n\`\`\`\n\n`;
      if (context) prompt += `Context: ${context}`;

      const debugSuggestion = await aiProvider.complete(prompt, systemPrompt);

      return {
        success: true,
        suggestion: debugSuggestion,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'AI debug assistance failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

/**
 * AI Text Analysis Skill
 */
export const aiAnalyzeTextSkill = (aiProvider: AIProvider): Skill => ({
  name: 'aiAnalyzeText',
  description: 'Analyze text for sentiment, entities, summarization',
  execute: async (params: Record<string, any>) => {
    const { text, analysisType } = params;

    if (!text) {
      return {
        success: false,
        error: 'Text is required',
      };
    }

    try {
      let systemPrompt = '';
      let prompt = '';

      switch (analysisType) {
        case 'sentiment':
          systemPrompt = 'You are a sentiment analysis expert. Analyze the sentiment (positive, negative, neutral) with confidence score.';
          prompt = `Analyze sentiment:\n\n${text}`;
          break;
        case 'summarize':
          systemPrompt = 'You are an expert at summarization. Create a concise summary preserving key information.';
          prompt = `Summarize this text:\n\n${text}`;
          break;
        case 'entities':
          systemPrompt = 'You are an entity extraction expert. Extract named entities (people, organizations, locations, dates).';
          prompt = `Extract entities from:\n\n${text}`;
          break;
        default:
          systemPrompt = 'You are a text analysis expert. Provide comprehensive analysis.';
          prompt = `Analyze this text:\n\n${text}`;
      }

      const analysis = await aiProvider.complete(prompt, systemPrompt);

      return {
        success: true,
        analysis,
        analysisType: analysisType || 'general',
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'AI text analysis failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

/**
 * AI Question Answering Skill
 */
export const aiAnswerQuestionSkill = (aiProvider: AIProvider): Skill => ({
  name: 'aiAnswer',
  description: 'Answer questions using AI knowledge',
  execute: async (params: Record<string, any>) => {
    const { question, context, domain } = params;

    if (!question) {
      return {
        success: false,
        error: 'Question is required',
      };
    }

    try {
      let systemPrompt = 'You are a knowledgeable assistant. Provide accurate, helpful answers.';
      
      if (domain) {
        systemPrompt += ` Specialize in: ${domain}`;
      }

      let prompt = question;
      if (context) {
        prompt = `Context: ${context}\n\nQuestion: ${question}`;
      }

      const answer = await aiProvider.complete(prompt, systemPrompt);

      return {
        success: true,
        answer,
        question,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'AI question answering failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

/**
 * AI Model Selection Skill
 */
export const aiSelectModelSkill = (aiProvider: AIProvider): Skill => ({
  name: 'aiSelectModel',
  description: 'Change AI model at runtime',
  execute: async (params: Record<string, any>) => {
    const { model } = params;

    if (!model) {
      const availableModels = aiProvider.getAvailableModels();
      const currentConfig = aiProvider.getConfig();

      return {
        success: true,
        currentModel: currentConfig.model,
        availableModels,
        message: 'Provide a model name to switch',
      };
    }

    try {
      const availableModels = aiProvider.getAvailableModels();
      
      if (!availableModels.includes(model)) {
        return {
          success: false,
          error: `Model '${model}' not available`,
          availableModels,
        };
      }

      aiProvider.setModel(model);
      const newConfig = aiProvider.getConfig();

      return {
        success: true,
        previousModel: params.previousModel,
        currentModel: newConfig.model,
        message: `Switched to model: ${model}`,
      };
    } catch (error: any) {
      logger.error({ err: error }, 'AI model selection failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

/**
 * AI Configuration Info Skill
 */
export const aiInfoSkill = (aiProvider: AIProvider): Skill => ({
  name: 'aiInfo',
  description: 'Get current AI provider configuration',
  execute: async (params: Record<string, any>) => {
    try {
      const config = aiProvider.getConfig();
      const availableModels = aiProvider.getAvailableModels();

      return {
        success: true,
        config,
        availableModels,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'AI info retrieval failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});

/**
 * Get Orchestrator/Developer Info Skill
 */
export const getOrchestratorInfoSkill = (orchestrator?: any): Skill => ({
  name: 'getOrchestratorInfo',
  description: 'Get information about the orchestrator and its developer',
  execute: async (params: Record<string, any>) => {
    try {
      if (!orchestrator) {
        return {
          success: false,
          error: 'Orchestrator reference not available',
        };
      }

      const metadata = orchestrator.getMetadata();
      const orchestratorId = orchestrator.getId();
      const orchestratorName = orchestrator.getName();

      const info: any = {
        success: true,
        orchestrator: {
          id: orchestratorId,
          name: orchestratorName,
          type: orchestrator.getType(),
        },
        timestamp: Date.now(),
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
      logger.error({ err: error }, 'Get orchestrator info failed');
      return {
        success: false,
        error: error.message,
      };
    }
  },
});
