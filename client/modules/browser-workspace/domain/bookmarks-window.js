'use strict';
const path=require('node:path');
const {managerActor}=require('./extensions-window');
const {norm}=require('../ui/webbar');
const {loadIcon,validIcon}=require('./bookmark-icon');
const {nativeImage}=require('electron');
function setupBookmarks({BrowserWindow,ipcMain,store,accountFor,navigate,screen}){
 const file=path.join(__dirname,'../ui/bookmarks.html'),windows=new Map();
 const actor=e=>managerActor(e,windows,file,accountFor);
 const browserActor=event=>{const wc=event.sender;if(!wc||wc.isDestroyed()||event.senderFrame!==wc.mainFrame||!accountFor(wc)||!wc.__navigate||!norm(wc.getURL()))throw Error('只能从账号浏览器窗口操作书签');return wc;};
 const iconFor=(owner,url)=>loadIcon(owner.session,url,owner.__bookmarkFavicons?.page===url?owner.__bookmarkFavicons.urls:[],nativeImage);
 ipcMain.handle('browser:bookmarks:pinned',async event=>{browserActor(event);const rows=await store.list();browserActor(event);return rows.filter(r=>r.pinned===true).map(r=>({id:r.id,title:r.title,icon:validIcon(r.icon)?r.icon:''}));});
 ipcMain.handle('browser:bookmarks:visit',async(event,id)=>{const owner=browserActor(event),row=(await store.list()).find(r=>r.id===id&&r.pinned===true);if(!row)throw Error('书签已取消固定或移除');browserActor(event);return navigate(owner,row.url);});
 const state=async entry=>({entries:await store.list(),current:entry.current});
 ipcMain.handle('browser:bookmarks:open',event=>{
  const owner=event.sender;
  if(owner.isDestroyed()||event.senderFrame!==owner.mainFrame||!accountFor(owner)||!owner.__navigate||!norm(owner.getURL()))throw Error('只能从账号浏览器窗口打开书签');
  const existing=[...windows.values()].find(e=>e.owner===owner);if(existing){existing.window.show();existing.window.focus();return true;}
  const parent=BrowserWindow.fromWebContents(owner),bounds=parent.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
  const width=Math.min(420,area.width),height=Math.min(520,area.height);
  const w=new BrowserWindow({parent,width,height,x:Math.max(area.x,Math.min(bounds.x+100,area.x+area.width-width)),y:Math.max(area.y,Math.min(bounds.y+42,area.y+area.height-height)),frame:false,resizable:false,show:false,skipTaskbar:true,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'bookmarks-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'bookmarks-manager-'+owner.id}});
  const entry={owner,window:w,current:{url:owner.getURL(),title:owner.getTitle()||new URL(owner.getURL()).hostname}};const windowId=w.webContents.id;windows.set(windowId,entry);
  const close=()=>{if(!w.isDestroyed())w.close();};
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());w.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
  owner.once('destroyed',close);const navigating=(_e,_url,inPlace,isMain)=>{if(isMain&&!inPlace)close();};owner.on('did-start-navigation',navigating);
  w.on('blur',close);w.on('closed',()=>{windows.delete(windowId);owner.removeListener('destroyed',close);owner.removeListener('did-start-navigation',navigating);});
  w.once('ready-to-show',()=>{if(!w.isDestroyed()){w.show();w.focus();}});void w.loadFile(file).catch(close);return true;
 });
 ipcMain.handle('bookmarks:list',e=>state(actor(e)));
 ipcMain.handle('bookmarks:add',async(e,title)=>{const entry=actor(e);const icon=await iconFor(entry.owner,entry.current.url);actor(e);await store.add(entry.current.url,title,icon);return state(actor(e));});
 ipcMain.handle('bookmarks:pin',async(e,id,pinned)=>{const entry=actor(e);if(typeof pinned!=='boolean')throw Error('固定状态无效');const row=(await store.list()).find(r=>r.id===id);if(!row)throw Error('书签已移除');const icon=pinned&&!validIcon(row.icon)?await iconFor(entry.owner,row.url):'';actor(e);await store.pin(id,pinned,icon);return state(actor(e));});
 ipcMain.handle('bookmarks:remove',async(e,id)=>{const entry=actor(e);await store.remove(id);return state(actor(e));});
 ipcMain.handle('bookmarks:visit',async(e,id)=>{const entry=actor(e),row=(await store.list()).find(x=>x.id===id);if(!row)throw Error('书签已移除');actor(e);entry.window.close();return navigate(entry.owner,row.url);});
 ipcMain.handle('bookmarks:close',e=>{actor(e).window.close();return true;});
}
module.exports={setupBookmarks};
