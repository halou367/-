// Same native adapter for the live page and offline page; never exports cookies or auth tokens.
const RouteHost = {
  pending:new Map(),
  rpc(bridge,method,arg){
    if(!bridge?.postMessage)return Promise.reject(Error('当前 WebView 不支持受限主框架线路接口，请更新客户端 / WebView'));
    if(this.bound!==bridge){this.bound=bridge;bridge.onmessage=event=>{let value;try{value=JSON.parse(event.data);}catch{return;}const task=this.pending.get(value.id);if(task){this.pending.delete(value.id);clearTimeout(task.timer);task.resolve(value.result);}};}
    const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('宿主结果未确认，请刷新检查；不会重复应用'));},80000);this.pending.set(id,{resolve,reject,timer});try{bridge.postMessage(JSON.stringify({id,method,arg}));}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});
  },
  create(H, A, vl) {
    const call=(name,...args)=>H ? H[name](...args) : Promise.resolve().then(()=>{const v=A[name](...args.map(x=>typeof x==='string'?x:JSON.stringify(x)));return v?JSON.parse(v):null;});
    const job=async(name,o)=>{const id=A[name](JSON.stringify(o));if(!id)throw Error('线路任务未启动');for(let i=0;i<800;i++){await new Promise(r=>setTimeout(r,100));const v=A.probeGet(id);if(v)return JSON.parse(v);}throw Error('线路任务结果未确认，请稍候再查；不会重复应用');};
    const config=c=>({...c,xout:/^vless:/i.test(c.proxy||'')?JSON.stringify(vl.outbound(vl.parse(c.proxy),c.proxyIp||'')):''});
    const secure=typeof window!=='undefined'?window.BranaRoute:null;
    const supported=!!(H?.routeProbe&&H?.routeApply&&H?.routePrefs)||(!!A?.routeProbeStart&&!!A?.routeApplyStart&&!!A?.routePrefs)||!!secure?.postMessage;
    if(!supported)return null;
    let draftSupported=!!(H?.routeDraft&&H?.routeSave);
    if(!H&&secure)try{draftSupported=JSON.parse(A.info()||'{}').routeDraft===true;}catch{}
    return {
      draftSupported,
      draft:request=>H?call('routeDraft',request):this.rpc(secure,'routeDraft',request),
      saveDraft:request=>H?call('routeSave',request):this.rpc(secure,'routeSave',{...request,account:config(request.account)}),
      async read(target){const [info,nodes,pool,accounts]=await Promise.all([call('info'),H?call('shared','nodes'):call('sharedGet','nodes'),H?call('shared','pippool'):call('sharedGet','pippool'),H?call('listAccounts',true):call('listAccountsLite')]);if(!info||!Array.isArray(accounts))throw Error('账号或线路列表不可用');const account=target===undefined?info.account:target?(info.account?.id===target?info.account:accounts.find(a=>a.id===target)):null;if((target===undefined||target)&&!account)throw Error('目标账号不存在，请刷新');return {account,caller:info.account||null,nodes:Array.isArray(nodes)?nodes:[],pool:pool||{},accounts,enabled:!!account&&(typeof RouteState!=='undefined'?RouteState:require('./route-state')).canRecover(account)};},
      link:n=>vl.toLink(n),
      probe:c=>H?call('routeProbe',c):secure?this.rpc(secure,'routeProbe',config(c)):job('routeProbeStart',config(c)),
      apply:o=>H?call('routeApply',o):secure?this.rpc(secure,'routeApply',{...o,route:config(o.route)}):job('routeApplyStart',{...o,route:config(o.route)}),
      enabled:on=>secure&&!H?this.rpc(secure,'routePrefs',{on:!!on}):call('routePrefs',!!on),
      async local(ports){const r=H?await call('localScan',ports):await job('localScanStart',ports);return Array.isArray(r?.list)?r.list:[];},
    };
  },
};
if(typeof module!=='undefined'&&module.exports)module.exports=RouteHost;
