const { Sequelize, DataTypes } = require('sequelize');
const config = require('./config');

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: config.DATABASE_PATH,
  logging: false,
  define: {
    timestamps: true,
    underscored: true
  }
});

// User model
const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  telegram_id: {
    type: DataTypes.BIGINT,
    unique: true,
    allowNull: false,
    validate: {
      notEmpty: true,
      isInt: true
    }
  },
  username: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [3, 20],
      is: /^[a-zA-Z0-9_]+$/
    }
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_admin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  config_path: {
    type: DataTypes.STRING(500)
  },
  connected_at: {
    type: DataTypes.DATE
  },
  last_connection_at: {
    type: DataTypes.DATE
  },
  bytes_in: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  bytes_out: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      isDate: true,
      isAfter: new Date().toISOString()
    }
  },
  max_connections: {
    type: DataTypes.INTEGER,
    defaultValue: config.MAX_CONNECTIONS_PER_USER,
    validate: {
      min: 1,
      max: 10
    }
  },
  notes: {
    type: DataTypes.TEXT
  }
});

// Connection log model
const ConnectionLog = sequelize.define('ConnectionLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  connected_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  disconnected_at: {
    type: DataTypes.DATE
  },
  bytes_in: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  bytes_out: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  client_ip: {
    type: DataTypes.STRING(45),
    validate: {
      isIP: true
    }
  },
  client_port: {
    type: DataTypes.INTEGER,
    validate: {
      min: 1,
      max: 65535
    }
  },
  server_ip: {
    type: DataTypes.STRING(45),
    validate: {
      isIP: true
    }
  },
  protocol: {
    type: DataTypes.STRING(10),
    defaultValue: 'udp'
  },
  connection_duration: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
});

// System log model for tracking admin actions
const SystemLog = sequelize.define('SystemLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  admin_id: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  target_user_id: {
    type: DataTypes.UUID,
    references: {
      model: User,
      key: 'id'
    }
  },
  details: {
    type: DataTypes.TEXT
  },
  ip_address: {
    type: DataTypes.STRING(45)
  },
  success: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

// Define associations
User.hasMany(ConnectionLog, { foreignKey: 'user_id', as: 'connections' });
ConnectionLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(SystemLog, { foreignKey: 'admin_id', as: 'admin_actions' });
User.hasMany(SystemLog, { foreignKey: 'target_user_id', as: 'target_actions' });
SystemLog.belongsTo(User, { foreignKey: 'admin_id', as: 'admin' });
SystemLog.belongsTo(User, { foreignKey: 'target_user_id', as: 'target_user' });

// Database helper functions
class Database {
  static async initialize() {
    try {
      await sequelize.authenticate();
      console.log('Database connection established successfully.');
      
      await sequelize.sync();
      console.log('Database synchronized successfully.');
      
      // Create admin user if doesn't exist
      const adminUser = await User.findOne({ where: { telegram_id: config.ADMIN_ID } });
      if (!adminUser) {
        console.log('Creating admin user...');
        await User.create({
          telegram_id: config.ADMIN_ID,
          username: 'admin',
          password_hash: 'admin_placeholder',
          is_admin: true,
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
        });
      }
      
      return true;
    } catch (error) {
      console.error('Unable to connect to the database:', error);
      return false;
    }
  }

  static async getUserByTelegramId(telegramId) {
    try {
      return await User.findOne({ where: { telegram_id: telegramId } });
    } catch (error) {
      console.error('Error finding user:', error);
      return null;
    }
  }

  static async createUser(userData) {
    try {
      return await User.create(userData);
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  static async updateUser(telegramId, updateData) {
    try {
      const [updatedRows] = await User.update(updateData, {
        where: { telegram_id: telegramId }
      });
      return updatedRows > 0;
    } catch (error) {
      console.error('Error updating user:', error);
      return false;
    }
  }

  static async deleteUser(userId) {
    try {
      const deletedRows = await User.destroy({ where: { id: userId } });
      return deletedRows > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }

  static async getAllUsers() {
    try {
      return await User.findAll({
        attributes: { exclude: ['password_hash'] },
        order: [['created_at', 'DESC']]
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      return [];
    }
  }

  static async getUserStats(userId) {
    try {
      const user = await User.findByPk(userId, {
        include: [{
          model: ConnectionLog,
          as: 'connections',
          limit: 10,
          order: [['connected_at', 'DESC']]
        }]
      });
      
      if (!user) return null;
      
      const totalConnections = await ConnectionLog.count({
        where: { user_id: userId }
      });
      
      return {
        user,
        totalConnections,
        recentConnections: user.connections
      };
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return null;
    }
  }

  static async logConnection(connectionData) {
    try {
      return await ConnectionLog.create(connectionData);
    } catch (error) {
      console.error('Error logging connection:', error);
      return null;
    }
  }

  static async logSystemAction(logData) {
    try {
      return await SystemLog.create(logData);
    } catch (error) {
      console.error('Error logging system action:', error);
      return null;
    }
  }

  static async getSystemLogs(limit = 50) {
    try {
      return await SystemLog.findAll({
        include: [
          { model: User, as: 'admin', attributes: ['username'] },
          { model: User, as: 'target_user', attributes: ['username'] }
        ],
        order: [['created_at', 'DESC']],
        limit
      });
    } catch (error) {
      console.error('Error fetching system logs:', error);
      return [];
    }
  }

  static async cleanupExpiredUsers() {
    try {
      const expiredUsers = await User.findAll({
        where: {
          expires_at: {
            [Sequelize.Op.lt]: new Date()
          },
          is_active: true
        }
      });

      for (const user of expiredUsers) {
        await user.update({ is_active: false });
        console.log(`Deactivated expired user: ${user.username}`);
      }

      return expiredUsers.length;
    } catch (error) {
      console.error('Error cleaning up expired users:', error);
      return 0;
    }
  }
}

module.exports = {
  sequelize,
  User,
  ConnectionLog,
  SystemLog,
  Database
};
