// UI work only. Network streams, persistence, stop guards and send queues are never throttled here.
const RenderWork = {
  create(o){
    const clock=o.clock||(()=>performance.now()),frame=o.frame||requestAnimationFrame,cancel=o.cancelFrame||cancelAnimationFrame,timer=o.timer||setTimeout,clear=o.clearTimer||clearTimeout;
    const q={pending:new Set(),states:new WeakMap(),stamps:new WeakMap(),raf:0,timer:0,next:0,cost:0,force:false,
      cancel(){if(this.raf)cancel(this.raf);if(this.timer)clear(this.timer);this.raf=this.timer=0;},
      add(c){
        if(!c)return;
        if(!o.visible()){o.park(c);this.force=true;return;}
        const state=o.state(c),urgent=this.states.get(c)!==state;this.states.set(c,state);this.pending.add(c);
        if(urgent){this.cancel();this.schedule(true);}else this.schedule(false);
      },
      schedule(urgent){
        if(this.raf||this.timer)return;
        const delay=urgent?0:Math.max(0,this.next-clock());
        if(delay)this.timer=timer(()=>{this.timer=0;this.schedule(true);},delay);
        // rAF 在窗口被遮挡 / 失焦时可能被暂停：加一个计时器兜底，保证消息和提问卡片不会等到刷新才出现
        else{const run=()=>{if(this.raf)cancel(this.raf);if(this.timer)clear(this.timer);this.raf=this.timer=0;this.flush();};this.raf=frame(run);this.timer=timer(run,150);}
      },
      flush(){
        if(!o.visible()){this.hide();return;}
        const start=clock(),batch=this.pending;this.pending=new Set();let changed=this.force;this.force=false;
        try{
          for(const c of batch)try{
            const stamp=o.stamp(c),prev=this.stamps.get(c);if(!prev||stamp.length!==prev.length||stamp.some((v,i)=>v!==prev[i]))changed=true;this.stamps.set(c,stamp);
            o.paint(c);
          }catch(e){o.error?.(e);}
          if(changed)o.metadata();
        }finally{
          this.cost=this.cost*.7+Math.max(0,clock()-start)*.3;
          // Keep inexpensive updates responsive; expensive long chats get bounded breathing room for input/scroll.
          this.next=start+Math.min(96,Math.max(o.mobile()?32:24,this.cost*1.5));
          if(this.pending.size)this.schedule(false);
        }
      },
      hide(){this.cancel();for(const c of this.pending)o.park(c);this.pending.clear();this.force=true;},
      resume(){this.force=true;this.next=0;const c=o.current();if(c)this.add(c);else this.schedule(true);},
    };return q;
  },
};
