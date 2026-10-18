// Small, cancellable UI jobs: yield before expensive work; never overlap refreshes.
const PanelWork = {
  // Yield for input/paint without stranding data/migration work when an account becomes hidden.
  frame: () => new Promise(resolve => {
    let done=false,raf=0;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);if(raf&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(raf);resolve();};
    const timer=setTimeout(finish,document.hidden?0:100);
    if(!document.hidden)raf=requestAnimationFrame(()=>setTimeout(finish,0));
  }),
  async wait(job, ms=15000) {
    let timer;
    try { return await Promise.race([Promise.resolve().then(job), new Promise((_, reject) => { timer=setTimeout(()=>reject(Error('读取超时，请重试')),ms); })]); }
    finally { clearTimeout(timer); }
  },
  poll(root, work, ms=2000) {
    let stopped=false, timer=0, running=false;
    const alive=()=>!stopped&&root.isConnected&&!root.classList.contains('out');
    const stop=()=>{stopped=true;clearTimeout(timer);observer.disconnect();document.removeEventListener('visibilitychange',visible);};
    const schedule=()=>{clearTimeout(timer);if(alive()&&!document.hidden)timer=setTimeout(run,ms);};
    const run=async()=>{
      if(!alive()){stop();return;}if(document.hidden||running)return;
      running=true;try{await work(alive);}catch(e){console.warn('Panel refresh:',e?.message||e);}finally{running=false;if(alive())schedule();else stop();}
    };
    const visible=()=>{if(!alive())stop();else if(document.hidden)clearTimeout(timer);else if(!running)schedule();};
    const observer=new MutationObserver(()=>{if(!alive())stop();});
    observer.observe(root.parentNode||document.body,{childList:true});
    document.addEventListener('visibilitychange',visible);schedule();return stop;
  },
  async each(root, items, work) {
    for(const item of items){await this.frame();if(!root.isConnected||root.classList.contains('out'))return;try{await this.wait(()=>work(item),5000);}catch{} }
  },
};
