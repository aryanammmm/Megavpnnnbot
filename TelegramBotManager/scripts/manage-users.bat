@echo off
REM User Management Script for OpenVPN on Windows Server 2022
REM This script provides user management functions for the VPN Bot

setlocal enabledelayedexpansion

REM Set variables
set VPN_GROUP=VPN Users
set OPENVPN_CONFIG_DIR=C:\Program Files\OpenVPN\config
set USER_CONFIG_DIR=C:\VPN\configs
set LOG_FILE=C:\VPN\logs\user_management.log

REM Create directories if they don't exist
if not exist "C:\VPN\logs" mkdir "C:\VPN\logs"
if not exist "%USER_CONFIG_DIR%" mkdir "%USER_CONFIG_DIR%"

REM Function to log messages
set LOG_TIMESTAMP=%DATE% %TIME%

REM Check command line arguments
if "%1"=="" goto :usage
if "%1"=="help" goto :usage
if "%1"=="--help" goto :usage
if "%1"=="/?" goto :usage

REM Main command routing
if "%1"=="create" goto :create_user
if "%1"=="delete" goto :delete_user
if "%1"=="enable" goto :enable_user
if "%1"=="disable" goto :disable_user
if "%1"=="list" goto :list_users
if "%1"=="info" goto :user_info
if "%1"=="reset" goto :reset_user
if "%1"=="cleanup" goto :cleanup_users
if "%1"=="backup" goto :backup_users
goto :usage

:usage
echo.
echo VPN User Management Script
echo ==========================
echo.
echo Usage: %0 ^<command^> [arguments]
echo.
echo Commands:
echo   create ^<username^> ^<password^>    - Create a new VPN user
echo   delete ^<username^>                 - Delete a VPN user
echo   enable ^<username^>                 - Enable a VPN user
echo   disable ^<username^>                - Disable a VPN user
echo   list                               - List all VPN users
echo   info ^<username^>                   - Show user information
echo   reset ^<username^> ^<password^>      - Reset user password
echo   cleanup                            - Remove inactive users
echo   backup                             - Backup user configurations
echo   help                               - Show this help message
echo.
echo Examples:
echo   %0 create john MyPassword123
echo   %0 delete john
echo   %0 list
echo   %0 info john
echo.
goto :end

:create_user
if "%2"=="" (
    echo ERROR: Username is required
    goto :usage
)
if "%3"=="" (
    echo ERROR: Password is required
    goto :usage
)

set USERNAME=%2
set PASSWORD=%3

echo Creating VPN user: %USERNAME%
echo %LOG_TIMESTAMP% - Creating user: %USERNAME% >> "%LOG_FILE%"

REM Validate username
echo %USERNAME% | findstr /R /C:"^[a-zA-Z0-9_][a-zA-Z0-9_]*$" >nul
if %errorlevel% neq 0 (
    echo ERROR: Invalid username. Use only letters, numbers, and underscores.
    echo %LOG_TIMESTAMP% - ERROR: Invalid username: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Check if user already exists
net user "%USERNAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo ERROR: User '%USERNAME%' already exists
    echo %LOG_TIMESTAMP% - ERROR: User already exists: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Create Windows user
echo Creating Windows user account...
net user "%USERNAME%" "%PASSWORD%" /add /comment:"VPN User created by VPN Bot" /expires:never /passwordchg:no
if %errorlevel% neq 0 (
    echo ERROR: Failed to create Windows user
    echo %LOG_TIMESTAMP% - ERROR: Failed to create Windows user: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Create VPN Users group if it doesn't exist
net localgroup "%VPN_GROUP%" >nul 2>&1
if %errorlevel% neq 0 (
    echo Creating VPN Users group...
    net localgroup "%VPN_GROUP%" /add /comment:"VPN Users Group"
    if %errorlevel% neq 0 (
        echo WARNING: Failed to create VPN Users group
        echo %LOG_TIMESTAMP% - WARNING: Failed to create VPN group >> "%LOG_FILE%"
    )
)

REM Add user to VPN Users group
echo Adding user to VPN Users group...
net localgroup "%VPN_GROUP%" "%USERNAME%" /add
if %errorlevel% neq 0 (
    echo ERROR: Failed to add user to VPN Users group
    echo %LOG_TIMESTAMP% - ERROR: Failed to add user to VPN group: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Set user rights for VPN access
echo Setting user rights...
ntrights -u "%USERNAME%" +r SeNetworkLogonRight >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Could not set network logon rights (ntrights not available)
    echo %LOG_TIMESTAMP% - WARNING: Could not set network logon rights for: %USERNAME% >> "%LOG_FILE%"
)

REM Deny local logon
ntrights -u "%USERNAME%" +r SeDenyInteractiveLogonRight >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Could not deny local logon rights
    echo %LOG_TIMESTAMP% - WARNING: Could not deny local logon for: %USERNAME% >> "%LOG_FILE%"
)

echo SUCCESS: User '%USERNAME%' created successfully
echo %LOG_TIMESTAMP% - SUCCESS: User created: %USERNAME% >> "%LOG_FILE%"
goto :end

:delete_user
if "%2"=="" (
    echo ERROR: Username is required
    goto :usage
)

set USERNAME=%2

echo Deleting VPN user: %USERNAME%
echo %LOG_TIMESTAMP% - Deleting user: %USERNAME% >> "%LOG_FILE%"

REM Check if user exists
net user "%USERNAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: User '%USERNAME%' does not exist
    echo %LOG_TIMESTAMP% - ERROR: User does not exist: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Remove user from VPN Users group
echo Removing user from VPN Users group...
net localgroup "%VPN_GROUP%" "%USERNAME%" /delete >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Failed to remove user from VPN Users group
    echo %LOG_TIMESTAMP% - WARNING: Failed to remove user from VPN group: %USERNAME% >> "%LOG_FILE%"
)

