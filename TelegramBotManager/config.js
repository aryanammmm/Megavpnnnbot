// Configuration file for the VPN Telegram Bot
const config = {
  // Bot configuration
  BOT_TOKEN: process.env.BOT_TOKEN || '8027517903:AAFeNSZvYNuGeO4-p8gURkRigGYaI-S9VMg',
  ADMIN_ID: parseInt(process.env.ADMIN_ID) || 123456789, // Replace with actual admin Telegram ID
  
  // Server configuration
  SERVER_IP: process.env.SERVER_IP || '127.0.0.1',
  SERVER_PORT: process.env.SERVER_PORT || 5000,
  OPENVPN_PORT: process.env.OPENVPN_PORT || 1194,
  
  // Database configuration
  DATABASE_PATH: process.env.DATABASE_PATH || './vpn_bot.db',
  
  // Directories
  CONFIG_DIR: './configs',
  TEMP_DIR: './temp',
  LOGS_DIR: './logs',
  
  // VPN settings
  DEFAULT_EXPIRY_DAYS: 30,
  MAX_CONNECTIONS_PER_USER: 3,
  
  // Security settings
  BCRYPT_ROUNDS: 12,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  
  // File paths
  OPENVPN_CONFIG_TEMPLATE: './templates/openvpn-config.template',
  CA_CERT_PATH: './certs/ca.crt',
  SERVER_CERT_PATH: './certs/server.crt',
  SERVER_KEY_PATH: './certs/server.key',
  DH_PARAMS_PATH: './certs/dh2048.pem',
  
  // Windows specific settings
  WINDOWS_USER_GROUP: 'VPN Users',
  OPENVPN_SERVICE_NAME: 'OpenVPN',
  
  // Bot messages
  MESSAGES: {
    WELCOME: '🚀 Welcome to VPN Bot!\n\nTo get started, please use /register to create your VPN account.',
    WELCOME_BACK: '👋 Welcome back! Use the menu below to manage your VPN connection.',
    REGISTRATION_SUCCESS: '✅ Registration successful!\n\n⚠️ Save these credentials securely!\nYour VPN access expires in {days} days.',
    INVALID_USERNAME: '❌ Invalid username. Use 3-20 characters (letters, numbers, underscore).',
    USERNAME_TAKEN: '❌ Username already taken. Please try another.',
    PASSWORD_TOO_SHORT: '❌ Password must be at least 8 characters long.',
    REGISTRATION_FAILED: '❌ Registration failed. Please try again.',
    ALREADY_REGISTERED: '⚠️ You are already registered!',
    NOT_REGISTERED: '❌ Please register first with /register',
    ADMIN_ONLY: '❌ This command is for administrators only.',
    ERROR_OCCURRED: '❌ An error occurred. Please try again.',
    DISCONNECTED: '🔌 VPN session disconnected.',
    CONNECTING: '🔐 Connecting to VPN...',
    CONFIG_GENERATED: '📎 Your VPN configuration file is ready!'
  }
};

module.exports = config;
