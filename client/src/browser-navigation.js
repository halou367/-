'use strict';
const {norm}=require('../ui/webbar');
function arenaURL(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='arena.ai'||u.hostname.endsWith('.arena.ai'));}catch{return false;}}
function createReturnTargets(){const targets=new Map();return {remember(id,url){const safe=norm(url);if(safe)targets.set(id,safe);else targets.delete(id);},previous:id=>{const url=targets.get(id);return url&&!arenaURL(url)?url:'';}};}
function setupBrowserNavigation({BrowserWindow,ipcMain,dialog,preload,offline,clientURL,arena,owners,accountFor,navigate,isApplying}){
 const targets=createReturnTargets();
 const browser=event=>{const wc=event.sender,a=accountFor(wc);if(!a||wc.isDestroyed()||!wc.__navigate||event.senderFrame!==wc.mainFrame||(!norm(wc.getURL())&&!wc.getURL().startsWith('chrome-extension://')))throw Error('只能从当前账号浏览器主窗口操作');return {wc,a};};
 ipcMain.handle('browser:return-client',event=>{const {wc,a}=browser(event);targets.remember(a.id,wc.getURL());void navigate(wc,clientURL);return true;});
 ipcMain.handle('host:browserMode',async(event,url)=>{
  const {wc,a}=browser(event);const source=new URL(wc.getURL());if(source.origin!=='https://arena.ai'||(source.pathname!=='/robots.txt'&&!wc.__clientShell))throw Error('只能从客户端切换浏览器模式');
  const last=targets.previous(a.id),fallback=arenaURL(url)&&!String(url).startsWith(clientURL)?url:arena;let target=fallback;
  if(last){const result=await dialog.showMessageBox(BrowserWindow.fromWebContents(wc),{type:'question',title:'返回浏览器',message:'上一次从非 Arena 页面离开，要返回哪里？',detail:new URL(last).hostname,buttons:['上一次','Arena','取消'],defaultId:0,cancelId:2,noLink:true});if(result.response===2)return {cancelled:true};target=result.response===0?last:fallback;}
  if(wc.isDestroyed()||accountFor(wc)!==a||wc.getURL()!==source.href)return false;void navigate(wc,target);return true;
 });
 ipcMain.handle('browser:route-open',event=>{
  const {wc:owner,a}=browser(event),existing=[...owners.values()].find(x=>x.owner===owner);
  if(existing){existing.window.show();existing.window.focus();return true;}
  const w=new BrowserWindow({parent:BrowserWindow.fromWebContents(owner),width:660,height:740,minWidth:560,minHeight:480,title:'切换节点',autoHideMenuBar:true,webPreferences:{preload,contextIsolation:true,sandbox:true,nodeIntegration:false,partition:'browser-route-'+owner.id}});
  const child=w.webContents,entry={owner,window:w,target:owner.getURL()};owners.set(child,entry);child.__retryTarget={get:()=>entry.target};
  child.setWindowOpenHandler(()=>({action:'deny'}));child.on('will-navigate',e=>e.preventDefault());child.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
  const close=()=>{if(!w.isDestroyed())w.close();};const navigating=(_e,_url,inPlace,isMain)=>{if(isMain&&!inPlace&&!isApplying(a.id))close();};owner.once('destroyed',close);owner.on('did-start-navigation',navigating);
  w.on('closed',()=>{owners.delete(child);owner.removeListener('destroyed',close);owner.removeListener('did-start-navigation',navigating);});void w.loadFile(offline,{query:{desc:'修改代理',browser:'1'}}).catch(close);return true;
 });
 return {targets,finish(wc){const entry=owners.get(wc);if(!entry)return false;const {owner,target,window}=entry;if(!window.isDestroyed())window.close();void navigate(owner,target);return true;}};
}
module.exports={arenaURL,createReturnTargets,setupBrowserNavigation};