REM Delete Windows user
echo Deleting Windows user account...
net user "%USERNAME%" /delete
if %errorlevel% neq 0 (
    echo ERROR: Failed to delete Windows user
    echo %LOG_TIMESTAMP% - ERROR: Failed to delete Windows user: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Clean up user configuration files
echo Cleaning up user configuration files...
if exist "%USER_CONFIG_DIR%\%USERNAME%*.ovpn" (
    del "%USER_CONFIG_DIR%\%USERNAME%*.ovpn"
    echo Deleted configuration files for %USERNAME%
)

echo SUCCESS: User '%USERNAME%' deleted successfully
echo %LOG_TIMESTAMP% - SUCCESS: User deleted: %USERNAME% >> "%LOG_FILE%"
goto :end

:enable_user
if "%2"=="" (
    echo ERROR: Username is required
    goto :usage
)

set USERNAME=%2

echo Enabling VPN user: %USERNAME%
echo %LOG_TIMESTAMP% - Enabling user: %USERNAME% >> "%LOG_FILE%"

REM Check if user exists
net user "%USERNAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: User '%USERNAME%' does not exist
    echo %LOG_TIMESTAMP% - ERROR: User does not exist: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Enable user account
net user "%USERNAME%" /active:yes
if %errorlevel% neq 0 (
    echo ERROR: Failed to enable user account
    echo %LOG_TIMESTAMP% - ERROR: Failed to enable user: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

echo SUCCESS: User '%USERNAME%' enabled successfully
echo %LOG_TIMESTAMP% - SUCCESS: User enabled: %USERNAME% >> "%LOG_FILE%"
goto :end

:disable_user
if "%2"=="" (
    echo ERROR: Username is required
    goto :usage
)

set USERNAME=%2

echo Disabling VPN user: %USERNAME%
echo %LOG_TIMESTAMP% - Disabling user: %USERNAME% >> "%LOG_FILE%"

REM Check if user exists
net user "%USERNAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: User '%USERNAME%' does not exist
    echo %LOG_TIMESTAMP% - ERROR: User does not exist: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Disable user account
net user "%USERNAME%" /active:no
if %errorlevel% neq 0 (
    echo ERROR: Failed to disable user account
    echo %LOG_TIMESTAMP% - ERROR: Failed to disable user: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

echo SUCCESS: User '%USERNAME%' disabled successfully
echo %LOG_TIMESTAMP% - SUCCESS: User disabled: %USERNAME% >> "%LOG_FILE%"
goto :end

:list_users
echo.
echo VPN Users List
echo ==============
echo %LOG_TIMESTAMP% - Listing VPN users >> "%LOG_FILE%"

REM Check if VPN Users group exists
net localgroup "%VPN_GROUP%" >nul 2>&1
if %errorlevel% neq 0 (
    echo No VPN Users group found
    echo %LOG_TIMESTAMP% - WARNING: No VPN Users group found >> "%LOG_FILE%"
    goto :end
)

REM List members of VPN Users group
echo Members of '%VPN_GROUP%' group:
echo --------------------------------
net localgroup "%VPN_GROUP%"

echo.
echo Detailed user information:
echo -------------------------
for /f "skip=4 tokens=*" %%A in ('net localgroup "%VPN_GROUP%"') do (
    set "LINE=%%A"
    if "!LINE!"=="The command completed successfully." goto :list_complete
    if "!LINE:~0,1!" neq " " (
        if "!LINE!" neq "" (
            echo.
            echo User: !LINE!
            net user "!LINE!" | findstr /C:"Account active" /C:"Password expires" /C:"Last logon"
        )
    )
)

:list_complete
echo.
echo %LOG_TIMESTAMP% - VPN users list completed >> "%LOG_FILE%"
goto :end

:user_info
if "%2"=="" (
    echo ERROR: Username is required
    goto :usage
)

set USERNAME=%2

echo.
echo User Information for: %USERNAME%
echo ================================
echo %LOG_TIMESTAMP% - Getting user info: %USERNAME% >> "%LOG_FILE%"

REM Check if user exists
net user "%USERNAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: User '%USERNAME%' does not exist
    echo %LOG_TIMESTAMP% - ERROR: User does not exist: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Show user information
net user "%USERNAME%"

echo.
echo Group membership:
echo ----------------
net user "%USERNAME%" | findstr /C:"Local Group Memberships"
net user "%USERNAME%" | findstr /C:"Global Group memberships"

echo.
echo Configuration files:
echo -------------------
if exist "%USER_CONFIG_DIR%\%USERNAME%*.ovpn" (
    dir "%USER_CONFIG_DIR%\%USERNAME%*.ovpn" /b
) else (
    echo No configuration files found
)

echo.
echo %LOG_TIMESTAMP% - User info completed for: %USERNAME% >> "%LOG_FILE%"
goto :end

:reset_user
if "%2"=="" (
    echo ERROR: Username is required
    goto :usage
)
if "%3"=="" (
    echo ERROR: New password is required
    goto :usage
)

set USERNAME=%2
set PASSWORD=%3

echo Resetting password for VPN user: %USERNAME%
echo %LOG_TIMESTAMP% - Resetting password for user: %USERNAME% >> "%LOG_FILE%"

REM Check if user exists
net user "%USERNAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: User '%USERNAME%' does not exist
    echo %LOG_TIMESTAMP% - ERROR: User does not exist: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

REM Reset password
net user "%USERNAME%" "%PASSWORD%"
if %errorlevel% neq 0 (
    echo ERROR: Failed to reset password
    echo %LOG_TIMESTAMP% - ERROR: Failed to reset password for: %USERNAME% >> "%LOG_FILE%"
    goto :end
)

echo SUCCESS: Password reset for user '%USERNAME%'
echo %LOG_TIMESTAMP% - SUCCESS: Password reset for user: %USERNAME% >> "%LOG_FILE%"
goto :end

:cleanup_users
echo.
echo Cleaning up inactive VPN users
echo ==============================
echo %LOG_TIMESTAMP% - Starting user cleanup >> "%LOG_FILE%"

REM This would typically involve checking for users who haven't logged in
REM for a specified period, but for this example, we'll just show disabled users

echo Checking for disabled users in VPN Users group...
for /f "skip=4 tokens=*" %%A in ('net localgroup "%VPN_GROUP%" 2^>nul') do (
    set "LINE=%%A"
    if "!LINE!"=="The command completed successfully." goto :cleanup_complete
    if "!LINE:~0,1!" neq " " (
        if "!LINE!" neq "" (
            net user "!LINE!" | findstr /C:"Account active.*No" >nul
            if !errorlevel! equ 0 (
                echo Found disabled user: !LINE!
                echo %LOG_TIMESTAMP% - Found disabled user: !LINE! >> "%LOG_FILE%"
            )
        )
    )
)

:cleanup_complete
echo.
echo Cleanup scan completed
echo %LOG_TIMESTAMP% - User cleanup completed >> "%LOG_FILE%"
goto :end

:backup_users
echo.
echo Backing up VPN user configurations
echo ==================================
echo %LOG_TIMESTAMP% - Starting user backup >> "%LOG_FILE%"

set BACKUP_DIR=C:\VPN\backups
set BACKUP_FILE=%BACKUP_DIR%\vpn_users_backup_%DATE:~-4,4%%DATE:~-10,2%%DATE:~-7,2%.txt

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo Creating backup file: %BACKUP_FILE%
echo VPN Users Backup - %DATE% %TIME% > "%BACKUP_FILE%"
echo ================================= >> "%BACKUP_FILE%"
echo. >> "%BACKUP_FILE%"

REM Backup user list
echo VPN Users Group Members: >> "%BACKUP_FILE%"
net localgroup "%VPN_GROUP%" >> "%BACKUP_FILE%" 2>&1
echo. >> "%BACKUP_FILE%"

REM Backup detailed user information
echo Detailed User Information: >> "%BACKUP_FILE%"
echo -------------------------- >> "%BACKUP_FILE%"
for /f "skip=4 tokens=*" %%A in ('net localgroup "%VPN_GROUP%" 2^>nul') do (
    set "LINE=%%A"
    if "!LINE!"=="The command completed successfully." goto :backup_complete
    if "!LINE:~0,1!" neq " " (
        if "!LINE!" neq "" (
            echo. >> "%BACKUP_FILE%"
            echo User: !LINE! >> "%BACKUP_FILE%"
            net user "!LINE!" >> "%BACKUP_FILE%" 2>&1
        )
    )
)

:backup_complete
echo. >> "%BACKUP_FILE%"
echo Backup completed: %DATE% %TIME% >> "%BACKUP_FILE%"

echo SUCCESS: Backup created at %BACKUP_FILE%
echo %LOG_TIMESTAMP% - User backup completed: %BACKUP_FILE% >> "%LOG_FILE%"
goto :end

:end
endlocal
