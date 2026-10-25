// Text exports must use the native writer in WebView; blob/download anchors are browser-only.
const FileExport = {
  busy:false,
  async blob(blob,name,mime=blob.type||'application/octet-stream') {
    if (Host.platform !== 'android') { saveBlob(new Blob([blob],{type:mime}),name); return {requested:true}; }
    if (!Host.downloadStart || !Host.downloadChunk || !Host.downloadFinish) throw Error('当前 Android 宿主不支持二进制下载，请更新客户端');
    if (this.busy) throw Error('已有文件正在保存，请稍候');
    if (blob.size > 160*1024*1024) throw Error('文件超过 160MB 保存上限，请使用网页版下载');
    this.busy=true; let id;
    try {
      const start=await Host.downloadStart(name,mime,blob.size); if (!start?.ok||!start.id) throw Error(start?.error||'无法创建下载文件'); id=start.id;
      for(let at=0;at<blob.size;at+=512*1024) {
        const b64=await new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(String(f.result).split(',')[1]||'');f.onerror=()=>reject(Error('无法读取文件分块'));f.readAsDataURL(blob.slice(at,at+512*1024));});
        const r=await Host.downloadChunk(id,b64); if(!r?.ok)throw Error(r?.error||'文件分块未保存');
      }
      const result=await Host.downloadFinish(id); if(!result?.ok)throw Error(result?.error||'文件未完整保存'); id=null; toast('已保存：'+result.path);
      if(result.share) void Dialog.open((box,done)=>{
        box.append(h('div',{class:'dlg-t'},'工作区文件已保存'),h('p',{},result.path),h('div',{class:'dlg-row'},
          Host.openFile?h('button',{class:'btn',onclick:()=>Host.openFile(result.share,mime)},'用系统应用打开'):null,
          Host.shareFile?h('button',{class:'btn ghost',onclick:()=>Host.shareFile(result.share,mime)},'分享文件'):null,
          h('button',{class:'btn ghost',onclick:()=>done(null)},'关闭')));
      });
      return result;
    } finally { this.busy=false; if(id)try{await Host.downloadCancel?.(id);}catch{} }
  },
  async write(text,name,mime='application/json'){
    const native=Host.platform==='android'||!!Host.saveFile;
    if(native){
      if(typeof Host.saveFile==='function'){
        const r=await Host.saveFile(name,mime,text);
        if(r?.canceled)return {canceled:true};
        if(r?.ok&&r.path)return r;
        if(Host.platform!=='android'||!Host.downloadStart||!Host.downloadChunk||!Host.downloadFinish){
          throw Error(r?.error||'宿主未确认文件已保存');
        }
      }else if(Host.platform!=='android'||!Host.downloadStart||!Host.downloadChunk||!Host.downloadFinish){
        throw Error('当前宿主不支持保存文件，请使用复制内容或更新客户端');
      }
      // Android 兜底：若 saveFile 失败或不可用，走 WorkspaceDownload 分块通道落盘到 Download/BranaAi
      const bytes=new TextEncoder().encode(String(text??''));
      const start=await Host.downloadStart(name,mime,bytes.byteLength);
      if(!start?.ok||!start.id)throw Error(start?.error||'无法创建下载文件');
      try{
        let bin='';for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
        const cr=await Host.downloadChunk(start.id,btoa(bin));
        if(!cr?.ok)throw Error(cr?.error||'文件分块未保存');
        const fin=await Host.downloadFinish(start.id);
        if(!fin?.ok||!fin.path)throw Error(fin?.error||'文件未完整保存');
        return fin;
      }catch(e){try{await Host.downloadCancel?.(start.id);}catch{}throw e;}
    }
    saveBlob(new Blob([text],{type:mime}),name);
    return {requested:true,path:'浏览器下载目录 / '+name};
  },
  async text(text,name,mime='application/json'){
    if(this.busy){toast('正在保存，请稍候');return {busy:true};}
    this.busy=true;let result;
    try{toast('正在保存…');await PanelWork.frame();result=await this.write(String(text),name,mime);}
    catch(e){result={error:describe(e)};}
    finally{this.busy=false;}
    if(result.canceled){toast('已取消保存');return result;}
    if(result.requested){toast('已请求浏览器下载：'+name);return result;}
    if(result.error)toast('导出未保存：'+result.error,'err');else{toast('已保存：'+result.path);try{if(typeof window!=='undefined'&&typeof window.__ancShowDownloadToast==='function'&&result.path)window.__ancShowDownloadToast({name,path:result.path,mime});}catch{}}
    void Dialog.open((box,done)=>{
      box.append(h('div',{class:'dlg-t'},result.error?'导出未保存':'文件已保存'),h('p',{},result.error||result.path));
      const actions=h('div',{class:'dlg-row'});
      if(result.error)actions.append(h('button',{class:'btn',onclick:()=>{done(null);void this.text(text,name,mime);}},'重试保存'));
      if(result.share&&Host.shareFile)actions.append(h('button',{class:'btn',onclick:async()=>{try{const ok=await Host.shareFile(result.share,mime);if(!ok)toast('无法打开分享，请在下载目录中选择文件','err');}catch(e){toast(describe(e),'err');}}},'分享文件'));
      if(result.path&&Host.showFile)actions.append(h('button',{class:'btn ghost',onclick:()=>Promise.resolve(Host.showFile(result.path)).catch(e=>toast(describe(e),'err'))},'打开位置'));
      actions.append(h('button',{class:'btn ghost',onclick:()=>copyText(String(text))},'复制 JSON'));
      if(String(text).length<=512000)actions.append(h('button',{class:'btn ghost',onclick:e=>{e.currentTarget.disabled=true;box.insertBefore(h('textarea',{class:'fp-report',readOnly:true,style:{width:'100%',height:'180px'},onclick:e=>e.target.select()},String(text)),actions);}},'显示内容'));
      actions.append(h('button',{class:'btn',onclick:()=>done(null)},'关闭'));box.append(actions);
    });
    return result;
  },
};
