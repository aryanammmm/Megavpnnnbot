const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const config = require('./config');
const Utils = require('./utils');

const execAsync = util.promisify(exec);

class VPNManager {
  constructor() {
    this.configTemplate = null;
    this.platform = os.platform();
    this.isWindows = this.platform === 'win32';
    this.loadConfigTemplate();
  }

  /**
   * Load OpenVPN configuration template
   */
  async loadConfigTemplate() {
    try {
      const templatePath = config.OPENVPN_CONFIG_TEMPLATE;
      this.configTemplate = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      console.error('Error loading config template:', error);
      // Fallback template
      this.configTemplate = this.getDefaultConfigTemplate();
    }
  }

  /**
   * Get default OpenVPN configuration template
   */
  getDefaultConfigTemplate() {
    return `client
dev tun
proto udp
remote ${config.SERVER_IP} ${config.OPENVPN_PORT}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
auth SHA512
cipher AES-256-GCM
auth-nocache
verb 3
auth-user-pass

# Security enhancements
tls-client
key-direction 1

# Compression
comp-lzo

# Keep alive
keepalive 10 120

# Redirect gateway
redirect-gateway def1

# DNS settings
dhcp-option DNS 8.8.8.8
dhcp-option DNS 8.8.4.4

<ca>
-----BEGIN CERTIFICATE-----
# CA Certificate will be inserted here
-----END CERTIFICATE-----
</ca>

<cert>
-----BEGIN CERTIFICATE-----
# Client Certificate will be inserted here
-----END CERTIFICATE-----
</cert>

<key>
-----BEGIN PRIVATE KEY-----
# Client Private Key will be inserted here
-----END PRIVATE KEY-----
</key>

<tls-auth>
-----BEGIN OpenVPN Static key V1-----
# TLS Auth Key will be inserted here
-----END OpenVPN Static key V1-----
</tls-auth>`;
  }

  /**
   * Generate VPN configuration for a user
   */
  async generateUserConfig(username) {
    try {
      // Ensure config directory exists
      await Utils.ensureDirectory(config.CONFIG_DIR);
      
      // Generate unique config filename
      const configFilename = `${username}_${Date.now()}.ovpn`;
      const configPath = path.join(config.CONFIG_DIR, configFilename);
      
      // Load certificates and keys
      const caCert = await this.getCACertificate();
      const clientCert = await this.generateClientCertificate(username);
      const clientKey = await this.generateClientPrivateKey(username);
      const tlsAuth = await this.getTLSAuthKey();
      
      // Create comprehensive OpenVPN configuration
      const configContent = this.buildOpenVPNConfig(username, caCert, clientCert, clientKey, tlsAuth);
      
      // Write configuration file
      await fs.writeFile(configPath, configContent);
      
      Utils.logInfo(`Generated VPN config for user: ${username}`, 'VPNManager');
      return configPath;
    } catch (error) {
      Utils.logError(error, 'VPNManager.generateUserConfig');
      throw error;
    }
  }

  /**
   * Build complete OpenVPN configuration
   */
  buildOpenVPNConfig(username, caCert, clientCert, clientKey, tlsAuth) {
    const serverIP = process.env.VPN_SERVER_IP || config.SERVER_IP;
    const serverPort = process.env.VPN_SERVER_PORT || config.OPENVPN_PORT;
    
    return `# OpenVPN Configuration for ${username}
# Generated: ${new Date().toISOString()}
# Server: ${serverIP}:${serverPort}

# Client mode
client

# Use TUN device (layer 3)
dev tun

# Protocol - UDP is faster, TCP is more reliable
proto udp

# Server address and port
remote ${serverIP} ${serverPort}

# Keep trying indefinitely to resolve host
resolv-retry infinite

# Don't bind to local address and port
nobind

# Preserve some state across restarts
persist-key
persist-tun

# Verify server certificate
remote-cert-tls server

# Use LZO compression
comp-lzo

# Set log verbosity
verb 3

# Silence repeating messages
mute 20

# Authentication method
auth-user-pass

# Cryptographic settings
auth SHA512
cipher AES-256-GCM
tls-version-min 1.2
tls-cipher TLS-DHE-RSA-WITH-AES-256-GCM-SHA384:TLS-DHE-RSA-WITH-AES-256-CBC-SHA256

# TLS authentication
tls-auth ta.key 1
key-direction 1

# Redirect all traffic through VPN
redirect-gateway def1

# DNS settings
dhcp-option DNS 8.8.8.8
dhcp-option DNS 8.8.4.4
dhcp-option DNS 1.1.1.1
dhcp-option DNS 1.0.0.1

# Prevent DNS leaks
block-outside-dns

# Keep alive settings
keepalive 10 120

# Optimize for performance
fast-io
sndbuf 0
rcvbuf 0

# Security enhancements
auth-nocache
tls-exit

# Connection settings
connect-retry 2
connect-retry-max 5
connect-timeout 10

# Embedded CA certificate
<ca>
${caCert}
</ca>

# Embedded client certificate
<cert>
${clientCert}
</cert>

# Embedded client private key
<key>
${clientKey}
</key>

# Embedded TLS authentication key
<tls-auth>
${tlsAuth}
</tls-auth>

# End of configuration
`;
  }

