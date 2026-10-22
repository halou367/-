// Target-bound route selection: live account or deferred editor draft. Probes never carry account cookies; fresh native receipts authorize writes.
const NodeRoutes = (() => {
  const State = typeof RouteState !== 'undefined' ? RouteState : require('./route-state');
  const Policy = typeof RoutePolicy !== 'undefined' ? RoutePolicy : require('./route-policy');
  const cache = new Map();
  let manualBusy = 0;   // 手动「应用更改」进行中：后台线路恢复 / 自动换节点让路
  const routeKey = c => Policy.key(c);
  const usable = (c,r) => Policy.good(r) && (!c.region || c.region === r.loc);
  const rank = (a,b) => Number(!Policy.good(a.result))-Number(!Policy.good(b.result)) || (Policy.good(a.result)?a.result.ms??Infinity:Infinity)-(Policy.good(b.result)?b.result.ms??Infinity:Infinity) || String(a.label||'').localeCompare(String(b.label||''));
  function selector(io) {
    const stale = () => !!io.cancelled?.();
    async function measure(list) {
      const result=[];
      for(let at=0;at<list.length&&!stale();at+=2){
        const batch=await Promise.all(list.slice(at,at+2).map(async c=>({candidate:c,result:await io.probe({...c,kind:'manual'}).catch(e=>({ok:false,kind:e.kind||'network',error:String(e.message||e)}))})));
        result.push(...batch);io.progress?.(result.length,list.length,batch);
      }
      return stale()?[]:result;
    }
    async function apply(snapshot,candidate,mode,result,options={}) {
      if(stale())throw Error('选择已改变，未应用旧检测结果');
      if(!usable(candidate,result))throw Error(result?.error||'线路未通过 Brana 检测，保留原配置');
      const fresh=await io.read(),a=fresh.account;
      if(stale()||a?.id!==snapshot.id||routeKey(a)!==routeKey(snapshot)||State.mode(a)!==State.mode(snapshot))throw Error('账号或线路已改变，请重新选择');
      if(State.locked(a))throw Error('账号正在认证，请完成或明确取消认证后再换线路');
      const route={...Policy.fields(candidate),region:candidate.region||result.loc||'',routeHome:candidate.region||result.loc||''};
      if(result.proofExpires&&result.proofExpires<=Date.now()+15000){result=await io.probe({...candidate,kind:'manual'});if(!usable(candidate,result))throw Error(result?.error||'候选复测失败，未应用');}
      const saved=await io.apply({id:a.id,expected:Policy.fields(snapshot),expectedConfig:State.signature(snapshot),expectedMode:State.mode(snapshot),route,manual:true,mode,ticket:result.ticket,preservePolicy:options.preservePolicy===true});
      if(!saved?.ok)throw Error(saved?.error||'应用未确认，未报告成功');
      return saved.account;
    }
    return {measure,apply};
  }
  // 每次线路检测带回的 IPPure 纯净度都记进 IP 库（高风险立即拉黑删除）
  function adapter(){ const b=RouteHost.create(window.BranaHost,window.BranaAndroid,Vless); if(b&&typeof b.probe==='function'&&!b._pure){const p=b.probe.bind(b);b.probe=async c=>{const r=await p(c);try{if(typeof IPRep!=='undefined')IPRep.notePure(c?.proxyIp,r);}catch{}return r;};b._pure=true;} return b; }
  // 友好错误：不把 "Failed to fetch" / net::ERR_* 原样丢给用户
  function friendly(e,hint){const s=typeof e==='string'?e:(typeof describe==='function'?describe(e):String(e?.message||e));if(/^\s*(?:connection (?:closed|reset)|unexpected eof|eof)\s*$/i.test(s))return '连接被中途关闭（多半是这个出口 IP 经此节点不可用）'+(hint||'：换个出口 IP 或节点再试');if(!/failed to fetch|fetch failed|ERR_[A-Z_]+|net::|networkerror|load failed/i.test(s))return s;const code=(/ERR_[A-Z_]+/.exec(s)||[''])[0];return '经此线路连不上'+(code?'（'+code+'）':'')+(hint||'：换个节点或出口 IP 再试');}
  const dly=ms=>ms<300?'d-good':ms<800?'d-mid':'d-bad';
  // 连接设置（登录页 / 新增账号 / 账号编辑 / 地区 IP 弹窗共用）：
  // 自动：节点、出口全自动（地区可改）；节点：手动选节点 / 地区 / 出口；代理：自动探测本机端口；直连。
  // 节点延迟来自 NodeSpeed（后台每 5 分钟 url-test，打开不重测）；地区延迟 = 每个域名首测 1 个 IP；确认才检测 Brana 并保存。
  const AUTO='__auto';
  function field(account={},options={}) {
    const base=adapter();if(!base)return null;
    const live=!!(options.live&&!options.draft&&account.id&&account.id===UI.host?.account?.id);
    if(!live&&!base.draftSupported)return null;
    const P=typeof Pool!=='undefined'?Pool:null,R=typeof IPRep!=='undefined'?IPRep:null,S=typeof NodeSpeed!=='undefined'?NodeSpeed:null;
    let a={...account},current={...Policy.fields(account)},strategy=(!live&&!account.id&&!account.proxy)?'auto':State.mode(account),nodes=[],accounts=[],sequence=0,applying=false,probing=false,error='',changed=false;
    let draft=null,draftJob=null,choice=null,loading=true,saving=false,disposed=false;
    let selNode=current.nodeId||(P?.d?.node||''),cc=current.region||account.routeHome||(live&&typeof IP!=='undefined'?IP.loc:'')||'',selPip=current.proxyIp||AUTO,pipSeq=0,lastBrana=null,domBusy=false;
    // 地区「自动」：优先用 ProxyIP —— 选当前节点下有可用纯净出口、延迟最低的地区；一个都没有才不限地区。新账号默认自动
    let regAuto=!current.region&&!account.routeHome;
    const pipBusy=new Set();let footReady=false;
    let poolWork=null,poolTimer=0,poolPaintTimer=0;
    const io={...base,read:()=>base.read(live?undefined:(a.id||'')),probe:async candidate=>base.probe(live?candidate:{...candidate,draft:(await ensureDraft()).draft})};
    const owner=UI.host?.account?.id;
    const wrap=h('div',{class:'pconn tested-routes np-wrap'}),status=h('div',{class:'route-selection-status',role:'status','aria-live':'polite'});
    const fresh=!account.id&&!!options.draft;   // 新账号（添加 / 注册）：没有单独的「确认」，点主按钮时自动检测
    const say=(text,bad=false)=>{if(options.footer)text=String(text).replace(/「确认」/g,'「应用更改」');if(fresh)text=String(text).replace(/；?点「确认」(检测并)?保存/g,'；添加账号时自动检测').replace(/后点「确认」/g,'；添加账号时自动检测').replace(/请点「确认」|点「确认」/g,'添加账号时会自动检测');status.textContent=text;status.classList.toggle('bad',bad);};
    async function ensureDraft(){if(live)return null;if(draft)return draft;if(!draftJob)draftJob=base.draft({op:'open',id:a.id||''}).then(result=>{if(!result?.ok)throw Error(result?.error||'连接草稿未建立');draft=result;if(disposed){void base.draft({op:'close',draft:result.draft}).catch(()=>{});throw Error('编辑器已关闭');}return result;}).finally(()=>{draftJob=null;});return draftJob;}
    const lockText='认证环境已锁定：不切换节点、出口、地区或指纹。请完成认证，或在认证提示中明确取消。';
    const modeLabels={auto:'自动',node:'节点',proxy:'代理',direct:'直连'};
    const segment=h('div',{class:'pseg',role:'tablist','aria-label':'连接模式'},...Object.entries(modeLabels).map(([key,label])=>h('button',{type:'button','data-k':key,onclick:()=>chooseMode(key)},label)));
    // ---- 统一的小图标按钮 / 下拉箭头 / 分区标题 ----
    const ico=(n,cls,title,fn)=>{const b=h('button',{type:'button',class:'np-ico np-sq '+cls,title,'aria-label':title,onclick:e=>{e.stopPropagation();fn();}});b.append(typeof icon==='function'?icon(n):document.createTextNode(n==='link'?'⛓':'⟳'));return b;};
    const chev=()=>{const s=h('span',{class:'np-chev','aria-hidden':'true'});s.append(typeof icon==='function'?icon('chev'):document.createTextNode('▾'));return s;};
    const secHead=(label,cnt,...btns)=>h('div',{class:'np-sh'},h('span',{class:'np-l'},label),cnt,h('span',{class:'grow'}),...btns);
    // ---- 节点选择器（自绘下拉：首行「自动选择」，其余每行带延迟色块）----
    const curName=h('span',{class:'np-name'}),curBadge=h('span',{class:'dly d-wait'});
    const nodeBtn=h('button',{type:'button',class:'np-cur','aria-haspopup':'listbox','aria-label':'节点',onclick:()=>toggleList()},curName,curBadge,chev());
    const listRows=h('div',{class:'np-rows',role:'listbox'});
    const retest=ico('bolt','np-retest np-ping','ping 全部节点（测延迟）',()=>void (async()=>{await load(true);S?.test(nodes,{force:true});})());   // 先读最新配置（订阅可能刚更新），再 ping
    const subBtn=ico('refresh','np-sub','更新订阅（重新拉取节点列表）',()=>void updateSubs());
    const chgBtn=ico('link','np-chg','变更订阅（换成新的订阅地址，旧订阅和它的节点会被移除）',()=>void changeSub());
    const nodeCnt=h('span',{class:'np-cnt'});
    const list=h('div',{class:'np-list',hidden:true},listRows);
    // 标题行：节点 · 数量 …… 变更订阅 ⚡ping；下拉右侧：更新订阅
    const nodeRow=h('div',{class:'np-node np-sec'},h('div',{class:'np-sh'},h('span',{class:'np-l'},'节点'),nodeCnt,h('span',{class:'grow'}),chgBtn,retest),h('div',{class:'np-prow'},h('div',{class:'np-pick'},nodeBtn,list),subBtn));
    // ---- 地区 + 出口 IP ----
    // 地区选择：自绘下拉（原生 <select> 的选项不能着色）。每行：地区名（左）· 可用数 · 延迟（最右端，按快慢着色）。
    // 对外仍表现得像 <select>：.value / .disabled / onchange / change 事件。
    let regionVal='',regionRows=[],regionOpen=false;const regionCnt=h('span',{class:'np-cnt'});
    const region=h('button',{type:'button',class:'route-region-select rsel-btn','aria-label':'地区','aria-haspopup':'listbox','aria-expanded':'false'});
    const regionList=h('div',{class:'rsel-list',role:'listbox','aria-label':'地区列表',hidden:true});
    const regionBox=h('div',{class:'rsel'},region,regionList);
    const rselTail=r=>r.ms?h('span',{class:'dly '+dly(r.ms),title:'到该地区代理域名的延迟'},r.ms+' ms'):r.busy?h('span',{class:'dly d-wait'},'测速中'):null;
    function paintRegion(){
      const cur=regionRows.find(r=>r.v===regionVal)||{v:regionVal,name:regionVal==='*'?'自动':regionVal?regionLabel(regionVal):'自动（优先用 ProxyIP）'};
      region.replaceChildren(...[h('span',{class:'rsel-n'},cur.name),rselTail(cur),chev()].filter(Boolean));
      {const rr=regionRows.filter(r=>r.v&&r.v!=='*');regionCnt.textContent=rr.length?rr.filter(r=>r.ok).length+' / '+rr.length+' 个可用':'';}paintFooter();
      if(!regionOpen)return;
      regionList.replaceChildren(...regionRows.map(r=>h('div',{class:'rsel-row'+(r.v===regionVal?' on':''),role:'option','aria-selected':String(r.v===regionVal),onclick:()=>{regionSet(r.v,true);}},
        h('span',{class:'rsel-n'},r.name),r.ok?h('span',{class:'rsel-c'},r.ok+' 个可用'):null,rselTail(r))));
    }
    function regionToggle(open){regionOpen=open==null?!regionOpen:open;regionList.hidden=!regionOpen;region.setAttribute('aria-expanded',String(regionOpen));if(regionOpen)paintRegion();}
    function regionSet(v,fire){v=v||'';const changedNow=v!==regionVal;regionVal=v;paintRegion();regionToggle(false);if(fire&&changedNow)region.dispatchEvent(new Event('change'));}
    Object.defineProperty(region,'value',{get:()=>regionVal,set:v=>{regionVal=v||'';paintRegion();}});
    paintRegion();
    region.addEventListener('click',()=>{if(!region.disabled)regionToggle();});
    { const off=ev=>{if(!regionBox.isConnected){document.removeEventListener('pointerdown',off,true);return;}if(regionOpen&&!regionBox.contains(ev.target))regionToggle(false);};document.addEventListener('pointerdown',off,true); }
    const refreshRegions=ico('bolt','rsel-refresh np-ping','ping 各地区（测延迟）',()=>void probeDomains(true));
    // Both refresh buttons target the selected region, not the entire world.
    const reloadRegions=ico('refresh','rsel-reload','强制刷新当前地区的 ProxyIP：重新解析并逐项检测',()=>void refreshRegion(true));
    const refreshPips=ico('refresh','pip-refresh','强制刷新当前地区的 ProxyIP：重新解析并逐项检测',()=>void refreshRegion(true));
    const testAllPips=ico('bolt','pip-all np-ping','检测该地区全部候选（含待检测 IP）',()=>void testPips(candidateRows().map(([k])=>k)));
    const pipList=h('div',{class:'pip-list',role:'radiogroup','aria-label':'出口 IP',hidden:true});
    let pipOpen=false;const pipCnt=h('span',{class:'np-cnt'}),pipVal=h('span',{class:'pip-cv'});
    const pipBtn=h('button',{type:'button',class:'pip-cur','aria-haspopup':'listbox','aria-expanded':'false','aria-label':'出口 IP',onclick:()=>pipToggle()},pipVal,chev());
    function pipToggle(open){pipOpen=open==null?!pipOpen:!!open;pipList.hidden=!pipOpen;pipBtn.setAttribute('aria-expanded',String(pipOpen));pipBox.classList.toggle('open',pipOpen);if(pipOpen)fillPips();}
    const pipBox=h('div',{class:'pip-box2'},pipBtn,pipList);
    const refreshPipListBtn=h('button',{type:'button',class:'btn ghost xs pip-refresh-btn',title:'打开 ProxyIP 列表：查看 / 添加 / 刷新检测 / 拉黑',onclick:e=>{e.stopPropagation();if(typeof ProxySet!=='undefined'&&typeof ProxySet.open==='function')ProxySet.open();}},typeof icon==='function'?icon('globe'):'☰','ProxyIP 列表');
    const pipHead=secHead('出口 IP（ProxyIP）',pipCnt,refreshPipListBtn,testAllPips);
    const autoExit=h('div',{class:'np-auto-exit'});
    const regSec=h('div',{class:'np-sec np-reg-sec',hidden:!!options.hideRegion},secHead('地区（可选 · 默认全网自动优选）',regionCnt,refreshRegions),h('div',{class:'np-prow'},h('div',{class:'np-pcol'},regionBox),reloadRegions));
    const locationRow=h('div',{class:'np-loc'},h('div',{class:'np-sec pip-sec'},pipHead,h('div',{class:'np-prow'},h('div',{class:'np-pcol'},pipBox,autoExit),refreshPips)),regSec);
    const workTitle=h('strong'),workCount=h('span'),workTime=h('span',{class:'pip-work-time'}),workDetail=h('span',{class:'pip-work-detail'});
    const workBar=h('progress',{max:1,value:0,'aria-label':'ProxyIP 检测进度'});
    const workCancel=h('button',{type:'button',class:'btn ghost sm',onclick:()=>cancelPoolWork('已取消，保留已完成结果')},'停止检测');
    const workBox=h('div',{class:'pip-work',hidden:true},h('div',{class:'pip-work-head'},workTitle,workCancel),workBar,workCount,workTime,workDetail);
    locationRow.append(workBox);
    const workContext=j=>!!j&&poolWork===j&&!disposed&&wrap.isConnected&&UI.host?.account?.id===owner&&nodeLink()===j.link&&cc===j.region&&!State.locked(live?UI.host?.account:a);
    const workLive=j=>workContext(j)&&j.running&&!j.ctl.signal.aborted;
    function readyCount(){return pipRows().filter(([k,e])=>!blocked(k)&&!cooling(e)).length;}
    function paintWork(){
      const j=poolWork;if(!j){workBox.hidden=true;return;}
      if(!workContext(j)){cancelPoolWork('账号或线路已改变',false);return;}
      workBox.hidden=false;workCancel.hidden=!j.running;
      const elapsed=Math.max(0,Math.round(((j.ended||Date.now())-j.started)/1000));
      const phase=j.phase==='resolve'?'正在刷新来源':j.phase==='queued'?'等待检测槽位':j.phase==='preparing'?'准备检测线路':j.phase==='probing'?'正在检测':j.phase==='cancelled'?'已停止':j.phase==='failed'?'检测中止':'检测完成';
      workTitle.textContent=j.label+' · '+phase;
      workBar.max=Math.max(1,j.total||j.sources||1);workBar.value=j.phase==='resolve'?j.resolved:j.done;
      workCount.textContent=j.phase==='resolve'?'来源 '+j.resolved+'/'+j.sources+' · 当前可用 '+readyCount():'已检 '+j.done+'/'+j.total+' · 当前可用 '+readyCount()+' · 失败 '+j.failed+' · 待检 '+Math.max(0,j.total-j.done);
      workTime.textContent='已用 '+elapsed+' 秒'+(j.running&&j.total>j.done?' · 可用项可先选择，其他项继续检测':'');
      workDetail.textContent=j.detail||(j.dnsErrors?'部分来源解析失败，保留缓存候选继续检测。':'不会自动应用或切换账号线路。');
      workBox.dataset.state=j.phase;
    }
    function paintPoolSoon(){if(poolPaintTimer)return;poolPaintTimer=setTimeout(()=>{poolPaintTimer=0;if(!disposed){fillRegions();fillPips();paintWork();}},80);}
    function cancelPoolWork(reason='已取消',keep=true){
      const j=poolWork;if(j?.running){j.running=false;j.phase='cancelled';j.detail=reason;j.ended=Date.now();j.ctl.abort();pipBusy.clear();}
      clearInterval(poolTimer);poolTimer=0;
      if(!keep){poolWork=null;workBox.hidden=true;}else if(j){paintWork();if(!disposed)fillPips();}
    }
    function startPoolWork(label){
      cancelPoolWork('已替换旧任务',false);
      if(disposed||!wrap.isConnected||State.locked(live?UI.host?.account:a))return null;
      const link=nodeLink();if(!link){say('先选择节点，才能经节点测出口 IP',true);return null;}
      if(!P||!Host.probe){say('此平台不支持出口 IP 检测',true);return null;}
      const j=poolWork={seq:++pipSeq,link,region:cc,label,ctl:new AbortController(),started:Date.now(),ended:0,running:true,phase:'queued',done:0,total:0,failed:0,sources:0,resolved:0,dnsErrors:0,detail:''};
      poolTimer=setInterval(paintWork,1000);paintWork();return j;
    }
    function finishPoolWork(j,phase='done',detail=''){
      if(!workContext(j)||j.ctl.signal.aborted)return;
      j.running=false;j.phase=phase;j.detail=detail;j.ended=Date.now();pipBusy.clear();clearInterval(poolTimer);poolTimer=0;
      fillRegions();fillPips();paintWork();
    }
    const proxy=h('input',{'aria-label':'代理地址',placeholder:'http://127.0.0.1:7890 或 socks5://127.0.0.1:18080',value:!State.isNode(a)&&!isDirectP(a.proxy)?a.proxy||'':''});
    const proxyRow=h('label',{class:'route-proxy-row'},options.collapsible?'代理':'代理地址',proxy);
    const okBtn=h('button',{type:'button',class:'btn sm t-ok',title:options.footer?'检测并应用当前选择；未更改时强制重新应用':'',onclick:()=>void check()},options.footer?'应用更改':'确认');
    const footNow=h('div',{class:'np-fnow'}),footChg=h('div',{class:'np-fchg'}),footPre=h('div',{class:'np-fpre',hidden:true});
    if(fresh||options.hideOk)okBtn.hidden=true;
    const actions=h('div',{class:'route-selection-actions'+(options.footer?' np-foot':'')},...(options.footer?[h('div',{class:'np-fsum'},footNow,footChg,footPre)]:[]),okBtn);
    // 可收纳（登录页 / 添加账号用）：默认只显示一行摘要，点开才选模式 / 节点 / 地区；「确认」时自动测 Google 和 Brana
    let tests=null,opened=false;
    const sumVal=h('span',{class:'np-sv'}),sumChips=h('span',{class:'np-chips'}),sumBtn=h('button',{type:'button',class:'np-sum','aria-expanded':'false',title:'展开 / 收起连接设置',onclick:()=>setOpen(!opened)},h('span',{class:'np-sl'},'连接'),sumVal,sumChips,h('span',{class:'np-caret'},'▾'));
    const body=h('div',{class:'np-body'},segment,nodeRow,locationRow,proxyRow,...(options.collapsible?[]:[status]),actions);
    function setOpen(v){opened=!!v;body.hidden=!opened;sumBtn.setAttribute('aria-expanded',String(opened));wrap.classList.toggle('np-expanded',opened);}
    if(options.collapsible){wrap.classList.add('np-collapsible');wrap.append(sumBtn,body,status);setOpen(false);}else wrap.append(segment,nodeRow,locationRow,proxyRow,status,actions);
    const isNodeMode=()=>['node','auto'].includes(strategy);
    const isAuto=()=>strategy==='auto';
    const nodeOf=id=>nodes.find(n=>n.id===id)||null;
    // 自动：延迟最低且通的节点；没测过时退回当前 / 第一个
    const bestNode=()=>S?.best(nodes)||nodeOf(current.nodeId)||nodes[0]||null;
    const activeNode=()=>isAuto()?bestNode():nodeOf(selNode);
    const nodeLink=()=>{const n=activeNode();return n?io.link(n):'';};
    // ---- 出口自动：可用 → 非限流冷却 → 低风险 → 低延迟 ----
    const cooling=e=>(e?.cool||0)>Date.now();
    function bestPip(){
      if(!P)return '';
      const rows=pipRows().filter(([k,e])=>e.ok&&!blocked(k));
      const good=rows.filter(([k,e])=>!cooling(e)&&!(R?.risky?.(k,e)));
      if(current.proxyIp){
        const curHit=good.find(([k])=>String(k).toLowerCase()===String(current.proxyIp).toLowerCase());
        if(curHit)return curHit[0];
      }
      return (good[0]||rows.find(([,e])=>!cooling(e))||[''])[0]||'';
    }
    const pipOf=()=>!P?'':(isAuto()||selPip===AUTO)?bestPip():selPip;
    function getCandidate(n,pip){
      if(strategy==='direct')return {proxy:'direct',proxyIp:'',nodeId:'',region:''};
      if(strategy==='proxy')return {proxy:normProxy(proxy.value)||'http://127.0.0.1:7890',proxyIp:'',nodeId:'',region:''};
      n=n||activeNode();
      const chosenPip=pip!==undefined?pip:pipOf();
      const pipLoc=chosenPip&&P?.d?.ips?.[chosenPip]?.loc||'';
      if(!chosenPip)return {proxy:n?io.link(n):'',nodeId:n?.id||'',region:'',proxyIp:'',nativeFallback:true};
      return {proxy:n?io.link(n):'',nodeId:n?.id||'',region:pipLoc||cc||'',proxyIp:chosenPip};
    }
    // 出口自动：当前可用出口优先保持不动；需要轮换时按纯净度和最久未使用排序，不再按最低延迟反复切
    function pipChoices(max){
      if(!P)return [pipOf()];
      if(!(isAuto()||selPip===AUTO))return [selPip];
      const rows=pipRows().filter(([k,e])=>e.ok&&!blocked(k)&&!cooling(e)),risky=([k,e])=>!!R?.risky?.(k,e);
      const ordered=rows.filter(x=>!risky(x)&&pureK(x[0])).map(([k])=>k);
      if(current.proxyIp){
        const idx=ordered.findIndex(k=>String(k).toLowerCase()===String(current.proxyIp).toLowerCase());
        if(idx>0){const [curK]=ordered.splice(idx,1);ordered.unshift(curK);}
      }
      return ordered.length?ordered.slice(0,max):[''];
    }
    const normProxy=v=>{v=String(v||'').trim();return /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)?'http://'+v:v;};
    // ---- 节点列表 ----
    const sorted=()=>S?S.sort(nodes):nodes.slice();
    const isCurPip=k=>live&&!!current.proxyIp&&String(k||'').trim().toLowerCase()===String(current.proxyIp||'').trim().toLowerCase();
    const isCurNode=n=>live&&!!n&&(n.id===current.nodeId||String(io.link(n)||'').trim()===String(current.proxy||'').trim());
    const isLiveTimeout=()=>live&&typeof IP!=='undefined'&&((IP.rttFail>0&&!IP.quietFail?.())||!!IP.err||(typeof AutoRoute!=='undefined'&&!!AutoRoute.failed));
    function badgeOf(n){
      if(!S||!n)return {cls:'d-wait',text:''};
      const b={...S.badge(n)};
      if(S.busy(n)&&S.get(n))b.text+=' …';
      if(isCurNode(n)&&isLiveTimeout()&&!S.busy(n)){
        const sp=S.get(n);
        if(!current.proxyIp||sp?.ok===false)return {cls:'d-fail',text:(IP.err||'超时')+' · 实时',title:'当前节点实时连接超时（下方历史测速已失效）'};
        if(sp?.ok)return {cls:'d-mid',text:(sp.ms||0)+' ms · 出口超时',title:'节点自身握手延迟 '+sp.ms+' ms，但当前 ProxyIP 出口连接超时'};
      }
      return b;
    }
    function fillNodes(){
      if(!isAuto()&&!nodeOf(selNode))selNode=bestNode()?.id||'';
      const n=activeNode(),b=badgeOf(n);
      curName.textContent=isAuto()?'自动选择'+(n?' · '+(n.name||n.address||n.id):''):n?(n.name||n.address||n.id):(nodes.length?'选择节点':'尚未配置节点');curBadge.className='dly '+b.cls;curBadge.textContent=n?b.text:'';
      nodeCnt.textContent=nodes.length+' 个'+(S?.testing?' · ping 中…':'');subBtn.hidden=!(typeof Nodes!=='undefined'&&Nodes.subs?.length);
      paintSummary();
      if(list.hidden)return;
      const autoRow=h('div',{class:'np-row np-auto'+(isAuto()?' on':''),role:'option','data-id':AUTO,'aria-selected':String(isAuto()),onclick:()=>pickNode(AUTO)},h('span',{class:'np-name'},'自动选择'),h('span',{class:'np-sub'},'每 5 分钟 ping 一次，选最低延迟；当前节点不通或明显更慢时才切换'));
      listRows.replaceChildren(autoRow,...sorted().map(x=>{const bb=badgeOf(x),on=!isAuto()&&x.id===selNode;return h('div',{class:'np-row'+(on?' on':''),role:'option','data-id':x.id,'aria-selected':String(on),title:bb.title||'',onclick:()=>pickNode(x.id)},h('span',{class:'np-name'},x.name||x.address||x.id),S?.testOne?h('button',{type:'button',class:'np-one',title:'单独 ping 这个节点：连测 3 次取中位数（单次偶尔偏高或失败）',disabled:S.probingNow(x)||null,onclick:e=>{e.stopPropagation();void S.testOne(x);}},'ping'):null,h('span',{class:'dly '+bb.cls},bb.text));}));
    }
    function toggleList(force){
      const show=force??list.hidden;list.hidden=!show;wrap.classList.toggle('np-open',show);fillNodes();
      if(show&&S){const todo=nodes.filter(n=>!S.get(n));if(todo.length)void S.test(todo);}
    }
    function pickNode(id){
      cancelPoolWork('节点已切换',false);
      toggleList(false);changed=true;choice=null;tests=null;lastBrana=null;
      if(id===AUTO){strategy='auto';paint();fillPips();regAuto=true;fillRegions();say('自动：节点、地区、出口全部自动优选');return;}
      strategy='node';selNode=id;paint();fillPips();say('节点模式（手动）：已选 '+(nodeOf(id)?.name||id)+'；选地区和出口后点「确认」');preflight();
    }
    async function changeSub(){if(typeof Nodes==='undefined'||typeof Dialog==='undefined')return;const cur=(Nodes.subs||[]).map(x=>x.url).filter(Boolean).join(' ');const v=await Dialog.ask({title:'变更订阅',value:cur,placeholder:'https://example.com/sub?token=…（多个用空格分隔，也可粘贴 vless:// 链接）',hint:'换成新的订阅地址：旧订阅和它的节点会被移除（正在使用的节点保留）。',ok:'更新',max:4000});if(v==null)return;chgBtn.disabled=true;say('正在获取新订阅…');try{const r=await Nodes.setSub(v,t=>say(t));if(r?.error)say(r.error,true);else{say('订阅已变更 · '+r.n+' 个节点'+(r.added?'（新增 '+r.added+'）':''));await load(true);}}catch(e){say(friendly(e),true);}finally{chgBtn.disabled=false;}}
    async function updateSubs(){if(typeof Nodes==='undefined')return;subBtn.disabled=true;say('正在更新订阅…');try{const r=await Nodes.refreshSubs();say('订阅已更新'+(r?' · 新增 '+(r.add||0)+' · 移除 '+(r.rm||0):''));await load(true);}catch(e){say(friendly(e),true);}finally{subBtn.disabled=false;}}
    const outside=e=>{if(!list.hidden&&!nodeRow.contains(e.target))toggleList(false);};document.addEventListener('pointerdown',outside,true);
    // ---- 地区：每个域名首测 1 个 IP，作为地区延迟 ----
    function srcLines(c){if(P?.regionSources)return P.regionSources(c);const out=new Set();if(P&&c){for(const l of P.domains())if(P.domLoc(l)===c)out.add(l);for(const [,e] of P.entries())if(e.src&&e.loc===c)out.add(e.src);}return out;}
    function candidateRows(region=cc){
      if(!P||!region)return [];const sources=srcLines(region);
      const rows=P.regionCandidates?P.regionCandidates(region):P.entries().filter(([k,e])=>!e.gone&&!P.banned?.(k)&&(e.loc===region||sources.has(e.src)));
      return rows.filter(([k])=>!used(k));
    }
    function regionStats(){
      const st={};const add=c=>st[c]||={ms:0,ok:0};
      if(!P)return st;
      for(const l of P.domains()){const c=P.domLoc(l);if(!c)continue;const x=add(c),d=P.d?.dom?.[l];if(d?.ok&&d.ms>0&&(!x.ms||d.ms<x.ms))x.ms=d.ms;}
      // 地区延迟 = 该地区可用 ProxyIP 的最低延迟（经当前节点实测）；正在用的那个 IP 用实时延迟，超时或冷却中的不计入绿色可用最低延迟
      for(const [k,e] of P.entries())if(e.loc&&!e.gone){
        const x=add(e.loc),liveRtt=typeof IP!=='undefined'&&IP.liveFor?IP.liveFor(k):0;
        if(cooling(e)||(isCurPip(k)&&isLiveTimeout()))continue;
        if(e.ok||liveRtt){x.ok+=e.ok?1:0;const m=liveRtt||e.ms;if(m>0&&(!x.ims||m<x.ims))x.ims=m;}
      }
      for(const x of Object.values(st))if(x.ims)x.ms=x.ims;
      return st;
    }
    // 自动地区：每个地区「可用 + 纯净 + 没被占用 / 拉黑 + 不在限流冷却」的出口里最低延迟，取最低的地区
    function usableIn(c){return !!P&&P.entries().some(([k,e])=>!e.gone&&e.ok===true&&e.loc===c&&!blocked(k)&&!cooling(e));}
    function bestRegion(){
      if(!P)return '';const m={};
      for(const [k,e] of P.entries()){if(e.gone||e.ok!==true||!e.loc||blocked(k)||cooling(e))continue;const live=typeof IP!=='undefined'&&IP.liveFor?IP.liveFor(k):0,ms=live||e.ms||9e8;if(!m[e.loc]||ms<m[e.loc])m[e.loc]=ms;}
      return Object.entries(m).sort((x,y)=>x[1]-y[1]||x[0].localeCompare(y[0]))[0]?.[0]||'';
    }
    function fillRegions(){
      const st=regionStats();if(cc)st[cc]||={ms:0,ok:0};
      const order=Object.keys(st).sort((x,y)=>(y==='JP')-(x==='JP')||(st[x].ms||9e9)-(st[y].ms||9e9)||x.localeCompare(y));
      if(regAuto&&!poolWork?.running&&(!cc||!usableIn(cc))){const b=bestRegion();if(b!==cc){cc=b;selPip=b?AUTO:'';options.onRegion?.(cc);setTimeout(()=>{if(!disposed)fillPips();},0);}}
      const au=regAuto&&cc?st[cc]:null;
      regionRows=[{v:'*',name:regAuto&&cc?'自动 · '+ccF(cc):'自动（优先用 ProxyIP）',ms:au?.ms||0,ok:au?.ok||0},...order.map(c=>({v:c,name:regionLabel(c),ms:st[c].ms||0,ok:st[c].ok||0,busy:domBusy&&!st[c].ms}))];
      region.value=regAuto?'*':cc;
    }
    // Stream completed IPs immediately. Mutations re-check the current job INSIDE the write queue and coalesce rapid items.
    async function probeMany(keys,link,onPart,j){
      const modern=!!(Host.onProbeProgress&&P.streamProbe),size=modern?32:4,q=[];
      for(let i=0;i<keys.length;i+=size)q.push(keys.slice(i,i+size));let fatal='',consecFail=0,okSeen=0;
      const worker=async()=>{while(q.length&&!fatal&&workLive(j)){
        const part=q.shift(),seen=new Set(),sources=new Map(part.map(k=>[k,P.d?.ips?.[k]?.src||''])),pendingBatch=[];
        let flushJob=null;
        const applyOne=(d,k,r)=>{const e=d.ips[k];if(workLive(j)&&e&&!e.gone&&(e.src||'')===sources.get(k)&&!(d.drop?.[k]>j.started)&&!P.banned?.(k)){P.apply(d,k,r);if(typeof IPRep!=='undefined'&&!IPRep.trusted?.(k)&&IPRep.risky?.(k,e))P.banForever?.(d,k,'高风险 · 已永久拉黑');}};
        const flushBatch=async()=>{
          if(!pendingBatch.length)return;
          const items=pendingBatch.splice(0,pendingBatch.length);
          await P.mutate(d=>{for(const [k,r] of items)applyOne(d,k,r);});
        };
        const receive=async(k,r)=>{
          if(!workLive(j)||seen.has(k)||!part.includes(k))return;seen.add(k);
          pendingBatch.push([k,r]);
          if(!flushJob)flushJob=Promise.resolve().then(()=>flushBatch()).finally(()=>{flushJob=null;});
          await flushJob;
          if(!workLive(j))return;pipBusy.delete(k);j.done++;if(r.ip&&r.brana){okSeen++;consecFail=0;}else{j.failed++;consecFail++;}onPart?.([k],[r]);paintPoolSoon();
        };
        const args={link,timeout:12000,signal:j.ctl.signal,cancelled:()=>!workLive(j),onItem:receive,onStage:stage=>{if(workLive(j)&&j.phase!=='probing'){j.phase=stage;paintWork();}}};
        const r=P.streamProbe?await P.streamProbe(part,args):await Host.probe({link,pips:part,timeout:12000}).catch(e=>({error:String(e?.message||e)}));
        if(flushJob)await flushJob;
        if(pendingBatch.length)await flushBatch();
        if(!workLive(j))return;
        if(r?.cancelled){fatal=r.error||'检测已取消';return;}
        if(Array.isArray(r)){
          const rest=[];
          for(const k of part){if(!seen.has(k)){seen.add(k);rest.push([k,r.find(x=>x.pip===k)||{error:'未返回检测结果'}]);}}
          if(rest.length){
            await P.mutate(d=>{for(const [k,res] of rest)applyOne(d,k,res);});
            if(!workLive(j))return;
            for(const [k,res] of rest){pipBusy.delete(k);j.done++;if(res.ip&&res.brana){okSeen++;consecFail=0;}else{j.failed++;consecFail++;}onPart?.([k],[res]);}
            paintPoolSoon();
          }
        }
        else {fatal=r?.error||'检测失败';return;}
        if(workLive(j)&&typeof IPRep!=='undefined'&&Host.fetchText){
          const unrated=part.filter(k=>{const e=P.d?.ips?.[k];return e&&e.ok===true&&!e.gone&&!P.banned?.(k)&&!IPRep.trusted?.(k)&&!IPRep.score(k,e).known;});
          if(unrated.length){await IPRep.rate(unrated).catch(()=>{});await P.purgeImpureAndUnstable?.().catch(()=>{});if(workLive(j))paintPoolSoon();}
        }
        if(consecFail>=24&&okSeen===0){fatal='连续 '+consecFail+' 个候选连接失败，已自动熔断停止全量扫描（可直接点「应用更改」使用节点自身代理兜底）';return;}
      }};
      await Promise.all(Array.from({length:Math.min(2,q.length)},worker));return fatal;
    }
    async function probeDomains(force){
      // Opening a selector must not start a world-wide scan. The lightning button remains explicit and samples up to 2 per region.
      if(!force)return;
      const j=startPoolWork('全部地区');if(!j)return;domBusy=true;
      try{
        const perReg=new Map(),keys=[];
        for(const [k,e] of P.entries()){
          if(!e||e.gone||P.banned?.(k)||used(k)||!(e.loc||e.src))continue;
          const reg=e.loc||P.domLoc?.(e.src)||'*',cnt=perReg.get(reg)||0;
          if(cnt>=2)continue;
          perReg.set(reg,cnt+1);keys.push(k);
          if(keys.length>=48)break;
        }
        j.total=keys.length;j.phase='probing';keys.forEach(k=>pipBusy.add(k));paintWork();
        const fatal=await probeMany(keys,j.link,()=>{},j);
        if(workLive(j))finishPoolWork(j,fatal?'failed':'done',fatal?friendly(fatal):'各地区结果已逐项更新；未自动应用线路。');
      }catch(e){if(workLive(j))finishPoolWork(j,'failed',friendly(e));}
      finally{domBusy=false;if(!disposed)fillRegions();}
    }
    // Selector interaction is synchronous and never starts an all-region scan.
    // ---- 出口 IP 列表 ----
    const used=k=>accounts.some(x=>x.id!==a.id&&String(x.proxyIp||'').toLowerCase()===String(k).toLowerCase())||!!P?.owner?.(k,a.id);   // 同 IP 不同端口、同一出口 IP 也算占用
    const riskyK=k=>!!R?.risky?.(k,P?.d?.ips?.[k]);   // 高风险：禁止使用（自动和手动都不行）
    const pureK=k=>!R?.pure||R.pure(k,P?.d?.ips?.[k]);   // 必须已评估且纯净才可选
    const blocked=k=>used(k)||!!P?.banned?.(k)||riskyK(k)||!pureK(k);
    const grp=e=>e.ok===true?(cooling(e)?1:0):e.ok==null?2:3;
    function pipRows(){
      if(!P)return [];
      // 只列「检测可用 + 已评估为纯净」的 IP；当前在用优先保留，按纯净度与最久未使用轮换，不按最低延迟锁死
      const byRegion=!regAuto&&!!cc;
      return P.entries().filter(([k,e])=>!e.gone&&(byRegion?(e.ok===true&&e.loc===cc):e.ok===true)&&!P.banned?.(k)&&pureK(k))
        .sort(([ka,x],[kb,y])=>((isCurPip(kb)?1:0)-(isCurPip(ka)?1:0))||((cc&&x.loc===cc?0:1)-(cc&&y.loc===cc?0:1))||grp(x)-grp(y)||(R?R.rank(kb,y)-R.rank(ka,x):0)||((x.used||0)-(y.used||0))||ka.localeCompare(kb)).slice(0,60);
    }
    const mins=t=>Math.max(1,Math.ceil((t-Date.now())/60e3));
    const when=t=>t?'测于 '+new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'（'+Math.max(0,Math.round((Date.now()-t)/60000))+' 分钟前）':'';
    function pipBadge(k,e){if(pipBusy.has(k))return {cls:'d-wait',text:'测试中'};
      const liveRtt=typeof IP!=='undefined'&&IP.liveFor?IP.liveFor(k):0;
      // 当前正在用的这个 IP：以实时延迟为准（单独检测的结果可能是很久以前的，或被验证页拦过）
      if(liveRtt)return {cls:IP.rttCls(),text:liveRtt+' ms · 实时',title:'当前连接实时延迟（节点 + 这个 ProxyIP，经账号线路）\n'+(IP.rttTip?.()||'')+(e?.ok===false?'\n上次单独检测：'+(e.err||'不通')+'，'+when(e.at)+'；实时已通，以实时为准':'')};
      if(isCurPip(k)&&isLiveTimeout()){
        const reason=IP.err||(IP.rttFail>0?'超时':'无法连接');
        return {cls:'d-fail',text:reason+' · 实时',title:'当前正在使用的出口 IP 实时连接异常（'+reason+'）\n'+(e?.ms?'历史缓存延迟 '+e.ms+' ms 已失效，正在自动切换最优可用 IP':'')};
      }
      if(e&&cooling(e))return {cls:'d-bad',text:'冷却 '+mins(e.cool)+'分',title:(e.err||'冷却中')+(e.at?'\n'+when(e.at):'')};
      if(!e||e.ok==null)return {cls:'d-wait',text:'未测'};if(!e.ok)return {cls:'d-fail',text:/(?:brana|arena)/i.test(e.err||'')?'Brana 不通':/超时/.test(e.err||'')?'超时':'不通',title:(e.err||'')+(e.at?'\n'+when(e.at):'')};return {cls:dly(e.ms||0),text:(e.ms||0)+' ms',title:when(e.at)};}
    // 显示：出口 IP 为主（检测后识别出来的），线路类型（ProxyIP / SSTP / SOCKS5 / HTTP(S) / TURN）作小字；住宅 / 机房 / 移动 标签
    function pipShow(k,e){
      const p=P?.parse?.(k)||{},eg4=e?.eg&&/^\d+\.\d+\.\d+\.\d+$/.test(e.eg)?e.eg:'',eg6=e?.eg&&!eg4&&/^[0-9a-f:]+$/i.test(e.eg)?e.eg:'';
      const viaBase=p.chain?({socks5:'SOCKS5',http:'HTTP',https:'HTTPS',turn:'TURN',sstp:'SSTP'}[p.chain]||p.chain.toUpperCase()):'ProxyIP';
      return {main:eg4||k,via:eg6?viaBase+' · 出口 '+eg6.slice(0,14)+'…':viaBase,eg:e?.eg||''};
    }   // 只标类型，不写具体来源（完整地址在悬停提示里）
    function kindTag(k,e){const x=k&&e&&R?.kind?R.kind(k,e):null;return x?h('span',{class:'ipt '+x.c,title:x.why},x.t):null;}
    function fillPips(){
      const auto=isAuto(),hasP=!!P;pipHead.hidden=!hasP;pipBox.hidden=auto||!hasP;testAllPips.hidden=!hasP;autoExit.hidden=!auto||!hasP;refreshPips.hidden=auto||!hasP;if(auto||!hasP){pipList.hidden=true;}else pipList.hidden=!pipOpen;
      if(auto){const k=bestPip(),e=P?.d?.ips?.[k];autoExit.textContent='出口：自动'+(k?' · 当前最优 '+pipShow(k,e).main+(e?.ms?' · '+e.ms+' ms':''):(cc?' · 正在为该地区挑选':' · 从全部纯净 IP 自动优选'))+'（按延迟、限流冷却和纯净度）';}
      if(auto||!hasP){pipCnt.textContent='';paintFooter();return;}
      const rows=pipRows(),best=bestPip();
      if(P&&R?.prime&&cc&&!P.prog&&!rows.length)void R.prime(cc);
      if(pipOpen){
        const autoRow=h('div',{class:'pip-row pip-auto'+(selPip===AUTO?' on':''),role:'radio','aria-checked':String(selPip===AUTO),'data-k':AUTO,onclick:()=>pickPip(AUTO)},h('span',{class:'pip-dot'}),h('span',{class:'pip-k'},'自动选择'),h('span',{class:'pip-meta'},best?'当前最优 '+pipShow(best,P?.d?.ips?.[best]).main:'从全部纯净 IP 自动优选'));
        const items=rows.map(([k,e])=>{
          const b=pipBadge(k,e),sc=R?R.score(k,e):null,rl=sc?R.label(sc):'',dis=blocked(k),cool=cooling(e);
          const sh=pipShow(k,e),meta=[sh.via,used(k)?'已被其他账号占用':P.banned?.(k)?'已拉黑':riskyK(k)?'高风险 · 禁止使用':''].filter(Boolean).join(' · ');
          return h('div',{class:'pip-row'+(k===selPip?' on':'')+(dis?' dis':''),role:'radio','aria-checked':String(k===selPip),'aria-disabled':dis?'true':null,'data-k':k,title:k+(sh.eg?'\n出口 IP '+sh.eg:'\n出口 IP 未识别（检测后显示）')+(b.title?'\n'+b.title:''),onclick:()=>{if(!dis)pickPip(k);}},
            h('span',{class:'pip-dot'}),h('span',{class:'pip-k'},sh.main),kindTag(k,e),h('span',{class:'pip-meta'},meta),
            cool?h('span',{class:'lim',title:'触发限流后冷却，冷却结束前自动选择会跳过'},'限流 · 冷却 '+mins(e.cool)+' 分'):null,
            rl?h('span',{class:'risk '+(rl==='纯净'?'r-good':rl==='一般'?'r-mid':rl==='高风险'?'r-bad':'r-none'),title:sc?.known?'纯净度 '+sc.s+'%':''},rl+(sc?.known?' '+Math.round(sc.s)+'%':'')):null,
            h('span',{class:'dly '+b.cls},b.text),
            h('button',{type:'button',class:'pip-t',title:'用当前节点单独 ping 这个 IP',disabled:pipBusy.has(k)||null,onclick:ev=>{ev.stopPropagation();void testPips([k]);}},'ping'));
        });
        const empty=!rows.length?[h('div',{class:'pip-empty'},P?(poolWork?.running?'正在检测候选；结果可用且纯净后立即加入，不必等全部完成。':'暂无已验证且纯净的出口；可点刷新或闪电检测候选。'):'此页面不支持 ProxyIP 列表')]:[];
        pipList.replaceChildren(autoRow,...items,...empty);
      }
      testAllPips.hidden=!candidateRows().length||!hasP;
      {const candidates=candidateRows(),pending=candidates.filter(([,e])=>e.ok==null).length;pipCnt.textContent=rows.length+' 个纯净 · '+readyCount()+' 可用'+(pending?' · '+pending+' 待检':'');}
      { const k=selPip===AUTO?best:selPip,e=k?P?.d?.ips?.[k]:null,b=k&&e?pipBadge(k,e):null,sc=k&&e&&R?R.score(k,e):null,rl=sc?R.label(sc):'';
        pipVal.replaceChildren(...[h('span',{class:'pip-k',title:k||''},selPip===AUTO?'自动选择'+(best?' · '+pipShow(best,e).main:''):selPip?pipShow(selPip,e).main:'选择出口 IP'),kindTag(k,e),rl?h('span',{class:'risk '+(rl==='纯净'?'r-good':rl==='一般'?'r-mid':rl==='高风险'?'r-bad':'r-none')},rl+(sc?.known?' '+Math.round(sc.s)+'%':'')):null,b?.text?h('span',{class:'dly '+b.cls},b.text):null].filter(Boolean)); }
      paintFooter();
    }
    function pickPip(k){if(k!==selPip){selPip=k;changed=true;choice=null;tests=null;lastBrana=null;}pipToggle(false);fillPips();say(k===AUTO?'出口自动选择；点「确认」保存':'已选出口 IP '+k+'；点「确认」检测并保存');preflight();}
    async function testPips(keys,seq=pipSeq,existing=null){
      keys=[...new Set(keys)].filter(k=>P?.d?.ips?.[k]&&!P.d.ips[k].gone&&!P.banned?.(k)&&!used(k));
      if(keys.length>96){
        keys.sort((ka,kb)=>{const x=P?.d?.ips?.[ka]||{},y=P?.d?.ips?.[kb]||{};return ((y.ok===true?2:y.ok==null?1:0)-(x.ok===true?2:x.ok==null?1:0))||((x.fc||0)-(y.fc||0))||((x.ms||9e9)-(y.ms||9e9));});
        keys=keys.slice(0,96);
      }
      const j=existing||startPoolWork(cc?regionLabel(cc):'出口 IP');if(!j||!workLive(j))return;
      j.total=keys.length;j.phase='probing';keys.forEach(k=>pipBusy.add(k));fillPips();paintWork();
      try{const fatal=await probeMany(keys,j.link,()=>{},j);if(!workLive(j))return;
        finishPoolWork(j,fatal?'failed':'done',fatal?friendly(fatal):'本轮完成；可选择已验证的纯净出口，并点「确认」应用。'+(j.dnsErrors?' 部分来源解析失败，已保留原候选。':''));
      }catch(e){if(workLive(j))finishPoolWork(j,'failed',friendly(e));}
    }
    async function pickRegion(v){
      cancelPoolWork('地区已切换',false);
      if(v==='*'){regAuto=true;v=bestRegion();region.value='*';}else regAuto=false;
      cc=v;changed=true;choice=null;tests=null;lastBrana=null;
      if(selPip!==AUTO&&selPip&&P?.d?.ips?.[selPip]?.loc!==v)selPip=AUTO;if(v&&!selPip)selPip=AUTO;
      fillPips();options.onRegion?.(v);preflight();
      // 切换地区直接从已验证的纯净池里秒切，6 小时内已测过的绝不重新全扫
      if(v&&P&&!P.prog&&candidateRows(v).some(([,e])=>e.ok==null||(e.at&&Date.now()-e.at>6*3600e3)))void refreshRegion(false);
    }
    async function refreshRegion(force=true){
      if(!P||!cc){say('请先选择地区；地区列表中日本优先显示。');return;}
      const j=startPoolWork(regionLabel(cc));if(!j)return;j.phase='resolve';paintWork();
      try{
        await P.load();if(!workLive(j))return;
        const lines=[...srcLines(j.region)];j.sources=lines.length;paintWork();
        const queue=lines.slice();
        const resolveOne=async()=>{while(queue.length&&workLive(j)){const l=queue.shift();let r;try{r=await P.refreshSrc(l,force,{cancelled:()=>!workLive(j)});}catch(e){r={err:String(e?.message||e)};}
          if(!workLive(j))return;j.resolved++;if(r?.err)j.dnsErrors++;fillPips();paintWork();}};
        await Promise.all(Array.from({length:Math.min(3,queue.length)},resolveOne));if(!workLive(j))return;
        const keys=candidateRows(j.region).filter(([,e])=>force||e.ok==null||(e.at&&Date.now()-e.at>6*3600e3)).map(([k])=>k);
        if(!keys.length){finishPoolWork(j,j.dnsErrors?'failed':'done',j.dnsErrors?'来源解析失败，已保留原列表；可稍后强制重试。':'候选列表已更新；近期已检的可用出口可直接选择。');return;}
        await testPips(keys,j.seq,j);
      }catch(e){if(workLive(j))finishPoolWork(j,'failed',friendly(e));}
    }
    region.onchange=()=>void pickRegion(region.value);
    // ---- 底部：确认 ----
    // 「确认」时自动测 Google（仅节点线路；本机代理 / 直连测不了）：不通只提示，不拦保存，只影响 Google 登录
    async function googleCheck(c){
      if(!c?.proxy||!/^vless:/i.test(c.proxy)||!Host.urlTest)return null;
      try{const r=(await Host.urlTest({items:[{link:c.proxy,pip:c.proxyIp||''}],timeout:8000}))?.[0];return r?.ok?{ok:true,ms:r.ms}:{ok:false,error:r?.error||'无结果'};}
      catch(e){return {ok:false,error:friendly(e)};}
    }
    const testsLine=(g,r)=>(g==null?'':g.ok?'Google 连接正常 · ':'Google 不通（'+g.error+'；Google 登录可能受影响） · ')+'Brana 检测通过（建连 + 3 次请求共 '+(r.ms>=1000?(r.ms/1000).toFixed(1)+' s':r.ms+' ms')+'）'+(r.ip?' · 出口 '+r.ip:'')+(r.loc?' · '+regionLabel(r.loc):'');
    // 纯净度把关（零容忍）：经节点的出口（显式指定 proxyIp 时）一律先评估，高风险或非纯净直接拒绝；若无可用 ProxyIP 而走节点自身代理兜底则允许通过
    async function riskBad(c,x,say){
      if(x?.ip&&(x.pure||x.ipa)&&typeof Pool!=='undefined'&&Pool.mutate){
        try{await Pool.mutate(d=>{if(x.pure)IPRep.putPu?.(d,x.ip,x.pure);if(x.ipa)IPRep.putIpa?.(d,x.ip,x.ipa);});}catch{}
      }
      if(c?.nativeFallback&&!c?.proxyIp)return '';
      if(!/^vless:/i.test(c?.proxy||'')||typeof IPRep==='undefined'||!IPRep.vet)return '';
      const targetPip=String(c?.proxyIp||'').trim()||(typeof Vless!=='undefined'&&Vless.proxyIpOf?String(Vless.proxyIpOf((()=>{try{return Vless.parse(c.proxy)?.path||'';}catch{return '';}})())||'').trim():'')||String(x?.ip||'').trim();
      if(!targetPip)return '';
      say?.('评估出口 IP 纯净度…');
      try{const v=await IPRep.vet(targetPip,x?.ip);if(!v.ok)return v.error;}catch{}
      return '';
    }
    // 同一条线路的检测共用：预检（选完就在后台测）和「应用更改」拿同一个结果；检测凭据 5 分钟内有效，期间应用不再重测
    const warm=new Map(),inflight=new Map();
    async function brana(c){
      const k=routeKey(c),w=warm.get(k)||(live&&cache.get(k)?.result);
      if(w&&Policy.good(w)&&w.proofExpires>Date.now()+15000){warm.set(k,w);return w;}
      if(inflight.has(k))return inflight.get(k);
      const job=(async()=>{
        const r=await io.probe({...c,kind:'manual'}).catch(e=>({ok:false,kind:e.kind||'network',error:String(e.message||e)}));
        // 失败 / 429 的结果不缓存：否则再点「确认」会直接拿到上次的失败，看起来像「没反应」
        cache.set(k,{at:Date.now(),result:r});if(Policy.good(r)){warm.set(k,r);lastBrana={key:k,at:Date.now(),result:r};}else warm.delete(k);return r;
      })().finally(()=>inflight.delete(k));
      inflight.set(k,job);return job;
    }
    // ---- 预检：选好节点 / 地区 / 出口后立刻在后台检测（不保存），点「应用更改」时直接用结果 ----
    let preT=0,pre=null;
    function preflight(){
      clearTimeout(preT);pre=null;paintFooter();
      if(!live||!options.footer||strategy!=='node'||applying||disposed)return;
      preT=setTimeout(async()=>{
        if(disposed||applying)return;const c=getCandidate();
        if(!/^vless:/i.test(c.proxy||'')||(cc&&!c.proxyIp))return;
        const k=routeKey(c);if(k===routeKey(current))return;
        pre={key:k,state:'run'};paintFooter();
        const r=await brana(c);if(disposed||pre?.key!==k)return;
        let bad=verdict(c,r);if(!bad)bad=await riskBad(c,r);
        if(disposed||pre?.key!==k)return;
        pre={key:k,state:bad?'bad':'ok',ms:r?.ms||0,error:bad};paintFooter();if(bad)fillPips();
      },350);
    }
    const preText=()=>{if(!pre)return '';const k=routeKey(getCandidate());if(pre.key!==k)return '';return pre.state==='run'?'预检中…':pre.state==='ok'?'✓ 预检通过 · '+pre.ms+' ms，可立即应用':'✗ '+pre.error;};
    // ---- 切换动画：A → B + 进度条 + 完成打勾（地区 IP 弹窗）----
    function routeLabel(f){const n=/^vless:/i.test(f?.proxy||'');return {node:n?(nodeOf(f.nodeId)?.name||f.nodeId||'节点'):isDirectP(f?.proxy)?'直连':'代理',region:f?.region?regionLabel(f.region):'不限地区',ip:f?.proxyIp?pipShow(f.proxyIp,P?.d?.ips?.[f.proxyIp]).main:'—'};}
    function diffRows(from,to){
      const A=routeLabel(from),B=routeLabel(to),rows=[];
      const row=(k,x,y)=>h('div',{class:'sw-row'},h('span',{class:'sw-k'},k),h('span',{class:'sw-a',title:x},x),h('span',{class:'sw-arr'},'→'),h('span',{class:'sw-b',title:y},y));
      if(A.node!==B.node)rows.push(row('节点',A.node,B.node));
      if(A.region!==B.region)rows.push(row('地区',A.region,B.region));
      if(A.ip!==B.ip)rows.push(row('出口 IP',A.ip,B.ip));
      return rows.length?rows:[h('div',{class:'sw-row sw-same'},'重新应用当前线路 · '+B.node+(to?.proxyIp?' · '+B.ip:''))];
    }
    let ovl=null;
    function showSwitch(from,to){
      if(!options.footer)return null;
      const host=wrap.closest('.modal')||wrap;ovl?.close();
      const bar=h('i'),txt=h('div',{class:'sw-step'},'准备中…'),ttl=h('div',{class:'sw-t'},h('i',{class:'spin'}),h('span',{},'正在切换')),rows=h('div',{class:'sw-rows'},...diffRows(from,to));
      const back=h('button',{type:'button',class:'btn ghost sm sw-back',hidden:true,onclick:()=>o.close()},'返回');
      const el=h('div',{class:'sw-ovl',role:'status','aria-live':'polite'},h('div',{class:'sw-card'},ttl,rows,h('div',{class:'sw-bar'},bar),txt,back));
      host.append(el);
      // 进度条：每一步定一个起点，等待期间缓慢往下一步推进（不会停在原地像卡住）
      let cur=4,cap=20;const tick=setInterval(()=>{if(cur<cap-2){cur+=Math.max(.4,(cap-cur)/24);bar.style.width=cur+'%';}},300);
      const o={el,ended:false,
        step(p,t){if(o.ended)return;cur=Math.max(cur,Math.min(100,p));cap=Math.min(97,p+17);bar.style.width=cur+'%';txt.textContent=t;},
        set(f,t){rows.replaceChildren(...diffRows(f,t));},
        done(t){o.ended=true;clearInterval(tick);el.classList.add('ok');ttl.replaceChildren(h('b',{class:'sw-ok'},'✓'),h('span',{},'已切换'));bar.style.width='100%';txt.textContent=t||'';setTimeout(()=>o.close(),1500);},
        fail(t){o.ended=true;clearInterval(tick);el.classList.add('bad');ttl.replaceChildren(h('b',{class:'sw-x'},'✗'),h('span',{},'未切换'));txt.textContent=t;back.hidden=false;back.focus?.();},
        close(){o.ended=true;clearInterval(tick);el.classList.add('out');setTimeout(()=>el.remove(),200);if(ovl===o)ovl=null;}};
      ovl=o;return o;
    }
    const hint=()=>isNodeMode()&&!pipOf()?'；CF 类节点请先选地区和出口 IP':'；换个节点或出口 IP 再试';
    function verdict(c,r){if(usable(c,r))return '';if(Policy.good(r)&&c.region&&r.loc!==c.region)return '实际出口 '+(r.loc?regionLabel(r.loc):'未知')+'，与所选地区 '+regionLabel(c.region)+' 不一致';return friendly(r?.error||'未通过 Brana 检测',hint());}
    // 自动模式的候选：不限节点与地区，优先最低延迟可用节点 + 全地区未限流纯净 IP → 节点自身代理兜底 → 本机代理端口
    async function autoCandidates(){
      const up=S?[...S.sort(nodes).filter(n=>S.get(n)?.ok),...nodes.filter(n=>!S.get(n)?.ok).sort((x,y)=>(/@\[/.test(io.link(x)||'')?1:0)-(/@\[/.test(io.link(y)||'')?1:0))]:nodes.slice().sort((x,y)=>(/@\[/.test(io.link(x)||'')?1:0)-(/@\[/.test(io.link(y)||'')?1:0)),seen=new Set(),list=[],bareList=[];
      const pushC=c=>{if(!c?.proxy)return;const k=routeKey(c);if(!seen.has(k)){seen.add(k);list.push(c);}};
      if(live&&typeof AutoRoute!=='undefined'&&AutoRoute.standby){
        for(const s of [...(AutoRoute.standby.ips||[]),...(AutoRoute.standby.nodes||[])]){
          if(s?.owner===owner&&s.candidate&&s.result?.ticket&&(s.expiresAt||0)>Date.now()+15000){
            const ck=routeKey(s.candidate);warm.set(ck,s.result);cache.set(ck,{at:Date.now(),result:s.result});pushC(s.candidate);
          }
        }
      }
      const allPurePips=!P?[]:P.entries().filter(([k,e])=>!e.gone&&e.ok===true&&!blocked(k)&&!cooling(e)).sort(([ka,x],[kb,y])=>((isCurPip(kb)?1:0)-(isCurPip(ka)?1:0))||((x.loc===cc?0:1)-(y.loc===cc?0:1))||grp(x)-grp(y)||(R?R.rank(kb,y)-R.rank(ka,x):0)||((x.used||0)-(y.used||0))||ka.localeCompare(kb)).slice(0,6).map(([k])=>k);
      for(const n of up.slice(0,3)){
        for(const p of pipChoices(2))if(p)pushC(getCandidate(n,p));
        for(const p of allPurePips.slice(0,2))if(p)pushC({proxy:io.link(n),nodeId:n.id||'',region:P?.d?.ips?.[p]?.loc||'',proxyIp:p});
        bareList.push({proxy:io.link(n),nodeId:n.id||'',region:'',proxyIp:'',nativeFallback:true});
      }
      for(const b of bareList)pushC(b);
      if(!list.length&&nodes.length)pushC(getCandidate(nodes[0]));
      return {list:list.slice(0,12),local:async()=>{const l=await io.local(Policy.ports).catch(()=>[]);return l.filter(x=>x.proxy).map(x=>({proxy:normProxy(x.proxy),proxyIp:'',nodeId:'',region:''}));}};
    }
    function paint(){
      const policyLocked=live?State.locked(UI.host?.account)&&a.id===UI.host.account.id:State.locked(a);
      const locked=policyLocked||loading||saving||!!wrap.closest('form')?._authDisabled;
      segment.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',b.dataset.k===strategy);b.disabled=applying||locked;});
      nodeRow.hidden=locationRow.hidden=strategy!=='node';proxyRow.hidden=strategy!=='proxy';   // 自动：完全自动优选，不展开具体选择；节点（手动）才展开
      for(const el of [nodeBtn,region,proxy,retest,subBtn,chgBtn,testAllPips,refreshPips,refreshRegions,reloadRegions,pipBtn])el.disabled=applying||locked;
      okBtn.disabled=applying||probing||locked;
      wrap.classList.toggle('np-auto-mode',isAuto());
      wrap.dataset.busy=applying?'true':'';if(policyLocked)say(lockText);else if(status.textContent===lockText)say('保持当前线路；选好后点「确认」');
      fillNodes();paintSummary();paintFooter();
    }
    // 底栏（地区 IP 弹窗）：当前线路 + 将要更改什么；未更改时「应用更改」= 强制重新应用当前选择
    // 底栏「当前」：出口写实际出口 IP + 住宅 / 机房 + 类型（SSTP / ProxyIP …），不写具体来源域名
    function footExit(k){const e=P?.d?.ips?.[k],eg=e?.eg&&/^\d+\.\d+\.\d+\.\d+$/.test(e.eg)?e.eg:(live&&typeof IP!=='undefined'&&IP.ip?IP.ip:''),kd=e&&R?.kind?R.kind(k,e):null,via=R?.via?R.via(k):'ProxyIP';return [eg||'出口未识别',kd?.t,via].filter(Boolean).join(' · ');}
    function paintFooter(){
      if(!options.footer||!footReady)return;
      const ccF_=typeof ccF==='function'?ccF:x=>x;
      const cn=nodeOf(current.nodeId),cm=State.mode(a);
      footNow.textContent='当前：'+(cm==='direct'?'直连':cm==='proxy'?'代理 '+(maskProxy(a.proxy||'')||''):(modeLabels[cm]||'')+(cn?' · '+(cn.name||cn.address||cn.id):'')+(current.region?' · '+ccF_(current.region):'')+(current.proxyIp?' · '+footExit(current.proxyIp):''));
      const d=[];
      if(strategy!==cm)d.push('模式 → '+modeLabels[strategy]);
      if(isNodeMode()){
        if(strategy==='node'&&selNode&&selNode!==current.nodeId)d.push('节点 → '+(nodeOf(selNode)?.name||selNode));
        if((cc||'')!==(current.region||''))d.push('地区 → '+(cc?ccF_(cc):'不限'));
        if(strategy==='node'&&cc&&selPip&&selPip!==AUTO&&selPip!==current.proxyIp)d.push('出口 → '+selPip);
        else if(strategy==='node'&&cc&&selPip===AUTO&&changed&&current.proxyIp)d.push('出口 → 自动');
      }else if(strategy==='proxy'&&normProxy(proxy.value||'')!==normProxy(a.proxy||''))d.push('代理 → '+(maskProxy(normProxy(proxy.value||''))||'未填写'));
      footChg.textContent=d.length?'将更改：'+d.join('，'):'未更改 · 点击将强制重新应用';footChg.classList.toggle('on',!!d.length);
      {const t=d.length?preText():'';footPre.textContent=t;footPre.hidden=!t;footPre.className='np-fpre'+(pre?.state==='ok'?' ok':pre?.state==='bad'?' bad':'');}
    }
    const sumText=(b)=>{const n=activeNode();return strategy==='direct'?'直连 · 本机网络':strategy==='proxy'?'代理 · '+(maskProxy(normProxy(proxy.value))||'本机端口'):modeLabels[strategy]+' · '+(n?(n.name||n.address||n.id):(nodes.length?'未选节点':'尚未配置节点'))+(b?.text?' · '+b.text:'')+' · '+(cc?regionLabel(cc)+(selPip&&selPip!==AUTO?' · '+selPip:''):regAuto?'地区自动':'不限地区');};
    function paintSummary(){
      if(fresh&&!probing&&!saving&&!/失败|不通|错误|无效|超时|限流|验证/.test(status.textContent)&&!status.classList.contains('bad'))say('新账号将使用：'+sumText());
      if(!options.collapsible)return;
      const n=activeNode(),b=n?badgeOf(n):null;
      sumVal.textContent=strategy==='direct'?'直连 · 本机网络':strategy==='proxy'?'代理 · '+(maskProxy(normProxy(proxy.value))||'本机端口'):modeLabels[strategy]+' · '+(n?(n.name||n.address||n.id):(nodes.length?'未选节点':'尚未配置节点'))+(b?.text?' · '+b.text:'')+' · '+(cc?regionLabel(cc):regAuto?'地区自动':'不限地区');
      const chip=(k,t)=>h('span',{class:'np-chip '+(t?.ok?'ok':'bad'),title:t?.ok?'':(t?.error||'')},k+(t?.ok?' ✓':' ✗'));
      sumChips.replaceChildren(...(tests?[tests.google?chip('Google',tests.google):null,tests.brana?chip('Brana',tests.brana):null].filter(Boolean):[]));
    }
    async function load(keep){
      try{
        if(!live)await ensureDraft();const data=await io.read();if(UI.host?.account?.id!==owner||disposed)return;
        nodes=[...(data.nodes||[])];accounts=data.accounts||[];
        // 订阅更新 / 变更后账号已换到新节点：面板里的旧快照也换成最新配置，旧节点 / 旧出口的测速结果作废（刷新、ping 都按最新配置）
        {const f=data.account;if(f&&f.id===a.id&&(f.proxy!==a.proxy||f.nodeId!==a.nodeId||String(f.proxyIp||'')!==String(a.proxyIp||''))){a={...a,...f};current=Policy.fields(f);if(f.nodeId&&State.isNode(f))selNode=f.nodeId;if(selPip!==AUTO)selPip=current.proxyIp||(current.region?AUTO:'');cache.clear();tests=null;choice=null;lastBrana=null;}}
        if(State.isNode(a)&&!nodes.some(n=>n.id===a.nodeId||io.link(n)===a.proxy)){const n=Vless.parse(a.proxy);if(n)nodes.unshift({...n,id:a.nodeId||'current',name:n.name||'当前账号节点'});}
        if(!keep&&State.isNode(a)){const own=nodes.find(n=>n.id===a.nodeId)||nodes.find(n=>io.link(n)===a.proxy);if(own)selNode=own.id;}
        if(!selNode&&nodes.length){const fb=nodes.find(n=>n.id===(a.nodeId||P?.d?.node))||bestNode()||nodes[0];if(fb)selNode=fb.id;}
        if(!cc&&(a.region||a.routeHome||(live&&typeof IP!=='undefined'&&IP.loc))){cc=a.region||a.routeHome||(live&&typeof IP!=='undefined'?IP.loc:'')||'';}
        if(P)await P.load().catch(()=>{});await S?.load?.();
        fillRegions();fillPips();paint();
        if(!keep){
          const localAuto=isAuto()&&a.proxy&&!State.isNode(a)&&!isDirectP(a.proxy);
          if(fresh)say('新账号将使用：'+sumText());else say(State.locked(a)?lockText:localAuto?'自动模式：当前本机代理比节点更优（'+maskProxy(a.proxy)+'）':'当前线路：'+(State.isNode(a)?(isAuto()?'自动 · ':'')+'节点 '+(nodes.find(n=>n.id===a.nodeId)?.name||a.nodeId||'')+(a.region?' · '+regionLabel(a.region):''):(isDirectP(a.proxy)?'直连':a.proxy||'默认本机代理'))+(a.proxyIp?' · ProxyIP '+a.proxyIp:''));
        }
        // 打开面板不重测：只测从没测过的节点；地区延迟 30 分钟内测过不重测；所选地区里没测过的 IP
        if(S&&nodes.length){const todo=nodes.filter(n=>!S.get(n));if(todo.length)void S.test(todo);}
        if(!keep&&P&&!P.prog&&cc&&candidateRows().some(([,e])=>e.ok==null||(e.at&&Date.now()-e.at>6*3600e3)))void refreshRegion(false);
      }catch(e){error=friendly(e);say(error,true);}finally{loading=false;paint();}
    }
    // 刚选了地区、出口 IP 还在后台检测：短等结果（最多 4 秒）；若仍无可用纯净 ProxyIP 则不弹死循环筛选窗，直接交给后续节点自身代理兜底
    async function readyPips(stale){
      if(!cc||!P||!isNodeMode()||!(isAuto()||selPip===AUTO))return;
      if(!pipChoices(1)[0]){
        for(let i=0;i<8&&pipBusy.size&&!pipChoices(1)[0]&&!stale();i++){say('等待 '+regionLabel(cc)+' 的出口 IP 检测结果…');await new Promise(r=>setTimeout(r,500));}
        if(stale())return;
        const keys=P.entries().filter(([k,e])=>!e.gone&&e.ok==null&&(e.loc===cc||(!e.loc&&srcLines(cc).has(e.src)))&&!P.banned?.(k)).map(([k])=>k).slice(0,6);
        if(keys.length&&!pipChoices(1)[0])await testPips(keys,++pipSeq);
        if(!pipChoices(1)[0]&&R?.prime&&!stale()){say('评估 '+regionLabel(cc)+' 出口 IP 的纯净度…');if(R._pr)R._pr[cc]=0;await R.prime(cc);}
      }
      if(stale())return;
      const ch=pipChoices(4).filter(Boolean);if(ch.length&&R?.rate)await R.rate(ch).catch(()=>{});
      if(!stale())fillPips();
    }
    async function check(){
      if(saving||disposed)return;const seq=++sequence,stale=()=>seq!==sequence||!wrap.isConnected||UI.host?.account?.id!==owner;
      let wanted=strategy;error='';changed=true;probing=true;clearTimeout(preT);paint();
      // 地区 IP 弹窗：切换动画（A → B、进度条、完成打勾）；其他编辑器只用状态行
      const sw=live?showSwitch(Policy.fields(a),getCandidate()):null,step=(p,t)=>{sw?.step(p,t);say(t);};
      let held=false,lockedPool=false;
      try{
        step(8,'读取当前配置…');
        if(!live)await ensureDraft();const data=await io.read();data.account=data.account?JSON.parse(JSON.stringify(data.account)):null;if(stale())return;
        if(State.locked(data.account))throw Error(lockText);
        // 手动应用期间：后台线路恢复 / 自动换节点 / 池维护全部让路，不和它抢检测名额、也不在中途改线路
        if(live){manualBusy++;held=true;if(typeof Pool!=='undefined'&&Pool.switching&&!Pool.switching.has(owner)){Pool.switching.add(owner);lockedPool=true;}}
        let candidate=getCandidate(),r=null,firstBad='';
        const pick=async list=>{   // 候选并行检测（每批 3 条），同批通过时优先最低延迟出口
          for(let i=0;i<list.length&&!r;i+=3){
            const part=list.slice(i,i+3),xs=await Promise.all(part.map((c,idx)=>brana(c).then(x=>({c,x,idx}))));if(stale())return 0;
            xs.sort((u,v)=>((u.x?.ok?0:1)-(v.x?.ok?0:1))||((u.x?.ms??9e9)-(v.x?.ms??9e9))||(u.idx-v.idx));
            for(let j=0;j<xs.length;j++){const {c,x}=xs[j];let bad=verdict(c,x);if(!bad){step(60,'评估出口纯净度…');bad=await riskBad(c,x);}if(stale())return 0;if(!bad){candidate=c;r=x;break;}firstBad||=bad;}
          }
          return true;
        };
        const warmed=list=>list.some(c=>{const k=routeKey(c),w=warm.get(k)||(live&&cache.get(k)?.result);return w&&Policy.good(w)&&w.proofExpires>Date.now()+15000;});
        if(wanted==='auto'){
          const {list,local}=await autoCandidates();
          step(warmed(list)?55:25,'自动：检测 '+list.length+' 条候选线路…');
          if(!await pick(list))return;
          if(!r){step(40,'节点都不可用，检测本机代理端口（7890 / 18080 等）…');for(const c of await local()){const x=await brana(c);if(stale())return;if(!verdict(c,x)){candidate=c;r=x;break;}}}
          if(!r)throw Error(firstBad||'没有可用节点，也没有可用的本机代理端口；保留当前线路');
        }else{
          if(isNodeMode()&&!/^vless:/i.test(candidate.proxy))throw Error('请先选择节点');
          await readyPips(stale);if(stale())return;candidate=getCandidate();
          const tries=isNodeMode()?pipChoices(4).map(p=>getCandidate(null,p)):[candidate];
          step(warmed(tries)?55:25,warmed(tries)?'使用预检结果…':tries.length>1?'并行检测 '+tries.length+' 个出口…':'检测线路…');
          if(!await pick(tries))return;
          const limited=tries.filter(c=>cache.get(routeKey(c))?.result?.kind==='rate-limit').length;
          if(!r&&!limited&&isNodeMode()&&/^vless:/i.test(candidate.proxy)&&(isAuto()||selPip===AUTO||!selPip)){
            step(45,'无可用 ProxyIP，使用节点自身代理兜底检测…');
            if(!await pick([{proxy:candidate.proxy,nodeId:candidate.nodeId||'',region:'',proxyIp:'',nativeFallback:true}]))return;
          }
          if(!r&&wanted==='direct'&&live&&nodes.length){
            step(45,'直连无法连接，正在使用可用节点代理兜底…');
            const {list}=await autoCandidates();
            if(!await pick(list))return;
            if(r)wanted='node';
          }
          if(!r){throw Error(limited&&limited===tries.length?'所选'+(cc?regionLabel(cc)+'的':'')+(tries.length>1?'前 '+tries.length+' 个':'')+'出口 IP 都被 Brana 限流（429），未切换；稍后再试，或换个地区 / 节点':firstBad||'未通过 Brana 检测');}
        }
        cancelPoolWork('正在应用已选择的线路',false);
        sw?.set(Policy.fields(a),candidate);
        let g=null;
        if(!live){say('检测 Google 连通性…');g=await googleCheck(candidate);if(stale())return;}
        tests={google:g,brana:r};paintSummary();
        if(live){
          const authForm=wrap.closest('.auth-form');
          if(authForm){const d=UI.authDraft(a);Store.set('auth-route-draft',{accountId:a.id,email:d.email,name:d.name||'',mode:authForm.dataset.authMode||'login',at:Date.now()});}
          applying=true;paint();step(78,'检测通过，正在应用…');
          if((candidate?.proxyIp||(r?.ip&&(r?.pure||r?.ipa)))&&P?.mutate){try{await P.mutate(d=>{if(r?.ip&&r?.pure&&typeof IPRep!=='undefined')IPRep.putPu?.(d,r.ip,r.pure);if(r?.ip&&r?.ipa&&typeof IPRep!=='undefined')IPRep.putIpa?.(d,r.ip,r.ipa);if(candidate?.proxyIp){d.ips||={};const it=d.ips[candidate.proxyIp]||={ip:String(candidate.proxyIp).split(':')[0]};it.ok=true;it.gone=false;it.banned=false;it.cool=0;if(r?.loc)it.loc=r.loc;if(r?.ip)it.eg=r.ip;if(r?.ms)it.ms=r.ms;if(d.ban)delete d.ban[String(candidate.proxyIp).toLowerCase()];}});}catch{}}
          const saved=await selector({...io,cancelled:stale}).apply(data.account,candidate,wanted,r);warm.delete(routeKey(candidate));cache.delete(routeKey(candidate));lastBrana=null;pre=null;
          Object.assign(a,saved);current=Policy.fields(saved);changed=false;if(P&&State.isNode(saved)&&saved.nodeId){if(P.d)P.d.node=saved.nodeId;if(!UI.host?.routeDraft)void P.setNode(saved.nodeId).catch(()=>{});}UI.host=await Host.info();UI.renderAcct?.();
          // 刚手动换好：记录手动选路锁定窗口（自动模式仅短暂防抖 15 秒，手动指定节点/IP 则锁定 10 分钟防止后台误切走）
          if(typeof AutoRoute!=='undefined'){AutoRoute.noteManualRoute?.(wanted==='auto'?15000:600000);if(AutoRoute.engine)AutoRoute.engine.next=Math.max(AutoRoute.engine.next||0,Date.now()+(wanted==='auto'?15000:60000));AutoRoute.failed=false;}
          try{if(saved?.id&&(saved.proxy||saved.proxyIp))Store.set('lastGoodRoute:'+saved.id,{id:saved.id,proxy:saved.proxy||'',proxyIp:saved.proxyIp||'',nodeId:saved.nodeId||'',region:saved.region||'',at:now()});}catch{}options.onApplied?.(saved);
          setTimeout(()=>Store.del('auth-route-draft'),2000);
          const effective=State.isNode(saved)?'节点 '+(nodes.find(n=>n.id===saved.nodeId)?.name||saved.nodeId||''):isDirectP(saved.proxy)?'直连':'本机代理 '+maskProxy(saved.proxy);
          // 出口 IP 就用刚才检测这条线路时测到的（同一条线路），不再等 /cdn-cgi/trace（最多 6 秒）；实时出口在后台刷新
          const exit=r.ip||(typeof IP!=='undefined'&&IP.ip&&!IP.err?IP.ip:'');
          if(typeof IP!=='undefined'){if(r.ip){IP.ip=r.ip;if(r.loc)IP.loc=r.loc;IP.err=null;IP.rttFail=0;IP.at=now();IP.checkedAt=now();}else{IP.ip='';IP.at=0;IP.checkedAt=0;}void Promise.resolve(IP.polling).then(()=>IP.poll()).catch(()=>{});}
          try{if(typeof Chats!=='undefined'&&typeof Chats.onRouteSwitched==='function')Chats.onRouteSwitched();}catch{}
          say('已保存 · '+modeLabels[wanted]+' · '+effective+(saved.proxyIp?' · '+saved.proxyIp:'')+'\n'+testsLine(null,r)+(wanted==='auto'&&!State.isNode(saved)?'\n当前本机代理比节点更优':''));
          if(sw)sw.done((exit?'出口 '+exit+' · ':'')+(r.ms>=1000?(r.ms/1000).toFixed(1)+' s':r.ms+' ms'));
          else if(typeof toast==='function')toast('✓ 连接已更新 · '+modeLabels[wanted]+' · '+effective+(saved.proxyIp?' · '+saved.proxyIp:''));
          // Google 连通性放到后台：只影响 Google 登录，不挡切换
          void googleCheck(candidate).then(g2=>{if(disposed||!g2)return;tests={google:g2,brana:r};paintSummary();if(applying||probing)return;const t0=status.textContent,l0=testsLine(null,r);say(t0.includes(l0)?t0.replace(l0,testsLine(g2,r)):t0+(g2.ok?'':'\nGoogle 不通（'+g2.error+'；Google 登录可能受影响）'));});
        }else{
          current={...Policy.fields(candidate),region:candidate.region||r.loc||''};choice={candidate:{...current},mode:wanted,result:r};
          say('检测通过 · '+testsLine(g,r)+'；保存此账号后使用所选线路'+(wanted==='auto'&&!State.isNode(current)?'（当前本机代理比节点更优）':''));
          if(typeof toast==='function')toast('✓ 连接检测通过 · '+testsLine(g,r)+'（保存账号后生效）');
        }
        if(!stale()){cc=current.region||cc;if(selPip!==AUTO||!isAuto())selPip=selPip===AUTO?AUTO:(current.proxyIp||'');if(current.nodeId)selNode=current.nodeId;fillRegions();fillPips();fillNodes();}
      }catch(e){if(!stale()){error=friendly(e,hint());say(error,true);if(sw)sw.fail(error);else if(live&&typeof toast==='function')toast('未切换：'+error,'err');}}
      finally{if(held){const hold=sw&&sw.el.classList.contains('ok')?900:0;if(hold)setTimeout(()=>{manualBusy=Math.max(0,manualBusy-1);},hold);else manualBusy=Math.max(0,manualBusy-1);}if(lockedPool)Pool.switching.delete(owner);if(sw&&!sw.ended)sw.close();if(seq===sequence){probing=false;applying=false;paint();}}
    }
    async function detectProxy(){
      if(proxy.value.trim())return;say('正在检测本机代理端口（7890 / 18080 / 10809 等）…');
      const l=await io.local(Policy.ports).catch(()=>[]);if(strategy!=='proxy'||disposed)return;
      const hit=l.find(x=>x.proxy&&x.ip)||l.find(x=>x.proxy);
      if(hit){proxy.value=normProxy(hit.proxy);say('检测到本机代理 '+proxy.value+(hit.ip?' · 出口 '+hit.ip:'')+'；点「确认」');}else say('没有检测到本机代理端口，请手动填写');
    }
    async function chooseMode(value){if(applying||saving||State.locked(a))return;if(value!==strategy)cancelPoolWork('连接模式已改变',false);if(value==='auto'&&strategy!=='auto'){regAuto=true;fillRegions();}if(value==='node'){if(!selNode&&nodes.length){const fb=nodes.find(n=>n.id===(a.nodeId||P?.d?.node))||bestNode()||nodes[0];if(fb)selNode=fb.id;}if(!cc){cc=a.region||a.routeHome||(live&&typeof IP!=='undefined'?IP.loc:'')||bestRegion()||'';if(cc){regAuto=false;region.value=cc;}}}strategy=value;choice=null;tests=null;changed=true;error='';paint();fillPips();say(value==='proxy'?'代理：填写或自动检测本机代理端口后点「确认」':value==='direct'?'直连：点「确认」检测并保存':value==='auto'?'自动：节点、地区、出口全部自动优选':'节点（手动）：选节点、地区和出口后点「确认」');if(value==='proxy'){proxy.focus();void detectProxy();}}
    proxy.oninput=()=>{sequence++;probing=false;changed=true;choice=null;tests=null;lastBrana=null;error='代理地址已修改，请点击「确认」';paint();say(error);};
    async function commit(){
      if(!live)return;
      if(!changed&&!error&&strategy===State.mode(a)&&Policy.key(current)===Policy.key(a)){
        const fresh=(await io.read()).account;if(!fresh||fresh.id!==owner)throw Error('账号已改变，请重新打开连接设置');
        a={...a,...fresh};current=Policy.fields(fresh);strategy=State.mode(fresh);cc=current.region||'';selPip=current.proxyIp||(cc?AUTO:'');if(current.nodeId)selNode=current.nodeId;proxy.value=!State.isNode(fresh)&&!isDirectP(fresh.proxy)?fresh.proxy||'':'';fillRegions();fillPips();paint();return a;
      }
      return check();
    }
    function preferences(){const p=State.prefs(strategy);if(!changed&&strategy===State.mode(a)){p.routeAuto=a.routeAuto!==false;p.nodeFailover=a.nodeFailover===true;}return p;}
    function payload(patch){return {...patch,...current,...preferences(),...(a.id?{id:a.id}:{})};}
    async function save(patch){
      if(live){await commit();if(error)throw Error(error);return Host.saveAccount(payload(patch));}
      if(saving||probing||loading)throw Error('连接仍在检测或保存，请等待结果');
      if(error)throw Error(error);
      if((changed||!a.id)&&!choice){await check();if(error)throw Error(error);if(!choice)throw Error('连接检测未完成，请点「确认」');}
      saving=true;paint();
      const seq=sequence;
      try{
        const d=await ensureDraft();
        let proof=choice?.result;
        const needsProof=!a.id||changed||!!patch.fp;
        if(needsProof){
          if(!current.proxy||strategy==='node'&&!State.isNode(current))throw Error('请先选择节点并点「确认」');
          if(!proof?.ticket||proof.proofExpires&&proof.proofExpires<=Date.now()+15000||patch.fp){say('保存前复测所选线路…');proof=await io.probe({...current,kind:'manual'});if(!usable(current,proof)||!proof.ticket)throw Error(friendly(proof?.error||'保存前检测未通过，未修改任何账号',hint()));choice={candidate:{...current},mode:strategy,result:proof};}
        }
        if(disposed||!wrap.isConnected||seq!==sequence||UI.host?.account?.id!==owner)throw Error('编辑器或选择已改变，未保存');
        say('正在保存目标账号；不修改调用方线路…');let result;
        try{result=await base.saveDraft({draft:d.draft,ticket:proof?.ticket||'',account:payload(patch)});}
        catch(e){const st=await base.draft({op:'status',draft:d.draft}).catch(()=>null);if(st?.committed)result={ok:true,account:st.account};else throw Error('保存结果未确认，请刷新检查；不会自动重复提交');}
        if(!result?.ok||!result.account?.id)throw Error(result?.error||'宿主未确认账号保存');
        a={...a,...result.account};current=Policy.fields(a);strategy=State.mode(a);changed=false;choice=null;tests=null;
        void base.draft({op:'close',draft:d.draft}).catch(()=>{});draft=null;
        say('已保存目标账号：'+(a.email||a.name||a.id)+' · '+modeLabels[strategy]);return result.account;
      }finally{saving=false;paint();}
    }
    const detach=new MutationObserver(()=>{if(wrap.isConnected||disposed)return;cancelPoolWork('面板已关闭',false);clearTimeout(poolPaintTimer);disposed=true;sequence++;pipSeq++;detach.disconnect();off();off2();off3();off4?.();off5?.();document.removeEventListener('pointerdown',outside,true);if(draft&&!saving)void base.draft({op:'close',draft:draft.draft}).catch(()=>{});});
    queueMicrotask(()=>{if(wrap.isConnected)detach.observe(document.body,{childList:true,subtree:true});});
    const syncLiveAcct=()=>{
      if(!live||!wrap.isConnected||applying||probing||saving)return;
      const f=UI.host?.account;
      if(f&&f.id===owner&&(f.proxy!==a.proxy||f.nodeId!==a.nodeId||String(f.proxyIp||'')!==String(a.proxyIp||''))){
        a={...a,...f};current=Policy.fields(f);
        if(f.nodeId&&State.isNode(f))selNode=f.nodeId;
        if(f.region){cc=f.region;region.value=regAuto?'*':cc;}
        selPip=current.proxyIp||(current.region?AUTO:'');
        changed=false;choice=null;tests=null;
      }
      fillRegions();fillPips();paint();
    };
    const off=Bus.on('route-state',()=>{if(!wrap.isConnected){off();return;}if(poolWork?.running&&!workContext(poolWork))cancelPoolWork('账号或线路已改变',false);syncLiveAcct();});
    const off2=Bus.on('nodespeed',()=>{if(wrap.isConnected){fillNodes();if(isAuto())fillPips();}});
    const off3=Bus.on('pool',()=>{if(wrap.isConnected&&!pipBusy.size){fillRegions();fillPips();}});
    const off4=Bus.on?Bus.on('rtt',()=>{if(wrap.isConnected&&!pipBusy.size){fillRegions();fillPips();fillNodes();paintFooter();}}):null;
    const off5=Bus.on?Bus.on('ip',()=>{if(wrap.isConnected&&!pipBusy.size){syncLiveAcct();}}):null;
    footReady=true;
    queueMicrotask(()=>void load());
    return {inp:wrap,hint:status,selectMode:chooseMode,get busy(){return applying||probing||saving;},block:()=>wrap,refresh:load,check,commit,save,draftRoute:!live,testedRoute:true,setRegion(c){if(c!==cc||regAuto)void pickRegion(c);},
      get mode(){return State.isNode(current)?'node':strategy==='direct'?'direct':'local';},get routeMode(){return strategy;},
      get proxy(){return current.proxy;},get proxyIp(){return current.proxyIp;},get nodeId(){return current.nodeId;},get region(){return current.region;},get exit(){try{return lastBrana&&lastBrana.key===routeKey(current)?String(lastBrana.result?.loc||''):'';}catch{return '';}},
      err(){return loading||applying||probing||saving?'线路正在读取、检测或保存，请等待结果':error||'';}};
  }
  return {selector,rank,usable,cache,adapter,field,friendly,get manual(){return manualBusy;}};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=NodeRoutes;
