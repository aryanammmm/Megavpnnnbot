@echo off
REM OpenVPN Status Check Script for Windows Server 2022
REM This script checks the status of OpenVPN service and connected clients

setlocal enabledelayedexpansion

REM Set variables
set OPENVPN_SERVICE=OpenVPN
set OPENVPN_LOG_DIR=C:\Program Files\OpenVPN\log
set STATUS_LOG=%OPENVPN_LOG_DIR%\status.log
set TEMP_FILE=%TEMP%\openvpn_status_temp.txt

echo ================================
echo OpenVPN Status Report
echo ================================
echo Generated: %DATE% %TIME%
echo.

REM Check if OpenVPN service exists
sc query "%OPENVPN_SERVICE%" >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: OpenVPN service not found!
    echo Please ensure OpenVPN is installed and configured properly.
    exit /b 1
)

REM Check service status
echo [1] Service Status:
echo ==================
sc query "%OPENVPN_SERVICE%" | findstr "STATE"
if %errorlevel% equ 0 (
    sc query "%OPENVPN_SERVICE%" | findstr "RUNNING" >nul
    if !errorlevel! equ 0 (
        echo Service is RUNNING
        set SERVICE_RUNNING=1
    ) else (
        echo Service is STOPPED or in another state
        set SERVICE_RUNNING=0
    )
) else (
    echo Failed to query service status
    set SERVICE_RUNNING=0
)

echo.

REM Check if status log exists
echo [2] Status Log Analysis:
echo =======================
if exist "%STATUS_LOG%" (
    echo Status log found: %STATUS_LOG%
    echo Last modified: 
    for %%F in ("%STATUS_LOG%") do echo   %%~tF
    echo.
    
    REM Parse status log for connected clients
    echo [3] Connected Clients:
    echo =====================
    
    REM Extract client list from status log
    findstr /C:"Common Name,Real Address,Bytes Received,Bytes Sent,Connected Since" "%STATUS_LOG%" >nul 2>&1
    if !errorlevel! equ 0 (
        echo Client List Header Found
        
        REM Create temporary file with client data
        type "%STATUS_LOG%" | findstr /V /C:"OpenVPN" | findstr /V /C:"TITLE" | findstr /V /C:"TIME" | findstr /V /C:"HEADER" > "%TEMP_FILE%"
        
        REM Look for client connections
        set CLIENT_COUNT=0
        for /f "tokens=*" %%A in ('type "%STATUS_LOG%" ^| findstr /C:","') do (
            set LINE=%%A
            REM Skip header lines and routing table
            echo !LINE! | findstr /C:"Common Name" >nul
            if !errorlevel! neq 0 (
                echo !LINE! | findstr /C:"Virtual Address" >nul
                if !errorlevel! neq 0 (
                    echo !LINE! | findstr /C:"ROUTING TABLE" >nul
                    if !errorlevel! neq 0 (
                        echo !LINE! | findstr /C:"GLOBAL STATS" >nul
                        if !errorlevel! neq 0 (
                            echo !LINE! | findstr /C:"END" >nul
                            if !errorlevel! neq 0 (
                                REM This should be a client line
                                if "!LINE!" neq "" (
                                    echo Client: !LINE!
                                    set /a CLIENT_COUNT+=1
                                )
                            )
                        )
                    )
                )
            )
        )
        
        echo.
        echo Total Connected Clients: !CLIENT_COUNT!
        
    ) else (
        echo No client data found in status log
        echo Status log may be empty or corrupted
    )
    
    echo.
    echo [4] Recent Log Entries:
    echo ======================
    REM Show last 10 lines of status log
    if exist "%TEMP_FILE%" del "%TEMP_FILE%"
    more /e +0 "%STATUS_LOG%" | findstr /N ".*" | sort /r | head -n 10
    
) else (
    echo Status log not found: %STATUS_LOG%
    echo This may indicate:
    echo - OpenVPN is not running
    echo - Status logging is not configured
    echo - Different log file location
)

echo.

REM Check OpenVPN processes
echo [5] OpenVPN Processes:
echo =====================
tasklist /FI "IMAGENAME eq openvpn.exe" /FO TABLE
if %errorlevel% neq 0 (
    echo No OpenVPN processes found
) else (
    echo OpenVPN process is running
)

echo.

REM Check network interfaces
echo [6] Network Interfaces:
echo ======================
echo Checking for TUN/TAP interfaces...
ipconfig | findstr /C:"Ethernet adapter" | findstr /C:"TAP"
if %errorlevel% equ 0 (
    echo TAP adapter found
) else (
    echo No TAP adapter found
)

echo.

REM Check listening ports
echo [7] Listening Ports:
echo ===================
echo Checking for OpenVPN ports...
netstat -an | findstr ":1194"
if %errorlevel% equ 0 (
    echo OpenVPN port 1194 is listening
) else (
    echo OpenVPN port 1194 is not listening
)

echo.

REM Performance metrics
echo [8] Performance Metrics:
echo =======================
echo Memory usage for OpenVPN processes:
for /f "tokens=2" %%A in ('tasklist /FI "IMAGENAME eq openvpn.exe" /FO CSV ^| findstr /V "Image Name"') do (
    echo Process: %%A
    wmic process where "name='openvpn.exe'" get ProcessId,PageFileUsage,WorkingSetSize /format:table
)

echo.

REM Check certificate validity (if accessible)
echo [9] Certificate Information:
echo ===========================
set CERT_DIR=C:\Program Files\OpenVPN\config
if exist "%CERT_DIR%" (
    echo Certificate directory: %CERT_DIR%
    dir /b "%CERT_DIR%\*.crt" 2>nul
    if !errorlevel! equ 0 (
        echo Certificate files found
    ) else (
        echo No certificate files found
    )
) else (
    echo Certificate directory not found
)

echo.

REM System information
echo [10] System Information:
echo =======================
echo Server: %COMPUTERNAME%
echo Domain: %USERDOMAIN%
echo User: %USERNAME%
echo IP Configuration:
ipconfig | findstr /C:"IPv4 Address"

echo.

REM Final summary
echo [11] Summary:
echo ============
if %SERVICE_RUNNING% equ 1 (
    echo ✓ OpenVPN service is running
) else (
    echo ✗ OpenVPN service is not running
)

if exist "%STATUS_LOG%" (
    echo ✓ Status log is available
) else (
    echo ✗ Status log is missing
)

tasklist /FI "IMAGENAME eq openvpn.exe" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ OpenVPN process is active
) else (
    echo ✗ OpenVPN process not found
)

echo.
echo ================================
echo Status check completed
echo ================================

REM Clean up
if exist "%TEMP_FILE%" del "%TEMP_FILE%"

endlocal
