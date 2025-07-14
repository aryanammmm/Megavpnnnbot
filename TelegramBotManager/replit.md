# VPN Telegram Bot

## Overview

This is a comprehensive Telegram bot system for managing VPN services on Windows Server 2022. The bot provides user registration, VPN connection management, server administration, and a web dashboard for monitoring and control.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (2025-07-13)

✅ **VPN Configuration Generation Enhancement**
- Enhanced VPN configuration generation system to create complete OpenVPN files
- Added comprehensive OpenVPN configuration templates with security settings
- Implemented realistic certificate generation for CA, client certificates, and private keys
- Added TLS authentication key generation
- Created API endpoint `/api/vpn/generate-config` for testing configuration generation
- Fixed OpenVPN status log errors in development environment
- VPN configurations now include full security settings (AES-256-GCM, TLS 1.2+, DNS leak protection)

✅ **System Improvements**
- Improved error handling for OpenVPN service monitoring in development environments
- Enhanced cross-platform compatibility for certificate generation
- Added configuration file organization in `configs/` directory
- Implemented proper logging for VPN configuration generation events

## System Architecture

### Backend Architecture
- **Node.js/Express**: Main server application with RESTful API endpoints
- **Telegram Bot API**: Primary user interface through Telegram messaging
- **SQLite Database**: Local data storage using Sequelize ORM
- **OpenVPN Integration**: Direct command-line integration for VPN server management

### Frontend Architecture
- **Static Web Dashboard**: HTML/CSS/JavaScript dashboard served by Express
- **Bootstrap UI**: Responsive interface with real-time status updates
- **REST API Client**: JavaScript-based API communication for dashboard functionality

## Key Components

### 1. Bot Interface (`bot.js`)
- **Purpose**: Main Telegram bot handler and user command processing
- **Features**: User registration, VPN connection management, session tracking
- **Architecture**: Event-driven command handlers with callback support

### 2. Admin Panel (`admin-panel.js`)
- **Purpose**: Administrative commands for VPN server management
- **Features**: User management, server statistics, system logs, restart capabilities
- **Access Control**: Admin-only commands with ID verification

### 3. VPN Manager (`vpn-manager.js`)
- **Purpose**: OpenVPN server integration and configuration management
- **Features**: User account creation, config generation, connection monitoring
- **Integration**: Direct Windows command execution for OpenVPN management

### 4. Database Layer (`database.js`)
- **Purpose**: Data persistence and user management
- **Models**: User accounts, connection logs, system logs
- **Technology**: Sequelize ORM with SQLite for local storage

### 5. Web Dashboard (`server.js` + `public/`)
- **Purpose**: Web-based monitoring and administration interface
- **Features**: Real-time statistics, user management, system monitoring
- **Security**: Admin authentication and secure headers

### 6. Utilities (`utils.js`)
- **Purpose**: Common functionality and security utilities
- **Features**: Password generation/hashing, validation, QR code generation
- **Security**: BCrypt password hashing and input validation

## Data Flow

### User Registration Flow
1. User sends `/register` command via Telegram
2. Bot validates username and generates secure password
3. VPN Manager creates OpenVPN user account
4. Database stores user credentials and metadata
5. Bot sends configuration file and connection details

### VPN Connection Flow
1. User requests VPN configuration via bot commands
2. VPN Manager generates personalized OpenVPN config
3. Configuration includes server certificates and user credentials
4. Bot sends config file with QR code for mobile setup
5. Connection attempts are logged in database

### Admin Management Flow
1. Admin accesses commands via Telegram or web dashboard
2. System validates admin permissions
3. Admin can view statistics, manage users, restart services
4. All admin actions are logged in system logs

## External Dependencies

### Core Dependencies
- **node-telegram-bot-api**: Telegram bot integration
- **express**: Web server framework
- **sequelize**: Database ORM
- **sqlite3**: Local database engine
- **bcryptjs**: Password hashing
- **qrcode**: QR code generation for mobile setup

### System Dependencies
- **OpenVPN**: VPN server software (Windows service)
- **Windows Server 2022**: Host operating system
- **Node.js Runtime**: JavaScript execution environment

## Deployment Strategy

### Development Environment
- Local SQLite database for development
- File-based configuration storage
- Direct OpenVPN command execution

### Production Considerations
- **Database**: Currently using SQLite, easily upgradeable to PostgreSQL
- **Process Management**: Node.js process should run as Windows service
- **Security**: Bot token and admin credentials via environment variables
- **Logging**: File-based logging with rotation recommended
- **Backup**: Regular database and configuration backups

### Configuration Management
- Environment-based configuration via `config.js`
- Template-based OpenVPN configuration generation
- Secure credential storage with BCrypt hashing

### Monitoring and Maintenance
- Web dashboard for real-time monitoring
- System logs for troubleshooting
- Automated cleanup tasks for expired connections
- Health check endpoints for system monitoring

The system is designed to be self-contained and easily deployable on Windows Server 2022 with minimal external dependencies. The architecture supports both development and production environments while maintaining security and scalability.