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

  // ─── Actions — each requires the admin to have created a matching active
  // delegation in the panel's Autonomous Mode page with the specific action
  // flag enabled. Without one, these return {success:false, error:'not_delegated'}
  // instead of acting. See src/utils/AutonomousState.ts.

  {
    name: 'hcp_reply_ticket',
    description: 'Reply to a support ticket on the SysAdminHCP control panel, on the admin\'s behalf. Requires a "tickets" delegation with autoReplyTickets enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ticket ID' },
        message: { type: 'string', description: 'The reply text' },
      },
      required: ['id', 'message'],
    },
  },
  {
    name: 'hcp_update_ticket_status',
    description: 'Change a support ticket\'s status (e.g. to "answered" or "closed") on the SysAdminHCP control panel. Requires a "tickets" delegation with autoUpdateTicketStatus enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ticket ID' },
        status: { type: 'string', description: 'New status, e.g. "open", "answered", "closed"' },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'hcp_restart_service',
    description: 'Restart a system service (Apache, MySQL, qmail, Dovecot, etc.) on the SysAdminHCP control panel. Requires a "services" delegation with autoRestartServices enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        serviceType: { type: 'string', description: 'Service category, e.g. "web", "database", "mail"' },
        driverName: { type: 'string', description: 'Specific driver/service name, e.g. "apache", "mysql", "qmail"' },
      },
      required: ['serviceType', 'driverName'],
    },
  },
  {
    name: 'hcp_suspend_client',
    description: 'Suspend a hosting client account on the SysAdminHCP control panel, blocking their access. Requires a "clients" delegation with autoSuspendClients enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The client\'s username' },
      },
      required: ['username'],
    },
  },
  {
    name: 'hcp_unsuspend_client',
    description: 'Unsuspend a previously suspended hosting client account on the SysAdminHCP control panel. Requires a "clients" delegation with autoSuspendClients enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The client\'s username' },
      },
      required: ['username'],
    },
  },

  // ─── Notification — not delegation-gated. Sending a heads-up to the admin
  // is observation, not action, matching the Notification-vs-Action split.

  {
    name: 'hcp_notify_admin',
    description: 'Push a bell notification to the SysAdminHCP admin panel to flag something noteworthy. Use for anything the admin should know about but that doesn\'t require immediate delegated action.',
    parameters: {
      type: 'object',
      properties: {
        severity: { type: 'string', description: '"info", "warning", or "critical"' },
        title: { type: 'string', description: 'Short notification title' },
        message: { type: 'string', description: 'Notification body' },
      },
      required: ['severity', 'title', 'message'],
    },
  },
];
