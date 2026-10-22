// Status-bar shortcut: inspect only the current region; explicitly switch only this account's ProxyIP.
const RegionIP = {
  busy:false, view:null,
  norm:x=>String(x||'').trim().toLowerCase(),
  effReg(a) { return String(a?.region||a?.routeHome||IP.loc||'').trim().toUpperCase(); },
  signature(a) { return JSON.stringify([a?.id,a?.region||'',a?.proxy||'',a?.proxyIp||'',a?.nodeId||'']); },
  async read(owner) {
    const [info,data,accounts]=await Promise.all([Host.info(),Host.shared('pippool'),Host.listAccounts(true),typeof Nodes!=='undefined'&&Nodes.load?Nodes.load().catch(()=>{}):null]);
    const a=info?.account;
    if(!a?.id||(owner&&a.id!==owner)||(UI.host?.account?.id&&UI.host.account.id!==a.id))throw Error('当前账号已改变，请重新打开 IP 列表');
    if(data!=null&&(typeof data!=='object'||Array.isArray(data)||(data.ips&&(typeof data.ips!=='object'||Array.isArray(data.ips)))))throw Error('IP 列表格式异常，请刷新检查');
    if(!Array.isArray(accounts))throw Error('无法读取 IP 占用状态，请稍后重试');
    Pool.d={...Pool.blank(),...data};Nodes.accts=accounts;UI.host=info;return {...a};
  },
  exits(a) { return new Set([IP.ip,Pool.d?.ips?.[a.proxyIp]?.eg].map(this.norm).filter(Boolean)); },
  same(k,e,a) {
    const current=this.norm(a.proxyIp),host=Pool.parse(current)?.host,other=Pool.parse(k)?.host;
    return this.norm(k)===current||!!(host&&other===host)||this.exits(a).has(this.norm(e?.eg));
  },
  candidates(a,tried=new Set()) { const cc=this.effReg(a); return Pool.avail(cc,a.id,tried).filter(k=>!this.same(k,Pool.d.ips[k],a)); },
  testing() { try { return [...Chats.values()].some(c => Fingerprint.isRunning(c) || (typeof PelicanTest !== 'undefined' && PelicanTest.isRunning(c))); } catch { return false; } },
  reason(a) {
    if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.busy)return '请先停止批量测指纹，再切换 IP';
    if(this.testing())return '有对话正在测指纹 / 鹈鹕测试，测完再切换 IP（换 IP 会让这一轮测试作废）';
    if(typeof RouteState!=='undefined'&&RouteState.locked(a))return '账号正在认证，线路已锁定；请完成或明确取消认证';
    if(!this.effReg(a))return '当前账号未绑定地区，不能自动挑选 IP';
    if(!isVless(a.proxy))return '当前不是地区 VLESS 连接，仅显示列表，不修改直连或本地代理';
    if(!(typeof NodeRoutes!=='undefined'&&NodeRoutes.adapter())&&(!Host.probe||!Host.saveAccount))return '当前平台不支持 IP 检测与切换';
    if(Gacha.busy())return '请先暂停抽卡，再手动切换 IP';
    return '';
  },
  rows(a) {
    const cc=this.effReg(a);
    const rows=Pool.entries().filter(([,e])=>cc&&e.loc===cc).map(([k,e])=>({k,e,current:this.norm(k)===this.norm(a?.proxyIp),state:Pool.state(k,e,a?.id),same:this.same(k,e,a||{})}));
    if(typeof NodeRoutes!=='undefined')for(const row of rows){const measurement=NodeRoutes.cache.get(RoutePolicy.key({...a,proxyIp:row.k}));const r=measurement&&Date.now()-measurement.at<300000?measurement.result:null;row.e={...row.e,ms:RoutePolicy.good(r)?r.ms:0,eg:RoutePolicy.good(r)?r.ip:row.e.eg,nodeUnmeasured:!RoutePolicy.good(r)};}
    const cur=String(a?.proxyIp||'').trim();if(cur&&(a.region===cc||this.effReg(a)===cc)&&!rows.some(r=>r.current))rows.unshift({k:cur,e:Pool.d?.ips?.[cur]||{},current:true,state:'wait',same:true});
    // 当前正在用的 IP：实时延迟通了就以实时为准，不再显示以前检测留下的「不可用 / 待检测」
    for(const row of rows)if(row.current){const live=IP.liveFor?IP.liveFor(row.k):0;if(live){row.e={...row.e,ms:live,eg:row.e.eg||IP.ip,nodeUnmeasured:false};if(row.state==='bad'||row.state==='wait')row.state='ok';}}
    const order={ok:0,cool:1,used:2,wait:3,risk:4,bad:5,ban:6};
    // 只列已评估为纯净的 IP（可用 / 冷却 / 被占用都是纯净的）；当前在用的始终显示
    return rows.filter(r=>r.current||['ok','cool','used'].includes(r.state)).sort((a,b)=>Number(b.current)-Number(a.current)||(order[a.state]-order[b.state])||(a.e.ms||9e9)-(b.e.ms||9e9)||a.k.localeCompare(b.k));
  },
  async switchNext({owner,progress=()=>{},noScreen=false}={}) {
    if(this.busy)return {ok:false,error:'正在切换，请勿重复点击'};
    this.busy=true;let locked='',writeStarted=false;
    try {
      const a=await this.read(owner),why=this.reason(a);if(why)throw Error(why);
      if(Pool.switching.has(a.id)||PoolGuard.busy||RegionAdvisor.busy)throw Error('已有自动切换或检测任务，请稍后重试');
      Pool.switching.add(a.id);locked=a.id;
      const measured=typeof NodeRoutes!=='undefined'?NodeRoutes.adapter():null;
      const configSig=typeof RouteState!=='undefined'?RouteState.signature(a):'';
      const sig=this.signature(a),oldExit=this.norm(IP.ip),exits=this.exits(a),tried=new Set();
      const running=()=>[...Chats.values()].some(c=>c.busy);
      const consent=running();let limited=0,screened=false;
      if(consent&&!await Dialog.confirm({title:'切换当前地区 IP',text:'有对话正在运行，切换网络可能中断回复或触发重连。是否继续？',ok:'继续切换'}))return {ok:false,cancelled:true};
      for(let round=0;round<4;round++){
        const fresh=await this.read(a.id);if(this.signature(fresh)!==sig||(measured&&RouteState.signature(fresh)!==configSig))throw Error('账号的地区、节点或当前 IP 已改变，本次切换已取消');
        if(Gacha.busy()||(!consent&&running()))throw Error('已有新任务开始，请确认后再切换 IP');
        let keys=this.candidates(a,tried).slice(0,3);
        // 先评估纯净度：高风险的直接拉黑删除，绝不切换过去；一个干净的都没有 → 弹窗一直筛选到出现为止
        if(keys.length&&typeof IPRep!=='undefined'&&IPRep.rate){await IPRep.rate(keys).catch(()=>{});const ok=new Set(this.candidates(a,tried));keys=keys.filter(k=>ok.has(k));}
        if(!keys.length&&!screened&&!noScreen&&typeof IPRep!=='undefined'&&IPRep.screen){screened=true;progress('没有非高风险 IP，正在筛选…');const sr=await IPRep.screen(a.region,{exceptId:a.id});if(sr.cancelled)return {ok:false,cancelled:true};if(sr.ok){round--;continue;}}
        if(!keys.length)break;keys.forEach(k=>tried.add(k));
        progress('正在检测同地区候选 IP · 第 '+(round+1)+' 组');
        let res;
        if(measured){
          const tested=await NodeRoutes.selector(measured).measure(keys.map(proxyIp=>({...RoutePolicy.fields(a),proxyIp})));
          for(const item of tested)NodeRoutes.cache.set(RoutePolicy.key(item.candidate),{at:Date.now(),result:item.result});
          const blocked=tested.find(x=>['verification','service'].includes(x.result?.kind));
          if(blocked)throw Error(blocked.result.error||'验证或服务异常，保留原线路，不继续换 IP');
          // 候选出口被 429：这个出口暂不可用，记入冷却，继续试下一组
          const lim=tested.filter(x=>x.result?.kind==='rate-limit').map(x=>x.candidate.proxyIp).filter(Boolean);limited+=lim.length;
          if(lim.length)try{await Pool.mutate(d=>{for(const k of lim){const e=d.ips?.[k];if(e){e.cool=Math.max(e.cool||0,now()+Math.max(1,+d.cool||30)*60e3);e.hits=(e.hits||0)+1;}}});}catch{}
          res=tested.map(x=>({...x.result,pip:x.candidate.proxyIp,brana:RoutePolicy.good(x.result)}));
        }else{
          let timer;res=await Promise.race([Host.probe({link:a.proxy,pips:keys,timeout:7000}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('候选 IP 检测超时，未切换')),24000);})]).finally(()=>clearTimeout(timer));
        }
        if(!Array.isArray(res))throw Error(res?.error||'候选 IP 检测失败，未切换');
        const matched=keys.map(k=>[k,res.find(x=>this.norm(x?.pip)===this.norm(k))]).filter(([,x])=>x);
        if(!measured)await Pool.mutate(d=>{for(const [k,x] of matched)Pool.apply(d,k,x);});
        const good=matched.filter(([,x])=>x.ip&&x.brana&&x.loc===a.region&&!exits.has(this.norm(x.ip))).sort((a,b)=>(a[1].ms||9e9)-(b[1].ms||9e9));
        for(const [k,x] of good){
          const latest=await this.read(a.id);if(this.signature(latest)!==sig||(measured&&RouteState.signature(latest)!==configSig))throw Error('配置已改变，本次切换已取消');
          if(Gacha.busy()||(!consent&&running()))throw Error('已有新任务开始，本次切换已取消');
          if(!this.candidates(a).includes(k)||this.exits(a).has(this.norm(x.ip)))continue; // Cooling/ownership may change during the probe.
          progress('正在应用 '+k+'，随后核对出口…');writeStarted=true;
          // Preserve the account's node and region; include proxy for Android's existing xout wrapper.
          const saved=measured?await NodeRoutes.selector(measured).apply(a,{...RoutePolicy.fields(a),proxyIp:k},RouteState.mode(a),x,{preservePolicy:true}):await Host.saveAccount({id:a.id,proxy:a.proxy,nodeId:a.nodeId||'',region:a.region,proxyIp:k});
          if(saved?.error)throw Error(saved.error);
          const info=await Host.info();if(info?.account?.id!==a.id||this.norm(info.account.proxyIp)!==this.norm(k)||info.account.region!==a.region||info.account.proxy!==a.proxy)throw Error('宿主未确认新 IP 配置');
          UI.host=info;
          if(typeof AutoRoute!=='undefined')AutoRoute.noteManualRoute?.(600000);
          try {await Pool.mutate(d=>{if(d.ips[k])d.ips[k].used=now();});}catch{}
          await sleep(800);if(IP.polling)await IP.polling;const at=now();await IP.poll();
          if(!IP.err&&IP.ip&&typeof IPRep!=='undefined'&&this.norm(IP.ip)!==this.norm(x.ip)){
            const liveEg=IPRep.normIp?.(IP.ip)||IP.ip;
            if(liveEg&&typeof Host!=='undefined'&&typeof Host.ippureDirect==='function'&&!Pool.d?.rep?.[liveEg]?.pu?.real){
              const dp=await Host.ippureDirect(liveEg).catch(()=>null);
              if(dp&&Number.isFinite(+dp.fs)){
                await Pool.mutate(d=>{IPRep.putPu?.(d,liveEg,{...dp,real:1});if(d.ips?.[k])d.ips[k].eg=liveEg;}).catch(()=>{});
                IPRep.invalidate?.(k);
              }
            }
            const liveSc=IPRep.score(k,{...(Pool.d?.ips?.[k]||{}),eg:liveEg});
            if(liveSc?.known&&liveSc.s<(IPRep.PURE||75)){
              await Pool.mutate(d=>{if(typeof Pool.banForever==='function')Pool.banForever(d,k,'切换后实测出口 '+liveEg+' 不纯净（'+liveSc.s+' 分）· 已自动拉黑');}).catch(()=>{});
              progress('候选 '+k+' 实测落地出口不纯净（'+liveSc.s+' 分），已拉黑并继续切换下一个…');
              continue;
            }
          }
          const verified=!IP.err&&IP.at>=at&&IP.loc===a.region&&this.norm(IP.ip)!==oldExit&&this.norm(IP.ip)===this.norm(x.ip);
          try{UI.renderAcct?.();Bar.render();}catch{}
          return {ok:true,verified,from:a.proxyIp||'',to:k,ip:IP.ip,region:a.region,message:verified?'已切换到 '+k+' · 出口 '+IP.ip:'新 IP 配置已应用，但实际出口尚未确认，请刷新检查'};
        }
      }
      return {ok:false,error:limited?'已检测的候选里有 '+limited+' 个出口也被限流（429），已记入冷却；其余不符合要求，未切换，当前配置保留':tried.size?'已检测的候选都不符合要求，未切换；当前配置保留':'当前地区没有其他可用 IP（当前、相同出口、冷却、占用或不可用的 IP 均已排除），当前配置保留'};
    }catch(e){return {ok:false,uncertain:writeStarted,error:(writeStarted?'切换结果未确认，请刷新查看当前配置；不会自动再次切换。':'')+describe(e)};}
    finally{if(locked)Pool.switching.delete(locked);this.busy=false;this.paint();}
  },
  // ---------- 连接模式：自动 / 节点 / 代理 / 直连 ----------
  // Strategy is independent of the actual effective route. Node mode supports tested node-only recovery.
  modeOf(a) { return (typeof RouteState!=='undefined'?RouteState: {mode:x=>isVless(x.proxy)?(x.routeAuto===false?'node':'auto'):isDirectP(x.proxy)?'direct':'proxy'}).mode(a); },
  lastNode(a) { const x=Store.get('lastnode:'+a.id,null); return x&&isVless(x.proxy)?x:null; },
  async setMode(k) {
    const v=this.view;if(!v||this.busy||v.loading)return;
    if(!v.picker)try{this.mountPicker();}catch{}
    if(v.picker){ await v.picker.selectMode(k); this.paint(); return; }
    if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.busy){toast('请先停止批量测指纹','err');return;}
    if(this.testing()){toast('有对话正在测指纹 / 鹈鹕测试，测完再切换','err');return;}
    if(Gacha.busy()){toast('请先暂停抽卡，再切换连接模式','err');return;}
    this.busy=true;v.error='';v.message='正在读取当前配置…';this.paint();
    try{
      const a=await this.read(v.owner),cur=this.modeOf(a);if(k===cur){v.message='';return;}
      if([...Chats.values()].some(c=>c.busy)&&!await Dialog.confirm({title:'切换连接模式',text:'有对话正在运行，切换网络可能中断回复。是否继续？',ok:'继续'}))return;
      if(isVless(a.proxy))Store.set('lastnode:'+a.id,{proxy:a.proxy,proxyIp:a.proxyIp||'',nodeId:a.nodeId||'',region:this.effReg(a)});
      let next=null;
      if(k==='auto'||k==='node'){
        if(isVless(a.proxy))next={proxy:a.proxy,proxyIp:a.proxyIp||'',nodeId:a.nodeId||'',region:this.effReg(a)};
        else{
          const last=this.lastNode(a);
          const siblingVless=(Nodes.accts||[]).find(x=>x&&x.id!==a.id&&isVless(x.proxy));
          const n=Pool.node()||(typeof NodeSpeed!=='undefined'&&NodeSpeed.best?.(Nodes.list))||(Array.isArray(Nodes.list)?Nodes.list[0]:null);
          const cc=last?.region||this.effReg(a)||siblingVless?.region||'SG';
          if(last)next={...last,region:last.region||cc};
          else if(n){const link=typeof Vless!=='undefined'&&Vless.toLink?Vless.toLink(n):Pool.link();next={proxy:link,nodeId:n.id||'',region:cc,proxyIp:cc?(Pool.pickSync(cc,a)||''):''};}
          else if(siblingVless){next={proxy:siblingVless.proxy,nodeId:siblingVless.nodeId||'',region:cc,proxyIp:cc?(Pool.pickSync(cc,a)||''):''};}
          else throw Error('还没有为这个账号选过节点和地区：请在账号设置「连接」里选「节点」并选择地区');
        }
      }else if(k==='direct')next={proxy:'direct',proxyIp:'',nodeId:'',region:''};
      else{
        v.message='正在检测本机代理端口（Clash 7890 / v2rayN 10809 等）…';this.paint();
        const found=(await LocalProxy.scan({force:true}).catch(()=>[])).find(x=>x.proxy&&x.ip);
        let px=found?.proxy||'';
        const typed=await Dialog.ask({title:'代理地址',value:px||(Host.platform==='android'?'':DEFAULT_PROXY),placeholder:'127.0.0.1:7890 或 socks5://user:pass@host:port',hint:found?'检测到本机代理 '+(found.name?found.name+' ':'')+'端口 '+found.port+(found.ip?' · 出口 '+found.ip:'')+'；可直接确定或改成自定义代理':'没有检测到可用的本机代理端口；请输入代理地址（http / socks5）',ok:'使用',max:200});
        if(typed===null)return;px=typed.trim();
        if(!px||proxyErr(px)||isVless(px)||isDirectP(px))throw Error(proxyErr(px)||'请输入 http / socks5 代理地址');
        next={proxy:px,proxyIp:'',nodeId:'',region:''};
      }
      v.message='正在应用…';this.paint();
      const saved=await Host.saveAccount({id:a.id,...next});if(saved?.error)throw Error(saved.error);
      if(isVless(next.proxy)&&next.region&&next.proxyIp)try{await Pool.mutate(d=>{if(d.ips[next.proxyIp])d.ips[next.proxyIp].used=now();});}catch{}
      const auto=k!=='node';
      if(AutoRoute.adapter&&(UI.host?.account?.routeAuto!==false)!==auto){const r=await AutoRoute.adapter.enabled(auto).catch(e=>({error:describe(e)}));if(!r?.ok)throw Error(r?.error||'自动选路设置未确认');}
      UI.host=await Host.info();v.account=UI.host?.account||v.account;
      await sleep(600);if(IP.polling)await IP.polling;await IP.poll().catch(()=>{});
      v.message='已切换为「'+({auto:'自动',node:'节点',proxy:'代理',direct:'直连'}[k])+'」'+(IP.ip&&!IP.err?' · 出口 '+IP.ip:IP.err?' · 出口检测失败：'+IP.err:'');
      try{UI.renderAcct?.();Bar.render();}catch{}
      if(IP.ip&&!IP.err&&typeof UI!=='undefined'&&typeof UI.recoverFromBrowseMode==='function'){void UI.recoverFromBrowseMode();}
    }catch(e){v.error=describe(e);}
    finally{this.busy=false;v.sig='';this.paint();}
  },
  close() {
    if(this.busy||this.view?.picker?.busy){toast('切换中，请等待结果');return;}
    const v=this.view;if(!v)return;const wasOffline=!!(v.offlineAlert||IP.err||window.__BRANA_BROWSE_MODE);
    v.closed=true;clearInterval(v.tick);v.off?.();v.back.remove();this.view=null;
    if(wasOffline){
      try{if(typeof SessionGate!=='undefined'&&SessionGate.active){window.__BRANA_BROWSE_MODE=true;SessionGate.active.cancel?.();}}catch{}
      if(typeof UI!=='undefined'&&!UI.authed&&typeof UI.enterBrowseMode==='function'){
        try{UI.enterBrowseMode('已进入离线查阅模式（可直接浏览本地缓存对话）');}catch{}
      }
    }
  },
  async reload(checkExit=false) {
    const v=this.view;if(!v||v.loading||this.busy)return;v.loading=true;v.error='';v.message='';this.paint();
    try{const a=await this.read(v.owner);if(checkExit){if(IP.polling)await IP.polling;await IP.poll();}if(this.view===v&&!v.closed){v.account=a;v.owner=a.id;this.mountPicker();if(checkExit&&IP.err)v.error='列表已刷新，出口读取失败：'+IP.err;}}catch(e){if(this.view===v)v.error=describe(e);}
    finally{if(this.view===v){v.loading=false;v.sig='';this.paint();}}
  },
  mountPicker(){
    const v=this.view;if(!v||v.picker||typeof NodeRoutes==='undefined')return;
    const picker=NodeRoutes.field(v.account,{live:true,footer:true,onApplied:account=>{v.account=account;v.offlineAlert=false;v.sig='';this.paint();if(typeof UI!=='undefined'&&typeof UI.recoverFromBrowseMode==='function')void UI.recoverFromBrowseMode();}});
    if(!picker)return;v.picker=picker;picker.inp.querySelector('.pseg').hidden=true;v.back.classList.add('rip-has-picker');v.editor.replaceChildren(picker.block());
  },
  open(opts={}) {
    if(window.__ancWebbar&&window.BranaBrowser?.route){void window.BranaBrowser.route().catch(e=>toast(describe(e),'err'));return;}
    // 打开时列表超过 10 分钟没更新：后台悄悄重测当前地区的出口 IP（不挡界面，结果回来自动刷新列表）
    try { if (typeof RouteWarm !== 'undefined') setTimeout(() => void RouteWarm.tick(), 1200); } catch {}
    if(this.view&&!this.view.back.isConnected&&!this.busy)this.close();
    if(this.view){if(opts?.offlineAlert)this.view.offlineAlert=true;this.paint();this.view.back.querySelector('.rip-x')?.focus();return;}
    const v=this.view={account:UI.host?.account||{},owner:UI.host?.account?.id||'',loading:false,error:'',message:'',closed:false,offlineAlert:!!opts?.offlineAlert};
    if(typeof IPRep!=='undefined'&&IPRep.prime&&!(typeof Pool!=='undefined'&&Pool.prog))void IPRep.prime(v.account.region||IP.loc);
    v.back=h('div',{class:'modal-back region-ip-back',onclick:e=>{if(e.target===v.back)this.close();}});
    v.title=h('div',{class:'modal-h rip-title',id:'region-ip-title'},'当前 IP');v.ipline=h('div',{class:'rip-ip'});v.chips=h('div',{class:'rip-chips'});v.info=h('div',{class:'rip-info'});v.list=h('div',{class:'rip-list',role:'list','aria-label':'当前地区 IP 列表'});v.status=h('div',{class:'rip-status',role:'status','aria-live':'polite'});
    v.refresh=h('button',{class:'btn ghost sm rip-refresh',onclick:()=>void this.reload(true)},icon('refresh'),'刷新 ProxyIP 列表');
    v.switch=h('button',{class:'btn rip-switch',onclick:async()=>{
      if(this.busy||v.loading)return;
      v.error='';v.message='正在读取最新状态…';
      const p=this.switchNext({owner:v.owner,progress:t=>{v.message=t;this.paint();}});this.paint();
      const result=await p;if(this.view!==v)return;v.account=UI.host?.account||v.account;v.error=result.error||'';v.message=result.cancelled?'已取消':result.message||'';v.sig='';this.paint();
    }},'一键切换');
    v.done=h('button',{class:'btn ghost',onclick:()=>this.close()},'关闭');
    const mb=(k,t,tip)=>h('button',{type:'button','data-k':k,title:tip,onclick:()=>void this.setMode(k)},t);
    v.editor=h('div',{class:'rip-editor'});
    v.mode=h('div',{class:'pseg rip-mode',role:'tablist','aria-label':'连接模式'},mb('auto','自动','明确选择后比较全部节点、本机代理和直连；显示实际采用的线路。出口 IP 被 429 限流时自动换出口 IP'),mb('node','节点','先检测再固定；网络故障时先换已验证节点，再换纯净 ProxyIP'),mb('proxy','代理','本机代理（自动检测 Clash 7890 / v2rayN 等）或手动输入 http / socks5 地址'),mb('direct','直连','不走任何代理'));
    v.done=h('button',{type:'button',class:'rip-x',title:'关闭（离线时可直接查阅本地历史对话）','aria-label':'关闭',onclick:()=>this.close()},icon('x'));
    // 自动选择已覆盖「一键切换」：弹窗只保留模式 + 连接设置；关闭在右上角
    v.back.append(h('div',{class:'modal region-ip',role:'dialog','aria-modal':'true','aria-labelledby':'region-ip-title'},h('div',{class:'rip-head'},h('div',{class:'rip-hl'},v.ipline,v.chips),v.done),h('div',{class:'modal-b'},v.mode,v.editor,v.info,v.list,v.status)));
    document.body.append(v.back);
    v.off=Bus.on('pool',()=>{if(!v.closed)this.paint();});v.tick=setInterval(()=>{if(!v.back.isConnected){if(!this.busy)this.close();return;}this.paint();},1000);
    void this.reload();v.done.focus();
  },
  paint() {
    const v=this.view;if(!v||v.closed)return;
    if(UI.host?.account?.id===v.owner)v.account=UI.host.account;
    const a=v.account||{},cc=this.effReg(a),rows=this.rows(a),why=this.reason(a),keys=cc?this.candidates(a):[];
    { // 头部：当前 IP（国旗 + 大号 IP）+ 地区 / 实时延迟 / 纯净度 / 线路
      const ip=IP.ip||'',f=flagOf(IP.loc||cc)||'🌐',ms=IP.rtt||IP.liveFor?.(a.proxyIp)||0;
      const rttTimeout=Boolean(IP.rttFail>0&&!IP.quietFail?.());
      const liveOk=Boolean(ip&&!IP.err&&!rttTimeout);
      if(liveOk){
        if(v.offlineAlert)v.offlineAlert=false;
        if(typeof AutoRoute!=='undefined'&&AutoRoute.failed)AutoRoute.failed=false;
        if(window.__BRANA_BROWSE_MODE&&typeof UI!=='undefined'&&typeof UI.recoverFromBrowseMode==='function')void UI.recoverFromBrowseMode();
      }
      const isOff=!liveOk&&!!(v.offlineAlert||IP.err||rttTimeout||(typeof AutoRoute!=='undefined'&&AutoRoute.failed));
      const arBusy=Boolean(typeof AutoRoute!=='undefined'&&AutoRoute.busy);
      const sig=[ip,IP.loc,cc,ms,a.proxyIp,a.proxy,IP.err,isOff,arBusy].join('|');
      if(v.hsig!==sig){v.hsig=sig;
        // 一行：国旗 + 国家代码 + IP + 实时延迟（不再写「日本」、不再列线路小字；不右对齐，右边不留大空白）
        const code=String(IP.loc||cc||'').toUpperCase();
        const e=a.proxyIp&&typeof Pool!=='undefined'?Pool.d?.ips?.[a.proxyIp]:null,sc=e&&typeof IPRep!=='undefined'?IPRep.score(a.proxyIp,e):null,rl=sc?IPRep.label(sc):'';
        const pipNote=a.proxyIp&&ip&&!ip.startsWith(String(a.proxyIp).split(':')[0])?'（入口 '+String(a.proxyIp).split(':')[0]+'）':'';
        // 手机紧凑：第一行「当前 IP 🇯🇵 JP 61.124.1.97」完整显示，延迟 / 纯净度 / 住宅等标签放第二行
        v.ipline.replaceChildren(v.title,h('span',{class:'rip-flag'},f),...(code?[h('span',{class:'rip-cc'},code)]:[]),h('b',{title:ip+(pipNote?' '+pipNote:'')},(ip||(IP.err?'出口检测失败':'正在获取…'))+pipNote));
        const chips=[
          isOff?h('span',{class:'rip-chip bad'},arBusy?'检测到连接超时 · 正在自动切换最优节点 / ProxyIP…':'无法连接 · 请切换节点（点右上角 × 可直接离线查阅）'):null,
          ms&&!rttTimeout?h('span',{class:'rip-chip dly '+(ms<300?'d-good':ms<600?'d-mid':'d-bad'),title:'实际延迟（节点 + ProxyIP）\n'+(typeof IP!=='undefined'&&IP.rttTip?IP.rttTip():'')},ms+' ms · 实时'):rttTimeout?h('span',{class:'rip-chip dly d-fail',title:'当前线路实时探测超时'},'超时 · 实时'):null,
          rl&&rl!=='未评估'?h('span',{class:'rip-chip risk '+(rl==='纯净'?'r-good':rl==='一般'?'r-mid':rl==='高风险'?'r-bad':'r-none'),title:'纯净度 '+sc.s+'%'},rl+' '+Math.round(sc.s)+'%'):null,
          (()=>{const x=e&&typeof IPRep!=='undefined'&&IPRep.kind?IPRep.kind(a.proxyIp,e):null;return x?h('span',{class:'rip-chip ipt '+x.c,title:x.why},x.t):null;})()].filter(Boolean);
        v.chips.replaceChildren(...chips); v.chips.hidden=!chips.length;
      }
    }
    v.info.textContent='当前出口：'+(IP.ip||'未获取')+'\n当前 ProxyIP：'+(a.proxyIp||(isVless(a.proxy)?'未设置（节点本身代理）':'未设置（当前使用本地代理/直连）'))+(cc?'\n当前地区：'+cc:'\n未绑定地区，仅按已知出口地区查看列表');
    const sig=rows.map(r=>`${r.k}|${r.current?1:0}|${r.state}|${r.same?1:0}|${r.e.eg||''}|${r.e.ms||0}|${Math.max(0,Math.ceil(((r.e.cool||0)-now())/60000))}`).join('\n');
    if(v.sig!==sig){v.sig=sig;v.list.replaceChildren(...rows.map(r=>{
      const label=r.current?('当前'+(r.state==='cool'?' · 冷却 '+Math.max(1,Math.ceil((r.e.cool-now())/60000))+' 分钟':'')):r.state==='cool'?'冷却 '+Math.max(1,Math.ceil((r.e.cool-now())/60000))+' 分钟':r.state==='ok'?(r.same?'相同出口':'可用'):({used:'其他账号占用',wait:'待检测',risk:'高风险',bad:'不可用',ban:'已拉黑'}[r.state]||r.state);
      return h('div',{class:'rip-row'+(r.current?' current':''),role:'listitem'},h('div',{class:'rip-address'},h('b',{title:r.k},r.k),h('small',{},'出口 '+(r.e.eg||'未检测')+(r.e.ms?' · '+r.e.ms+'ms':r.e.nodeUnmeasured?' · 本节点未检测':''))),h('span',{class:'rip-state '+(r.current?'current':r.state)},label));
    }));if(!rows.length)v.list.append(h('p',{class:'note'},v.loading?'正在读取 IP 列表…':'当前地区暂无已记录的 IP'));}
    v.status.textContent=v.loading?'正在读取最新列表…':v.error||v.message||(v.picker?'':why||'');v.status.hidden=!v.status.textContent;v.status.classList.toggle('bad',!!v.error);
    v.switch.disabled=this.busy||v.loading||!!v.error||!!why||!keys.length;v.switch.textContent=this.busy?'切换中…':'一键切换';
    v.mode.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',b.dataset.k===(v.picker?.routeMode||this.modeOf(a)));b.disabled=this.busy||v.loading||v.picker?.busy||!!a.authLocked;});
    v.refresh.disabled=this.busy||v.loading;v.done.disabled=this.busy;v.back.querySelector('.modal').dataset.busy=this.busy?'true':'';
  }
};
