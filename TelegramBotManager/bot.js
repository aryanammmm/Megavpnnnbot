const TelegramBot = require('node-telegram-bot-api');
const { Database, User, ConnectionLog } = require('./database');
const VPNManager = require('./vpn-manager');
const AdminPanel = require('./admin-panel');
const Utils = require('./utils');
const config = require('./config');
const path = require('path');

class VPNBot {
  constructor() {
    this.bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
    this.vpnManager = new VPNManager();
    this.adminPanel = new AdminPanel(this.bot);
    this.userSessions = new Map(); // Track user sessions
    
    this.setupEventHandlers();
    this.setupCommands();
    this.setupKeyboardHandlers();
    this.setupCallbackHandlers();
    this.startCleanupTasks();
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.bot.on('error', (error) => {
      Utils.logError(error, 'TelegramBot');
    });

    this.bot.on('polling_error', (error) => {
      Utils.logError(error, 'TelegramBot.polling');
    });

    // Handle unexpected errors
    process.on('uncaughtException', (error) => {
      Utils.logError(error, 'UncaughtException');
    });

    process.on('unhandledRejection', (error) => {
      Utils.logError(error, 'UnhandledRejection');
    });
  }

  /**
   * Setup bot commands
   */
  setupCommands() {
    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      await this.handleStartCommand(msg);
    });

    // Register command
    this.bot.onText(/\/register/, async (msg) => {
      await this.handleRegisterCommand(msg);
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      await this.handleHelpCommand(msg);
    });

    // Status command
    this.bot.onText(/\/status/, async (msg) => {
      await this.handleStatusCommand(msg);
    });

    // Connect command
    this.bot.onText(/\/connect/, async (msg) => {
      await this.handleConnectCommand(msg);
    });

    // Disconnect command
    this.bot.onText(/\/disconnect/, async (msg) => {
      await this.handleDisconnectCommand(msg);
    });

    // Config command
    this.bot.onText(/\/config/, async (msg) => {
      await this.handleConfigCommand(msg);
    });

    // Stats command
    this.bot.onText(/\/stats/, async (msg) => {
      await this.handleStatsCommand(msg);
    });
  }

  /**
   * Setup keyboard handlers
   */
  setupKeyboardHandlers() {
    this.bot.on('message', async (msg) => {
      if (!msg.text || msg.text.startsWith('/')) return;
      
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const text = msg.text;
      
      // Check if user is in a registration session
      if (this.userSessions.has(userId)) {
        await this.handleUserSession(msg);
        return;
      }
      
      // Handle keyboard button presses
      switch (text) {
        case '📊 My Status':
          await this.handleStatusCommand(msg);
          break;
          
        case '🔐 Connect VPN':
          await this.handleConnectCommand(msg);
          break;
          
        case '📈 Usage Stats':
          await this.handleStatsCommand(msg);
          break;
          
        case '🔌 Disconnect':
          await this.handleDisconnectCommand(msg);
          break;
          
        case '❓ Help':
          await this.handleHelpCommand(msg);
          break;
          
        case '📞 Support':
          await this.handleSupportCommand(msg);
          break;
          
        case '⚙️ Settings':
          await this.handleSettingsCommand(msg);
          break;
          
        case '📋 My Config':
          await this.handleConfigCommand(msg);
          break;
          
        default:
          // Unknown command
          this.bot.sendMessage(chatId, '❓ Unknown command. Use /help for available commands.');
          break;
      }
    });
  }

  /**
   * Setup callback query handlers
   */
  setupCallbackHandlers() {
    this.bot.on('callback_query', async (callbackQuery) => {
      const msg = callbackQuery.message;
      const chatId = msg.chat.id;
      const userId = callbackQuery.from.id;
      const data = callbackQuery.data;

      try {
        await this.handleCallbackQuery(callbackQuery, data);
      } catch (error) {
        Utils.logError(error, 'VPNBot.handleCallbackQuery');
        this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Error occurred!' });
      }
    });
  }

  /**
   * Handle start command
   */
  async handleStartCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      let user = await Database.getUserByTelegramId(userId);
      
      const mainKeyboard = this.getMainKeyboard();
      
      if (!user) {
        await this.bot.sendMessage(chatId, 
          `${config.MESSAGES.WELCOME}\n\n` +
          `🔸 Use /register to create your VPN account\n` +
          `🔸 Use /help for more information\n` +
          `🔸 Use /admin for admin panel (admin only)`,
          mainKeyboard
        );
      } else {
        const status = user.is_active ? 'Active' : 'Inactive';
        const expired = Utils.isUserExpired(user.expires_at) ? ' (Expired)' : '';
        
        await this.bot.sendMessage(chatId, 
          `${config.MESSAGES.WELCOME_BACK}\n\n` +
          `Account: ${user.username}\n` +
          `Status: ${status}${expired}\n` +
          `Expires: ${Utils.getDaysUntilExpiration(user.expires_at)} days`,
          mainKeyboard
        );
      }
    } catch (error) {
      Utils.logError(error, 'VPNBot.handleStartCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle register command
   */
  async handleRegisterCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const existingUser = await Database.getUserByTelegramId(userId);
      
      if (existingUser) {
        this.bot.sendMessage(chatId, config.MESSAGES.ALREADY_REGISTERED);
        return;
      }
      
      this.bot.sendMessage(chatId, 
        '📝 **VPN Account Registration**\n\n' +
        'Please enter a username for your VPN account:\n\n' +
        '• 3-20 characters\n' +
        '• Letters, numbers, and underscore only\n' +
        '• Must be unique',
        { parse_mode: 'Markdown' }
      );
      
      // Set user in registration session
      this.userSessions.set(userId, {
        step: 'username',
        chatId: chatId,
        startTime: Date.now()
      });
      
      // Auto-cleanup session after 5 minutes
      setTimeout(() => {
        if (this.userSessions.has(userId)) {
          this.userSessions.delete(userId);
          this.bot.sendMessage(chatId, '⏱️ Registration session timed out. Please try again.');
        }
      }, 300000);
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.handleRegisterCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle user session (registration flow)
   */
  async handleUserSession(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const session = this.userSessions.get(userId);
    
    if (!session) return;
    
    try {
      if (session.step === 'username') {
        const username = msg.text.trim();
        const validation = Utils.validateUsername(username);
        
        if (!validation.valid) {
          this.bot.sendMessage(chatId, `❌ ${validation.message}`);
          return;
        }
        
        // Check if username already exists
        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
          this.bot.sendMessage(chatId, config.MESSAGES.USERNAME_TAKEN);
          return;
        }
        
        // Store username and move to password step
        session.username = username;
        session.step = 'password';
        
        this.bot.sendMessage(chatId, 
          '🔐 **Password Setup**\n\n' +
          'Please enter a secure password:\n\n' +
          '• At least 8 characters\n' +
          '• Must contain uppercase, lowercase, and numbers\n' +
          '• Special characters recommended',
          { parse_mode: 'Markdown' }
        );
        
      } else if (session.step === 'password') {
        const password = msg.text.trim();
        const validation = Utils.validatePassword(password);
        
        if (!validation.valid) {
          this.bot.sendMessage(chatId, `❌ ${validation.message}`);
          return;
        }
        
        // Create user account
        await this.createUserAccount(userId, session.username, password, chatId);
        
        // Clean up session
        this.userSessions.delete(userId);
      }
    } catch (error) {
      Utils.logError(error, 'VPNBot.handleUserSession');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
      this.userSessions.delete(userId);
    }
  }

  /**
   * Create user account
   */
  async createUserAccount(telegramId, username, password, chatId) {
    try {
      this.bot.sendMessage(chatId, '⏳ Creating your VPN account...');
      
      // Hash password
      const passwordHash = await Utils.hashPassword(password);
      
      // Create user in database
      const user = await Database.createUser({
        telegram_id: telegramId,
        username,
        password_hash: passwordHash,
        expires_at: new Date(Date.now() + config.DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
      });
      
      // Create system user
      await this.vpnManager.createSystemUser(username, password);
      
      // Generate VPN config
      const configPath = await this.vpnManager.generateUserConfig(username);
      user.config_path = configPath;
      await user.save();
      
      // Send success message
      const successMessage = config.MESSAGES.REGISTRATION_SUCCESS
        .replace('{days}', config.DEFAULT_EXPIRY_DAYS);
      
      this.bot.sendMessage(chatId, 
        `${successMessage}\n\n` +
        `**Username:** ${username}\n` +
        `**Password:** ${password}\n\n` +
        `🔐 Your VPN configuration is being prepared...`,
        { parse_mode: 'Markdown' }
      );
      
      // Generate and send QR code
      const qrPath = await this.generateQRCode(configPath, username);
      
      if (qrPath) {
        await this.bot.sendPhoto(chatId, qrPath, {
          caption: '📱 **QR Code for Mobile Setup**\n\n' +
                   'Scan this with OpenVPN Connect app for easy setup!',
          parse_mode: 'Markdown'
        });
      }
      
      // Send config file
      await this.bot.sendDocument(chatId, configPath, {
        caption: '📎 **Your VPN Configuration File**\n\n' +
                 'Import this file into your OpenVPN client.',
        parse_mode: 'Markdown'
      });
      
      // Send setup instructions
      await this.sendSetupInstructions(chatId);
      
      Utils.logInfo(`New user registered: ${username} (${telegramId})`, 'VPNBot');
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.createUserAccount');
      this.bot.sendMessage(chatId, config.MESSAGES.REGISTRATION_FAILED);
    }
  }

  /**
   * Generate QR code for VPN config
   */
  async generateQRCode(configPath, username) {
    try {
      if (!configPath) {
        throw new Error('Config path is null or undefined');
      }
      
      const fs = require('fs').promises;
      const configData = await fs.readFile(configPath, 'utf8');
      
      // Check if config data is too large for QR code (max ~4000 chars)
      if (configData.length > 4000) {
        Utils.logInfo('Config data too large for QR code, generating connection URL instead');
        
        // Generate a simple connection URL for QR code instead
        const connectionUrl = `openvpn://${config.SERVER_IP}:${config.OPENVPN_PORT}?username=${username}`;
        
        const qrFilename = Utils.generateUniqueFilename(`${username}_qr_`, '.png');
        const qrPath = path.join(config.TEMP_DIR, qrFilename);
        
        await Utils.generateQRCode(connectionUrl, qrPath);
        
        // Schedule cleanup
        setTimeout(async () => {
          try {
            await fs.unlink(qrPath);
          } catch (error) {
            // Ignore cleanup errors
          }
        }, 300000); // 5 minutes
        
        return qrPath;
      }
      
      const qrFilename = Utils.generateUniqueFilename(`${username}_qr_`, '.png');
      const qrPath = path.join(config.TEMP_DIR, qrFilename);
      
      await Utils.generateQRCode(configData, qrPath);
      
      // Schedule cleanup
      setTimeout(async () => {
        try {
          await fs.unlink(qrPath);
        } catch (error) {
          // Ignore cleanup errors
        }
      }, 300000); // 5 minutes
      
      return qrPath;
    } catch (error) {
      Utils.logError(error, 'VPNBot.generateQRCode');
      return null;
    }
  }

  /**
   * Send setup instructions
   */
  async sendSetupInstructions(chatId) {
    const instructions = `📋 **VPN Setup Instructions**\n\n` +
      `**For Windows:**\n` +
      `1. Download OpenVPN GUI\n` +
      `2. Right-click on OpenVPN icon → Import file\n` +
      `3. Enter your username and password\n\n` +
      
      `**For Android/iOS:**\n` +
      `1. Install OpenVPN Connect\n` +
      `2. Scan the QR code or import the .ovpn file\n` +
      `3. Enter your credentials when prompted\n\n` +
      
      `**For macOS:**\n` +
      `1. Install Tunnelblick\n` +
      `2. Double-click the .ovpn file\n` +
      `3. Enter your credentials\n\n` +
      
      `**Support:** Use /help for more information`;
    
    this.bot.sendMessage(chatId, instructions, { parse_mode: 'Markdown' });
  }

  /**
   * Handle status command
   */
  async handleStatusCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      const status = user.is_active ? '🟢 Active' : '🔴 Inactive';
      const expired = Utils.isUserExpired(user.expires_at) ? '⏰ Expired' : '';
      const daysLeft = Utils.getDaysUntilExpiration(user.expires_at);
      const connectionStatus = user.connected_at ? '🔗 Connected' : '📤 Disconnected';
      
      let message = `📊 **Your VPN Status**\n\n`;
      message += `**Account:** ${user.username}\n`;
      message += `**Status:** ${status} ${expired}\n`;
      message += `**Connection:** ${connectionStatus}\n`;
      message += `**Expires:** ${daysLeft > 0 ? `${daysLeft} days` : 'Expired'}\n`;
      message += `**Data Usage:**\n`;
      message += `  • Downloaded: ${Utils.formatBytes(user.bytes_in)}\n`;
      message += `  • Uploaded: ${Utils.formatBytes(user.bytes_out)}\n`;
      message += `  • Total: ${Utils.formatBytes(user.bytes_in + user.bytes_out)}\n`;
      
      if (user.last_connection_at) {
        message += `**Last Connected:** ${new Date(user.last_connection_at).toLocaleString()}\n`;
      }
      
      // Add status-specific actions
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📈 Detailed Stats', callback_data: 'user_detailed_stats' },
              { text: '🔄 Refresh', callback_data: 'user_refresh_status' }
            ]
          ]
        }
      };
      
      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.handleStatusCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle connect command
   */
  async handleConnectCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      if (!user.is_active) {
        this.bot.sendMessage(chatId, '❌ Your account is disabled. Please contact support.');
        return;
      }
      
      if (Utils.isUserExpired(user.expires_at)) {
        this.bot.sendMessage(chatId, '⏰ Your account has expired. Please contact support.');
        return;
      }
      
      // Generate fresh QR code
      const qrPath = await this.generateQRCode(user.config_path, user.username);
      
      let message = `🔐 **VPN Connection**\n\n`;
      message += `**Server:** ${config.SERVER_IP}:${config.OPENVPN_PORT}\n`;
      message += `**Username:** ${user.username}\n`;
      message += `**Protocol:** UDP\n\n`;
      message += `Choose your connection method:`;
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📱 QR Code', callback_data: 'connect_qr' },
              { text: '📄 Config File', callback_data: 'connect_config' }
            ],
            [
              { text: '📋 Manual Setup', callback_data: 'connect_manual' },
              { text: '❓ Help', callback_data: 'connect_help' }
            ]
          ]
        }
      };
      
      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
      
      if (qrPath) {
        await this.bot.sendPhoto(chatId, qrPath, {
          caption: '📱 Scan this QR code with OpenVPN Connect app'
        });
      }
      
      // Send config file
      await this.bot.sendDocument(chatId, user.config_path, {
        caption: config.MESSAGES.CONFIG_GENERATED
      });
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.handleConnectCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle disconnect command
   */
  async handleDisconnectCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      // Check if user is connected
      const connectedClients = await this.vpnManager.getConnectedClients();
      const userConnection = connectedClients.find(client => 
        client.commonName === user.username
      );
      
      if (!userConnection) {
        this.bot.sendMessage(chatId, '📤 You are not currently connected to the VPN.');
        return;
      }
      
      // Disconnect user
      const disconnected = await this.vpnManager.disconnectClient(user.username);
      
      if (disconnected) {
        // Update user record
        await user.update({
          connected_at: null,
          last_connection_at: new Date()
        });
        
        this.bot.sendMessage(chatId, config.MESSAGES.DISCONNECTED);
      } else {
        this.bot.sendMessage(chatId, '❌ Failed to disconnect. Please try again or restart your VPN client.');
      }
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.handleDisconnectCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle config command
   */
  async handleConfigCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📄 Download Config', callback_data: 'config_download' },
              { text: '📱 QR Code', callback_data: 'config_qr' }
            ],
            [
              { text: '🔄 Regenerate Config', callback_data: 'config_regenerate' },
              { text: '📋 Manual Details', callback_data: 'config_manual' }
            ]
          ]
        }
      };
      
      this.bot.sendMessage(chatId, 
        '📋 **VPN Configuration**\n\n' +
        'Choose how you want to access your VPN configuration:',
        { parse_mode: 'Markdown', ...keyboard }
      );
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.handleConfigCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle stats command
   */
  async handleStatsCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      const stats = await Database.getUserStats(user.id);
      
      if (!stats) {
        this.bot.sendMessage(chatId, '❌ Unable to fetch statistics.');
        return;
      }
      
      let message = `📈 **Your Usage Statistics**\n\n`;
      message += `**Total Data Usage:**\n`;
      message += `  • Downloaded: ${Utils.formatBytes(user.bytes_in)}\n`;
      message += `  • Uploaded: ${Utils.formatBytes(user.bytes_out)}\n`;
      message += `  • Total: ${Utils.formatBytes(user.bytes_in + user.bytes_out)}\n\n`;
      
      message += `**Connection Statistics:**\n`;
      message += `  • Total Sessions: ${stats.totalConnections}\n`;
      message += `  • Account Age: ${Math.floor((Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24))} days\n`;
      
      if (user.last_connection_at) {
        message += `  • Last Connected: ${new Date(user.last_connection_at).toLocaleString()}\n`;
      }
      
      if (stats.recentConnections.length > 0) {
        message += `\n**Recent Sessions:**\n`;
        stats.recentConnections.slice(0, 5).forEach((conn, index) => {
          const date = new Date(conn.connected_at).toLocaleDateString();
          const time = new Date(conn.connected_at).toLocaleTimeString();
          const duration = conn.disconnected_at 
            ? Utils.formatDuration(Math.floor((new Date(conn.disconnected_at) - new Date(conn.connected_at)) / 1000))
            : 'Active';
          message += `${index + 1}. ${date} ${time} (${duration})\n`;
        });
      }
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Detailed Report', callback_data: 'stats_detailed' },
              { text: '🔄 Refresh', callback_data: 'stats_refresh' }
            ]
          ]
        }
      };
      
      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.handleStatsCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle help command
   */
  async handleHelpCommand(msg) {
    const chatId = msg.chat.id;
    
    const helpMessage = `❓ **VPN Bot Help**\n\n` +
      `**Commands:**\n` +
      `/start - Start the bot\n` +
      `/register - Register new VPN account\n` +
      `/status - Check your VPN status\n` +
      `/connect - Get connection details\n` +
      `/config - Download configuration\n` +
      `/stats - View usage statistics\n` +
      `/help - Show this help message\n\n` +
      
      `**Getting Started:**\n` +
      `1. Use /register to create your account\n` +
      `2. Download your VPN configuration\n` +
      `3. Install OpenVPN client on your device\n` +
      `4. Import the configuration file\n` +
      `5. Connect using your username and password\n\n` +
      
      `**Supported Devices:**\n` +
      `✅ Windows (OpenVPN GUI)\n` +
      `✅ Android (OpenVPN Connect)\n` +
      `✅ iOS (OpenVPN Connect)\n` +
      `✅ macOS (Tunnelblick)\n` +
      `✅ Linux (OpenVPN client)\n\n` +
      
      `**Need Help?**\n` +
      `Use the 📞 Support button for assistance.`;
    
    this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Handle support command
   */
  async handleSupportCommand(msg) {
    const chatId = msg.chat.id;
    
    const supportMessage = `📞 **Support Information**\n\n` +
      `**Technical Support:**\n` +
      `• Email: support@yourvpn.com\n` +
      `• Telegram: @yoursupport\n` +
      `• Website: https://yourvpn.com\n\n` +
      
      `**Common Issues:**\n` +
      `• Connection problems: Check your internet connection\n` +
      `• Authentication failures: Verify username/password\n` +
      `• Slow speeds: Try different server locations\n\n` +
      
      `**Business Hours:**\n` +
      `Monday - Friday: 9:00 AM - 6:00 PM (UTC)\n` +
      `Response time: Within 24 hours`;
    
    this.bot.sendMessage(chatId, supportMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Handle settings command
   */
  async handleSettingsCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔐 Change Password', callback_data: 'settings_password' },
              { text: '🔄 Reset Config', callback_data: 'settings_reset_config' }
            ],
            [
              { text: '📧 Change Email', callback_data: 'settings_email' },
              { text: '🔔 Notifications', callback_data: 'settings_notifications' }
            ],
            [
              { text: '🗑️ Delete Account', callback_data: 'settings_delete' }
            ]
          ]
        }
      };
      
      this.bot.sendMessage(chatId, 
        '⚙️ **Account Settings**\n\n' +
        'Choose what you want to modify:',
        { parse_mode: 'Markdown', ...keyboard }
      );
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.handleSettingsCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle callback queries
   */
  async handleCallbackQuery(callbackQuery, data) {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;
    
    switch (data) {
      case 'user_detailed_stats':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.handleStatsCommand(msg);
        break;
        
      case 'user_refresh_status':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.handleStatusCommand(msg);
        break;
        
      case 'connect_qr':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.sendQRCode(chatId, userId);
        break;
        
      case 'connect_config':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.sendConfigFile(chatId, userId);
        break;
        
      case 'connect_manual':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.sendManualSetup(chatId, userId);
        break;
        
      case 'connect_help':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.handleHelpCommand(msg);
        break;
        
      case 'config_download':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.sendConfigFile(chatId, userId);
        break;
        
      case 'config_qr':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.sendQRCode(chatId, userId);
        break;
        
      case 'config_regenerate':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.regenerateConfig(chatId, userId);
        break;
        
      case 'config_manual':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.sendManualSetup(chatId, userId);
        break;
        
      case 'stats_detailed':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.sendDetailedStats(chatId, userId);
        break;
        
      case 'stats_refresh':
        this.bot.answerCallbackQuery(callbackQuery.id);
        await this.handleStatsCommand(msg);
        break;
        
      default:
        this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Unknown action' });
        break;
    }
  }

  /**
   * Send QR code
   */
  async sendQRCode(chatId, userId) {
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      let configPath = user.config_path;
      
      // Check if config file exists, if not generate a new one
      if (!configPath || !await this.fileExists(configPath)) {
        this.bot.sendMessage(chatId, '🔄 Generating your VPN configuration...');
        configPath = await this.vpnManager.generateUserConfig(user.username);
        
        // Update user record with new config path
        await Database.updateUser(userId, { config_path: configPath });
      }
      
      // Verify file exists before generating QR code
      if (!await this.fileExists(configPath)) {
        this.bot.sendMessage(chatId, '❌ Error: Configuration file could not be generated.');
        return;
      }
      
      const qrPath = await this.generateQRCode(configPath, user.username);
      
      if (qrPath) {
        await this.bot.sendPhoto(chatId, qrPath, {
          caption: '📱 **QR Code for VPN Setup**\n\n' +
                   '1. Install OpenVPN Connect app\n' +
                   '2. Scan this QR code\n' +
                   '3. Enter your username and password\n' +
                   '4. Connect!',
          parse_mode: 'Markdown'
        });
      } else {
        this.bot.sendMessage(chatId, '❌ Failed to generate QR code.');
      }
    } catch (error) {
      Utils.logError(error, 'VPNBot.sendQRCode');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Send config file
   */
  async sendConfigFile(chatId, userId) {
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      let configPath = user.config_path;
      
      // Check if config file exists, if not generate a new one
      if (!configPath || !await this.fileExists(configPath)) {
        this.bot.sendMessage(chatId, '🔄 Generating your VPN configuration...');
        configPath = await this.vpnManager.generateUserConfig(user.username);
        
        // Update user record with new config path
        await Database.updateUser(userId, { config_path: configPath });
      }
      
      // Verify file exists before sending
      if (!await this.fileExists(configPath)) {
        this.bot.sendMessage(chatId, '❌ Error: Configuration file could not be generated.');
        return;
      }
      
      await this.bot.sendDocument(chatId, configPath, {
        caption: '📄 **VPN Configuration File**\n\n' +
                 '• Import this file into your OpenVPN client\n' +
                 '• Use your registered credentials to connect\n' +
                 '• Server: ' + config.SERVER_IP + ':' + config.OPENVPN_PORT,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      Utils.logError(error, 'VPNBot.sendConfigFile');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      const fs = require('fs').promises;
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Send manual setup instructions
   */
  async sendManualSetup(chatId, userId) {
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      const manualSetup = `🔧 **Manual VPN Setup**\n\n` +
        `**Server Details:**\n` +
        `• Server: ${config.SERVER_IP}\n` +
        `• Port: ${config.OPENVPN_PORT}\n` +
        `• Protocol: UDP\n` +
        `• Username: ${user.username}\n` +
        `• Password: [Your password]\n\n` +
        
        `**Advanced Settings:**\n` +
        `• Cipher: AES-256-GCM\n` +
        `• Auth: SHA512\n` +
        `• Compression: LZ4\n` +
        `• DNS: 8.8.8.8, 8.8.4.4\n\n` +
        
        `**Note:** For complete setup, use the configuration file instead.`;
      
      this.bot.sendMessage(chatId, manualSetup, { parse_mode: 'Markdown' });
    } catch (error) {
      Utils.logError(error, 'VPNBot.sendManualSetup');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Regenerate config
   */
  async regenerateConfig(chatId, userId) {
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      this.bot.sendMessage(chatId, '🔄 Regenerating your VPN configuration...');
      
      // Generate new config
      const newConfigPath = await this.vpnManager.generateUserConfig(user.username);
      
      // Update user record
      await user.update({ config_path: newConfigPath });
      
      // Send new config
      await this.bot.sendDocument(chatId, newConfigPath, {
        caption: '✅ **New VPN Configuration Generated**\n\n' +
                 'Your old configuration is no longer valid.',
        parse_mode: 'Markdown'
      });
      
      Utils.logInfo(`Config regenerated for user: ${user.username}`, 'VPNBot');
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.regenerateConfig');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Send detailed stats
   */
  async sendDetailedStats(chatId, userId) {
    try {
      const user = await Database.getUserByTelegramId(userId);
      
      if (!user) {
        this.bot.sendMessage(chatId, config.MESSAGES.NOT_REGISTERED);
        return;
      }
      
      const stats = await Database.getUserStats(user.id);
      const allConnections = await ConnectionLog.findAll({
        where: { user_id: user.id },
        order: [['connected_at', 'DESC']],
        limit: 20
      });
      
      let message = `📊 **Detailed Statistics Report**\n\n`;
      
      // Account info
      message += `**Account Information:**\n`;
      message += `• Username: ${user.username}\n`;
      message += `• Created: ${new Date(user.created_at).toLocaleDateString()}\n`;
      message += `• Status: ${user.is_active ? 'Active' : 'Inactive'}\n`;
      message += `• Expires: ${Utils.getDaysUntilExpiration(user.expires_at)} days\n\n`;
      
      // Data usage
      message += `**Data Usage:**\n`;
      message += `• Total Downloaded: ${Utils.formatBytes(user.bytes_in)}\n`;
      message += `• Total Uploaded: ${Utils.formatBytes(user.bytes_out)}\n`;
      message += `• Combined Total: ${Utils.formatBytes(user.bytes_in + user.bytes_out)}\n\n`;
      
      // Connection stats
      message += `**Connection Statistics:**\n`;
      message += `• Total Sessions: ${stats.totalConnections}\n`;
      message += `• Average per Day: ${(stats.totalConnections / Math.max(1, Math.floor((Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)))).toFixed(1)}\n`;
      
      if (allConnections.length > 0) {
        message += `\n**Recent Connection History:**\n`;
        allConnections.slice(0, 10).forEach((conn, index) => {
          const date = new Date(conn.connected_at).toLocaleDateString();
          const time = new Date(conn.connected_at).toLocaleTimeString();
          const duration = conn.disconnected_at 
            ? Utils.formatDuration(Math.floor((new Date(conn.disconnected_at) - new Date(conn.connected_at)) / 1000))
            : 'Active';
          const dataUsed = Utils.formatBytes((conn.bytes_in || 0) + (conn.bytes_out || 0));
          message += `${index + 1}. ${date} ${time}\n   Duration: ${duration}, Data: ${dataUsed}\n`;
        });
      }
      
      // Split message if too long
      if (message.length > 4096) {
        const chunks = this.splitMessage(message, 4096);
        for (const chunk of chunks) {
          await this.bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
        }
      } else {
        this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      }
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.sendDetailedStats');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Get main keyboard
   */
  getMainKeyboard() {
    return {
      reply_markup: {
        keyboard: [
          ['📊 My Status', '🔐 Connect VPN'],
          ['📈 Usage Stats', '📋 My Config'],
          ['🔌 Disconnect', '⚙️ Settings'],
          ['❓ Help', '📞 Support']
        ],
        resize_keyboard: true,
        persistent: true
      }
    };
  }

  /**
   * Split long messages
   */
  splitMessage(message, maxLength) {
    const chunks = [];
    let currentChunk = '';
    
    const lines = message.split('\n');
    
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
      }
      currentChunk += line + '\n';
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  /**
   * Start cleanup tasks
   */
  startCleanupTasks() {
    // Clean up temp files every hour
    setInterval(() => {
      Utils.cleanupTempFiles();
    }, 3600000);
    
    // Clean up expired users every 6 hours
    setInterval(() => {
      Database.cleanupExpiredUsers();
    }, 21600000);
    
    // Clean up old connection logs every 24 hours
    setInterval(async () => {
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        await ConnectionLog.destroy({
          where: {
            created_at: {
              [require('sequelize').Op.lt]: thirtyDaysAgo
            }
          }
        });
        Utils.logInfo('Cleaned up old connection logs', 'VPNBot');
      } catch (error) {
        Utils.logError(error, 'VPNBot.cleanupConnectionLogs');
      }
    }, 86400000);
  }

  /**
   * Initialize and start the bot
   */
  async initialize() {
    try {
      // Initialize database
      const dbInitialized = await Database.initialize();
      if (!dbInitialized) {
        throw new Error('Database initialization failed');
      }
      
      // Ensure required directories exist
      await Utils.ensureDirectory(config.CONFIG_DIR);
      await Utils.ensureDirectory(config.TEMP_DIR);
      await Utils.ensureDirectory(config.LOGS_DIR);
      
      // Setup admin panel callback handlers
      this.adminPanel.setupCallbackHandlers();
      
      Utils.logInfo('VPN Bot initialized successfully', 'VPNBot');
      console.log('🚀 VPN Bot is running!');
      
    } catch (error) {
      Utils.logError(error, 'VPNBot.initialize');
      console.error('❌ Failed to initialize VPN Bot');
      process.exit(1);
    }
  }
}

module.exports = VPNBot;
