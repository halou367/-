// Archive browsing is isolated from the normal history cache and its paging cursor.
const ArchiveHistory = {
  items: [], index: new Map(), cursor: '', hasMore: true, loaded: false, loading: false, error: '', epoch: 0, removed: new Set(),
  byId(id) { return this.index.get(id); },
  stop() { this.epoch++; this.ctl?.abort(); this.loading=false; this.promise=null; },
  reset() { this.stop(); this.items=[]; this.index=new Map(); this.cursor=''; this.hasMore=true; this.loaded=false; this.error=''; this.removed=new Set(); },
  drop(ids) { for(const id of ids){this.removed.add(id);this.index.delete(id);}this.items=this.items.filter(e=>!this.removed.has(e.id)); },
  add(entries) { for(const e of entries){if(!e?.id)continue;this.removed.delete(e.id);this.index.set(e.id,{...e,isArchived:true,mode:e.mode,modality:e.modality,modelAId:e.modelAId,modelBId:e.modelBId});}this.items=[...this.index.values()];History.bury?.(entries.map(e=>e?.id)); },
  load(refresh=false) {
    if(refresh)this.reset();
    if(this.loading)return this.promise;
    if(!this.hasMore)return Promise.resolve();
    const epoch=this.epoch;this.loading=true;this.error='';UI.renderList();
    this.promise=(async()=>{
      const cursors=new Set();
      try {
        for(let page=0;page<200&&this.hasMore&&epoch===this.epoch;page++){
          const cursor=this.cursor;if(cursors.has(cursor))throw Error('归档分页游标重复，请稍后刷新');cursors.add(cursor);
          const ctl=this.ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
          let j;try {j=await api('/api/history/unified?limit=50&includeArchived=true&archivedOnly=true'+(cursor?'&cursor='+encodeURIComponent(cursor):''),{signal:ctl.signal});}finally{clearTimeout(timer);}
          if(epoch!==this.epoch)return;
          if(!Array.isArray(j?.entries))throw Error('归档列表响应格式无效');
          const delQSet = new Set([...(typeof Bulk !== 'undefined' && Bulk.running?.('del')?.ids || []), ...(typeof Bulk !== 'undefined' && Bulk.running?.('unarch')?.ids || [])]);
          for(const e of j.entries){if(e?.id&&(e.isArchived||e.archivedAt)&&(e.type==='agentic'||e.type==='evaluation'||e.productMode||e.mode)&&!this.removed.has(e.id)&&!(typeof History!=='undefined'&&History.isDeleted?.(e.id))&&!delQSet.has(e.id))this.index.set(e.id,{...e,mode:e.mode,modality:e.modality,modelAId:e.modelAId,modelBId:e.modelBId});}
          this.items=[...this.index.values()];this.loaded=true;
          const next=j.pagination?.cursor||'';this.hasMore=!!j.pagination?.hasMore;
          if(this.hasMore&&(!next||next===cursor))throw Error('归档分页缺少有效游标，请稍后刷新');
          this.cursor=next;UI.renderList();
          if(this.hasMore)await sleep(100);
        }
      }catch(e){if(epoch===this.epoch)this.error=e?.name==='AbortError'?'归档读取超时，请重试':describe(e);}
      finally{if(epoch===this.epoch){this.loading=false;this.promise=null;this.ctl=null;UI.renderList();}}
    })();
    return this.promise;
  }
};

