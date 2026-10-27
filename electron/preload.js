const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: 'desktop',
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfiles: (list) => ipcRenderer.invoke('profiles:save', list),
  load: (profileId, name) => ipcRenderer.invoke('data:load', profileId, name),
  save: (profileId, name, value) => ipcRenderer.invoke('data:save', profileId, name, value),
  lookup: (word) => ipcRenderer.invoke('dict:lookup', word),
  wikipedia: (query, lang) => ipcRenderer.invoke('dict:wikipedia', query, lang),
  translate: (text) => ipcRenderer.invoke('dict:translate', text),
  inflection: (word) => ipcRenderer.invoke('dict:inflection', word),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  ankiConnect: (body) => ipcRenderer.invoke('anki:connect', body),
  openAnkiPackage: (bytes, name) => ipcRenderer.invoke('anki:open-package', bytes, name),});
