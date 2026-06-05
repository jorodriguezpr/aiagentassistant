/**
 * AI Agent Assistant (AiAgentAssistant)
 * AI Provider - Unified interface for multiple AI providers
 * Supports: Anthropic Claude, OpenAI, GitHub Copilot, Google Gemini, Ollama, Lemonade, and Ollama Cloud
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import axios, { AxiosInstance } from 'axios';
import logger from './logger';
import { logAiTokenUsageSkill } from '../skills/generated/LogAiTokenUsageSkill';
import { CORE_TOOL_NAMES, MAX_TOOLS, TOOL_CATEGORIES } from '../tools/domains';

/**
 * AI Provider Interface
 * Unified interface for multiple AI providers
 */
export interface AIProviderConfig {
  provider: 'github-copilot' | 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'lemonade' | 'ollama-cloud';
  apiKey: string;
  model?: string;
  baseURL?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface AITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  toolCalls?: ToolCall[];
}

/**
 * AIProvider: Unified AI provider with multi-model support
 * Primary: Anthropic Claude 3/4 (2026) - Recommended for accuracy and reasoning
 * 
 * Available Anthropic Models (2026):
 * - claude-opus-4-7: Most capable, best for complex reasoning & agents (★ RECOMMENDED)
 * - claude-sonnet-4-6: Best balance of speed & intelligence (fast, cost-effective)
 * - claude-haiku-4-5: Fastest & most cost-efficient (near-frontier intelligence)
 * - claude-opus-4-6: Previous generation (still available)
 * 
 * Model Pricing (per 1M tokens):
 * - Opus 4.7: $5 input, $25 output | Context: 1M | Max output: 128k
 * - Sonnet 4.6: $3 input, $15 output | Context: 1M | Max output: 64k
 * - Haiku 4.5: $1 input, $5 output | Context: 200k | Max output: 64k
 * 
 * Alternative Providers:
 * - GitHub Models: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo
 * - OpenAI: gpt-4-turbo, gpt-4, gpt-3.5-turbo
 * - Google Gemini: gemini-pro
 * - Ollama: Local LLMs (qwen2.5-coder:latest, llama3, mistral, codellama, etc.)
 * 
 * Configuration: Set AI_PROVIDER and AI_API_KEY environment variables
 * Example: AI_PROVIDER=anthropic, ANTHROPIC_API_KEY=sk-ant-...
 * For Ollama: AI_PROVIDER=ollama, AI_MODEL=qwen2.5-coder:latest, OLLAMA_BASE_URL=http://172.27.112.1:11434
 */
export class AIProvider {
  private client: AxiosInstance;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = {
      maxTokens: 2000,
      temperature: 0.7,
      ...config,
    };

    // Set base URL based on provider
    const baseURL = this.getBaseURL();
    
