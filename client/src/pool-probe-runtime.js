'use strict';
// Bounded, sender-owned probe jobs. Cancellation never releases a running slot
// until the runner has actually cleaned up its network sessions and child process.
const {randomUUID}=require('node:crypto');
const cancelled=()=>Object.assign(new Error('检测已取消'),{name:'AbortError'});
function withAbort(promise,signal){
  if(!signal)return Promise.resolve(promise);
  if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(cancelled());}
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(cancelled());};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(v=>{cleanup();resolve(v);},e=>{cleanup();reject(e);});
  });
}
function createPoolProbeRunner(run,{limit=4,queueLimit=16,deadlineMs=45000}={}){
  const jobs=new Map(),queue=[],slots=Array.from({length:limit},(_,i)=>i);
  const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9._-]{1,100}$/.test(id);
  const key=(sender,id)=>String(sender.id)+':'+id;
  const destroyed=s=>typeof s.isDestroyed==='function'&&s.isDestroyed();
  function drain(){
    while(slots.length&&queue.length){
      const j=queue.shift();if(j.settled)continue;
      if(j.signal.aborted){finish(j,j.cancelResult());continue;}
      j.slot=slots.pop();j.running=true;j.stage('preparing');
      Promise.resolve().then(()=>run(j.event,j.options,j)).then(
        r=>finish(j,j.signal.aborted?j.cancelResult():r),
        e=>finish(j,j.signal.aborted?j.cancelResult():{error:String(e?.message||e)})
      );
    }
  }
  function finish(j,result){
    if(j.settled)return;j.settled=true;clearTimeout(j.timer);
    jobs.delete(j.key);j.sender.removeListener?.('destroyed',j.onDestroyed);
    if(j.running)slots.push(j.slot);
    j.resolve(result);queueMicrotask(drain);
  }
  function abort(j,reason){
    if(!j||j.settled)return false;
    j.reason=reason;j.controller.abort();
    if(!j.running){const at=queue.indexOf(j);if(at>=0)queue.splice(at,1);finish(j,j.cancelResult());}
    return true;
  }
  return {
    probe(event,options={}){
      const sender=event?.sender;
      if(!sender||sender.id==null||destroyed(sender))return Promise.resolve({error:'检测窗口已关闭'});
      if(!options||typeof options!=='object'||Array.isArray(options))return Promise.resolve({error:'检测参数无效'});
      const publicId=options.requestId;
      if(publicId!=null&&!validId(publicId))return Promise.resolve({error:'检测编号无效'});
      const id=publicId||randomUUID(),k=key(sender,id);
      if(jobs.has(k))return Promise.resolve({error:'检测编号重复'});
      if(queue.length>=queueLimit&&!slots.length)return Promise.resolve({error:'检测队列已满，请稍后重试'});
      const controller=new AbortController(),seen=new Set();let resolve;
      require('node:events').setMaxListeners(96,controller.signal);
      const promise=new Promise(r=>{resolve=r;});
      const j={event,options,sender,id,key:k,controller,signal:controller.signal,resolve,running:false,settled:false,reason:'',slot:-1};
      const emit=data=>{if(!publicId||j.settled||j.signal.aborted||destroyed(sender))return;try{sender.send('host:pool-probe-progress',{requestId:id,...data});}catch{}};
      j.stage=stage=>emit({stage});
      j.publish=(pip,result)=>{if(j.signal.aborted||seen.has(pip))return false;seen.add(pip);emit({stage:'probing',pip,result,done:seen.size,total:(options.pips||[]).length});return true;};
      j.cancelResult=()=>({cancelled:true,timedOut:j.reason==='timeout',error:j.reason==='timeout'?'检测超过总时限，已保留完成结果':'检测已取消'});
      j.onDestroyed=()=>abort(j,'closed');sender.once?.('destroyed',j.onDestroyed);
      j.timer=setTimeout(()=>abort(j,'timeout'),deadlineMs);j.timer.unref?.();
      jobs.set(k,j);queue.push(j);emit({stage:'queued'});drain();return promise;
    },
    cancel(event,id){
      if(!event?.sender||!validId(id))return {ok:false,cancelled:false};
      return {ok:true,cancelled:abort(jobs.get(key(event.sender,id)),'user')};
    },
    get active(){return limit-slots.length;},get queued(){return queue.length;},get size(){return jobs.size;}
  };
}
module.exports={createPoolProbeRunner,withAbort};
