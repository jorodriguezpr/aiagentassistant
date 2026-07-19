/**
 * AI Agent Assistant (AiAgentAssistant)
 * Tool Domains — single source of truth for tool domain metadata
 *
 * Centralises coreToolNames, TOOL_CATEGORIES, and MAX_TOOLS so every file
 * that needs tool-routing logic imports from here instead of duplicating it.
 *
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

export const CORE_TOOL_NAMES: readonly string[] = [
  'execute_command',
  'read_file',
  'write_file',
  'think',
  // Web search — always available; AI must call these directly, not via dispatch_task
  'web_search',
  'fetch_web_content',
  // Knowledge base tools — always available so agent can self-learn and recall
  'it_knowledge_search',
  'it_knowledge_list',
  'it_knowledge_stats',
  'it_knowledge_start_session',
  'it_knowledge_record_command',
  'it_knowledge_commit_session',
  'it_knowledge_discard_session',
  // Playbook execution — always available so agent runs installs step-by-step
  'run_playbook',
  'check_remote_progress',
  // Credential lookup — always available for SSH tasks; set_credential excluded (AI lowercases passwords)
  'get_credential',
] as const;

/** Hard cap on total tools sent to the model to prevent token overflow / socket hang up */
export const MAX_TOOLS = 22;

export interface ToolCategory {
  keywords: string[];
  toolNames: string[];
}

