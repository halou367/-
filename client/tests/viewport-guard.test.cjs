const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),EventEmitter=require('node:events');
const src=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8'),a=src.indexOf('function keepViewport(w) {'),b=src.indexOf('// ---------- 启动小窗',a);
function setup(content,viewport,opt={}){
  const logs=[],calls=[];const w=new EventEmitter();let bounds={x:0,y:0,width:content[0],height:content[1]};
  Object.assign(w,{isDestroyed:()=>false,isMinimized:()=>false,isVisible:()=>true,isMaximized:()=>!!opt.max,isFullScreen:()=>false,getContentSize:()=>content,getBounds:()=>({...bounds}),setBounds:x=>{bounds={...x};calls.push(['setBounds',x.width]);},unmaximize:()=>calls.push(['unmaximize']),maximize:()=>calls.push(['maximize'])});
  let vp=viewport;w.webContents={id:1,isDestroyed:()=>false,isLoading:()=>false,getZoomFactor:()=>1,invalidate:()=>calls.push(['invalidate']),executeJavaScript:async()=>vp};
  const screen=new EventEmitter();screen.getDisplayMatching=()=>({scaleFactor:1.25});
  const timers=[];const c=vm.createContext({screen,runtimeLog:(n,o)=>logs.push([n,o]),setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},clearTimeout(){}});
  vm.runInContext(src.slice(a,b)+';this.K=keepViewport;',c);c.K(w);
  return{w,logs,calls,timers,setVp:v=>vp=v};
}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('a viewport smaller than the window content area is logged and repaired by a one-pixel size nudge',async()=>{
  const h=setup([1320,880],[1020,805]);h.w.emit('show');h.timers.at(0).f();await flush();
  assert.equal(h.logs[0][0],'viewport-mismatch');assert.deepEqual(h.logs[0][1].viewport,[1020,805]);
  assert.deepEqual(h.calls.filter(x=>x[0]==='setBounds').map(x=>x[1]),[1321,1320]);
});
test('matching viewport does nothing',async()=>{
  const h=setup([1320,880],[1320,880]);h.w.emit('resize');h.timers.at(-1).f();await flush();
  assert.equal(h.logs.length,0);assert.equal(h.calls.length,0);
});
test('maximized windows are re-maximized instead of resized, and repairs are bounded',async()=>{
  const h=setup([1920,1040],[1000,700],{max:true});
  for(let i=0;i<8;i++){h.w.emit('focus');h.timers.at(-1).f();await flush();}
  assert.ok(h.calls.some(x=>x[0]==='unmaximize')&&h.calls.some(x=>x[0]==='maximize'));
  assert.ok(h.logs.length<=4);
});
