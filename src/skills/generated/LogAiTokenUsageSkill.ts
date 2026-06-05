/**
 * AI Agent Assistant (AiAgentAssistant)
 * Token Usage Monitoring Skill - AI token tracking
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';
import { Skill } from '../../types';

/**
 * LogAiTokenUsageSkill - Monitor and track AI token usage by provider
 * 
 * This skill provides comprehensive token usage monitoring including:
 * - Logging token usage by provider (OpenAI, GitHub Copilot, Anthropic, Gemini)
 * - Persistent storage of usage statistics
 * - Retrieval and reporting capabilities
 * - Historical tracking with timestamps
 */

// Storage file for token usage
const tokenUsageFile = path.join(process.cwd(), 'data', 'token-usage.json');

// Ensure data directory exists
const dataDir = path.dirname(tokenUsageFile);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  logger.info({ dir: dataDir }, '📁 Created token usage data directory');
}

/**
 * Token usage data structure
 */
interface TokenUsageEntry {
  timestamp: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  operation?: string;
}

interface TokenUsageStats {
  providers: Record<string, {
    totalRequests: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    models: Record<string, {
      requests: number;
      tokens: number;
    }>;
  }>;
  entries: TokenUsageEntry[];
  lastUpdated: string;
}

/**
 * Load token usage data from file
 */
