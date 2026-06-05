/**
 * AI Agent Assistant (AiAgentAssistant)
 * CommandTranslator - Translates natural language commands to shell commands
 * Enhanced with AdminToolsKnowledgeBase for system, network, and security admin tasks
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import logger from './logger.js';
import { findAdminTool, getToolsByCategory, recommendTool } from './AdminToolsKnowledgeBase.js';

interface CommandPattern {
  patterns: RegExp[];
  command: string;
  description: string;
}

/**
 * CommandTranslator - Converts natural language requests to shell commands
 * Uses local pattern matching to avoid AI content filtering
 */
class CommandTranslator {
  private commandMappings: CommandPattern[] = [
    // CPU and System Load
    {
      patterns: [
        /\b(?:verify|check|show|display|get|monitor)\s+(?:the\s+)?(?:cpu|processor)\s+(?:usage|load|utilization)/i,
        /\b(?:cpu|processor)\s+(?:usage|load|status)/i,
        /\bhow\s+(?:is|much)\s+(?:the\s+)?cpu/i,
      ],
      command: 'top -bn1 | head -20',
      description: 'Check CPU usage',
    },
    {
      patterns: [
        /\b(?:system\s+)?(?:load|uptime)/i,
        /\bhow\s+long\s+(?:has\s+)?(?:been\s+)?(?:running|up)/i,
      ],
      command: 'uptime',
      description: 'Check system uptime and load',
    },
    
    // Memory
    {
      patterns: [
        /\b(?:verify|check|show|display|get)\s+(?:the\s+)?(?:memory|ram)\s+(?:usage|status)/i,
        /\b(?:memory|ram)\s+(?:usage|status|available)/i,
        /\bhow\s+much\s+(?:memory|ram)/i,
      ],
      command: 'free -h',
      description: 'Check memory usage',
    },
    
    // Disk Space
    {
      patterns: [
        /\b(?:verify|check|show|display|get)\s+(?:the\s+)?disk\s+(?:space|usage)/i,
        /\bdisk\s+(?:space|usage|status)/i,
        /\bhow\s+much\s+(?:disk\s+)?space/i,
        /\b(?:check|show)\s+(?:disk\s+)?partitions/i,
      ],
      command: 'df -h',
      description: 'Check disk space',
    },
    
    // Processes
    {
      patterns: [
        /\b(?:list|show|display|get)\s+(?:all\s+)?(?:running\s+)?processes/i,
        /\b(?:what|which)\s+processes\s+(?:are\s+)?running/i,
        /\bshow\s+(?:me\s+)?(?:the\s+)?ps/i,
      ],
      command: 'ps aux | head -30',
      description: 'List running processes',
    },
    
    // Directory Listings
    {
      patterns: [
        /\b(?:list|show|display|get)\s+(?:all\s+)?(?:files?|folders?|directories)\s+(?:in|under|at)\s+([^\s]+)/i,
        /\b(?:list|show|display)\s+(?:the\s+)?(?:content|contents)\s+of\s+([^\s]+)/i,
        /\bls\s+([^\s]+)/i,
        /\bwhat(?:'?s|\s+is)\s+in\s+([^\s]+)/i,
      ],
      command: 'ls -lh $1',
      description: 'List directory contents',
    },
    {
      patterns: [
        /\b(?:list|show|display)\s+(?:all\s+)?(?:files?|folders?|directories)/i,
        /\bwhat\s+files\s+(?:are\s+)?(?:here|there)/i,
      ],
      command: 'ls -la',
      description: 'List current directory',
    },
    
    // Directory Creation
    {
      patterns: [
        /\b(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:directory|folder|dir)\s+(?:inside|in|under|at)\s+([^\s]+)\s+(?:called|named)\s+([^\s]+)/i,
        /\b(?:under|in|inside)\s+(?:the\s+)?(?:folder|directory|path)\s+([^\s]+)\s+(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:directory|folder|dir)\s+(?:called|named)\s+([^\s]+)/i,
      ],
      command: 'mkdir -p $1/$2 && echo "✓ Directory created: $1/$2" && ls -lad $1/$2',
      description: 'Create directory with path and name',
    },
    {
      patterns: [
        /\b(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:directory|folder|dir)\s+(?:at|in)?\s*([\/\w\-\.]+)/i,
        /\bmkdir\s+([\/\w\-\.]+)/i,
      ],
      command: 'mkdir -p $1 && echo "✓ Directory created: $1" && ls -lad $1',
      description: 'Create directory at path',
    },
    {
      patterns: [
        /\b(?:create|make)\s+(?:a\s+)?(?:new\s+)?(?:directory|folder|dir)\s+(?:called|named)\s+([^\s]+)\s+(?:in|at|under)\s+([^\s]+)/i,
      ],
      command: 'mkdir -p $2/$1 && echo "✓ Directory created: $2/$1" && ls -lad $2/$1',
      description: 'Create named directory in path',
    },
    
    // File Operations - Delete/Remove
    {
      patterns: [
        /\b(?:delete|remove|rm)\s+(?:the\s+)?(?:file|directory|folder)\s+([^\s]+)/i,
        /\brm\s+(?:-rf?\s+)?([^\s]+)/i,
      ],
      command: 'rm -rf $1 && echo "✓ Successfully deleted: $1"',
      description: 'Delete file or directory',
    },
    {
      patterns: [
        /\b(?:delete|remove)\s+(?:all\s+)?files\s+(?:in|from|under)\s+([^\s]+)/i,
      ],
      command: 'rm -rf $1/* && echo "✓ All files deleted from: $1"',
      description: 'Delete all files in directory',
    },
    
    // File Operations - Copy
    {
      patterns: [
        /\b(?:copy|cp)\s+([^\s]+)\s+(?:to|into)\s+([^\s]+)/i,
      ],
      command: 'cp -r $1 $2 && echo "✓ Copied successfully: $1 → $2"',
      description: 'Copy file or directory',
    },
    
    // File Operations - Move/Rename
    {
      patterns: [
        /\b(?:move|mv)\s+([^\s]+)\s+(?:to|into)\s+([^\s]+)/i,
        /\brename\s+([^\s]+)\s+(?:to|as)\s+([^\s]+)/i,
      ],
      command: 'mv $1 $2 && echo "✓ Moved successfully: $1 → $2"',
      description: 'Move or rename file/directory',
    },
    
    // File Operations - View/Read
    {
      patterns: [
        /\b(?:show|display|view|read|cat)\s+(?:the\s+)?(?:file|contents\s+of)\s+([^\s]+)/i,
        /\bwhat(?:'?s|\s+is)\s+in\s+(?:the\s+)?file\s+([^\s]+)/i,
      ],
      command: 'cat $1',
      description: 'View file contents',
    },
    {
      patterns: [
        /\b(?:tail|show\s+last)\s+(?:of\s+)?([^\s]+)/i,
        /\blast\s+(?:\d+\s+)?lines\s+(?:of|from)\s+([^\s]+)/i,
      ],
      command: 'tail -n 50 $1',
      description: 'Show last lines of file',
    },
    
    // Web Download Operations
    {
      patterns: [
        /\b(?:download|fetch|get)\s+(?:this\s+)?(?:file\s+)?(?:from\s+)?(?:the\s+web|url)?\s*(https?:\/\/[^\s]+)\s+(?:to|into|in)\s+([^\s]+)/i,
        /\b(?:download|fetch)\s+(?:file\s+)?(?:from\s+)?(https?:\/\/[^\s]+)\s+(?:in|into|to)\s+([^\s]+)/i,
      ],
      command: 'cd $2 && wget -q $1 && echo "✓ Downloaded successfully: $(basename $1)" && ls -lh $(basename $1)',
      description: 'Download file from URL to directory',
    },
    {
      patterns: [
        /\b(?:inside|in|under)\s+(?:the\s+)?(?:folder|directory)\s+([^\s]+)\s+(?:download|fetch|get)\s+(?:this\s+)?(?:file\s+)?(?:from\s+the\s+web)?\s*(https?:\/\/[^\s]+)/i,
        /\b(?:in|inside|within)\s+(?:folder|directory)\s+([^\s]+)\s+(?:download|fetch|wget)\s+(https?:\/\/\S+)/i,
      ],
      command: 'cd $1 && wget -q $2 && echo "✓ Downloaded successfully: $(basename $2)" && ls -lh $(basename $2)',
      description: 'Download file from URL to directory (directory first)',
    },
    {
      patterns: [
        /\b(?:download|fetch|wget)\s+(https?:\/\/[^\s]+)/i,
        /\b(?:download|fetch)\s+(https?:\/\/\S+)$/i,
      ],
      command: 'wget -q $1 && echo "✓ Downloaded successfully: $(basename $1)" && ls -lh $(basename $1)',
      description: 'Download file from URL to current directory',
    },
    // Handle truncated download command - if it contains https:// and download keywords
    {
      patterns: [
        /\b(?:inside|in|under)\s+(?:the\s+)?(?:folder|directory|path)\s+([^\s]+)\s+(?:download|fetch|get)\s+(?:this\s+)?(?:file\s+)?(?:from\s+the\s+web)?\s+(https?:\/\/.+)$/i,
      ],
      command: 'cd $1 && wget -q "$2" && echo "✓ Downloaded successfully" && ls -lh',
      description: 'Download file from URL to directory (handles truncated URLs)',
    },
    
    // Services
    {
      patterns: [
        /\b(?:check|show|status|get)\s+(?:the\s+)?status\s+(?:of\s+)?(?:service\s+)?(\w+)/i,
        /\bis\s+(\w+)\s+(?:service\s+)?(?:running|active|up)/i,
      ],
      command: 'systemctl status $1',
      description: 'Check service status',
    },
    {
      patterns: [
        /\b(?:list|show|display)\s+(?:all\s+)?(?:running\s+)?services/i,
      ],
      command: 'systemctl list-units --type=service --state=running',
      description: 'List running services',
    },
    {
      patterns: [
        /\b(?:restart|reload)\s+(?:the\s+)?(?:service\s+)?(\w+)/i,
      ],
      command: 'systemctl restart $1',
      description: 'Restart service',
    },
    {
      patterns: [
        /\b(?:stop|disable)\s+(?:the\s+)?(?:service\s+)?(\w+)/i,
      ],
      command: 'systemctl stop $1',
      description: 'Stop service',
    },
    {
      patterns: [
        /\b(?:start|enable)\s+(?:the\s+)?(?:service\s+)?(\w+)/i,
      ],
      command: 'systemctl start $1',
      description: 'Start service',
    },
    
    // Network
    {
      patterns: [
        /\b(?:show|display|get|check)\s+(?:network|ip)\s+(?:config|address|info)/i,
        /\bwhat(?:'?s|\s+is)\s+(?:my|the)\s+ip/i,
      ],
      command: 'ip addr show',
      description: 'Show network configuration',
    },
    {
      patterns: [
        /\b(?:check|test|verify)\s+(?:network\s+)?(?:connectivity|connection)/i,
        /\bping\s+(\S+)/i,
      ],
      command: 'ping -c 4 $1',
      description: 'Test network connectivity',
    },
    
    // Logs
    {
      patterns: [
        /\b(?:show|display|get|check|tail)\s+(?:the\s+)?(?:system\s+)?logs?/i,
        /\b(?:last|recent)\s+(?:system\s+)?(?:log\s+)?(?:entries|messages)/i,
      ],
      command: 'journalctl -n 50 --no-pager',
      description: 'Show recent system logs',
    },
    {
      patterns: [
        /\b(?:show|display|tail)\s+(?:the\s+)?logs?\s+(?:for|of)\s+(\w+)/i,
      ],
      command: 'journalctl -u $1 -n 50 --no-pager',
      description: 'Show service logs',
    },
    
    // Users
    {
      patterns: [
        /\b(?:who|which\s+users?)\s+(?:is|are)\s+logged\s+in/i,
        /\b(?:show|list)\s+(?:logged\s+in\s+)?users?/i,
      ],
      command: 'who',
      description: 'Show logged in users',
    },
    
    // System Info
    {
      patterns: [
        /\b(?:show|display|get)\s+(?:system\s+)?(?:info|information|details)/i,
        /\bwhat\s+(?:os|system|distro)/i,
      ],
      command: 'uname -a && cat /etc/os-release',
      description: 'Show system information',
    },
    
    // Firewall
    {
      patterns: [
        /\b(?:show|display|list)\s+(?:firewall\s+)?rules?/i,
        /\b(?:check|show)\s+(?:ufw|firewall)\s+status/i,
      ],
      command: 'ufw status verbose',
      description: 'Show firewall status',
    },

    // ============================================
    // SYSTEM ADMINISTRATION PATTERNS
    // ============================================
    
    // Package Management
    {
      patterns: [
        /\b(?:install|add)\s+(?:the\s+)?(?:package|software|app)\s+(\w+)/i,
        /\b(?:apt|apt-get)\s+install\s+(\w+)/i,
      ],
      command: 'apt update && apt install -y $1 && echo "✓ $1 installed successfully"',
      description: 'Install package via apt',
    },
    {
      patterns: [
        /\b(?:remove|uninstall|delete)\s+(?:the\s+)?(?:package|software|app)\s+(\w+)/i,
      ],
      command: 'apt remove -y $1 && echo "✓ $1 removed successfully"',
      description: 'Remove package via apt',
    },
    {
      patterns: [
        /\b(?:update|upgrade)\s+(?:all\s+)?packages?/i,
        /\bapt\s+(?:update|upgrade)/i,
      ],
      command: 'apt update && apt upgrade -y && echo "✓ System updated successfully"',
      description: 'Update system packages',
    },
    {
      patterns: [
        /\b(?:search|find)\s+(?:package|software)\s+(\w+)/i,
      ],
      command: 'apt search $1',
      description: 'Search for package',
    },

    // User Management
    {
      patterns: [
        /\b(?:create|add|new)\s+(?:user|account)\s+(\w+)/i,
        /\buseradd\s+(\w+)/i,
      ],
      command: 'useradd -m -s /bin/bash $1 && echo "✓ User $1 created successfully"',
      description: 'Create new user account',
    },
    {
      patterns: [
        /\b(?:delete|remove)\s+(?:user|account)\s+(\w+)/i,
      ],
      command: 'userdel -r $1 && echo "✓ User $1 deleted successfully"',
      description: 'Delete user account',
    },
    {
      patterns: [
        /\b(?:add|grant)\s+(\w+)\s+to\s+(?:sudo|admin|group)\s+(?:for\s+)?(?:user\s+)?(\w+)/i,
        /\b(?:make|add)\s+(\w+)\s+(?:sudo|admin)/i,
      ],
      command: 'usermod -aG sudo $2 && echo "✓ User $2 added to sudo group"',
      description: 'Add user to sudo group',
    },
    {
      patterns: [
        /\b(?:change|reset|set)\s+(?:password\s+for\s+)?(?:user\s+)?(\w+)/i,
      ],
      command: 'passwd $1',
      description: 'Change user password',
    },

    // Permissions & Ownership
    {
      patterns: [
        /\b(?:change|set)\s+(?:permissions?|perms)\s+of\s+([^\s]+)\s+to\s+(\d{3})/i,
        /\bchmod\s+(\d{3})\s+([^\s]+)/i,
      ],
      command: 'chmod $2 $1 && echo "✓ Permissions changed for $1 to $2"',
      description: 'Change file permissions',
    },
    {
      patterns: [
        /\b(?:change|set)\s+(?:owner|ownership)\s+of\s+([^\s]+)\s+to\s+(\w+):(\w+)/i,
        /\bchown\s+(\w+):(\w+)\s+([^\s]+)/i,
      ],
      command: 'chown -R $1:$2 $3 && echo "✓ Ownership changed for $3"',
      description: 'Change file ownership',
    },

    // ============================================
    // NETWORK ADMINISTRATION PATTERNS
    // ============================================

    // Network Configuration
    {
      patterns: [
        /\b(?:show|display|list)\s+(?:all\s+)?network\s+interfaces?/i,
        /\bip\s+(?:address|addr)/i,
      ],
      command: 'ip addr show && echo "---" && ip route show',
      description: 'Show network interfaces and routes',
    },
    {
      patterns: [
        /\b(?:add|assign|configure)\s+ip\s+address?\s+([\d\.]+)\s+to\s+([a-z0-9]+)/i,
      ],
      command: 'ip addr add $1 dev $2 && echo "✓ IP address added" && ip addr show $2',
      description: 'Add IP address to interface',
    },
    {
      patterns: [
        /\b(?:remove|delete)\s+ip\s+address?\s+([\d\.]+)\s+from\s+([a-z0-9]+)/i,
      ],
      command: 'ip addr del $1 dev $2 && echo "✓ IP address removed"',
      description: 'Remove IP address from interface',
    },
    {
      patterns: [
        /\b(?:enable|start|bring up)\s+(?:network\s+)?interface\s+([a-z0-9]+)/i,
      ],
      command: 'ip link set $1 up && echo "✓ Interface $1 enabled"',
      description: 'Enable network interface',
    },
    {
      patterns: [
        /\b(?:disable|stop|bring down)\s+(?:network\s+)?interface\s+([a-z0-9]+)/i,
      ],
      command: 'ip link set $1 down && echo "✓ Interface $1 disabled"',
      description: 'Disable network interface',
    },

    // Firewall Rules
    {
      patterns: [
        /\b(?:enable|start|activate)\s+firewall/i,
        /\bufw\s+enable/i,
      ],
      command: 'ufw enable && echo "✓ Firewall enabled" && ufw status',
      description: 'Enable UFW firewall',
    },
    {
      patterns: [
        /\b(?:disable|stop|deactivate)\s+firewall/i,
        /\bufw\s+disable/i,
      ],
      command: 'ufw disable && echo "✓ Firewall disabled"',
      description: 'Disable UFW firewall',
    },
    {
      patterns: [
        /\b(?:allow|open|permit)\s+port\s+(\d+)/i,
        /\bufw\s+allow\s+(\d+)/i,
      ],
      command: 'ufw allow $1 && echo "✓ Port $1 allowed" && ufw status numbered | grep $1',
      description: 'Allow port through firewall',
    },
    {
      patterns: [
        /\b(?:deny|block|close)\s+port\s+(\d+)/i,
        /\bufw\s+deny\s+(\d+)/i,
      ],
      command: 'ufw deny $1 && echo "✓ Port $1 denied" && ufw status',
      description: 'Deny port through firewall',
    },
    {
      patterns: [
        /\b(?:allow|open|permit)\s+(?:service|port)\s+(\w+)/i,
      ],
      command: 'ufw allow $1 && echo "✓ Service $1 allowed" && ufw status | grep $1',
      description: 'Allow service through firewall',
    },

    // DNS
    {
      patterns: [
        /\b(?:show|display|check)\s+(?:dns|name\s+server)s?/i,
        /\b(?:what|which)\s+dns/i,
      ],
      command: 'cat /etc/resolv.conf',
      description: 'Show DNS configuration',
    },
    {
      patterns: [
        /\b(?:lookup|resolve|query)\s+domain\s+([^\s]+)/i,
        /\bdig\s+([^\s]+)/i,
      ],
      command: 'dig $1 +short && echo "---" && dig $1',
      description: 'DNS lookup for domain',
    },

    // ============================================
    // SECURITY ADMINISTRATION PATTERNS
    // ============================================

    // SSH/Key Management
    {
      patterns: [
        /\b(?:generate|create)\s+(?:ssh\s+)?(?:key|keypair)\s+(?:for\s+)?(?:user\s+)?(\w+)/i,
      ],
      command: 'sudo -u $1 ssh-keygen -t rsa -b 4096 -f /home/$1/.ssh/id_rsa -N "" && echo "✓ SSH key generated for $1"',
      description: 'Generate SSH key for user',
    },
    {
      patterns: [
        /\b(?:show|display|list)\s+(?:ssh\s+)?authorized\s+keys?\s+(?:for\s+)?(?:user\s+)?(\w+)/i,
      ],
      command: 'cat /home/$1/.ssh/authorized_keys',
      description: 'Show authorized SSH keys for user',
    },

    // Audit & Logging
    {
      patterns: [
        /\b(?:show|display|check|see)\s+audit\s+logs?/i,
        /\b(?:recent|last)\s+audit\s+(?:entries|events)/i,
      ],
      command: 'ausearch -m EXECVE -i -ts recent | head -50',
      description: 'Show recent audit logs',
    },
    {
      patterns: [
        /\b(?:enable|start|activate)\s+auditd/i,
      ],
      command: 'systemctl enable auditd && systemctl start auditd && echo "✓ Auditd enabled and started"',
      description: 'Enable and start auditd',
    },

    // Security Scanning
    {
      patterns: [
        /\b(?:scan|check)\s+(?:for\s+)?(?:malware|viruses|infections)/i,
        /\bclamscan\s+([^\s]+)/i,
      ],
      command: 'clamscan -r /home && echo "✓ Scan complete"',
      description: 'Scan for malware using ClamAV',
    },
    {
      patterns: [
        /\b(?:check|scan)\s+file\s+integrity/i,
        /\baide\s+--check/i,
      ],
      command: 'aide --check | head -50',
      description: 'Check file integrity with AIDE',
    },

    // SSL/Certificate Management
    {
      patterns: [
        /\b(?:generate|create|make)\s+(?:ssl\s+)?(?:certificate|cert)\s+(?:for\s+)?([^\s]+)/i,
      ],
      command: 'openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /tmp/$1.key -out /tmp/$1.crt -subj "/CN=$1" && echo "✓ Certificate created for $1"',
      description: 'Generate SSL certificate',
    },
    {
      patterns: [
        /\b(?:show|display|check|verify)\s+(?:ssl\s+)?(?:certificate|cert)\s+(?:for\s+)?([^\s]+)/i,
      ],
      command: 'openssl s_client -connect $1:443 </dev/null 2>/dev/null | openssl x509 -text -noout',
      description: 'Check SSL certificate for domain',
    },

    // Fail2Ban
    {
      patterns: [
        /\b(?:show|display|check)\s+(?:fail2ban|intrusion\s+prevention)\s+status/i,
      ],
      command: 'fail2ban-client status && fail2ban-client status sshd',
      description: 'Check fail2ban status',
    },
    {
      patterns: [
        /\b(?:ban|block|add)\s+ip\s+([\d\.]+)\s+(?:to\s+)?fail2ban/i,
      ],
      command: 'fail2ban-client set sshd banip $1 && echo "✓ IP $1 banned"',
      description: 'Ban IP address with fail2ban',
    },
    
    // Control Panel Detection
    {
      patterns: [
        /\b(?:detect|check|find|identify)\s+(?:control\s+)?panel/i,
        /\b(?:what|which)\s+control\s+panel/i,
        /\b(?:is\s+)?(?:cpanel|kloxo|plesk|directadmin)\s+installed/i,
      ],
      command: 'if [ -d "/usr/local/cpanel" ]; then echo "cPanel installed"; /usr/local/cpanel/cpanel -V 2>/dev/null || echo "Version unknown"; elif [ -d "/usr/local/lxlabs/kloxo" ]; then echo "Kloxo NG installed"; /usr/local/lxlabs/kloxo/bin/lxphp.exe -v 2>/dev/null | head -1 || echo "Version unknown"; elif [ -d "/usr/local/psa" ]; then echo "Plesk installed"; /usr/local/psa/version 2>/dev/null || echo "Version unknown"; elif [ -d "/usr/local/directadmin" ]; then echo "DirectAdmin installed"; /usr/local/directadmin/directadmin v 2>/dev/null || echo "Version unknown"; else echo "No control panel detected"; fi',
      description: 'Detect installed control panel',
    },
    
    // cPanel Commands
    {
      patterns: [
        /\brestart\s+cpanel/i,
        /\breload\s+cpanel/i,
      ],
      command: '/usr/local/cpanel/scripts/restartsrv_cpanel',
      description: 'Restart cPanel service',
    },
    {
      patterns: [
        /\bcheck\s+cpanel\s+(?:status|service)/i,
        /\bcpanel\s+(?:status|running)/i,
      ],
      command: '/usr/local/cpanel/scripts/check_cpanel_rpms --list',
      description: 'Check cPanel status',
    },
    {
      patterns: [
        /\bupdate\s+cpanel/i,
        /\bupgrade\s+cpanel/i,
      ],
      command: '/usr/local/cpanel/scripts/upcp --force',
      description: 'Update cPanel',
    },
    {
      patterns: [
        /\brestart\s+(?:apache|httpd)\s+(?:on\s+)?cpanel/i,
      ],
      command: '/usr/local/cpanel/scripts/restartsrv_httpd',
      description: 'Restart Apache on cPanel',
    },
    {
      patterns: [
        /\brestart\s+mysql\s+(?:on\s+)?cpanel/i,
      ],
      command: '/usr/local/cpanel/scripts/restartsrv_mysql',
      description: 'Restart MySQL on cPanel',
    },
    {
      patterns: [
        /\bfix\s+cpanel\s+(?:permissions|perms)/i,
      ],
      command: '/usr/local/cpanel/scripts/fixperms',
      description: 'Fix cPanel permissions',
    },
    
    // Kloxo NG Commands
    {
      patterns: [
        /\brestart\s+kloxo/i,
        /\breload\s+kloxo/i,
      ],
      command: 'systemctl restart kloxo.service && systemctl restart lxlabs.service',
      description: 'Restart Kloxo NG service',
    },
    {
      patterns: [
        /\bcheck\s+kloxo\s+(?:status|service)/i,
        /\bkloxo\s+(?:status|running)/i,
      ],
      command: 'systemctl status kloxo.service lxlabs.service --no-pager',
      description: 'Check Kloxo NG status',
    },
    {
      patterns: [
        /\bupdate\s+kloxo/i,
        /\bupgrade\s+kloxo/i,
      ],
      command: 'sh /script/update',
      description: 'Update Kloxo NG',
    },
    {
      patterns: [
        /\brestart\s+(?:lighttpd|web\s+server)\s+(?:on\s+)?kloxo/i,
      ],
      command: 'systemctl restart lighttpd',
      description: 'Restart Lighttpd on Kloxo',
    },
    {
      patterns: [
        /\brestart\s+mysql\s+(?:on\s+)?kloxo/i,
      ],
      command: 'systemctl restart mysqld || systemctl restart mariadb',
      description: 'Restart MySQL on Kloxo',
    },
    {
      patterns: [
        /\bfix\s+kloxo\s+(?:permissions|perms|ownership)/i,
      ],
      command: '/usr/local/lxlabs/kloxo/bin/fix/fixweb.sh && /usr/local/lxlabs/kloxo/bin/fix/fixmail.sh',
      description: 'Fix Kloxo permissions',
    },
    {
      patterns: [
        /\bkloxo\s+cleanup/i,
        /\bcleanup\s+kloxo/i,
      ],
      command: '/usr/local/lxlabs/kloxo/bin/fix/cleanup.sh',
      description: 'Run Kloxo cleanup',
    },

    // ============================================
    // COMPLEX IT ADMIN TASKS (Multi-Step)
    // ============================================
    
    // LAMP Stack Installation
    {
      patterns: [
        /\b(?:install|setup|configure)\s+(?:full\s+)?lamp\s+(?:stack)?/i,
        /\b(?:install|setup)\s+(?:php|apache|mysql)\s+(?:stack)?/i,
        /\b(?:install|setup)\s+php.*apache.*mysql/i,
        /\bfull\s+stack\s+(?:for\s+)?web\s+(?:hosting|pages)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Install and configure LAMP stack',
    },

    // LEMP Stack Installation
    {
      patterns: [
        /\b(?:install|setup|configure)\s+(?:full\s+)?lemp\s+(?:stack)?/i,
        /\b(?:install|setup)\s+(?:php|nginx|mysql)\s+(?:stack)?/i,
        /\b(?:install|setup)\s+php.*nginx.*mysql/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Install and configure LEMP stack',
    },

    // WordPress Setup
    {
      patterns: [
        /\b(?:install|setup|configure)\s+wordpress/i,
        /\bsetup\s+wordpress\s+(?:website|blog|site)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Install and configure WordPress',
    },

    // SSL Certificate Installation
    {
      patterns: [
        /\b(?:install|setup|configure)\s+(?:ssl|tls)\s+(?:certificate|cert)?/i,
        /\b(?:install|enable)\s+(?:https|ssl|let'?s\s+encrypt|certbot)/i,
        /\bgenerate\s+(?:ssl|tls)\s+(?:certificate|cert)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Install and configure SSL/TLS certificates',
    },

    // Security Hardening
    {
      patterns: [
        /\b(?:harden|secure|lockdown)\s+(?:server|system|linux)/i,
        /\b(?:security|security\s+hardening)\s+setup/i,
        /\bapply\s+(?:security|hardening)\s+measures/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Harden and secure the server',
    },

    // Database Setup
    {
      patterns: [
        /\b(?:setup|configure|install)\s+(?:database|mysql|mariadb|postgresql)/i,
        /\b(?:install|setup)\s+(?:mysql|mariadb)\s+(?:server|database)/i,
        /\bcreate\s+(?:database|mysql)\s+(?:user|account)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Setup and configure database server',
    },

    // Web Server Configuration
    {
      patterns: [
        /\b(?:install|setup|configure)\s+(?:apache|nginx|httpd)\s+(?:web\s+)?server/i,
        /\b(?:setup|configure)\s+(?:apache|nginx)\s+(?:for|with)\s+(?:php|ssl)/i,
        /\b(?:enable|install)\s+(?:apache|nginx|httpd)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Install and configure web server',
    },

    // Docker Setup
    {
      patterns: [
        /\b(?:install|setup|configure)\s+docker/i,
        /\b(?:install|setup)\s+docker\s+(?:containers?|compose)?/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Install and configure Docker',
    },

    // Backup Configuration
    {
      patterns: [
        /\b(?:setup|configure|enable)\s+(?:automated\s+)?backup/i,
        /\b(?:configure|setup)\s+(?:backup|disaster\s+recovery)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Setup automated backups',
    },

    // Monitoring Setup
    {
      patterns: [
        /\b(?:setup|install|configure)\s+(?:monitoring|nagios|zabbix|prometheus)/i,
        /\b(?:install|configure)\s+(?:system|server)\s+monitoring/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Setup system monitoring',
    },

    // Load Balancer Setup
    {
      patterns: [
        /\b(?:setup|configure|install)\s+(?:load\s+balancer|nginx\s+load\s+balancer)/i,
        /\b(?:configure)\s+(?:load\s+balancing|reverse\s+proxy)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Setup load balancer',
    },

    // CDN Configuration
    {
      patterns: [
        /\b(?:setup|configure|install)\s+cdn/i,
        /\b(?:configure)\s+(?:content\s+delivery\s+network)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Setup CDN configuration',
    },

    // Email Server Setup
    {
      patterns: [
        /\b(?:setup|install|configure)\s+(?:mail|email)\s+(?:server|service)/i,
        /\b(?:install|setup)\s+(?:postfix|sendmail|exim)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Setup email server',
    },

    // DNS Configuration
    {
      patterns: [
        /\b(?:setup|configure|install)\s+dns/i,
        /\b(?:configure)\s+(?:dns|bind|named)/i,
        /\b(?:setup)\s+(?:dns\s+server|nameserver)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Setup DNS server',
    },

    // VPN Configuration
    {
      patterns: [
        /\b(?:setup|configure|install)\s+vpn/i,
        /\b(?:install|setup)\s+(?:openvpn|wireguard)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Setup VPN server',
    },

    // Container Orchestration
    {
      patterns: [
        /\b(?:setup|configure|install)\s+(?:kubernetes|k8s)/i,
        /\b(?:install|setup)\s+(?:docker\s+swarm|kubernetes)/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Setup container orchestration',
    },

    // Complex Multi-Step Admin Tasks
    {
      patterns: [
        /\b(?:complete|full|comprehensive)\s+(?:setup|installation|configuration)/i,
        /\b(?:perform|execute|run)\s+(?:complex|advanced)\s+(?:setup|administration)/i,
        /\badmin\s+(?:task|automation|operation)\s+for/i,
      ],
      command: 'USE_IT_ADMIN_AUTOMATION_SKILL',
      description: 'Execute complex IT administration task',
    },
  ];

  /**
   * Translate natural language command to shell command
   * @param naturalCommand Natural language command
   * @returns Shell command or original command if no match
   */
  public translate(naturalCommand: string): string {
    if (!naturalCommand || typeof naturalCommand !== 'string') {
      return naturalCommand;
    }

    const trimmed = naturalCommand.trim();
    
    // If it already looks like a shell command, don't translate
    if (this.looksLikeShellCommand(trimmed)) {
      logger.info({ command: trimmed }, '🔍 Command looks like shell command, using as-is');
      return trimmed;
    }

    // Try to match patterns
    for (const mapping of this.commandMappings) {
      for (const pattern of mapping.patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          let shellCommand = mapping.command;
          
          // Replace capture groups ($1, $2, etc.) with matched values
          for (let i = 1; i < match.length; i++) {
            shellCommand = shellCommand.replace(`$${i}`, match[i]);
          }
          
          logger.info(
            { naturalCommand: trimmed, shellCommand, description: mapping.description },
            '✨ Translated natural language to shell command'
          );
          
          return shellCommand;
        }
      }
    }

    // No match found - log warning and return original
    logger.warn(
      { naturalCommand: trimmed },
      '⚠️ Could not translate natural language command - using as-is (may fail)'
    );
    
    return trimmed;
  }

  /**
   * Check if a string looks like it's already a shell command
   * @param command Command to check
   * @returns True if it looks like a shell command
   */
  private looksLikeShellCommand(command: string): boolean {
    // Check for natural language indicators first
    const naturalLanguageIndicators = [
      /\bthe\b/i,                     // Contains articles
      /\bplease\b/i,                  // Polite words
      /\bcan you\b/i,                 // Questions
      /\bcould you\b/i,               // Questions
      /\bwould you\b/i,               // Questions
      /\bi want\b/i,                  // Desires
      /\bi need\b/i,                  // Needs
    ];
    
    // If it has natural language indicators, it's NOT a shell command
    if (naturalLanguageIndicators.some(pattern => pattern.test(command))) {
      return false;
    }
    
    const shellIndicators = [
      /\|/,                           // Contains pipe
      /&&|\|\||;/,                    // Contains command separator
      /[<>]/,                         // Contains redirection
      /^\//,                          // Starts with absolute path
      /^\.?\//,                       // Starts with relative path
      /\$[\w\{\}]/,                   // Contains variable expansion
      /^(sudo|ssh|scp|rsync|curl|wget|tar|gzip|find|grep|awk|sed|ls|cd|pwd|cat|echo|mkdir|rm|cp|mv|chmod|chown|ps|kill|top|free|df|du|tail|head|journalctl|systemctl|apt|yum|dnf|docker|git|npm|yarn|node|python|java|gcc|make)\s+/i, // Actual shell commands
    ];

    return shellIndicators.some(pattern => pattern.test(command));
  }

  /**
   * Add custom command mapping
   * @param patterns Regex patterns to match
   * @param command Shell command (use $1, $2 for capture groups)
   * @param description Description of what the command does
   */
  public addMapping(patterns: RegExp[], command: string, description: string): void {
    this.commandMappings.push({ patterns, command, description });
    logger.info({ patterns: patterns.map(p => p.source), command }, '➕ Added custom command mapping');
  }

  /**
   * Detect if command is for system administration
   * @param naturalCommand Natural language command
   * @returns Detected category or null
   */
  public detectAdminCategory(naturalCommand: string): string | null {
    const lowerCmd = naturalCommand.toLowerCase();
    
    // System admin keywords
    if (/\b(systemctl|service|daemon|process|user|permission|file|storage|mount|partition|disk|apt|package|install|update|upgrade)\b/i.test(lowerCmd)) {
      return 'system';
    }
    
    // Network admin keywords
    if (/\b(network|interface|ip|dns|firewall|iptables|ufw|ping|traceroute|ssh|port|socket|connection|tcp|udp|route|gateway)\b/i.test(lowerCmd)) {
      return 'network';
    }
    
    // Security admin keywords
    if (/\b(security|audit|selinux|apparmor|certificate|ssl|tls|encryption|gpg|clamav|malware|vulnerability|cve|fail2ban|password|sudo|privilege)\b/i.test(lowerCmd)) {
      return 'security';
    }
    
    return null;
  }

  /**
   * Recommend appropriate tool for a task
   * @param taskDescription Task description in natural language
   * @returns Recommended tool name or null
   */
  public recommendAdminTool(taskDescription: string): string | null {
    const tool = recommendTool(taskDescription);
    if (tool) {
      logger.info(
        { task: taskDescription, recommendedTool: tool.name, category: tool.category },
        '🔧 Recommended admin tool'
      );
      return tool.name;
    }
    return null;
  }

  /**
   * Get tool recommendations for admin category
   * @param category Category name (system, network, security, etc.)
   * @returns Array of tools in that category
   */
  public getToolsForCategory(category: string): string[] {
    const tools = getToolsByCategory(category);
    return tools.map(t => t.name);
  }

  /**
   * Get enhanced translation with admin tool detection
   * @param naturalCommand Natural language command
   * @returns Object with translated command and metadata
   */
  public translateWithMetadata(naturalCommand: string): {
    command: string;
    category?: string;
    tool?: string;
    description?: string;
    confidence: number;
  } {
    const translated = this.translate(naturalCommand);
    const category = this.detectAdminCategory(naturalCommand);
    const recommendedTool = this.recommendAdminTool(naturalCommand);
    
    // Confidence score based on how specific the match was
    const confidence = this.calculateConfidence(naturalCommand, translated);
    
    return {
      command: translated,
      category: category || undefined,
      tool: recommendedTool || undefined,
      confidence,
    };
  }

  /**
   * Calculate confidence score for translation
   * @param naturalCommand Original command
   * @param translatedCommand Translated command
   * @returns Confidence score 0-100
   */
  private calculateConfidence(naturalCommand: string, translatedCommand: string): number {
    // If command was successfully translated (not just returned as-is)
    if (naturalCommand.toLowerCase().trim() !== translatedCommand.toLowerCase().trim()) {
      return 95; // High confidence - pattern matched
    }
    
    // If it looks like a shell command already
    if (this.looksLikeShellCommand(naturalCommand)) {
      return 100; // Very high confidence
    }
    
    // Low confidence - no pattern match
    return 25;
  }

  /**
   * Parse natural language command for parameters
   * Extracts URLs, file paths, service names, etc.
   * @param naturalCommand Natural language command
   * @returns Parsed parameters
   */
  public parseParameters(naturalCommand: string): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {};
    
    // Extract URLs
    const urlMatch = naturalCommand.match(/(https?:\/\/\S+)/gi);
    if (urlMatch) {
      params.urls = urlMatch;
    }
    
    // Extract file paths
    const pathMatch = naturalCommand.match(/([\/\w\-\.]+\/[\w\-\.\/]+)/g);
    if (pathMatch) {
      params.paths = pathMatch;
    }
    
    // Extract service names
    const serviceMatch = naturalCommand.match(/(?:service\s+|for\s+)(\w+)/i);
    if (serviceMatch) {
      params.service = serviceMatch[1];
    }
    
    // Extract user names
    const userMatch = naturalCommand.match(/(?:user\s+|for\s+user\s+)(\w+)/i);
    if (userMatch) {
      params.user = userMatch[1];
    }
    
    // Extract IP addresses
    const ipMatch = naturalCommand.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g);
    if (ipMatch) {
      params.ips = ipMatch;
    }
    
    return params;
  }

  /**
   * Build command with best-effort error handling
   * Supports both complete and partial natural language commands
   * @param naturalCommand Natural language command (may be truncated)
   * @param fallbackCommands Alternative commands to try
   * @returns Best matching shell command
   */
  public translateWithFallback(
    naturalCommand: string,
    fallbackCommands: string[] = []
  ): string {
    // First try normal translation
    const translated = this.translate(naturalCommand);
    
    // If it looks like a match (not just returned as-is)
    if (this.looksLikeShellCommand(translated) || translated !== naturalCommand) {
      return translated;
    }
    
    // Try fallback commands if provided
    if (fallbackCommands.length > 0) {
      logger.info(
        { command: naturalCommand, fallbacks: fallbackCommands },
        '📋 Trying fallback commands'
      );
      // Return the first fallback that looks reasonable
      return fallbackCommands[0];
    }
    
    logger.warn(
      { command: naturalCommand },
      '⚠️ No translation or fallback found'
    );
    
    return translated;
  }

  /**
   * Check if command requires IT Admin Automation Skill
   * @param naturalCommand Natural language command
   * @returns true if this needs AI-driven automation
   */
  public requiresITAdminAutomation(naturalCommand: string): boolean {
    const translated = this.translate(naturalCommand);
    return translated === 'USE_IT_ADMIN_AUTOMATION_SKILL';
  }

  /**
   * Extract IT admin task information for automation
   * @param naturalCommand Natural language command
   * @returns Task configuration for ITAdminAutomationSkill
   */
  public extractITAdminTaskInfo(
    naturalCommand: string
  ): {
    description: string;
    taskType: 'install' | 'configure' | 'troubleshoot' | 'maintain' | 'secure';
    priority: 'high' | 'medium' | 'low';
  } {
    const lowerCmd = naturalCommand.toLowerCase();

    let taskType: 'install' | 'configure' | 'troubleshoot' | 'maintain' | 'secure' = 'configure';

    if (/\b(?:install|setup|deploy)\b/i.test(lowerCmd)) {
      taskType = 'install';
    } else if (/\b(?:harden|secure|lockdown|fix|repair)\b/i.test(lowerCmd)) {
      taskType = 'secure';
    } else if (/\b(?:troubleshoot|debug|diagnose|fix|problem)\b/i.test(lowerCmd)) {
      taskType = 'troubleshoot';
    } else if (/\b(?:maintain|update|upgrade|patch)\b/i.test(lowerCmd)) {
      taskType = 'maintain';
    }

    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (/\b(?:urgent|critical|asap|immediately|emergency)\b/i.test(lowerCmd)) {
      priority = 'high';
    } else if (/\b(?:low\s+priority|background|whenever|leisurely)\b/i.test(lowerCmd)) {
      priority = 'low';
    }

    return {
      description: naturalCommand,
      taskType,
      priority,
    };
  }
}

// Export singleton instance
const commandTranslator = new CommandTranslator();
export default commandTranslator;
