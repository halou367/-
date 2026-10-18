const FingerprintLibrary = {
  view:null,
  open(){
    if(this.view?.back.isConnected)return;
    const v=this.view={owner:PersonalFP.owner(),mode:'models',query:'',page:0,refs:[],tests:[],base:null,loading:false,task:false,message:''};
    const back=v.back=h('div',{class:'modal-back fp-library-back'}),body=h('div',{class:'modal-b'});
    v.status=h('p',{class:'fp-library-status',role:'status','aria-live':'polite'},'正在读取本地指纹库…');v.list=h('div',{class:'fp-library-list'});
    const search=h('input',{type:'search',placeholder:'搜索型号',oninput:e=>{v.query=e.target.value.toLowerCase();v.page=0;void this.reload();}});
    v.tabs=h('div',{class:'fp-library-tabs'},...['识别库','全部型号','共享样本','本账号测试'].map((label,i)=>h('button',{class:'btn ghost sm',onclick:()=>{v.mode=['libs','models','samples','tests'][i];v.page=0;v.message='';void this.reload();}},label)));
    v.search=search;
    // 识别库：添加（URL / 文件）、启用开关、更新、删除。所有启用的库一起识别，取最强匹配
    const libUrl=h('input',{type:'url',class:'fp-lib-url',placeholder:'粘贴指纹库 JSON 地址（https://…）',onkeydown:e=>{if(e.key==='Enter')addUrl();}});
    const libFile=h('input',{type:'file',accept:'.json,application/json',hidden:true,onchange:async()=>{const f=libFile.files?.[0];libFile.value='';if(!f)return;await this.task(async()=>{if(f.size>40*1024*1024)throw Error('文件超过 40 MB');v.message='正在校验 '+f.name+'…';this.paint();const lib=await FPLibs.addText(await f.text(),f.name);v.message='已添加 '+lib.name+' · '+lib.models+' 个型号';});}});
    const addUrl=()=>{const url=libUrl.value.trim();if(!url)return void libUrl.focus();void this.task(async()=>{v.message='正在下载并校验…';this.paint();const lib=await FPLibs.addUrl(url);libUrl.value='';v.message='已添加 '+lib.name+' · '+lib.models+' 个型号';});};
    v.libAdd=h('div',{class:'fp-lib-add'},libUrl,h('button',{class:'btn sm fp-write',onclick:addUrl},'添加'),h('button',{class:'btn ghost sm fp-write',onclick:()=>libFile.click()},'从文件导入'),libFile);
    v.mode='libs';
    const file=h('input',{type:'file',accept:'.json,application/json',hidden:true,onchange:async()=>{
      const f=file.files?.[0];file.value='';if(!f)return;
      await this.task(async()=>{
        if(f.size>32*1024*1024)throw Error('文件超过 32 MB');v.message='正在校验文件和数字样本…';this.paint();
        const preview=await PersonalFP.previewImport(await f.text());if(!back.isConnected||v.owner!==PersonalFP.owner())return;
        const trusted=h('input',{type:'checkbox'}),restore=h('input',{type:'checkbox'});
        const ok=await Dialog.confirm({title:'导入 '+preview.rows.length+' 批样本',text:preview.models+' 个型号，合并到本客户端所有账号共用的参考库。自动去重，标签冲突隔离；不会覆盖默认库。\n导入文件中的型号是发布者声明，不能由文件本身证明。默认保存为待确认，不参与识别。',body:h('div',{},h('label',{class:'set'},trusted,h('span',{},'我确认来源可靠，启用无冲突的新样本（不改变已停用样本）')),h('label',{class:'set'},restore,h('span',{},'恢复之前从共享库删除的相同样本'))),ok:'合并导入'});
        if(!ok||!back.isConnected||v.owner!==PersonalFP.owner())return;
        const rows=preview.rows.map(r=>({...r,enabled:trusted.checked&&!r.conflict})),res=await PersonalFP.merge(rows,v.owner,{restoreDeleted:restore.checked});
        v.message='新增 '+res.added+' · 重复 '+res.duplicates+' · 冲突 '+res.conflicts+(trusted.checked?'':' · 导入样本待确认');
      });
    }});
    const actions=h('div',{class:'modal-f'},h('button',{class:'btn ghost fp-write',onclick:()=>void this.task(()=>PersonalFP.exportData())},'导出完整库'),h('button',{class:'btn ghost fp-write',onclick:()=>file.click()},'导入合并'),h('button',{class:'btn ghost',onclick:()=>void this.reload()},'刷新'),h('span',{class:'grow'}),h('button',{class:'btn',onclick:()=>{back.remove();v.off?.();v.stopPoll?.();if(this.view===v)this.view=null;}},'关闭'));
    body.append(h('p',{class:'note'},'本客户端所有账号共用参考库 · 测试记录仅当前账号可见。旧个人样本在各账号首次打开指纹功能时自动合并，原数据保留；未打开的账号稍后合并。默认库只读，共享样本可补充新型号。新旧对话均可核验入库，须三条探针对应同一可靠接口型号；仅有猜测时只留测试记录。区分上下文，跨上下文仅作候选；百分比是库内相对匹配，不是身份准确率。'),v.tabs,search,v.libAdd,v.status,v.list);
    back.append(h('div',{class:'modal fp-library',role:'dialog','aria-modal':'true','aria-label':'指纹库'},h('div',{class:'modal-h'},'指纹库'),body,actions),file);document.body.append(back);
    v.off=Bus.on('personal-bank',()=>{if(back.isConnected)void this.reload();else v.off?.();});v.stopPoll=PanelWork.poll(back,async()=>{if(!v.task&&!v.loading&&v.owner===PersonalFP.owner())await SharedFP.read();},3000);void this.reload();
  },
  async task(fn){const v=this.view;if(!v||v.task)return;v.task=true;this.paint();try{await fn();}catch(e){v.message=describe(e);}finally{v.task=false;await this.reload();}},
  async reload(){
    const v=this.view;if(!v)return;if(v.loading){v.reloadPending=true;return;}if(v.owner!==PersonalFP.owner()){v.message='账号已变化，请关闭后重新打开';this.paint();return;}
    v.loading=true;this.paint();
    try{v.base=await ProbeBankCache.load();v.refs=await PersonalFP.refs(v.owner);const tests=await PersonalFP.testPage(v.owner,v.mode==='tests'?v.page:0,v.mode==='tests'?v.query:'');v.tests=tests.rows;v.testCount=tests.total;}catch(e){v.message='共享库读取失败：'+describe(e);}
    finally{v.loading=false;if(this.view===v&&v.back.isConnected){this.paint();if(v.reloadPending){v.reloadPending=false;void this.reload();}}}
  },
  async modelAction(model,remove=false){
    const v=this.view;if(!v||v.task)return;const refs=v.refs.filter(r=>r.model===model),ids=refs.filter(r=>remove||!r.conflict).map(r=>r.id);if(!ids.length)return;
    const enabled=refs.some(r=>!r.enabled&&!r.conflict);
    if(!await Dialog.confirm({title:remove?'从所有账号共享库删除':enabled?'启用参考样本':'停用参考样本',text:remove?'从本客户端所有账号共用的库删除这个型号的 '+ids.length+' 批样本，不删除对话、测试记录或默认库。旧账号迁移与重复核验不会自动恢复；需要恢复时，可主动导入并勾选恢复选项。':enabled?'此操作影响本客户端所有账号。确认这些参考标签来源可靠？启用 '+ids.length+' 批无冲突样本参与识别。导入声明无法独立证明真实型号。':'对本客户端所有账号生效：停用后保留数据，但不参与识别；其他账号重复入库也不会自动启用。',ok:'确认',danger:remove}))return;
    await this.task(async()=>{if(this.view!==v||v.owner!==PersonalFP.owner())return;await PersonalFP.change(ids,{enabled,remove},v.owner);v.message='已保存';});
  },
  defaultDetails(model){const bank=this.view?.base?.bank;if(!bank)return;const records=bank.models.filter(m=>PersonalMath.idOf(m.id)===model).map(m=>{const i=bank.robust.model_order.indexOf(m.id);return {...m,hellinger_centroid:bank.robust.hellinger.centroids[i],ordered_centroid:bank.robust.ordered_blocks.centroids[i]};});void Dialog.open((box,done)=>box.append(h('div',{class:'dlg-t'},'默认统计模板（无原始响应正文）'),h('pre',{class:'fp-report'},JSON.stringify({version:this.view?.base?.version,models:records},null,2)),h('button',{class:'btn',onclick:()=>done(null)},'关闭')));},
  paintLibs(){
    const v=this.view;v.back.querySelectorAll('.fp-write').forEach(b=>b.disabled=v.task||v.loading);
    const libs=typeof FPLibs!=='undefined'?FPLibs.list():[],on=libs.filter(l=>l.enabled).length;
    v.status.textContent=v.task?(v.message||'处理中…'):(v.message||'已启用 '+on+' / '+libs.length+' 个库 · 识别时全部跑一遍，取最强匹配（clear > close > weak，再比相对概率），结果里注明来源库');
    const when=t=>t?new Date(t).toLocaleString():'';
    v.list.replaceChildren(...libs.map(l=>{
      const sw=h('input',{type:'checkbox',checked:l.enabled,disabled:l.id==='whatsmyllm'||v.task,title:l.id==='whatsmyllm'?'默认库始终参与（个人样本在其中）':'参与识别',onchange:e=>{FPLibs.toggle(l.id,e.target.checked);v.message='';this.paint();}});
      const info=[l.builtin?'内置':l.url?'URL 导入':'文件导入',l.note,l.id==='whatsmyllm'?(()=>{let st=null;try{st=ProbeBankCache.status();}catch{}return (st?.source?st.source+' · ':'')+(v.base?.bank?.models?.length||st?.models||'—')+' 个型号'+(st?.error?' · '+st.error:'');})():l.models?l.models+' 个型号':l.id==='ikale'&&typeof IkaleBank!=='undefined'?IkaleBank.models.length+' 个型号（随包）':'',l.version?'数据 '+String(l.version).slice(0,10):'',l.updatedAt?'更新于 '+when(l.updatedAt):''].filter(Boolean).join(' · ');
      const acts=h('div',{class:'fp-row-actions'});
      if(l.url||l.id==='whatsmyllm')acts.append(h('button',{class:'btn ghost sm fp-write',disabled:v.task,onclick:()=>void this.task(async()=>{v.message='正在更新 '+l.name+'…';this.paint();await FPLibs.update(l.id);v.message=l.name+' 已更新';})},'更新'));
      if(l.site)acts.append(h('button',{class:'btn ghost sm',onclick:()=>Host.openExternal?.(l.site)},'网站'));
      if(!l.builtin)acts.append(h('button',{class:'btn ghost sm fp-write',disabled:v.task,onclick:async()=>{if(!await Dialog.confirm({title:'删除指纹库',text:'删除「'+l.name+'」？只删除本机保存的库数据，不影响对话和测试记录。',ok:'删除'}))return;FPLibs.remove(l.id);v.message='已删除 '+l.name;this.paint();}},'删除'));
      return h('label',{class:'fp-library-row fp-lib-row'+(l.enabled?'':' off'),'data-lib':l.id},sw,h('div',{},h('b',{},l.name),h('small',{},info||'—')),acts);
    }));
  },
  details(row){void Dialog.open((box,done)=>{const data={model:row.model,message:row.message,score:row.score,result:row.result,outputs:row.outputs,count:row.count,error:row.error,audit:row.audit||{note:"旧版记录没有逐条核验原因；可在原对话补核验，无需重新发送探针"}};box.append(h('div',{class:'dlg-t'},'测试详情（不会作为训练标签）'),h('pre',{class:'fp-report'},JSON.stringify(data,null,2)),h('div',{class:'dlg-row'},h('button',{class:'btn ghost',onclick:()=>void FileExport.text(JSON.stringify(data,null,2),'fingerprint-test-'+Date.now()+'.json')},'导出此记录'),h('button',{class:'btn',onclick:()=>done(null)},'关闭')));});},
  paint(){
    const v=this.view;if(!v||!v.back.isConnected)return;
    v.search.hidden=v.mode==='libs';v.libAdd.hidden=v.mode!=='libs';v.tabs.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('on',v.mode===['libs','models','samples','tests'][i]));
    if(v.mode==='libs')return this.paintLibs();
    v.back.querySelectorAll('.fp-write').forEach(b=>b.disabled=v.task||v.loading);
    v.status.textContent=v.loading?'正在读取本地数据…':(v.message||(v.mode==='tests'?'本账号测试记录 '+(v.testCount||0)+' 条 · 仅完整核验样本入库':'默认 '+(v.base?.bank.models.length||0)+' 型号 · 共享 '+v.refs.length+' 批样本 · 已启用 '+v.refs.filter(r=>r.enabled&&!r.conflict).length+' 批'));
    let rows=[];
    if(v.mode==='models'){
      const map=new Map();for(const m of v.base?.bank.models||[])map.set(PersonalMath.idOf(m.id),{model:PersonalMath.idOf(m.id),base:true,seedResponses:m.response_count,refs:[]});
      for(const r of v.refs){if(!map.has(r.model))map.set(r.model,{model:r.model,base:false,refs:[]});map.get(r.model).refs.push(r);}
      rows=[...map.values()].sort((a,b)=>a.model.localeCompare(b.model)).filter(r=>r.model.includes(v.query)).map(r=>()=>{
        const groups=new Set(r.refs.filter(x=>x.enabled&&!x.conflict).map(x=>x.group)),conflicts=r.refs.filter(x=>x.conflict).length;
        return h('div',{class:'fp-library-row'},h('div',{},h('b',{},r.model),h('small',{},(r.base?'默认 '+(r.seedResponses||'—')+' 条参考响应':'共享扩展')+' · 共享 '+r.refs.length+' 批 · '+groups.size+' 个启用对话'+(conflicts?' · 冲突 '+conflicts:'')+(!r.base&&groups.size<3?' · 样本不足，暂不作为明确命中':''))),r.refs.length?h('div',{class:'fp-row-actions'},h('button',{class:'btn ghost sm',disabled:v.task,onclick:()=>void this.modelAction(r.model)},r.refs.some(x=>!x.enabled&&!x.conflict)?'启用':'停用'),h('button',{class:'btn ghost sm',disabled:v.task,onclick:()=>void this.modelAction(r.model,true)},'删除样本')):h('button',{class:'btn ghost sm',onclick:()=>this.defaultDetails(r.model)},'查看模板（只读）'));
      });
    }else if(v.mode==='samples')rows=v.refs.filter(r=>r.model.includes(v.query)).sort((a,b)=>b.at-a.at).map(r=>()=>h('div',{class:'fp-library-row'},h('div',{},h('b',{},r.model+' · '+(r.tier||'档位未知')),h('small',{},(r.conflict?'冲突隔离':r.enabled?'已启用':'待确认／已停用')+' · '+(r.source==='local-api'?'本机接口核验':'导入声明')+' · '+(r.context==='history'?'历史上下文':'新上下文')),h('small',{},'3 条完整探针 · '+r.outputs.map(x=>x.length).join('/')+' 数字 · 样本 '+r.id.slice(0,10)))));
    else rows=v.tests.map(r=>()=>h('div',{class:'fp-library-row'},h('div',{},h('b',{},r.model+(Number.isFinite(r.probability)?' ('+(r.probability*100).toFixed(1)+'%)':'')),h('small',{},new Date(r.at).toLocaleString()+' · '+(r.kind==='identify-only'?'仅校对':'参考核验')+(Number.isFinite(r.score)?' · 推理分 '+r.score:'')),h('small',{},r.message)),h('button',{class:'btn ghost sm',onclick:()=>this.details(r)},'详情')));
    const pages=Math.max(1,Math.ceil((v.mode==='tests'?v.testCount:rows.length)/30));v.page=Math.min(v.page,pages-1);v.list.replaceChildren(...(v.mode==='tests'?rows:rows.slice(v.page*30,(v.page+1)*30)).map(f=>f()));
    if(!rows.length)v.list.append(h('p',{class:'dim'},'暂无记录。可在侧栏多选对话后点击“测指纹”。'));
    if(pages>1)v.list.append(h('div',{class:'fp-library-pages'},h('button',{class:'btn ghost sm',disabled:v.page===0,onclick:()=>{v.page--;if(v.mode==='tests')void this.reload();else this.paint();}},'上一页'),h('span',{},(v.page+1)+' / '+pages),h('button',{class:'btn ghost sm',disabled:v.page===pages-1,onclick:()=>{v.page++;if(v.mode==='tests')void this.reload();else this.paint();}},'下一页')));
  },
};