function loadTokenUsage(): TokenUsageStats {
  try {
    if (fs.existsSync(tokenUsageFile)) {
      const data = fs.readFileSync(tokenUsageFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Failed to load token usage data, starting fresh');
  }

  // Return empty structure
  return {
    providers: {},
    entries: [],
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Save token usage data to file
 */
function saveTokenUsage(data: TokenUsageStats): void {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(tokenUsageFile, JSON.stringify(data, null, 2), 'utf-8');
    logger.debug('Token usage data saved');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to save token usage data');
  }
}

/**
 * Log AI token usage
 */
export const logAiTokenUsageSkill: Skill = {
  name: 'logAiTokenUsage',
  description: 'Log AI token usage by provider for monitoring and analysis. Tracks prompt tokens, completion tokens, and total usage.',
  execute: async (args: any) => {
    try {
      const { provider, model, promptTokens = 0, completionTokens = 0, totalTokens, operation } = args;

      logger.info({ provider, model, totalTokens }, '📊 Logging AI token usage');

      // Load current data
      const data = loadTokenUsage();

      // Create entry
      const entry: TokenUsageEntry = {
        timestamp: new Date().toISOString(),
        provider,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        operation
      };

      // Add to entries
      data.entries.push(entry);

      // Update provider stats
      if (!data.providers[provider]) {
        data.providers[provider] = {
          totalRequests: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          models: {}
        };
      }

      const providerStats = data.providers[provider];
      providerStats.totalRequests++;
      providerStats.totalPromptTokens += promptTokens;
      providerStats.totalCompletionTokens += completionTokens;
      providerStats.totalTokens += totalTokens;

      // Update model stats
      if (!providerStats.models[model]) {
        providerStats.models[model] = {
          requests: 0,
          tokens: 0
        };
      }

      providerStats.models[model].requests++;
      providerStats.models[model].tokens += totalTokens;

      // Save updated data
      saveTokenUsage(data);

      return {
        success: true,
        message: `Token usage logged: ${totalTokens} tokens (${promptTokens} prompt + ${completionTokens} completion)`,
        provider,
        model,
        totalTokens,
        currentStats: providerStats
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to log token usage');
      return {
        success: false,
        error: error.message || 'Failed to log token usage'
      };
    }
  }
};

/**
 * Get AI token usage statistics
 */
export const getAiTokenUsageSkill: Skill = {
  name: 'getAiTokenUsage',
  description: 'Get AI token usage statistics and historical data. Can filter by provider, model, or time period.',
  execute: async (args: any = {}) => {
    try {
      const { provider, model, since, limit = 100 } = args;

      logger.info({ provider, model, since, limit }, '📊 Retrieving token usage statistics');

      // Load data
      const data = loadTokenUsage();

      // Filter entries
      let filteredEntries = data.entries;

      if (provider) {
        filteredEntries = filteredEntries.filter(e => e.provider === provider);
      }

      if (model) {
        filteredEntries = filteredEntries.filter(e => e.model === model);
      }

      if (since) {
        const sinceDate = new Date(since);
        filteredEntries = filteredEntries.filter(e => new Date(e.timestamp) >= sinceDate);
      }

      // Get recent entries
      const recentEntries = filteredEntries.slice(-limit);

      // Calculate filtered stats
      const stats = {
        totalEntries: filteredEntries.length,
        totalTokens: filteredEntries.reduce((sum, e) => sum + e.totalTokens, 0),
        totalPromptTokens: filteredEntries.reduce((sum, e) => sum + e.promptTokens, 0),
        totalCompletionTokens: filteredEntries.reduce((sum, e) => sum + e.completionTokens, 0),
        byProvider: {} as Record<string, number>,
        byModel: {} as Record<string, number>
      };

      // Aggregate by provider and model
      filteredEntries.forEach(entry => {
        stats.byProvider[entry.provider] = (stats.byProvider[entry.provider] || 0) + entry.totalTokens;
        stats.byModel[entry.model] = (stats.byModel[entry.model] || 0) + entry.totalTokens;
      });

      return {
        success: true,
        stats,
        recentEntries,
        allProviders: data.providers,
        lastUpdated: data.lastUpdated
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to retrieve token usage');
      return {
        success: false,
        error: error.message || 'Failed to retrieve token usage'
      };
    }
  }
};

/**
 * Reset AI token usage statistics
 */
export const resetAiTokenUsageSkill: Skill = {
  name: 'resetAiTokenUsage',
  description: 'Reset AI token usage statistics. Use with caution - this clears all historical data.',
  execute: async (args: any) => {
    try {
      if (!args.confirm) {
        return {
          success: false,
          error: 'Reset not confirmed. Set confirm: true to reset token usage data.'
        };
      }

      logger.warn('🗑️ Resetting token usage data');

      // Create backup
      if (fs.existsSync(tokenUsageFile)) {
        const backupFile = tokenUsageFile.replace('.json', `-backup-${Date.now()}.json`);
        fs.copyFileSync(tokenUsageFile, backupFile);
        logger.info({ backupFile }, 'Created backup before reset');
      }

      // Reset data
      const emptyData: TokenUsageStats = {
        providers: {},
        entries: [],
        lastUpdated: new Date().toISOString()
      };

      saveTokenUsage(emptyData);

      return {
        success: true,
        message: 'Token usage statistics have been reset. A backup was created.'
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to reset token usage');
      return {
        success: false,
        error: error.message || 'Failed to reset token usage'
      };
    }
  }
};

/**
 * Export usage report
 */
export const exportAiTokenUsageSkill: Skill = {
  name: 'exportAiTokenUsage',
  description: 'Export AI token usage statistics to a formatted report file (JSON or CSV).',
  execute: async (args: any) => {
    try {
      const { format, outputPath } = args;

      logger.info({ format, outputPath }, '📄 Exporting token usage report');

      // Load data
      const data = loadTokenUsage();

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const defaultPath = path.join(dataDir, `token-usage-report-${timestamp}.${format}`);
      const exportPath = outputPath || defaultPath;

      if (format === 'json') {
        // Export as JSON
        fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf-8');
      } else if (format === 'csv') {
        // Export as CSV
        const csvLines = [
          'Timestamp,Provider,Model,Prompt Tokens,Completion Tokens,Total Tokens,Operation'
        ];

        data.entries.forEach(entry => {
          csvLines.push(
            `${entry.timestamp},${entry.provider},${entry.model},${entry.promptTokens},${entry.completionTokens},${entry.totalTokens},${entry.operation || ''}`
          );
        });

        fs.writeFileSync(exportPath, csvLines.join('\n'), 'utf-8');
      } else {
        return {
          success: false,
          error: 'Invalid format. Use "json" or "csv".'
        };
      }

      return {
        success: true,
        message: `Token usage report exported to ${exportPath}`,
        exportPath,
        format,
        entryCount: data.entries.length
      };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Failed to export token usage');
      return {
        success: false,
        error: error.message || 'Failed to export token usage'
      };
    }
  }
};
