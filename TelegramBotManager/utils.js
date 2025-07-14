const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');
const QRCode = require('qrcode');
const config = require('./config');

class Utils {
  /**
   * Generate a secure random password
   */
  static generatePassword(length = 12) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }

  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password) {
    try {
      return await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    } catch (error) {
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verify a password against its hash
   */
  static async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate username format
   */
  static validateUsername(username) {
    if (!username || typeof username !== 'string') {
      return { valid: false, message: 'Username is required' };
    }
    
    if (username.length < 3 || username.length > 20) {
      return { valid: false, message: 'Username must be 3-20 characters long' };
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { valid: false, message: 'Username can only contain letters, numbers, and underscores' };
    }
    
    return { valid: true };
  }

  /**
   * Validate password strength
   */
  static validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, message: 'Password is required' };
    }
    
    if (password.length < config.MIN_PASSWORD_LENGTH) {
      return { valid: false, message: `Password must be at least ${config.MIN_PASSWORD_LENGTH} characters long` };
    }
    
    if (password.length > config.MAX_PASSWORD_LENGTH) {
      return { valid: false, message: `Password must not exceed ${config.MAX_PASSWORD_LENGTH} characters` };
    }
    
    // Check for at least one uppercase, one lowercase, and one number
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' };
    }
    
    return { valid: true };
  }

  /**
   * Format bytes to human readable format
   */
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Format duration in seconds to human readable format
   */
  static formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }

  /**
   * Generate QR code for VPN configuration
   */
  static async generateQRCode(data, outputPath) {
    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await QRCode.toFile(outputPath, data, {
        type: 'png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      return outputPath;
    } catch (error) {
      console.error('QR code generation failed:', error);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   */
  static async cleanupTempFiles(directory = config.TEMP_DIR, maxAge = 3600000) {
    try {
      const files = await fs.readdir(directory);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          console.log(`Cleaned up temp file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }

  /**
   * Ensure directory exists
   */
  static async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      console.error(`Error creating directory ${dirPath}:`, error);
      return false;
    }
  }

  /**
   * Generate unique filename
   */
  static generateUniqueFilename(prefix = '', extension = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${prefix}${timestamp}_${random}${extension}`;
  }

  /**
   * Escape special characters for shell commands
   */
  static escapeShellString(str) {
    return str.replace(/[^\w@%+=:,./-]/g, '\\$&');
  }

  /**
   * Parse OpenVPN status output
   */
  static parseOpenVPNStatus(statusOutput) {
    const lines = statusOutput.split('\n');
    const clients = [];
    let inClientSection = false;
    
    for (const line of lines) {
      if (line.includes('Common Name,Real Address,Bytes Received,Bytes Sent,Connected Since')) {
        inClientSection = true;
        continue;
      }
      
      if (inClientSection && line.includes('ROUTING TABLE')) {
        break;
      }
      
      if (inClientSection && line.trim()) {
        const parts = line.split(',');
        if (parts.length >= 5) {
          clients.push({
            commonName: parts[0].trim(),
            realAddress: parts[1].trim(),
            bytesReceived: parseInt(parts[2]) || 0,
            bytesSent: parseInt(parts[3]) || 0,
            connectedSince: parts[4].trim()
          });
        }
      }
    }
    
    return clients;
  }

  /**
   * Log error with context
   */
  static logError(error, context = '') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR ${context}: ${error.message}\n${error.stack}\n`;
    
    console.error(logMessage);
    
    // Optionally write to file
    this.writeToLogFile('error.log', logMessage);
  }

  /**
   * Log info message
   */
  static logInfo(message, context = '') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] INFO ${context}: ${message}\n`;
    
    console.log(logMessage);
    
    // Optionally write to file
    this.writeToLogFile('info.log', logMessage);
  }

  /**
   * Write to log file
   */
  static async writeToLogFile(filename, message) {
    try {
      await this.ensureDirectory(config.LOGS_DIR);
      const logPath = path.join(config.LOGS_DIR, filename);
      await fs.appendFile(logPath, message);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Get system uptime
   */
  static getSystemUptime() {
    const uptime = process.uptime();
    return this.formatDuration(Math.floor(uptime));
  }

  /**
   * Generate certificate serial number
   */
  static generateSerial() {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  /**
   * Check if user is expired
   */
  static isUserExpired(expiresAt) {
    return new Date() > new Date(expiresAt);
  }

  /**
   * Get days until expiration
   */
  static getDaysUntilExpiration(expiresAt) {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Sanitize input for logging
   */
  static sanitizeForLog(input) {
    if (typeof input !== 'string') {
      input = String(input);
    }
    
    // Remove potential sensitive data patterns
    return input
      .replace(/password[=:]\s*[^\s&]+/gi, 'password=***')
      .replace(/token[=:]\s*[^\s&]+/gi, 'token=***')
      .replace(/key[=:]\s*[^\s&]+/gi, 'key=***');
  }
}

module.exports = Utils;
