@echo off
echo ========================================
echo MC Hosting - Build Installer
echo ========================================
echo.

echo [1/5] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    exit /b 1
)
echo.

echo [2/5] Building shared types...
call npm run build -w packages/shared-types
if errorlevel 1 (
    echo ERROR: shared-types build failed
    exit /b 1
)
echo.

echo [3/5] Building backend API...
call npm run build -w apps/backend-api
if errorlevel 1 (
    echo ERROR: backend-api build failed
    exit /b 1
)
echo.

echo [4/5] Building host agent...
call npm run build -w apps/host-agent
if errorlevel 1 (
    echo ERROR: host-agent build failed
    exit /b 1
)
echo.

echo [4.5/5] Packaging host agent as Tauri sidecar...
if not exist "apps\desktop-ui\src-tauri\bin" (
    mkdir "apps\desktop-ui\src-tauri\bin"
)
call npm run pkg -w apps/host-agent
if errorlevel 1 (
    echo ERROR: host-agent pkg failed
    exit /b 1
)
copy "apps\host-agent\bin\host-agent-x86_64-pc-windows-msvc.exe" "apps\desktop-ui\src-tauri\bin\host-agent-x86_64-pc-windows-msvc.exe" /Y
if errorlevel 1 (
    echo ERROR: copying host-agent sidecar failed
    exit /b 1
)
echo.

echo [5/5] Building Tauri desktop app...
call npm run tauri:build -w apps/desktop-ui
if errorlevel 1 (
    echo ERROR: Tauri build failed
    exit /b 1
)
echo.

echo ========================================
echo Build complete!
echo Installer location: apps/desktop-ui/src-tauri/target/release/bundle/nsis/
echo ========================================
