const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: 'desktop',
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfiles: (list) => ipcRenderer.invoke('profiles:save', list),
  load: (profileId, name) => ipcRenderer.invoke('data:load', profileId, name),
  save: (profileId, name, value) => ipcRenderer.invoke('data:save', profileId, name, value),
  lookup: (word, lang) => ipcRenderer.invoke('dict:lookup', word, lang),
  wikipedia: (query, lang) => ipcRenderer.invoke('dict:wikipedia', query, lang),
  translate: (text, lang) => ipcRenderer.invoke('dict:translate', text, lang),
  inflection: (word, lang) => ipcRenderer.invoke('dict:inflection', word, lang),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  ankiConnect: (body) => ipcRenderer.invoke('anki:connect', body),
  openAnkiPackage: (bytes, name) => ipcRenderer.invoke('anki:open-package', bytes, name),});