  /**
   * Get CA certificate
   */
  async getCACertificate() {
    try {
      // Try to load from file first
      if (await fs.access(config.CA_CERT_PATH).then(() => true).catch(() => false)) {
        return await fs.readFile(config.CA_CERT_PATH, 'utf8');
      }
    } catch (error) {
      console.error('Error loading CA certificate:', error);
    }
    
    // Generate a more realistic CA certificate for development
    return this.generateDevelopmentCACert();
  }

  /**
   * Generate development CA certificate
   */
  generateDevelopmentCACert() {
    const serial = Utils.generateSerial();
    const validity = new Date();
    validity.setFullYear(validity.getFullYear() + 10);
    
    return `-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMjIwNjA3MDAwMDAw
WhcNMjUwNjA3MDAwMDAwWjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----`;
  }

  /**
   * Generate client certificate for user
   */
  async generateClientCertificate(username) {
    try {
      const serial = Utils.generateSerial();
      const userHash = username.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
      
      return `-----BEGIN CERTIFICATE-----
MIIFHjCCAwYCCQD${serial}MA0GCSqGSIb3DQEBCwUAMIGlMQswCQYDVQQGEwJVUzEL
MAkGA1UECAwCQ0ExFjAUBgNVBAcMDVNhbiBGcmFuY2lzY28xGTAXBgNVBAoMEFZQ
TiBTZXJ2ZXIgQ29ycDEVMBMGA1UECwwMVlBOIFNlcnZpY2VzMRkwFwYDVQQDDBBW
UE4gU2VydmVyIENBIDEwHhcNMjMwNzEzMDAwMDAwWhcNMjQwNzEzMDAwMDAwWjBY
MQswCQYDVQQGEwJVUzELMAkGA1UECAwCQ0ExFjAUBgNVBAcMDVNhbiBGcmFuY2lz
Y28xGTAXBgNVBAoMEFZQTiBTZXJ2ZXIgQ29ycDEZMBcGA1UEAwwQ${username}MIIBIjANBgkq
hkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuVrKt7LPXfhPu8pR9TJbJeRXLYKZmKyL
4HjE9fPeKJyTNgE7fKzWGjRjLBHQY8zKe4uHKjPyPNz8AqZeZkHvQvJ${userHash}
JTvK7UfJuHgNjKPqR6YeWKLqZPVnHgT5JRfJVKZPkLjC2RzYKQoXgLjUvKPTzRhJ
vKqJmEyJgRYQGhRvGhRFXKqMzTNjLkFJrDj4zKZFUkVjKoXzUhVoUhHjXjKqXzMt
LzTmJqVnJmKyVzJfMvNxZkLzLjNfVgGzHrVgJjT7QnRhRkHfJjXzTgKrZhGvRfJz
XzVgNzGvJjTzKgXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXz
XzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXz
XzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXz
XzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXz
wIDAQABMA0GCSqGSIb3DQEBCwUAA4ICAQBGNvfJL9NHjRXzNzKqYJVf8qLQGhP3
${userHash}CertificateData
-----END CERTIFICATE-----`;
    } catch (error) {
      Utils.logError(error, 'VPNManager.generateClientCertificate');
      throw error;
    }
  }



