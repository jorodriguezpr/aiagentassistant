/**
 * AI Agent Assistant (AiAgentAssistant)
 * AdminToolsKnowledgeBase - Comprehensive Ubuntu Linux admin tools reference
 * 
 * Covers tools for:
 * - System Administration
 * - Network Administration
 * - Security Administration
 */

export interface AdminTool {
  name: string;
  aliases: string[];
  category: 'system' | 'network' | 'security' | 'file' | 'user' | 'process' | 'storage';
  description: string;
  examples: string[];
  package?: string;
  requiredRoles?: string[];
}

export const ADMIN_TOOLS_DATABASE: Record<string, AdminTool> = {
  // SYSTEM ADMINISTRATION
  systemctl: {
    name: 'systemctl',
    aliases: ['systemd', 'service-control'],
    category: 'system',
    description: 'Control systemd services and system state',
    examples: [
      'systemctl status nginx',
      'systemctl restart postgresql',
      'systemctl enable mysql',
      'systemctl list-units --type=service',
    ],
    requiredRoles: ['admin', 'root'],
  },
  apt: {
    name: 'apt',
    aliases: ['apt-get', 'package-manager', 'install'],
    category: 'system',
    description: 'Ubuntu package manager for software installation and updates',
    examples: [
      'apt update && apt upgrade',
      'apt install nodejs',
      'apt remove docker.io',
      'apt search nginx',
    ],
    requiredRoles: ['admin', 'root'],
  },
  snap: {
    name: 'snap',
    aliases: ['snapcraft'],
    category: 'system',
    description: 'Universal Linux package manager (alternative to apt)',
    examples: [
      'snap install slack',
      'snap refresh',
      'snap list',
    ],
    requiredRoles: ['admin', 'root'],
  },
  journalctl: {
    name: 'journalctl',
    aliases: ['journal', 'logs', 'system-logs'],
    category: 'system',
    description: 'View and manage systemd journal logs',
    examples: [
      'journalctl -xe',
      'journalctl -u nginx -n 50',
      'journalctl --since today',
      'journalctl -f',
    ],
  },
  dmesg: {
    name: 'dmesg',
    aliases: ['kernel-log', 'system-messages'],
    category: 'system',
    description: 'Display kernel ring buffer messages',
    examples: [
      'dmesg | tail -20',
      'dmesg -T',
    ],
  },
  systemd_analyze: {
    name: 'systemd-analyze',
    aliases: ['boot-time', 'service-timing'],
    category: 'system',
    description: 'Analyze systemd system performance',
    examples: [
      'systemd-analyze',
      'systemd-analyze blame',
      'systemd-analyze plot > boot.svg',
    ],
  },

  // USER & PERMISSION MANAGEMENT
  useradd: {
    name: 'useradd',
    aliases: ['add-user', 'new-user'],
    category: 'user',
    description: 'Create new user account',
    examples: [
      'useradd -m -s /bin/bash newuser',
      'useradd -m -G sudo admin',
    ],
    requiredRoles: ['admin', 'root'],
  },
  usermod: {
    name: 'usermod',
    aliases: ['modify-user', 'change-user'],
    category: 'user',
    description: 'Modify user account properties',
    examples: [
      'usermod -aG docker username',
      'usermod -aG sudo username',
      'usermod -s /bin/bash username',
    ],
    requiredRoles: ['admin', 'root'],
  },
  userdel: {
    name: 'userdel',
    aliases: ['delete-user', 'remove-user'],
    category: 'user',
    description: 'Delete user account',
    examples: [
      'userdel -r username',
    ],
    requiredRoles: ['admin', 'root'],
  },
  passwd: {
    name: 'passwd',
    aliases: ['password', 'change-password'],
    category: 'user',
    description: 'Change user password or password properties',
    examples: [
      'passwd username',
      'passwd -l username',
      'passwd -u username',
    ],
  },
  sudo: {
    name: 'sudo',
    aliases: ['superuser', 'admin-privilege'],
    category: 'user',
    description: 'Execute commands with superuser privileges',
    examples: [
      'sudo systemctl restart nginx',
      'sudo apt update',
    ],
    requiredRoles: ['admin', 'sudo-group'],
  },
  sudoedit: {
    name: 'sudoedit',
    aliases: ['sudo-edit', 'admin-edit'],
    category: 'user',
    description: 'Edit files with elevated privileges safely',
    examples: [
      'sudoedit /etc/sudoers',
      'sudoedit /etc/hosts',
    ],
    requiredRoles: ['admin', 'root'],
  },
  chmod: {
    name: 'chmod',
    aliases: ['permissions', 'change-mode'],
    category: 'file',
    description: 'Change file/directory permissions',
    examples: [
      'chmod 755 script.sh',
      'chmod -R 750 /var/www',
      'chmod u+x file.sh',
    ],
  },
  chown: {
    name: 'chown',
    aliases: ['change-owner', 'ownership'],
    category: 'file',
    description: 'Change file/directory owner and group',
    examples: [
      'chown -R www-data:www-data /var/www',
      'chown user:group file.txt',
    ],
    requiredRoles: ['admin', 'root'],
  },
  chgrp: {
    name: 'chgrp',
    aliases: ['change-group', 'group-owner'],
    category: 'file',
    description: 'Change file/directory group ownership',
    examples: [
      'chgrp docker file.txt',
      'chgrp -R users directory/',
    ],
    requiredRoles: ['admin', 'root'],
  },

  // STORAGE & FILESYSTEM
  lsblk: {
    name: 'lsblk',
    aliases: ['block-devices', 'disks', 'storage'],
    category: 'storage',
    description: 'List block devices and partitions',
    examples: [
      'lsblk',
      'lsblk -f',
      'lsblk -O',
    ],
  },
  fdisk: {
    name: 'fdisk',
    aliases: ['disk-partition', 'partition-table'],
    category: 'storage',
    description: 'Interactive disk partition tool',
    examples: [
      'fdisk -l',
      'fdisk /dev/sda',
    ],
    requiredRoles: ['admin', 'root'],
  },
  parted: {
    name: 'parted',
    aliases: ['partitioning', 'partition-edit'],
    category: 'storage',
    description: 'GNU Parted - partition editor',
    examples: [
      'parted -l',
      'parted /dev/sda',
    ],
    requiredRoles: ['admin', 'root'],
  },
  mount: {
    name: 'mount',
    aliases: ['mount-filesystem', 'attach-drive'],
    category: 'storage',
    description: 'Mount filesystems',
    examples: [
      'mount /dev/sdb1 /mnt/backup',
      'mount -t nfs 192.168.1.100:/share /mnt/nfs',
    ],
    requiredRoles: ['admin', 'root'],
  },
  umount: {
    name: 'umount',
    aliases: ['unmount', 'detach-drive'],
    category: 'storage',
    description: 'Unmount filesystems',
    examples: [
      'umount /mnt/backup',
      'umount -l /mnt/nfs',
    ],
    requiredRoles: ['admin', 'root'],
  },
  df: {
    name: 'df',
    aliases: ['disk-space', 'filesystem-usage', 'disk-usage'],
    category: 'storage',
    description: 'Display disk space usage of filesystems',
    examples: [
      'df -h',
      'df -i',
      'df -T',
    ],
  },
  du: {
    name: 'du',
    aliases: ['directory-usage', 'size', 'folder-size'],
    category: 'storage',
    description: 'Display disk usage of files and directories',
    examples: [
      'du -sh .',
      'du -sh /*',
      'du -sh /var/log/*',
    ],
  },

  // PROCESS MANAGEMENT
  ps: {
    name: 'ps',
    aliases: ['processes', 'process-list'],
    category: 'process',
    description: 'List running processes',
    examples: [
      'ps aux',
      'ps aux | grep nginx',
      'ps -eo pid,user,cmd',
    ],
  },
  top: {
    name: 'top',
    aliases: ['process-monitor', 'system-monitor'],
    category: 'process',
    description: 'Interactive process monitor',
    examples: [
      'top -bn1 | head -20',
      'top -u username',
    ],
  },
  htop: {
    name: 'htop',
    aliases: ['advanced-monitor', 'interactive-processes'],
    category: 'process',
    description: 'Enhanced interactive process viewer',
    examples: [
      'htop',
      'htop -u username',
    ],
    package: 'htop',
  },
  kill: {
    name: 'kill',
    aliases: ['terminate-process', 'stop-process'],
    category: 'process',
    description: 'Terminate processes',
    examples: [
      'kill -9 1234',
      'killall nginx',
    ],
  },
  pkill: {
    name: 'pkill',
    aliases: ['kill-by-name', 'terminate-by-pattern'],
    category: 'process',
    description: 'Kill processes by name pattern',
    examples: [
      'pkill -f python',
      'pkill -u username',
    ],
  },

  // NETWORK ADMINISTRATION
  ip: {
    name: 'ip',
    aliases: ['network-config', 'interface', 'routing'],
    category: 'network',
    description: 'Configure network interfaces and routing',
    examples: [
      'ip addr show',
      'ip route show',
      'ip link show',
      'ip addr add 192.168.1.100/24 dev eth0',
    ],
    requiredRoles: ['admin', 'root'],
  },
  ifconfig: {
    name: 'ifconfig',
    aliases: ['network-interfaces', 'interface-config'],
    category: 'network',
    description: 'Configure network interfaces (legacy)',
    examples: [
      'ifconfig',
      'ifconfig eth0',
      'ifconfig eth0 192.168.1.100',
    ],
    package: 'net-tools',
  },
  netplan: {
    name: 'netplan',
    aliases: ['network-plan', 'persistent-network'],
    category: 'network',
    description: 'Configure persistent network settings',
    examples: [
      'netplan show',
      'netplan apply',
      'netplan validate',
    ],
    requiredRoles: ['admin', 'root'],
  },
  ss: {
    name: 'ss',
    aliases: ['socket-statistics', 'connections', 'listening-ports'],
    category: 'network',
    description: 'Display network socket statistics',
    examples: [
      'ss -tulpn',
      'ss -tulpn | grep LISTEN',
      'ss -i',
    ],
  },
  netstat: {
    name: 'netstat',
    aliases: ['network-statistics', 'network-status'],
    category: 'network',
    description: 'Display network statistics (legacy)',
    examples: [
      'netstat -tulpn',
      'netstat -i',
    ],
    package: 'net-tools',
  },
  iptables: {
    name: 'iptables',
    aliases: ['firewall-rules', 'packet-filter'],
    category: 'network',
    description: 'Configure Linux kernel firewall rules',
    examples: [
      'iptables -L',
      'iptables -A INPUT -p tcp --dport 22 -j ACCEPT',
    ],
    requiredRoles: ['admin', 'root'],
  },
  ufw: {
    name: 'ufw',
    aliases: ['firewall', 'firewall-rules'],
    category: 'network',
    description: 'Uncomplicated Firewall - simple firewall management',
    examples: [
      'ufw enable',
      'ufw allow 22',
      'ufw status',
    ],
    requiredRoles: ['admin', 'root'],
    package: 'ufw',
  },
  ping: {
    name: 'ping',
    aliases: ['test-connection', 'connectivity'],
    category: 'network',
    description: 'Test network connectivity',
    examples: [
      'ping -c 5 8.8.8.8',
      'ping google.com',
    ],
  },
  traceroute: {
    name: 'traceroute',
    aliases: ['trace-route', 'path', 'hops'],
    category: 'network',
    description: 'Trace network packet path to destination',
    examples: [
      'traceroute google.com',
      'traceroute -m 30 192.168.1.1',
    ],
    package: 'traceroute',
  },
  tracert: {
    name: 'tracert',
    aliases: ['trace-route-windows'],
    category: 'network',
    description: 'Windows equivalent of traceroute (use traceroute on Linux)',
    examples: [],
  },
  nmap: {
    name: 'nmap',
    aliases: ['port-scan', 'network-scan', 'service-discovery'],
    category: 'network',
    description: 'Network mapper - port scanning and service discovery',
    examples: [
      'nmap localhost',
      'nmap -p 22,80,443 192.168.1.0/24',
      'nmap -sV localhost',
    ],
    package: 'nmap',
  },
  dig: {
    name: 'dig',
    aliases: ['dns-lookup', 'dns-query', 'domain-lookup'],
    category: 'network',
    description: 'DNS lookup utility',
    examples: [
      'dig example.com',
      'dig @8.8.8.8 example.com',
      'dig +short example.com',
    ],
    package: 'dnsutils',
  },
  nslookup: {
    name: 'nslookup',
    aliases: ['dns-resolve', 'reverse-dns'],
    category: 'network',
    description: 'Query DNS for domain name lookups',
    examples: [
      'nslookup example.com',
      'nslookup 8.8.8.8',
    ],
  },
  host: {
    name: 'host',
    aliases: ['dns-lookup-tool', 'hostname-to-ip'],
    category: 'network',
    description: 'DNS lookup utility',
    examples: [
      'host example.com',
      'host -a example.com',
    ],
    package: 'bind-utils',
  },
  curl: {
    name: 'curl',
    aliases: ['http-request', 'web-request', 'download-tool'],
    category: 'network',
    description: 'Transfer data using URLs - HTTP/HTTPS requests',
    examples: [
      'curl https://example.com',
      'curl -X POST -d "data" https://api.example.com',
      'curl -H "Authorization: Bearer token" https://api.example.com',
    ],
  },
  wget: {
    name: 'wget',
    aliases: ['file-download', 'web-download', 'recursive-download'],
    category: 'network',
    description: 'Non-interactive network downloader',
    examples: [
      'wget https://example.com/file.zip',
      'wget -r https://example.com',
      'wget -O filename.zip https://example.com/file.zip',
    ],
  },
  tcpdump: {
    name: 'tcpdump',
    aliases: ['packet-capture', 'network-capture'],
    category: 'network',
    description: 'Capture and analyze network packets',
    examples: [
      'tcpdump -i eth0',
      'tcpdump -i eth0 -n -q',
      'tcpdump -w capture.pcap',
    ],
    requiredRoles: ['admin', 'root'],
    package: 'tcpdump',
  },

  // SECURITY ADMINISTRATION
  fail2ban: {
    name: 'fail2ban',
    aliases: ['intrusion-prevention', 'attack-prevention'],
    category: 'security',
    description: 'Bans hosts that show malicious activity',
    examples: [
      'fail2ban-client status',
      'fail2ban-client set sshd banip 192.168.1.100',
    ],
    requiredRoles: ['admin', 'root'],
    package: 'fail2ban',
  },
  sudo_rules: {
    name: 'sudoers',
    aliases: ['sudo-config', 'privilege-rules', 'sudo-permissions'],
    category: 'security',
    description: 'Configure sudo privilege rules',
    examples: [
      'sudoedit /etc/sudoers',
    ],
    requiredRoles: ['admin', 'root'],
  },
  auditd: {
    name: 'auditd',
    aliases: ['audit-daemon', 'system-audit', 'audit-logs'],
    category: 'security',
    description: 'Linux Audit Framework - system auditing',
    examples: [
      'systemctl status auditd',
      'ausearch -m EXECVE -i',
    ],
    requiredRoles: ['admin', 'root'],
    package: 'auditd',
  },
  ausearch: {
    name: 'ausearch',
    aliases: ['search-audit', 'audit-query'],
    category: 'security',
    description: 'Search audit logs',
    examples: [
      'ausearch -m EXECVE -i -ts recent',
      'ausearch -ua 1000',
    ],
    package: 'auditd',
  },
  selinux: {
    name: 'selinux',
    aliases: ['selinux-status', 'security-enhanced-linux'],
    category: 'security',
    description: 'Security-Enhanced Linux context management',
    examples: [
      'getenforce',
      'semanage user -l',
    ],
    package: 'policycoreutils',
  },
  apparmor: {
    name: 'apparmor',
    aliases: ['apparmor-status', 'mandatory-access-control'],
    category: 'security',
    description: 'AppArmor mandatory access control',
    examples: [
      'aa-status',
      'aa-enforce /etc/apparmor.d/usr.bin.man',
    ],
    package: 'apparmor-utils',
  },
  clamav: {
    name: 'clamav',
    aliases: ['clamscan', 'antivirus', 'malware-scan'],
    category: 'security',
    description: 'ClamAV antivirus scanner',
    examples: [
      'clamscan /home',
      'clamscan -r /var/www',
    ],
    package: 'clamav',
  },
  aide: {
    name: 'aide',
    aliases: ['file-integrity', 'file-monitoring'],
    category: 'security',
    description: 'File Integrity Checker',
    examples: [
      'aide --config=/etc/aide/aide.conf --init',
      'aide --check',
    ],
    package: 'aide',
  },
  openssl: {
    name: 'openssl',
    aliases: ['ssl-certificate', 'encryption', 'certificate-management'],
    category: 'security',
    description: 'OpenSSL cryptography and SSL/TLS toolkit',
    examples: [
      'openssl genrsa -out private.key 2048',
      'openssl x509 -in cert.pem -text -noout',
      'openssl s_client -connect example.com:443',
    ],
  },
  gpg: {
    name: 'gpg',
    aliases: ['gnupg', 'encryption-keys', 'digital-signature'],
    category: 'security',
    description: 'GNU Privacy Guard - encryption and digital signatures',
    examples: [
      'gpg --gen-key',
      'gpg --encrypt -r user@example.com file.txt',
    ],
    package: 'gnupg',
  },

  // LOGGING & MONITORING
  rsyslog: {
    name: 'rsyslog',
    aliases: ['syslog', 'system-logging'],
    category: 'system',
    description: 'Rocket-fast System for Log processing',
    examples: [
      'systemctl status rsyslog',
      'tail -f /var/log/syslog',
    ],
  },
};

