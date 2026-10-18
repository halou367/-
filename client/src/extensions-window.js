'use strict';
const path = require('node:path');
const { fileURLToPath } = require('node:url');
function managerActor(event, windows, file, accountFor) {
  const wc=event?.sender, frame=event?.senderFrame, entry=wc&&windows.get(wc.id);
  if(!entry||wc.isDestroyed()||frame!==wc.mainFrame)throw Error('扩展操作只允许管理窗口主框架');
  let valid=false;
  try{const url=new URL(frame.url);valid=url.protocol==='file:'&&path.resolve(fileURLToPath(url))===path.resolve(file);}catch{}
  if(!valid||!accountFor(entry.owner))throw Error('扩展管理窗口或账号已关闭');
  return entry;
}
function setupExtensions({BrowserWindow,ipcMain,dialog,store,accountFor,navigate,icon,showPopup,activateAction}) {
  const file=path.join(__dirname,'../ui/extensions.html'), windows=new Map();
  const actor=e=>managerActor(e,windows,file,accountFor);
  function open(event) {
    const wc=event.sender, a=accountFor(wc);
    if(!a||event.senderFrame!==wc.mainFrame)throw Error('只能从账号窗口打开扩展管理');
    const existing=[...windows.values()].find(x=>x.id===a.id);
    if(existing&&!existing.window.isDestroyed()){existing.window.show();existing.window.focus();return true;}
    const owner=wc, parent=BrowserWindow.fromWebContents(wc);
    const w=new BrowserWindow({width:780,height:620,minWidth:520,minHeight:360,title:'扩展 · '+a.name,parent,icon,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'extensions-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,partition:'extensions-manager-'+wc.id}});
    const entry={id:a.id,owner,window:w}, windowId=w.webContents.id;windows.set(windowId,entry);
    w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    w.webContents.on('will-navigate',e=>e.preventDefault());
    w.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    const close=()=>{if(!w.isDestroyed())w.destroy();};owner.once('destroyed',close);
    w.on('closed',()=>{windows.delete(windowId);owner.removeListener('destroyed',close);});
    void w.loadFile(file).catch(()=>close());return true;
  }
  const browserActor = event => {
    const wc = event?.sender, a = wc && accountFor(wc);
    if (!a || wc.isDestroyed() || event.senderFrame !== wc.mainFrame || !/^(https:|chrome-extension:)/.test(event.senderFrame.url)) throw Error('扩展工具栏只允许当前账号主窗口');
    return {id:a.id,owner:wc};
  };
  ipcMain.handle('browser:extensions:toolbar', e => {const entry=browserActor(e);return store.toolbar(entry.id,entry.owner.id);});
  ipcMain.handle('browser:extensions:pin', async (e,key,pinned) => {
    const entry = browserActor(e); await store.pin(entry.id,key,pinned); browserActor(e); return store.toolbar(entry.id,entry.owner.id);
  });
  async function activate(entry,key,validate) {
    const rows=await store.list(entry.id),item=rows.entries.find(x=>x.key===key);validate();
    if(!item?.loaded)throw Error(item?.error||'请先在管理扩展中启用此扩展');
    if(activateAction&&item.extensionId){
      const result=await activateAction(entry.owner,item.extensionId);
      if(result?.kind==='action'&&result.handled>0)return true;
      if(result?.kind==='popup'){if(!showPopup)throw Error('扩展弹窗不可用');await showPopup(entry.owner,result.url);return true;}
      throw Error('扩展没有完成按钮动作');
    }
    if(!item.popup)throw Error('此扩展没有弹出页；当前内核尚不支持仅由 action.onClicked 启动的扩展');
    const url=await store.page(entry.id,key,'popup');validate();
    if(!showPopup)throw Error('扩展弹窗不可用');await showPopup(entry.owner,url);return true;
  }
  ipcMain.handle('browser:extensions:activate',(e,key)=>activate(browserActor(e),key,()=>browserActor(e)));
  ipcMain.handle('browser:extensions:managerActivate',(e,key)=>activate(actor(e),key,()=>actor(e)));
  ipcMain.handle('browser:extensions:open',open);
  ipcMain.handle('browser:extensions:list',e=>store.list(actor(e).id));
  ipcMain.handle('browser:extensions:install',async(e,packed)=>{
    const entry=actor(e), result=await dialog.showOpenDialog(entry.window,{title:packed?'选择扩展 ZIP / CRX 安装包':'选择包含 manifest.json 的扩展目录',properties:[packed?'openFile':'openDirectory'],...(packed?{filters:[{name:'浏览器扩展',extensions:['zip','crx']}]}:{})});
    if(result.canceled||!result.filePaths.length)return store.list(entry.id);actor(e);
    const prepared=await store.prepare(entry.id,result.filePaths[0],packed===true);
    let installed=false;
    try{
      actor(e);const m=prepared.manifest;
      const consent=await dialog.showMessageBox(entry.window,{type:'warning',title:'安装扩展',message:'允许安装 '+m.name+'？',detail:'扩展会安装到此客户端所有账号（包括以后新增的账号），可按其权限读取或修改各账号浏览的网页。仅安装信任的来源；本地 CRX 不验证商店签名。Electron 支持部分 Chrome 扩展 API。\n\n请求权限：'+JSON.stringify({permissions:m.permissions||[],host_permissions:m.host_permissions||[],content_scripts:(m.content_scripts||[]).map(x=>x.matches||[])}).slice(0,6000),buttons:['取消','安装'],defaultId:0,cancelId:0,noLink:true});
      actor(e);if(consent.response!==1)return store.list(entry.id);
      const rows=await store.install(entry.id,prepared);installed=true;return rows;
    }finally{if(!installed)await store.cleanup(entry.id,prepared);}
  });
  ipcMain.handle('browser:extensions:change',(e,key,action)=>store.change(actor(e).id,key,action));
  ipcMain.handle('browser:extensions:page',async(e,key,kind)=>{
    if(!['popup','options'].includes(kind))throw Error('扩展页面类型无效');
    const entry=actor(e), url=await store.page(entry.id,key,kind);actor(e);
    const ok=await navigate(entry.owner,url);if(ok&&!entry.window.isDestroyed())entry.window.hide();return ok;
  });
  return {open};
}
module.exports={setupExtensions,managerActor};
