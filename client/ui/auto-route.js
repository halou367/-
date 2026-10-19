// Route failover confirmation dialog with countdown and automatic fallback
const RouteConfirm = {
  job:null,
  ask({title='当前线路断开，是否切换到已验证节点？',text='',ok='立即切换',keep='否（保持当前）',seconds=5,defaultYes=true}={}){
    if(this.job)return this.job;
    this.job=new Promise(resolve=>{
      let left=Math.max(1,seconds|0),timer=0;
      const back=h('div',{class:'route-confirm-back',role:'presentation'});
      const count=h('b',{class:'rc-count'},String(left));
      const finish=v=>{clearInterval(timer);back.remove();removeEventListener('keydown',key,true);this.job=null;resolve(v);};
      const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}else if(e.key==='Enter'){e.preventDefault();finish(true);}};
      const go=h('button',{class:'btn',onclick:()=>finish(true)},ok),stay=h('button',{class:'btn ghost',onclick:()=>finish(false)},keep);
      back.append(h('div',{class:'dlg route-confirm',role:'alertdialog','aria-modal':'true'},
        h('div',{class:'dlg-t'},title),text?h('div',{class:'dlg-h'},text):null,
        h('div',{class:'dlg-h rc-tick'},count,defaultYes?' 秒后默认自动切换（点「否」保持当前节点）':' 秒后默认保持当前地区（点「'+ok+'」才切换）'),
        h('div',{class:'dlg-row'},h('span',{class:'grow'}),stay,go)));
      document.body.append(back);addEventListener('keydown',key,true);setTimeout(()=>(defaultYes?go:stay).focus(),30);
      timer=setInterval(()=>{left--;count.textContent=String(Math.max(0,left));if(left<=0)finish(Boolean(defaultYes));},1000);
    });
    return this.job;
  },
  // 检测到模型路由（路由到其他模型 / 同型号的强度削弱）时仅轻提示提醒，绝不因为路由误判而暂停对话（仅闭源模型突然出现开源思考才暂停）
  askModelRoute(chat, { routeType = 'model', fromLabel = '', toLabel = '', reason = '', seconds = 10 } = {}) {
    if (typeof Prefs !== 'undefined' && Prefs.routePausePrompt === false) return Promise.resolve(false);
    const isEffort = routeType === 'effort';
    const _legacyTitle = isEffort ? '检测到同型号的强度削弱，是否暂停对话？' : '检测到路由到其他模型，是否暂停对话？';
    void _legacyTitle; void seconds;
    const label = isEffort ? '检测到同型号的强度削弱' : '检测到路由到其他模型';
    const changeStr = (fromLabel && toLabel) ? ('识别变化：' + fromLabel + ' → ' + toLabel) : (toLabel ? ('当前检测：' + toLabel) : '');
    const text = [changeStr, reason].filter(Boolean).join(' · ') || '检测到当前对话模型或思考强度发生路由变化';
    if (chat) {
      chat._routePaused = false;
      try { Trace.note?.(chat.sid, '路由提醒（不暂停）：' + label + ' · ' + text, 'warn'); } catch {}
      try { chat.emit?.(); } catch {}
    }
    try { toast('路由提醒：' + label + (text ? ' · ' + text : '') + '（仅提醒，不暂停）', 'warn'); } catch {}
    return Promise.resolve(false);
  },
  // 同地区内故障恢复直接切换；一旦涉及跨地区（fromRegion !== toRegion），必须弹窗提示用户确认后才允许跨地区切换
  route(x){
    if(typeof document!=='undefined'&&document.querySelector('.lpick:not(.out)'))return Promise.resolve(true);
    const fromReg=String(x?.from?.region||x?.from?.routeHome||x?.current?.loc||(typeof IP!=='undefined'&&IP.loc)||'').trim().toUpperCase();
    const toReg=String(x?.result?.loc||x?.winner?.region||'').trim().toUpperCase();
    if(fromReg&&toReg&&fromReg!==toReg){
      return this.ask({
        title:'检测到跨地区切换出口，是否允许？',
        text:'当前地区 '+fromReg+' 暂无可用出口，即将切换到跨地区出口：'+(x?.label||toReg)+'（'+fromReg+' → '+toReg+'）。若需留在 '+fromReg+'，请点击「保持当前地区」。',
        ok:'允许跨地区切换',
        keep:'保持当前地区',
        seconds:15,
        defaultYes:false,
      });
    }
    if(x?.mode==='node'||x?.mode==='ip'||x?.reason==='latency'||x?.reason==='limited'||x?.reason==='error-switch')return Promise.resolve(true);
    return Promise.resolve(true);
  },
};
// 本机网络环境自检：Clash 的系统代理 / TUN 会不会影响账号线路；「本机 → 节点」这一段通不通（只读，不改任何设置）
const NetEnv = {
  // info = Host.netEnv() 的结果 → [{lv:'ok'|'warn'|'bad'|'info', text}]
  explain(i) {
    const L = [], add = (lv, text) => L.push({ lv, text });
    if (!i) return [{ lv: 'bad', text: '读取失败' }];
    const sp = String(i.systemProxy || '');
    if (/^(PROXY|HTTPS?|SOCKS)/i.test(sp)) add('info', '系统代理已开启（' + sp + '，多半是 Clash 的「系统代理」）。账号窗口使用自己的代理设置，不读系统代理，所以不受它影响。');
    else add('ok', '没有开启系统代理。');
    const tun = (i.ifaces || []).length > 0 || i.fakeNet || i.fakeIp || i.node?.fakeIp;
    if (tun) add('warn', 'Clash 的 TUN（虚拟网卡）看起来开着' + ((i.ifaces || []).length ? '：' + i.ifaces.join('、') : '') + (i.fakeIp || i.node?.fakeIp ? '；域名解析返回了 198.18.x 假地址（fake-ip）' : '') + '。TUN 会接管本机所有出站连接，包括内置 xray 连节点的那一段，实际路径变成：本机 → Clash → 节点 → ProxyIP → Brana，多套一层，容易超时。建议在 Clash 规则里让节点域名 / IP 走 DIRECT，或测试时关掉 TUN。');
    else add('ok', '没有发现 TUN / fake-ip：本机到节点这一段是直接出去的。');
    if (i.kind === 'direct') add('info', '这个账号是「直连」：不经过节点和 ProxyIP，只受本机网络（以及上面的 TUN）影响。');
    if (i.kind === 'proxy') {
      const local = /^(127\.|localhost|::1)/i.test(i.proxyHost || '');
      add(local ? 'warn' : 'info', '这个账号走「代理」：' + (i.proxyHost || '?') + ':' + (i.proxyPort || '?') + (i.defaultProxy ? '（代理栏留空时的默认值，7890 是 Clash 的默认端口）' : '') + (local ? '。这是本机端口，多半就是 Clash：这个账号依赖 Clash 开着，Clash 卡了它就卡。' : '。'));
    }
    if (i.kind === 'node') {
      const n = i.node || {};
      add('info', '线路：本机（直接，不经 Clash 系统代理）→ 节点 ' + (n.host || '?') + ':' + (n.port || '?') + '（' + (n.network || '') + (n.security && n.security !== 'none' ? '+' + n.security : '') + '）→ ' + (i.proxyIp ? 'ProxyIP ' + i.proxyIp : '节点自己的出口（未设 ProxyIP）') + ' → arena.ai');
      if (n.err) add('bad', '节点域名解析 / 连接检测失败：' + n.err);
      else if (n.tcp) {
        const ok = n.tcp.filter(x => x >= 0), bad = n.tcp.length - ok.length, avg = ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : 0;
        if (!ok.length) add('bad', '本机 → 节点：4 次 TCP 连接全部失败（' + (n.ips || []).join(' / ') + '）。这一段不通，问题在本机网络到节点之间（运营商 / 节点被封 / Clash 拦截），和 ProxyIP 无关。');
        else if (bad) add('warn', '本机 → 节点：4 次里 ' + bad + ' 次失败，成功的平均 ' + avg + ' ms。这一段本身就不稳定（运营商到 Cloudflare 的线路抖动 / 被 TUN 转发）。');
        else add(avg > 400 ? 'warn' : 'ok', '本机 → 节点：4 次连接都成功，平均 ' + avg + ' ms（' + n.tcp.join(' / ') + '）。' + (avg > 400 ? '偏高。' : '这一段正常。如果仍然超时，问题更可能在「节点 → ProxyIP → Brana」那一段。'));
      }
      if (i.xray && !i.xray.running) add('bad', '内置 xray 没有在运行。');
    }
    return L;
  },
  async open() {
    if (!Host.netEnv) { toast('这个版本只有桌面版支持网络环境自检', 'err'); return; }
    const box = h('div', { class: 'netenv' }, h('p', { class: 'dim' }, '检测中（约 5–10 秒）…'));
    const m = modal('本机网络环境', box, h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => m.remove() }, '关闭')));
    try {
      const i = await Host.netEnv(), lines = this.explain(i), col = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--fg3)' }, mark = { ok: '✓', warn: '!', bad: '✗', info: 'i' };
      box.replaceChildren(...lines.map(x => h('p', { style: 'margin:6px 0;line-height:1.5' }, h('b', { style: 'color:' + col[x.lv] + ';margin-right:6px' }, mark[x.lv]), x.text)),
        i?.xray?.log ? h('details', {}, h('summary', { class: 'dim' }, 'xray 最近日志（出现 timeout / failed / refused 等才有参考价值）'), h('pre', { style: 'white-space:pre-wrap;font-size:11px;max-height:160px;overflow:auto' }, i.xray.log)) : null);
    } catch (e) { box.replaceChildren(h('p', { class: 'bad' }, '检测失败：' + describe(e))); }
  },
};
// Single recovery owner per account page. Transport recovery never sends business messages.
// 热备兜底库（StandbyPool）：日常使用与抽卡开始时自动在后台预检储备「第二 IP」与备用节点，
// 一旦遇到 429 限流、连接超时、401/403/404/5xx 或网络报错，0 等待直接顶上（不需要现场检查），
// 同时后台立刻补充下一个备用 IP；若热备也不可用再走并发快速检测。
const StandbyPool = {
  ips: [],
  nodes: [],
  warming: false,
  lastWarmAt: 0,
  MAX_IPS: 4,
  MAX_NODES: 2,
  TTL: 720000,
  prune(owner, curPip = '', curProxy = '') {
    const t = now(), p = String(curPip || '').trim().toLowerCase();
    this.ips = this.ips.filter(x => x && x.owner === owner && t < x.expiresAt && x.result?.ticket && String(x.candidate?.proxyIp || '').toLowerCase() !== p && (!curProxy || x.candidate?.proxy === curProxy));
    this.nodes = this.nodes.filter(x => x && x.owner === owner && t < x.expiresAt && x.result?.ticket && x.candidate?.proxy !== curProxy);
  },
  take(first, mode = 'ip') {
    const a = first?.account;
    if (!a?.id) return null;
    this.prune(a.id, a.proxyIp, a.proxy);
    const pool = first?.pool || {}, at = now();
    const curReg = String(a.region || a.routeHome || '').trim().toUpperCase();
    const isUsable = item => {
      const pip = String(item?.candidate?.proxyIp || '').trim();
      const itemReg = String(item?.loc || item?.candidate?.region || item?.result?.loc || '').trim().toUpperCase();
      if (curReg && itemReg && itemReg !== curReg) return false; // 跨地区候选不能绕过确认弹窗静默切换
      if (!pip) return true;
      const e = pool.ips?.[pip];
      if (e && (e.gone || e.cool > at || pool.ban?.[pip.toLowerCase()])) return false;
      if ((first?.accounts || []).some(x => x.id !== a.id && String(x.proxyIp || '').toLowerCase() === pip.toLowerCase())) return false;
      return true;
    };
    const primary = mode === 'ip' ? this.ips : this.nodes;
    const secondary = mode === 'ip' ? this.nodes : this.ips;
    for (const q of [primary, secondary]) {
      while (q.length) {
        const item = q.shift();
        if (isUsable(item)) {
          if (typeof setTimeout === 'function') setTimeout(() => void this.replenish('consumed'), 150);
          return item;
        }
      }
    }
    if (typeof setTimeout === 'function') setTimeout(() => void this.replenish('empty'), 100);
    return null;
  },
  async replenish(why = 'auto') {
    if (typeof window !== 'undefined' && (window.__routeFixture || window.__fixture)) return;
    if (this.warming || typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if ((typeof NodeRoutes !== 'undefined' && NodeRoutes.manual > 0) || (typeof Pool !== 'undefined' && Pool.switching?.size > 0)) return;
    if (why !== 'gacha-start' && why !== 'consumed' && why !== 'post-switch' && now() - this.lastWarmAt < 20000) return;
    const a = typeof UI !== 'undefined' ? UI.host?.account : null;
    if (!a?.id || !AutoRoute.adapter || !AutoRoute.engine || (typeof RouteState !== 'undefined' && RouteState.locked(a))) return;
    if (typeof isVless === 'function' && !isVless(a.proxy)) return;
    this.prune(a.id, a.proxyIp, a.proxy);
    if (this.ips.length >= 2 && (this.nodes.length >= 1 || why === 'auto')) return;
    this.warming = true;
    this.lastWarmAt = now();
    try {
      const first = await AutoRoute.adapter.read(a.id);
      if (!first?.account || first.account.id !== a.id || (typeof RouteState !== 'undefined' && RouteState.locked(first.account))) return;
      this.prune(a.id, first.account.proxyIp, first.account.proxy);
      const havePips = new Set(this.ips.map(x => String(x.candidate?.proxyIp || '').toLowerCase()));
      if (this.ips.length < 3) {
        const planIp = AutoRoute.engine.plan(first, 'ip', now());
        const cands = [];
        for (const [, list] of planIp.stages || []) {
          for (const c of list || []) {
            const pk = String(c.proxyIp || '').toLowerCase();
            if (pk && !havePips.has(pk) && c.proxy === first.account.proxy) {
              havePips.add(pk);
              cands.push(c);
            }
          }
        }
        const batch = cands.slice(0, Math.max(1, 3 - this.ips.length));
        if (batch.length) {
          const results = await Promise.all(batch.map(async c => {
            const r = await AutoRoute.adapter.probe({ ...c, kind: 'standby' }).catch(() => null);
            return { c, r };
          }));
          const workingNodes = new Set(results.filter(x => x.r?.ip || RoutePolicy.good(x.r)).map(x => x.c?.proxy).filter(Boolean));
          for (const { c, r } of results) {
            if (RoutePolicy.good(r) && r.ticket) {
              this.ips.push({
                owner: a.id,
                candidate: { ...c, region: r.loc || c.region || '' },
                result: r,
                ms: r.ms || 250,
                loc: r.loc || c.region || '',
                expiresAt: r.proofExpires ? r.proofExpires - 15000 : (now() + this.TTL),
              });
              if (typeof NodeRoutes !== 'undefined' && NodeRoutes.cache) {
                NodeRoutes.cache.set(RoutePolicy.key(c), { at: now(), result: r });
              }
            } else if (c.proxyIp && typeof Pool !== 'undefined' && (r?.ip || r?.kind === 'rate-limit' || workingNodes.has(c.proxy) || Pool.isNodeConfirmedAlive?.(c.proxy))) {
              try {
                void Pool.mutate(d => {
                  const e = d.ips?.[c.proxyIp];
                  if (!e) return;
                  e.fc = (e.fc || 0) + 1;
                  if (r?.kind === 'rate-limit') e.cool = Math.max(e.cool || 0, now() + 30 * 60000);
                  else if ((e.fc || 0) >= 3) Pool.banForever?.(d, c.proxyIp, '节点正常但热备 ProxyIP 连续不可用 · 已永久拉黑');
                });
              } catch {}
            }
          }
          if (this.ips.length > this.MAX_IPS) this.ips.length = this.MAX_IPS;
        }
      }
      if (this.nodes.length < 1 && (first.nodes || []).length > 1) {
        const planNode = AutoRoute.engine.plan(first, 'node', now());
        const nodeCands = [];
        const haveProxies = new Set([first.account.proxy, ...this.nodes.map(x => x.candidate?.proxy)]);
        for (const [, list] of planNode.stages || []) {
          for (const c of list || []) {
            if (c.proxy && !haveProxies.has(c.proxy)) {
              haveProxies.add(c.proxy);
              nodeCands.push(c);
            }
          }
        }
        const nb = nodeCands.slice(0, 2);
        if (nb.length) {
          const nRes = await Promise.all(nb.map(async c => ({ c, r: await AutoRoute.adapter.probe({ ...c, kind: 'standby' }).catch(() => null) })));
          for (const { c, r } of nRes) {
            if (RoutePolicy.good(r) && r.ticket) {
              this.nodes.push({
                owner: a.id,
                candidate: { ...c, region: r.loc || c.region || '' },
                result: r,
                ms: r.ms || 300,
                loc: r.loc || c.region || '',
                expiresAt: r.proofExpires ? r.proofExpires - 15000 : (now() + this.TTL),
              });
            }
          }
          this.nodes.sort((x, y) => (x.ms || 9999) - (y.ms || 9999));
          if (this.nodes.length > this.MAX_NODES) this.nodes.length = this.MAX_NODES;
        }
      }
    } catch {} finally {
      this.warming = false;
    }
  },
};
const AutoRoute = {
  standby: StandbyPool,
  ensureStandby(why='manual'){void StandbyPool.replenish(why);},
  // 切国家用的好好的就自动切换到对应国家（不同步弹窗、不切回旧的卡顿地区）
  adoptWorkingRegion(loc){
    try{
      const cc=String(loc||(typeof IP!=='undefined'&&!IP.err?IP.loc:'')||'').trim().toUpperCase();
      const a=typeof UI!=='undefined'?UI.host?.account:null;
      if(!cc||!a?.id||RouteState.locked(a))return false;
      const changed=a.region!==cc||a.routeHome!==cc;
      if(changed){
        a.region=cc;
        a.routeHome=cc;
        this.saveLastGood(a);
        try{UI.renderAcct?.();if(typeof Bar!=='undefined')Bar.render?.();}catch{}
      }
      return changed;
    }catch{return false;}
  },
  saveLastGood(a=UI.host?.account){if(!a?.id||(!a.proxy&&!a.proxyIp))return;try{Store.set('lastGoodRoute:'+a.id,{id:a.id,proxy:a.proxy||'',proxyIp:a.proxyIp||'',nodeId:a.nodeId||'',region:a.region||'',at:now()});}catch{}},
  getLastGood(id=UI.host?.account?.id){try{return id?Store.get('lastGoodRoute:'+id,null):null;}catch{return null;}},
  async rollbackLastGood(a=UI.host?.account){const g=this.getLastGood(a?.id);if(!a?.id||!g?.proxy||!this.adapter)return {ok:false,error:'尚无已记录的上次连通配置'};const pr=await this.adapter.probe({proxy:g.proxy,proxyIp:g.proxyIp||'',nodeId:g.nodeId||'',region:g.region||'',kind:'manual'});if(!RoutePolicy.good(pr))return {ok:false,error:pr?.error||'上次配置当前未通过检测'};const res=await this.adapter.apply({id:a.id,expected:RoutePolicy.fields(a),expectedConfig:RouteState.signature(a),expectedMode:RouteState.mode(a),route:{proxy:g.proxy,proxyIp:g.proxyIp||'',nodeId:g.nodeId||'',region:g.region||pr.loc||'',routeHome:g.region||pr.loc||''},manual:true,mode:'node',ticket:pr.ticket});if(res?.account)Object.assign(a,res.account);Bus.emit('host');return {ok:!!res?.ok,route:g};},
  engine:null, adapter:null, busy:false, status:'尚未检测', lastChanged:0, manualLockUntil:0, streamFails:[], netErrorCount:0, netErrorTimes:[], initialized:false, needsOptimalUpgrade:false,
  noteManualRoute(ms=600000){
    const t=typeof now==='function'?now():Date.now();
    this.manualLockUntil=Math.max(this.manualLockUntil||0,t+Math.max(60000,Number(ms)||600000));
    this.failed=false;
    this.netErrorCount=0;
    this.netErrorTimes=[];
    if(this.engine)this.engine.next=Math.max(this.engine.next||0,t+60000);
    try{StandbyPool.ips=[];StandbyPool.nodes=[];}catch{}
    try{if(typeof ReadLimit!=='undefined')ReadLimit.until=0;}catch{}
    try{if(typeof Quota!=='undefined'&&Quota.clear)Quota.clear(true);}catch{}
  },
  isManualLocked(){
    const t=typeof now==='function'?now():Date.now();
    return t<(this.manualLockUntil||0);
  },
  noteNetProblem(){
    this.netErrorTimes=[];
    this.netErrorCount=0;
    return 0;
  },
  canFailover(a=UI.host?.account){return !!this.adapter&&!!a&&!RouteState.locked(a)&&!this.authPending&&(RouteState.canRecover(a)||isVless(a.proxy)||Boolean(a.proxyIp));},
  enabled(){return this.canFailover(UI.host?.account);},
  init(){
    if(this.initialized)return;this.initialized=true;
    this.adapter=RouteHost.create(window.BranaHost,window.BranaAndroid,Vless);if(!this.adapter)return;
    // 手动「应用更改」进行中：恢复流程立即让路；正常可用线路保持黏性，绝不按最低延迟反复切换
    const manual=()=>typeof NodeRoutes!=='undefined'&&NodeRoutes.manual>0;
    const engineAdapter={
      ...this.adapter,
      retryMs:200,
      fastCheck:true,
      networkFirst:false,
      batchSize:4,
      forceGlobalLowestLatency:()=>(this.netErrorCount||0)>2,
      banBadIp:(c,r)=>{if(c?.proxyIp&&typeof Pool!=='undefined'&&(r?.ip||r?.kind==='rate-limit'||Pool.isNodeConfirmedAlive?.(c.proxy)))void Pool.mutate(d=>{const e=d.ips?.[c.proxyIp];if(!e)return;e.fc=(e.fc||0)+1;if(r?.kind==='rate-limit')e.cool=Math.max(e.cool||0,now()+30*60000);else if((e.fc||0)>=3)Pool.banForever?.(d,c.proxyIp,r?.error||'节点正常但 ProxyIP 连续检测未通过 · 已永久拉黑');}).catch(()=>{});},
      standby:(first,mode,reason,groups)=>StandbyPool.take(first,mode,reason,groups),
      read:async(target)=>{
        const res=await this.adapter.read(target);
        if(res?.account&&!RouteState.locked(res.account)){
          res.enabled=true;
          res.account={...res.account,routeMode:res.account.routeMode==='node'?'node':'auto',routeAuto:res.account.routeMode!=='node',nodeFailover:true};
        }
        return res;
      },
      apply:async(o)=>{
        const raw=await this.adapter.read(o?.id);
        const realAcct=raw?.account||UI.host?.account;
        const expectedConfig=realAcct?RouteState.signature(realAcct):o.expectedConfig;
        const expectedMode=realAcct?RouteState.mode(realAcct):o.expectedMode;
        return this.adapter.apply({...o,expectedConfig,expectedMode,forceFailover:true});
      }
    };
    this.engine=new RoutePolicy.Engine({...engineAdapter,allowCrossRegionEscape:true,speed:n=>typeof NodeSpeed!=='undefined'?NodeSpeed.get(n.proxy):null,confirm:x=>this.noConfirm?true:RouteConfirm.route(x),cancelled:()=>!this.enabled()||manual()||(!this.forced&&this.reason==='network'&&NetHealth.proof>this.proof),progress:text=>{this.status=text;this.paint();Bus.emit('route-state');}});
    Bus.on('neterr',()=>this.request('network'));
    Bus.on('limited',why=>this.limited(why));
    // 出口检测（WebView 里的 /cdn-cgi/trace）偶尔超时不代表线路坏了；通了则自动同步实际出口国家并预热第二 IP，绝不因为后台探测超时触发循环恢复
    Bus.on('ip',()=>{
      if(!IP.err&&IP.loc){this.adoptWorkingRegion(IP.loc);void StandbyPool.replenish('ip-ok');}
    });
    Bus.on('rtt',()=>{});
    Bus.on('connection',()=>{if(NetHealth.recent()){this.failed=false;this._errHits=[];this.adoptWorkingRegion();}});
    addEventListener('online',()=>{if(!NetHealth.recent())void this.nodeAlive().then(ok=>{if(!ok)this.request('network');});});
    this.timer=setInterval(()=>{
      if(this.enabled()&&this.failed&&!this.busy&&navigator.onLine!==false){
        const t=typeof now==='function'?now():Date.now();
        if(t-(this._lastAutoRetryAt||0)>=120000){this._lastAutoRetryAt=t;this.failed=false;void this.request('network');}
      }
    },15000);
    // 自动模式：没有报错/断连时绝不主动换节点或切回旧地区，不在后台因延迟触发恢复
    Bus.on('nodespeed',()=>{clearTimeout(this.optT);this.optT=setTimeout(()=>void this.optimize(),2500);});
    if(typeof setTimeout==='function')setTimeout(()=>void StandbyPool.replenish('boot'),2500);
  },
  // 当前节点是否活着：2 分钟内测过且通就直接算通；否则单独测一次 generate_204（约 1 秒，不经 WebView）
  async nodeAlive(){
    try{
      const a=UI.host?.account;if(!a||!isVless(a.proxy)||typeof NodeSpeed==='undefined'||!Host.urlTest)return false;
      const r=NodeSpeed.get(a.proxy);if(r?.ok&&now()-(r.at||0)<120e3)return true;
      const x=await Promise.race([NodeSpeed.testOne(a.proxy,{rounds:1,timeout:2200}),sleep(3500).then(()=>null)]);
      return !!(x||NodeSpeed.get(a.proxy))?.ok;
    }catch{return false;}
  },
  async optimize(){ /* reason:'latency' */
    const a=UI.host?.account;
    if(!a||!this.adapter||this.busy||this.optimizing||this.authPending||a.authLocked||typeof NodeSpeed==='undefined'||NodeSpeed.testing)return;
    if(!isVless(a.proxy)||navigator.onLine===false)return;
    this.needsOptimalUpgrade=false;
    this.adoptWorkingRegion();
    void StandbyPool.replenish('optimize');
  },
  scheduleIdleOptimalUpgrade(){
    this.needsOptimalUpgrade=false;
    clearTimeout(this.idleOptT);
    this.idleOptT=setTimeout(()=>{
      this.adoptWorkingRegion();
      void StandbyPool.replenish('post-switch');
    },1200);
  },
  paint(){ if(!this.busy){this.notice?.remove();this.notice=null;return;}if(!this.notice){this.notice=h('div',{class:'route-recovery-note',role:'status'},h('i',{class:'spin'}),h('span'));document.body.append(this.notice);}this.notice.querySelector('span').textContent='线路恢复：'+this.status; },
  async request(reason='network',force=false){
    if(!this.enabled()||navigator.onLine===false){
      if(reason==='network'&&typeof UI!=='undefined'&&typeof RegionIP!=='undefined'&&!window.__routeFixture&&!window.__fixture){
        try{if(!UI.authed&&typeof UI.enterBrowseMode==='function')UI.enterBrowseMode('网络无法连接，已开启离线查阅 · 可切换节点或点 × 直接查阅本地对话');}catch{}
        try{RegionIP.open({offlineAlert:true});}catch{}
      }
      return {ok:false,disabled:true};
    }
    if(this.busy)return this.pending;
    if(typeof NodeRoutes!=='undefined'&&NodeRoutes.manual>0)return {ok:false,busy:true};
    if(!force&&reason==='network'&&NetHealth.recent())return {ok:true,changed:false,live:true};
    const owner=UI.host?.account?.id;
    if(PoolGuard.busy||RegionAdvisor.busy||Pool.switching.has(owner))return {ok:false,busy:true};
    if(!force&&Date.now()<this.engine.next)return {ok:false,cooldown:true};
    this.busy=true;Pool.switching.add(owner);this.failed=false;
    this.reason=reason;this.forced=force;this.proof=NetHealth.proof;
    this.pending=(async()=>{
      try{
        const r=await this.engine.run(reason,force);
        if(!this.enabled()||UI.host?.account?.id!==owner)return r;
        if(r.ok){
          this.status=r.changed?(r.standby?'已秒切热备线路：':'已切换：')+r.label+'，正在续接原对话':'当前线路服务检测通过';
          if(!r.changed&&r.account?.proxyIp){
            const keepPip=r.account.proxyIp;
            try{await Pool.mutate(d=>{const e=d.ips?.[keepPip];if(e){e.cool=0;e.gone=false;e.banned=false;e.ok=true;if(d.ban)delete d.ban[keepPip.toLowerCase()];}});}catch{}
          }else if(r.changed&&r.from?.proxyIp&&r.from.proxyIp!==r.account?.proxyIp){
            const old=r.from.proxyIp;
            const newPip=r.account?.proxyIp||'';
            const sameNode=Boolean(r.from?.proxy&&r.account?.proxy&&r.from.proxy===r.account.proxy&&old!==r.account?.proxyIp);
            try{
              await Pool.mutate(d=>{
                // 只有确认是同一个 VLESS 节点下换了新 ProxyIP 就恢复连通（说明节点没问题，纯粹是旧 ProxyIP 坏了），且旧 IP 已连续多次失败，才永久拉黑；
                // 若是因为切换了 VLESS 节点才恢复，说明是旧节点故障，绝不误拉黑旧 ProxyIP！但无论如何给旧 IP 记冷却与使用时间戳，防止紧接着又切回同一个旧 IP 死循环。
                const e=d.ips?.[old];
                if(e){e.used=now();e.cool=Math.max(e.cool||0,now()+10*60e3);}
                if(newPip&&d.ips?.[newPip])d.ips[newPip].used=now();
                if(sameNode&&e&&(e.fc||0)>=3&&typeof Pool.banForever==='function')Pool.banForever(d,old,'同节点下该 ProxyIP 连续异常 · 已永久拉黑');
                else if(sameNode&&e){e.cool=Math.max(e.cool||0,now()+Math.max(1,+d.cool||30)*60e3);e.hits=(e.hits||0)+1;e.fc=(e.fc||0)+1;}
              });
            }catch{}
          }
          if(r.changed){
            if(typeof ReadLimit!=='undefined')ReadLimit.until=0;
            if(typeof Quota!=='undefined'&&Quota.clear)Quota.clear(true);
            if(typeof Pool!=='undefined'&&r.account?.nodeId&&isVless(r.account?.proxy))void Pool.setNode(r.account.nodeId).catch(()=>{});
            this.lastChanged=now();UI.host=await Host.info();
            const toReg=String(r.probe?.loc||r.account?.region||'').trim().toUpperCase();
            if(toReg)this.adoptWorkingRegion(toReg);
            if(typeof IP!=='undefined'){
              IP.err=null;IP.failures=0;IP.rttFail=0;
              if(r.probe?.ms>0){IP.rtt=r.probe.ms;IP.rttAt=now();}
              if(r.probe?.ip)IP.ip=r.probe.ip;
              if(r.probe?.loc)IP.loc=r.probe.loc;
              try{Bus.emit('ip');Bus.emit('rtt');}catch{}
            }
            UI.renderAcct?.();
            setTimeout(()=>{if(!this.busy){void IP.poll();void IP.ping?.();}},2500);
            const fromReg=String(r.from?.region||'').trim().toUpperCase();
            const isCrossRegion=Boolean(fromReg&&toReg&&fromReg!==toReg);
            if(r.mode==='ip'&&isCrossRegion){
              toast('已跨地区切换可用出口 IP（'+fromReg+' → '+toReg+'）：'+r.label);
            }
            this.scheduleIdleOptimalUpgrade();
          }
          if(typeof UI!=='undefined'&&typeof UI.recoverFromBrowseMode==='function')void UI.recoverFromBrowseMode();
          // Preserve lastSeq, live parts, pending delivery IDs and draft content. GET recovery only.
          if(r.changed)for(const c of Chats.values()){
            if(typeof c.recoverPendingDelivery==='function')void c.recoverPendingDelivery();
            if(c.loading||c.stopReq)continue;
            if(c.busy||c.streaming)c.restream();else if(c.loaded)c.reconcile().catch(()=>{});
          }
        }else if(r.declined){this.failed=false;this.status=r.error;}else if(!r.disabled&&!r.cancelled){
          this.failed=false;
          this.status=r.error||'暂未恢复，稍后重试';
          if(!r.stale&&!r.blocked&&reason!=='limited'&&reason!=='error-switch'&&typeof UI!=='undefined'&&typeof RegionIP!=='undefined'&&!window.__routeFixture&&!window.__fixture){
            try{if(!UI.authed&&typeof UI.enterBrowseMode==='function')UI.enterBrowseMode('网络无法连接，已开启离线查阅 · 可切换节点或点 × 直接查阅本地对话');}catch{}
            try{RegionIP.open({offlineAlert:true});}catch{}
          }
        }
        return r;
      }catch(e){this.failed=false;this.status='线路恢复失败：'+describe(e);return {ok:false,error:this.status};}
      finally{this.busy=false;this.paint();Pool.switching.delete(owner);Bus.emit('route-state');}
    })();return this.pending;
  },
  // 仅真实传输断连/超时才触发自动切换：429 / 404 / 401 / 403 或用户刚手动选定 IP 期间绝不自动把用户的可用 IP 切走；加严格防抖与冷却，绝不反复循环切换
  onErrorSwitch(err,where='api'){
    if(!this.enabled()||!RoutePolicy.shouldRotateOnError?.(err))return Promise.resolve({ok:false,skipped:true});
    if(where==='ip-timeout'||where==='rtt-timeout')return Promise.resolve({ok:false,skipped:true});
    if((typeof NodeRoutes!=='undefined'&&NodeRoutes.manual>0)||(typeof RegionIP!=='undefined'&&RegionIP.busy))return Promise.resolve({ok:false,skipped:true});
    const st=Number(err?.status||err?.httpStatus||0);
    if(st===429||st===404||st===401||st===403||err?.ipLimited||err?.rateLimitedLocally)return Promise.resolve({ok:false,skipped:true,status:st});
    if(this.isManualLocked()&&where!=='manual')return Promise.resolve({ok:false,skipped:true,manualLocked:true});
    const t=typeof now==='function'?now():Date.now();
    if(this.busy||t-(this.lastChanged||0)<45000||t-(this._lastErrSwitchAt||0)<30000)return Promise.resolve({ok:false,cooldown:true});
    if(where!=='manual'&&where!=='pre-send'&&where!=='send-timeout'&&where!=='create-chat'&&where!=='gacha'){
      this._errHits=(this._errHits||[]).filter(x=>t-x<60000);
      this._errHits.push(t);
      if(this._errHits.length<2)return Promise.resolve({ok:false,debounced:true});
    }
    this._lastErrSwitchAt=t;
    this.noteNetProblem();
    if(typeof ReadLimit!=='undefined')ReadLimit.until=0;
    const reason='error-switch';
    this.status='检测到连接报错（'+(st||'超时/断连')+'），正在切换备用线路…';
    Bus.emit('route-state');
    return this.request(reason,false);
  },
  unlimit(why){
    this.coolCurrentIp(why);
    this.status='Brana 限流（429）：按服务器要求等待后自动恢复，不更换出口 IP';Bus.emit('route-state');
    return Promise.resolve(false);
  },
  coolCurrentIp(why='429'){
    const a=UI.host?.account;if(!a)return;
    const curPip=String(a.proxyIp||'').trim(),curIp=String(IP.ip||'').trim();
    if((!curPip&&!curIp)||typeof Pool==='undefined')return;
    const rawWhy=String(why?.reason||why||'');
    const is429=rawWhy.includes('429');
    const errLabel=is429?'429 冷却中':'连接超时 · 冷却中';
    const coolUntil=now()+Math.max(10*60000,Number(why?.retryAfterMs)||(is429?30*60000:15*60000));
    try{
      void Pool.mutate(d=>{
        const mark=(k,e)=>{if(!e)return;e.cool=Math.max(e.cool||0,coolUntil);e.hits=(e.hits||0)+1;e.err=errLabel;if(!is429){e.fc=(e.fc||0)+1;e.at=now();}};
        if(curPip&&d.ips?.[curPip])mark(curPip,d.ips[curPip]);
        for(const [k,e] of Object.entries(d.ips||{})){if(e&&(k===curPip||k===curIp||e.eg===curIp))mark(k,e);}
      }).then(()=>{try{Bus.emit('pool');}catch{}}).catch(()=>{});
    }catch{}
    try{
      if(typeof RegionIP!=='undefined'&&RegionIP.state){
        for(const st of RegionIP.state.values()){
          for(const row of st.rows||[]){if(row.ip===curPip||row.ip===curIp){row.state='cool';row.cool=coolUntil;row.reason=errLabel;}}
        }
        RegionIP.refreshOpen?.();
      }
    }catch{}
  },
  limited(why){
    const wait=Math.max(15000,Number(why?.retryAfterMs)||30000);
    if(this.engine)this.engine.next=Math.max(this.engine.next||0,now()+wait);
    this.failed=false;this.status='触发 429 速率限制：保持当前出口 IP，等待 '+Math.ceil(wait/1000)+' 秒冷却后自动继续';Bus.emit('route-state');
  },
  async silent(c){
    // Also used on Android: quiet thinking/tools alone are not a connection failure.
    if(this.busy||c.stopReq||!c.busy||c.routeSilentJob||now()-(c.routeSilentAt||0)<30000)return;
    c.routeSilentAt=now();const cursor=c.lastSeq,gen=c.gen;
    c.routeSilentJob=(async()=>{
      const peek=await c.peekTurn(cursor,c.awaitId,6000).catch(()=>null);
      if(c.stopReq||!c.busy||c.gen!==gen||c.lastSeq!==cursor)return;
      if(peek?.n>0&&peek.last>+(cursor??-1)){
        const repeat=!!c.routeMissAt&&now()-c.routeMissAt<90000;c.routeMissAt=now();
        // First repair only the stream, preserving cursor/content/delivery IDs.
        c.restream();
        if(repeat&&this.enabled())return this.request('realtime-repeat');
      }
      // Unknown or quiet: let the stream's own bounded watchdog handle it.
    })().finally(()=>{c.routeSilentJob=null;});
    return c.routeSilentJob;
  },
  fault(e,kind='network'){
    if(!this.enabled())return;
    if(kind!=='stream'&&RoutePolicy.shouldRotateOnError?.(e)){
      void this.onErrorSwitch(e,kind);
      return;
    }
    if(!RoutePolicy.transportError(e))return;
    if(kind==='stream'){
      const t=now();this.streamFails=this.streamFails.filter(x=>t-x<60000);this.streamFails.push(t);
      if(this.streamFails.length>=2||e?.routeTimeout)void this.onErrorSwitch(e,'stream');
      else void this.request('network');
    }else void this.onErrorSwitch(e,kind);
  },
  row(){
    const state=h('small',{},this.status),on=h('input',{type:'checkbox',checked:RouteState.canRecover(UI.host?.account)||null});
    on.onchange=async()=>{const value=on.checked;on.disabled=true;try{const r=await this.adapter.enabled(value);if(!r?.ok)throw Error(r?.error||'设置未确认');UI.host=await Host.info();this.status=value?'自动恢复已开启':'自动恢复已关闭';if(value)void this.request('network',true);}catch(e){on.checked=!value;toast(describe(e),'err');}finally{on.disabled=false;Bus.emit('route-state');}};
    const check=h('button',{class:'btn ghost sm',onclick:()=>void this.request('network',true)},'检测并恢复'),env=h('button',{class:'btn ghost sm',title:'检查 Clash 的系统代理 / TUN 会不会影响线路，以及本机到节点那一段通不通',onclick:()=>void NetEnv.open()},'网络环境');
    const off=Bus.on('route-state',()=>{if(!state.isConnected){off();observer.disconnect();return;}state.textContent=this.status;check.disabled=this.busy||!this.enabled();});
    const row=h('div',{class:'set'},h('label',{},on,' 网络故障恢复（认证期间暂停）'),h('span',{},state,h('small',{},'网络优先 + 热备秒切：连接正常时绝不切回旧地区或频繁换 IP；遇到 429 限流、超时、401/403/404 或连接报错时立即秒切热备 IP / 节点，并自动同步当前可用国家。')),check,env);
    const observer=new MutationObserver(()=>{if(!row.isConnected){off();observer.disconnect();}});queueMicrotask(()=>{if(row.isConnected)observer.observe(document.body,{childList:true,subtree:true});else off();});return row;
  },
};
// 后台无感维护：持续维护热备兜底库（StandbyPool），并在空闲时刷新当前地区的出口 IP 与纯净度。
const RouteWarm = {
  t:0, busy:false, at:0,
  start(){ if(this.t)return; this.t=setInterval(()=>void this.tick(),45000); setTimeout(()=>void this.tick(),6000); },
  idle(a){ return !AutoRoute.busy&&!(typeof NodeRoutes!=='undefined'&&NodeRoutes.manual>0)&&!Pool.switching.has(a.id)&&![...Chats.values()].some(c=>c.busy||c.streaming); },
  async tick(force=false){
    if(this.busy||typeof document!=='undefined'&&document.hidden||navigator.onLine===false)return;
    // 无论是否空闲，只要热备池不足，先静默把「第二 IP」备好
    try{void StandbyPool.replenish('warm');}catch{}
    if(!force&&now()-this.at<5*60e3)return;
    const a=UI.host?.account;if(!a?.id||!isVless(a.proxy)||!a.region||!Host.probe||typeof Pool==='undefined'||RouteState.locked(a))return;
    if(!this.idle(a))return;
    this.busy=true;this.at=now();
    try{
      if(typeof NodeSpeed!=='undefined')await NodeSpeed.testOne(a.proxy,{rounds:1,timeout:2500}).catch(()=>{});
      await Pool.load();
      const pc=typeof IPRep!=='undefined'?IPRep.cur(a,IP.ip):null,good=pc?.label==='纯净';
      if(!force&&good&&now()-(this.pipAt||0)<30*60e3){Bus.emit('pool');return;}
      this.pipAt=now();
      const keys=Pool.entries().filter(([k,e])=>e&&!e.gone&&e.loc===a.region&&!Pool.banned(k)&&e.ok!==false&&(e.ok==null||now()-(e.at||0)>5*60e3))
        .sort(([,x],[,y])=>(y.ok===true)-(x.ok===true)||(x.ms||9e9)-(y.ms||9e9)).slice(0,16).map(([k])=>k);
      if(keys.length&&this.idle(a)){
        const r=await Host.probe({link:a.proxy,pips:keys,timeout:6500}).catch(()=>null);
        const nodeAlive=Array.isArray(r)&&(typeof Pool.isNodeConfirmedAlive==='function'?Pool.isNodeConfirmedAlive(a.proxy,r):r.some(x=>x&&(x.ip||x.brana)));
        if(Array.isArray(r)&&UI.host?.account?.id===a.id)await Pool.mutate(d=>keys.forEach((k,j)=>{const res=r.find(x=>x?.pip===k)||r[j]||{};Pool.apply(d,k,res);if(!(res.ip&&res.brana)&&(nodeAlive||res.ip)&&d.ips?.[k]&&(d.ips[k].fc||0)>=3)Pool.banForever?.(d,k,'节点正常但该 ProxyIP 连续不可用 · 已拉黑');})).catch(()=>{});
      }
      if(typeof Pool!=='undefined'&&Pool.purgeImpureAndUnstable)await Pool.purgeImpureAndUnstable().catch(()=>{});
      if(typeof IPRep!=='undefined'&&IPRep.prime&&this.idle(a)){if(IPRep._pr)IPRep._pr[a.region]=0;await IPRep.prime(a.region).catch(()=>{});}
      Bus.emit('pool');
    }catch{}finally{this.busy=false;}
  },
};
