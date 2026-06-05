/**
 * AI Agent Assistant (AiAgentAssistant)
 * Example Skills - Demonstration skills
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { Skill } from '../types';

/**
 * Example Skills for demonstration
 * These can be easily copied and modified for custom use cases
 */

export const echoSkill: Skill = {
  name: 'echo',
  description: 'Echo the provided message',
  execute: async (params: Record<string, any>) => {
    const message = params.message || 'No message provided';
    return {
      echoed: message,
      timestamp: Date.now(),
    };
  },
};

export const weatherSkill: Skill = {
  name: 'getWeather',
  description: 'Get weather information for a location',
  execute: async (params: Record<string, any>) => {
    const location = params.location || 'Unknown';
    // This is a mock implementation
    // In production, integrate with a real weather API
    return {
      location,
      temperature: Math.random() * 30 + 10, // Random temp between 10-40°C
      condition: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
      timestamp: Date.now(),
    };
  },
};

export const calculatorSkill: Skill = {
  name: 'calculate',
  description: 'Perform basic mathematical operations',
  execute: async (params: Record<string, any>) => {
    const operation = params.operation || 'add';
    const a = parseFloat(params.a) || 0;
    const b = parseFloat(params.b) || 0;

    let result = 0;
    switch (operation.toLowerCase()) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        result = b !== 0 ? a / b : NaN;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return {
      operation,
      a,
      b,
      result,
      timestamp: Date.now(),
    };
  },
};

export const dataProcessingSkill: Skill = {
  name: 'processData',
  description: 'Process and transform data',
  execute: async (params: Record<string, any>) => {
    const data = params.data || [];
    const action = params.action || 'count';

    let result: any;

    switch (action.toLowerCase()) {
      case 'count':
        result = Array.isArray(data) ? data.length : 0;
        break;
      case 'sum':
        result = Array.isArray(data)
          ? data.reduce((acc: number, val: number) => acc + (val || 0), 0)
          : 0;
        break;
      case 'average':
        result = Array.isArray(data) && data.length > 0
          ? data.reduce((acc: number, val: number) => acc + (val || 0), 0) / data.length
          : 0;
        break;
      case 'filter':
        const filterValue = params.filterValue;
        result = Array.isArray(data)
          ? data.filter((item: any) => item !== filterValue)
          : [];
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return {
      action,
      originalCount: Array.isArray(data) ? data.length : 0,
      result,
      timestamp: Date.now(),
    };
  },
};

export const notificationSkill: Skill = {
  name: 'sendNotification',
  description: 'Send a notification (mock)',
  execute: async (params: Record<string, any>) => {
    const message = params.message || '';
    const channel = params.channel || 'default';
    const priority = params.priority || 'normal';

    // In production, integrate with Slack, PagerDuty, etc.
    return {
      success: true,
      message,
      channel,
      priority,
      sentAt: Date.now(),
    };
  },
};

export const delaySkill: Skill = {
  name: 'delay',
  description: 'Delay execution for a specified duration',
  execute: async (params: Record<string, any>) => {
    const duration = parseFloat(params.duration) || 1000;

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          delayedFor: duration,
          completedAt: Date.now(),
        });
      }, duration);
    });
  },
};

export const queryDatabaseSkill: Skill = {
  name: 'queryDatabase',
  description: 'Query a database (mock)',
  execute: async (params: Record<string, any>) => {
    const query = params.query || '';
    const database = params.database || 'default';

    // Mock database response
    return {
      success: true,
      database,
      query,
      rows: [
        { id: 1, name: 'Row 1', value: 'Value 1' },
        { id: 2, name: 'Row 2', value: 'Value 2' },
      ],
      timestamp: Date.now(),
    };
  },
};

export const executeCommandSkill: Skill = {
  name: 'executeCommand',
  description: 'Execute a system command (for scheduled automation)',
  execute: async (params: Record<string, any>) => {
    const command = params.command || '';
    
    if (!command) {
      return {
        success: false,
        error: 'No command provided',
        timestamp: Date.now(),
      };
    }
    
    // For security: This is a placeholder for scheduled command execution
    // In production, this should:
    // 1. Validate commands against a whitelist
    // 2. Run in a sandboxed environment
    // 3. Have proper logging and monitoring
    // 4. Use child_process.exec with timeout
    
    // For now, return success (actual execution would be implemented based on security requirements)
    return {
      success: true,
      command,
      message: `Command queued for execution: ${command}`,
      note: 'Command execution is placeholder - implement with proper security controls',
      timestamp: Date.now(),
    };
  },
};

export default {
  echoSkill,
  weatherSkill,
  calculatorSkill,
  dataProcessingSkill,
  notificationSkill,
  delaySkill,
  queryDatabaseSkill,
  executeCommandSkill,
};