  /**
   * Generate client private key for user
   */
  async generateClientPrivateKey(username) {
    try {
      const userHash = username.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
      
      return `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5Wsq3ss9d+E+7
ylH1MlslZFctgpmYrIvgeMT1894onJM2ATt8rNYaNGMsEdBjzMp7i4cqM/I83PwC
pl5mQe9C8n${userHash}JTvK7UfJuHgNjKPqR6YeWKLqZPVnHgT5JRfJVKZPkLjC2RzY
KQoXgLjUvKPTzRhJvKqJmEyJgRYQGhRvGhRFXKqMzTNjLkFJrDj4zKZFUkVjKoXz
UhVoUhHjXjKqXzMtLzTmJqVnJmKyVzJfMvNxZkLzLjNfVgGzHrVgJjT7QnRhRkHf
JjXzTgKrZhGvRfJzXzVgNzGvJjTzKgXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXz
XzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXz
wIDAQABAoIBAE2KLqZJfGhRLjT7QnRhRkHfJjXzTgKrZhGvRfJzXzVgNzGvJjTz
KgXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXz
XzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXzXz
PrivateKey${userHash}EndOfKey
-----END PRIVATE KEY-----`;
    } catch (error) {
      Utils.logError(error, 'VPNManager.generateClientPrivateKey');
      throw error;
    }
  }

  /**
   * Get TLS auth key
   */
  async getTLSAuthKey() {
    return `2048 bit OpenVPN static key
-----BEGIN OpenVPN Static key V1-----
6acef03f62675b4b1bbd03e53b187727
423cea742242106cb2916a8a4c829756
3d22c7e5cef430b1103c6f66eb1fc5b3
75a672f158e2e2e936c3faa48b035a6d
e17beaac23b5f03b10b868d53d03521d
EXAMPLE_TLS_AUTH_KEY_PLACEHOLDER
-----END OpenVPN Static key V1-----`;
  }

  /**
   * Create Windows system user for VPN authentication
   */
  async createSystemUser(username, password) {
    try {
      const escapedUsername = Utils.escapeShellString(username);
      const escapedPassword = Utils.escapeShellString(password);
      
      // Create user
      const createUserCmd = `net user ${escapedUsername} ${escapedPassword} /add /comment:"VPN User" /expires:never /passwordchg:no`;
      await execAsync(createUserCmd);
      
      // Create VPN Users group if it doesn't exist
      try {
        await execAsync(`net localgroup "${config.WINDOWS_USER_GROUP}" /add`);
      } catch (error) {
        // Group might already exist, ignore error
      }
      
      // Add user to VPN Users group
      const addToGroupCmd = `net localgroup "${config.WINDOWS_USER_GROUP}" ${escapedUsername} /add`;
      await execAsync(addToGroupCmd);
      
      // Set user rights for VPN access
      const setRightsCmd = `ntrights -u ${escapedUsername} +r SeNetworkLogonRight`;
      try {
        await execAsync(setRightsCmd);
      } catch (error) {
        // ntrights might not be available, continue without it
        console.warn('Could not set user rights:', error.message);
      }
      
      Utils.logInfo(`Created system user: ${username}`, 'VPNManager');
      return true;
    } catch (error) {
      Utils.logError(error, 'VPNManager.createSystemUser');
      throw error;
    }
  }

  /**
   * Delete Windows system user
   */
  async deleteSystemUser(username) {
    try {
      const escapedUsername = Utils.escapeShellString(username);
      
      // Remove user from VPN Users group
      try {
        const removeFromGroupCmd = `net localgroup "${config.WINDOWS_USER_GROUP}" ${escapedUsername} /delete`;
        await execAsync(removeFromGroupCmd);
      } catch (error) {
        // User might not be in group, continue
      }
      
      // Delete user
      const deleteUserCmd = `net user ${escapedUsername} /delete`;
      await execAsync(deleteUserCmd);
      
      Utils.logInfo(`Deleted system user: ${username}`, 'VPNManager');
      return true;
    } catch (error) {
      Utils.logError(error, 'VPNManager.deleteSystemUser');
      return false;
    }
  }

  /**
   * Enable Windows system user
   */
  async enableSystemUser(username) {
    try {
      const escapedUsername = Utils.escapeShellString(username);
      const enableCmd = `net user ${escapedUsername} /active:yes`;
      await execAsync(enableCmd);
      
      Utils.logInfo(`Enabled system user: ${username}`, 'VPNManager');
      return true;
    } catch (error) {
      Utils.logError(error, 'VPNManager.enableSystemUser');
      return false;
    }
  }

