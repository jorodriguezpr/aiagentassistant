export function describeToolCall(name: string, args: any): string {
  const h   = String(args.host || args.connectionId || args.hostname || '');
  const cmd = args.command ? ': ' + String(args.command).slice(0, 60) + (String(args.command).length > 60 ? '…' : '') : '';
  switch (name) {
    case 'get_credential':              return `Retrieving vault credential${args.key ? ` for ${args.key}` : ''}`;
    case 'execute_remote_command':      return `Running remote command on ${h}${cmd}`;
    case 'control_panel_status':        return `Detecting control panel on ${h}`;
    case 'ssh_login':                   return `Testing SSH connection to ${h}`;
    case 'execute_command':             return `Running local command${cmd}`;
    case 'web_search':                  return `Searching the web: ${args.query || args.q || ''}`;
    case 'fetch_web_content':           return `Fetching URL: ${String(args.url || '').slice(0, 80)}`;
    case 'it_knowledge_search':         return `Searching knowledge base: ${args.query || ''}`;
    case 'it_knowledge_start_session':  return 'Starting knowledge tracking session';
    case 'it_knowledge_commit_session': return 'Saving playbook to knowledge base';
    case 'it_knowledge_record_command': return 'Recording command to knowledge base';
    case 'it_knowledge_discard_session':return 'Discarding failed session';
    case 'run_playbook':                return `Running playbook: ${args.name || args.playbookId || ''}`;
    case 'send_email':                  return `Sending email to ${args.to || args.recipient || ''}`;
    case 'read_emails':                 return 'Reading emails';
    case 'upload_file':                 return `Uploading file to ${h}`;
    case 'download_file':               return `Downloading file from ${h}`;
    case 'dns_lookup':                  return `DNS lookup: ${args.hostname || args.domain || ''}`;
    case 'ping_host':                   return `Pinging ${args.host || ''}`;
    case 'port_check':                  return `Checking port ${args.port} on ${args.host || ''}`;
    case 'generate_text_pdf':
    case 'generate_html_pdf':
    case 'generate_report_pdf':         return 'Generating PDF document';
    case 'create_scheduled_task':       return `Scheduling task: ${args.name || ''}`;
    case 'dispatch_task':               return `Dispatching task: ${args.action || ''}`;
    default:
      return name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
  }
}
