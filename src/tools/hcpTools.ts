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
    name: 'hcp_search_docs',
    description:
      "Search SysAdminHCP's own documentation — FAQ, Wiki/manual, user manuals, editions & pricing, feature list, and API reference — to answer questions about the product itself: what it does, how to install/configure/use a feature, what's included in Free vs Pro vs Pro+Support, and how its API works. ALWAYS use this FIRST for any question that is really about how SysAdminHCP works or what it supports, before trying to reverse-engineer the answer through live system investigation — it is faster and more accurate than guessing or exploring.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "how to install", "backup schedule", "AI Agent Pro feature", "license activation", "API mail endpoints"' },
      },
      required: ['query'],
    },
  },
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
  {
    name: 'hcp_get_backup_health',
    description: 'Get the SysAdminHCP control panel\'s backup health: when the last backup ran, whether a schedule is configured, whether backups are overdue, recent failures, and backup disk usage.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hcp_get_dns_zone',
    description: 'Get a domain\'s DNS zone from the SysAdminHCP control panel: every record (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA) with its id, hostname, type, value, TTL, priority, and weight. Use this before adding/updating/deleting a record to find the right record id and confirm current values.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'The domain, e.g. "example.com"' },
      },
      required: ['domainName'],
    },
  },
  {
    name: 'hcp_get_mail_domain',
    description: 'Get a mail domain\'s full detail from the SysAdminHCP control panel: its mail accounts (mailboxes), catch-all address, forwards/aliases, mailing lists, and DKIM status. Use this before any mail account action to see current accounts and confirm exact usernames.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'The mail domain, e.g. "example.com"' },
      },
      required: ['domainName'],
    },
  },
  {
    name: 'hcp_list_databases',
    description: 'List MySQL databases (and optionally database users) configured on the SysAdminHCP control panel.',
    parameters: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'Filter by hosting client username. Omit for all.' },
        includeUsers: { type: 'boolean', description: 'Also list database users. Defaults to false.' },
      },
    },
  },
  {
    name: 'hcp_list_ftp_accounts',
    description: 'List FTP accounts configured on the SysAdminHCP control panel.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'Filter by domain. Omit for all.' },
      },
    },
  },
  {
    name: 'hcp_list_ssl_certificates',
    description: 'List Let\'s Encrypt SSL certificates issued on the SysAdminHCP control panel, with their domains and expiry.',
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
  {
    name: 'hcp_retry_backup',
    description: 'Start a new full backup on the SysAdminHCP control panel. Use when backup health shows overdue or failed. Requires a "backup" delegation with autoRetryBackup enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hcp_add_dns_record',
    description: 'Add a new DNS record to a domain\'s zone on the SysAdminHCP control panel. This changes live DNS immediately. Requires a "dns" delegation with autoManageDnsRecords enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'The domain the zone belongs to, e.g. "example.com"' },
        recordType: { type: 'string', description: 'A, AAAA, CNAME, MX, TXT, NS, SRV, or CAA' },
        hostname: { type: 'string', description: 'The subdomain/host part, e.g. "cp" for cp.example.com, or "@" for the bare domain' },
        content: { type: 'string', description: 'The record value (IP for A/AAAA, hostname for CNAME/MX, text for TXT, etc.)' },
        ttl: { type: 'number', description: 'Time-to-live in seconds. Defaults to 3600 if omitted.' },
        priority: { type: 'number', description: 'Priority, only meaningful for MX/SRV. Defaults to 0.' },
        weight: { type: 'number', description: 'Weight, only meaningful for SRV. Defaults to 0.' },
      },
      required: ['domainName', 'recordType', 'hostname', 'content'],
    },
  },
  {
    name: 'hcp_update_dns_record',
    description: 'Update an existing DNS record on the SysAdminHCP control panel. Look up the record id first with hcp_get_dns_zone. This changes live DNS immediately. Requires a "dns" delegation with autoManageDnsRecords enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'The domain the zone belongs to' },
        recordId: { type: 'string', description: 'The record\'s id, from hcp_get_dns_zone' },
        recordType: { type: 'string', description: 'New record type, if changing it' },
        hostname: { type: 'string', description: 'New hostname/host part, if changing it' },
        content: { type: 'string', description: 'New record value, if changing it' },
        ttl: { type: 'number', description: 'New TTL in seconds, if changing it' },
        priority: { type: 'number', description: 'New priority, if changing it' },
        weight: { type: 'number', description: 'New weight, if changing it' },
      },
      required: ['domainName', 'recordId'],
    },
  },
  {
    name: 'hcp_delete_dns_record',
    description: 'Delete a DNS record from a domain\'s zone on the SysAdminHCP control panel. Look up the record id first with hcp_get_dns_zone. This changes live DNS immediately and cannot be undone. Requires a "dns" delegation with autoManageDnsRecords enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'The domain the zone belongs to' },
        recordId: { type: 'string', description: 'The record\'s id, from hcp_get_dns_zone' },
      },
      required: ['domainName', 'recordId'],
    },
  },

  {
    name: 'hcp_create_mail_account',
    description: 'Create a new mailbox on a mail domain on the SysAdminHCP control panel. Requires a "mail" delegation with autoManageMailAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The mailbox\'s local part, e.g. "john" for john@example.com' },
        domainName: { type: 'string', description: 'The mail domain, e.g. "example.com"' },
        password: { type: 'string', description: 'The mailbox password' },
        quota: { type: 'number', description: 'Quota in MB. Defaults to 100 if omitted.' },
      },
      required: ['username', 'domainName', 'password'],
    },
  },
  {
    name: 'hcp_delete_mail_account',
    description: 'Delete a mailbox on the SysAdminHCP control panel. This cannot be undone — the mailbox and its stored mail are removed. Requires a "mail" delegation with autoManageMailAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The mailbox\'s username, as shown by hcp_get_mail_domain (usually the local part without @domain)' },
      },
      required: ['username'],
    },
  },
  {
    name: 'hcp_change_mail_password',
    description: 'Reset/change a mailbox\'s password on the SysAdminHCP control panel — the most common client support request. Requires a "mail" delegation with autoManageMailAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The mailbox\'s username, as shown by hcp_get_mail_domain' },
        password: { type: 'string', description: 'The new password' },
      },
      required: ['username', 'password'],
    },
  },
  {
    name: 'hcp_set_mail_quota',
    description: 'Change a mailbox\'s storage quota on the SysAdminHCP control panel. Use when a client reports their mailbox is full. Requires a "mail" delegation with autoManageMailAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The mailbox\'s username, as shown by hcp_get_mail_domain' },
        quota: { type: 'number', description: 'New quota in MB' },
      },
      required: ['username', 'quota'],
    },
  },
  {
    name: 'hcp_toggle_mail_account',
    description: 'Enable or disable a mailbox on the SysAdminHCP control panel, without deleting it. Requires a "mail" delegation with autoManageMailAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The mailbox\'s username, as shown by hcp_get_mail_domain' },
        enable: { type: 'boolean', description: 'true to enable, false to disable' },
      },
      required: ['username', 'enable'],
    },
  },
  {
    name: 'hcp_set_mail_catchall',
    description: 'Set (or clear, by omitting email) the catch-all address for a mail domain on the SysAdminHCP control panel — mail to any non-existent address at the domain is delivered there. Requires a "mail" delegation with autoManageMailAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'The mail domain' },
        email: { type: 'string', description: 'The destination email for the catch-all. Omit to clear/disable the catch-all.' },
      },
      required: ['domainName'],
    },
  },
  {
    name: 'hcp_add_mail_forward',
    description: 'Add a mail forward/alias on the SysAdminHCP control panel — mail to `email` is forwarded to `destination`. The source address does not need to be a real mailbox. Requires a "mail" delegation with autoManageMailAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'The source address to forward from, e.g. "sales@example.com"' },
        destination: { type: 'string', description: 'Where to forward mail to' },
        keepCopy: { type: 'boolean', description: 'If true, also keep a local copy in the mailbox (if one exists). Defaults to false.' },
      },
      required: ['email', 'destination'],
    },
  },
  {
    name: 'hcp_delete_mail_forward',
    description: 'Delete a mail forward/alias on the SysAdminHCP control panel. Requires a "mail" delegation with autoManageMailAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'The forward\'s source address' },
      },
      required: ['email'],
    },
  },
  {
    name: 'hcp_create_database',
    description: 'Create a new MySQL database on the SysAdminHCP control panel. Requires a "databases" delegation with autoManageDatabases enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        dbName: { type: 'string', description: 'The database name' },
        clientName: { type: 'string', description: 'Hosting client username to own this database. Defaults to "admin" if omitted.' },
        charset: { type: 'string', description: 'Defaults to "utf8mb4"' },
        collation: { type: 'string', description: 'Defaults to "utf8mb4_unicode_ci"' },
      },
      required: ['dbName'],
    },
  },
  {
    name: 'hcp_delete_database',
    description: 'Delete a MySQL database on the SysAdminHCP control panel. This cannot be undone — all data in the database is lost. Requires a "databases" delegation with autoManageDatabases enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        dbName: { type: 'string', description: 'The database name, as shown by hcp_list_databases' },
      },
      required: ['dbName'],
    },
  },
  {
    name: 'hcp_create_database_user',
    description: 'Create a new MySQL database user on the SysAdminHCP control panel. Does not grant access to any database by itself — use hcp_grant_database_privileges next. Requires a "databases" delegation with autoManageDatabases enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        dbUserName: { type: 'string', description: 'The database username' },
        password: { type: 'string', description: 'The database user\'s password' },
        host: { type: 'string', description: 'Allowed connection host. Defaults to "localhost".' },
        clientName: { type: 'string', description: 'Hosting client username to own this user. Defaults to "admin" if omitted.' },
      },
      required: ['dbUserName', 'password'],
    },
  },
  {
    name: 'hcp_grant_database_privileges',
    description: 'Grant a database user privileges on a specific database on the SysAdminHCP control panel. Requires a "databases" delegation with autoManageDatabases enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        dbUserName: { type: 'string', description: 'The database username, as shown by hcp_list_databases (includeUsers:true)' },
        dbName: { type: 'string', description: 'The database name to grant access to' },
        privileges: { type: 'array', items: { type: 'string' }, description: 'Privileges to grant, e.g. ["ALL"] or ["SELECT","INSERT","UPDATE","DELETE"]' },
      },
      required: ['dbUserName', 'dbName', 'privileges'],
    },
  },
  {
    name: 'hcp_create_ftp_account',
    description: 'Create a new FTP account on the SysAdminHCP control panel. Requires an "ftp" delegation with autoManageFtpAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The FTP username' },
        password: { type: 'string', description: 'The FTP password' },
        domainName: { type: 'string', description: 'Domain this FTP account belongs to (used to derive the default home directory)' },
        homedir: { type: 'string', description: 'Override the home directory path. If omitted, one is derived automatically.' },
        quota: { type: 'number', description: 'Disk quota in MB. 0 or omitted means unlimited.' },
        clientName: { type: 'string', description: 'Hosting client username to own this account. Auto-resolved from domainName if omitted.' },
      },
      required: ['username', 'password'],
    },
  },
  {
    name: 'hcp_delete_ftp_account',
    description: 'Delete an FTP account on the SysAdminHCP control panel. Requires an "ftp" delegation with autoManageFtpAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The FTP username, as shown by hcp_list_ftp_accounts' },
      },
      required: ['username'],
    },
  },
  {
    name: 'hcp_change_ftp_password',
    description: 'Reset/change an FTP account\'s password on the SysAdminHCP control panel. Requires an "ftp" delegation with autoManageFtpAccounts enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'The FTP username, as shown by hcp_list_ftp_accounts' },
        password: { type: 'string', description: 'The new password' },
      },
      required: ['username', 'password'],
    },
  },
  {
    name: 'hcp_issue_ssl_certificate',
    description: 'Issue a new Let\'s Encrypt SSL certificate for a domain on the SysAdminHCP control panel, and wire it into the domain\'s web vhost. Requires the domain\'s DNS to already point at this server. Requires an "ssl" delegation with autoManageSsl enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'The domain to issue a certificate for' },
        email: { type: 'string', description: 'Contact email for the certificate authority (optional)' },
        additionalDomains: { type: 'array', items: { type: 'string' }, description: 'Extra SAN domains to cover, e.g. ["www.example.com"] (optional)' },
      },
      required: ['domainName'],
    },
  },
  {
    name: 'hcp_renew_ssl_certificate',
    description: 'Renew an existing Let\'s Encrypt SSL certificate on the SysAdminHCP control panel. Use when a client reports their certificate is expiring/expired. Requires an "ssl" delegation with autoManageSsl enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'The domain whose certificate to renew' },
      },
      required: ['domainName'],
    },
  },
  {
    name: 'hcp_revoke_ssl_certificate',
    description: 'Revoke a Let\'s Encrypt SSL certificate on the SysAdminHCP control panel. This immediately invalidates the certificate — the site will show as insecure until a new one is issued. Only do this for a genuine security reason (e.g. a compromised key), never as a routine action. Requires an "ssl" delegation with autoManageSsl enabled — otherwise refuses.',
    parameters: {
      type: 'object',
      properties: {
        domainName: { type: 'string', description: 'The domain whose certificate to revoke' },
      },
      required: ['domainName'],
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
