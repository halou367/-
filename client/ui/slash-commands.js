// Local saved prompts + composer-only command picker. Selecting prompts NEVER sends.
const SlashCommands = (() => {
  const KEY='quick-prompts:v1', MAX=300, MAX_TEXT=20000;
  const functions=[
    {id:'fingerprint',kind:'功能',text:'测指纹',aliases:''},
    {id:'add',kind:'功能',text:'添加常用提示词',aliases:'添加提示词'},
    {id:'edit',kind:'功能',text:'编辑常用提示词',aliases:'编辑提示词'},
    {id:'delete',kind:'功能',text:'删除提示词',aliases:'删除常用提示词'}
  ];
  function list(){const a=Store.get(KEY,[]),seen=new Set();return (Array.isArray(a)?a:[]).filter(p=>p && typeof p.id==='string' && !seen.has(p.id) && seen.add(p.id) && typeof p.text==='string' && p.text.trim() && p.text.length<=MAX_TEXT).slice(0,MAX);}
  function persist(a){Store.set(KEY,a);if(JSON.stringify(Store.get(KEY,null))!==JSON.stringify(a))throw Error('本地保存失败，请检查存储空间');}
  function save(text,id){
    if(typeof text!=='string'||!text.trim())throw Error('提示词不能为空');
    if(text.length>MAX_TEXT)throw Error('提示词最多 '+MAX_TEXT+' 个字符');
    const a=list(),found=a.find(p=>p.id===id),same=a.find(p=>p.text===text && p.id!==id);
    if(id&&!found)throw Error('该提示词已被删除，请重新选择');
    if(same){if(id)throw Error('已存在相同的提示词');return same;}
    if(!found&&a.length>=MAX)throw Error('最多保存 '+MAX+' 条提示词');
    const row={id:found?.id || crypto.randomUUID(),text};
    persist(found?a.map(p=>p.id===id?row:p):[...a,row]);return row;
  }
  function remove(id){const a=list();if(!a.some(p=>p.id===id))throw Error('该提示词已被删除');persist(a.filter(p=>p.id!==id));}
  function query(value){return typeof value==='string' && value.startsWith('/') && !/[\r\n]/.test(value) ? value.slice(1).trim().toLocaleLowerCase() : null;}
  function matches(value){const q=query(value);if(q===null)return [];return [...functions,...list().map(p=>({...p,kind:'提示词'}))].filter(p=>(p.kind+' '+p.text+' '+(p.aliases||'')).toLocaleLowerCase().includes(q));}
  const preview=t=>t.replace(/\s+/g,' ').slice(0,140);
  function editor(row){return Dialog.open((box,done)=>{
    const inp=h('textarea',{class:'dlg-in qp-editor',rows:6,maxlength:MAX_TEXT,placeholder:'输入提示词，例如：你好'});inp.value=row?.text || '';
    const err=h('div',{class:'qp-error',role:'alert'});
    box.append(h('div',{class:'dlg-t'},row?'编辑常用提示词':'添加常用提示词'),h('div',{class:'dlg-h'},row?'修改后保存到本机。':'保存后填入当前输入框，不会自动发送。'),inp,err,
      h('div',{class:'dlg-row'},h('span',{class:'grow'}),h('button',{class:'btn ghost',onclick:()=>done(null)},'取消'),h('button',{class:'btn',onclick:()=>{try{done(save(inp.value,row?.id));}catch(e){err.textContent=e.message;}}},'保存')));
  });}
  function choose(action){return Dialog.open((box,done)=>{
    const search=h('input',{class:'dlg-in',placeholder:'筛选提示词',oninput:()=>paint()}),rows=h('div',{class:'qp-choices'});
    const paint=()=>{const a=list().filter(p=>p.text.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));rows.replaceChildren(...(a.length?a.map(p=>h('button',{type:'button',class:'qp-choice',title:p.text,onclick:()=>done(p)},'提示词：'+preview(p.text))):[h('div',{class:'dim'},'没有匹配的提示词')]));};
    box.append(h('div',{class:'dlg-t'},action==='edit'?'选择要编辑的提示词':'选择要删除的提示词'),search,rows,h('div',{class:'dlg-row'},h('span',{class:'grow'}),h('button',{class:'btn ghost',onclick:()=>done(null)},'取消')));paint();
  });}
  let serial=0;
  function bind(root,ta,{fingerprint}){
    const menu=h('div',{class:'slash-menu',role:'listbox',id:'slash-menu-'+(++serial),'aria-label':'功能和常用提示词',hidden:true});root.append(menu);
    ta.setAttribute('aria-controls',menu.id);ta.setAttribute('aria-autocomplete','list');ta.setAttribute('aria-expanded','false');
    let rows=[],index=0,composing=false,literal=null,working=false;
    const close=()=>{menu.hidden=true;ta.setAttribute('aria-expanded','false');ta.removeAttribute('aria-activedescendant');};
    const fill=text=>{if(!ta.isConnected)return;literal=text;close();ta.value=text;ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();ta.setSelectionRange(text.length,text.length);};
    const selected=()=>{[...menu.querySelectorAll('[role=option]')].forEach((b,i)=>{b.classList.toggle('on',i===index);b.setAttribute('aria-selected',String(i===index));});const b=menu.querySelectorAll('[role=option]')[index];if(b){ta.setAttribute('aria-activedescendant',b.id);b.scrollIntoView({block:'nearest'});}};
    const pick=async row=>{
      if(!row||working)return;close();
      if(row.kind==='提示词'){const p=list().find(p=>p.id===row.id);if(p)fill(p.text);else toast('该提示词已被删除','err');return;}
      working=true;const original=ta.value;
      try{
        if(row.id==='fingerprint'){if(fingerprint())fill('');return;}
        if(row.id==='add'){const p=await editor();if(p&&ta.isConnected&&ta.value===original)fill(p.text);return;}
        const p=await choose(row.id);if(!p)return;
        if(row.id==='edit'){if(await editor(p)){toast('提示词已更新');if(ta.value===original)fill('');}}
        else if(await Dialog.confirm({title:'删除提示词',text:'删除「'+preview(p.text)+'」？只删除提示词库中的这一项，不影响对话。',ok:'删除',danger:true})){remove(p.id);toast('提示词已删除');if(ta.value===original)fill('');}
      }catch(e){toast(e.message||'操作失败','err');}
      finally{working=false;if(ta.isConnected)ta.focus();}
    };
    const paint=()=>{
      if(composing||working||document.activeElement!==ta||ta.value===literal||query(ta.value)===null){close();return;}
      rows=matches(ta.value);index=0;menu.hidden=false;ta.setAttribute('aria-expanded','true');
      menu.replaceChildren(h('div',{class:'slash-hint'},'↑↓ 选择 · Enter 确认 · Esc 关闭'),...(rows.length?rows.map((p,i)=>h('button',{type:'button',role:'option',tabindex:-1,id:menu.id+'-'+i,class:'slash-option',title:p.text,onmousedown:e=>e.preventDefault(),onclick:()=>void pick(p)},h('span',{class:'slash-kind'},p.kind+'：'),h('span',{class:'slash-text'},(p.kind==='功能'?'/':'')+preview(p.text)))):[h('div',{class:'slash-empty'},'没有匹配项')]));selected();
    };
    ta.addEventListener('input',()=>{if(ta.value!==literal)literal=null;paint();});ta.addEventListener('focus',paint);
    ta.addEventListener('compositionstart',()=>{composing=true;close();});ta.addEventListener('compositionend',()=>{composing=false;paint();});
    root.addEventListener('focusout',()=>setTimeout(()=>{if(!root.contains(document.activeElement))close();},0));
    ta.addEventListener('keydown',e=>{
      if(e.isComposing||e.keyCode===229||composing||menu.hidden)return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}
      else if((e.key==='ArrowDown'||e.key==='ArrowUp')&&rows.length){e.preventDefault();e.stopImmediatePropagation();index=(index+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length;selected();}
      else if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();if(rows.length)void pick(rows[index]);else toast('没有匹配的功能或提示词','err');}
    },true);
    return {close,submit(){if(menu.hidden)return false;if(rows.length)void pick(rows[index]);else toast('没有匹配的功能或提示词','err');return true;}};
  }
  return {KEY,MAX,MAX_TEXT,list,save,remove,query,matches,bind};
})();