/**
 * Get admin tool by name or alias
 */
export function findAdminTool(query: string): AdminTool | null {
  const normalizedQuery = query.toLowerCase().trim();

  for (const [, tool] of Object.entries(ADMIN_TOOLS_DATABASE)) {
    if (
      tool.name.toLowerCase() === normalizedQuery ||
      tool.aliases.some(alias => alias.toLowerCase() === normalizedQuery)
    ) {
      return tool;
    }
  }

  return null;
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): AdminTool[] {
  return Object.values(ADMIN_TOOLS_DATABASE).filter(
    tool => tool.category === category.toLowerCase()
  );
}

/**
 * Get recommended tool for a task based on keywords
 */
export function recommendTool(taskDescription: string): AdminTool | null {
  const lowerDesc = taskDescription.toLowerCase();
  let bestMatch: { tool: AdminTool; score: number } | null = null;

  for (const tool of Object.values(ADMIN_TOOLS_DATABASE)) {
    let score = 0;

    // Check tool name
    if (lowerDesc.includes(tool.name.toLowerCase())) {
      score += 100;
    }

    // Check aliases
    for (const alias of tool.aliases) {
      if (lowerDesc.includes(alias.toLowerCase())) {
        score += 50;
      }
    }

    // Check description keywords
    const descWords = tool.description.toLowerCase().split(' ');
    for (const word of descWords) {
      if (word.length > 3 && lowerDesc.includes(word)) {
        score += 10;
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { tool, score };
    }
  }

  return bestMatch?.tool || null;
}
