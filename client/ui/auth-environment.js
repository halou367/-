// Actual server identity is checked by the auth flow. The host remains authority for the route lease.
const AuthEnv = {
  state:null, starting:null, operations:0,
  environment(){return [navigator.userAgent,navigator.language,Intl.DateTimeFormat().resolvedOptions().timeZone].join('|');},
  async call(request){
    if(typeof Host.authTask!=='function')throw Error('当前宿主不支持原生认证环境锁，请更新客户端 / Android System WebView');
    const result=await Host.authTask(request);if(!result?.ok)throw Object.assign(Error(result?.error||'认证环境未确认'),{code:result?.code||'AUTH_ENV_UNCONFIRMED'});return result;
  },
  async exit(){
    return NetPolicy.deadline(async signal=>{
      const response=await rawFetch('/cdn-cgi/trace',{credentials:'same-origin',cache:'no-store',signal});
      if(!response.ok)throw Object.assign(Error('实际出口检测失败（HTTP '+response.status+'），未开始认证'),{status:response.status});
      const body=await response.text(),ip=/^ip=([0-9a-fA-F:.]+)\s*$/m.exec(body)?.[1];
      if(!ip)throw Error('未获得当前账号的真实出口，未开始认证');return ip;
    },{timeout:12000});
  },
  async restore(opt){
    if(typeof Host.authTask!=='function')return null;
    const state=await this.call({op:'status'});this.state=state.locked?{...state,accountId:UI.host?.account?.id}:null;
    if(this.state){const local=Store.get('auth-mail-stage',null);if(local?.ticket===this.state.ticket&&local.accountId===this.state.accountId&&Date.now()-local.at<30*60000)this.state={...this.state,stage:'waiting-mail',kind:local.kind};}
    if(UI.host?.account)UI.host.account.authLocked=!!this.state;
    this.watch();this.paint();Bus.emit('route-state');
    // 以前失败 / 中断的密码登录留下的锁：没有认证在进行时自动放掉（不用再手动点「取消认证」）
    // Google 登录的锁：只有从 Google 回来（?glogin=1）才需要保留去做最终身份复核；其他时候（取消、被拦、中途退出）也自动放掉
    const gReturn=/[?&]glogin=1/.test(location.search),k=this.state?.kind;
    if(!opt?.keep&&(k==='login'||(k==='google'&&!gReturn))&&!this.state.stage&&!this.operations&&!this.starting&&!(typeof Auth!=='undefined'&&Auth.interactive))return await this.drop([k]).then(ok=>ok?null:this.state);
    return this.state;
  },
  begin(kind,email=''){
    const key=[UI.host?.account?.id,kind,String(email).trim().toLowerCase()].join('|');
    if(this.starting){if(this.startingKey!==key)return Promise.reject(Error('另一认证步骤正在准备，请等待结果'));return this.starting;}
    this.startingKey=key;
    this.starting=(async()=>{
      AutoRoute.authPending=true;
      try{
        const info=await Host.info(),account=info?.account;if(!account?.id)throw Error('无法确定当前账号，未开始认证');
        const expected={...account};UI.host=info;account.authLocked=true;this.paint();Bus.emit('route-state');
        const prepared=await this.call({op:'prepare',kind,email:String(email).trim(),expected,environment:this.environment()});
        this.state={...prepared,accountId:account.id};this.watch();this.paint();
        const ip=await this.exit();
        const result=await this.call({op:'begin',kind,email:String(email).trim(),ip,expected,environment:this.environment()});
        this.state={...result,accountId:account.id};this.watch();this.paint();return {...this.state};
      }catch(e){await this.restore().catch(()=>{});throw e;}
      finally{AutoRoute.authPending=false;this.starting=null;Bus.emit('route-state');}
    })();return this.starting;
  },
  async mail(kind){
    const task=this.state;if(!task?.ticket)throw Error('邮件请求已接受，但认证任务未确认，请勿重复发送');
    Store.set('auth-mail-stage',{ticket:task.ticket,accountId:task.accountId,kind,at:Date.now()});
    this.state={...task,kind,stage:'waiting-mail'};
    try{await this.call({op:'stage',ticket:task.ticket,kind,stage:'waiting-mail'});}
    catch(e){toast('邮件请求已接受，原生进度保存未确认；线路保持锁定，请直接完成邮件验证','err');}
    this.paint();
  },
  async finish(user,task){
    if(!task){await this.restore();task=this.state;}
    if(!task?.locked){if(user)try{Pin.hold(false);}catch{}return user;}
    if(task.accountId!==UI.host?.account?.id)throw Error('认证账号已改变，未确认完成');
    if(task.preparing){task=await this.begin('verify',task.email||user?.email||'');const live=await api('/api/me',{noRelogin:true});user=AuthFlow.identity(live?.user,task.email||user?.email);}
    AuthFlow.identity(user,task.kind==='login'?user?.email:(task.email||user?.email));
    const ip=await this.exit();
    await this.call({op:'finish',ticket:task.ticket,email:user.email,ip,environment:this.environment()});
    this.state=null;Store.del('auth-mail-stage');if(UI.host?.account)UI.host.account.authLocked=false;try{Pin.hold(false);}catch{}this.paint();Bus.emit('route-state');return user;
  },
  // 密码登录（kind=login）没有「等邮件」这一步：失败 / 中断后不该留下必须手动取消的认证锁。静默放掉；注册、找回密码、Google、邮件验证这类要等外部步骤的任务不动。
  async drop(kinds=['login']){
    try{
      const task=this.state?.locked?this.state:await this.restore({keep:true});
      if(!task?.locked||!kinds.includes(task.kind)||task.stage||!task.ticket)return false;
      await this.call({op:'cancel',ticket:task.ticket});this.state=null;Store.del('auth-mail-stage');
      if(UI.host?.account)UI.host.account.authLocked=false;this.paint();Bus.emit('route-state');return true;
    }catch{return false;}
  },
  async cancel(){
    if(this.operations||this.starting){toast('认证请求正在进行，请等待结果后取消','err');return false;}
    const task=await this.restore();if(!task)return true;
    if(!await Dialog.confirm({title:'取消未完成的认证',text:'取消本账号的认证任务并解除线路锁；不清除 Cookie，不重发请求。之后才能更换节点或邮箱。',ok:'确认取消'}))return false;
    await this.call({op:'cancel',ticket:task.ticket});this.state=null;Store.del('auth-mail-stage');
    try{localStorage.removeItem('anc-auth');localStorage.removeItem('anc-auth-email');await Host.shared('signup@'+task.accountId,null);}catch{}
    if(UI.host?.account)UI.host.account.authLocked=false;this.paint();Bus.emit('route-state');return true;
  },
  watch(){
    if(this.observer)return;this.observer=new MutationObserver(()=>this.paint());this.observer.observe(document.body||document.documentElement,{childList:true,subtree:true});
  },
  paint(){
    const old=document.querySelector('.auth-route-lock'),task=this.state;
    if(!task?.locked||task.accountId!==UI.host?.account?.id){old?.remove();return;}
    const target=document.querySelector('#view .auth-form')||document.querySelector('#view .lform');if(!target){old?.remove();return;}
    const expired=task.expires<=Date.now(),busy=!!(this.operations||this.starting),key=[task.ticket,task.email,task.stage,expired,busy].join('|');
    if(old?.dataset.key===key&&old.parentElement===target)return;
    old?.remove();const button=h('button',{type:'button',class:'btn ghost sm',disabled:busy||null,onclick:()=>this.cancel().catch(e=>toast(describe(e),'err'))},'取消认证');
    const box=h('div',{class:'auth-route-lock','data-key':key,'data-noghost':'true',role:'status'},h('span',{},(expired?'任务已过期，线路仍锁定':'认证环境已锁定')+(task.email?' · '+task.email:'')+'。线路配置不可更改，继续及完成时核对实际出口。'),button);
    target.append(box);
  },
};
