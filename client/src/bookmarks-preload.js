'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('BranaBookmarks',Object.freeze({pin:(id,pinned)=>ipcRenderer.invoke('bookmarks:pin',id,pinned),list:()=>ipcRenderer.invoke('bookmarks:list'),add:title=>ipcRenderer.invoke('bookmarks:add',title),remove:id=>ipcRenderer.invoke('bookmarks:remove',id),visit:id=>ipcRenderer.invoke('bookmarks:visit',id),close:()=>ipcRenderer.invoke('bookmarks:close')}));
