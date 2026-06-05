# AI Tools Reference

Complete reference for all tools available to the AI Agent Assistant.  
These are the actual capabilities the AI uses when you ask it to do something — just describe what you need in natural language and the agent picks the right tools automatically.

---

## How it works

You don't call tools directly. You talk to the agent:

```
"Check if port 443 is open on 192.168.1.50"
"Install Nginx on my server at 10.0.0.5"
"Search for the latest Node.js LTS release notes"
"Send an email to admin@example.com with the disk report"
```

The agent selects the appropriate tool(s), executes them, and reports back — with live step indicators in Telegram (⟳→✅/❌) and the Admin Portal chat.

---

## Tool Categories

- [Remote Server / SSH](#remote-server--ssh)
- [Local System Commands](#local-system-commands)
- [Network Diagnostics](#network-diagnostics)
- [Control Panel Detection](#control-panel-detection)
- [Web Search & Content](#web-search--content)
- [Email](#email)
- [PDF Generation](#pdf-generation)
- [Credential Vault](#credential-vault)
- [IT Knowledge Base](#it-knowledge-base)
- [Playbooks](#playbooks)
- [Natural Language Scripts](#natural-language-scripts)
- [Scheduled Tasks](#scheduled-tasks)
- [Agent Orchestration](#agent-orchestration)

---

## Remote Server / SSH

Manage and execute commands on remote servers over SSH.

| Tool | What it does |
|------|-------------|
| `ssh_login` | Test SSH connectivity to a host |
| `execute_remote_command` | Run a shell command on a remote server and return output |
| `upload_file` | Copy a local file to a remote server via SCP |
| `download_file` | Download a file from a remote server |
| `ssh_add_key` | Add an SSH public key to a remote server's authorized_keys |

**Example prompts:**
```
"Run 'df -h' on root@192.168.1.50"
"Restart Nginx on my web server at 10.0.0.5"
"Upload my config file to /etc/nginx/nginx.conf on the server"
"Check the last 50 lines of /var/log/nginx/error.log on 10.0.0.5"
```

**Credentials:** The agent automatically looks up saved credentials for the target host. Save them first:
```
/savecred root@192.168.1.50 yourpassword
```

---

## Local System Commands

Execute commands on the server where the agent is running.

| Tool | What it does |
|------|-------------|
| `execute_command` | Run any shell command on the local server |

**Example prompts:**
```
"Show disk usage on this server"
"List all running Docker containers"
"Check what's using port 3000"
"Show the last 20 lines of /var/log/syslog"
```

---

## Network Diagnostics

Complete network troubleshooting and analysis toolkit.

| Tool | What it does |
|------|-------------|
| `dns_lookup` | Resolve a hostname to IP, or look up A/MX/TXT/NS records |
| `reverse_dns_lookup` | Reverse PTR lookup for an IP address |
| `ping_host` | Ping a host and report latency/reachability |
| `port_check` | Check if a specific TCP port is open on a host |
| `get_public_ip` | Get the server's public IP address |
| `traceroute` | Trace the network path to a destination |
| `whois_lookup` | WHOIS registration info for a domain or IP |
| `geoip_lookup` | Geographic location of an IP address |
| `open_ports_scan` | Scan common ports on a target host |
| `active_connections` | List active network connections on this server |
| `network_statistics` | Interface statistics, bytes in/out |
| `arp_table` | Show ARP table (local network neighbors) |
| `list_network_interfaces` | List all network interfaces and their IPs |

**Example prompts:**
```
"What's the MX record for gmail.com?"
"Is port 22 open on 192.168.1.50?"
"Traceroute to 8.8.8.8"
"Show all active connections on this server"
"What's the WHOIS info for example.com?"
```

---

## Control Panel Detection

Identify which web hosting control panel is installed on a server with a single SSH command.

| Tool | What it does |
|------|-------------|
| `control_panel_status` | Detect which of 11 control panels is installed and running |

**Detected panels:** cPanel/WHM, CWP (CentOS Web Panel), Plesk, DirectAdmin, ISPConfig, Webmin, HestiaCP, KloxoNG, CyberPanel, aaPanel, Froxlor

**Example prompts:**
```
"What control panel is installed on 192.168.1.50?"
"Check control panel status on my web server"
```

Credentials are loaded automatically from the vault. The tool runs a single SSH session checking all panels at once.

---

## Web Search & Content

Search the internet and extract content from web pages.

| Tool | What it does |
|------|-------------|
| `web_search` | Search the web and return results with titles, URLs, and snippets |
| `fetch_web_content` | Download and extract readable text from a URL |
| `search_and_extract` | Combined search + content extraction with summary |
| `find_financial_sources` | Find financial/business data sources on a topic |

**Example prompts:**
```
"Search for Node.js 20 LTS release notes"
"What's the current price of the Anthropic Claude API?"
"Fetch the content of https://nodejs.org/en/blog/release/v20.0.0"
"Research ISPConfig installation on Ubuntu 22.04"
```

---

## Email

Send and receive email through configured IMAP/SMTP accounts.

| Tool | What it does |
|------|-------------|
| `send_email` | Send an email with subject, body, and optional attachments |
| `read_emails` | Read emails from an inbox (filtered by folder, count, or criteria) |
| `list_email_accounts` | Show all configured email accounts |
| `set_default_email_account` | Set which account to use by default |

**Configure email accounts** via the Admin Portal → Settings, or in `.env`.

**Example prompts:**
```
"Send an email to admin@example.com with the subject 'Server Report'"
"Read my last 10 emails from the inbox"
"Send the disk usage report to team@example.com"
```

Also available via Telegram `/email` command for account management.

---

## PDF Generation

Generate professional PDF documents from text, HTML, or web pages.

| Tool | What it does |
|------|-------------|
| `generate_text_pdf` | Generate a PDF from plain text or markdown |
| `generate_html_pdf` | Generate a PDF from HTML content |
| `generate_webpage_pdf` | Capture a web page as PDF |
| `generate_report_pdf` | Generate a structured multi-section report PDF |
| `list_pdfs` | List all generated PDFs |
| `delete_pdf` | Delete a generated PDF file |

Generated PDFs are sent directly to Telegram as document attachments.

**Example prompts:**
```
"Generate a PDF report of the server's current status"
"Create a PDF from the content of https://example.com/report"
"Make a PDF with the disk usage stats in a formatted table"
```

---

## Credential Vault

Securely store and retrieve credentials used by the agent for remote access and APIs.

| Tool | What it does |
|------|-------------|
| `get_credential` | Retrieve a stored credential by key |
| `save_credential` | Store a new credential |
| `delete_credential` | Remove a stored credential |
| `list_credentials` | List all stored credential keys (not values) |

**Storage location:** `/opt/aiagentassistant/app/data/` — accessible only by the `aiagent` user.

**Naming convention for SSH hosts:** `username@hostname` or `username@ip`

```
/savecred root@192.168.1.50 mypassword
/savecred root@10.0.0.5 anotherpassword
/savecred mysql-root@192.168.1.50 dbpassword
/savecred api_key_openai sk-abc123
```

The agent loads credentials automatically when it needs to connect to a matching host — you don't need to mention passwords in your messages.

**Portal credential prompting:** If the agent needs a credential that isn't saved yet, the Admin Portal chat shows an inline prompt asking you to provide it. On submit the value is saved to the vault and the agent continues without restarting the task.

---

## IT Knowledge Base

A self-learning knowledge base that records successful IT procedures and reuses them in future tasks.

| Tool | What it does |
|------|-------------|
| `it_knowledge_search` | Search playbooks by keyword, OS, or service |
| `it_knowledge_get` | Retrieve a specific playbook by ID |
| `it_knowledge_list` | List all playbooks with metadata |
| `it_knowledge_stats` | Show knowledge base statistics |
| `it_knowledge_create` | Create a new manual playbook entry |
| `it_knowledge_start_session` | Begin recording a new install session |
| `it_knowledge_record_command` | Add a command and result to the active session |
| `it_knowledge_commit_session` | Save the completed session as a new playbook |
| `it_knowledge_discard_session` | Discard a failed session |
| `it_knowledge_add_step` | Add a step to an existing playbook |
| `it_knowledge_mark_result` | Mark a step as succeeded or failed |

### Included playbooks

| Playbook | Target OS | Notes |
|----------|-----------|-------|
| ISPConfig 3 | Ubuntu 22.04 | Full mail + web stack |
| CWP (CentOS Web Panel) | AlmaLinux 8 | Includes post-install steps |
| KloxoNG | AlmaLinux 8 | Reconstructed from command history |
| cPanel/WHM | AlmaLinux 8 | Includes Proxmox `/etc/fstab` pre-fix |

**Knowledge base file:** `/opt/aiagentassistant/app/data/experience-kb.json`

> **Important:** Never overwrite this file. Always read and merge. It accumulates knowledge over time.

---

## Playbooks

Execute saved IT installation and configuration playbooks on remote servers.

| Tool | What it does |
|------|-------------|
| `run_playbook` | Execute a knowledge base playbook step-by-step on a target host |
| `check_remote_progress` | Poll the progress of a background install running on a remote server |

**Via Telegram:**

```
/listplaybooks                      — browse all playbooks
/listplaybooks ispconfig            — search for ISPConfig playbooks
/runplaybook ispconfig              — run the ISPConfig playbook
/checkprogress root@192.168.1.50    — check install progress
```

**Example prompt:**
```
"Install ISPConfig on root@192.168.1.50 using the playbook"
"Run the CWP installation playbook on my AlmaLinux server at 10.0.0.5"
```

---

## Natural Language Scripts

Save multi-step natural language procedures as reusable scripts.

| Tool | What it does |
|------|-------------|
| `save_nl_script` | Save a named multi-step NL procedure |
| `run_nl_script` | Execute a saved NL script via the AI agent |
| `list_nl_scripts` | List all saved NL scripts |
| `delete_nl_script` | Remove a saved NL script |

**Via Telegram:**

```
/savenlscript weekly-maintenance
Step 1: Update all packages on root@192.168.1.50
Step 2: Check disk usage and report if above 80%
Step 3: Restart Nginx if it's not running
Step 4: Send a summary email to admin@example.com
```

```
/runnlscript weekly-maintenance     — run it any time
/listnlscripts                      — see all saved scripts
/deletenlscript weekly-maintenance  — remove it
```

**Schedule an NL script to run automatically:**
```
"Schedule the weekly-maintenance script to run every Sunday at midnight"
```

This creates a `nlscript` scheduled task. When the cron fires, the agent runs the script autonomously through the full AI tool loop — no human interaction required.

---

## Scheduled Tasks

Create and manage cron-style recurring tasks. Supports three task types: shell commands, emails, and NL scripts (runs the full AI loop on a schedule).

| Tool | What it does |
|------|-------------|
| `create_scheduled_task` | Schedule a task to run at a given cron expression |
| `list_scheduled_tasks` | List all scheduled tasks with status and run history |
| `delete_scheduled_task` | Remove a scheduled task permanently |
| `pause_scheduled_task` | Temporarily disable a scheduled task |
| `resume_scheduled_task` | Re-enable a paused scheduled task |

**Task types:**

| Type | Description |
|------|-------------|
| `command` | Run a local or remote shell command |
| `email` | Send an automated email |
| `nlscript` | Run a saved NL script through the full AI tool loop |

**Via Telegram:**
```
/scheduled    — list all scheduled tasks
```

**Example prompts:**
```
"Schedule a disk check every day at 8am"
"Run the weekly-maintenance NL script every Sunday at midnight"
"Schedule the 'check-server-health' script to run hourly"
"Pause the daily disk check task"
"Cancel the daily disk check task"
```

**Scheduling syntax** — use plain English or cron expressions:
```
"daily"                  → 0 9 * * *   (9:00 AM)
"daily at 3:00 AM"       → 0 3 * * *
"hourly"                 → 0 * * * *
"every 30 minutes"       → */30 * * * *
"every Sunday at midnight" → 0 0 * * 0
"*/5 * * * *"            → custom cron
```

---

## Agent Orchestration

Internal tools used by the orchestrator to manage complex multi-agent tasks.

| Tool | What it does |
|------|-------------|
| `dispatch_task` | Send a task to a specialized worker agent (SysAdmin, Mail, Monitor) |
| `think` | Internal reasoning step — the agent works through a problem before acting |

These tools are used automatically by the orchestrator. You don't call them directly.

---

## Tips for Best Results

### Be specific about targets

```
✅ "Check disk usage on root@192.168.1.50"
✅ "Restart Nginx on 10.0.0.5"
❌ "Check disk" (agent may ask which server)
```

### Use the knowledge base for repeated installs

When the agent successfully installs something, it records it. Next time you ask for the same install, it loads the playbook automatically — faster and more reliable.

### Save credentials before remote tasks

```
/savecred root@192.168.1.50 password
```

Once saved, just mention the host in your request — the agent handles auth automatically.

### Multi-step tasks work naturally

```
"On root@192.168.1.50: update the system, install Nginx, configure it to serve /var/www/html, and start it"
```

The agent creates a plan, asks for approval, then executes each step in sequence with live progress.

### Use NL Scripts for routine work

Save recurring procedures as NL scripts and run them with a single command — no need to re-describe the steps every time.