// Selection follows the rendered card order (after grouping/filtering), never the raw history order.
const CardSelect = {
  ids:new Set(), anchor:null, mode:false, visible:[], revision:0, acting:false,
  clear() { this.ids.clear();this.anchor=null;this.mode=false;this.revision++; },
  reconcile(ids) {
    this.visible=[...new Set(ids)];const have=new Set(this.visible);
    for(const id of this.ids)if(!have.has(id)){this.ids.delete(id);this.revision++;}
    if(this.anchor&&!have.has(this.anchor))this.anchor=null;
  },
  toggle(id) { if(!this.visible.includes(id))return;this.ids.has(id)?this.ids.delete(id):this.ids.add(id);this.mode=this.ids.size>0;this.anchor=id;this.revision++; },
  click(id,ev={}) {
    const add=ev.ctrlKey||ev.metaKey;
    if(ev.shiftKey){
      const a=this.visible.indexOf(this.anchor),b=this.visible.indexOf(id);if(b<0)return false;
      if(!add)this.ids.clear();for(const x of this.visible.slice(a<0?b:Math.min(a,b),a<0?b+1:Math.max(a,b)+1))this.ids.add(x);
      if(a<0){const cur=typeof Tabs!=='undefined'?Tabs.cur?.sid:null,ci=cur?this.visible.indexOf(cur):-1;if(ci>=0){for(const x of this.visible.slice(Math.min(ci,b),Math.max(ci,b)+1))this.ids.add(x);this.anchor=cur;}else this.anchor=id;}
      this.mode=this.ids.size>0;this.revision++;return true;
    }
    if(add){
      // 第一次 Ctrl 点击：把当前打开的对话也算进来（和资源管理器一样，从当前项开始加选）
      if(!this.ids.size){const cur=typeof Tabs!=='undefined'?Tabs.cur?.sid:null;if(cur&&cur!==id&&this.visible.includes(cur))this.ids.add(cur);}
      this.toggle(id);return true;
    }
    if(this.mode&&typeof isMob==='function'&&isMob()){this.toggle(id);return true;}   // 手机没有 Ctrl / Shift：进入多选后点一下就是加选 / 取消
    const had=this.ids.size>0;this.ids.clear();this.mode=false;this.anchor=id;this.revision++;if(had)try{UI.renderList();}catch{}return false;
  },
  all() { this.mode=true;this.ids=new Set(this.visible);this.anchor=this.visible[0]||null;this.revision++; },
  async act(kind) {
    if(this.acting)return;
    if(kind==='fingerprint'){void FingerprintBatch.start(this.visible.filter(id=>this.ids.has(id)));return;}
    const ids=this.visible.filter(id=>this.ids.has(id));if(!ids.length)return;
    if(Bulk.running('arch')||Bulk.running('unarch')||Bulk.running('del')){toast('已有批量任务在运行，请完成或停止后再操作');return;}
    if(kind!=='fav'&&ids.some(id=>Chats.get(id)?.busy||Fingerprint.isRunning(Chats.get(id))||(Gacha.busy()&&Gacha.owns(id)))){toast('选中的对话仍在运行，请先停止或取消选中后再操作','err');return;}
    this.acting=true;SideTools.paintToolbar();
    const revision=this.revision,owner=SideTools.owner,scope=SideTools.scope;
    try {
      if(kind==='fav'){Fav.setMany(ids,true);for(const id of ids)this.ids.delete(id);this.revision++;toast('已收藏 '+ids.length+' 个对话');return;}
      if(kind==='arch'&&scope==='archived')kind='unarch';
      if(kind==='unarch'&&scope!=='archived')return;
      const verb=kind==='del'?'删除':kind==='unarch'?'恢复到对话':'归档';
      const names=ids.slice(0,3).map(id=>(History.byId(id)||ArchiveHistory.byId(id)||SideTools.rows().find(e=>e?.id===id))?.title||'未命名').join('\n');
      const ok=await Dialog.confirm({title:kind==='unarch'?'恢复到对话':'批量'+verb,text:'确认'+(kind==='unarch'?'将':'')+verb+'已选中的 '+ids.length+' 个对话？\n'+names+(ids.length>3?'\n…':'')+(kind==='del'?'\n将删除云端对话及本机模型、备注、收藏和运行记录，无法恢复。':kind==='unarch'?'\n恢复后对话将回到普通对话列表。':'\n归档后可从搜索范围「归档」中查找。'),ok:verb,danger:kind==='del'});
      if(!ok)return;
      if(owner!==SideTools.owner||scope!==SideTools.scope||revision!==this.revision){toast('选择或搜索范围已改变，请重新确认');return;}
      if(ids.some(id=>Chats.get(id)?.busy||Fingerprint.isRunning(Chats.get(id))||(Gacha.busy()&&Gacha.owns(id)))){toast('选中的对话已开始运行，操作已取消','err');return;}
      if(Bulk.running('arch')||Bulk.running('unarch')||Bulk.running('del')){toast('已有批量任务在运行');return;}
      Bulk.start(kind,ids,false);this.clear();
    }catch(e){toast('批量操作未完成：'+describe(e),'err');}finally{this.acting=false;UI.renderList();}
  }
};