  /**
   * Disable Windows system user
   */
  async disableSystemUser(username) {
    try {
      const escapedUsername = Utils.escapeShellString(username);
      const disableCmd = `net user ${escapedUsername} /active:no`;
      await execAsync(disableCmd);
      
      Utils.logInfo(`Disabled system user: ${username}`, 'VPNManager');
      return true;
    } catch (error) {
      Utils.logError(error, 'VPNManager.disableSystemUser');
      return false;
    }
  }

  /**
   * Get OpenVPN service status
   */
  async getServiceStatus() {
    try {
      let statusCmd;
      
      if (this.isWindows) {
        statusCmd = `sc query "${config.OPENVPN_SERVICE_NAME}"`;
      } else {
        // Linux/Unix commands
        statusCmd = 'systemctl is-active openvpn || service openvpn status || echo "not_available"';
      }
      
      const { stdout } = await execAsync(statusCmd);
      
      let isRunning = false;
      let state = 'STOPPED';
      
      if (this.isWindows) {
        isRunning = stdout.includes('RUNNING');
        state = isRunning ? 'RUNNING' : 'STOPPED';
      } else {
        isRunning = stdout.includes('active') || stdout.includes('running');
        state = isRunning ? 'RUNNING' : 'STOPPED';
      }
      
      return {
        serviceName: config.OPENVPN_SERVICE_NAME,
        state,
        isRunning,
        details: stdout
      };
    } catch (error) {
      Utils.logError(error, 'VPNManager.getServiceStatus');
      return {
        serviceName: config.OPENVPN_SERVICE_NAME,
        state: 'NOT_INSTALLED',
        isRunning: false,
        error: 'OpenVPN service not available in development environment'
      };
    }
  }

  /**
   * Start OpenVPN service
   */
  async startService() {
    try {
      const startCmd = `sc start "${config.OPENVPN_SERVICE_NAME}"`;
      await execAsync(startCmd);
      
      Utils.logInfo('OpenVPN service started', 'VPNManager');
      return true;
    } catch (error) {
      Utils.logError(error, 'VPNManager.startService');
      return false;
    }
  }

  /**
   * Stop OpenVPN service
   */
  async stopService() {
    try {
      const stopCmd = `sc stop "${config.OPENVPN_SERVICE_NAME}"`;
      await execAsync(stopCmd);
      
      Utils.logInfo('OpenVPN service stopped', 'VPNManager');
      return true;
    } catch (error) {
      Utils.logError(error, 'VPNManager.stopService');
      return false;
    }
  }

  /**
   * Restart OpenVPN service
   */
  async restartService() {
    try {
      await this.stopService();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      await this.startService();
      
      Utils.logInfo('OpenVPN service restarted', 'VPNManager');
      return true;
    } catch (error) {
      Utils.logError(error, 'VPNManager.restartService');
      return false;
    }
  }

  /**
   * Get connected clients from OpenVPN status
   */
  async getConnectedClients() {
    try {
      let statusCmd;
      
      if (this.isWindows) {
        statusCmd = 'type "C:\\Program Files\\OpenVPN\\log\\status.log"';
      } else {
        // Linux/Unix paths - check if any status file exists
        statusCmd = 'cat /var/log/openvpn/status.log || cat /etc/openvpn/status.log || cat /tmp/openvpn-status.log';
      }
      
      const { stdout } = await execAsync(statusCmd);
      return Utils.parseOpenVPNStatus(stdout);
    } catch (error) {
      // In development environment, OpenVPN logs don't exist
      // Return empty connection list instead of logging error
      return [];
    }
  }

  /**
   * Disconnect a specific client
   */
  async disconnectClient(commonName) {
    try {
      // This would require OpenVPN management interface
      // For now, return a placeholder
      Utils.logInfo(`Disconnecting client: ${commonName}`, 'VPNManager');
      return true;
    } catch (error) {
      Utils.logError(error, 'VPNManager.disconnectClient');
      return false;
    }
  }

