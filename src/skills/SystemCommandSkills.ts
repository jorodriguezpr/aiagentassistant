/**
 * AI Agent Assistant (AiAgentAssistant)
 * System Command Skills - Direct command execution for common queries
 * 
 * This module provides built-in knowledge of system commands for common tasks
 * like DNS lookups, network diagnostics, system information, etc.
 * 
 * Unlike generic command execution, these skills KNOW which command to use,
 * eliminating the need for AI model assistance.
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as dnsPromises } from 'dns';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import logger from '../utils/logger';
import { Skill } from '../types';
import { userPreferencesManager } from '../utils/UserPreferencesManager.js';
import commandTranslator from '../utils/CommandTranslator.js';
import { getCredentialManager } from '../utils/CredentialManager.js';

const execAsync = promisify(exec);

/**
 * Check if system is Windows
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Tool installation packages mapping
 * Maps tool names to package names for different package managers
 */
const TOOL_PACKAGES: Record<string, { apt?: string; yum?: string; brew?: string; choco?: string; winget?: string; description: string }> = {
  'dig': { apt: 'dnsutils', yum: 'bind-utils', brew: 'bind', description: 'DNS lookup tool' },
  'nslookup': { apt: 'dnsutils', yum: 'bind-utils', brew: 'bind', description: 'DNS lookup tool' },
  'ping': { apt: 'iputils-ping', yum: 'iputils', brew: 'iputils', description: 'Network connectivity test' },
  'traceroute': { apt: 'traceroute', yum: 'traceroute', brew: 'traceroute', description: 'Network path tracing' },
  'whois': { apt: 'whois', yum: 'whois', brew: 'whois', description: 'Domain registration lookup' },
  'netstat': { apt: 'net-tools', yum: 'net-tools', brew: 'net-tools', description: 'Network statistics' },
  'openssl': { apt: 'openssl', yum: 'openssl', brew: 'openssl', description: 'SSL/TLS toolkit' },
  'speedtest-cli': { apt: 'speedtest-cli', yum: 'speedtest-cli', brew: 'speedtest-cli', description: 'Internet speed test' },
  'systemctl': { apt: 'systemd', yum: 'systemd', description: 'System service manager' },
  'curl': { apt: 'curl', yum: 'curl', brew: 'curl', choco: 'curl', winget: 'curl', description: 'HTTP client' },
  'wget': { apt: 'wget', yum: 'wget', brew: 'wget', choco: 'wget', winget: 'wget', description: 'File downloader' },
};

/**
 * Check if a tool is installed on the system
 */
async function isToolInstalled(toolName: string): Promise<boolean> {
  try {
    const checkCommand = isWindows() 
      ? `where ${toolName}`
      : `which ${toolName}`;
    
    const result = await executeCommand(checkCommand, 2000);
    return result !== null && result.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get installation command for a tool based on the system
 */
function getInstallCommand(toolName: string): string | null {
  const packageInfo = TOOL_PACKAGES[toolName];
  if (!packageInfo) {
    return null;
  }

  if (isWindows()) {
    // Try chocolatey first, then winget
    if (packageInfo.choco) {
      return `choco install ${packageInfo.choco} -y`;
    }
    if (packageInfo.winget) {
      return `winget install ${packageInfo.winget}`;
    }
    return null;
  }

  // Linux/Unix - detect package manager
  // Most common is apt (Debian/Ubuntu), so default to that
  if (packageInfo.apt) {
    return `sudo apt-get install -y ${packageInfo.apt}`;
  }
  if (packageInfo.yum) {
    return `sudo yum install -y ${packageInfo.yum}`;
  }
  
  return null;
}

/**
 * Execute a command with timeout and error handling
 * Returns null if command is not found, throws for other errors
 */
async function executeCommand(command: string, timeoutMs: number = 10000): Promise<string | null> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB buffer
    });
    
    // Check if command was not found
    if (stderr && (stderr.includes('not found') || stderr.includes('command not found'))) {
      return null;
    }
    
    if (stderr && !stdout) {
      return stderr.trim();
    }
    
    return stdout.trim();
  } catch (error: any) {
    // Check if command was not found
    if (error.message && (error.message.includes('not found') || error.message.includes('command not found'))) {
      return null;
    }
    
    if (error.killed) {
      throw new Error(`Command timed out after ${timeoutMs}ms`);
    }
    throw new Error(error.message || 'Command execution failed');
  }
}

/**
 * DNS Lookup - Get IP address(es) for a domain
 * Automatically uses dig (Linux/Mac), nslookup (Windows), or Node.js built-in DNS
 */
export const dnsLookupSkill: Skill = {
  name: 'dns_lookup',
  description: 'Perform DNS lookup to get IP address(es) for a domain. Works on both Windows and Linux.',
  execute: async (params: Record<string, any>) => {
    const domain = params.domain;
    
    if (!domain) {
      throw new Error('Domain parameter is required');
    }

    logger.info({ domain }, 'Performing DNS lookup');

    try {
      let command: string;
      let output: string | null;

      if (isWindows()) {
        // Windows: use nslookup
        command = `nslookup ${domain}`;
        output = await executeCommand(command);
        
        if (output === null) {
          // nslookup not found, use Node.js built-in DNS
          logger.warn('nslookup not found, using Node.js built-in DNS');
          const addresses = await dnsPromises.resolve4(domain);
          return {
            domain,
            ipAddresses: addresses,
            allAddresses: addresses.join(', '),
            type: 'IPv4',
            method: 'Node.js built-in DNS',
            timestamp: new Date().toISOString(),
          };
        }
        
        // Parse nslookup output
        const ipv4Matches = output.match(/Address(?:es)?:\s*([0-9.]+)/g);
        const ipAddresses = ipv4Matches?.map(match => match.split(':')[1].trim()) || [];
        
        return {
          domain,
          ipAddresses,
          allAddresses: ipAddresses.join(', ') || 'No IP addresses found',
          rawOutput: output,
          command,
          method: 'nslookup',
          timestamp: new Date().toISOString(),
        };
      } else {
        // Linux/Mac: prefer dig, fallback to nslookup, then Node.js DNS
        try {
          command = `dig +short ${domain} A`;
          output = await executeCommand(command, 5000);
          
          if (output === null) {
            // dig not found, try nslookup
            logger.warn('dig not found, trying nslookup');
            command = `nslookup ${domain}`;
            output = await executeCommand(command, 5000);
            
            if (output === null) {
              // nslookup also not found, use Node.js built-in DNS
              logger.warn('nslookup not found, using Node.js built-in DNS');
              try {
                const addresses = await dnsPromises.resolve4(domain);
                return {
                  domain,
                  ipAddresses: addresses,
                  allAddresses: addresses.join(', '),
                  type: 'IPv4',
                  method: 'Node.js built-in DNS',
                  timestamp: new Date().toISOString(),
                };
              } catch (dnsError: any) {
                // Try IPv6
                const addressesV6 = await dnsPromises.resolve6(domain);
                return {
                  domain,
                  ipAddresses: addressesV6,
                  allAddresses: addressesV6.join(', '),
                  type: 'IPv6',
                  method: 'Node.js built-in DNS',
                  timestamp: new Date().toISOString(),
                };
              }
            }
            
            // Parse nslookup output
            const lines = output.split('\n');
            const ipAddresses: string[] = [];
            let foundAddress = false;
            
            for (const line of lines) {
              if (foundAddress && /^Address:\s*([0-9.]+)/.test(line)) {
                const match = line.match(/^Address:\s*([0-9.]+)/);
                if (match) ipAddresses.push(match[1]);
              }
              if (line.includes('Name:')) foundAddress = true;
            }
            
            return {
              domain,
              ipAddresses,
              allAddresses: ipAddresses.join(', ') || 'No IP addresses found',
              rawOutput: output,
              command,
              method: 'nslookup',
              timestamp: new Date().toISOString(),
            };
          }

          const ipAddresses = output.split('\n').filter(line => 
            line.trim() && /^[0-9.]+$/.test(line.trim())
          );

          if (ipAddresses.length === 0) {
            // Try AAAA (IPv6)
            command = `dig +short ${domain} AAAA`;
            output = await executeCommand(command, 5000);
            
            if (output === null) {
              // Fallback to Node.js DNS for IPv6
              const addressesV6 = await dnsPromises.resolve6(domain);
              return {
                domain,
                ipAddresses: addressesV6,
                allAddresses: addressesV6.join(', '),
                type: 'IPv6',
                method: 'Node.js built-in DNS',
                timestamp: new Date().toISOString(),
              };
            }
            
            const ipv6Addresses = output.split('\n').filter(line => line.trim());
            
            return {
              domain,
              ipAddresses: ipv6Addresses,
              allAddresses: ipv6Addresses.join(', ') || 'No IP addresses found',
              type: 'IPv6',
              rawOutput: output,
              command,
              method: 'dig',
              timestamp: new Date().toISOString(),
            };
          }

          return {
            domain,
            ipAddresses,
            allAddresses: ipAddresses.join(', '),
            type: 'IPv4',
            rawOutput: output,
            command,
            method: 'dig',
            timestamp: new Date().toISOString(),
          };
        } catch (digError) {
          // If all command-line tools fail, use Node.js built-in DNS
          logger.warn({ error: digError }, 'Command-line DNS tools failed, using Node.js built-in DNS');
          try {
            const addresses = await dnsPromises.resolve4(domain);
            return {
              domain,
              ipAddresses: addresses,
              allAddresses: addresses.join(', '),
              type: 'IPv4',
              method: 'Node.js built-in DNS (fallback)',
              timestamp: new Date().toISOString(),
            };
          } catch (v4Error) {
            // Try IPv6
            const addressesV6 = await dnsPromises.resolve6(domain);
            return {
              domain,
              ipAddresses: addressesV6,
              allAddresses: addressesV6.join(', '),
              type: 'IPv6',
              method: 'Node.js built-in DNS (fallback)',
              timestamp: new Date().toISOString(),
            };
          }
        }
      }
    } catch (error: any) {
      logger.error({ error, domain }, 'DNS lookup failed');
      throw new Error(`DNS lookup failed for ${domain}: ${error.message}`);
    }
  },
};

/**
 * Reverse DNS Lookup - Get domain name from IP address
 */