    // Set headers based on provider
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.provider === 'github-copilot') {
      // GitHub Models uses different auth header
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      headers['api-key'] = this.config.apiKey;
    } else if (this.config.provider === 'anthropic') {
      // Anthropic uses x-api-key header, not Authorization
      headers['x-api-key'] = this.config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (this.config.provider === 'ollama' || this.config.provider === 'lemonade') {
      // Ollama (local) and Lemonade don't require API key for local instances
      // No auth header needed
    } else {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    this.client = axios.create({
      baseURL,
      headers,
      timeout: 180000, // 3 minutes (increased for local Ollama models)
    });

    logger.info({ provider: this.config.provider, model: this.config.model }, 'AI Provider initialized');
  }

  /**
   * Get base URL for provider
   */
  private getBaseURL(): string {
    if (this.config.baseURL) {
      return this.config.baseURL;
    }

    switch (this.config.provider) {
      case 'github-copilot':
        return 'https://models.inference.ai.azure.com';
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      case 'gemini':
        return 'https://generativelanguage.googleapis.com/v1';
      case 'ollama':
        return 'http://172.27.112.1:11434'; // Default local Ollama instance
      case 'lemonade':
        return 'http://localhost:8000'; // Default local Lemonade server
      case 'ollama-cloud':
        return 'https://ollama.com'; // Ollama cloud API
      default:
        return 'https://api.openai.com/v1';
    }
  }

  /**
   * Get default model for provider
   */
  private getDefaultModel(): string {
    if (this.config.model) {
      return this.config.model;
    }

    switch (this.config.provider) {
      case 'github-copilot':
        // GitHub Models 2026 - Default to gpt-4o (you can also use Claude models)
        return 'gpt-4o'; // Most capable model available
      case 'openai':
        return 'gpt-4-turbo';
      case 'anthropic':
        // 2026 Claude models - latest releases
        return 'claude-opus-4-7'; // Most capable for complex reasoning, agents, and IT automation
      case 'gemini':
        return 'gemini-pro';
      case 'ollama':
        return 'qwen2.5-coder:latest'; // Default Ollama model
      case 'lemonade':
        return 'Qwen2.5-0.5B-Instruct-CPU'; // Default Lemonade model
      case 'ollama-cloud':
        return 'nemotron-3-super'; // Default Ollama cloud model
      default:
        return 'gpt-4-turbo';
    }
  }

  /**
   * Get all available models for the current provider
   */
  getAvailableModels(): string[] {
    switch (this.config.provider) {
      case 'anthropic':
        return [
          'claude-opus-4-7',        // Most capable - best for complex reasoning, coding, IT tasks
          'claude-sonnet-4-6',      // Excellent balance of speed and intelligence
          'claude-haiku-4-5',       // Fastest and most cost-efficient (still near-frontier)
          'claude-opus-4-6',        // Previous generation (still available)
        ];
      case 'github-copilot':
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
      case 'openai':
        return ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
      case 'gemini':
        return ['gemini-pro', 'gemini-pro-vision'];
      default:
        return [];
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Intelligently filter tools based on user query to reduce token usage
   * Only sends relevant tools instead of all 50+ tools
   */
  private filterRelevantTools(userQuery: string, allTools?: AITool[]): AITool[] | undefined {
    if (!allTools || allTools.length === 0) {
      return allTools;
    }

    const query = userQuery.toLowerCase();

    // Imported from domains.ts — single source of truth
    const coreToolNames = CORE_TOOL_NAMES as string[];
    const categories = TOOL_CATEGORIES;

    // Find matching categories with scoring (limit to top 2)
    const matchedToolNames = new Set<string>(coreToolNames);
    
    // Score each category by keyword match length
    const scoredCategories: Array<{ cat: string; score: number; tools: string[] }> = [];
    
    for (const [catName, catData] of Object.entries(categories)) {
      let matchScore = 0;
      
      for (const kw of catData.keywords) {
        if (query.includes(kw)) {
          matchScore += kw.length;  // Longer keywords = more specific
        }
      }
      
      if (matchScore > 0) {
        scoredCategories.push({ cat: catName, score: matchScore, tools: catData.toolNames });
      }
    }
    
    // Take top 2 scoring categories only
    scoredCategories.sort((x, y) => y.score - x.score);
    const topTwo = scoredCategories.slice(0, 2);
    
    // Add tools from top categories
    for (const item of topTwo) {
      for (const toolName of item.tools) {
        matchedToolNames.add(toolName);
      }
      logger.debug({ category: item.cat, toolCount: item.tools.length }, 'Tool category matched');
    }

    // Filter tools based on matched names
    let filteredTools = allTools.filter(tool => matchedToolNames.has(tool.function.name));

    // HARD CAP: Limit tools to prevent socket hang up / token overflow (value from domains.ts)
    if (filteredTools.length > MAX_TOOLS) {
      // Prioritize core tools, then take first N from filtered list
      const coreTools = filteredTools.filter(tool => coreToolNames.includes(tool.function.name));
      const nonCoreTools = filteredTools.filter(tool => !coreToolNames.includes(tool.function.name));
      filteredTools = [...coreTools, ...nonCoreTools.slice(0, MAX_TOOLS - coreTools.length)];
    }

    logger.info({ 
      totalTools: allTools.length, 
      filteredTools: filteredTools.length,
      categories: Array.from(matchedToolNames)
    }, 'Tools filtered for token optimization');

    // If no specific matches, return core tools + a sampling of others (limit to 15 tools max)
    if (filteredTools.length <= coreToolNames.length) {
      const coreTools = allTools.filter(tool => coreToolNames.includes(tool.function.name));
      const otherTools = allTools.filter(tool => !coreToolNames.includes(tool.function.name));
      const sampledOthers = otherTools.slice(0, Math.min(8, otherTools.length)); // 7 core + 8 others = 15 max
      return [...coreTools, ...sampledOthers];
    }

    return filteredTools;
  }

  /**
   * Extract retry-after header (respects server's backoff request)
   */
  private getRetryAfterDelay(error: any): number | null {
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      // Can be in seconds or HTTP-date format
      const delaySeconds = parseInt(retryAfter, 10);
      if (!isNaN(delaySeconds)) {
        return delaySeconds * 1000; // Convert to milliseconds
      }
    }
    return null;
  }

  /**
   * Chat completion with conversation history and optional tools
   * Includes automatic retry logic for rate limits (429) with retry-after support
   */
  async chatCompletion(messages: ChatMessage[], tools?: AITool[]): Promise<ChatCompletionResponse> {
    const maxRetries = 3;
    let lastError: any;

    // Get the user's last message for intelligent tool filtering
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const userQuery = lastUserMessage?.content || '';

    // Intelligently filter tools to reduce token usage
    const filteredTools = this.filterRelevantTools(userQuery, tools);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const model = this.getDefaultModel();
        logger.debug({ 
          provider: this.config.provider, 
          model, 
          messageCount: messages.length, 
          toolsCount: filteredTools?.length,
          originalToolsCount: tools?.length,
          attempt 
        }, 'Sending chat completion request');

        let response;

        switch (this.config.provider) {
          case 'github-copilot':
            response = await this.githubCopilotChat(messages, model, filteredTools);
            break;
          case 'openai':
            response = await this.openAIChat(messages, model);
            break;
          case 'anthropic':
            response = await this.anthropicChat(messages, model, filteredTools);
            break;
          case 'gemini':
            response = await this.geminiChat(messages, model);
            break;
          case 'ollama':
            response = await this.ollamaChat(messages, model, filteredTools);
            break;
          case 'lemonade':
            response = await this.lemonadeChat(messages, model, filteredTools);
            break;
          case 'ollama-cloud':
            response = await this.ollamaCloudChat(messages, model, filteredTools);
            break;
          default:
            throw new Error(`Unsupported provider: ${this.config.provider}`);
        }

        logger.info({ model: response.model, tokens: response.usage?.totalTokens }, 'Chat completion successful');
        
        // Automatically log token usage for monitoring
        if (response.usage) {
          this.logTokenUsage(response.model, response.usage, filteredTools ? 'tool_call' : 'chat').catch(err => {
            logger.warn({ err }, 'Failed to log token usage (non-critical)');
          });
        }
        
        return response;

      } catch (error: any) {
        lastError = error;
        
        // Check if it's a rate limit error (429)
        const isRateLimit = error.response?.status === 429 || error.status === 429;

        // Check if it's a transient network error worth retrying
        const transientCodes = ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'];
        const isTransientError = transientCodes.includes(error.code) ||
          transientCodes.some(c => error.message?.includes(c)) ||
          error.message?.includes('socket hang up');

        if ((isRateLimit || isTransientError) && attempt < maxRetries) {
          // First, check if server provided retry-after
          const serverRetryAfter = isRateLimit ? this.getRetryAfterDelay(error) : null;
          let waitTime = serverRetryAfter || (isTransientError ? attempt * 2000 : Math.pow(2, attempt) * 1000);

          // Cap at 30 seconds to avoid waiting too long
          waitTime = Math.min(waitTime, 30000);

          logger.warn({
            attempt,
            maxRetries,
            waitTime,
            provider: this.config.provider,
            serverRetryAfter,
            errorCode: error.code,
            isTransientError,
            isRateLimit,
          }, isTransientError ? 'Transient network error, retrying' : 'Rate limit hit, respecting retry-after or exponential backoff');

          await this.sleep(waitTime);
          continue; // Retry
        }
        
        // Log error with details
        logger.error({ 
          err: error, 
          provider: this.config.provider,
          status: error.response?.status,
          errorCode: error.response?.data?.error?.code,
          errorMessage: error.response?.data?.error?.message,
          errorType: error.response?.data?.error?.type,
          errorData: error.response?.data,
          attempt
        }, 'Chat completion failed');
        
        // Check if it's a payload too large error (413)
        const isPayloadTooLarge = error.response?.status === 413 || error.status === 413;
        if (isPayloadTooLarge) {
          throw new Error('REQUEST_TOO_LARGE: Request payload exceeds model token limit. Tool filtering applied but still too large. Try a simpler query.');
        }
        
        // Enhance error message for rate limits
        if (isRateLimit) {
          throw new Error('RATE_LIMIT: Too many requests to AI service. Please wait a moment and try again.');
        }
        
        // Use the actual error message from the API if available (e.g., credit errors, API errors)
        const actualErrorMessage = error.response?.data?.error?.message || error.message;
        throw new Error(actualErrorMessage);
      }
    }

    // Should never reach here, but just in case
    throw lastError;
  }

  /**
   * GitHub Models API (Azure-backed) - Now uses new endpoint at github.models.ai/inference
   * Deprecated Azure endpoint is being sunset Oct 17, 2025
   */
  private async githubCopilotChat(messages: ChatMessage[], model: string, tools?: AITool[]): Promise<ChatCompletionResponse> {
    try {
      const requestBody: any = {
        model,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: false,
      };

      // Add tools if provided
      if (tools && tools.length > 0) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
      }

      const response = await this.client.post('/chat/completions', requestBody);

      const choice = response.data.choices[0];
      const message = choice.message;

      return {
        content: message.content || '',
        model: response.data.model,
        usage: {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens,
        },
        finishReason: choice.finish_reason,
        toolCalls: message.tool_calls,
      };
    } catch (error: any) {
      // Enhanced error logging with migration guidance
      const isDeprecationError = error.response?.status === 400 && 
        this.client.defaults.baseURL?.includes('models.inference.ai.azure.com');
      
      logger.error({ 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        model,
        endpoint: '/chat/completions',
        deprecationWarning: isDeprecationError ? 'Azure endpoint is deprecated' : undefined
      }, 'GitHub Models API error');
      throw error;
    }
  }

  /**
   * OpenAI Chat API
   */
  private async openAIChat(messages: ChatMessage[], model: string): Promise<ChatCompletionResponse> {
    const response = await this.client.post('/chat/completions', {
      model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    return {
      content: response.data.choices[0].message.content,
      model: response.data.model,
      usage: {
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens,
      },
      finishReason: response.data.choices[0].finish_reason,
    };
  }

  /**
   * Anthropic Claude API with tool calling support
   */
  private async anthropicChat(messages: ChatMessage[], model: string, tools?: AITool[]): Promise<ChatCompletionResponse> {
    // Claude uses a different format
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Convert messages to Anthropic format (handle tool responses)
    const anthropicMessages = conversationMessages.map(msg => {
      if (msg.role === 'tool') {
        // Tool results in Anthropic format
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: msg.tool_call_id,
              content: msg.content,
            },
          ],
        };
      } else if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Assistant message with tool calls
        return {
          role: 'assistant' as const,
          content: [
            ...(msg.content ? [{ type: 'text' as const, text: msg.content }] : []),
            ...msg.tool_calls.map(tc => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            })),
          ],
        };
      } else {
        // Regular message
        return {
          role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: msg.content,
        };
      }
    });

    const requestBody: any = {
      model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemMessage,
      messages: anthropicMessages,
    };

    // Add tools if provided (Anthropic format)
    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    // 🔍 DEBUG: Log message structure before sending to Claude
    logger.info({
      messageCount: anthropicMessages.length,
      messages: anthropicMessages.map((m, i) => ({
        index: i,
        role: m.role,
        contentType: typeof m.content,
        contentPreview: typeof m.content === 'string' ? m.content.substring(0, 100) : 'array'
      }))
    }, '🔍 Sending to Claude API');

    const response = await this.client.post('/messages', requestBody);

    // Extract tool calls from response
    const toolCalls: ToolCall[] = [];
    let textContent = '';

    for (const block of response.data.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content: textContent,
      model: response.data.model,
      usage: {
        promptTokens: response.data.usage.input_tokens,
        completionTokens: response.data.usage.output_tokens,
        totalTokens: response.data.usage.input_tokens + response.data.usage.output_tokens,
      },
      finishReason: response.data.stop_reason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Google Gemini API
   */
  private async geminiChat(messages: ChatMessage[], model: string): Promise<ChatCompletionResponse> {
    // Gemini uses a different format
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const response = await this.client.post(`/models/${model}:generateContent`, {
      contents,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      },
    });

    return {
      content: response.data.candidates[0].content.parts[0].text,
      model,
      usage: {
        promptTokens: response.data.usageMetadata?.promptTokenCount || 0,
        completionTokens: response.data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.data.usageMetadata?.totalTokenCount || 0,
      },
      finishReason: response.data.candidates[0].finishReason,
    };
  }

  /**
   * Ollama local LLM API with tool calling support
   */
  private async ollamaChat(messages: ChatMessage[], model: string, tools?: AITool[]): Promise<ChatCompletionResponse> {
    return this._ollamaCompatibleChat(messages, model, tools, 'ollama');
  }

  /**
   * Lemonade Chat API (OpenAI-compatible local LLM server)
   */
  private async lemonadeChat(messages: ChatMessage[], model: string, tools?: AITool[]): Promise<ChatCompletionResponse> {
    // Lemonade models have small context windows (~2048 tokens).
    // The agent system prompt alone is ~1300 tokens, so drop it and all history.
    // Only send the last user message and cap output at 256 tokens to stay within context.
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const trimmedMessages: ChatMessage[] = lastUserMessage ? [lastUserMessage] : messages.slice(-1);
    const safeMaxTokens = Math.min(this.config.maxTokens || 2000, 256);

    const requestBody: any = {
      model,
      messages: trimmedMessages,
      max_tokens: safeMaxTokens,
      temperature: this.config.temperature,
      stream: false,
    };

    logger.info({
      messageCount: trimmedMessages.length,
      originalCount: messages.length,
      model,
      safeMaxTokens,
    }, '🍋 Sending to Lemonade API');

    const response = await this.client.post('/v1/chat/completions', requestBody);

    const choice = response.data.choices[0];
    const message = choice.message;

    return {
      content: message.content || '',
      model: response.data.model,
      usage: {
        promptTokens: response.data.usage?.prompt_tokens || 0,
        completionTokens: response.data.usage?.completion_tokens || 0,
        totalTokens: response.data.usage?.total_tokens || 0,
      },
      finishReason: choice.finish_reason,
      toolCalls: message.tool_calls,
    };
  }

  /**
   * Ollama Cloud API — hosted at ollama.com, Bearer auth.
   * Uses the OpenAI-compatible /v1/chat/completions endpoint (same as local Ollama v0.2+).
   */
  private async ollamaCloudChat(messages: ChatMessage[], model: string, tools?: AITool[]): Promise<ChatCompletionResponse> {
    return this._ollamaCompatibleChat(messages, model, tools, 'ollama-cloud');
  }

  /**
   * Shared OpenAI-compatible implementation for both local Ollama and Ollama Cloud.
   * Both expose /v1/chat/completions with standard tool_calls support.
   */
  private async _ollamaCompatibleChat(
    messages: ChatMessage[],
    model: string,
    tools: AITool[] | undefined,
    variant: 'ollama' | 'ollama-cloud'
  ): Promise<ChatCompletionResponse> {
    // Convert internal message format to OpenAI-compatible format
    const apiMessages = messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content,
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        };
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        return {
          role: 'assistant' as const,
          content: msg.content || null,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        };
      }
      return { role: msg.role as 'system' | 'user' | 'assistant', content: msg.content };
    });

    const requestBody: any = {
      model,
      messages: apiMessages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: false,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }));
      requestBody.tool_choice = 'auto';
    }

    const label = variant === 'ollama-cloud' ? '☁️ Ollama Cloud' : '🔍 Ollama';
    logger.info({ messageCount: apiMessages.length, model, toolsCount: tools?.length || 0 }, `${label} API request`);

    const response = await this.client.post('/v1/chat/completions', requestBody);

    const choice = response.data.choices?.[0];
    const message = choice?.message || {};

    // Parse tool calls — arguments may arrive as object or string depending on model
    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        toolCalls.push({
          id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments),
          },
        });
      }
    }

    return {
      content: message.content || '',
      model: response.data.model || model,
      usage: {
        promptTokens: response.data.usage?.prompt_tokens || 0,
        completionTokens: response.data.usage?.completion_tokens || 0,
        totalTokens: response.data.usage?.total_tokens || 0,
      },
      finishReason: choice?.finish_reason || 'stop',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Simple text completion (single message)
   */
  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: ChatMessage[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    const response = await this.chatCompletion(messages);
    return response.content;
  }

  /**
   * Change model at runtime
   */
  setModel(model: string): void {
    this.config.model = model;
    logger.info({ model }, 'Model changed');
  }

  /**
   * Get current configuration
   */
  getConfig(): Partial<AIProviderConfig> {
    return {
      provider: this.config.provider,
      model: this.config.model || this.getDefaultModel(),
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };
  }

  /**
   * Automatically log token usage for monitoring
   * Non-blocking operation - failures are logged but don't affect the main flow
   */
  private async logTokenUsage(
    model: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    operation: string
  ): Promise<void> {
    try {
      await logAiTokenUsageSkill.execute({
        provider: this.config.provider,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        operation,
      });
      
      logger.debug({ 
        provider: this.config.provider, 
        model, 
        tokens: usage.totalTokens 
      }, 'Token usage logged');
    } catch (error: any) {
      // Don't let logging failures affect the main request
      logger.warn({ 
        err: error.message, 
        provider: this.config.provider, 
        model 
      }, 'Failed to log token usage');
    }
  }
}

