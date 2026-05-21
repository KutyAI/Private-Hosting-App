@echo off
setlocal enabledelayedexpansion

echo =========================================================
echo  🎮 MC Hosting - Automated Monorepo Setup Wizard
echo =========================================================
echo.

:: Step 1: Check Node.js installation
echo [1/3] Checking Node.js environment...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is NOT installed!
    echo Please download and install Node.js v18 or higher from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Found Node.js version: %NODE_VERSION%
echo.

:: Step 2: Install workspace dependencies
echo [2/3] Installing monorepo dependencies (npm install)...
echo This may take a moment. Please wait...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Installation failed! Please check your internet connection.
    pause
    exit /b 1
)
echo [OK] Monorepo dependencies successfully installed.
echo.

:: Step 3: Copy Environment Configurations
echo [3/3] Setting up local environment configurations (.env)...

:: backend-api env
if not exist "apps\backend-api\.env" (
    echo [OK] copying apps/backend-api/.env.example to .env
    copy "apps\backend-api\.env.example" "apps\backend-api\.env" >nul
) else (
    echo [INFO] apps/backend-api/.env already exists, skipping.
)

:: desktop-ui env
if not exist "apps\desktop-ui\.env" (
    echo [OK] copying apps/desktop-ui/.env.example to .env
    copy "apps\desktop-ui/.env.example" "apps\desktop-ui\.env" >nul
) else (
    echo [INFO] apps/desktop-ui/.env already exists, skipping.
)

:: host-agent env
if not exist "apps\host-agent\.env" (
    echo [OK] copying apps/host-agent/.env.example to .env
    copy "apps\host-agent\.env.example" "apps\host-agent\.env" >nul
) else (
    echo [INFO] apps/host-agent/.env already exists, skipping.
)

echo.
echo =========================================================
echo  🎉 Monorepo Setup Completed Successfully!
echo =========================================================
echo.
echo  [Preserves: Zero-Config Client Preset]
echo   The desktop UI has been provisioned with pre-baked default cloud credentials.
echo   This enables instant out-of-the-box user registration and login.
echo.
echo  [🌐 Setting Up Custom Auth (Google / GitHub OAuth)]
echo   To self-host the Supabase database or configure custom OAuth credentials,
echo   please follow our step-by-step setup guide at:
echo      ==^> docs\SUPABASE_SETUP.md
echo.
echo  [⚙️ Dynamic App Connections]
echo   Advanced developers can dynamically override API URLs and keys directly
echo   inside the desktop app's "App Connections" Settings tab at runtime.
echo.
echo ---------------------------------------------------------
echo You are now ready to run the MC Hosting development suite.
echo.
echo Simply double-click:
echo    ==^> start.bat
echo or run the command below in your terminal:
echo    ==^> npm run dev
echo.
pause
