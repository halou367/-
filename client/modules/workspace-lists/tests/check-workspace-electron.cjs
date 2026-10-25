// Real Electron/Chromium regression. No Brana account, network service or client secrets.
// Linux: xvfb-run -a electron scripts/check-workspace-electron.cjs --no-sandbox
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const Policy = require('../ui/workspace-path');
const { install } = require('../src/workspace-preview');
app.commandLine.appendSwitch('disable-gpu');
const results = [], errors = [];
const record = name => { results.push({name,passed:true}); console.log('PASS',name); };
const root = fs.mkdtempSync(path.join(os.tmpdir(),'brana-preview-test-')); app.setPath('userData',path.join(root,'data'));
let manager, owner;
class Reader { readAsDataURL(b) { b.arrayBuffer().then(x=>{this.result='data:;base64,'+Buffer.from(x).toString('base64');this.onload();},e=>this.onerror(e)); } }
const files = {
  'site/index.html': `<!doctype html><meta charset="utf-8"><title>Workspace fixture</title><link rel="stylesheet" href="styles/main.css"><h1>工作区原生预览</h1><p id="message">loading</p><img id="img" src="images/chart.svg"><iframe id="child" src="child.html"></iframe><a id="link" href="next.html">Next</a><script type="module" src="scripts/main.mjs"></script>`,
  'site/styles/main.css': 'body{font-family:sans-serif;background:rgb(230,240,250);padding:24px}h1{color:rgb(12,34,56)}#img{width:100px;height:60px}',
  'site/scripts/main.mjs': `import { value } from './dep.mjs'; const info=await fetch(new URL('../data/info.json',import.meta.url)).then(r=>r.json()); document.querySelector('#message').textContent=value+' / '+info.name; const blocked={}; for(const url of ['https://arena.ai/api/auth/session','http://127.0.0.1:39482/private','file:///etc/passwd']) {try{await fetch(url);blocked[url]=false}catch{blocked[url]=true}} let workerBlocked=false;try{new Worker('/worker.js')}catch{workerBlocked=true}window.result={value,info,blocked,workerBlocked,bridge:typeof BranaHost,android:typeof BranaAndroid,node:typeof require,process:typeof process,opener:window.opener===null};`,
  'site/scripts/dep.mjs': 'export const value="MODULE OK";',
  'site/data/info.json': '{"name":"相对 JSON"}',
  'site/images/chart.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#2ea878"/></svg>',
  'site/child.html': '<!doctype html><p>isolated child</p><script>window.check={bridge:typeof BranaHost,android:typeof BranaAndroid,node:typeof require,process:typeof process}</script>',
  'site/next.html': '<!doctype html><h1 id="next">relative navigation</h1>',
  'site/图 表.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="90"><rect id="rect" width="200" height="90" fill="red"/><script>document.getElementById("rect").setAttribute("fill","#11aa88");document.documentElement.setAttribute("data-ready","yes");window.bridgeCheck=[typeof BranaHost,typeof BranaAndroid,typeof require]</script></svg>',
  'site/range.bin': '0123456789',
};
// One second of PCM WAV exercises the browser's actual media decoder + Range loader.
const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
files['site/audio.wav']=wav;
function manifest() { const root={type:'dir',entries:{}}; for(const [name,inlineText] of Object.entries(files)){const parts=name.split('/');let d=root;for(const p of parts.slice(0,-1)) d=d.entries[p]||=( {type:'dir',entries:{}} );d.entries[parts.at(-1)]=Buffer.isBuffer(inlineText)?{type:'file',hash:'wav-fixture',size:inlineText.length}:{type:'file',inlineText,size:Buffer.byteLength(inlineText)};}return{node:'fixed-node',manifest:{root}};}
async function wait(wc,expr,ms=12000) { const until=Date.now()+ms;while(Date.now()<until){if(wc.isDestroyed())throw Error('preview destroyed');try{if(await wc.executeJavaScript(expr))return;}catch{}await new Promise(r=>setTimeout(r,40));}throw Error('Timed out: '+expr); }
app.whenReady().then(async()=>{
  const handlers=new Map(), source=fs.readFileSync(path.join(__dirname,'../ui/workspace-preview.js'),'utf8');
  const c=vm.createContext({Blob,URL,structuredClone,FileReader:Reader,WorkspacePath:Policy,Workspace:{dir:async()=>null,casUrl:()=> 'https://fixture.invalid/wav'},rawFetch:async()=>new Response(wav),Host:{},window:{},btoa:s=>Buffer.from(s,'binary').toString('base64'),NetPolicy:{deadline:f=>f()},describe:e=>e.message,now:Date.now,uuid7:()=> 'fixture'});vm.runInContext(source+';this.W=WorkspacePreview;',c);const ctx=c.W.context('account-A-chat',manifest());
  fs.writeFileSync(path.join(root,'owner.html'),'<!doctype html><p>Trusted fixture owner</p>');
  owner=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false}});await owner.loadFile(path.join(root,'owner.html'));
  manager=install({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},BrowserWindow,session,owner:wc=>wc===owner.webContents?{id:'account-A'}:null});
  const event=()=>({sender:owner.webContents,senderFrame:owner.webContents.mainFrame}), requests=[];
  owner.webContents.send=(channel,data)=>{if(channel!=='anc-preview'||data.closed)return;requests.push(data);void c.W.resource(ctx,data.path,data.range,data.method).then(res=>handlers.get('host:previewRespond')(event(),{...res,id:data.id,request:data.request})).catch(e=>errors.push(String(e)));};
  assert.equal((await handlers.get('host:previewOpen')({...event(),senderFrame:{}},{id:'denied',path:'site/index.html'})).ok,false);record('subframes cannot request native previews');
  assert.equal((await handlers.get('host:previewOpen')(event(),{id:'main',path:'site/index.html',title:'Fixture'})).ok,true);
  const s=manager.previews.get('main'),wc=s.win.webContents;
  await wait(wc,'!!window.result && document.querySelector("#img").complete && !!document.querySelector("#child").contentWindow.check');
  const state=await wc.executeJavaScript('({result,background:getComputedStyle(document.body).backgroundColor,color:getComputedStyle(document.querySelector("h1")).color,child:document.querySelector("#child").contentWindow.check,image:document.querySelector("#img").naturalWidth,text:document.querySelector("#message").textContent})');
  assert.equal(state.text,'MODULE OK / 相对 JSON');assert.equal(state.background,'rgb(230, 240, 250)');assert.equal(state.color,'rgb(12, 34, 56)');assert.equal(state.image,100);record('relative CSS, modules/imports, JSON, images and nested HTML use one native virtual origin');
  assert.equal(state.result.bridge,'undefined');assert.equal(state.result.android,'undefined');assert.equal(state.result.node,'undefined');assert.equal(state.result.process,'undefined');assert.equal(state.result.opener,true);assert.deepEqual(state.child,{bridge:'undefined',android:'undefined',node:'undefined',process:'undefined'});record('top-level HTML and child frames have no host bridge, Node, process or opener');
  assert.ok(Object.values(state.result.blocked).every(Boolean));assert.equal(state.result.workerBlocked,true);record('external API, localhost, filesystem and Worker access are denied');
  const udp=require('node:dgram').createSocket('udp4');let packets=0;udp.on('message',()=>packets++);await new Promise(r=>udp.bind(0,'127.0.0.1',r));
  const rtc=await wc.executeJavaScript(`(async()=>{const result={main:typeof RTCPeerConnection,child:typeof document.querySelector('#child').contentWindow.RTCPeerConnection};const f=document.createElement('iframe');document.body.append(f);result.blank=typeof f.contentWindow.RTCPeerConnection;try{Object.defineProperty(window,'RTCPeerConnection',{value:function(){}});result.overwrite=true}catch{result.overwrite=false};for(const w of [window,f.contentWindow,document.querySelector('#child').contentWindow]){if(w.RTCPeerConnection){const p=new w.RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${udp.address().port}'}]});p.createDataChannel('test');await p.setLocalDescription(await p.createOffer());}}return result})()`);
  await new Promise(r=>setTimeout(r,600));udp.close();assert.deepEqual(rtc,{main:'undefined',child:'undefined',blank:'undefined',overwrite:false});assert.equal(packets,0);record('WebRTC is sealed before scripts in main/child/new blank frames; STUN cannot bypass the network filter');
  const dns=await wc.executeJavaScript("fetch('style.css').then(r=>r.headers.get('X-DNS-Prefetch-Control'))");assert.equal(dns,'off');record('native snapshot responses disable DNS prefetch');
  const range=await wc.executeJavaScript(`fetch('range.bin',{headers:{Range:'bytes=3-6'}}).then(async r=>({status:r.status,range:r.headers.get('content-range'),body:await r.text()}))`);assert.deepEqual(range,{status:206,range:'bytes 3-6/10',body:'3456'});record('native resource responses preserve byte ranges');
  const bad=await wc.executeJavaScript(`fetch('range.bin',{headers:{Range:'bytes=50-'}}).then(r=>({status:r.status,range:r.headers.get('content-range')}))`);assert.deepEqual(bad,{status:416,range:'bytes */10'});record('invalid native media ranges return 416 with total length');
  assert.equal(await wc.executeJavaScript('window.open("https://example.com")===null'),true);await wc.executeJavaScript('location.href="https://example.com";true');await new Promise(r=>setTimeout(r,150));assert.equal(wc.getURL(),s.origin+'/site/index.html');record('external top-level navigation and popups are blocked');
  if(process.env.BRANA_VERIFY_DIR){fs.mkdirSync(process.env.BRANA_VERIFY_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.BRANA_VERIFY_DIR,'native-preview.png'),(await wc.capturePage()).toPNG());}
  await wc.executeJavaScript('document.querySelector("#link").click();true');await wait(wc,'!!document.querySelector("#next")');assert.equal(wc.getURL(),s.origin+'/site/next.html');record('same-snapshot relative document navigation works');
  assert.equal(await handlers.get('host:previewRespond')({...event(),senderFrame:{}},{id:'main',request:'none'}),false);record('resource responses cannot be forged by a child frame');
  await handlers.get('host:previewOpen')(event(),{id:'svg',path:'site/'+encodeURIComponent('图 表.svg'),title:'SVG'});assert.equal(s.closed,true);const svg=manager.previews.get('svg');await wait(svg.win.webContents,'document.documentElement.getAttribute("data-ready")==="yes"');assert.deepEqual(await svg.win.webContents.executeJavaScript('window.bridgeCheck'),['undefined','undefined','undefined']);assert.equal(await svg.win.webContents.executeJavaScript('document.querySelector("#rect").getAttribute("fill")'),'#11aa88');record('Unicode/spaced SVG is rendered as an active, isolated native SVG document');
  await handlers.get('host:previewOpen')(event(),{id:'audio',path:'site/audio.wav',title:'Audio'});const audio=manager.previews.get('audio');
  await wait(audio.win.webContents,'!!document.querySelector("audio,video") && Number.isFinite(document.querySelector("audio,video").duration)');
  const media=await audio.win.webContents.executeJavaScript('(()=>{const a=document.querySelector("audio,video");a.pause();return {duration:a.duration,error:a.error?.code||null}})()');assert.equal(media.duration,1);assert.equal(media.error,null);record('native audio document decodes PCM media from snapshot-backed range responses');
  await handlers.get('host:previewOpen')(event(),{id:'guard',path:'site/index.html',title:'Guard'});const guard=manager.previews.get('guard');await wait(guard.win.webContents,'!!window.result');guard.win.webContents.debugger.detach();assert.equal(manager.previews.has('guard'),false);assert.equal(guard.win.isDestroyed(),true);record('loss of the document-start security guard closes the preview instead of continuing unprotected');
  await handlers.get('host:previewOpen')(event(),{id:'owner-close',path:'site/index.html',title:'Owner cleanup'});assert.equal(manager.previews.size,1);
  await owner.loadFile(path.join(root,'owner.html'));await new Promise(r=>setTimeout(r,100));assert.equal(manager.previews.size,0);record('owner reload closes previews and invalidates resource callbacks');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,electron:process.versions.electron,chromium:process.versions.chrome,requests:requests.length,results},null,2));app.exit(0);
}).catch(e=>{console.error(e.stack||e);try{manager?.closeAll();}catch{}app.exit(1);});
setTimeout(()=>{console.error('Native preview test deadline');app.exit(2);},60000).unref();