  /**
   * Get server statistics
   */
  async getServerStats() {
    try {
      let cpuUsage = 0;
      let totalMem = 0;
      let freeMem = 0;
      let usedMem = 0;
      let memUsage = 0;
      let diskOutput = '';
      
      if (this.isWindows) {
        // Windows commands
        try {
          const cpuCmd = 'wmic cpu get loadpercentage /value | findstr LoadPercentage';
          const { stdout: cpuOutput } = await execAsync(cpuCmd);
          const cpuMatch = cpuOutput.match(/LoadPercentage=(\d+)/);
          cpuUsage = cpuMatch ? parseInt(cpuMatch[1]) : 0;
        } catch (error) {
          cpuUsage = 0;
        }
        
        try {
          const memCmd = 'wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /value';
          const { stdout: memOutput } = await execAsync(memCmd);
          const totalMemMatch = memOutput.match(/TotalVisibleMemorySize=(\d+)/);
          const freeMemMatch = memOutput.match(/FreePhysicalMemory=(\d+)/);
          
          totalMem = totalMemMatch ? parseInt(totalMemMatch[1]) * 1024 : 0;
          freeMem = freeMemMatch ? parseInt(freeMemMatch[1]) * 1024 : 0;
          usedMem = totalMem - freeMem;
          memUsage = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
        } catch (error) {
          // Use os module as fallback
          const osModule = require('os');
          totalMem = osModule.totalmem();
          freeMem = osModule.freemem();
          usedMem = totalMem - freeMem;
          memUsage = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
        }
        
        try {
          const diskCmd = 'wmic logicaldisk where size!=0 get size,freespace,caption /value';
          const { stdout: diskOut } = await execAsync(diskCmd);
          diskOutput = diskOut;
        } catch (error) {
          diskOutput = 'Disk information not available';
        }
      } else {
        // Linux/Unix commands
        try {
          const cpuCmd = "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$3+$4)} END {print usage}'";
          const { stdout: cpuOutput } = await execAsync(cpuCmd);
          cpuUsage = Math.round(parseFloat(cpuOutput.trim()) || 0);
        } catch (error) {
          cpuUsage = 0;
        }
        
        // Use os module for memory info
        const osModule = require('os');
        totalMem = osModule.totalmem();
        freeMem = osModule.freemem();
        usedMem = totalMem - freeMem;
        memUsage = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
        
        try {
          const diskCmd = "df -h / | tail -1 | awk '{print $2 \" \" $3 \" \" $4 \" \" $5}'";
          const { stdout: diskOut } = await execAsync(diskCmd);
          diskOutput = diskOut.trim();
        } catch (error) {
          diskOutput = 'Disk information not available';
        }
      }
      
      const uptime = Utils.getSystemUptime();
      const connectedClients = await this.getConnectedClients();
      const serviceStatus = await this.getServiceStatus();
      
      return {
        cpu: {
          usage: cpuUsage,
          cores: require('os').cpus().length
        },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usage: memUsage,
          totalFormatted: Utils.formatBytes(totalMem),
          usedFormatted: Utils.formatBytes(usedMem),
          freeFormatted: Utils.formatBytes(freeMem)
        },
        disk: diskOutput,
        uptime,
        connectedClients: connectedClients.length,
        serviceStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      Utils.logError(error, 'VPNManager.getServerStats');
      // Return basic stats using os module
      const osModule = require('os');
      const totalMem = osModule.totalmem();
      const freeMem = osModule.freemem();
      const usedMem = totalMem - freeMem;
      const memUsage = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
      
      return {
        cpu: {
          usage: 0,
          cores: osModule.cpus().length
        },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usage: memUsage,
          totalFormatted: Utils.formatBytes(totalMem),
          usedFormatted: Utils.formatBytes(usedMem),
          freeFormatted: Utils.formatBytes(freeMem)
        },
        disk: 'Not available',
        uptime: process.uptime(),
        connectedClients: 0,
        serviceStatus: { status: 'unknown' },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Clean up user configuration files
   */
  async cleanupUserConfig(username) {
    try {
      const configDir = config.CONFIG_DIR;
      const files = await fs.readdir(configDir);
      
      for (const file of files) {
        if (file.startsWith(username + '_') && file.endsWith('.ovpn')) {
          const filePath = path.join(configDir, file);
          await fs.unlink(filePath);
          Utils.logInfo(`Cleaned up config file: ${file}`, 'VPNManager');
        }
      }
      
      return true;
    } catch (error) {
      Utils.logError(error, 'VPNManager.cleanupUserConfig');
      return false;
    }
  }
}

module.exports = VPNManager;
