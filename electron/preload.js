const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: 'desktop',
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfiles: (list) => ipcRenderer.invoke('profiles:save', list),
  load: (profileId, name) => ipcRenderer.invoke('data:load', profileId, name),
  save: (profileId, name, value) => ipcRenderer.invoke('data:save', profileId, name, value),
  lookup: (word) => ipcRenderer.invoke('dict:lookup', word),
  wikipedia: (query, lang) => ipcRenderer.invoke('dict:wikipedia', query, lang),
  translate: (text, keys) => ipcRenderer.invoke('dict:translate', text, keys),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),});