const SideTools = {
  scope:'active',owner:null,filterKey:'',toolbarSig:'',
  ensure() {
    const owner=String(UI.host?.account?.id||UI.me?.id||'local');
    if(this.owner===owner)return;
    this.owner=owner;this.scope='active';this.filterKey='';CardSelect.clear();ArchiveHistory.reset();
    const sel=document.querySelector('#history-scope');if(sel)sel.value='active';
  },
  searchOn() { const q=document.querySelector('#q'),l=q?.closest('.nav.search');if(l)l.classList.toggle('on',!!q.value.trim()||this.scope==='archived'); },
  setScope(value) {
    this.ensure();this.scope=value==='archived'?'archived':'active';CardSelect.clear();this.filterKey='';
    if(this.scope==='active')ArchiveHistory.stop();
    const q=document.querySelector('#q');if(q)q.placeholder=this.scope==='archived'?'搜索归档名称、备注':'搜索名称、备注';this.searchOn();
    UI.renderList();if(this.scope==='archived'&&!ArchiveHistory.loaded)void ArchiveHistory.load();
    else if(this.scope==='archived'&&ArchiveHistory.hasMore&&!ArchiveHistory.error)void ArchiveHistory.load();
  },
  filter(q,vf) {
    this.ensure();const curMode=(typeof ModeState!=='undefined'&&typeof ModeState.getMode==='function')?ModeState.getMode():'agent';const key=this.scope+'\n'+curMode+'\n'+q+'\n'+vf;
    if(key!==this.filterKey){this.filterKey=key;CardSelect.clear();}
  },
  matches(e,q) {
    if (!q) return true;
    const tv = typeof Titles !== 'undefined' && Titles.view ? Titles.view(e.id, e.title, e.localTitle) : null;
    const resolveM = id => (id && typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function') ? ModelCatalog.resolveModelName(id) : id;
    return [e.title, e.localTitle, tv?.model, tv?.note, Models.get(e.id)?.name, Notes.get(e.id), e.note, e.notes, e.remark, e.description, e.mode, e.modality, resolveM(e.modelAId), resolveM(e.modelBId)].some(s => typeof s === 'string' && s.toLowerCase().includes(q));
  },
  rows() {
    this.ensure();
    const isArch = this.scope === 'archived';
    const gone = (!isArch && typeof History !== 'undefined' && typeof History.goneMap === 'function') ? History.goneMap() : null;
    const base = (isArch ? ArchiveHistory.items : History.items) || [];
    const filtered = base.filter(e => {
      if (!e?.id) return false;
      if (typeof History !== 'undefined' && History.isDeleted?.(e.id)) return false;
      if (isArch) return !ArchiveHistory.removed.has(e.id);
      return !(gone && gone.has(e.id)) && !e.isArchived && !e.archivedAt;
    });
    if (typeof ModeState === 'undefined' || typeof ModeState.matchesHistoryEntry !== 'function') return filtered;
    const curMode = ModeState.getMode();
    return filtered.filter(e => ModeState.matchesHistoryEntry(e, curMode));
  },
  toggle() { CardSelect.mode=!CardSelect.mode;if(!CardSelect.mode)CardSelect.clear();UI.renderList(); },
  paintToolbar() {
    const bar=document.querySelector('#selection-bar');if(!bar)return;
    const sig=[CardSelect.mode,CardSelect.ids.size,CardSelect.visible.length,CardSelect.acting,this.scope].join('|');if(sig===this.toolbarSig&&bar.children.length)return;this.toolbarSig=sig;
        bar.hidden=!CardSelect.mode;if(!CardSelect.mode){bar.replaceChildren();return;}
    const disabled=!CardSelect.ids.size||CardSelect.acting;
    const isArch=this.scope==='archived';
    bar.replaceChildren(h('div',{class:'selection-count'},h('span',{class:'sel-badge'},CardSelect.ids.size),h('span',{class:'grow'}),h('button',{class:'ib sm',title:'全选当前结果','aria-label':'全选当前结果',disabled:CardSelect.acting,onclick:()=>{CardSelect.all();UI.renderList();}},icon('check')),h('button',{class:'ib sm',title:'批量测指纹','aria-label':'测指纹',disabled,onclick:()=>void CardSelect.act('fingerprint')},icon('fingerprint')),h('button',{class:'ib sm',title:'批量收藏','aria-label':'收藏',disabled,onclick:()=>void CardSelect.act('fav')},icon('star')),h('button',{class:'ib sm',title:isArch?'恢复到对话':'批量归档','aria-label':isArch?'恢复到对话':'归档',disabled,onclick:()=>void CardSelect.act(isArch?'unarch':'arch')},icon(isArch?'refresh':'archive')),h('button',{class:'ib sm danger',title:'批量删除','aria-label':'删除',disabled,onclick:()=>void CardSelect.act('del')},icon('trash')),h('button',{class:'ib sm',title:'取消选择（Esc）','aria-label':'取消选择',onclick:()=>{CardSelect.clear();UI.renderList();}},icon('x'))));
  }
};

// Top-only contour. Its coordinate system never depends on the pane/keyboard height.
const ActiveFrame = {
  mount() {
    this.ro?.disconnect();this.mo?.disconnect();this.scrollRoot?.removeEventListener('scroll',this.onScroll);this.svg?.remove();
    const main=document.querySelector('#main'),tabs=document.querySelector('#tablist'),body=document.querySelector('#body');if(!main||!tabs||!body)return;
    const ns='http://www.w3.org/2000/svg';this.svg=document.createElementNS(ns,'svg');this.svg.setAttribute('class','active-frame');this.svg.setAttribute('aria-hidden','true');
    this.path=document.createElementNS(ns,'path');this.svg.append(this.path);main.append(this.svg);
    this.ro=new ResizeObserver(()=>this.schedule());this.ro.observe(main);this.ro.observe(tabs);this.ro.observe(document.querySelector('#tabs'));
    this.mo=new MutationObserver(()=>this.schedule());this.mo.observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
    this.mo.observe(body,{childList:true,subtree:false});
    this.scrollRoot=tabs;this.onScroll=()=>this.schedule();tabs.addEventListener('scroll',this.onScroll,{passive:true});this.schedule();
  },
  schedule() { if(this.raf)return;this.raf=requestAnimationFrame(()=>{this.raf=0;this.paint();}); },
  paint() {
    const main=document.querySelector('#main'),view=document.querySelector('#view'),tab=document.querySelector('#tablist .tab.on');if(!main||!view||!this.svg)return;
    if(this.observed!==view){if(this.observed)this.ro.unobserve(this.observed);this.ro.observe(view);this.observed=view;}
    const m=main.getBoundingClientRect(),v=view.getBoundingClientRect(),t=tab?.getBoundingClientRect(),clip=document.querySelector('#tablist').getBoundingClientRect();
    const snap=x=>Math.round(x)+.5,l=Math.max(.5,snap(v.left-m.left)),r=Math.round(m.width)-.5,y=snap(v.top-m.top);
    const height=Math.max(1,Math.ceil(y+1)),vb='0 0 '+m.width+' '+height;
    if(this.svg.getAttribute('viewBox')!==vb){this.svg.setAttribute('viewBox',vb);this.svg.style.height=height+'px';}
    let d='';
    if(r>l){
      d=`M ${l} ${y} H ${r}`;
      if(tab){const tl=Math.max(l,snap(t.left-m.left),clip.left-m.left),tr=Math.min(r,snap(t.right-m.left)-1,clip.right-m.left),ty=Math.max(.5,snap(t.top-m.top));
        if(tr-tl>16&&ty<y){const radius=Math.min(7,(tr-tl)/3),h=y-ty-radius;
          // 和页面衔接的两个下角也做成内凹圆角（像 Chrome 的标签「脚」），不是直角折线；靠边没空间时自动变小
          const fl=Math.max(0,Math.min(6,tl-l,h)),fr=Math.max(0,Math.min(6,r-tr,h));
          d=`M ${l} ${y} H ${tl-fl} Q ${tl} ${y} ${tl} ${y-fl} V ${ty+radius} Q ${tl} ${ty} ${tl+radius} ${ty} H ${tr-radius} Q ${tr} ${ty} ${tr} ${ty+radius} V ${y-fr} Q ${tr} ${y} ${tr+fr} ${y} H ${r}`;}
      }
    }
    if(this.path.getAttribute('d')!==d)this.path.setAttribute('d',d);
  }
};

if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
  Bus.on('modechange', () => {
    try {
      if (typeof CardSelect !== 'undefined' && CardSelect.mode) CardSelect.clear();
      if (typeof UI !== 'undefined' && typeof UI.renderList === 'function') UI.renderList();
    } catch {}
  });
}

