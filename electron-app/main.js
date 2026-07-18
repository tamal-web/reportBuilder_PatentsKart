const { app, BrowserWindow, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const treeKill = require('tree-kill');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);

let mainWindow = null;
let backendProcess = null;
let isShuttingDown = false;

const BACKEND_PORT = 8000;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// Poll until backend is ready
async function waitForBackend(maxAttempts = 120, intervalMs = 500) {
  console.log('[Startup] Polling Backend server...');
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (isShuttingDown) return false;
    if (backendProcess === null) {
      console.error('[Startup] Backend process died before it became ready.');
      return false;
    }
    
    try {
      const isReady = await new Promise((resolve) => {
        const req = http.get(BACKEND_URL, { timeout: 1000 }, (res) => {
          res.resume(); // consume response body
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });

      if (isReady) {
        console.log('[Startup] Backend is responsive!');
        return true;
      }
    } catch (e) {
      // ignore
    }
    
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function startBackend() {
  const exePath = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'backend.exe')
    : path.join(__dirname, '..', 'ai', 'dist', 'backend', 'backend');

  console.log(`[Backend] Spawning backend from: ${exePath}`);
  
  let resolvedExePath = exePath;
  if (!fs.existsSync(exePath) && fs.existsSync(exePath.replace('.exe', ''))) {
    console.warn(`[Backend] .exe not found, falling back to unix executable...`);
    resolvedExePath = exePath.replace('.exe', '');
  }

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'reports.db').replace(/\\/g, '/');

  backendProcess = spawn(resolvedExePath, [], {
    cwd: path.dirname(exePath),
    env: { 
      ...process.env, 
      PORT: String(BACKEND_PORT),
      HOST: '127.0.0.1',
      DATABASE_URL: `sqlite:///${dbPath}`,
      CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000,app://-',
      ACTIVE_MODEL_JSON: path.join(userDataPath, '_active_model.json'),
      ACTIVE_MODEL_FILE: path.join(userDataPath, '_active_model.txt'),
      REPORT_LOGO_FILE: path.join(userDataPath, '_active_logo.txt'),
      CHROMA_PERSIST_DIR: path.join(userDataPath, 'chroma_store'),
      EXPORTS_DIR: path.join(userDataPath, 'exports')
    },
    windowsHide: true,
    stdio: 'pipe'
  });

  if (backendProcess.stdout) {
    backendProcess.stdout.on('data', (d) => console.log(`[Backend STDOUT] ${d.toString().trim()}`));
    backendProcess.stderr.on('data', (d) => console.error(`[Backend STDERR] ${d.toString().trim()}`));
  }

  backendProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      console.error(`[Backend] Process exited unexpectedly (code: ${code}, signal: ${signal})`);
      backendProcess = null;
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'PatentsKart Prior-Art Report Builder',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL('app://-/index.html');

  // mainWindow.webContents.openDevTools(); // Uncomment for debugging

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  protocol.handle('app', (request) => {
    let url = request.url.slice('app://-'.length);
    if (!url || url === '/') url = '/index.html';
    // Remove query params
    url = url.split('?')[0].split('#')[0];
    
    let filePath = app.isPackaged
      ? path.join(__dirname, 'out', url)
      : path.join(__dirname, '..', 'rbone', 'out', url);
      
    if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
        filePath += '.html';
    }
    return net.fetch('file://' + filePath);
  });

  startBackend();

  const isReady = await waitForBackend();
  if (isReady) {
    createMainWindow();
  } else {
    console.error('[Startup] Timed out waiting for backend to start!');
    dialog.showErrorBox(
      'Startup Error',
      'Could not start the backend server in time. Please check your system logs.'
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !isShuttingDown) {
      createMainWindow();
    }
  });
});

async function handleShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('[App] Shutting down...');
  
  if (backendProcess && backendProcess.pid) {
    console.log(`[App] Terminating backend tree (PID: ${backendProcess.pid})`);
    await new Promise((resolve) => {
      treeKill(backendProcess.pid, 'SIGTERM', (err) => {
        if (err) {
          console.warn('[App] tree-kill error:', err);
        }
        resolve();
      });
    });
  }
}

app.on('before-quit', (e) => {
  if (!isShuttingDown) {
    e.preventDefault();
    handleShutdown().then(() => app.quit());
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
