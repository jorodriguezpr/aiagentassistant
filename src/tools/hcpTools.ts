/**
 * AI Agent Assistant (AiAgentAssistant)
 * HCP Tools - Tool definitions for bridging to the SysAdminHCP control panel
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

// Local copy of the AITool shape (not imported from ../utils/AITools) to avoid a
// circular import — AITools.ts imports HCP_TOOLS from here.
interface HcpTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const HCP_TOOLS: HcpTool[] = [
  {
    name: 'hcp_get_system_health',
    description: 'Get the SysAdminHCP control panel\'s system health: service status (Apache, MySQL, qmail, Dovecot, etc.), disk usage, memory, and CPU.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hcp_list_tickets',
    description: 'List support tickets from the SysAdminHCP control panel.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status, e.g. "open" or "answered". Omit for all tickets.',
        },
      },
    },
  },
  {
    name: 'hcp_get_ticket',
    description: 'Get a single support ticket\'s full detail, including its replies, from the SysAdminHCP control panel.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ticket ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'hcp_list_clients',
    description: 'List hosting clients from the SysAdminHCP control panel.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hcp_get_intrusion_activity',
    description: 'Get recent intrusion detection activity from the SysAdminHCP control panel: attack attempts, top attackers, and currently blocked IPs.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];
