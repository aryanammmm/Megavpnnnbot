const { Database, User, ConnectionLog, SystemLog } = require('./database');
const VPNManager = require('./vpn-manager');
const Utils = require('./utils');
const config = require('./config');

class AdminPanel {
  constructor(bot) {
    this.bot = bot;
    this.vpnManager = new VPNManager();
    this.setupAdminCommands();
  }

  /**
   * Setup admin-specific commands
   */
  setupAdminCommands() {
    // Admin command handler
    this.bot.onText(/\/admin/, (msg) => {
      this.handleAdminCommand(msg);
    });

    // User management commands
    this.bot.onText(/\/users/, (msg) => {
      this.handleUsersCommand(msg);
    });

    this.bot.onText(/\/adduser/, (msg) => {
      this.handleAddUserCommand(msg);
    });

    this.bot.onText(/\/deluser (.+)/, (msg, match) => {
      this.handleDeleteUserCommand(msg, match[1]);
    });

    this.bot.onText(/\/userinfo (.+)/, (msg, match) => {
      this.handleUserInfoCommand(msg, match[1]);
    });

    // Server management commands
    this.bot.onText(/\/serverstats/, (msg) => {
      this.handleServerStatsCommand(msg);
    });

    this.bot.onText(/\/restart/, (msg) => {
      this.handleRestartCommand(msg);
    });

    this.bot.onText(/\/logs/, (msg) => {
      this.handleLogsCommand(msg);
    });

    this.bot.onText(/\/connections/, (msg) => {
      this.handleConnectionsCommand(msg);
    });

    this.bot.onText(/\/backup/, (msg) => {
      this.handleBackupCommand(msg);
    });
  }

  /**
   * Check if user is admin
   */
  isAdmin(userId) {
    return userId === config.ADMIN_ID;
  }