export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  network: {
    keywords: ['ip', 'dns', 'ping', 'port', 'network', 'host', 'domain', 'traceroute', 'whois', 'ssl', 'certificate', 'https', 'connection', 'scan', 'route', 'routing', 'gateway', 'mtu', 'arp', 'mac', 'wifi', 'wireless', 'bridge', 'vlan', 'geoip', 'geolocation', 'conntrack', 'netstat', 'interface'],
    toolNames: ['dns_lookup', 'reverse_dns_lookup', 'ping_host', 'port_check', 'get_public_ip',
                'traceroute', 'whois_lookup', 'list_network_interfaces', 'dns_resolver_check', 'ssl_certificate_check',
                'open_ports_scan', 'active_connections', 'network_statistics', 'route_table', 'mtu_discovery',
                'arp_table', 'wifi_diagnostics', 'bridge_vlan_info', 'geoip_lookup', 'connection_tracking'],
  },
  system: {
    keywords: ['systemctl', 'journalctl', 'process monitoring', 'cpu usage', 'memory usage', 'disk usage', 'uptime check', 'hardware info', 'boot analysis', 'system limits', 'iostat', 'mount points', 'filesystem', 'resource history', 'load average', 'cpu temperature', 'performance bottleneck', 'metrics dashboard', 'alert status', 'resource trends', 'top resource users', 'response time test'],
    toolNames: ['get_system_info', 'service_status', 'process_monitoring', 'log_analysis', 'bandwidth_test',
                'disk_usage_analysis', 'memory_details', 'hardware_info', 'boot_analysis', 'system_limits',
                'resource_history', 'io_statistics', 'mount_points', 'system_load_analysis', 'cpu_temperature',
                'performance_bottleneck', 'metrics_dashboard', 'alert_status', 'resource_trends',
                'top_resource_users', 'response_time_test'],
  },
  admin: {
    keywords: ['user', 'group', 'account', 'login', 'lastlog', 'who', 'whoami', 'users', 'manage'],
    toolNames: ['user_management'],
  },
  schedule: {
    keywords: ['cron', 'schedule', 'job', 'task', 'recurring', 'automate', 'daily', 'hourly', 'weekly', 'crontab'],
    toolNames: ['create_scheduled_task', 'list_scheduled_tasks', 'delete_scheduled_task', 'pause_scheduled_task', 'resume_scheduled_task', 'cron_jobs'],
  },
  search: {
    keywords: ['find', 'search', 'locate', 'file', 'directory', 'folder', 'permission', 'audit', 'security'],
    toolNames: ['file_search', 'file_permission_audit'],
  },
  devops: {
    keywords: ['docker', 'container', 'git', 'repository', 'commit', 'branch', 'deploy', 'build', 'ci', 'cd', 'pipeline', 'jenkins', 'github actions', 'audit', 'vulnerability', 'dependencies', 'npm', 'pip', 'composer', 'test', 'testing', 'jest', 'pytest', 'mocha', 'phpunit', 'lint', 'linter', 'eslint', 'pylint', 'prettier', 'black', 'code quality', 'api', 'endpoint', 'curl', 'environment', 'node', 'python', 'php', 'java', 'version', 'asset', 'static', 'debug', 'debugging', 'code metrics', 'loc', 'complexity', 'secret', 'secrets', 'api key', 'password scan'],
    toolNames: ['docker_management', 'git_operations', 'package_audit', 'build_status', 'api_testing', 'code_quality', 'dependency_tree', 'test_execution', 'environment_check', 'asset_analysis', 'cicd_status', 'debug_port_check', 'code_metrics', 'secrets_scan'],
  },
  security: {
    keywords: ['firewall', 'security', 'attack', 'intrusion', 'audit', 'vulnerability', 'fail', 'ban', 'update', 'patch', 'fail2ban', 'aide', 'password', 'policy', 'selinux', 'apparmor', 'mac', 'auditd', 'rootkit', 'chkrootkit', 'rkhunter', 'dnssec'],
    toolNames: ['firewall_rules', 'failed_login_attempts', 'open_ports_scan', 'ssh_key_management', 'security_updates', 'intrusion_detection', 'password_policy', 'mac_status', 'audit_logs', 'rootkit_scan', 'dns_security'],
  },
  database: {
    keywords: ['database', 'mysql', 'postgres', 'mongodb', 'sql', 'query', 'table', 'db'],
    toolNames: ['database_operations'],
  },
  webserver: {
    keywords: ['nginx', 'apache', 'web server', 'vhost', 'config', 'httpd', 'virtual host', 'site'],
    toolNames: ['web_server_config_test', 'virtual_host_list'],
  },
  hosting: {
    keywords: ['hosting', 'email server', 'smtp', 'imap', 'pop3', 'dns propagation', 'uptime', 'website', 'backup', 'connection pool', 'quota', 'ssl certificate', 'multi-domain', 'ftp', 'sftp', 'control panel', 'cpanel', 'plesk', 'webmin', 'php', 'configuration', 'php.ini'],
    toolNames: ['virtual_host_list', 'email_server_test', 'dns_propagation_check', 'website_uptime',
                'backup_verification', 'database_connection_pools', 'quota_usage', 'ssl_multi_domain_check',
                'ftp_status', 'control_panel_status', 'php_configuration'],
  },
  email: {
    keywords: ['email', 'mail', 'send', 'message', 'inbox', 'smtp', 'imap'],
    toolNames: ['send_email', 'read_emails', 'list_email_accounts', 'set_default_email_account'],
  },
  hcp: {
    keywords: ['sysadminhcp', 'panel', 'control panel', 'ticket', 'tickets', 'support ticket', 'client', 'clients', 'suspend', 'unsuspend', 'intrusion', 'blocked ip', 'attacker', 'hosting panel', 'admin panel', 'delegate', 'delegation', 'autonomous'],
    toolNames: ['hcp_get_system_health', 'hcp_list_tickets', 'hcp_get_ticket', 'hcp_list_clients', 'hcp_get_intrusion_activity',
                'hcp_reply_ticket', 'hcp_update_ticket_status', 'hcp_restart_service', 'hcp_suspend_client', 'hcp_unsuspend_client',
                'hcp_notify_admin'],
  },
  web: {
    keywords: ['search', 'web', 'google', 'bing', 'url', 'website', 'fetch', 'scrape', 'internet', 'online'],
    toolNames: ['web_search', 'fetch_web_content', 'search_and_extract', 'find_financial_sources'],
  },
  pdf: {
    keywords: ['pdf', 'document', 'report', 'generate', 'create'],
    toolNames: ['generate_text_pdf', 'generate_html_pdf', 'generate_webpage_pdf', 'generate_report_pdf', 'list_pdfs', 'delete_pdf'],
  },
  scheduling: {
    keywords: ['schedule', 'cron', 'task', 'recurring', 'automate', 'daily', 'hourly'],
    toolNames: ['create_scheduled_task', 'list_scheduled_tasks', 'delete_scheduled_task', 'pause_scheduled_task', 'resume_scheduled_task'],
  },
  package: {
    keywords: ['install', 'package', 'apt', 'update', 'upgrade', 'remove', 'software', 'list', 'dpkg', 'installed'],
    toolNames: ['install_package', 'update_system', 'remove_package', 'check_tool_availability', 'install_system_package', 'package_management_list'],
  },
  credential: {
    // set_credential intentionally excluded — AI models normalize text and lowercase passwords.
    // Users must save credentials via the /savecred Telegram command to preserve exact case.
    keywords: ['credential', 'password', 'key', 'secret', 'token', 'auth'],
    toolNames: ['get_credential'],
  },
  meta: {
    keywords: ['skill', 'generate', 'create skill', 'new skill', 'capability'],
    toolNames: ['generate_new_skill', 'list_generated_skills', 'view_generated_skill', 'delete_generated_skill'],
  },
  knowledge: {
    keywords: ['playbook', 'knowledge', 'learn', 'experience', 'install', 'configure', 'sysadmin', 'control panel', 'ispconfig', 'cpanel', 'plesk', 'directadmin', 'webmin', 'hestia', 'cyberpanel'],
    toolNames: ['it_knowledge_search', 'it_knowledge_list', 'it_knowledge_create', 'it_knowledge_add_step', 'it_knowledge_get', 'it_knowledge_mark_result', 'it_knowledge_stats', 'it_knowledge_start_session', 'it_knowledge_record_command', 'it_knowledge_commit_session', 'it_knowledge_discard_session', 'it_knowledge_delete', 'run_playbook', 'check_remote_progress'],
  },
  monitoring: {
    keywords: ['token', 'usage', 'monitor', 'stats', 'analytics'],
    toolNames: ['log_ai_token_usage', 'get_ai_token_usage', 'reset_ai_token_usage', 'export_ai_token_usage'],
  },
  remote: {
    // set_credential excluded — see credential category note above
    keywords: ['ssh', 'remote', 'server', 'connect', 'login', 'upload', 'download', 'file transfer', 'sftp', 'scp', 'key', 'authorized_keys', 'execute command', 'remote command', 'password', 'credential', 'stored'],
    toolNames: ['ssh_login', 'ssh_add_key', 'upload_file', 'download_file', 'execute_remote_command', 'get_credential', 'control_panel_status'],
  },
};