export const reverseDnsLookupSkill: Skill = {
  name: 'reverse_dns_lookup',
  description: 'Perform reverse DNS lookup to get domain name from an IP address.',
  execute: async (params: Record<string, any>) => {
    const ip = params.ip;
    
    if (!ip) {
      throw new Error('IP address parameter is required');
    }

    logger.info({ ip }, 'Performing reverse DNS lookup');

    try {
      let command: string;
      let output: string | null;
      
      if (isWindows()) {
        command = `nslookup ${ip}`;
        output = await executeCommand(command, 5000);
        
        if (output === null) {
          // Use Node.js built-in DNS
          logger.warn('nslookup not found, using Node.js built-in DNS');
          const hostnames = await dnsPromises.reverse(ip);
          return {
            ip,
            hostname: hostnames[0] || 'No hostname found',
            allHostnames: hostnames.join(', '),
            method: 'Node.js built-in DNS',
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        command = `dig +short -x ${ip}`;
        output = await executeCommand(command, 5000);
        
        if (output === null) {
          // dig not found, use Node.js built-in DNS
          logger.warn('dig not found, using Node.js built-in DNS');
          const hostnames = await dnsPromises.reverse(ip);
          return {
            ip,
            hostname: hostnames[0] || 'No hostname found',
            allHostnames: hostnames.join(', '),
            method: 'Node.js built-in DNS',
            timestamp: new Date().toISOString(),
          };
        }
      }

      return {
        ip,
        hostname: output || 'No hostname found',
        rawOutput: output,
        command,
        method: isWindows() ? 'nslookup' : 'dig',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, ip }, 'Reverse DNS lookup failed');
      throw new Error(`Reverse DNS lookup failed for ${ip}: ${error.message}`);
    }
  },
};

/**
 * Ping Host - Check if a host is reachable
 */
export const pingHostSkill: Skill = {
  name: 'ping_host',
  description: 'Ping a host to check if it is reachable and measure latency.',
  execute: async (params: Record<string, any>) => {
    const host = params.host;
    const count = params.count || 4;
    
    if (!host) {
      throw new Error('Host parameter is required');
    }

    logger.info({ host, count }, 'Pinging host');

    try {
      let command: string;
      
      if (isWindows()) {
        command = `ping -n ${count} ${host}`;
      } else {
        command = `ping -c ${count} ${host}`;
      }

      const output = await executeCommand(command, 15000);
      
      if (output === null) {
        throw new Error('ping command not found on system');
      }

      // Parse ping output for statistics
      const lostMatch = output.match(/(\d+)% (?:packet )?loss/i);
      const packetLoss = lostMatch ? lostMatch[1] : 'unknown';
      
      const avgMatch = output.match(/(?:Average|avg)[^\d]+([\d.]+)/i);
      const avgLatency = avgMatch ? avgMatch[1] : 'unknown';

      return {
        host,
        reachable: !output.toLowerCase().includes('100% packet loss'),
        packetLoss: `${packetLoss}%`,
        averageLatency: avgLatency !== 'unknown' ? `${avgLatency}ms` : 'N/A',
        rawOutput: output,
        command,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host }, 'Ping failed');
      
      return {
        host,
        reachable: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
};

/**
 * Port Check - Check if a port is open on a host
 */
export const portCheckSkill: Skill = {
  name: 'port_check',
  description: 'Check if a specific port is open on a host.',
  execute: async (params: Record<string, any>) => {
    const host = params.host;
    const port = params.port;
    
    if (!host || !port) {
      throw new Error('Host and port parameters are required');
    }

    logger.info({ host, port }, 'Checking port');

    try {
      let command: string;
      
      if (isWindows()) {
        // Windows: use PowerShell Test-NetConnection
        command = `powershell -Command "Test-NetConnection -ComputerName ${host} -Port ${port} -InformationLevel Quiet"`;
      } else {
        // Linux: use nc (netcat) or timeout + bash TCP
        command = `timeout 5 bash -c "echo >/dev/tcp/${host}/${port}" 2>/dev/null && echo "open" || echo "closed"`;
      }

      const output = await executeCommand(command, 10000);
      
      if (output === null) {
        throw new Error('Port check command not available on system');
      }
      
      const isOpen = output.toLowerCase().includes('true') || output.toLowerCase().includes('open');

      return {
        host,
        port,
        status: isOpen ? 'open' : 'closed',
        isOpen,
        rawOutput: output,
        command,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host, port }, 'Port check failed');
      
      return {
        host,
        port,
        status: 'unknown',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
};

/**
 * Get Public IP - Get the public IP address of this system
 */
export const getPublicIpSkill: Skill = {
  name: 'get_public_ip',
  description: 'Get the public IP address of this system.',
  execute: async (params: Record<string, any>) => {
    logger.info('Getting public IP address');

    try {
      // Try multiple services for reliability
      const services = [
        'https://api.ipify.org?format=json',
        'https://ipinfo.io/json',
        'https://ifconfig.me/all.json',
      ];

      let result: any = null;
      let service = '';

      for (const url of services) {
        try {
          const command = isWindows() 
            ? `powershell -Command "(Invoke-WebRequest -Uri '${url}').Content"`
            : `curl -s "${url}"`;
          
          const output = await executeCommand(command, 5000);
          if (!output) continue;
          
          const data = JSON.parse(output);
          
          result = data;
          service = url;
          break;
        } catch (err) {
          continue;
        }
      }

      if (!result) {
        throw new Error('All IP services failed');
      }

      return {
        publicIp: result.ip || result.ip_addr,
        service,
        additionalInfo: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Get public IP failed');
      throw new Error(`Get public IP failed: ${error.message}`);
    }
  },
};

/**
 * Traceroute - Trace the route to a host
 */
export const tracerouteSkill: Skill = {
  name: 'traceroute',
  description: 'Trace the network route to a host.',
  execute: async (params: Record<string, any>) => {
    const host = params.host;
    
    if (!host) {
      throw new Error('Host parameter is required');
    }

    logger.info({ host }, 'Running traceroute');

    try {
      let command: string;
      
      if (isWindows()) {
        command = `tracert -h 15 ${host}`;
      } else {
        command = `traceroute -m 15 ${host}`;
      }

      const output = await executeCommand(command, 30000);

      return {
        host,
        route: output,
        rawOutput: output,
        command,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host }, 'Traceroute failed');
      throw new Error(`Traceroute failed: ${error.message}`);
    }
  },
};

/**
 * WHOIS Lookup - Get domain registration information
 */
export const whoisLookupSkill: Skill = {
  name: 'whois_lookup',
  description: 'Get WHOIS information for a domain.',
  execute: async (params: Record<string, any>) => {
    const domain = params.domain;
    
    if (!domain) {
      throw new Error('Domain parameter is required');
    }

    logger.info({ domain }, 'Performing WHOIS lookup');

    try {
      const command = `whois ${domain}`;
      const output = await executeCommand(command, 10000);

      return {
        domain,
        whoisInfo: output,
        rawOutput: output,
        command,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, domain }, 'WHOIS lookup failed');
      throw new Error(`WHOIS lookup failed: ${error.message}`);
    }
  },
};

/**
 * Get System Info - Get basic system information
 */
export const getSystemInfoSkill: Skill = {
  name: 'get_system_info',
  description: 'Get basic system information (OS, CPU, memory, uptime).',
  execute: async (params: Record<string, any>) => {
    logger.info('Getting system information');

    try {
      let info: any = {};

      if (isWindows()) {
        const hostname = await executeCommand('hostname', 3000);
        const osInfo = await executeCommand('systeminfo | findstr /C:"OS Name" /C:"OS Version"', 5000);
        const uptime = await executeCommand('systeminfo | findstr /C:"System Boot Time"', 5000);
        
        info = {
          platform: 'Windows',
          hostname,
          osInfo,
          uptime,
        };
      } else {
        const hostname = await executeCommand('hostname', 3000);
        const osInfo = await executeCommand('uname -a', 3000);
        const uptime = await executeCommand('uptime', 3000);
        const memory = await executeCommand('free -h', 3000);
        
        info = {
          platform: 'Linux/Unix',
          hostname,
          osInfo,
          uptime,
          memory,
        };
      }

      return {
        ...info,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Get system info failed');
      throw new Error(`Get system info failed: ${error.message}`);
    }
  },
};

/**
 * Network Interfaces - List network interfaces and IP addresses
 */
export const listNetworkInterfacesSkill: Skill = {
  name: 'list_network_interfaces',
  description: 'List all network interfaces and their IP addresses.',
  execute: async (params: Record<string, any>) => {
    logger.info('Listing network interfaces');

    try {
      let command: string;
      
      if (isWindows()) {
        command = 'ipconfig';
      } else {
        command = 'ip addr show || ifconfig';
      }

      const output = await executeCommand(command, 5000);

      return {
        interfaces: output,
        rawOutput: output,
        command,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'List network interfaces failed');
      throw new Error(`List network interfaces failed: ${error.message}`);
    }
  },
};

/**
 * DNS Resolver Check - Check which DNS servers are being used
 */
export const dnsResolverCheckSkill: Skill = {
  name: 'dns_resolver_check',
  description: 'Check which DNS servers are configured on the system.',
  execute: async (params: Record<string, any>) => {
    logger.info('Checking DNS resolvers');

    try {
      let command: string;
      
      if (isWindows()) {
        command = 'ipconfig /all | findstr /C:"DNS Servers"';
      } else {
        command = 'cat /etc/resolv.conf | grep nameserver';
      }

      const output = await executeCommand(command, 3000);

      return {
        dnsServers: output,
        rawOutput: output,
        command,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'DNS resolver check failed');
      throw new Error(`DNS resolver check failed: ${error.message}`);
    }
  },
};

/**
 * SSL Certificate Check - Check SSL certificate expiry date
 */
export const sslCertificateCheckSkill: Skill = {
  name: 'ssl_certificate_check',
  description: 'Check SSL certificate expiry date and details for a domain.',
  execute: async (params: Record<string, any>) => {
    const domain = params.domain;
    const port = params.port || 443;
    
    if (!domain) {
      throw new Error('Domain parameter is required');
    }

    logger.info({ domain, port }, 'Checking SSL certificate');

    try {
      let command: string;
      let output: string | null;

      if (isWindows()) {
        // Windows: use PowerShell to check certificate
        command = `powershell -Command "$cert = [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}; $req = [System.Net.HttpWebRequest]::Create('https://${domain}:${port}'); try { $req.GetResponse() | Out-Null } catch {}; $cert = $req.ServicePoint.Certificate; if ($cert) { Write-Output \"Subject: $($cert.Subject)\"; Write-Output \"Issuer: $($cert.Issuer)\"; Write-Output \"Valid From: $($cert.GetEffectiveDateString())\"; Write-Output \"Valid Until: $($cert.GetExpirationDateString())\" } else { Write-Output 'No certificate found' }"`;
        output = await executeCommand(command, 10000);
      } else {
        // Linux: use openssl
        command = `echo | openssl s_client -servername ${domain} -connect ${domain}:${port} 2>/dev/null | openssl x509 -noout -dates -subject -issuer`;
        output = await executeCommand(command, 10000);
      }
      
      if (output === null) {
        throw new Error('SSL certificate check command not available');
      }

      // Parse expiry date
      const expiryMatch = output.match(/notAfter=(.+)|Valid Until: (.+)/);
      const expiry = expiryMatch ? (expiryMatch[1] || expiryMatch[2]).trim() : 'Unknown';
      
      const expiryDate = new Date(expiry);
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      return {
        domain,
        port,
        expiryDate: expiry,
        daysUntilExpiry,
        isExpired: daysUntilExpiry < 0,
        warningLevel: daysUntilExpiry < 7 ? 'critical' : daysUntilExpiry < 30 ? 'warning' : 'ok',
        rawOutput: output,
        command: isWindows() ? 'PowerShell certificate check' : command,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, domain }, 'SSL certificate check failed');
      throw new Error(`SSL certificate check failed: ${error.message}`);
    }
  },
};

/**
 * Bandwidth Test - Test internet connection speed
 */
export const bandwidthTestSkill: Skill = {
  name: 'bandwidth_test',
  description: 'Test internet connection speed (download/upload) using speedtest-cli.',
  execute: async (params: Record<string, any>) => {
    logger.info('Running bandwidth test');

    try {
      let command: string;

      // Check if speedtest-cli is installed
      try {
        if (isWindows()) {
          await executeCommand('where speedtest', 2000);
          command = 'speedtest --format=json';
        } else {
          await executeCommand('which speedtest-cli', 2000);
          command = 'speedtest-cli --json';
        }
      } catch (err) {
        const installCmd = getInstallCommand('speedtest-cli');
        return {
          error: true,
          toolMissing: true,
          toolName: 'speedtest-cli',
          message: 'speedtest-cli is not installed on this system.',
          installCommand: installCmd || 'pip install speedtest-cli',
          canAutoInstall: installCmd !== null,
          suggestedAction: installCmd 
            ? `I can install speedtest-cli for you. Would you like me to proceed?`
            : 'Please install manually: pip install speedtest-cli',
          timestamp: new Date().toISOString(),
        };
      }

      const output = await executeCommand(command, 60000); // 60 second timeout for speedtest
      
      if (output === null) {
        const installCmd = getInstallCommand('speedtest-cli');
        return {
          error: true,
          toolMissing: true,
          toolName: 'speedtest-cli',
          message: 'speedtest-cli command not found.',
          installCommand: installCmd || 'pip install speedtest-cli',
          canAutoInstall: installCmd !== null,
          suggestedAction: installCmd 
            ? `I can install speedtest-cli for you. Would you like me to proceed?`
            : 'Please install manually: pip install speedtest-cli',
          timestamp: new Date().toISOString(),
        };
      }

      try {
        const data = JSON.parse(output);
        const downloadMbps = (data.download / 1000000).toFixed(2);
        const uploadMbps = (data.upload / 1000000).toFixed(2);
        const ping = data.ping ? data.ping.toFixed(2) : 'N/A';

        return {
          downloadSpeed: `${downloadMbps} Mbps`,
          uploadSpeed: `${uploadMbps} Mbps`,
          ping: `${ping} ms`,
          server: data.server?.name || 'Unknown',
          sponsor: data.server?.sponsor || 'Unknown',
          rawData: data,
          timestamp: new Date().toISOString(),
        };
      } catch (parseError) {
        // Fallback to text parsing if JSON fails
        const downloadMatch = output.match(/Download:\s*([\d.]+)\s*Mbit/i);
        const uploadMatch = output.match(/Upload:\s*([\d.]+)\s*Mbit/i);
        
        return {
          downloadSpeed: downloadMatch ? `${downloadMatch[1]} Mbps` : 'Unknown',
          uploadSpeed: uploadMatch ? `${uploadMatch[1]} Mbps` : 'Unknown',
          rawOutput: output,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error: any) {
      logger.error({ error }, 'Bandwidth test failed');
      throw new Error(`Bandwidth test failed: ${error.message}`);
    }
  },
};

/**
 * Service Status Check - Check systemd service status (Linux only)
 */
export const serviceStatusSkill: Skill = {
  name: 'service_status',
  description: 'Check the status of a system service (systemd on Linux, Windows services on Windows).',
  execute: async (params: Record<string, any>) => {
    const serviceName = params.serviceName;
    
    if (!serviceName) {
      throw new Error('Service name parameter is required');
    }

    logger.info({ serviceName }, 'Checking service status');

    try {
      let command: string;
      let output: string | null;

      if (isWindows()) {
        // Windows: use sc query or Get-Service
        command = `powershell -Command "Get-Service -Name '${serviceName}' | Select-Object Name, Status, StartType | Format-List"`;
        output = await executeCommand(command, 5000);
        
        if (output === null) {
          throw new Error('Get-Service command not available');
        }
        
        const isRunning = output.toLowerCase().includes('status') && output.toLowerCase().includes('running');
        
        return {
          serviceName,
          status: isRunning ? 'running' : 'stopped',
          isRunning,
          rawOutput: output,
          command,
          timestamp: new Date().toISOString(),
        };
      } else {
        // Linux: use systemctl
        command = `systemctl status ${serviceName}`;
        
        try {
          output = await executeCommand(command, 5000);
          
          if (output === null) {
            throw new Error('systemctl command not available');
          }
        } catch (err: any) {
          // Service might be stopped or not found
          output = err.message || 'Service not found';
        }

        // Ensure output is not null before checking
        const outputStr = output || 'Service not found';
        const isActive = outputStr.includes('Active: active');
        const isRunning = isActive && outputStr.includes('running');
        const isFailed = outputStr.includes('Active: failed');
        const isInactive = outputStr.includes('Active: inactive');

        let status = 'unknown';
        if (isRunning) status = 'running';
        else if (isFailed) status = 'failed';
        else if (isInactive) status = 'inactive';
        else if (outputStr.includes('not-found')) status = 'not-found';

        return {
          serviceName,
          status,
          isRunning,
          isFailed,
          rawOutput: outputStr,
          command,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error: any) {
      logger.error({ error, serviceName }, 'Service status check failed');
      throw new Error(`Service status check failed: ${error.message}`);
    }
  },
};

/**
 * Log Analysis - Tail and search logs
 */
export const logAnalysisSkill: Skill = {
  name: 'log_analysis',
  description: 'Analyze system logs by tailing or searching for patterns.',
  execute: async (params: Record<string, any>) => {
    const logFile = params.logFile;
    const lines = params.lines || 50;
    const searchPattern = params.searchPattern;
    
    if (!logFile) {
      throw new Error('Log file path parameter is required');
    }

    logger.info({ logFile, lines, searchPattern }, 'Analyzing logs');

    try {
      let command: string;

      if (isWindows()) {
        if (searchPattern) {
          command = `powershell -Command "Get-Content '${logFile}' -Tail ${lines} | Select-String '${searchPattern}'"`;
        } else {
          command = `powershell -Command "Get-Content '${logFile}' -Tail ${lines}"`;
        }
      } else {
        if (searchPattern) {
          command = `tail -n ${lines} "${logFile}" | grep -i "${searchPattern}"`;
        } else {
          command = `tail -n ${lines} "${logFile}"`;
        }
      }

      const output = await executeCommand(command, 10000);
      
      if (output === null) {
        throw new Error('Log analysis command not available');
      }

      const logLines = output.split('\n').filter(line => line.trim());

      return {
        logFile,
        linesReturned: logLines.length,
        searchPattern: searchPattern || 'none',
        logs: logLines,
        rawOutput: output,
        command,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, logFile }, 'Log analysis failed');
      throw new Error(`Log analysis failed: ${error.message}`);
    }
  },
};

/**
 * Process Monitoring - List running processes and resource usage
 */
export const processMonitoringSkill: Skill = {
  name: 'process_monitoring',
  description: 'Monitor running processes, CPU and memory usage.',
  execute: async (params: Record<string, any>) => {
    const processName = params.processName;
    const limit = params.limit || 10;
    
    logger.info({ processName, limit }, 'Monitoring processes');

    try {
      let command: string;
      let output: string | null;

      if (isWindows()) {
        if (processName) {
          command = `powershell -Command "Get-Process -Name '*${processName}*' -ErrorAction SilentlyContinue | Select-Object Name, Id, CPU, @{Name='Memory(MB)';Expression={[math]::Round($_.WorkingSet / 1MB, 2)}} | Format-Table"`;
        } else {
          command = `powershell -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First ${limit} Name, Id, CPU, @{Name='Memory(MB)';Expression={[math]::Round($_.WorkingSet / 1MB, 2)}} | Format-Table"`;
        }
      } else {
        if (processName) {
          command = `ps aux | grep -i "${processName}" | grep -v grep | head -n ${limit}`;
        } else {
          command = `ps aux --sort=-%cpu | head -n ${limit + 1}`;
        }
      }

      output = await executeCommand(command, 5000);
      
      if (output === null) {
        throw new Error('Process monitoring command not available');
      }

      // Parse process information
      const lines = output.split('\n').filter(line => line.trim());

      return {
        processName: processName || 'all',
        processCount: Math.max(0, lines.length - 1), // Subtract header
        processes: output,
        rawOutput: output,
        command,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, processName }, 'Process monitoring failed');
      throw new Error(`Process monitoring failed: ${error.message}`);
    }
  },
};

/**
 * Install System Package - Install missing system tools with user approval
 */
export const installSystemPackageSkill: Skill = {
  name: 'installSystemPackage',
  description: 'Install a missing system tool or package (requires user approval). Supports common network and system utilities.',
  execute: async (params: Record<string, any>) => {
    const { toolName, userApproval } = params;

    if (!toolName) {
      throw new Error('Tool name is required');
    }

    // Check if auto-installation is enabled in environment
    const autoInstallEnabled = process.env.ENABLE_AUTO_TOOL_INSTALLATION === 'true';
    
    if (!autoInstallEnabled) {
      const installCmd = getInstallCommand(toolName);
      return {
        success: false,
        error: true,
        featureDisabled: true,
        toolName,
        message: 'Automatic tool installation is disabled. Please install manually or enable the feature.',
        installCommand: installCmd || 'Installation command not available',
        manualInstruction: `Install manually with: ${installCmd}`,
        enableInstruction: 'To enable automatic installation, set ENABLE_AUTO_TOOL_INSTALLATION=true in your .env file and ensure the aiagent user has sudo permissions.',
        timestamp: new Date().toISOString(),
      };
    }

    logger.info({ toolName, userApproval }, 'Package installation requested');

    // Check if user approved
    if (!userApproval) {
      const packageInfo = TOOL_PACKAGES[toolName];
      const installCmd = getInstallCommand(toolName);
      
      return {
        requiresApproval: true,
        toolName,
        description: packageInfo?.description || 'System utility',
        installCommand: installCmd || 'Installation command not available for this system',
        message: `To install ${toolName}, I need your permission. The following command will be executed: ${installCmd || 'N/A'}`,
        prompt: `Would you like me to install ${toolName} (${packageInfo?.description || 'system utility'})? Reply with 'yes' or 'approve' to proceed.`,
        timestamp: new Date().toISOString(),
      };
    }

    // User approved, proceed with installation
    try {
      // Check if already installed
      const isInstalled = await isToolInstalled(toolName);
      if (isInstalled) {
        return {
          success: true,
          toolName,
          message: `${toolName} is already installed on the system`,
          alreadyInstalled: true,
          timestamp: new Date().toISOString(),
        };
      }

      // Get installation command
      const installCmd = getInstallCommand(toolName);
      if (!installCmd) {
        throw new Error(`Installation command not available for ${toolName} on this system`);
      }

      logger.info({ toolName, installCmd }, 'Installing package');

      // Execute installation
      const output = await executeCommand(installCmd, 120000); // 2 minute timeout for installation

      if (output === null) {
        throw new Error(`Package manager command failed. Please install manually: ${installCmd}`);
      }

      // Verify installation
      const nowInstalled = await isToolInstalled(toolName);
      
      if (nowInstalled) {
        logger.info({ toolName }, 'Package installed successfully');
        return {
          success: true,
          toolName,
          message: `${toolName} has been installed successfully`,
          installCommand: installCmd,
          output: output.substring(0, 500), // Truncate long output
          timestamp: new Date().toISOString(),
        };
      } else {
        throw new Error(`Installation completed but ${toolName} is still not available. Please check manually.`);
      }

    } catch (error: any) {
      logger.error({ error, toolName }, 'Package installation failed');
      
      const installCmd = getInstallCommand(toolName);
      return {
        success: false,
        error: true,
        toolName,
        message: `Failed to install ${toolName}: ${error.message}`,
        installCommand: installCmd,
        manualInstruction: `You can try installing manually with: ${installCmd}`,
        timestamp: new Date().toISOString(),
      };
    }
  },
};

/**
 * Check Tool Availability - Check if a system tool is installed and offer installation
 */
export const checkToolAvailabilitySkill: Skill = {
  name: 'checkToolAvailability',
  description: 'Check if a system tool is installed and get installation instructions if needed.',
  execute: async (params: Record<string, any>) => {
    const { toolName } = params;

    if (!toolName) {
      throw new Error('Tool name is required');
    }

    logger.info({ toolName }, 'Checking tool availability');

    try {
      const isInstalled = await isToolInstalled(toolName);
      const packageInfo = TOOL_PACKAGES[toolName];
      const installCmd = getInstallCommand(toolName);

      if (isInstalled) {
        return {
          toolName,
          installed: true,
          available: true,
          message: `${toolName} is installed and ready to use`,
          description: packageInfo?.description || 'System utility',
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          toolName,
          installed: false,
          available: false,
          message: `${toolName} is not installed on this system`,
          description: packageInfo?.description || 'System utility',
          installCommand: installCmd || 'Installation not available for this system',
          canInstall: installCmd !== null,
          suggestedAction: installCmd 
            ? `I can install this for you. Would you like me to proceed with: ${installCmd}`
            : `Please install manually: ${toolName}`,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error: any) {
      logger.error({ error, toolName }, 'Tool availability check failed');
      throw new Error(`Failed to check tool availability: ${error.message}`);
    }
  },
};

/**
 * 🔥 TOP PRIORITY SKILLS - Most impactful additions
 */

/**
 * 1. 🐳 Docker Management - List containers, images, stats
 */
export const dockerManagementSkill: Skill = {
  name: 'docker_management',
  description: '🐳 Manage Docker containers - list running/stopped containers, images, stats, logs',
  execute: async ({ action, containerId, all = false }) => {
    logger.info({ action, containerId, all }, 'Docker management requested');

    try {
      let command: string;
      
      switch (action) {
        case 'ps':
          command = all ? 'docker ps -a --format "table {{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"' 
                        : 'docker ps --format "table {{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}"';
          break;
        case 'images':
          command = 'docker images --format "table {{.Repository}}\\t{{.Tag}}\\t{{.ID}}\\t{{.Size}}\\t{{.CreatedSince}}"';
          break;
        case 'stats':
          command = containerId 
            ? `docker stats ${containerId} --no-stream --format "table {{.Container}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.NetIO}}\\t{{.BlockIO}}"`
            : 'docker stats --no-stream --format "table {{.Container}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.NetIO}}\\t{{.BlockIO}}"';
          break;
        case 'logs':
          if (!containerId) {
            return { success: false, error: 'Container ID required for logs action' };
          }
          command = `docker logs ${containerId} --tail 50`;
          break;
        case 'inspect':
          if (!containerId) {
            return { success: false, error: 'Container ID required for inspect action' };
          }
          command = `docker inspect ${containerId}`;
          break;
        default:
          return { success: false, error: `Unknown action: ${action}. Use: ps, images, stats, logs, inspect` };
      }

      const result = await executeCommand(command);
      if (!result) {
        return { success: false, error: 'Docker not installed. Install with: sudo apt-get install -y docker.io' };
      }

      return {
        success: true,
        action,
        containerId,
        output: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, action }, 'Docker management failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 2. 💾 Disk Usage Analysis - Show largest files/folders, disk space
 */
export const diskUsageAnalysisSkill: Skill = {
  name: 'disk_usage_analysis',
  description: '💾 Analyze disk usage - show largest files/folders, disk space by directory',
  execute: async ({ path = '.', depth = 2, topN = 10 }) => {
    logger.info({ path, depth, topN }, 'Disk usage analysis requested');

    try {
      // Overall disk space
      const dfResult = await executeCommand('df -h');
      
      // Largest directories
      const duCommand = `du -h --max-depth=${depth} "${path}" 2>/dev/null | sort -hr | head -n ${topN}`;
      const duResult = await executeCommand(duCommand);

      // Largest files in path
      const findCommand = `find "${path}" -type f -exec du -h {} + 2>/dev/null | sort -hr | head -n ${topN}`;
      const filesResult = await executeCommand(findCommand);

      return {
        success: true,
        path,
        diskSpace: dfResult || 'Could not retrieve disk space',
        largestDirectories: duResult || 'Could not analyze directories',
        largestFiles: filesResult || 'Could not find largest files',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, path }, 'Disk usage analysis failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 3. 🔀 Git Operations - Status, branches, commits, diffs
 */
export const gitOperationsSkill: Skill = {
  name: 'git_operations',
  description: '🔀 Git repository operations - status, branches, recent commits, diffs',
  execute: async ({ action, path = '.', count = 10 }) => {
    logger.info({ action, path, count }, 'Git operation requested');

    try {
      const gitDir = path !== '.' ? ` -C "${path}"` : '';
      let command: string;

      switch (action) {
        case 'status':
          command = `git${gitDir} status -sb`;
          break;
        case 'branches':
          command = `git${gitDir} branch -av`;
          break;
        case 'log':
          command = `git${gitDir} log --oneline --graph --decorate -n ${count}`;
          break;
        case 'diff':
          command = `git${gitDir} diff --stat`;
          break;
        case 'remote':
          command = `git${gitDir} remote -v`;
          break;
        default:
          return { success: false, error: `Unknown action: ${action}. Use: status, branches, log, diff, remote` };
      }

      const result = await executeCommand(command);
      if (!result) {
        return { success: false, error: 'Git not installed or not a git repository' };
      }

      return {
        success: true,
        action,
        path,
        output: result || 'No output',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, action }, 'Git operation failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 4. 🔓 Open Ports Scan - Scan for open ports
 */
export const openPortsScanSkill: Skill = {
  name: 'open_ports_scan',
  description: '🔓 Scan for open ports on localhost or remote host',
  execute: async ({ host = 'localhost', method = 'ss' }) => {
    logger.info({ host, method }, 'Port scan requested');

    try {
      let command: string;
      let result;

      if (method === 'ss') {
        command = 'ss -tuln';
        result = await executeCommand(command);
      } else if (method === 'netstat') {
        command = 'netstat -tuln';
        result = await executeCommand(command);
      } else if (method === 'nmap') {
        if (host === 'localhost' || host === '127.0.0.1') {
          command = 'nmap -sT localhost';
        } else {
          command = `nmap -sT ${host}`;
        }
        result = await executeCommand(command);
      } else {
        return { success: false, error: `Unknown method: ${method}. Use: ss, netstat, nmap` };
      }

      if (!result) {
        return { 
          success: false, 
          error: `${method} not available. Try another method or install: sudo apt-get install -y ${method === 'nmap' ? 'nmap' : 'net-tools'}` 
        };
      }

      return {
        success: true,
        host,
        method,
        ports: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host, method }, 'Port scan failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 5. 🧠 Memory Details - RAM usage by process, available memory
 */
export const memoryDetailsSkill: Skill = {
  name: 'memory_details',
  description: '🧠 Show detailed memory usage - RAM by process, available memory, swap',
  execute: async ({ detail = 'summary', topN = 10 }) => {
    logger.info({ detail, topN }, 'Memory details requested');

    try {
      // Overall memory
      const freeResult = await executeCommand('free -h');
      
      let processInfo = '';
      let vmstatInfo = '';

      if (detail === 'processes' || detail === 'full') {
        const psCommand = `ps aux --sort=-%mem | head -n ${topN + 1}`;
        const psResult = await executeCommand(psCommand);
        processInfo = psResult || 'Could not get process info';
      }

      if (detail === 'full') {
        const vmstatResult = await executeCommand('vmstat -s');
        vmstatInfo = vmstatResult || 'Could not get vmstat info';
      }

      return {
        success: true,
        detail,
        memoryOverview: freeResult || 'Could not get memory info',
        topProcesses: processInfo,
        vmstat: vmstatInfo,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, detail }, 'Memory details failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 6. 🛡️ Firewall Rules - List firewall rules
 */
export const firewallRulesSkill: Skill = {
  name: 'firewall_rules',
  description: '🛡️ List firewall rules (iptables/ufw/firewalld)',
  execute: async ({ type = 'auto' }) => {
    logger.info({ type }, 'Firewall rules requested');

    try {
      let command: string;
      let firewallType = type;

      if (type === 'auto') {
        // Auto-detect firewall
        const ufwCheck = await executeCommand('which ufw');
        const iptablesCheck = await executeCommand('which iptables');
        const firewalldCheck = await executeCommand('which firewall-cmd');

        if (ufwCheck) {
          firewallType = 'ufw';
        } else if (firewalldCheck) {
          firewallType = 'firewalld';
        } else if (iptablesCheck) {
          firewallType = 'iptables';
        } else {
          return { success: false, error: 'No firewall found. Install ufw, iptables, or firewalld' };
        }
      }

      switch (firewallType) {
        case 'ufw':
          command = 'sudo ufw status verbose';
          break;
        case 'iptables':
          command = 'sudo iptables -L -n -v';
          break;
        case 'firewalld':
          command = 'sudo firewall-cmd --list-all';
          break;
        default:
          return { success: false, error: `Unknown firewall type: ${type}` };
      }

      const result = await executeCommand(command);
      if (!result) {
        return { success: false, error: `Could not execute ${firewallType} command. May need sudo permissions` };
      }

      return {
        success: true,
        firewallType,
        rules: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, type }, 'Firewall rules failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 7. 🚫 Failed Login Attempts - Show failed SSH/login attempts
 */
export const failedLoginAttemptsSkill: Skill = {
  name: 'failed_login_attempts',
  description: '🚫 Show failed login attempts and suspicious IPs',
  execute: async ({ count = 20 }) => {
    logger.info({ count }, 'Failed login attempts requested');

    try {
      // Try lastb first (failed login attempts)
      let lastbResult = await executeCommand(`sudo lastb -n ${count} -w`);
      
      // Try auth log if lastb doesn't work
      let authLogResult;
      if (!lastbResult) {
        authLogResult = await executeCommand(`sudo grep -i "failed\\|failure" /var/log/auth.log 2>/dev/null | tail -n ${count}`);
      }

      // Get IP summary
      const ipSummary = await executeCommand(`sudo lastb -w 2>/dev/null | awk '{print $3}' | sort | uniq -c | sort -nr | head -n 10`);

      return {
        success: true,
        recentAttempts: lastbResult || authLogResult || 'No failed login attempts found',
        suspiciousIPs: ipSummary || 'Could not analyze IPs',
        note: 'Top IPs show most frequent failed login sources',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, count }, 'Failed login attempts check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 8. 🗄️ Database Operations - Connection test, queries
 */
export const databaseOperationsSkill: Skill = {
  name: 'database_operations',
  description: '🗄️ Database operations - connection test, list databases, table info',
  execute: async ({ dbType, action, database, host = 'localhost', port }) => {
    logger.info({ dbType, action, database, host }, 'Database operation requested');

    try {
      let command: string;
      const dbPort = port || (dbType === 'mysql' ? 3306 : dbType === 'postgres' ? 5432 : 27017);

      switch (dbType) {
        case 'mysql':
          if (action === 'test') {
            command = `mysqladmin -h ${host} -P ${dbPort} ping`;
          } else if (action === 'list') {
            command = `mysql -h ${host} -P ${dbPort} -e "SHOW DATABASES;"`;
          } else if (action === 'tables' && database) {
            command = `mysql -h ${host} -P ${dbPort} -D ${database} -e "SHOW TABLES;"`;
          } else if (action === 'status') {
            command = `mysqladmin -h ${host} -P ${dbPort} status`;
          } else {
            return { success: false, error: 'Invalid action or missing database name' };
          }
          break;

        case 'postgres':
          if (action === 'test') {
            command = `pg_isready -h ${host} -p ${dbPort}`;
          } else if (action === 'list') {
            command = `psql -h ${host} -p ${dbPort} -c "\\l"`;
          } else if (action === 'tables' && database) {
            command = `psql -h ${host} -p ${dbPort} -d ${database} -c "\\dt"`;
          } else if (action === 'status') {
            command = `pg_isready -h ${host} -p ${dbPort}`;
          } else {
            return { success: false, error: 'Invalid action or missing database name' };
          }
          break;

        case 'mongodb':
          if (action === 'test') {
            command = `mongo --host ${host} --port ${dbPort} --eval "db.adminCommand('ping')"`;
          } else if (action === 'list') {
            command = `mongo --host ${host} --port ${dbPort} --eval "db.adminCommand('listDatabases')"`;
          } else {
            return { success: false, error: 'Invalid action for MongoDB' };
          }
          break;

        default:
          return { success: false, error: `Unknown database type: ${dbType}` };
      }

      const result = await executeCommand(command);
      if (!result) {
        return { 
          success: false, 
          error: `${dbType} client not installed. Install: sudo apt-get install -y ${dbType === 'mysql' ? 'mysql-client' : dbType === 'postgres' ? 'postgresql-client' : 'mongodb-clients'}` 
        };
      }

      return {
        success: true,
        dbType,
        action,
        host,
        port: dbPort,
        output: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, dbType, action }, 'Database operation failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 9. 🔌 Active Connections - List all active network connections
 */
export const activeConnectionsSkill: Skill = {
  name: 'active_connections',
  description: '🔌 List all active network connections and states',
  execute: async ({ filter = 'all', protocol = 'all' }) => {
    logger.info({ filter, protocol }, 'Active connections requested');

    try {
      let command = 'ss -tunapo';

      // Apply state filter
      if (filter === 'established') {
        command += ' state established';
      } else if (filter === 'listening') {
        command += ' state listening';
      } else if (filter === 'time_wait') {
        command += ' state time-wait';
      }

      // Apply protocol filter
      if (protocol === 'tcp') {
        command = command.replace('-tuna', '-tna');
      } else if (protocol === 'udp') {
        command = command.replace('-tuna', '-una');
      }

      let result = await executeCommand(command);
      if (!result) {
        // Fallback to netstat
        const netstatCmd = 'netstat -tunapo';
        result = await executeCommand(netstatCmd);
        if (!result) {
          return { success: false, error: 'Neither ss nor netstat available. Install: sudo apt-get install -y iproute2' };
        }
      }

      // Get connection count summary
      const countCmd = 'ss -s';
      const countResult = await executeCommand(countCmd);

      return {
        success: true,
        filter,
        protocol,
        connections: result,
        summary: countResult || 'Could not get summary',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, filter, protocol }, 'Active connections check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 10. ✅ Web Server Config Test - Test nginx/apache config
 */
export const webServerConfigTestSkill: Skill = {
  name: 'web_server_config_test',
  description: '✅ Test web server configuration syntax (nginx/apache)',
  execute: async ({ server = 'auto' }) => {
    logger.info({ server }, 'Web server config test requested');

    try {
      let serverType = server;
      let command: string;

      if (server === 'auto') {
        // Auto-detect
        const nginxCheck = await executeCommand('which nginx');
        const apacheCheck = await executeCommand('which apache2');
        
        if (nginxCheck) {
          serverType = 'nginx';
        } else if (apacheCheck) {
          serverType = 'apache';
        } else {
          return { success: false, error: 'Neither nginx nor apache found on system' };
        }
      }

      if (serverType === 'nginx') {
        command = 'sudo nginx -t';
      } else if (serverType === 'apache') {
        command = 'sudo apache2ctl -t || sudo apachectl -t';
      } else {
        return { success: false, error: `Unknown server type: ${server}` };
      }

      const result = await executeCommand(command);
      const output = result || 'No output';
      const isValid = output.toLowerCase().includes('syntax is ok') || output.toLowerCase().includes('ok');

      return {
        success: true,
        serverType,
        configValid: isValid,
        output,
        message: isValid ? '✅ Configuration is valid' : '❌ Configuration has errors',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, server }, 'Web server config test failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 11. 👥 User Management - List users, groups, user details, last login
 */
export const userManagementSkill: Skill = {
  name: 'user_management',
  description: '👥 Manage system users - list users, groups, user details, last login',
  execute: async ({ action = 'list', username }) => {
    logger.info({ action, username }, 'User management requested');

    try {
      let command: string;
      let result;

      switch (action) {
        case 'list':
          // List all regular users (UID >= 1000)
          command = 'getent passwd | awk -F: \'$3 >= 1000 {print $1, "(UID: " $3 ")"}\' | head -20';
          result = await executeCommand(command);
          if (!result) {
            // Fallback: read /etc/passwd directly
            result = await executeCommand('cat /etc/passwd | awk -F: \'$3 >= 1000 {print $1, "(UID: " $3 ")}\' | head -20');
          }
          break;

        case 'groups':
          // List all groups
          command = username 
            ? `groups ${username}` 
            : 'getent group | awk -F: \'{print $1, "(GID: " $3 ")"}\' | head -20';
          result = await executeCommand(command);
          break;

        case 'details':
          if (!username) {
            return { success: false, error: 'Username required for details action' };
          }
          // Show detailed user information
          const idResult = await executeCommand(`id ${username}`);
          const fingerResult = await executeCommand(`finger ${username} 2>/dev/null || getent passwd ${username}`);
          const lastLoginResult = await executeCommand(`lastlog -u ${username} 2>/dev/null || last ${username} | head -5`);
          
          return {
            success: true,
            action,
            username,
            id: idResult || 'Could not get ID info',
            details: fingerResult || 'Could not get user details',
            lastLogin: lastLoginResult || 'Could not get last login info',
            timestamp: new Date().toISOString(),
          };

        case 'lastlogin':
          // Show last login times
          command = username 
            ? `lastlog -u ${username} 2>/dev/null || last ${username} | head -5`
            : 'lastlog | head -20';
          result = await executeCommand(command);
          break;

        case 'whoami':
          // Show current user
          result = await executeCommand('whoami');
          break;

        default:
          return { success: false, error: `Unknown action: ${action}. Use: list, groups, details, lastlogin, whoami` };
      }

      if (!result) {
        return { success: false, error: 'Command not available. User management tools may not be installed.' };
      }

      return {
        success: true,
        action,
        username,
        output: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, action }, 'User management failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 12. ⏰ Cron Jobs - List scheduled cron jobs
 */
export const cronJobsSkill: Skill = {
  name: 'cron_jobs',
  description: '⏰ List scheduled cron jobs for user or all users',
  execute: async ({ scope = 'user', username }) => {
    logger.info({ scope, username }, 'Cron jobs list requested');

    try {
      let command: string;
      let result;

      if (scope === 'user') {
        // Show current user's crontab
        const user = username || 'current';
        command = username 
          ? `sudo crontab -u ${username} -l 2>/dev/null` 
          : 'crontab -l 2>/dev/null';
        result = await executeCommand(command);
        
        if (!result || result.includes('no crontab')) {
          return {
            success: true,
            scope,
            username: user,
            output: `No crontab entries found for ${user}`,
            timestamp: new Date().toISOString(),
          };
        }
      } else if (scope === 'all') {
        // List all user crontabs
        const cronDirs = await executeCommand('ls /var/spool/cron/crontabs/ 2>/dev/null || ls /var/spool/cron/ 2>/dev/null');
        
        if (!cronDirs) {
          return { success: false, error: 'Cannot access cron directories. May need elevated privileges.' };
        }

        result = `Users with cron jobs:\n${cronDirs}`;
      } else if (scope === 'system') {
        // Show system-wide cron jobs
        const cronTabs = [];
        
        const hourly = await executeCommand('ls /etc/cron.hourly/ 2>/dev/null');
        if (hourly) cronTabs.push(`=== Hourly ===\n${hourly}`);
        
        const daily = await executeCommand('ls /etc/cron.daily/ 2>/dev/null');
        if (daily) cronTabs.push(`=== Daily ===\n${daily}`);
        
        const weekly = await executeCommand('ls /etc/cron.weekly/ 2>/dev/null');
        if (weekly) cronTabs.push(`=== Weekly ===\n${weekly}`);
        
        const monthly = await executeCommand('ls /etc/cron.monthly/ 2>/dev/null');
        if (monthly) cronTabs.push(`=== Monthly ===\n${monthly}`);
        
        const cronD = await executeCommand('ls /etc/cron.d/ 2>/dev/null');
        if (cronD) cronTabs.push(`=== /etc/cron.d/ ===\n${cronD}`);

        result = cronTabs.join('\n\n') || 'No system cron jobs found';
      } else {
        return { success: false, error: `Unknown scope: ${scope}. Use: user, all, system` };
      }

      return {
        success: true,
        scope,
        username,
        output: result || 'No cron jobs found',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, scope }, 'Cron jobs listing failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 13. 🔍 File Search - Find files by name, type, size, or modified date
 */
export const fileSearchSkill: Skill = {
  name: 'file_search',
  description: '🔍 Search for files by name, type, size, or modified date',
  execute: async ({ path = '.', pattern, fileType, minSize, maxSize, modifiedDays, maxResults = 50 }) => {
    logger.info({ path, pattern, fileType }, 'File search requested');

    try {
      const findParts = ['find', `"${path}"`];
      
      // Add file type filter
      if (fileType) {
        if (fileType === 'file') {
          findParts.push('-type f');
        } else if (fileType === 'directory') {
          findParts.push('-type d');
        } else if (fileType === 'link') {
          findParts.push('-type l');
        }
      }

      // Add name pattern
      if (pattern) {
        findParts.push(`-name "${pattern}"`);
      }

      // Add size filters
      if (minSize) {
        findParts.push(`-size +${minSize}`);
      }
      if (maxSize) {
        findParts.push(`-size -${maxSize}`);
      }

      // Add modified date filter
      if (modifiedDays) {
        findParts.push(`-mtime -${modifiedDays}`);
      }

      // Limit results
      findParts.push(`| head -n ${maxResults}`);

      const command = findParts.join(' ');
      let result = await executeCommand(command);

      if (!result) {
        // Fallback: simpler find command
        const simpleCmd = pattern 
          ? `find "${path}" -name "${pattern}" 2>/dev/null | head -n ${maxResults}`
          : `find "${path}" -type f 2>/dev/null | head -n ${maxResults}`;
        result = await executeCommand(simpleCmd);
      }

      if (!result) {
        return { success: false, error: 'find command not available or search path not accessible' };
      }

      // Count results
      const resultCount = result.trim().split('\n').filter(line => line.length > 0).length;

      return {
        success: true,
        path,
        pattern,
        fileType,
        resultCount,
        maxResults,
        output: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, path, pattern }, 'File search failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 14. 🖥️ Hardware Info - Show detailed hardware information
 */
export const hardwareInfoSkill: Skill = {
  name: 'hardware_info',
  description: '🖥️ Show detailed hardware information - CPU, memory, disk, hardware details',
  execute: async ({ category = 'summary' }) => {
    logger.info({ category }, 'Hardware info requested');

    try {
      let result = '';

      switch (category) {
        case 'summary':
          // General system summary
          const lscpuSum = await executeCommand('lscpu | grep -E "^(Architecture|CPU|Model name|Thread|Core|Socket)"');
          const memInfo = await executeCommand('free -h | grep Mem');
          const diskInfo = await executeCommand('df -h / | tail -1');
          const osInfo = await executeCommand('uname -srm');
          
          result = `=== System Summary ===\nOS: ${osInfo || 'Unknown'}\n\n=== CPU ===\n${lscpuSum || 'CPU info not available'}\n\n=== Memory ===\n${memInfo || 'Memory info not available'}\n\n=== Root Disk ===\n${diskInfo || 'Disk info not available'}`;
          break;

        case 'cpu':
          // Detailed CPU info
          const lscpu = await executeCommand('lscpu');
          const cpuinfo = await executeCommand('cat /proc/cpuinfo | grep -E "^(processor|model name|cpu MHz|cache size)" | head -20');
          result = lscpu || cpuinfo || 'CPU information not available';
          break;

        case 'memory':
          // Detailed memory info
          const meminfo = await executeCommand('cat /proc/meminfo | head -20');
          const freeDetailed = await executeCommand('free -h');
          result = `${freeDetailed || ''}\n\n=== Detailed Memory Info ===\n${meminfo || 'Memory info not available'}`;
          break;

        case 'disk':
          // Detailed disk info
          const lsblk = await executeCommand('lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE');
          const dfAll = await executeCommand('df -h');
          result = `=== Block Devices ===\n${lsblk || 'Not available'}\n\n=== Disk Usage ===\n${dfAll || 'Not available'}`;
          break;

        case 'pci':
          // PCI devices (graphics, network cards, etc.)
          const lspci = await executeCommand('lspci');
          result = lspci || 'lspci not available. Install with: sudo apt-get install -y pciutils';
          break;

        case 'usb':
          // USB devices
          const lsusb = await executeCommand('lsusb');
          result = lsusb || 'lsusb not available. Install with: sudo apt-get install -y usbutils';
          break;

        case 'all':
          // Everything
          const allCpu = await executeCommand('lscpu');
          const allMem = await executeCommand('free -h');
          const allDisk = await executeCommand('df -h');
          const allBlock = await executeCommand('lsblk');
          const allPci = await executeCommand('lspci 2>/dev/null');
          const allUsb = await executeCommand('lsusb 2>/dev/null');
          const allDmi = await executeCommand('sudo dmidecode -t system 2>/dev/null | grep -E "(Manufacturer|Product Name|Version|Serial)"');
          
          result = `=== CPU ===\n${allCpu || 'N/A'}\n\n=== Memory ===\n${allMem || 'N/A'}\n\n=== Disks ===\n${allDisk || 'N/A'}\n\n=== Block Devices ===\n${allBlock || 'N/A'}`;
          
          if (allPci) result += `\n\n=== PCI Devices ===\n${allPci}`;
          if (allUsb) result += `\n\n=== USB Devices ===\n${allUsb}`;
          if (allDmi) result += `\n\n=== System Info ===\n${allDmi}`;
          break;

        default:
          return { success: false, error: `Unknown category: ${category}. Use: summary, cpu, memory, disk, pci, usb, all` };
      }

      if (!result || result.trim() === '') {
        return { success: false, error: 'Could not retrieve hardware information' };
      }

      return {
        success: true,
        category,
        output: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, category }, 'Hardware info retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

// =============================================================================
// 🔧 SYSTEM ADMINISTRATION SKILLS (7 Skills)
// =============================================================================

/**
 * File Permission Audit Skill
 * Audit file/directory permissions for security issues
 */
export const filePermissionAuditSkill: Skill = {
  name: 'file_permission_audit',
  description: '🔒 Audit file permissions for security issues (world-writable, setuid, no owner)',
  async execute(args: any) {
    try {
      const path = args.path || '.';
      const recursive = args.recursive !== false;
      const checkWorldWritable = args.checkWorldWritable !== false;
      const checkSetuid = args.checkSetuid !== false;
      const checkNoOwner = args.checkNoOwner !== false;

      logger.info({ path, recursive, checkWorldWritable, checkSetuid, checkNoOwner }, 'File permission audit requested');

      const results: any = {
        success: true,
        path,
        issues: [],
        timestamp: new Date().toISOString(),
      };

      const maxDepth = recursive ? '' : '-maxdepth 1';

      // Check for world-writable files/directories
      if (checkWorldWritable) {
        const worldWritableCmd = `find "${path}" ${maxDepth} -type f -perm -0002 2>/dev/null | head -50`;
        const worldWritable = await executeCommand(worldWritableCmd);
        if (worldWritable && worldWritable.trim()) {
          results.issues.push({
            type: 'world-writable',
            description: 'Files writable by everyone',
            files: worldWritable.trim().split('\n'),
          });
        }
      }

      // Check for setuid/setgid files
      if (checkSetuid) {
        const setuidCmd = `find "${path}" ${maxDepth} -type f \\( -perm -4000 -o -perm -2000 \\) 2>/dev/null | head -50`;
        const setuid = await executeCommand(setuidCmd);
        if (setuid && setuid.trim()) {
          results.issues.push({
            type: 'setuid-setgid',
            description: 'Files with setuid/setgid bit set',
            files: setuid.trim().split('\n'),
          });
        }
      }

      // Check for files with no owner
      if (checkNoOwner) {
        const noOwnerCmd = `find "${path}" ${maxDepth} -nouser -o -nogroup 2>/dev/null | head -50`;
        const noOwner = await executeCommand(noOwnerCmd);
        if (noOwner && noOwner.trim()) {
          results.issues.push({
            type: 'no-owner',
            description: 'Files with no valid owner/group',
            files: noOwner.trim().split('\n'),
          });
        }
      }

      results.issueCount = results.issues.length;
      results.summary = results.issueCount === 0 ? 'No permission issues found' : `Found ${results.issueCount} permission issue(s)`;

      return results;
    } catch (error: any) {
      logger.error({ error, path: args.path }, 'File permission audit failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Resource History Skill
 * Show historical resource usage (CPU, memory, disk, network)
 */
export const resourceHistorySkill: Skill = {
  name: 'resource_history',
  description: '📊 Show historical resource usage (requires sysstat/sar)',
  async execute(args: any) {
    try {
      const resource = args.resource || 'summary';
      const duration = args.duration || '1h';

      logger.info({ resource, duration }, 'Resource history requested');

      // Map duration to sar time format
      const durationMap: any = {
        '1h': '-s $(date -d "1 hour ago" +%H:%M:%S)',
        '6h': '-s $(date -d "6 hours ago" +%H:%M:%S)',
        '24h': '-s $(date -d "1 day ago" +%H:%M:%S)',
        '7d': '-s $(date -d "7 days ago" +%H:%M:%S)',
      };

      const timeFilter = durationMap[duration] || '';

      // Check if sar is available
      const sarAvailable = await executeCommand('which sar');
      
      let result: string | null = '';
      
      if (!sarAvailable) {
        // Fallback to current stats if sar not available
        if (resource === 'cpu' || resource === 'summary') {
          result = await executeCommand('top -bn1 | head -20');
        } else if (resource === 'memory') {
          result = await executeCommand('free -h && vmstat 1 5');
        } else if (resource === 'disk') {
          result = await executeCommand('df -h && iostat');
        } else if (resource === 'network') {
          result = await executeCommand('netstat -i');
        }
        
        return {
          success: true,
          resource,
          duration,
          note: 'sysstat not installed, showing current stats only',
          output: result || 'No data available',
          timestamp: new Date().toISOString(),
        };
      }

      // Use sar for historical data
      if (resource === 'cpu') {
        result = await executeCommand(`sar ${timeFilter} | tail -50`);
      } else if (resource === 'memory') {
        result = await executeCommand(`sar -r ${timeFilter} | tail -50`);
      } else if (resource === 'disk') {
        result = await executeCommand(`sar -d ${timeFilter} | tail -50`);
      } else if (resource === 'network') {
        result = await executeCommand(`sar -n DEV ${timeFilter} | tail -50`);
      } else if (resource === 'summary') {
        const cpu = await executeCommand(`sar ${timeFilter} | tail -10`);
        const mem = await executeCommand(`sar -r ${timeFilter} | tail -10`);
        result = `=== CPU ===\n${cpu}\n\n=== Memory ===\n${mem}`;
      }

      return {
        success: true,
        resource,
        duration,
        output: result || 'No historical data available',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, resource: args.resource }, 'Resource history retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * System Limits Skill
 * Show system resource limits and quotas
 */
export const systemLimitsSkill: Skill = {
  name: 'system_limits',
  description: '⚙️ Show system resource limits (ulimit, quotas, sysctl)',
  async execute(args: any) {
    try {
      const scope = args.scope || 'user';

      logger.info({ scope }, 'System limits requested');

      let result = '';

      if (scope === 'user' || scope === 'all') {
        const ulimit = await executeCommand('ulimit -a');
        result += `=== User Limits (ulimit) ===\n${ulimit}\n\n`;
        
        const limitsConf = await executeCommand('cat /etc/security/limits.conf 2>/dev/null | grep -v "^#" | grep -v "^$"');
        if (limitsConf) {
          result += `=== Configured Limits (/etc/security/limits.conf) ===\n${limitsConf}\n\n`;
        }
      }

      if (scope === 'system' || scope === 'all') {
        const fileMax = await executeCommand('sysctl fs.file-max fs.file-nr 2>/dev/null');
        const pidMax = await executeCommand('sysctl kernel.pid_max 2>/dev/null');
        const threads = await executeCommand('sysctl kernel.threads-max 2>/dev/null');
        
        result += `=== System Limits (sysctl) ===\n`;
        if (fileMax) result += `${fileMax}\n`;
        if (pidMax) result += `${pidMax}\n`;
        if (threads) result += `${threads}\n`;
      }

      if (scope === 'process' || scope === 'all') {
        const processLimits = await executeCommand('cat /proc/self/limits 2>/dev/null');
        if (processLimits) {
          result += `\n=== Current Process Limits ===\n${processLimits}\n`;
        }
      }

      return {
        success: true,
        scope,
        output: result.trim() || 'No limits information available',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, scope: args.scope }, 'System limits retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Boot Analysis Skill
 * Analyze system boot time and services
 */
const bootAnalysisSkill: Skill = {
  name: 'boot_analysis',
  description: '⚡ Analyze boot time and service startup (systemd-analyze)',
  async execute(args: any) {
    try {
      const analysis = args.analysis || 'summary';

      logger.info({ analysis }, 'Boot analysis requested');

      let result: string | null = '';

      // Check if systemd-analyze is available
      const analyzeAvailable = await executeCommand('which systemd-analyze');
      
      if (!analyzeAvailable) {
        return {
          success: false,
          error: 'systemd-analyze not available (systemd system required)',
          timestamp: new Date().toISOString(),
        };
      }

      if (analysis === 'summary' || analysis === 'time') {
        result = await executeCommand('systemd-analyze time');
      } else if (analysis === 'blame') {
        result = await executeCommand('systemd-analyze blame | head -30');
      } else if (analysis === 'critical-chain') {
        result = await executeCommand('systemd-analyze critical-chain | head -50');
      } else if (analysis === 'services') {
        result = await executeCommand('systemd-analyze blame | head -20');
      } else {
        result = await executeCommand('systemd-analyze');
      }

      return {
        success: true,
        analysis,
        output: result || 'No boot analysis data available',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, analysis: args.analysis }, 'Boot analysis failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * I/O Statistics Skill
 * Show disk I/O statistics
 */
export const ioStatisticsSkill: Skill = {
  name: 'io_statistics',
  description: '💾 Show disk I/O statistics (iostat, iotop)',
  async execute(args: any) {
    try {
      const device = args.device || 'all';
      const interval = args.interval || 1;
      const count = args.count || 5;

      logger.info({ device, interval, count }, 'I/O statistics requested');

      let result = '';

      // Try iostat first
      const iostatAvailable = await executeCommand('which iostat');
      
      if (iostatAvailable) {
        const deviceArg = device === 'all' ? '' : device;
        const iostatCmd = `iostat ${deviceArg} ${interval} ${count}`;
        const iostatResult = await executeCommand(iostatCmd);
        if (iostatResult) {
          result += `=== iostat ===\n${iostatResult}\n\n`;
        }
      }

      // Add disk stats from /proc
      const diskStats = await executeCommand('cat /proc/diskstats 2>/dev/null | head -20');
      if (diskStats) {
        result += `=== /proc/diskstats ===\n${diskStats}\n\n`;
      }

      // Try iotop if available (requires root)
      const iotopAvailable = await executeCommand('which iotop');
      if (iotopAvailable) {
        const iotop = await executeCommand('sudo iotop -b -n 1 2>/dev/null | head -20');
        if (iotop) {
          result += `=== iotop (top I/O processes) ===\n${iotop}\n`;
        }
      }

      if (!result.trim()) {
        result = 'No I/O statistics available. Install sysstat (iostat) for detailed stats.';
      }

      return {
        success: true,
        device,
        interval,
        count,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, device: args.device }, 'I/O statistics retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Package Management List Skill
 * List installed packages
 */
export const packageManagementListSkill: Skill = {
  name: 'package_management_list',
  description: '📦 List installed packages (apt/dpkg)',
  async execute(args: any) {
    try {
      const filter = args.filter || 'all';
      const search = args.search || '';

      logger.info({ filter, search }, 'Package list requested');

      let result: string | null = '';

      if (filter === 'all') {
        if (search) {
          result = await executeCommand(`dpkg -l | grep -i "${search}" | head -100`);
        } else {
          result = await executeCommand('dpkg -l | head -100');
        }
      } else if (filter === 'manual' || filter === 'manually-installed') {
        const manual = await executeCommand('apt-mark showmanual 2>/dev/null | head -100');
        if (search && manual) {
          result = manual.split('\n').filter(pkg => pkg.toLowerCase().includes(search.toLowerCase())).join('\n');
        } else {
          result = manual;
        }
      } else if (filter === 'auto' || filter === 'automatically-installed') {
        const auto = await executeCommand('apt-mark showauto 2>/dev/null | head -100');
        if (search && auto) {
          result = auto.split('\n').filter(pkg => pkg.toLowerCase().includes(search.toLowerCase())).join('\n');
        } else {
          result = auto;
        }
      } else if (filter === 'upgradable') {
        result = await executeCommand('apt list --upgradable 2>/dev/null | head -100');
      }

      // Count packages
      const count = result ? result.trim().split('\n').filter(line => line.trim()).length : 0;

      return {
        success: true,
        filter,
        search,
        count,
        output: result || 'No packages found',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, filter: args.filter }, 'Package list retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Mount Points Skill
 * Show filesystem mount points
 */
export const mountPointsSkill: Skill = {
  name: 'mount_points',
  description: '💿 Show filesystem mount points and usage',
  async execute(args: any) {
    try {
      const showType = args.showType || 'all';
      const showUsage = args.showUsage !== false;

      logger.info({ showType, showUsage }, 'Mount points requested');

      let result = '';

      // Use findmnt if available (better output)
      const findmntAvailable = await executeCommand('which findmnt');
      
      if (findmntAvailable) {
        let findmntCmd = 'findmnt';
        
        if (showType === 'physical') {
          findmntCmd += ' -t ext4,ext3,xfs,btrfs,ntfs,vfat';
        } else if (showType === 'network') {
          findmntCmd += ' -t nfs,nfs4,cifs,smbfs';
        } else if (showType === 'virtual') {
          findmntCmd += ' -t tmpfs,devtmpfs,sysfs,proc';
        }
        
        const findmnt = await executeCommand(findmntCmd);
        if (findmnt) {
          result += `=== Mount Points (findmnt) ===\n${findmnt}\n\n`;
        }
      } else {
        // Fallback to mount command
        const mount = await executeCommand('mount | column -t');
        if (mount) {
          result += `=== Mount Points ===\n${mount}\n\n`;
        }
      }

      // Show disk usage if requested
      if (showUsage) {
        const df = await executeCommand('df -h');
        if (df) {
          result += `=== Disk Usage ===\n${df}\n`;
        }
      }

      return {
        success: true,
        showType,
        showUsage,
        output: result.trim() || 'No mount points found',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, showType: args.showType }, 'Mount points retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

// =============================================================================
// 🌐 NETWORK & DIAGNOSTICS SKILLS (8 Skills)
// =============================================================================

/**
 * Network Statistics Skill
 * Show detailed network statistics
 */
export const networkStatisticsSkill: Skill = {
  name: 'network_statistics',
  description: '📊 Show detailed network statistics (packets, errors, connections)',
  async execute(args: any) {
    try {
      const category = args.category || 'summary';

      logger.info({ category }, 'Network statistics requested');

      let result = '';

      if (category === 'summary' || category === 'interfaces') {
        const netstat = await executeCommand('netstat -i');
        if (netstat) {
          result += `=== Interface Statistics ===\n${netstat}\n\n`;
        }
        
        const ifconfig = await executeCommand('ip -s link');
        if (ifconfig) {
          result += `=== Detailed Interface Stats (ip -s link) ===\n${ifconfig}\n\n`;
        }
      }

      if (category === 'summary' || category === 'protocols') {
        const protocols = await executeCommand('netstat -s | head -100');
        if (protocols) {
          result += `=== Protocol Statistics ===\n${protocols}\n\n`;
        }
      }

      if (category === 'errors') {
        const errors = await executeCommand('ip -s -s link | grep -A 2 "RX\\|TX" | head -50');
        if (errors) {
          result += `=== Network Errors ===\n${errors}\n`;
        }
      }

      if (category === 'drops') {
        const drops = await executeCommand('netstat -i | awk \'NR==1 || $4>0 || $8>0\'');
        if (drops) {
          result += `=== Dropped Packets ===\n${drops}\n`;
        }
      }

      return {
        success: true,
        category,
        output: result.trim() || 'No network statistics available',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, category: args.category }, 'Network statistics retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Route Table Skill
 * Show routing table and gateway information
 */
export const routeTableSkill: Skill = {
  name: 'route_table',
  description: '🛣️ Show routing table and gateway information',
  async execute(args: any) {
    try {
      const protocol = args.protocol || 'all';

      logger.info({ protocol }, 'Route table requested');

      let result = '';

      if (protocol === 'all' || protocol === 'ipv4') {
        const ipRoute = await executeCommand('ip route show');
        if (ipRoute) {
          result += `=== IPv4 Routing Table (ip route) ===\n${ipRoute}\n\n`;
        }

        const route = await executeCommand('route -n');
        if (route) {
          result += `=== IPv4 Routes (route -n) ===\n${route}\n\n`;
        }
      }

      if (protocol === 'all' || protocol === 'ipv6') {
        const ip6Route = await executeCommand('ip -6 route show');
        if (ip6Route) {
          result += `=== IPv6 Routing Table ===\n${ip6Route}\n\n`;
        }
      }

      // Show default gateway
      const defaultGw = await executeCommand('ip route | grep default');
      if (defaultGw) {
        result += `=== Default Gateway ===\n${defaultGw}\n`;
      }

      return {
        success: true,
        protocol,
        output: result.trim() || 'No routing information available',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, protocol: args.protocol }, 'Route table retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * MTU Discovery Skill
 * Test path MTU to a destination
 */
export const mtuDiscoverySkill: Skill = {
  name: 'mtu_discovery',
  description: '📏 Discover Path MTU to a destination',
  async execute(args: any) {
    try {
      const host = args.host || 'google.com';
      const maxSize = args.maxSize || 1500;

      logger.info({ host, maxSize }, 'MTU discovery requested');

      let result = '';

      // Get local interface MTU
      const localMtu = await executeCommand('ip link show | grep mtu | head -5');
      if (localMtu) {
        result += `=== Local Interface MTU ===\n${localMtu}\n\n`;
      }

      // Try to discover path MTU using ping with don't fragment flag
      result += `=== Path MTU Discovery to ${host} ===\n`;
      
      const sizes = [1500, 1472, 1400, 1300, 1200, 1000, 576];
      let workingMtu = 0;

      for (const size of sizes) {
        if (size > maxSize) continue;
        
        const pingCmd = `ping -M do -s ${size} -c 1 -W 2 ${host} 2>&1`;
        const pingResult = await executeCommand(pingCmd);
        
        if (pingResult && !pingResult.toLowerCase().includes('message too long') && 
            !pingResult.toLowerCase().includes('100% packet loss')) {
          workingMtu = size + 28; // Add IP+ICMP headers
          result += `✅ Size ${size} bytes: SUCCESS (MTU: ${workingMtu})\n`;
          break;
        } else {
          result += `❌ Size ${size} bytes: FAILED (too large or blocked)\n`;
        }
      }

      if (workingMtu > 0) {
        result += `\n🎯 Maximum working MTU: ${workingMtu} bytes\n`;
      } else {
        result += `\n⚠️ Could not determine path MTU (ICMP may be blocked)\n`;
      }

      return {
        success: true,
        host,
        maxSize,
        discoveredMtu: workingMtu,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host: args.host }, 'MTU discovery failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * ARP Table Skill
 * Show ARP cache entries
 */
export const arpTableSkill: Skill = {
  name: 'arp_table',
  description: '📇 Show ARP cache entries (IP to MAC address mapping)',
  async execute(args: any) {
    try {
      const filter = args.filter || 'all';

      logger.info({ filter }, 'ARP table requested');

      let result = '';

      // Try ip neigh first (newer)
      const ipNeigh = await executeCommand('ip neigh show');
      if (ipNeigh) {
        result += `=== ARP Table (ip neigh) ===\n${ipNeigh}\n\n`;
      }

      // Fallback to arp command
      const arp = await executeCommand('arp -n');
      if (arp) {
        result += `=== ARP Table (arp -n) ===\n${arp}\n\n`;
      }

      // Filter results if requested
      if (filter === 'reachable') {
        const reachable = await executeCommand('ip neigh show | grep REACHABLE');
        if (reachable) {
          result += `=== Reachable Hosts ===\n${reachable}\n`;
        }
      } else if (filter === 'stale') {
        const stale = await executeCommand('ip neigh show | grep STALE');
        if (stale) {
          result += `=== Stale Entries ===\n${stale}\n`;
        }
      }

      return {
        success: true,
        filter,
        output: result.trim() || 'No ARP entries found',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, filter: args.filter }, 'ARP table retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * WiFi Diagnostics Skill
 * Show wireless connection information
 */
export const wifiDiagnosticsSkill: Skill = {
  name: 'wifi_diagnostics',
  description: '📶 Show WiFi connection information and signal strength',
  async execute(args: any) {
    try {
      const networkInterface = args.interface || 'auto';

      logger.info({ interface: networkInterface }, 'WiFi diagnostics requested');

      let result = '';

      // Try iwconfig first
      const iwconfig = await executeCommand('iwconfig 2>&1 | grep -v "no wireless"');
      if (iwconfig && iwconfig.trim()) {
        result += `=== Wireless Interfaces (iwconfig) ===\n${iwconfig}\n\n`;
      }

      // Try iw for more details
      const iw = await executeCommand('iw dev 2>/dev/null');
      if (iw && iw.trim()) {
        result += `=== Wireless Device Info (iw dev) ===\n${iw}\n\n`;
      }

      // Get link info
      if (networkInterface !== 'auto') {
        const linkInfo = await executeCommand(`iw dev ${networkInterface} link 2>/dev/null`);
        if (linkInfo && linkInfo.trim()) {
          result += `=== Link Information (${networkInterface}) ===\n${linkInfo}\n\n`;
        }

        const station = await executeCommand(`iw dev ${networkInterface} station dump 2>/dev/null`);
        if (station && station.trim()) {
          result += `=== Station Information ===\n${station}\n`;
        }
      } else {
        // Auto-detect interface
        const wifiInterfaces = await executeCommand('iw dev | grep Interface | awk \'{print $2}\'');
        if (wifiInterfaces && wifiInterfaces.trim()) {
          const firstInterface = wifiInterfaces.trim().split('\n')[0];
          const linkInfo = await executeCommand(`iw dev ${firstInterface} link 2>/dev/null`);
          if (linkInfo && linkInfo.trim()) {
            result += `=== Link Information (${firstInterface}) ===\n${linkInfo}\n`;
          }
        }
      }

      if (!result.trim()) {
        result = 'No wireless interfaces found or wireless tools not installed (install wireless-tools or iw)';
      }

      return {
        success: true,
        interface: networkInterface,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, interface: args.interface }, 'WiFi diagnostics failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Bridge/VLAN Info Skill
 * Show bridge and VLAN configuration
 */
export const bridgeVlanInfoSkill: Skill = {
  name: 'bridge_vlan_info',
  description: '🌉 Show bridge and VLAN configuration',
  async execute(args: any) {
    try {
      const showType = args.showType || 'all';

      logger.info({ showType }, 'Bridge/VLAN info requested');

      let result = '';

      if (showType === 'all' || showType === 'bridge') {
        const bridges = await executeCommand('ip link show type bridge');
        if (bridges && bridges.trim()) {
          result += `=== Network Bridges ===\n${bridges}\n\n`;
        }

        const brctl = await executeCommand('brctl show 2>/dev/null');
        if (brctl && brctl.trim()) {
          result += `=== Bridge Details (brctl) ===\n${brctl}\n\n`;
        }
      }

      if (showType === 'all' || showType === 'vlan') {
        const vlans = await executeCommand('ip -d link show | grep vlan');
        if (vlans && vlans.trim()) {
          result += `=== VLAN Interfaces ===\n${vlans}\n\n`;
        }

        const vlanConfig = await executeCommand('cat /proc/net/vlan/config 2>/dev/null');
        if (vlanConfig && vlanConfig.trim()) {
          result += `=== VLAN Configuration ===\n${vlanConfig}\n`;
        }
      }

      if (!result.trim()) {
        result = 'No bridges or VLANs configured';
      }

      return {
        success: true,
        showType,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, showType: args.showType }, 'Bridge/VLAN info retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * GeoIP Lookup Skill
 * Lookup geolocation information for IP address
 */
const geoipLookupSkill: Skill = {
  name: 'geoip_lookup',
  description: '🌍 Lookup IP geolocation information',
  async execute(args: any) {
    try {
      const ip = args.ip;

      if (!ip) {
        return { success: false, error: 'IP address is required' };
      }

      logger.info({ ip }, 'GeoIP lookup requested');

      let result = '';

      // Try multiple free GeoIP services
      const services = [
        `curl -s "http://ip-api.com/json/${ip}"`,
        `curl -s "https://ipapi.co/${ip}/json/"`,
        `curl -s "https://ipinfo.io/${ip}/json"`,
      ];

      let geoData: any = null;
      
      for (const service of services) {
        const response = await executeCommand(service);
        if (response && response.trim()) {
          try {
            geoData = JSON.parse(response);
            if (geoData && (geoData.country || geoData.country_name)) {
              result += `=== GeoIP Information for ${ip} ===\n`;
              
              // Parse different service formats
              if (geoData.country) {
                result += `Country: ${geoData.country}\n`;
              }
              if (geoData.country_name) {
                result += `Country: ${geoData.country_name}\n`;
              }
              if (geoData.regionName || geoData.region) {
                result += `Region: ${geoData.regionName || geoData.region}\n`;
              }
              if (geoData.city) {
                result += `City: ${geoData.city}\n`;
              }
              if (geoData.zip || geoData.postal) {
                result += `Postal Code: ${geoData.zip || geoData.postal}\n`;
              }
              if (geoData.lat || geoData.latitude) {
                result += `Latitude: ${geoData.lat || geoData.latitude}\n`;
              }
              if (geoData.lon || geoData.longitude) {
                result += `Longitude: ${geoData.lon || geoData.longitude}\n`;
              }
              if (geoData.isp || geoData.org) {
                result += `ISP/Organization: ${geoData.isp || geoData.org}\n`;
              }
              if (geoData.as) {
                result += `AS: ${geoData.as}\n`;
              }
              if (geoData.timezone) {
                result += `Timezone: ${geoData.timezone}\n`;
              }
              
              break;
            }
          } catch (e) {
            // Try next service
            continue;
          }
        }
      }

      if (!result.trim()) {
        result = 'Could not retrieve GeoIP information (services may be unavailable or IP invalid)';
      }

      return {
        success: true,
        ip,
        output: result.trim(),
        geoData,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, ip: args.ip }, 'GeoIP lookup failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Connection Tracking Skill
 * Show connection tracking table (conntrack)
 */
export const connectionTrackingSkill: Skill = {
  name: 'connection_tracking',
  description: '🔗 Show connection tracking table (conntrack state)',
  async execute(args: any) {
    try {
      const protocol = args.protocol || 'all';
      const state = args.state || 'all';

      logger.info({ protocol, state }, 'Connection tracking requested');

      let result = '';

      // Try conntrack command
      const conntrackAvailable = await executeCommand('which conntrack');
      
      if (conntrackAvailable) {
        let conntrackCmd = 'sudo conntrack -L 2>/dev/null | head -100';
        
        if (protocol !== 'all') {
          conntrackCmd = `sudo conntrack -L -p ${protocol} 2>/dev/null | head -100`;
        }
        
        const conntrack = await executeCommand(conntrackCmd);
        if (conntrack && conntrack.trim()) {
          result += `=== Connection Tracking Table ===\n${conntrack}\n\n`;
        }

        // Get statistics
        const stats = await executeCommand('sudo conntrack -S 2>/dev/null');
        if (stats && stats.trim()) {
          result += `=== Connection Tracking Statistics ===\n${stats}\n\n`;
        }
      } else {
        // Fallback to /proc/net/nf_conntrack
        const procConntrack = await executeCommand('cat /proc/net/nf_conntrack 2>/dev/null | head -100');
        if (procConntrack && procConntrack.trim()) {
          result += `=== Connection Tracking (/proc/net/nf_conntrack) ===\n${procConntrack}\n\n`;
        }
      }

      // Show connection tracking limits
      const limits = await executeCommand('sysctl net.netfilter.nf_conntrack_max net.netfilter.nf_conntrack_count 2>/dev/null');
      if (limits && limits.trim()) {
        result += `=== Connection Tracking Limits ===\n${limits}\n`;
      }

      if (!result.trim()) {
        result = 'Connection tracking not available (conntrack tool not installed or no root access)';
      }

      return {
        success: true,
        protocol,
        state,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, protocol: args.protocol }, 'Connection tracking retrieval failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🌐 Virtual Host List - List Apache/Nginx virtual hosts
 */
export const virtualHostListSkill: Skill = {
  name: 'virtual_host_list',
  description: '🌐 List virtual hosts from Apache/Nginx configuration',
  async execute(args: any) {
    try {
      const serverType = args.serverType || 'auto';

      logger.info({ serverType }, 'Virtual host list requested');

      let result = '';

      // Check Apache
      if (serverType === 'auto' || serverType === 'apache') {
        const apache = await executeCommand('apache2ctl -S 2>/dev/null || apachectl -S 2>/dev/null');
        if (apache && apache.trim() && !apache.includes('not found')) {
          result += `=== Apache Virtual Hosts ===\n${apache}\n\n`;
        }
      }

      // Check Nginx
      if (serverType === 'auto' || serverType === 'nginx') {
        const nginx = await executeCommand('nginx -T 2>/dev/null | grep -E "server_name|listen" | head -50');
        if (nginx && nginx.trim() && !nginx.includes('not found')) {
          result += `=== Nginx Virtual Hosts (server blocks) ===\n${nginx}\n\n`;
        }
      }

      // Check config files directly
      const apacheConfigs = await executeCommand('find /etc/apache2 /etc/httpd -name "*.conf" 2>/dev/null | grep -i vhost | head -10');
      if (apacheConfigs && apacheConfigs.trim()) {
        result += `=== Apache Config Files ===\n${apacheConfigs}\n\n`;
      }

      const nginxConfigs = await executeCommand('find /etc/nginx -name "*.conf" 2>/dev/null | head -10');
      if (nginxConfigs && nginxConfigs.trim()) {
        result += `=== Nginx Config Files ===\n${nginxConfigs}\n`;
      }

      if (!result.trim()) {
        result = 'No web server virtual hosts found (Apache/Nginx not installed or no access)';
      }

      return {
        success: true,
        serverType,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Virtual host list failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 📧 Email Server Test - Test email server connectivity
 */
export const emailServerTestSkill: Skill = {
  name: 'email_server_test',
  description: '📧 Test email server connectivity (SMTP/IMAP/POP3)',
  async execute(args: any) {
    try {
      const host = args.host || 'localhost';
      const protocol = args.protocol || 'smtp';

      logger.info({ host, protocol }, 'Email server test requested');

      let result = '';

      // Port mapping
      const ports: { [key: string]: number } = {
        smtp: 25,
        smtps: 465,
        submission: 587,
        imap: 143,
        imaps: 993,
        pop3: 110,
        pop3s: 995,
      };

      const port = ports[protocol] || 25;

      // Test connection with timeout
      const telnetTest = await executeCommand(`timeout 5 bash -c "echo quit | telnet ${host} ${port} 2>&1" | head -10`);
      if (telnetTest && telnetTest.trim()) {
        result += `=== Connection Test (${host}:${port}) ===\n${telnetTest}\n\n`;
      }

      // Test with netcat
      const ncTest = await executeCommand(`timeout 3 nc -zv ${host} ${port} 2>&1`);
      if (ncTest && ncTest.trim()) {
        result += `=== Port Check (nc) ===\n${ncTest}\n\n`;
      }

      // SSL/TLS test for secure protocols
      if (['smtps', 'imaps', 'pop3s', 'submission'].includes(protocol)) {
        const sslTest = await executeCommand(`echo "QUIT" | timeout 3 openssl s_client -connect ${host}:${port} -brief 2>&1 | head -15`);
        if (sslTest && sslTest.trim()) {
          result += `=== SSL/TLS Test ===\n${sslTest}\n`;
        }
      }

      if (!result.trim()) {
        result = `Failed to connect to ${host}:${port} (${protocol})`;
      }

      return {
        success: true,
        host,
        protocol,
        port,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host: args.host }, 'Email server test failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🌍 DNS Propagation Check - Check DNS across multiple nameservers
 */
export const dnsPropagationCheckSkill: Skill = {
  name: 'dns_propagation_check',
  description: '🌍 Check DNS propagation across multiple public nameservers',
  async execute(args: any) {
    try {
      const domain = args.domain;
      const recordType = args.recordType || 'A';

      if (!domain) {
        return { success: false, error: 'Domain is required' };
      }

      logger.info({ domain, recordType }, 'DNS propagation check requested');

      let result = '';

      // Public DNS servers to check
      const dnsServers = [
        { name: 'Google DNS', ip: '8.8.8.8' },
        { name: 'Cloudflare DNS', ip: '1.1.1.1' },
        { name: 'Quad9 DNS', ip: '9.9.9.9' },
        { name: 'OpenDNS', ip: '208.67.222.222' },
      ];

      for (const server of dnsServers) {
        const query = await executeCommand(`dig @${server.ip} ${domain} ${recordType} +short 2>/dev/null | head -5`);
        if (query !== null) {
          result += `=== ${server.name} (${server.ip}) ===\n`;
          result += query.trim() || 'No records found';
          result += '\n\n';
        }
      }

      // Also check local resolver
      const localQuery = await executeCommand(`dig ${domain} ${recordType} +short 2>/dev/null | head -5`);
      if (localQuery !== null) {
        result += `=== Local Resolver ===\n${localQuery.trim() || 'No records found'}\n`;
      }

      return {
        success: true,
        domain,
        recordType,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, domain: args.domain }, 'DNS propagation check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🌐 Website Uptime - Check website availability and response time
 */
export const websiteUptimeSkill: Skill = {
  name: 'website_uptime',
  description: '🌐 Check website availability and response time',
  async execute(args: any) {
    try {
      const url = args.url;

      if (!url) {
        return { success: false, error: 'URL is required' };
      }

      logger.info({ url }, 'Website uptime check requested');

      // curl with timing and status code
      const curlCmd = `curl -o /dev/null -s -w "HTTP Status: %{http_code}\\nTotal Time: %{time_total}s\\nDNS Lookup: %{time_namelookup}s\\nConnect Time: %{time_connect}s\\nTTFB: %{time_starttransfer}s\\nDownload Size: %{size_download} bytes\\n" "${url}"`;
      
      const result = await executeCommand(curlCmd);

      if (!result) {
        return {
          success: false,
          error: 'Failed to connect to website',
        };
      }

      // Parse status code
      const statusMatch = result.match(/HTTP Status: (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;
      const isUp = status >= 200 && status < 400;

      return {
        success: true,
        url,
        status,
        isUp,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, url: args.url }, 'Website uptime check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 💾 Backup Verification - Verify backup files and integrity
 */
export const backupVerificationSkill: Skill = {
  name: 'backup_verification',
  description: '💾 Verify backup files and test archive integrity',
  async execute(args: any) {
    try {
      const backupPath = args.backupPath || '/backup';

      logger.info({ backupPath }, 'Backup verification requested');

      let result = '';

      // List backup files
      const backupList = await executeCommand(`find ${backupPath} -type f \\( -name "*.tar.gz" -o -name "*.zip" -o -name "*.tar" -o -name "*.sql" -o -name "*.sql.gz" \\) -exec ls -lh {} \\; 2>/dev/null | head -20`);
      if (backupList && backupList.trim()) {
        result += `=== Backup Files in ${backupPath} ===\n${backupList}\n\n`;
      }

      // Find most recent backups
      const recentBackups = await executeCommand(`find ${backupPath} -type f -mtime -7 \\( -name "*.tar.gz" -o -name "*.zip" \\) 2>/dev/null | head -5`);
      if (recentBackups && recentBackups.trim()) {
        result += `=== Recent Backups (last 7 days) ===\n${recentBackups}\n\n`;

        // Test first backup integrity
        const firstBackup = recentBackups.trim().split('\n')[0];
        if (firstBackup.endsWith('.tar.gz')) {
          const integrityTest = await executeCommand(`tar -tzf "${firstBackup}" 2>&1 | head -1`);
          if (integrityTest && integrityTest.trim()) {
            result += `=== Integrity Test (${firstBackup.split('/').pop()}) ===\n✅ Archive is readable\nFirst entry: ${integrityTest}\n\n`;
          }
        } else if (firstBackup.endsWith('.zip')) {
          const integrityTest = await executeCommand(`unzip -t "${firstBackup}" 2>&1 | tail -3`);
          if (integrityTest && integrityTest.trim()) {
            result += `=== Integrity Test (${firstBackup.split('/').pop()}) ===\n${integrityTest}\n`;
          }
        }
      }

      if (!result.trim()) {
        result = `No backup files found in ${backupPath}`;
      }

      return {
        success: true,
        backupPath,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, backupPath: args.backupPath }, 'Backup verification failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🔗 Database Connection Pools - Show database connection pool status
 */
const databaseConnectionPoolsSkill: Skill = {
  name: 'database_connection_pools',
  description: '🔗 Show database connection pool status and active connections',
  async execute(args: any) {
    try {
      const dbType = args.dbType || 'auto';

      logger.info({ dbType }, 'Database connection pools requested');

      let result = '';

      // MySQL connections
      if (dbType === 'auto' || dbType === 'mysql') {
        const mysqlProc = await executeCommand('mysql -e "SHOW PROCESSLIST;" 2>/dev/null | head -30');
        if (mysqlProc && mysqlProc.trim() && !mysqlProc.includes('not found')) {
          result += `=== MySQL Active Connections ===\n${mysqlProc}\n\n`;
        }

        const mysqlStatus = await executeCommand('mysql -e "SHOW STATUS LIKE \'Threads%\';" 2>/dev/null');
        if (mysqlStatus && mysqlStatus.trim()) {
          result += `=== MySQL Thread Status ===\n${mysqlStatus}\n\n`;
        }

        const mysqlMax = await executeCommand('mysql -e "SHOW VARIABLES LIKE \'max_connections\';" 2>/dev/null');
        if (mysqlMax && mysqlMax.trim()) {
          result += `=== MySQL Max Connections ===\n${mysqlMax}\n\n`;
        }
      }

      // PostgreSQL connections
      if (dbType === 'auto' || dbType === 'postgresql') {
        const pgConnections = await executeCommand('sudo -u postgres psql -c "SELECT count(*) as active_connections FROM pg_stat_activity;" 2>/dev/null');
        if (pgConnections && pgConnections.trim() && !pgConnections.includes('not found')) {
          result += `=== PostgreSQL Active Connections ===\n${pgConnections}\n\n`;
        }

        const pgActivity = await executeCommand('sudo -u postgres psql -c "SELECT datname, usename, state, count(*) FROM pg_stat_activity GROUP BY datname, usename, state;" 2>/dev/null | head -20');
        if (pgActivity && pgActivity.trim()) {
          result += `=== PostgreSQL Connection Details ===\n${pgActivity}\n`;
        }
      }

      if (!result.trim()) {
        result = 'No database servers found or no access (install MySQL/PostgreSQL)';
      }

      return {
        success: true,
        dbType,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Database connection pools check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 📊 Quota Usage - Show disk quota usage per user
 */
export const quotaUsageSkill: Skill = {
  name: 'quota_usage',
  description: '📊 Show disk quota usage per user/group',
  async execute(args: any) {
    try {
      const scope = args.scope || 'user';

      logger.info({ scope }, 'Quota usage requested');

      let result = '';

      // Check if quota is enabled
      const quotaCheck = await executeCommand('mount | grep quota 2>/dev/null');
      if (quotaCheck && quotaCheck.trim()) {
        result += `=== Filesystems with Quota Enabled ===\n${quotaCheck}\n\n`;
      }

      // User quota
      if (scope === 'user' || scope === 'all') {
        const userQuota = await executeCommand('quota -v 2>/dev/null');
        if (userQuota && userQuota.trim() && !userQuota.includes('not found')) {
          result += `=== Current User Quota ===\n${userQuota}\n\n`;
        }

        const repquota = await executeCommand('sudo repquota -a 2>/dev/null | head -30');
        if (repquota && repquota.trim()) {
          result += `=== All User Quotas (repquota) ===\n${repquota}\n\n`;
        }
      }

      // Group quota
      if (scope === 'group' || scope === 'all') {
        const groupQuota = await executeCommand('sudo repquota -g -a 2>/dev/null | head -30');
        if (groupQuota && groupQuota.trim()) {
          result += `=== Group Quotas ===\n${groupQuota}\n`;
        }
      }

      if (!result.trim()) {
        result = 'No quota information available (quota may not be enabled or installed)';
      }

      return {
        success: true,
        scope,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Quota usage check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🔐 SSL Multi-Domain Check - Check SSL certificates for multiple domains
 */
export const sslMultiDomainCheckSkill: Skill = {
  name: 'ssl_multi_domain_check',
  description: '🔐 Check SSL certificates for multiple domains',
  async execute(args: any) {
    try {
      const domains = args.domains || [];

      if (!Array.isArray(domains) || domains.length === 0) {
        return { success: false, error: 'Domains array is required' };
      }

      logger.info({ domains }, 'SSL multi-domain check requested');

      let result = '';

      for (const domain of domains.slice(0, 5)) {
        // Limit to 5 domains
        const sslInfo = await executeCommand(
          `echo | timeout 5 openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -subject -issuer -dates 2>/dev/null`
        );

        if (sslInfo && sslInfo.trim()) {
          result += `=== ${domain} ===\n${sslInfo}\n\n`;
        } else {
          result += `=== ${domain} ===\n❌ Could not retrieve SSL certificate\n\n`;
        }
      }

      return {
        success: true,
        domains,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'SSL multi-domain check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 📁 FTP/SFTP Status - Check FTP/SFTP service status
 */
export const ftpStatusSkill: Skill = {
  name: 'ftp_status',
  description: '📁 Check FTP/SFTP service status and active connections',
  async execute(args: any) {
    try {
      logger.info('FTP/SFTP status requested');

      let result = '';

      // Check vsftpd
      const vsftpd = await executeCommand('systemctl status vsftpd 2>/dev/null | head -15');
      if (vsftpd && vsftpd.trim() && !vsftpd.includes('could not be found')) {
        result += `=== vsftpd Service Status ===\n${vsftpd}\n\n`;
      }

      // Check proftpd
      const proftpd = await executeCommand('systemctl status proftpd 2>/dev/null | head -15');
      if (proftpd && proftpd.trim() && !proftpd.includes('could not be found')) {
        result += `=== ProFTPD Service Status ===\n${proftpd}\n\n`;
      }

      // Check FTP port 21
      const ftpPort = await executeCommand('ss -tuln | grep :21');
      if (ftpPort && ftpPort.trim()) {
        result += `=== FTP Port (21) Listening ===\n${ftpPort}\n\n`;
      }

      // Check SFTP (SSH port 22)
      const sftpPort = await executeCommand('ss -tuln | grep :22');
      if (sftpPort && sftpPort.trim()) {
        result += `=== SFTP Port (22) Listening ===\n${sftpPort}\n\n`;
      }

      // Active FTP connections
      const ftpConnections = await executeCommand('ss -tn | grep :21');
      if (ftpConnections && ftpConnections.trim()) {
        result += `=== Active FTP Connections ===\n${ftpConnections}\n`;
      }

      if (!result.trim()) {
        result = 'No FTP/SFTP services found or not running';
      }

      return {
        success: true,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'FTP status check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🎛️ Control Panel Status - Check common control panel status
 */
export const controlPanelStatusSkill: Skill = {
  name: 'control_panel_status',
  description: '🎛️ Detect which web hosting control panel is installed on a remote server in a single SSH call. Checks cPanel, CWP, Plesk, DirectAdmin, ISPConfig, Webmin, HestiaCP, KloxoNG, CyberPanel, aaPanel, Froxlor. Returns panel name, version, and admin URL. Auto-loads vault password if none provided.',
  async execute(args: any) {
    const host     = args.host || args.connectionId || args.hostname;
    const username = args.username || 'root';
    const port     = args.port || 22;
    let   password: string | undefined = args.password;
    const keyPath  = args.keyPath;

    // Auto-load vault credential when none provided
    if (!password && !keyPath) {
      try {
        const vaultPw = await getCredentialManager().getCredential(`${username}@${host}`);
        if (vaultPw) { password = vaultPw; }
      } catch { /* fall through to key auth */ }
    }

    // Single compound command — all detection in ONE SSH round-trip
    const detectionCmd = [
      'P="none"; V=""; U=""; IP=$(hostname -I | awk \'{print $1}\' 2>/dev/null || echo "?")',
      '[ -f /usr/local/cpanel/cpanel ]                              && P=cPanel     && V=$(cat /usr/local/cpanel/version 2>/dev/null | head -1)                                                                   && U="https://$IP:2087 (WHM) | https://$IP:2083 (cPanel)"',
      '[ "$P" = none ] && [ -d /usr/local/cwpsrv ]                  && P=CWP        && V=$(grep -oP \'(?<=")[0-9.]+(?=")\' /usr/local/cwpsrv/htdocs/resources/admin/include/version.php 2>/dev/null | head -1)   && U="http://$IP:2030 | https://$IP:2031"',
      '[ "$P" = none ] && [ -f /usr/local/psa/version ]             && P=Plesk      && V=$(cat /usr/local/psa/version 2>/dev/null | head -1)                                                                     && U="https://$IP:8443"',
      '[ "$P" = none ] && [ -f /usr/local/directadmin/directadmin ] && P=DirectAdmin && V=$(cat /usr/local/directadmin/version 2>/dev/null | head -1)                                                            && U="http://$IP:2222"',
      '[ "$P" = none ] && [ -f /usr/local/ispconfig/interface/web/index.php ] && P=ISPConfig && V=$(grep -oP "(?<=APP_VERSION = \')[^\']*" /usr/local/ispconfig/server/lib/config.inc.php 2>/dev/null | head -1) && U="https://$IP:8080"',
      '[ "$P" = none ] && [ -f /etc/webmin/version ]                && P=Webmin     && V=$(cat /etc/webmin/version 2>/dev/null)                                                                                  && U="https://$IP:10000"',
      '[ "$P" = none ] && [ -f /usr/local/hestia/conf/hestia.conf ] && P=HestiaCP   && V=$(grep "^VERSION" /usr/local/hestia/conf/hestia.conf 2>/dev/null | cut -d= -f2 | tr -d "\'\\\" ")                      && U="https://$IP:8083"',
      '[ "$P" = none ] && [ -d /usr/local/lxlabs ]                  && P=KloxoNG    && V=$(cat /usr/local/lxlabs/kloxo/etc/release 2>/dev/null | head -1)                                                       && U="http://$IP:7776"',
      '[ "$P" = none ] && [ -d /usr/local/CyberCP ]                 && P=CyberPanel && V=$(cat /usr/local/CyberCP/version.txt 2>/dev/null | head -1)                                                            && U="https://$IP:8090"',
      '[ "$P" = none ] && [ -d /www/server/panel ]                  && P=aaPanel    && V=$(cat /www/server/panel/data/version.pl 2>/dev/null | head -1)                                                          && U="http://$IP:7800"',
      '[ "$P" = none ] && [ -d /var/www/froxlor ]                   && P=Froxlor    && V=$(grep -oP "(?<=VERSION = \')[^\']*" /var/www/froxlor/lib/version.php 2>/dev/null | head -1)                            && U="https://$IP/froxlor"',
      'echo "PANEL:$P"',
      'echo "VERSION:${V:-unknown}"',
      'echo "URL:${U:-n/a}"',
      'echo "HOSTNAME:$(hostname -f 2>/dev/null || hostname)"',
      'echo "OS:$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d \'"\')"',
      'echo "UPTIME:$(uptime -p 2>/dev/null || uptime)"',
    ].join('; ');

    try {
      let raw: string;
      if (password) {
        raw = await sshWithPassword(username, host, password, detectionCmd, port);
      } else {
        const { execSync } = await import('child_process');
        const key = keyPath || `${os.homedir()}/.ssh/id_rsa`;
        raw = execSync(
          `ssh -i "${key}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${port} ${username}@${host} "${detectionCmd.replace(/"/g, '\\"')}"`,
          { timeout: 20000 }
        ).toString();
      }

      // Parse structured output
      const get = (key: string) => {
        const m = raw.match(new RegExp(`^${key}:(.*)$`, 'm'));
        return m ? m[1].trim() : '';
      };

      const panel    = get('PANEL');
      const version  = get('VERSION');
      const url      = get('URL');
      const hostname = get('HOSTNAME');
      const osName   = get('OS');
      const uptime   = get('UPTIME');

      if (panel === 'none' || !panel) {
        return {
          success: true,
          panel: 'none',
          message: `No known control panel found on ${host}. Server: ${hostname} (${osName})`,
          raw,
        };
      }

      return {
        success: true,
        panel,
        version,
        adminUrl: url,
        hostname,
        os: osName,
        uptime,
        message: `${panel} ${version} detected on ${hostname} (${host}). Admin: ${url}`,
      };
    } catch (error: any) {
      logger.error({ error, host }, 'control_panel_status SSH detection failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🐘 PHP Configuration - Show PHP version and configuration
 */
export const phpConfigurationSkill: Skill = {
  name: 'php_configuration',
  description: '🐘 Show PHP version, modules, and configuration',
  async execute(args: any) {
    try {
      logger.info('PHP configuration requested');

      let result = '';

      // PHP version
      const phpVersion = await executeCommand('php -v 2>/dev/null | head -3');
      if (phpVersion && phpVersion.trim() && !phpVersion.includes('not found')) {
        result += `=== PHP Version ===\n${phpVersion}\n\n`;

        // PHP modules
        const phpModules = await executeCommand('php -m 2>/dev/null | sort');
        if (phpModules && phpModules.trim()) {
          result += `=== Installed PHP Modules ===\n${phpModules}\n\n`;
        }

        // PHP configuration file location
        const phpIni = await executeCommand('php -i 2>/dev/null | grep "Loaded Configuration File"');
        if (phpIni && phpIni.trim()) {
          result += `=== PHP Configuration File ===\n${phpIni}\n\n`;
        }

        // Key PHP settings
        const phpSettings = await executeCommand(
          'php -i 2>/dev/null | grep -E "memory_limit|max_execution_time|upload_max_filesize|post_max_size|error_reporting" | head -10'
        );
        if (phpSettings && phpSettings.trim()) {
          result += `=== Key PHP Settings ===\n${phpSettings}\n`;
        }
      } else {
        result = 'PHP is not installed or not in PATH';
      }

      return {
        success: true,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'PHP configuration check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🔐 SSH Key Management - Manage and list SSH keys
 */
export const sshKeyManagementSkill: Skill = {
  name: 'ssh_key_management',
  description: '🔐 Manage SSH keys - list, generate, show fingerprints',
  async execute(args: any) {
    try {
      const action = args.action || 'list';

      logger.info({ action }, 'SSH key management requested');

      let result = '';

      if (action === 'list' || action === 'all') {
        // List public keys
        const pubKeys = await executeCommand('find ~/.ssh -name "*.pub" -exec ls -lh {} \\; 2>/dev/null');
        if (pubKeys && pubKeys.trim()) {
          result += `=== SSH Public Keys ===\n${pubKeys}\n\n`;

          // Show fingerprints
          const fingerprints = await executeCommand('find ~/.ssh -name "*.pub" -exec ssh-keygen -lf {} \\; 2>/dev/null');
          if (fingerprints && fingerprints.trim()) {
            result += `=== Key Fingerprints ===\n${fingerprints}\n\n`;
          }
        }

        // List private keys
        const privKeys = await executeCommand('find ~/.ssh -type f ! -name "*.pub" ! -name "known_hosts*" ! -name "authorized_keys*" ! -name "config" -exec ls -lh {} \\; 2>/dev/null | head -20');
        if (privKeys && privKeys.trim()) {
          result += `=== SSH Private Keys ===\n${privKeys}\n\n`;
        }

        // Authorized keys
        const authKeys = await executeCommand('cat ~/.ssh/authorized_keys 2>/dev/null | grep -v "^#" | grep -v "^$" | wc -l');
        if (authKeys && authKeys.trim()) {
          result += `=== Authorized Keys Count ===\n${authKeys.trim()} keys\n\n`;
        }
      }

      if (action === 'check-permissions' || action === 'all') {
        const perms = await executeCommand('ls -la ~/.ssh/ 2>/dev/null');
        if (perms && perms.trim()) {
          result += `=== SSH Directory Permissions ===\n${perms}\n\n`;
        }
      }

      if (action === 'agent') {
        const agent = await executeCommand('ssh-add -l 2>/dev/null');
        if (agent && agent.trim()) {
          result += `=== SSH Agent Keys ===\n${agent}\n`;
        } else {
          result += '=== SSH Agent ===\nNo keys loaded or agent not running\n';
        }
      }

      if (!result.trim()) {
        result = 'No SSH keys found in ~/.ssh directory';
      }

      return {
        success: true,
        action,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'SSH key management failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🔒 Security Updates - Check for security updates
 */
export const securityUpdatesSkill: Skill = {
  name: 'security_updates',
  description: '🔒 Check for available security updates',
  async execute(args: any) {
    try {
      logger.info('Security updates check requested');

      let result = '';

      // Ubuntu/Debian security updates
      const aptUpdate = await executeCommand('apt-get update 2>&1 | tail -5');
      if (aptUpdate && !aptUpdate.includes('not found')) {
        result += `=== Repository Update ===\n${aptUpdate}\n\n`;
      }

      const securityUpdates = await executeCommand('apt list --upgradable 2>/dev/null | grep -i security | head -20');
      if (securityUpdates && securityUpdates.trim()) {
        result += `=== Available Security Updates ===\n${securityUpdates}\n\n`;
      }

      // Count all upgradable packages
      const upgradableCount = await executeCommand('apt list --upgradable 2>/dev/null | grep -c "upgradable"');
      if (upgradableCount && upgradableCount.trim()) {
        result += `=== Total Upgradable Packages ===\n${upgradableCount.trim()} packages\n\n`;
      }

      // Check unattended-upgrades status
      const unattended = await executeCommand('systemctl status unattended-upgrades 2>/dev/null | head -10');
      if (unattended && unattended.trim() && !unattended.includes('could not be found')) {
        result += `=== Automatic Security Updates Status ===\n${unattended}\n`;
      }

      // Check for reboot required
      const rebootRequired = await executeCommand('test -f /var/run/reboot-required && cat /var/run/reboot-required 2>/dev/null');
      if (rebootRequired && rebootRequired.trim()) {
        result += `\n⚠️  ${rebootRequired}\n`;
      }

      if (!result.trim()) {
        result = 'Unable to check for security updates (may need elevated permissions)';
      }

      return {
        success: true,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Security updates check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🛡️ Intrusion Detection - Check intrusion detection systems
 */
export const intrusionDetectionSkill: Skill = {
  name: 'intrusion_detection',
  description: '🛡️ Check intrusion detection systems (fail2ban, AIDE)',
  async execute(args: any) {
    try {
      logger.info('Intrusion detection check requested');

      let result = '';

      // Check fail2ban
      const fail2banStatus = await executeCommand('sudo systemctl status fail2ban 2>/dev/null | head -12');
      if (fail2banStatus && fail2banStatus.trim() && !fail2banStatus.includes('could not be found')) {
        result += `=== fail2ban Status ===\n${fail2banStatus}\n\n`;

        // List fail2ban jails
        const jails = await executeCommand('sudo fail2ban-client status 2>/dev/null');
        if (jails && jails.trim()) {
          result += `=== fail2ban Jails ===\n${jails}\n\n`;
        }

        // Banned IPs
        const banned = await executeCommand('sudo fail2ban-client status sshd 2>/dev/null | grep "Banned IP list"');
        if (banned && banned.trim()) {
          result += `=== Banned IPs (sshd) ===\n${banned}\n\n`;
        }
      }

      // Check AIDE (Advanced Intrusion Detection Environment)
      const aideCheck = await executeCommand('which aide 2>/dev/null');
      if (aideCheck && aideCheck.trim()) {
        result += `=== AIDE Installed ===\n${aideCheck}\n`;
        
        const aideConfig = await executeCommand('ls -lh /var/lib/aide/aide.db* 2>/dev/null | head -5');
        if (aideConfig && aideConfig.trim()) {
          result += `Database files:\n${aideConfig}\n\n`;
        }
      }

      // Check rkhunter
      const rkhunter = await executeCommand('which rkhunter 2>/dev/null');
      if (rkhunter && rkhunter.trim()) {
        result += `=== rkhunter Installed ===\n${rkhunter}\n`;
      }

      // Check tripwire
      const tripwire = await executeCommand('which tripwire 2>/dev/null');
      if (tripwire && tripwire.trim()) {
        result += `=== Tripwire Installed ===\n${tripwire}\n`;
      }

      if (!result.trim()) {
        result = 'No intrusion detection systems found (install fail2ban, AIDE, rkhunter, or tripwire)';
      }

      return {
        success: true,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Intrusion detection check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🔑 Password Policy - Show password policy settings
 */
export const passwordPolicySkill: Skill = {
  name: 'password_policy',
  description: '🔑 Show system password policy and requirements',
  async execute(args: any) {
    try {
      logger.info('Password policy check requested');

      let result = '';

      // PAM password quality requirements
      const pamQuality = await executeCommand('grep -E "pam_pwquality|pam_cracklib" /etc/pam.d/common-password 2>/dev/null');
      if (pamQuality && pamQuality.trim()) {
        result += `=== PAM Password Quality Settings ===\n${pamQuality}\n\n`;
      }

      // pwquality configuration
      const pwquality = await executeCommand('cat /etc/security/pwquality.conf 2>/dev/null | grep -v "^#" | grep -v "^$" | head -20');
      if (pwquality && pwquality.trim()) {
        result += `=== Password Quality Configuration ===\n${pwquality}\n\n`;
      }

      // Login.defs password aging
      const loginDefs = await executeCommand('grep -E "^PASS_" /etc/login.defs 2>/dev/null');
      if (loginDefs && loginDefs.trim()) {
        result += `=== Password Aging Policy (/etc/login.defs) ===\n${loginDefs}\n\n`;
      }

      // Check user password expiry
      const currentUser = await executeCommand('whoami');
      if (currentUser && currentUser.trim()) {
        const userExpiry = await executeCommand(`sudo chage -l ${currentUser.trim()} 2>/dev/null | head -10`);
        if (userExpiry && userExpiry.trim()) {
          result += `=== Current User Password Expiry (${currentUser.trim()}) ===\n${userExpiry}\n\n`;
        }
      }

      // Account lockout policy
      const faillock = await executeCommand('grep pam_faillock /etc/pam.d/common-auth 2>/dev/null');
      if (faillock && faillock.trim()) {
        result += `=== Account Lockout Policy (faillock) ===\n${faillock}\n`;
      }

      if (!result.trim()) {
        result = 'Password policy settings not found or insufficient permissions';
      }

      return {
        success: true,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Password policy check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🛡️ SELinux/AppArmor Status - Check mandatory access control
 */
export const macStatusSkill: Skill = {
  name: 'mac_status',
  description: '🛡️ Check SELinux or AppArmor status (mandatory access control)',
  async execute(args: any) {
    try {
      logger.info('MAC status check requested');

      let result = '';

      // Check SELinux
      const selinuxStatus = await executeCommand('sestatus 2>/dev/null');
      if (selinuxStatus && selinuxStatus.trim() && !selinuxStatus.includes('not found')) {
        result += `=== SELinux Status ===\n${selinuxStatus}\n\n`;

        const selinuxMode = await executeCommand('getenforce 2>/dev/null');
        if (selinuxMode && selinuxMode.trim()) {
          result += `Current Mode: ${selinuxMode.trim()}\n\n`;
        }
      }

      // Check AppArmor
      const apparmorStatus = await executeCommand('sudo aa-status 2>/dev/null | head -30');
      if (apparmorStatus && apparmorStatus.trim() && !apparmorStatus.includes('not found')) {
        result += `=== AppArmor Status ===\n${apparmorStatus}\n\n`;
      }

      // Check if AppArmor is enabled
      const apparmorEnabled = await executeCommand('systemctl is-enabled apparmor 2>/dev/null');
      if (apparmorEnabled && apparmorEnabled.trim()) {
        result += `AppArmor Service: ${apparmorEnabled.trim()}\n\n`;
      }

      // List AppArmor profiles
      const apparmorProfiles = await executeCommand('ls /etc/apparmor.d/ 2>/dev/null | head -20');
      if (apparmorProfiles && apparmorProfiles.trim()) {
        result += `=== AppArmor Profiles ===\n${apparmorProfiles}\n`;
      }

      if (!result.trim()) {
        result = 'Neither SELinux nor AppArmor is installed or running';
      }

      return {
        success: true,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'MAC status check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 📋 Audit Logs - Check system audit logs
 */
export const auditLogsSkill: Skill = {
  name: 'audit_logs',
  description: '📋 Check system audit logs (auditd)',
  async execute(args: any) {
    try {
      const eventType = args.eventType || 'recent';

      logger.info({ eventType }, 'Audit logs check requested');

      let result = '';

      // Check if auditd is running
      const auditdStatus = await executeCommand('systemctl status auditd 2>/dev/null | head -10');
      if (auditdStatus && auditdStatus.trim() && !auditdStatus.includes('could not be found')) {
        result += `=== Auditd Service Status ===\n${auditdStatus}\n\n`;
      }

      // Recent audit events
      if (eventType === 'recent' || eventType === 'all') {
        const recentEvents = await executeCommand('sudo ausearch -ts recent 2>/dev/null | head -50');
        if (recentEvents && recentEvents.trim()) {
          result += `=== Recent Audit Events ===\n${recentEvents}\n\n`;
        }
      }

      // Authentication events
      if (eventType === 'auth' || eventType === 'all') {
        const authEvents = await executeCommand('sudo ausearch -m USER_LOGIN,USER_AUTH -ts today 2>/dev/null | head -30');
        if (authEvents && authEvents.trim()) {
          result += `=== Authentication Events (Today) ===\n${authEvents}\n\n`;
        }
      }

      // File access events
      if (eventType === 'file') {
        const fileEvents = await executeCommand('sudo ausearch -m PATH -ts today 2>/dev/null | head -30');
        if (fileEvents && fileEvents.trim()) {
          result += `=== File Access Events ===\n${fileEvents}\n\n`;
        }
      }

      // Audit rules
      const auditRules = await executeCommand('sudo auditctl -l 2>/dev/null | head -20');
      if (auditRules && auditRules.trim()) {
        result += `=== Active Audit Rules ===\n${auditRules}\n`;
      }

      if (!result.trim()) {
        result = 'Audit system (auditd) is not installed or not accessible';
      }

      return {
        success: true,
        eventType,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Audit logs check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🔍 Rootkit Scan - Scan for rootkits
 */
export const rootkitScanSkill: Skill = {
  name: 'rootkit_scan',
  description: '🔍 Scan for rootkits using chkrootkit or rkhunter',
  async execute(args: any) {
    try {
      const tool = args.tool || 'auto';

      logger.info({ tool }, 'Rootkit scan requested');

      let result = '';

      // Check chkrootkit
      if (tool === 'auto' || tool === 'chkrootkit') {
        const chkrootkit = await executeCommand('which chkrootkit 2>/dev/null');
        if (chkrootkit && chkrootkit.trim()) {
          result += `=== chkrootkit Scan ===\n`;
          result += 'Tool found at: ' + chkrootkit.trim() + '\n';
          result += 'Note: Full scan requires sudo and may take several minutes.\n';
          result += 'Run: sudo chkrootkit\n\n';

          // Quick check for common issues
          const quickCheck = await executeCommand('sudo chkrootkit -q 2>/dev/null | head -20');
          if (quickCheck && quickCheck.trim()) {
            result += `Quick scan results:\n${quickCheck}\n\n`;
          }
        }
      }

      // Check rkhunter
      if (tool === 'auto' || tool === 'rkhunter') {
        const rkhunter = await executeCommand('which rkhunter 2>/dev/null');
        if (rkhunter && rkhunter.trim()) {
          result += `=== rkhunter Status ===\n`;
          result += 'Tool found at: ' + rkhunter.trim() + '\n';
          
          // Check database version
          const version = await executeCommand('rkhunter --version 2>/dev/null | head -3');
          if (version && version.trim()) {
            result += `${version}\n`;
          }

          // Last update
          const lastUpdate = await executeCommand('ls -lh /var/lib/rkhunter/db/rkhunter.dat 2>/dev/null');
          if (lastUpdate && lastUpdate.trim()) {
            result += `Database: ${lastUpdate}\n`;
          }

          result += '\nNote: Full scan requires sudo and may take several minutes.\n';
          result += 'Run: sudo rkhunter --check --skip-keypress\n\n';
        }
      }

      // Check for suspicious processes
      const suspiciousProcs = await executeCommand('ps aux | grep -E "\\[.*\\]" | grep -v "grep" | head -10');
      if (suspiciousProcs && suspiciousProcs.trim()) {
        result += `=== Processes with Suspicious Names ===\n${suspiciousProcs}\n`;
      }

      if (!result.trim()) {
        result = 'No rootkit scanning tools found. Install chkrootkit or rkhunter.';
      }

      return {
        success: true,
        tool,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Rootkit scan failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * 🌐 DNS Security - Check DNS security (DNSSEC)
 */
export const dnsSecuritySkill: Skill = {
  name: 'dns_security',
  description: '🌐 Check DNS security settings and DNSSEC validation',
  async execute(args: any) {
    try {
      const domain = args.domain || 'cloudflare.com';

      logger.info({ domain }, 'DNS security check requested');

      let result = '';

      // Check DNSSEC validation
      const dnssec = await executeCommand(`dig ${domain} +dnssec +short 2>/dev/null | head -10`);
      if (dnssec && dnssec.trim()) {
        result += `=== DNSSEC Query for ${domain} ===\n${dnssec}\n\n`;
      }

      // Check resolver DNSSEC support
      const resolverCheck = await executeCommand('dig . DNSKEY +short 2>/dev/null | head -5');
      if (resolverCheck && resolverCheck.trim()) {
        result += `=== Resolver DNSSEC Support ===\nResolver supports DNSSEC\n\n`;
      }

      // Check systemd-resolved DNSSEC setting
      const systemdResolved = await executeCommand('resolvectl status 2>/dev/null | grep -i dnssec');
      if (systemdResolved && systemdResolved.trim()) {
        result += `=== systemd-resolved DNSSEC ===\n${systemdResolved}\n\n`;
      }

      // Check DNS servers being used
      const dnsServers = await executeCommand('resolvectl status 2>/dev/null | grep "DNS Servers" -A 3 | head -10');
      if (dnsServers && dnsServers.trim()) {
        result += `=== DNS Servers ===\n${dnsServers}\n\n`;
      } else {
        const resolvConf = await executeCommand('cat /etc/resolv.conf 2>/dev/null | grep nameserver');
        if (resolvConf && resolvConf.trim()) {
          result += `=== DNS Servers (/etc/resolv.conf) ===\n${resolvConf}\n\n`;
        }
      }

      // Check for DNS over TLS/HTTPS
      const dotCheck = await executeCommand('resolvectl status 2>/dev/null | grep -E "DNS over TLS|DNSOverTLS"');
      if (dotCheck && dotCheck.trim()) {
        result += `=== DNS over TLS ===\n${dotCheck}\n`;
      }

      if (!result.trim()) {
        result = 'Unable to check DNS security settings';
      }

      return {
        success: true,
        domain,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, domain: args.domain }, 'DNS security check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * System Load Analysis Skill
 * Detailed load average breakdown and analysis
 */
export const systemLoadAnalysisSkill: Skill = {
  name: 'system_load_analysis',
  description: '📊 Analyze system load averages and breakdown by CPU/IO/processes',
  async execute(args: any) {
    try {
      const period = args.period || '1m';

      logger.info({ period }, 'System load analysis requested');

      let result = '';

      // Get uptime with load averages
      const uptimeResult = await executeCommand('uptime');
      if (uptimeResult) {
        result += '=== Load Averages ===\n' + uptimeResult + '\n\n';
      }

      // Get CPU statistics
      const mpstatResult = await executeCommand('mpstat 1 1');
      if (mpstatResult) {
        result += '=== CPU Statistics ===\n' + mpstatResult + '\n\n';
      }

      // Get virtual memory statistics
      const vmstatResult = await executeCommand('vmstat 1 2');
      if (vmstatResult) {
        result += '=== Virtual Memory Statistics ===\n' + vmstatResult + '\n\n';
      }

      // Get number of running processes
      const psResult = await executeCommand('ps aux | wc -l');
      if (psResult) {
        result += `Running Processes: ${psResult.trim()}\n\n`;
      }

      // Get CPU core count
      const coreResult = await executeCommand('nproc');
      if (coreResult) {
        result += `CPU Cores: ${coreResult.trim()}\n`;
      }

      return {
        success: true,
        period,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, period: args.period }, 'System load analysis failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * CPU Temperature Skill
 * Monitor CPU and system temperatures
 */
export const cpuTemperatureSkill: Skill = {
  name: 'cpu_temperature',
  description: '🌡️ Monitor CPU and system temperatures',
  async execute(args: any) {
    try {
      const unit = args.unit || 'celsius';

      logger.info({ unit }, 'CPU temperature check requested');

      let result = '';

      // Try sensors command first
      const sensorsResult = await executeCommand('sensors');
      if (sensorsResult) {
        result += '=== Hardware Sensors ===\n' + sensorsResult + '\n\n';
      }

      // Check thermal zones
      const thermalResult = await executeCommand('cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -5');
      if (thermalResult) {
        result += '=== Thermal Zones (millidegrees C) ===\n' + thermalResult + '\n\n';
      }

      // Check thermal zone types
      const typeResult = await executeCommand('cat /sys/class/thermal/thermal_zone*/type 2>/dev/null | head -5');
      if (typeResult) {
        result += '=== Thermal Zone Types ===\n' + typeResult + '\n';
      }

      if (!result.trim()) {
        result = 'No temperature sensors found. Install lm-sensors: sudo apt-get install lm-sensors';
      }

      return {
        success: true,
        unit,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, unit: args.unit }, 'CPU temperature check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Performance Bottleneck Skill
 * Identify system performance bottlenecks
 */
export const performanceBottleneckSkill: Skill = {
  name: 'performance_bottleneck',
  description: '🔍 Identify performance bottlenecks (CPU, memory, disk, network)',
  async execute(args: any) {
    try {
      const duration = args.duration || 5;

      logger.info({ duration }, 'Performance bottleneck analysis requested');

      let result = '';

      // Top CPU consumers
      const cpuResult = await executeCommand('ps aux --sort=-%cpu | head -10');
      if (cpuResult) {
        result += '=== Top CPU Consumers ===\n' + cpuResult + '\n\n';
      }

      // Top memory consumers
      const memResult = await executeCommand('ps aux --sort=-%mem | head -10');
      if (memResult) {
        result += '=== Top Memory Consumers ===\n' + memResult + '\n\n';
      }

      // Disk I/O statistics
      const iostatResult = await executeCommand(`iostat -x ${duration} 1`);
      if (iostatResult) {
        result += '=== Disk I/O Statistics ===\n' + iostatResult + '\n\n';
      }

      // Network statistics
      const netstatResult = await executeCommand('netstat -s | head -30');
      if (netstatResult) {
        result += '=== Network Statistics (Summary) ===\n' + netstatResult + '\n';
      }

      return {
        success: true,
        duration,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, duration: args.duration }, 'Performance bottleneck analysis failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Metrics Dashboard Skill
 * Display key system metrics in one view
 */
export const metricsDashboardSkill: Skill = {
  name: 'metrics_dashboard',
  description: '📈 Display comprehensive system metrics dashboard',
  async execute(args: any) {
    try {
      const refresh = args.refresh || false;

      logger.info({ refresh }, 'Metrics dashboard requested');

      let result = '';

      // System uptime
      const uptimeResult = await executeCommand('uptime');
      if (uptimeResult) {
        result += '=== System Status ===\n' + uptimeResult + '\n\n';
      }

      // Memory usage
      const memResult = await executeCommand('free -h');
      if (memResult) {
        result += '=== Memory Usage ===\n' + memResult + '\n\n';
      }

      // Disk usage
      const diskResult = await executeCommand('df -h | head -10');
      if (diskResult) {
        result += '=== Disk Usage ===\n' + diskResult + '\n\n';
      }

      // CPU info
      const cpuResult = await executeCommand('top -bn1 | head -5');
      if (cpuResult) {
        result += '=== CPU Status ===\n' + cpuResult + '\n\n';
      }

      // Network connections
      const connResult = await executeCommand('ss -s');
      if (connResult) {
        result += '=== Network Connections ===\n' + connResult + '\n\n';
      }

      // Load average
      const loadResult = await executeCommand('cat /proc/loadavg');
      if (loadResult) {
        result += `Load Average: ${loadResult.trim()}\n`;
      }

      return {
        success: true,
        refresh,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, refresh: args.refresh }, 'Metrics dashboard failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Alert Status Skill
 * Check system alerts and warnings
 */
export const alertStatusSkill: Skill = {
  name: 'alert_status',
  description: '⚠️ Check system alerts, warnings, and critical messages',
  async execute(args: any) {
    try {
      const severity = args.severity || 'all';
      const lines = args.lines || 50;

      logger.info({ severity, lines }, 'Alert status check requested');

      let result = '';

      // Check dmesg for kernel messages
      const dmesgResult = await executeCommand(`dmesg -T -l err,crit,alert,emerg | tail -${lines}`);
      if (dmesgResult) {
        result += '=== Kernel Alerts (dmesg) ===\n' + dmesgResult + '\n\n';
      }

      // Check syslog for errors
      const syslogResult = await executeCommand(`grep -i "error\\|warning\\|critical" /var/log/syslog 2>/dev/null | tail -${lines}`);
      if (syslogResult) {
        result += '=== System Log Alerts ===\n' + syslogResult + '\n\n';
      }

      // Check for failed services
      const failedResult = await executeCommand('systemctl --failed --no-pager');
      if (failedResult) {
        result += '=== Failed Services ===\n' + failedResult + '\n';
      }

      if (!result.trim()) {
        result = '✅ No critical alerts or warnings found';
      }

      return {
        success: true,
        severity,
        lines,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, severity: args.severity }, 'Alert status check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Resource Trends Skill
 * Show resource usage trends over time
 */
export const resourceTrendsSkill: Skill = {
  name: 'resource_trends',
  description: '📉 Show historical resource usage trends (CPU, memory, disk)',
  async execute(args: any) {
    try {
      const period = args.period || '1h';
      const resource = args.resource || 'all';

      logger.info({ period, resource }, 'Resource trends requested');

      let result = '';

      // Try sar for historical data
      const sarResult = await executeCommand('sar -u 1 5');
      if (sarResult) {
        result += '=== CPU Trends (sar) ===\n' + sarResult + '\n\n';
      }

      // Memory trends
      const memTrendResult = await executeCommand('sar -r 1 5');
      if (memTrendResult) {
        result += '=== Memory Trends ===\n' + memTrendResult + '\n\n';
      }

      // Disk I/O trends
      const diskTrendResult = await executeCommand('sar -d 1 5');
      if (diskTrendResult) {
        result += '=== Disk I/O Trends ===\n' + diskTrendResult + '\n';
      }

      if (!result.trim()) {
        result = 'No trend data available. Install sysstat: sudo apt-get install sysstat';
      }

      return {
        success: true,
        period,
        resource,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, period: args.period }, 'Resource trends failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Top Resource Users Skill
 * List top processes by resource consumption
 */
export const topResourceUsersSkill: Skill = {
  name: 'top_resource_users',
  description: '🔝 List top processes consuming CPU, memory, or disk I/O',
  async execute(args: any) {
    try {
      const resource = args.resource || 'cpu';
      const count = args.count || 10;

      logger.info({ resource, count }, 'Top resource users requested');

      let result = '';

      if (resource === 'cpu' || resource === 'all') {
        const cpuResult = await executeCommand(`ps aux --sort=-%cpu | head -${count + 1}`);
        if (cpuResult) {
          result += '=== Top CPU Users ===\n' + cpuResult + '\n\n';
        }
      }

      if (resource === 'memory' || resource === 'all') {
        const memResult = await executeCommand(`ps aux --sort=-%mem | head -${count + 1}`);
        if (memResult) {
          result += '=== Top Memory Users ===\n' + memResult + '\n\n';
        }
      }

      if (resource === 'disk' || resource === 'all') {
        const diskResult = await executeCommand('iotop -b -n 1 2>/dev/null | head -20');
        if (diskResult) {
          result += '=== Top Disk I/O Users ===\n' + diskResult + '\n';
        } else {
          result += '=== Top Disk I/O Users ===\niotop not available. Install: sudo apt-get install iotop\n';
        }
      }

      return {
        success: true,
        resource,
        count,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, resource: args.resource }, 'Top resource users failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Response Time Test Skill
 * Measure service response times
 */
export const responseTimeTestSkill: Skill = {
  name: 'response_time_test',
  description: '⏱️ Measure service response times (HTTP, ping, TCP)',
  async execute(args: any) {
    try {
      const target = args.target || 'localhost';
      const type = args.type || 'http';
      const count = args.count || 5;

      logger.info({ target, type, count }, 'Response time test requested');

      let result = '';

      if (type === 'http' || type === 'all') {
        const curlResult = await executeCommand(`curl -o /dev/null -s -w "Connect: %{time_connect}s\\nStart Transfer: %{time_starttransfer}s\\nTotal: %{time_total}s\\nHTTP Code: %{http_code}\\n" "${target}"`);
        if (curlResult) {
          result += `=== HTTP Response Time: ${target} ===\n` + curlResult + '\n\n';
        }
      }

      if (type === 'ping' || type === 'all') {
        const pingResult = await executeCommand(`ping -c ${count} ${target}`);
        if (pingResult) {
          result += `=== Ping Response Time: ${target} ===\n` + pingResult + '\n\n';
        }
      }

      if (type === 'tcp' || type === 'all') {
        const tcpResult = await executeCommand(`time nc -zv ${target} 80 2>&1`);
        if (tcpResult) {
          result += `=== TCP Connection Time: ${target}:80 ===\n` + tcpResult + '\n';
        }
      }

      return {
        success: true,
        target,
        type,
        count,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, target: args.target }, 'Response time test failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Package Audit Skill
 * Scan dependencies for vulnerabilities
 */
export const packageAuditSkill: Skill = {
  name: 'package_audit',
  description: '🔍 Scan dependencies for vulnerabilities (npm, pip, composer)',
  async execute(args: any) {
    try {
      const packageManager = args.packageManager || 'auto';
      const fix = args.fix || false;

      logger.info({ packageManager, fix }, 'Package audit requested');

      let result = '';

      if (packageManager === 'npm' || packageManager === 'auto') {
        const npmAudit = await executeCommand('npm audit --json 2>/dev/null');
        if (npmAudit) {
          result += '=== NPM Audit ===\n' + npmAudit + '\n\n';
          if (fix) {
            const npmFix = await executeCommand('npm audit fix --force');
            if (npmFix) {
              result += '=== NPM Audit Fix ===\n' + npmFix + '\n\n';
            }
          }
        }
      }

      if (packageManager === 'pip' || packageManager === 'auto') {
        const pipCheck = await executeCommand('pip check 2>/dev/null || pip3 check 2>/dev/null');
        if (pipCheck) {
          result += '=== PIP Check ===\n' + pipCheck + '\n\n';
        }
        const pipAudit = await executeCommand('pip-audit 2>/dev/null');
        if (pipAudit) {
          result += '=== PIP Audit ===\n' + pipAudit + '\n\n';
        }
      }

      if (packageManager === 'composer' || packageManager === 'auto') {
        const composerAudit = await executeCommand('composer audit 2>/dev/null');
        if (composerAudit) {
          result += '=== Composer Audit ===\n' + composerAudit + '\n';
        }
      }

      if (!result.trim()) {
        result = 'No package managers found or no vulnerabilities detected';
      }

      return {
        success: true,
        packageManager,
        fix,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, packageManager: args.packageManager }, 'Package audit failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Build Status Skill
 * Check build/compilation status and errors
 */
export const buildStatusSkill: Skill = {
  name: 'build_status',
  description: '🏗️ Check build/compilation status and errors',
  async execute(args: any) {
    try {
      const project = args.project || '.';
      const buildTool = args.buildTool || 'auto';

      logger.info({ project, buildTool }, 'Build status check requested');

      let result = '';

      // Check for common build files
      if (buildTool === 'npm' || buildTool === 'auto') {
        const packageJson = await executeCommand(`test -f ${project}/package.json && echo "Found"`);
        if (packageJson) {
          result += '=== NPM Project ===\n';
          const npmBuild = await executeCommand(`cd ${project} && npm run build --if-present 2>&1 | tail -50`);
          if (npmBuild) {
            result += npmBuild + '\n\n';
          }
        }
      }

      if (buildTool === 'maven' || buildTool === 'auto') {
        const pomXml = await executeCommand(`test -f ${project}/pom.xml && echo "Found"`);
        if (pomXml) {
          result += '=== Maven Project ===\n';
          const mvnCompile = await executeCommand(`cd ${project} && mvn compile 2>&1 | tail -50`);
          if (mvnCompile) {
            result += mvnCompile + '\n\n';
          }
        }
      }

      if (buildTool === 'make' || buildTool === 'auto') {
        const makefile = await executeCommand(`test -f ${project}/Makefile && echo "Found"`);
        if (makefile) {
          result += '=== Make Project ===\n';
          const makeResult = await executeCommand(`cd ${project} && make 2>&1 | tail -50`);
          if (makeResult) {
            result += makeResult + '\n';
          }
        }
      }

      if (!result.trim()) {
        result = 'No build configuration found in project';
      }

      return {
        success: true,
        project,
        buildTool,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, project: args.project }, 'Build status check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * API Testing Skill
 * Test API endpoints with curl
 */
export const apiTestingSkill: Skill = {
  name: 'api_testing',
  description: '🌐 Test API endpoints (GET, POST, headers, authentication)',
  async execute(args: any) {
    try {
      const url = args.url;
      const method = args.method || 'GET';
      const headers = args.headers || {};
      const data = args.data || null;

      if (!url) {
        throw new Error('URL is required');
      }

      logger.info({ url, method, headers }, 'API testing requested');

      let curlCommand = `curl -X ${method} -i -s -w "\\n\\nHTTP Status: %{http_code}\\nTime Total: %{time_total}s\\nTime Connect: %{time_connect}s\\n"`;

      // Add headers
      for (const [key, value] of Object.entries(headers)) {
        curlCommand += ` -H "${key}: ${value}"`;
      }

      // Add data for POST/PUT/PATCH
      if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
        const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
        curlCommand += ` -d '${jsonData}'`;
      }

      curlCommand += ` "${url}"`;

      const result = await executeCommand(curlCommand);

      return {
        success: true,
        url,
        method,
        output: result || 'No response',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, url: args.url }, 'API testing failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Code Quality Skill
 * Run linters and formatters
 */
export const codeQualitySkill: Skill = {
  name: 'code_quality',
  description: '✨ Run linters/formatters (eslint, pylint, black, prettier)',
  async execute(args: any) {
    try {
      const path = args.path || '.';
      const tool = args.tool || 'auto';
      const fix = args.fix || false;

      logger.info({ path, tool, fix }, 'Code quality check requested');

      let result = '';

      if (tool === 'eslint' || tool === 'auto') {
        const eslintCmd = fix ? 'eslint --fix' : 'eslint';
        const eslintResult = await executeCommand(`${eslintCmd} ${path} 2>&1 | head -100`);
        if (eslintResult) {
          result += '=== ESLint ===\n' + eslintResult + '\n\n';
        }
      }

      if (tool === 'pylint' || tool === 'auto') {
        const pylintResult = await executeCommand(`pylint ${path} 2>&1 | head -100`);
        if (pylintResult) {
          result += '=== Pylint ===\n' + pylintResult + '\n\n';
        }
      }

      if (tool === 'black' || tool === 'auto') {
        const blackCmd = fix ? 'black' : 'black --check';
        const blackResult = await executeCommand(`${blackCmd} ${path} 2>&1 | head -50`);
        if (blackResult) {
          result += '=== Black (Python Formatter) ===\n' + blackResult + '\n\n';
        }
      }

      if (tool === 'prettier' || tool === 'auto') {
        const prettierCmd = fix ? 'prettier --write' : 'prettier --check';
        const prettierResult = await executeCommand(`${prettierCmd} ${path} 2>&1 | head -50`);
        if (prettierResult) {
          result += '=== Prettier ===\n' + prettierResult + '\n';
        }
      }

      if (!result.trim()) {
        result = 'No linters/formatters found or path is clean';
      }

      return {
        success: true,
        path,
        tool,
        fix,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, path: args.path }, 'Code quality check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Dependency Tree Skill
 * Show dependency graph
 */
export const dependencyTreeSkill: Skill = {
  name: 'dependency_tree',
  description: '🌳 Show dependency tree and conflicts',
  async execute(args: any) {
    try {
      const packageManager = args.packageManager || 'auto';
      const depth = args.depth || 3;

      logger.info({ packageManager, depth }, 'Dependency tree requested');

      let result = '';

      if (packageManager === 'npm' || packageManager === 'auto') {
        const npmTree = await executeCommand(`npm list --depth=${depth} 2>&1 | head -200`);
        if (npmTree) {
          result += '=== NPM Dependency Tree ===\n' + npmTree + '\n\n';
        }
      }

      if (packageManager === 'pip' || packageManager === 'auto') {
        const pipTree = await executeCommand('pipdeptree 2>&1 | head -200');
        if (pipTree) {
          result += '=== PIP Dependency Tree ===\n' + pipTree + '\n\n';
        } else {
          result += '=== PIP Packages ===\n(Install pipdeptree for tree view: pip install pipdeptree)\n';
          const pipList = await executeCommand('pip list 2>&1 | head -100');
          if (pipList) {
            result += pipList + '\n\n';
          }
        }
      }

      if (packageManager === 'composer' || packageManager === 'auto') {
        const composerTree = await executeCommand('composer show --tree 2>&1 | head -200');
        if (composerTree) {
          result += '=== Composer Dependency Tree ===\n' + composerTree + '\n';
        }
      }

      if (!result.trim()) {
        result = 'No package managers found';
      }

      return {
        success: true,
        packageManager,
        depth,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, packageManager: args.packageManager }, 'Dependency tree failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Test Execution Skill
 * Run test suites
 */
export const testExecutionSkill: Skill = {
  name: 'test_execution',
  description: '🧪 Run test suites (jest, pytest, mocha, phpunit)',
  async execute(args: any) {
    try {
      const framework = args.framework || 'auto';
      const path = args.path || '.';
      const verbose = args.verbose || false;

      logger.info({ framework, path, verbose }, 'Test execution requested');

      let result = '';

      if (framework === 'jest' || framework === 'auto') {
        const jestCmd = verbose ? 'jest --verbose' : 'jest';
        const jestResult = await executeCommand(`cd ${path} && ${jestCmd} 2>&1 | tail -100`);
        if (jestResult) {
          result += '=== Jest Tests ===\n' + jestResult + '\n\n';
        }
      }

      if (framework === 'pytest' || framework === 'auto') {
        const pytestCmd = verbose ? 'pytest -v' : 'pytest';
        const pytestResult = await executeCommand(`cd ${path} && ${pytestCmd} 2>&1 | tail -100`);
        if (pytestResult) {
          result += '=== Pytest ===\n' + pytestResult + '\n\n';
        }
      }

      if (framework === 'mocha' || framework === 'auto') {
        const mochaResult = await executeCommand(`cd ${path} && mocha 2>&1 | tail -100`);
        if (mochaResult) {
          result += '=== Mocha Tests ===\n' + mochaResult + '\n\n';
        }
      }

      if (framework === 'phpunit' || framework === 'auto') {
        const phpunitResult = await executeCommand(`cd ${path} && phpunit 2>&1 | tail -100`);
        if (phpunitResult) {
          result += '=== PHPUnit Tests ===\n' + phpunitResult + '\n';
        }
      }

      if (!result.trim()) {
        result = 'No test frameworks found or configured';
      }

      return {
        success: true,
        framework,
        path,
        verbose,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, framework: args.framework }, 'Test execution failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Environment Check Skill
 * Validate development environment
 */
export const environmentCheckSkill: Skill = {
  name: 'environment_check',
  description: '🔧 Validate dev environment (node, python, php, java versions)',
  async execute(args: any) {
    try {
      const scope = args.scope || 'all';

      logger.info({ scope }, 'Environment check requested');

      let result = '';

      if (scope === 'node' || scope === 'all') {
        const nodeVersion = await executeCommand('node --version 2>&1');
        const npmVersion = await executeCommand('npm --version 2>&1');
        if (nodeVersion || npmVersion) {
          result += '=== Node.js Environment ===\n';
          result += `Node: ${nodeVersion || 'Not installed'}\n`;
          result += `NPM: ${npmVersion || 'Not installed'}\n\n`;
        }
      }

      if (scope === 'python' || scope === 'all') {
        const pythonVersion = await executeCommand('python3 --version 2>&1 || python --version 2>&1');
        const pipVersion = await executeCommand('pip3 --version 2>&1 || pip --version 2>&1');
        if (pythonVersion || pipVersion) {
          result += '=== Python Environment ===\n';
          result += `Python: ${pythonVersion || 'Not installed'}\n`;
          result += `Pip: ${pipVersion || 'Not installed'}\n\n`;
        }
      }

      if (scope === 'php' || scope === 'all') {
        const phpVersion = await executeCommand('php --version 2>&1 | head -1');
        const composerVersion = await executeCommand('composer --version 2>&1 | head -1');
        if (phpVersion || composerVersion) {
          result += '=== PHP Environment ===\n';
          result += `PHP: ${phpVersion || 'Not installed'}\n`;
          result += `Composer: ${composerVersion || 'Not installed'}\n\n`;
        }
      }

      if (scope === 'java' || scope === 'all') {
        const javaVersion = await executeCommand('java -version 2>&1 | head -1');
        const mvnVersion = await executeCommand('mvn --version 2>&1 | head -1');
        if (javaVersion || mvnVersion) {
          result += '=== Java Environment ===\n';
          result += `Java: ${javaVersion || 'Not installed'}\n`;
          result += `Maven: ${mvnVersion || 'Not installed'}\n\n`;
        }
      }

      // Check common tools
      result += '=== Common Tools ===\n';
      const git = await executeCommand('git --version 2>&1');
      const docker = await executeCommand('docker --version 2>&1');
      const curl = await executeCommand('curl --version 2>&1 | head -1');
      result += `Git: ${git || 'Not installed'}\n`;
      result += `Docker: ${docker || 'Not installed'}\n`;
      result += `Curl: ${curl || 'Not installed'}\n`;

      return {
        success: true,
        scope,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, scope: args.scope }, 'Environment check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Asset Analysis Skill
 * Analyze static assets
 */
export const assetAnalysisSkill: Skill = {
  name: 'asset_analysis',
  description: '📦 Analyze static assets (image sizes, CSS/JS files)',
  async execute(args: any) {
    try {
      const path = args.path || '.';
      const assetType = args.assetType || 'all';

      logger.info({ path, assetType }, 'Asset analysis requested');

      let result = '';

      if (assetType === 'images' || assetType === 'all') {
        const images = await executeCommand(`find ${path} -type f \\( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.gif" -o -iname "*.svg" -o -iname "*.webp" \\) -exec ls -lh {} \\; | head -50`);
        if (images) {
          result += '=== Image Files ===\n' + images + '\n\n';
          const largeImages = await executeCommand(`find ${path} -type f \\( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.gif" \\) -size +1M -exec ls -lh {} \\; | head -20`);
          if (largeImages) {
            result += '=== Large Images (>1MB) ===\n' + largeImages + '\n\n';
          }
        }
      }

      if (assetType === 'css' || assetType === 'all') {
        const css = await executeCommand(`find ${path} -type f -name "*.css" -exec ls -lh {} \\; | head -30`);
        if (css) {
          result += '=== CSS Files ===\n' + css + '\n\n';
        }
      }

      if (assetType === 'js' || assetType === 'all') {
        const js = await executeCommand(`find ${path} -type f -name "*.js" -not -path "*/node_modules/*" -exec ls -lh {} \\; | head -30`);
        if (js) {
          result += '=== JavaScript Files ===\n' + js + '\n\n';
        }
      }

      // Summary
      const totalSize = await executeCommand(`du -sh ${path} 2>/dev/null`);
      if (totalSize) {
        result += `Total Directory Size: ${totalSize}`;
      }

      if (!result.trim()) {
        result = 'No assets found in specified path';
      }

      return {
        success: true,
        path,
        assetType,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, path: args.path }, 'Asset analysis failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * CI/CD Status Skill
 * Check CI/CD pipeline status
 */
export const cicdStatusSkill: Skill = {
  name: 'cicd_status',
  description: '🚀 Check CI/CD pipeline status (GitHub Actions, Jenkins)',
  async execute(args: any) {
    try {
      const platform = args.platform || 'auto';
      const project = args.project || '.';

      logger.info({ platform, project }, 'CI/CD status check requested');

      let result = '';

      if (platform === 'github' || platform === 'auto') {
        const ghWorkflows = await executeCommand(`find ${project}/.github/workflows -name "*.yml" -o -name "*.yaml" 2>/dev/null`);
        if (ghWorkflows) {
          result += '=== GitHub Actions Workflows ===\n' + ghWorkflows + '\n\n';
          const ghStatus = await executeCommand('gh run list --limit 10 2>&1');
          if (ghStatus) {
            result += '=== Recent GitHub Actions Runs ===\n' + ghStatus + '\n\n';
          }
        }
      }

      if (platform === 'jenkins' || platform === 'auto') {
        const jenkinsfile = await executeCommand(`test -f ${project}/Jenkinsfile && cat ${project}/Jenkinsfile | head -50`);
        if (jenkinsfile) {
          result += '=== Jenkinsfile ===\n' + jenkinsfile + '\n\n';
        }
      }

      if (platform === 'gitlab' || platform === 'auto') {
        const gitlabCI = await executeCommand(`test -f ${project}/.gitlab-ci.yml && cat ${project}/.gitlab-ci.yml | head -50`);
        if (gitlabCI) {
          result += '=== GitLab CI Config ===\n' + gitlabCI + '\n';
        }
      }

      if (!result.trim()) {
        result = 'No CI/CD configuration found';
      }

      return {
        success: true,
        platform,
        project,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, platform: args.platform }, 'CI/CD status check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Debug Port Check Skill
 * Find active debug ports
 */
export const debugPortCheckSkill: Skill = {
  name: 'debug_port_check',
  description: '🐛 Find active debug ports and debugging processes',
  async execute(args: any) {
    try {
      const scope = args.scope || 'all';

      logger.info({ scope }, 'Debug port check requested');

      let result = '';

      // Common debug ports
      const debugPorts = [
        { port: 9229, name: 'Node.js Inspector' },
        { port: 5858, name: 'Node.js Legacy Debug' },
        { port: 5005, name: 'Java Debug (JDWP)' },
        { port: 2345, name: 'Python debugpy' },
        { port: 9000, name: 'PHP Xdebug' },
        { port: 4711, name: 'Ruby Debug' },
      ];

      result += '=== Common Debug Ports ===\n';
      for (const { port, name } of debugPorts) {
        const portCheck = await executeCommand(`netstat -tuln 2>/dev/null | grep ":${port} " || ss -tuln 2>/dev/null | grep ":${port} "`);
        if (portCheck) {
          result += `✓ ${name} (${port}): LISTENING\n${portCheck}\n`;
        }
      }

      // Find debug processes
      result += '\n=== Debug Processes ===\n';
      const nodeDebug = await executeCommand('ps aux | grep -E "node.*--inspect|node.*--debug" | grep -v grep');
      if (nodeDebug) {
        result += 'Node.js Debug:\n' + nodeDebug + '\n\n';
      }

      const pythonDebug = await executeCommand('ps aux | grep -E "python.*debugpy|python.*pdb" | grep -v grep');
      if (pythonDebug) {
        result += 'Python Debug:\n' + pythonDebug + '\n\n';
      }

      const javaDebug = await executeCommand('ps aux | grep -E "java.*agentlib:jdwp" | grep -v grep');
      if (javaDebug) {
        result += 'Java Debug:\n' + javaDebug + '\n';
      }

      if (!result.includes('LISTENING') && !nodeDebug && !pythonDebug && !javaDebug) {
        result += '\n✅ No active debug ports or processes found';
      }

      return {
        success: true,
        scope,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, scope: args.scope }, 'Debug port check failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Code Metrics Skill
 * Calculate code complexity and LOC
 */
export const codeMetricsSkill: Skill = {
  name: 'code_metrics',
  description: '📊 Calculate code metrics (LOC, complexity, maintainability)',
  async execute(args: any) {
    try {
      const path = args.path || '.';
      const language = args.language || 'auto';

      logger.info({ path, language }, 'Code metrics requested');

      let result = '';

      // Lines of code by language
      result += '=== Lines of Code ===\n';
      const cloc = await executeCommand(`cloc ${path} 2>&1 | head -50`);
      if (cloc) {
        result += cloc + '\n\n';
      } else {
        // Fallback to simple find
        const jsLines = await executeCommand(`find ${path} -name "*.js" -not -path "*/node_modules/*" -exec wc -l {} + 2>/dev/null | tail -1`);
        const pyLines = await executeCommand(`find ${path} -name "*.py" -exec wc -l {} + 2>/dev/null | tail -1`);
        const phpLines = await executeCommand(`find ${path} -name "*.php" -exec wc -l {} + 2>/dev/null | tail -1`);
        if (jsLines) result += `JavaScript: ${jsLines}\n`;
        if (pyLines) result += `Python: ${pyLines}\n`;
        if (phpLines) result += `PHP: ${phpLines}\n`;
        result += '(Install cloc for detailed metrics: sudo apt-get install cloc)\n\n';
      }

      // File counts
      result += '=== File Statistics ===\n';
      const fileCount = await executeCommand(`find ${path} -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l`);
      const dirCount = await executeCommand(`find ${path} -type d -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l`);
      if (fileCount) result += `Total Files: ${fileCount.trim()}\n`;
      if (dirCount) result += `Total Directories: ${dirCount.trim()}\n`;

      // Largest files
      result += '\n=== Largest Files ===\n';
      const largest = await executeCommand(`find ${path} -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -exec ls -lh {} \\; | sort -k5 -hr | head -10`);
      if (largest) {
        result += largest;
      }

      return {
        success: true,
        path,
        language,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, path: args.path }, 'Code metrics failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Secrets Scan Skill
 * Scan for exposed secrets and API keys
 */
export const secretsScanSkill: Skill = {
  name: 'secrets_scan',
  description: '🔐 Scan for exposed secrets, API keys, and passwords in code',
  async execute(args: any) {
    try {
      const path = args.path || '.';
      const deep = args.deep || false;

      logger.info({ path, deep }, 'Secrets scan requested');

      let result = '';

      // Use gitleaks if available
      const gitleaks = await executeCommand(`gitleaks detect --source ${path} --no-git 2>&1`);
      if (gitleaks && !gitleaks.includes('command not found')) {
        result += '=== GitLeaks Scan ===\n' + gitleaks + '\n\n';
      }

      // Fallback: Pattern-based search
      result += '=== Pattern-Based Scan ===\n';
      
      const patterns = [
        { name: 'API Keys', pattern: '[aA][pP][iI][-_]?[kK][eE][yY].*[\'\\"][0-9a-zA-Z]{32,}[\'\\"]' },
        { name: 'AWS Keys', pattern: 'AKIA[0-9A-Z]{16}' },
        { name: 'Private Keys', pattern: '-----BEGIN.*PRIVATE KEY-----' },
        { name: 'JWT Tokens', pattern: 'eyJ[A-Za-z0-9-_=]+\\.[A-Za-z0-9-_=]+\\.?' },
        { name: 'Passwords in Config', pattern: '[pP][aA][sS][sS][wW][oO][rR][dD].*[=:].*[\'\\"][^\'\\\"]+[\'\\"]' },
      ];

      for (const { name, pattern } of patterns) {
        const matches = await executeCommand(`grep -r -E "${pattern}" ${path} --exclude-dir={node_modules,.git,dist,build} 2>/dev/null | head -10`);
        if (matches) {
          result += `\n${name}:\n${matches}\n`;
        }
      }

      // Check for common secret files
      result += '\n=== Sensitive Files Check ===\n';
      const sensitiveFiles = ['.env', '.env.local', '.env.production', 'config/secrets.yml', 'credentials.json', 'id_rsa', 'id_dsa'];
      for (const file of sensitiveFiles) {
        const found = await executeCommand(`find ${path} -name "${file}" -not -path "*/node_modules/*" 2>/dev/null`);
        if (found) {
          result += `⚠️ Found: ${found}\n`;
        }
      }

      if (!result.includes('⚠️') && !result.includes('eyJ')) {
        result += '\n✅ No obvious secrets detected';
      } else {
        result += '\n\n⚠️ WARNING: Review findings carefully and remove sensitive data from version control!';
      }

      return {
        success: true,
        path,
        deep,
        output: result.trim(),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, path: args.path }, 'Secrets scan failed');
      return { success: false, error: error.message };
    }
  },
};

async function sshWithPassword(
  username: string,
  host: string,
  password: string,
  remoteCommand: string,
  port = 22,
  timeoutMs = 30000,
): Promise<string> {
  const tmpScript = `/tmp/.ssh_pw_${Date.now()}_${Math.random().toString(36).slice(2)}.sh`;
  const escapedPw = password.replace(/'/g, "'\\''");
  const portOpt = port !== 22 ? `-p ${port} ` : '';
  const escapedCmd = remoteCommand.replace(/"/g, '\\"');

  await fs.writeFile(
    tmpScript,
    `#!/bin/sh\nexec sshpass -p '${escapedPw}' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PubkeyAuthentication=no -o PreferredAuthentications=password ${portOpt}${username}@${host} "${escapedCmd}"\n`,
    { mode: 0o700 },
  );

  try {
    const { stdout } = await execAsync(`script -q -c "${tmpScript}" /dev/null`, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const cleaned = stdout
      .replace(/\r/g, '')
      .split('\n')
      .filter(line => {
        const l = line.trim();
        return (
          l !== '' &&
          !l.startsWith('Warning: Permanently added') &&
          !l.includes('Permission denied, please try again') &&
          !l.startsWith('Script started') &&
          !l.startsWith('Script done')
        );
      })
      .join('\n')
      .trim();
    return cleaned;
  } finally {
    await fs.unlink(tmpScript).catch(() => {});
  }
}

/**
 * SSH Login Skill
 * Connect to remote server via SSH using key or password authentication
 */
export const sshLoginSkill: Skill = {
  name: 'ssh_login',
  description: '🔐 SSH login to remote server (key or password auth)',
  async execute(args: any) {
    try {
      const host = args.host || args.connectionId || args.hostname;
      let username = args.username || process.env.USER || 'root';
      let port = args.port || 22;
      let password: string | null = args.password || null;
      let keyPath = args.keyPath || `${os.homedir()}/.ssh/id_rsa`;
      // If caller passes a password and doesn't explicitly request key auth, use sshpass (non-interactive).
      // Defaulting useKey=true when a password is present causes the key path to run, SSH falls back to
      // an interactive password prompt that the agent can never answer — connection always fails.
      let useKey = args.useKey === true ? true : !password;

      if (!host) {
        throw new Error('Host is required');
      }

      // Check for saved SSH configuration
      const savedConfig = await userPreferencesManager.getSSHConfig(host, username);
      if (savedConfig) {
        logger.info({ savedConfig }, '✨ Using saved SSH configuration');
        username = savedConfig.username || username;
        port = savedConfig.port || port;
        keyPath = savedConfig.keyPath || keyPath;
        // Only let saved config control useKey when no password was passed in the current call.
        // If a password is explicitly provided, always use sshpass (non-interactive).
        if (!password) {
          useKey = savedConfig.useKey !== false;
        }
      }

      // Auto-lookup vault password when none was provided — avoids requiring AI to always pass it explicitly
      if (!password) {
        try {
          const vaultPw = await getCredentialManager().getCredential(`${username}@${host}`);
          if (vaultPw) {
            password = vaultPw;
            useKey = false;
            logger.info({ host, username }, 'Auto-loaded SSH password from vault');
          }
        } catch {
          // No vault credential — proceed with current auth method
        }
      }

      logger.info({ host, username, port, useKey, keyPath }, 'SSH login requested');

      let sshCommand: string;

      // Use password authentication via SSH_ASKPASS (works in daemon/no-TTY context)
      if (!useKey && password) {
        logger.info({ host, username, port, usePassword: true }, 'Using password authentication via SSH_ASKPASS');
        try {
          const output = await sshWithPassword(
            username, host, password,
            "echo 'SSH connection successful' && whoami && pwd",
            port,
          );
          return {
            success: true,
            host,
            username,
            port,
            output: output || 'Connection established',
            timestamp: new Date().toISOString(),
          };
        } catch (error: any) {
          logger.error({ error, host }, 'SSH login with password failed');
          return { success: false, error: error.message };
        }
      }

      // Use key authentication (default)
      sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;

      // Add port
      if (port !== 22) {
        sshCommand += ` -p ${port}`;
      }

      // Use key authentication
      if (useKey) {
        const keyExists = await fs.access(keyPath).then(() => true).catch(() => false);
        if (!keyExists) {
          // Generate SSH key if not exists
          logger.info({ keyPath }, 'SSH key not found, generating...');
          
          // Create .ssh directory if it doesn't exist
          const keyDir = path.dirname(keyPath);
          const dirExists = await fs.access(keyDir).then(() => true).catch(() => false);
          if (!dirExists) {
            logger.info({ keyDir }, 'Creating SSH directory...');
            await executeCommand(`mkdir -p ${keyDir}`);
            await executeCommand(`chmod 700 ${keyDir}`);
          }
          
          // Generate SSH key
          const genCmd = `ssh-keygen -t rsa -b 4096 -f ${keyPath} -N ""`;
          await executeCommand(genCmd);
          // Set proper permissions
          await executeCommand(`chmod 600 ${keyPath}`);
          return {
            success: true,
            message: 'SSH key generated successfully',
            keyPath,
            nextStep: 'Add this public key to remote server authorized_keys',
            publicKey: await fs.readFile(`${keyPath}.pub`, 'utf-8'),
            timestamp: new Date().toISOString(),
          };
        }
        sshCommand += ` -i ${keyPath}`;
      }

      // Build final command
      const target = `${username}@${host}`;
      sshCommand += ` ${target} "echo 'SSH connection successful' && whoami && pwd"`;

      logger.info({ sshCommand }, 'Executing SSH command');
      const result = await executeCommand(sshCommand);

      return {
        success: true,
        host,
        username,
        port,
        output: result || 'Connection established',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host: args.host }, 'SSH login failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * SSH Add Key Skill
 * Add SSH public key to remote server's authorized_keys
 */
export const sshAddKeySkill: Skill = {
  name: 'ssh_add_key',
  description: '🔑 Add SSH public key to remote server authorized_keys',
  async execute(args: any) {
    try {
      const host = args.host;
      const username = args.username || 'root';
      const password = args.password;
      const publicKeyPath = args.publicKeyPath || `${os.homedir()}/.ssh/id_rsa.pub`;
      const port = args.port || 22;

      if (!host || !password) {
        throw new Error('Host and password are required');
      }

      logger.info({ host, username, port }, 'SSH key addition requested');

      // Read public key
      const publicKey = await fs.readFile(publicKeyPath, 'utf-8');

      // Use sshpass for password auth
      const sshpassCheck = await executeCommand('which sshpass');
      if (!sshpassCheck) {
        return {
          success: false,
          error: 'sshpass not installed. Install: sudo apt-get install sshpass',
        };
      }

      // Create ~/.ssh/authorized_keys if not exists and add key
      const target = `${username}@${host}`;
      const cmd = `sshpass -p "${password}" ssh -o StrictHostKeyChecking=no -p ${port} ${target} "mkdir -p ~/.ssh && echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && echo 'Key added successfully'"`;

      logger.info({ cmd }, 'Executing SSH key addition command');
      const result = await executeCommand(cmd);

      return {
        success: true,
        host,
        username,
        message: 'SSH key added to authorized_keys',
        output: result || 'Key added successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host: args.host }, 'SSH key addition failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Save SSH Configuration Skill
 * Save SSH host configuration for future connections
 */
export const saveSSHConfigSkill: Skill = {
  name: 'save_ssh_config',
  description: '💾 Save SSH host configuration (host, username, port, keyPath)',
  async execute(args: any) {
    try {
      const host = args.host;
      const username = args.username;
      const port = args.port;
      const keyPath = args.keyPath;
      const useKey = args.useKey;

      if (!host) {
        throw new Error('Host is required');
      }

      const config = {
        host,
        username,
        port,
        keyPath,
        useKey,
      };

      await userPreferencesManager.setSSHConfig(config);

      const hostId = username ? `${username}@${host}` : host;
      logger.info({ hostId, config }, 'SSH configuration saved');

      return {
        success: true,
        message: `SSH configuration saved for ${hostId}`,
        config,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host: args.host }, 'Failed to save SSH configuration');
      return { success: false, error: error.message };
    }
  },
};

/**
 * List SSH Configurations Skill
 * List all saved SSH host configurations
 */
export const listSSHConfigsSkill: Skill = {
  name: 'list_ssh_configs',
  description: '📋 List all saved SSH host configurations',
  async execute(args: any) {
    try {
      const configs = await userPreferencesManager.listSSHConfigs();

      logger.info({ count: configs.length }, 'Listed SSH configurations');

      return {
        success: true,
        count: configs.length,
        configs,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to list SSH configurations');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Delete SSH Configuration Skill
 * Delete a saved SSH host configuration
 */
export const deleteSSHConfigSkill: Skill = {
  name: 'delete_ssh_config',
  description: '🗑️ Delete saved SSH host configuration',
  async execute(args: any) {
    try {
      const host = args.host;
      const username = args.username;

      if (!host) {
        throw new Error('Host is required');
      }

      const deleted = await userPreferencesManager.deleteSSHConfig(host, username);

      const hostId = username ? `${username}@${host}` : host;

      if (deleted) {
        logger.info({ hostId }, 'SSH configuration deleted');
        return {
          success: true,
          message: `SSH configuration deleted for ${hostId}`,
          timestamp: new Date().toISOString(),
        };
      } else {
        return {
          success: false,
          error: `No SSH configuration found for ${hostId}`,
        };
      }
    } catch (error: any) {
      logger.error({ error, host: args.host }, 'Failed to delete SSH configuration');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Upload File Skill
 * Upload single or multiple files to remote server using scp or sftp
 */
export const uploadFileSkill: Skill = {
  name: 'upload_file',
  description: '📤 Upload single or multiple files to remote server',
  async execute(args: any) {
    try {
      const host = args.host;
      const username = args.username || 'root';
      const port = args.port || 22;
      const localPaths = Array.isArray(args.localPath) ? args.localPath : [args.localPath];
      const remotePath = args.remotePath || '/tmp/';
      const keyPath = args.keyPath || `${os.homedir()}/.ssh/id_rsa`;
      const useKey = args.useKey !== false;

      if (!host || !localPaths || localPaths.length === 0) {
        throw new Error('Host and localPath(s) are required');
      }

      logger.info({ host, username, localPaths, remotePath }, 'File upload requested');

      let results = [];

      for (const localPath of localPaths) {
        let scpCommand = `scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;

        if (port !== 22) {
          scpCommand += ` -P ${port}`;
        }

        if (useKey) {
          scpCommand += ` -i ${keyPath}`;
        }

        scpCommand += ` "${localPath}" ${username}@${host}:${remotePath}`;

        logger.info({ scpCommand }, 'Uploading file');
        const result = await executeCommand(scpCommand);

        results.push({
          localPath,
          remotePath: `${host}:${remotePath}${path.basename(localPath)}`,
          success: true,
          output: result || 'File uploaded successfully',
        });
      }

      return {
        success: true,
        host,
        filesUploaded: localPaths.length,
        uploads: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host: args.host }, 'File upload failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Download File Skill
 * Download single or multiple files from remote server
 */
export const downloadFileSkill: Skill = {
  name: 'download_file',
  description: '📥 Download single or multiple files from remote server',
  async execute(args: any) {
    try {
      const host = args.host;
      const username = args.username || 'root';
      const port = args.port || 22;
      const remotePaths = Array.isArray(args.remotePath) ? args.remotePath : [args.remotePath];
      const localPath = args.localPath || '.';
      const keyPath = args.keyPath || `${os.homedir()}/.ssh/id_rsa`;
      const useKey = args.useKey !== false;

      if (!host || !remotePaths || remotePaths.length === 0) {
        throw new Error('Host and remotePath(s) are required');
      }

      logger.info({ host, username, remotePaths, localPath }, 'File download requested');

      let results = [];

      for (const remotePath of remotePaths) {
        let scpCommand = `scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;

        if (port !== 22) {
          scpCommand += ` -P ${port}`;
        }

        if (useKey) {
          scpCommand += ` -i ${keyPath}`;
        }

        scpCommand += ` ${username}@${host}:${remotePath} "${localPath}"`;

        logger.info({ scpCommand }, 'Downloading file');
        const result = await executeCommand(scpCommand);

        results.push({
          remotePath: `${host}:${remotePath}`,
          localPath: localPath,
          success: true,
          output: result || 'File downloaded successfully',
        });
      }

      return {
        success: true,
        host,
        filesDownloaded: remotePaths.length,
        downloads: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error, host: args.host }, 'File download failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * Execute Remote Command Skill
 * Execute command on remote server via SSH
 */
export const executeRemoteCommandSkill: Skill = {
  name: 'execute_remote_command',
  description: '⚡ Execute command on remote server via SSH',
  async execute(args: any) {
    try {
      // Accept connectionId as an alias for host (model sometimes uses connectionId for stateful SSH illusion)
      const host = args.host || args.connectionId || args.hostname;
      let username = args.username || 'root';
      let port = args.port || 22;
      const command = args.command;
      let password: string | undefined = args.password;
      let keyPath = args.keyPath || `${os.homedir()}/.ssh/id_rsa`;
      let usePassword = args.usePassword === true || !!password;

      if (!host || !command) {
        throw new Error('Host and command are required');
      }

      // Check for saved SSH configuration
      const savedConfig = await userPreferencesManager.getSSHConfig(host, username);
      if (savedConfig) {
        logger.info({ savedConfig }, '✨ Using saved SSH configuration');
        username = savedConfig.username || username;
        port = savedConfig.port || port;
        keyPath = savedConfig.keyPath || keyPath;
        // usePassword is determined by password parameter, not saved config
      }

      // Auto-lookup vault password when none was provided — AI often omits it after ssh_login
      if (!password) {
        try {
          const vaultPw = await getCredentialManager().getCredential(`${username}@${host}`);
          if (vaultPw) {
            password = vaultPw;
            usePassword = true;
            logger.info({ host, username }, 'Auto-loaded SSH password from vault for remote command');
          }
        } catch {
          // No vault credential — fall through to key auth
        }
      }

      // Check if this requires IT Admin Automation Skill
      if (commandTranslator.requiresITAdminAutomation(command)) {
        logger.info(
          { host, username, command },
          '🤖 Routing to IT Admin Automation Skill for complex multi-step task'
        );

        // Import ITAdminAutomationSkill dynamically
        const { default: itAdminAutomationSkill } = await import('../skills/ITAdminAutomationSkill.js');
        const taskInfo = commandTranslator.extractITAdminTaskInfo(command);

        return await itAdminAutomationSkill.execute({
          taskDescription: command,
          host,
          username,
          port,
          ...taskInfo,
        });
      }

      // Translate natural language command to shell command
      const translatedCommand = commandTranslator.translate(command);

      logger.info({ host, username, command, translatedCommand, usePassword }, 'Remote command execution requested');

      if (usePassword) {
        if (!password) {
          throw new Error('Password is required when usePassword is true');
        }
        logger.info({ host, username, port }, 'Executing remote command via password auth (sshpass)');

        let pwOutput: string | null = null;
        let pwError: Error | null = null;
        try {
          pwOutput = await sshWithPassword(username, host, password, translatedCommand, port);
        } catch (e: any) {
          pwError = e;
        }

        // sshpass returns "Permission denied" as text rather than throwing.
        if (pwError) throw pwError;
        return {
          success: true,
          host,
          username,
          command: translatedCommand,
          output: pwOutput || 'Command executed successfully',
          timestamp: new Date().toISOString(),
        };
      } else {
        // Use SSH key authentication
        let sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;

        if (port !== 22) {
          sshCommand += ` -p ${port}`;
        }

        sshCommand += ` -i ${keyPath}`;
        sshCommand += ` ${username}@${host} "${translatedCommand}"`;

        logger.info({ sshCommand }, 'Executing remote command via key auth');
        const result = await executeCommand(sshCommand);

        return {
          success: true,
          host,
          username,
          command: translatedCommand,
          originalCommand: command,
          output: result || 'Command executed successfully',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error: any) {
      logger.error({ error, host: args.host, command: args.command }, 'Remote command execution failed');
      return { success: false, error: error.message };
    }
  },
};

/**
 * All system command skills exported as array
 */
export const systemCommandSkills = [
  dnsLookupSkill,
  reverseDnsLookupSkill,
  pingHostSkill,
  portCheckSkill,
  getPublicIpSkill,
  tracerouteSkill,
  whoisLookupSkill,
  getSystemInfoSkill,
  listNetworkInterfacesSkill,
  dnsResolverCheckSkill,
  sslCertificateCheckSkill,
  bandwidthTestSkill,
  serviceStatusSkill,
  logAnalysisSkill,
  processMonitoringSkill,
  checkToolAvailabilitySkill,
  installSystemPackageSkill,
  // 🔥 Top 10 Priority Skills
  dockerManagementSkill,
  diskUsageAnalysisSkill,
  gitOperationsSkill,
  openPortsScanSkill,
  memoryDetailsSkill,
  firewallRulesSkill,
  failedLoginAttemptsSkill,
  databaseOperationsSkill,
  activeConnectionsSkill,
  webServerConfigTestSkill,
  // 👥 Next 4 Skills
  userManagementSkill,
  cronJobsSkill,
  fileSearchSkill,
  hardwareInfoSkill,
  // 🔧 System Administration (6 Skills)
  filePermissionAuditSkill,
  resourceHistorySkill,
  systemLimitsSkill,
  ioStatisticsSkill,
  packageManagementListSkill,
  mountPointsSkill,
  // 🌐 Network & Diagnostics (7 Skills)
  networkStatisticsSkill,
  routeTableSkill,
  mtuDiscoverySkill,
  arpTableSkill,
  wifiDiagnosticsSkill,
  bridgeVlanInfoSkill,
  connectionTrackingSkill,
  // 🌐 Web Hosting & Server (10 Skills)
  virtualHostListSkill,
  emailServerTestSkill,
  dnsPropagationCheckSkill,
  websiteUptimeSkill,
  backupVerificationSkill,
  quotaUsageSkill,
  sslMultiDomainCheckSkill,
  ftpStatusSkill,
  controlPanelStatusSkill,
  phpConfigurationSkill,
  // 🔐 Security & Hardening (8 Skills)
  sshKeyManagementSkill,
  securityUpdatesSkill,
  intrusionDetectionSkill,
  passwordPolicySkill,
  macStatusSkill,
  auditLogsSkill,
  rootkitScanSkill,
  dnsSecuritySkill,
  // 📊 Monitoring & Performance (8 Skills)
  systemLoadAnalysisSkill,
  cpuTemperatureSkill,
  performanceBottleneckSkill,
  metricsDashboardSkill,
  alertStatusSkill,
  resourceTrendsSkill,
  topResourceUsersSkill,
  responseTimeTestSkill,
  // 🔧 Development & DevOps (12 Skills)
  packageAuditSkill,
  buildStatusSkill,
  apiTestingSkill,
  codeQualitySkill,
  dependencyTreeSkill,
  testExecutionSkill,
  environmentCheckSkill,
  assetAnalysisSkill,
  cicdStatusSkill,
  debugPortCheckSkill,
  codeMetricsSkill,
  secretsScanSkill,
  // 🔐 Remote Server & SSH (7 Skills)
  sshLoginSkill,
  sshAddKeySkill,
  saveSSHConfigSkill,
  listSSHConfigsSkill,
  deleteSSHConfigSkill,
  uploadFileSkill,
  downloadFileSkill,
  executeRemoteCommandSkill,
];
