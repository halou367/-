// Local fixtures: real Chromium scrollbars, window sizing and Electron zoom.
const {app,BrowserWindow,session}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const webbar=fs.readFileSync(path.join(__dirname,'../ui/webbar.js'),'utf8');
const timer=setTimeout(()=>{console.error('TIMEOUT viewport');app.exit(1);},45000);
app.whenReady().then(async()=>{try{
 const fixtures={
  challenge:`<style>html{height:100%;width:100%}body{display:flex;flex-direction:column;min-height:100vh}main{width:100%;max-width:60rem;margin:8rem auto 0;padding:0 1.5rem;box-sizing:border-box}h1{overflow-wrap:anywhere}</style><main><h1>arena.ai</h1><p>正在进行安全验证</p><button>验证</button></main>`,
  app:`<style>*{box-sizing:border-box}.h-svh{height:100svh}.min-h-svh{min-height:100svh}body{height:100%}#layout{display:flex;width:100vw}aside{width:20%;flex:none}main{min-width:0;flex:1;overflow:auto}#content{height:2200px}#end{margin-top:2000px}</style><div id="layout" class="h-svh"><aside>Sidebar</aside><main><div id="content">Content<button id="end">Last action</button></div></main></div>`,
  article:`<style>body{font:16px sans-serif}article{padding:20px;overflow-wrap:anywhere}#end{margin-top:2400px}</style><article>Long article<button id="end">Last action</button></article>`
 };
 session.defaultSession.protocol.handle('https',req=>new Response('<!doctype html><html><head><meta charset="utf-8"></head><body>'+fixtures[new URL(req.url).pathname.slice(1)]+'</body></html>',{headers:{'content-type':'text/html'}}));
 const w=new BrowserWindow({width:1493,height:880,show:true,webPreferences:{sandbox:true,contextIsolation:true}});
 w.webContents.debugger.attach('1.3');
 for(const name of Object.keys(fixtures)){
  await w.loadURL((name==='article'?'https://example.invalid/':'https://arena.ai/')+name);await w.webContents.executeJavaScript("window.__ancEarlyFooter={version:'fixture'};"+webbar);
  for(const [width,height,zoom] of [[1493,880,1],[780,540,1],[1100,740,1.25],[1100,740,.8],[390,640,1]]){
   w.setContentSize(width,height);w.webContents.setZoomFactor(zoom);await new Promise(r=>setTimeout(r,120));
   const g=await w.webContents.executeJavaScript(`(()=>{const d=document.documentElement,b=document.body;return {w:innerWidth,h:innerHeight,sw:d.scrollWidth,sh:d.scrollHeight,cw:d.clientWidth,ch:d.clientHeight,body:b.getBoundingClientRect().toJSON(),scrollbar:getComputedStyle(d).scrollbarWidth,layout:document.getElementById('layout')?.getBoundingClientRect().toJSON()}})()`);
   assert.equal(g.scrollbar,'none');assert(g.sw<=g.cw+1,'no horizontal overflow '+name+JSON.stringify(g));assert(Math.abs(g.body.top-40)<=1,'body below toolbar');
   if(name!=='article')assert(g.sh<=g.ch+1,'no outer vertical overflow '+name+JSON.stringify(g));
   if(name==='app')assert(Math.abs(g.layout.bottom-(g.h-26))<=1,'app ends above footer '+JSON.stringify(g));
  }
  if(name!=='challenge'){
   const result=await w.webContents.executeJavaScript(`(()=>{const el=document.querySelector('${name==='app'?'main':'html'}');el.scrollTop=el.scrollHeight;const button=document.getElementById('end');button.onclick=()=>window.clicked=true;button.scrollIntoView({block:'center'});const r=button.getBoundingClientRect();return {scroll:el.scrollTop,visible:r.top>=40&&r.bottom<=innerHeight-26,x:r.x+r.width/2,y:r.y+r.height/2}})()`);
   assert(result.scroll>0&&result.visible,'long content reachable '+name+JSON.stringify(result));
   w.show();w.focus();
   await w.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const point=await w.webContents.executeJavaScript(`(()=>{const b=document.getElementById('end'),r=b.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);return {x,y,hit:b.contains(document.elementFromPoint(x,y)),width:r.width,height:r.height,viewport:{w:innerWidth,h:innerHeight}}})()`);
   console.log('VIEWPORT_CLICK',name,JSON.stringify(point));assert(point.hit&&point.width>0&&point.height>0,'last action is current pointer hit target '+JSON.stringify(point));
   const input={x:point.x,y:point.y};
   await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',...input});
   await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...input});
   await w.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...input});
   const deadline=Date.now()+2000;let clicked=false;
   while(Date.now()<deadline){clicked=await w.webContents.executeJavaScript('window.clicked===true');if(clicked)break;await new Promise(r=>setTimeout(r,20));}
   assert(clicked,'last action clickable '+name+' '+JSON.stringify(point));
  }
  if(process.env.SHOT&&name==='challenge'){w.setContentSize(1493,880);await new Promise(r=>setTimeout(r,120));fs.writeFileSync(process.env.SHOT,(await w.webContents.capturePage()).toPNG());}
  console.log('PASS viewport',name,'resize/zoom/hidden scrollbars/reachable content');
 }
 clearTimeout(timer);app.exit(0);
}catch(e){console.error(e);clearTimeout(timer);app.exit(1);}});
