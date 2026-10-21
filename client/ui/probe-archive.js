// User-requested archiving of confirmed THINKING skips only. Never delete; never classify thinking as open weights.
const ProbeArchive = (() => {
  let key='', queue=new Map(), done=new Map(), busy=false, timer=0, started=false,storageWarned=false,retryAt=0;
  const thinking = fp => !!fp && ['visible-thinking','compat-thinking'].includes(fp.skipped) && fp.stopConfirmed===true;
  const owner = () => UI.host?.account?.id || 'web';
  const stamp = e => String(e?.fingerprint?.guard?.at || e?.at || 'legacy');
  function load(){
    const k='probe-archive@'+owner();if(k===key)return;key=k;
    const data=Store.get(key,{})||{},pending=Array.isArray(data)?data:Array.isArray(data.pending)?data.pending:[];
    queue=new Map(pending.filter(x=>x&&typeof x.sid==='string').map(x=>[x.sid,x]));
    done=new Map((Array.isArray(data.done)?data.done:[]).filter(x=>Array.isArray(x)&&typeof x[0]==='string'&&typeof x[1]==='string'));
    retryAt=Number.isFinite(data.retryAt)?data.retryAt:0;storageWarned=false;
  }
  function save(){while(done.size>5000)done.delete(done.keys().next().value);if(Store.set(key,{pending:[...queue.values()],done:[...done],retryAt})===false&&!storageWarned){storageWarned=true;toast('归档队列未写入本机；当前窗口会继续重试，请勿立即关闭','err');}}
  function soon(ms=1200){clearTimeout(timer);timer=setTimeout(()=>void drain(),ms);}
  const canCleanup = (sid, chat) => typeof Gacha !== 'undefined' && typeof Gacha.canAutoCleanupChat === 'function' && Gacha.canAutoCleanupChat(sid, chat);
  function consider(chat,entry){
    if(!thinking(entry?.fingerprint)||!chat?.sid||!canCleanup(chat.sid,chat))return false;
    load();if(done.get(chat.sid)===stamp(Models.get(chat.sid)||entry))return false;if(!queue.has(chat.sid)){queue.set(chat.sid,{sid:chat.sid,at:now(),next:0});save();}
    soon();return true;
  }
  function scan(){
    if(!started)return;load();
    for(const [sid,entry]of Object.entries(Models.all||{}))if(thinking(entry?.fingerprint)&&canCleanup(sid,typeof Chats!=='undefined'?Chats.get(sid):null)&&History.byId(sid)&&!History.byId(sid).isArchived&&!queue.has(sid)&&done.get(sid)!==stamp(entry))queue.set(sid,{sid,at:now(),next:0});
    save();if(queue.size)soon();
  }
  async function drain(){
    if(busy||!started)return;load();if(retryAt>now()){soon(Math.min(30000,retryAt-now()));return;}const account=owner(),scope=key;busy=true;
    try{
      for(const [sid,item]of queue){
        if(owner()!==account||key!==scope)return;
        const entry=Models.get(sid),chat=Chats.get(sid),history=History.byId(sid);
        if((entry&&!thinking(entry.fingerprint))||!canCleanup(sid,chat)){queue.delete(sid);continue;}
        if(!history&&History.full){queue.delete(sid);continue;}
        if(!entry||!history||item.next>now())continue;
        if(history.isArchived){done.set(sid,stamp(entry));queue.delete(sid);continue;}
        if(chat?.busy||chat?.fpLocked||chat?.queue?.length||Fingerprint.isRunning?.(chat)||FingerprintBatch.owns(sid))continue;
        if(typeof Hitl!=='undefined'&&chat&&Hitl.pending(chat).length)continue;
        try{
          await History.archive(sid);
          if(owner()!==account||key!==scope)return;
          done.set(sid,stamp(entry));queue.delete(sid);
          Gacha.noteArchived?.(sid);
          Bus.emit('probe-archive',sid);Bus.emit('gacha');
        }catch(error){
          if(owner()!==account||key!==scope)return;
          item.next=now()+Math.max(45000,error?.retryAfterMs||0);item.error=describe(error);if(error?.status===429||error?.retryAfterMs)retryAt=Math.max(retryAt,item.next);
          toast('思考跳过对话归档失败，已保留并排队重试：'+item.error,'err');
        }
        save();break; // bounded, one archive request per tick
      }
    }finally{busy=false;if(key===scope&&owner()===account){save();if(queue.size)soon(5000);}}
  }
  function start(){started=true;load();scan();}
  Bus.on('history',scan);
  return {start,consider,scan,drain,thinking,get pending(){load();return queue.size;}};
})();