  /**
   * Handle admin command
   */
  async handleAdminCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    const adminKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👥 Users', callback_data: 'admin_users' },
            { text: '➕ Add User', callback_data: 'admin_add_user' }
          ],
          [
            { text: '📊 Server Stats', callback_data: 'admin_server_stats' },
            { text: '🔄 Restart VPN', callback_data: 'admin_restart' }
          ],
          [
            { text: '📝 Logs', callback_data: 'admin_logs' },
            { text: '🔗 Connections', callback_data: 'admin_connections' }
          ],
          [
            { text: '💾 Backup', callback_data: 'admin_backup' },
            { text: '🧹 Cleanup', callback_data: 'admin_cleanup' }
          ]
        ]
      }
    };

    this.bot.sendMessage(chatId, 
      '🔧 **Admin Panel**\n\n' +
      'Choose an action from the menu below:', 
      { 
        parse_mode: 'Markdown',
        ...adminKeyboard
      }
    );
  }

  /**
   * Handle users command
   */
  async handleUsersCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    try {
      const users = await Database.getAllUsers();
      
      if (users.length === 0) {
        this.bot.sendMessage(chatId, '📋 No users found.');
        return;
      }

      let message = '👥 **VPN Users**\n\n';
      
      for (const user of users) {
        const status = user.is_active ? '🟢' : '🔴';
        const expired = Utils.isUserExpired(user.expires_at) ? '⏰' : '';
        const daysLeft = Utils.getDaysUntilExpiration(user.expires_at);
        
        message += `${status} ${expired} **${user.username}**\n`;
        message += `ID: \`${user.id}\`\n`;
        message += `Telegram: ${user.telegram_id}\n`;
        message += `Expires: ${daysLeft > 0 ? `${daysLeft} days` : 'Expired'}\n`;
        message += `Data: ${Utils.formatBytes(user.bytes_in + user.bytes_out)}\n`;
        message += `Created: ${new Date(user.created_at).toLocaleDateString()}\n\n`;
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
      Utils.logError(error, 'AdminPanel.handleUsersCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle add user command
   */
  async handleAddUserCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    this.bot.sendMessage(chatId, '📝 Please enter the username for the new user:');
    
    const usernameHandler = async (msg) => {
      if (msg.chat.id !== chatId) return;
      
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

      this.bot.sendMessage(chatId, '🔐 Please enter the password for the new user:');
      
      const passwordHandler = async (msg) => {
        if (msg.chat.id !== chatId) return;
        
        const password = msg.text.trim();
        const passwordValidation = Utils.validatePassword(password);
        
        if (!passwordValidation.valid) {
          this.bot.sendMessage(chatId, `❌ ${passwordValidation.message}`);
          return;
        }

        try {
          // Create user in database
          const passwordHash = await Utils.hashPassword(password);
          const user = await User.create({
            telegram_id: 0, // Admin-created user
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

          // Log admin action
          await Database.logSystemAction({
            admin_id: userId,
            action: 'CREATE_USER',
            target_user_id: user.id,
            details: `Created user: ${username}`,
            success: true
          });

          this.bot.sendMessage(chatId, 
            `✅ User created successfully!\n\n` +
            `Username: ${username}\n` +
            `Password: ${password}\n` +
            `Expires: ${config.DEFAULT_EXPIRY_DAYS} days\n\n` +
            `⚠️ Save these credentials securely!`
          );

          // Send config file
          this.bot.sendDocument(chatId, configPath, {
            caption: `📎 VPN configuration for ${username}`
          });

        } catch (error) {
          Utils.logError(error, 'AdminPanel.handleAddUserCommand');
          this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
        }
        
        this.bot.removeListener('message', passwordHandler);
      };
      
      this.bot.on('message', passwordHandler);
      this.bot.removeListener('message', usernameHandler);
    };
    
    this.bot.on('message', usernameHandler);
  }

  /**
   * Handle delete user command
   */
  async handleDeleteUserCommand(msg, username) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    try {
      const user = await User.findOne({ where: { username } });
      
      if (!user) {
        this.bot.sendMessage(chatId, `❌ User '${username}' not found.`);
        return;
      }

      // Confirmation keyboard
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Yes, Delete', callback_data: `delete_user_confirm_${user.id}` },
              { text: '❌ Cancel', callback_data: 'delete_user_cancel' }
            ]
          ]
        }
      };

      this.bot.sendMessage(chatId, 
        `⚠️ **Delete User Confirmation**\n\n` +
        `Are you sure you want to delete user '${username}'?\n\n` +
        `This action cannot be undone!`,
        { parse_mode: 'Markdown', ...keyboard }
      );

    } catch (error) {
      Utils.logError(error, 'AdminPanel.handleDeleteUserCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle user info command
   */
  async handleUserInfoCommand(msg, username) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    try {
      const user = await User.findOne({ where: { username } });
      
      if (!user) {
        this.bot.sendMessage(chatId, `❌ User '${username}' not found.`);
        return;
      }

      const stats = await Database.getUserStats(user.id);
      const status = user.is_active ? '🟢 Active' : '🔴 Inactive';
      const expired = Utils.isUserExpired(user.expires_at) ? '⏰ Expired' : '';
      const daysLeft = Utils.getDaysUntilExpiration(user.expires_at);
      
      let message = `👤 **User Information**\n\n`;
      message += `**Username:** ${user.username}\n`;
      message += `**Status:** ${status} ${expired}\n`;
      message += `**Telegram ID:** ${user.telegram_id}\n`;
      message += `**Created:** ${new Date(user.created_at).toLocaleDateString()}\n`;
      message += `**Expires:** ${daysLeft > 0 ? `${daysLeft} days` : 'Expired'}\n`;
      message += `**Data In:** ${Utils.formatBytes(user.bytes_in)}\n`;
      message += `**Data Out:** ${Utils.formatBytes(user.bytes_out)}\n`;
      message += `**Total Data:** ${Utils.formatBytes(user.bytes_in + user.bytes_out)}\n`;
      message += `**Max Connections:** ${user.max_connections}\n`;
      message += `**Total Connections:** ${stats.totalConnections}\n`;
      
      if (user.last_connection_at) {
        message += `**Last Connection:** ${new Date(user.last_connection_at).toLocaleString()}\n`;
      }

      if (stats.recentConnections.length > 0) {
        message += `\n**Recent Connections:**\n`;
        stats.recentConnections.slice(0, 5).forEach((conn, index) => {
          const date = new Date(conn.connected_at).toLocaleString();
          const duration = conn.disconnected_at 
            ? Utils.formatDuration(Math.floor((new Date(conn.disconnected_at) - new Date(conn.connected_at)) / 1000))
            : 'Active';
          message += `${index + 1}. ${date} (${duration})\n`;
        });
      }

      // User management keyboard
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: user.is_active ? '🔴 Disable' : '🟢 Enable', callback_data: `user_toggle_${user.id}` },
              { text: '🔄 Reset Config', callback_data: `user_reset_config_${user.id}` }
            ],
            [
              { text: '📊 Full Stats', callback_data: `user_full_stats_${user.id}` },
              { text: '🗑️ Delete User', callback_data: `user_delete_${user.id}` }
            ]
          ]
        }
      };

      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });

    } catch (error) {
      Utils.logError(error, 'AdminPanel.handleUserInfoCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle server stats command
   */
  async handleServerStatsCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    try {
      const stats = await this.vpnManager.getServerStats();
      
      if (!stats) {
        this.bot.sendMessage(chatId, '❌ Unable to fetch server statistics.');
        return;
      }

      const totalUsers = await User.count();
      const activeUsers = await User.count({ where: { is_active: true } });
      const expiredUsers = await User.count({ 
        where: { expires_at: { [require('sequelize').Op.lt]: new Date() } } 
      });

      let message = `📊 **Server Statistics**\n\n`;
      message += `**System Info:**\n`;
      message += `CPU Usage: ${stats.cpu.usage}%\n`;
      message += `CPU Cores: ${stats.cpu.cores}\n`;
      message += `Memory: ${stats.memory.usedFormatted} / ${stats.memory.totalFormatted} (${stats.memory.usage}%)\n`;
      message += `Uptime: ${stats.uptime}\n\n`;
      
      message += `**VPN Service:**\n`;
      message += `Status: ${stats.serviceStatus.isRunning ? '🟢 Running' : '🔴 Stopped'}\n`;
      message += `Connected Clients: ${stats.connectedClients}\n\n`;
      
      message += `**User Statistics:**\n`;
      message += `Total Users: ${totalUsers}\n`;
      message += `Active Users: ${activeUsers}\n`;
      message += `Expired Users: ${expiredUsers}\n`;
      message += `Online Users: ${stats.connectedClients}\n\n`;
      
      message += `**Database:**\n`;
      message += `Total Connections: ${await ConnectionLog.count()}\n`;
      message += `System Logs: ${await SystemLog.count()}\n`;
      
      message += `\n*Updated: ${new Date(stats.timestamp).toLocaleString()}*`;

      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      Utils.logError(error, 'AdminPanel.handleServerStatsCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle restart command
   */
  async handleRestartCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Restart VPN Service', callback_data: 'restart_vpn' },
            { text: '🔄 Restart Bot', callback_data: 'restart_bot' }
          ],
          [
            { text: '❌ Cancel', callback_data: 'restart_cancel' }
          ]
        ]
      }
    };

    this.bot.sendMessage(chatId, 
      '🔄 **Restart Options**\n\n' +
      'What would you like to restart?',
      { parse_mode: 'Markdown', ...keyboard }
    );
  }

  /**
   * Handle logs command
   */
  async handleLogsCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    try {
      const logs = await Database.getSystemLogs(20);
      
      if (logs.length === 0) {
        this.bot.sendMessage(chatId, '📝 No system logs found.');
        return;
      }

      let message = '📝 **System Logs** (Latest 20)\n\n';
      
      for (const log of logs) {
        const date = new Date(log.created_at).toLocaleString();
        const admin = log.admin ? log.admin.username : 'System';
        const target = log.target_user ? log.target_user.username : 'N/A';
        const status = log.success ? '✅' : '❌';
        
        message += `${status} **${log.action}**\n`;
        message += `Admin: ${admin}\n`;
        message += `Target: ${target}\n`;
        message += `Time: ${date}\n`;
        if (log.details) {
          message += `Details: ${log.details}\n`;
        }
        message += '\n';
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
      Utils.logError(error, 'AdminPanel.handleLogsCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle connections command
   */
  async handleConnectionsCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    try {
      const connectedClients = await this.vpnManager.getConnectedClients();
      
      if (connectedClients.length === 0) {
        this.bot.sendMessage(chatId, '🔗 No active connections.');
        return;
      }

      let message = '🔗 **Active Connections**\n\n';
      
      for (const client of connectedClients) {
        message += `**${client.commonName}**\n`;
        message += `IP: ${client.realAddress}\n`;
        message += `Connected: ${client.connectedSince}\n`;
        message += `Data In: ${Utils.formatBytes(client.bytesReceived)}\n`;
        message += `Data Out: ${Utils.formatBytes(client.bytesSent)}\n\n`;
      }

      this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      Utils.logError(error, 'AdminPanel.handleConnectionsCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Handle backup command
   */
  async handleBackupCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(chatId, config.MESSAGES.ADMIN_ONLY);
      return;
    }

    try {
      this.bot.sendMessage(chatId, '💾 Creating backup...');
      
      const backupPath = await this.createBackup();
      
      if (backupPath) {
        await this.bot.sendDocument(chatId, backupPath, {
          caption: '💾 Database backup created successfully!'
        });
        
        // Clean up backup file after sending
        setTimeout(async () => {
          try {
            await require('fs').promises.unlink(backupPath);
          } catch (error) {
            // Ignore cleanup errors
          }
        }, 60000); // Clean up after 1 minute
      } else {
        this.bot.sendMessage(chatId, '❌ Failed to create backup.');
      }

    } catch (error) {
      Utils.logError(error, 'AdminPanel.handleBackupCommand');
      this.bot.sendMessage(chatId, config.MESSAGES.ERROR_OCCURRED);
    }
  }

  /**
   * Create database backup
   */
  async createBackup() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `vpn_backup_${timestamp}.db`;
      const backupPath = path.join(config.TEMP_DIR, backupFilename);
      
      await Utils.ensureDirectory(config.TEMP_DIR);
      
      // Copy database file
      await fs.copyFile(config.DATABASE_PATH, backupPath);
      
      return backupPath;
    } catch (error) {
      Utils.logError(error, 'AdminPanel.createBackup');
      return null;
    }
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

      if (!this.isAdmin(userId)) {
        this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Admin only!' });
        return;
      }

      try {
        await this.handleCallbackQuery(callbackQuery, data);
      } catch (error) {
        Utils.logError(error, 'AdminPanel.setupCallbackHandlers');
        this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Error occurred!' });
      }
    });
  }

  /**
   * Handle callback queries
   */
  async handleCallbackQuery(callbackQuery, data) {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;

    switch (data) {
      case 'admin_users':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.handleUsersCommand(msg);
        break;
        
      case 'admin_add_user':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.handleAddUserCommand(msg);
        break;
        
      case 'admin_server_stats':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.handleServerStatsCommand(msg);
        break;
        
      case 'admin_restart':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.handleRestartCommand(msg);
        break;
        
      case 'admin_logs':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.handleLogsCommand(msg);
        break;
        
      case 'admin_connections':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.handleConnectionsCommand(msg);
        break;
        
      case 'admin_backup':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.handleBackupCommand(msg);
        break;
        
      default:
        if (data.startsWith('delete_user_confirm_')) {
          const userId = data.replace('delete_user_confirm_', '');
          await this.confirmDeleteUser(callbackQuery, userId);
        } else if (data.startsWith('user_toggle_')) {
          const userId = data.replace('user_toggle_', '');
          await this.toggleUser(callbackQuery, userId);
        } else if (data.startsWith('restart_')) {
          await this.handleRestartCallback(callbackQuery, data);
        }
        break;
    }
  }

  /**
   * Confirm delete user
   */
  async confirmDeleteUser(callbackQuery, userId) {
    const chatId = callbackQuery.message.chat.id;
    
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        this.bot.answerCallbackQuery(callbackQuery.id, { text: 'User not found!' });
        return;
      }

      // Delete system user
      await this.vpnManager.deleteSystemUser(user.username);
      
      // Clean up config files
      await this.vpnManager.cleanupUserConfig(user.username);
      
      // Delete from database
      await Database.deleteUser(userId);
      
      // Log action
      await Database.logSystemAction({
        admin_id: callbackQuery.from.id,
        action: 'DELETE_USER',
        target_user_id: userId,
        details: `Deleted user: ${user.username}`,
        success: true
      });

      this.bot.answerCallbackQuery(callbackQuery.id, { text: 'User deleted successfully!' });
      this.bot.editMessageText(`✅ User '${user.username}' has been deleted.`, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id
      });

    } catch (error) {
      Utils.logError(error, 'AdminPanel.confirmDeleteUser');
      this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Error deleting user!' });
    }
  }

  /**
   * Toggle user active status
   */
  async toggleUser(callbackQuery, userId) {
    const chatId = callbackQuery.message.chat.id;
    
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        this.bot.answerCallbackQuery(callbackQuery.id, { text: 'User not found!' });
        return;
      }

      const newStatus = !user.is_active;
      
      // Update database
      await user.update({ is_active: newStatus });
      
      // Update system user
      if (newStatus) {
        await this.vpnManager.enableSystemUser(user.username);
      } else {
        await this.vpnManager.disableSystemUser(user.username);
      }
      
      // Log action
      await Database.logSystemAction({
        admin_id: callbackQuery.from.id,
        action: newStatus ? 'ENABLE_USER' : 'DISABLE_USER',
        target_user_id: userId,
        details: `${newStatus ? 'Enabled' : 'Disabled'} user: ${user.username}`,
        success: true
      });

      const statusText = newStatus ? 'enabled' : 'disabled';
      this.bot.answerCallbackQuery(callbackQuery.id, { text: `User ${statusText}!` });
      
      // Refresh user info
      this.handleUserInfoCommand(callbackQuery.message, user.username);

    } catch (error) {
      Utils.logError(error, 'AdminPanel.toggleUser');
      this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Error toggling user!' });
    }
  }

  /**
   * Handle restart callback
   */
  async handleRestartCallback(callbackQuery, data) {
    const chatId = callbackQuery.message.chat.id;
    
    switch (data) {
      case 'restart_vpn':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.bot.editMessageText('🔄 Restarting VPN service...', {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id
        });
        
        const success = await this.vpnManager.restartService();
        
        if (success) {
          this.bot.editMessageText('✅ VPN service restarted successfully!', {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          });
        } else {
          this.bot.editMessageText('❌ Failed to restart VPN service.', {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id
          });
        }
        break;
        
      case 'restart_bot':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.bot.editMessageText('🔄 Restarting bot...', {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id
        });
        
        // Log restart action
        await Database.logSystemAction({
          admin_id: callbackQuery.from.id,
          action: 'RESTART_BOT',
          details: 'Bot restart initiated',
          success: true
        });
        
        setTimeout(() => {
          process.exit(0);
        }, 2000);
        break;
        
      case 'restart_cancel':
        this.bot.answerCallbackQuery(callbackQuery.id);
        this.bot.editMessageText('❌ Restart cancelled.', {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id
        });
        break;
    }
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
}

module.exports = AdminPanel;
