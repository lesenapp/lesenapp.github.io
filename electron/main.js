const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const fs = require('fs');
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
ipcMain.handle('dict:lookup', (_e, word, lang) => dictionary.lookup(word, lang));
ipcMain.handle('dict:wikipedia', (_e, query, lang) => dictionary.wikipedia(query, lang));
ipcMain.handle('dict:translate', (_e, text, lang) => dictionary.translate(text, lang));
ipcMain.handle('dict:inflection', (_e, word, lang) => dictionary.inflection(word, lang));
// Anki: AnkiConnect add-on on localhost, or open an .apkg with the installed Anki.
ipcMain.handle('anki:connect', async (_e, body) => {
  try {
    const res = await net.fetch('http://127.0.0.1:8765', { method: 'POST', body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return { result: null, error: 'Anki is not running or AnkiConnect is not installed' };
  }
});
ipcMain.handle('anki:open-package', async (_e, bytes, name) => {
  const file = path.join(app.getPath('temp'), path.basename(String(name)).replace(/[^\w .-]/g, '_'));
  fs.writeFileSync(file, Buffer.from(bytes));
  const error = await shell.openPath(file);
  if (error) throw new Error(error);
});

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
    const allowed = ['https://translate.google.com/', 'https://dictionary.cambridge.org/'];
    if (!allowed.some((origin) => params.src.startsWith(origin))) event.preventDefault();
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
