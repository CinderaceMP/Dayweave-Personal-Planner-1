const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const appRoot = __dirname;
const builtAppPath = path.join(appRoot, 'app-dist', 'public', 'index.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    title: 'Dayweave',
    backgroundColor: '#f56a00',
    webPreferences: {
      preload: path.join(appRoot, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);

  if (fs.existsSync(builtAppPath)) {
    const fileUrl = `file://${builtAppPath}`;
    win.loadURL(fileUrl);
  } else {
    const fallbackUrl = 'http://localhost:4173';
    win.loadURL(fallbackUrl);
    console.warn('Built app assets not found, falling back to local preview server at', fallbackUrl);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