/**
 * Create AI Provider from environment variables
 */
export function createAIProviderFromEnv(): AIProvider | null {
  const provider = (process.env.AI_PROVIDER || 'anthropic') as AIProviderConfig['provider'];

  // Resolve API key per-provider (ollama-cloud uses its own key env var)
  let apiKey = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GITHUB_COPILOT_API_KEY;
  if (provider === 'ollama-cloud') {
    apiKey = process.env.OLLAMA_CLOUD_API_KEY || apiKey;
  }

  // Local providers (ollama, lemonade) don't require an API key; all others do
  const localProviders: AIProviderConfig['provider'][] = ['ollama', 'lemonade'];
  if (!localProviders.includes(provider) && !apiKey) {
    logger.warn('No AI API key found in environment. AI features disabled.');
    return null;
  }

  // Determine base URL based on provider
  let baseURL: string | undefined;
  if (provider === 'ollama') {
    baseURL = process.env.OLLAMA_BASE_URL;
  } else if (provider === 'lemonade') {
    baseURL = process.env.LEMONADE_BASE_URL;
  } else if (provider === 'ollama-cloud') {
    baseURL = process.env.OLLAMA_CLOUD_BASE_URL; // optional override
  }

  return new AIProvider({
    provider,
    apiKey: apiKey || 'not-required', // Local providers don't need API key
    model: process.env.AI_MODEL,
    baseURL,
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
  });
}
