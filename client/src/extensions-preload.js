const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('BranaExtensions', Object.freeze({
  list: () => ipcRenderer.invoke('browser:extensions:list'),
  install: packed => ipcRenderer.invoke('browser:extensions:install', packed === true),
  change: (key, action) => ipcRenderer.invoke('browser:extensions:change', key, action),
  page: (key, kind) => ipcRenderer.invoke('browser:extensions:page', key, kind),
  activate: key => ipcRenderer.invoke('browser:extensions:managerActivate',key),
}));
