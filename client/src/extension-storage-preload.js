'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('BranaStorageMirror',{changed:changes=>ipcRenderer.send('extension-storage:changed',changes)});
