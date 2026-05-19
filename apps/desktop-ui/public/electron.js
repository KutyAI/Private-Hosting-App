const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let agentProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#ffffff',
    },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: '#0f0f23',
  });

  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build', 'index.html'));
  }
}

function startAgent() {
  const agentPath = path.join(__dirname, '..', '..', 'host-agent', 'dist', 'index.js');
  try {
    agentProcess = spawn('node', [agentPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, IPC_PORT: '9876' },
    });

    agentProcess.stdout.on('data', (data) => {
      console.log(`[Agent] ${data.toString().trim()}`);
    });

    agentProcess.stderr.on('data', (data) => {
      console.error(`[Agent Error] ${data.toString().trim()}`);
    });

    agentProcess.on('close', (code) => {
      console.log(`[Agent] Process exited with code ${code}`);
    });
  } catch (err) {
    console.error('Failed to start agent:', err);
  }
}

app.whenReady().then(() => {
  startAgent();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (agentProcess) {
    agentProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (agentProcess) {
    agentProcess.kill();
  }
});

ipcMain.handle('get-agent-port', () => 9876);
