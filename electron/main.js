const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const store = require('./store');
const dictionary = require('./dictionary');

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: 'Lesen',
    backgroundColor: '#f6f4ef',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // Links never open inside the app; they go to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

ipcMain.handle('profiles:list', () => store.listProfiles());
ipcMain.handle('profiles:save', (_e, list) => store.saveProfiles(list));
ipcMain.handle('data:load', (_e, profileId, name) => store.load(profileId, name));
ipcMain.handle('data:save', (_e, profileId, name, value) => store.save(profileId, name, value));
ipcMain.handle('dict:lookup', (_e, word) => dictionary.lookup(word));
ipcMain.handle('dict:wikipedia', (_e, query, lang) => dictionary.wikipedia(query, lang));
ipcMain.handle('dict:translate', (_e, text, keys) => dictionary.translate(text, keys));
ipcMain.handle('open-external', (_e, url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

// The only embedded page allowed is Google Translate (shown inside the word panel).
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (!params.src.startsWith('https://translate.google.com/')) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

app.whenReady().then(createWindow);
app.on('before-quit', () => {
  store.flush();
  dictionary.flush();
});
app.on('window-all-closed', () => app.quit());
