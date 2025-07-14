const express = require('express');
const path = require('path');
const VPNBot = require('./bot');
const { Database } = require('./database');
const VPNManager = require('./vpn-manager');
const Utils = require('./utils');
const config = require('./config');

class VPNServer {
  constructor() {
    this.app = express();
    this.vpnBot = null;
    this.vpnManager = new VPNManager();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0'
      });
    });

    // Bot status endpoint
    this.app.get('/api/bot/status', async (req, res) => {
      try {
        const botInfo = await this.vpnBot.bot.getMe();
        res.json({
          status: 'running',
          bot: botInfo,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    // Server statistics endpoint
    this.app.get('/api/server/stats', async (req, res) => {
      try {
        const stats = await this.vpnManager.getServerStats();
        const userCount = await Database.getAllUsers().then(users => users.length);
        const activeUsers = await Database.getAllUsers().then(users => 
          users.filter(user => user.is_active).length
        );

        res.json({
          ...stats,
          users: {
            total: userCount,
            active: activeUsers
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        Utils.logError(error, 'VPNServer.getServerStats');
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    // Users management endpoint
    this.app.get('/api/users', async (req, res) => {
      try {
        const users = await Database.getAllUsers();
        res.json({
          users: users.map(user => ({
            id: user.id,
            username: user.username,
            telegram_id: user.telegram_id,
            is_active: user.is_active,
            expires_at: user.expires_at,
            bytes_in: user.bytes_in,
            bytes_out: user.bytes_out,
            created_at: user.created_at,
            last_connection_at: user.last_connection_at
          }))
        });
      } catch (error) {
        Utils.logError(error, 'VPNServer.getUsers');
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    // User details endpoint
    this.app.get('/api/users/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const stats = await Database.getUserStats(id);
        
        if (!stats) {
          return res.status(404).json({
            status: 'error',
            error: 'User not found'
          });
        }

        res.json({
          user: stats.user,
          totalConnections: stats.totalConnections,
          recentConnections: stats.recentConnections
        });
      } catch (error) {
        Utils.logError(error, 'VPNServer.getUserDetails');
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    // VPN service control endpoints
    this.app.post('/api/vpn/restart', async (req, res) => {
      try {
        const result = await this.vpnManager.restartService();
        res.json({
          success: result,
          message: result ? 'VPN service restarted successfully' : 'Failed to restart VPN service'
        });
      } catch (error) {
        Utils.logError(error, 'VPNServer.restartVPN');
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    this.app.get('/api/vpn/status', async (req, res) => {
      try {
        const status = await this.vpnManager.getServiceStatus();
        res.json(status);
      } catch (error) {
        Utils.logError(error, 'VPNServer.getVPNStatus');
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    this.app.get('/api/vpn/connections', async (req, res) => {
      try {
        const connections = await this.vpnManager.getConnectedClients();
        res.json({
          connections,
          count: connections.length
        });
      } catch (error) {
        Utils.logError(error, 'VPNServer.getConnections');
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    // Configuration download endpoint
    this.app.get('/api/config/:username', async (req, res) => {
      try {
        const { username } = req.params;
        const user = await Database.getUserByUsername(username);
        
        if (!user || !user.config_path) {
          return res.status(404).json({
            status: 'error',
            error: 'Configuration not found'
          });
        }

        const fs = require('fs');
        if (!fs.existsSync(user.config_path)) {
          return res.status(404).json({
            status: 'error',
            error: 'Configuration file not found'
          });
        }

        res.download(user.config_path, `${username}.ovpn`);
      } catch (error) {
        Utils.logError(error, 'VPNServer.downloadConfig');
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    // VPN configuration generation endpoint
    this.app.post('/api/vpn/generate-config', async (req, res) => {
      try {
        const { username } = req.body;
        if (!username) {
          return res.status(400).json({
            status: 'error',
            error: 'Username is required'
          });
        }

        const configPath = await this.vpnManager.generateUserConfig(username);
        const fs = require('fs').promises;
        const configContent = await fs.readFile(configPath, 'utf8');
        
        res.json({
          status: 'success',
          username,
          configPath,
          configContent,
          message: 'VPN configuration generated successfully'
        });
      } catch (error) {
        Utils.logError(error, 'VPNServer.generateConfig');
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    // System logs endpoint
    this.app.get('/api/logs', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const logs = await Database.getSystemLogs(limit);
        res.json({
          logs,
          count: logs.length
        });
      } catch (error) {
        Utils.logError(error, 'VPNServer.getLogs');
        res.status(500).json({
          status: 'error',
          error: error.message
        });
      }
    });

    // Serve web interface
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        status: 'error',
        error: 'Endpoint not found'
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      Utils.logError(err, 'VPNServer.GlobalErrorHandler');
      res.status(500).json({
        status: 'error',
        error: 'Internal server error'
      });
    });
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Initialize database
      const dbInitialized = await Database.initialize();
      if (!dbInitialized) {
        throw new Error('Database initialization failed');
      }

      // Initialize and start VPN bot
      this.vpnBot = new VPNBot();
      await this.vpnBot.initialize();

      // Start Express server
      const port = process.env.PORT || config.SERVER_PORT || 5000;
      this.server = this.app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 VPN Server started on port ${port}`);
        console.log(`📊 Web interface: http://localhost:${port}`);
        console.log(`🤖 Telegram Bot: @megavpnnnbot`);
        console.log(`⚙️ Admin ID: ${config.ADMIN_ID}`);
        
        Utils.logInfo(`VPN Server started on port ${port}`, 'VPNServer');
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      Utils.logError(error, 'VPNServer.start');
      console.error('❌ Failed to start VPN Server');
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('\n📴 Shutting down VPN Server...');
    
    try {
      // Close database connection
      await Database.sequelize.close();
      
      // Stop the bot
      if (this.vpnBot) {
        await this.vpnBot.bot.stopPolling();
      }
      
      // Close server
      if (this.server) {
        this.server.close();
      }
      
      console.log('✅ VPN Server shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new VPNServer();
  server.start().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = VPNServer;
