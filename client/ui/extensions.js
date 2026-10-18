(() => {
  const host=window.BranaExtensions, $=id=>document.getElementById(id);let busy=false;
  const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
  function render(data) {
    $('entries').replaceChildren();$('status').textContent=data.error||(!data.entries.length?'尚未安装扩展':'');
    for(const e of data.entries){const card=document.createElement('article');card.append(node('h2',e.name+' · '+e.version),node('p',e.enabled?(e.loaded?'已启用':'加载失败'):'已停用'));
      const p=node('p',e.path);p.className='path';card.append(p);
      if(e.storage){const s=node('p',e.storage.error||'本地扩展数据已跨账号共享');if(e.storage.error)s.className='error';card.append(s);}
      if(e.error){const error=node('p',e.error);error.className='error';card.append(error);}
      const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=()=>run(fn);card.append(b);};
      button(e.enabled?'停用':'启用',()=>host.change(e.key,e.enabled?'disable':'enable'));button('重新加载',()=>host.change(e.key,'reload'));
      if(e.loaded&&(e.popup||e.action))button(e.popup?'打开弹窗':'运行扩展',async()=>{if(host.activate)await host.activate(e.key);else await host.page(e.key,'popup');return host.list();});
      if(e.loaded&&e.options)button('选项',async()=>{await host.page(e.key,'options');return host.list();});
      button('移除',()=>confirm('从所有账号移除 '+e.name+'？未打包扩展的源目录会保留。')?host.change(e.key,'remove'):host.list());$('entries').append(card);
    }
  }
  async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);$('status').textContent='处理中…';try{render(await fn());}catch(e){$('status').textContent=e.message||String(e);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  $('unpacked').onclick=()=>run(()=>host.install(false));$('packed').onclick=()=>run(()=>host.install(true));window.addEventListener('focus',()=>{if(!busy)void run(()=>host.list());});void run(()=>host.list());
})();
