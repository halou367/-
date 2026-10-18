// Run with Electron 33+: xvfb-run -a electron --no-sandbox client/scripts/check-privacy-electron.cjs
// All page/iframe/worker traffic goes to a local fixture HTTP proxy; no Brana or Google requests.
const {app,BrowserWindow,session}=require('electron');const fs=require('fs'),path=require('path'),vm=require('vm'),os=require('os'),http=require('http'),assert=require('assert/strict');
const P=require('../src/browser-privacy');P.chromiumSwitches(app);app.commandLine.appendSwitch('site-per-process');
app.setPath('userData',path.join(os.tmpdir(),'brana-privacy-fixture-'+process.pid));
const native=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');const uaCode=native.slice(native.indexOf('async function uaMeta(wc)'),native.indexOf('// Google 登录等外部页面',native.indexOf('async function uaMeta(wc)')));
let win,proxy,stage='ready';const seen=[];const watchdog=setTimeout(()=>{console.error('TIMEOUT',stage,seen);app.exit(1);},25000);
const report=`({rtc:typeof RTCPeerConnection,legacy:typeof webkitRTCPeerConnection,geo:typeof navigator.geolocation,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,locale:navigator.language,offset:new Date('2026-01-01T00:00:00Z').getTimezoneOffset()})`;
(async()=>{
 await app.whenReady();P.secureResolver(app);stage="proxy";
 proxy=http.createServer((req,res)=>{seen.push({url:req.url,host:req.headers.host,language:req.headers['accept-language']});res.setHeader('X-DNS-Prefetch-Control','off');
  if(req.url.includes('worker.js')){res.setHeader('Content-Type','application/javascript');res.end(`postMessage(${report});`);return;}
  res.setHeader('Content-Type','text/html');
  const child=req.url.includes('google.invalid');res.end(`<script>window.first=${report};${child?'parent.postMessage({child:first},"*");':`window.worker=null;const w=new Worker('/worker.js');w.onmessage=e=>window.worker=e.data;window.addEventListener('message',e=>{if(e.data.child)window.child=e.data.child;});`}</script>${child?'':'<link rel="dns-prefetch" href="//dns-leak.invalid"><iframe src="http://google.invalid/recaptcha/test"></iframe>'}`);
 });await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const ses=session.fromPartition('privacy-fixture-'+process.pid);const netlog=path.join(os.tmpdir(),'brana-netlog-'+process.pid+'.json');await ses.netLog.startLogging(netlog);ses.setUserAgent(ses.getUserAgent(),'ja-JP,ja');await ses.setProxy({proxyRules:'http://127.0.0.1:'+proxy.address().port,proxyBypassRules:'<-loopback>'});
 stage="window";win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true}});
 const a={id:'fixture',region:'JP'},ctx=vm.createContext({app,console,setTimeout,clearTimeout,process,os,BrowserPrivacy:P,winAcct:()=>a,UA:win.webContents.getUserAgent()});vm.runInContext(uaCode+';this.protect=uaMeta;',ctx);stage='protect';await win.loadURL('about:blank');await ctx.protect(win.webContents);stage='load';
 console.log('STEP',stage);await win.loadURL('http://brana.invalid/');
 const deadline=Date.now()+10000;let state;
 do{state=await win.webContents.executeJavaScript('({main:first,child:window.child,worker:window.worker})');if(state.child&&state.worker)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);
 await new Promise(r=>setTimeout(r,1000));assert(state.child&&state.worker,'cross-origin child and worker complete');
 for(const [name,v]of Object.entries(state)){assert.equal(v.rtc,'undefined',name);assert.equal(v.zone,'Asia/Tokyo',name);assert.equal(v.locale,'ja-JP',name);assert.equal(v.offset,-540,name);}
 assert.equal(state.main.geo,'undefined');assert.equal(state.child.geo,'undefined');
 assert(seen.filter(x=>/brana.invalid|google.invalid/.test(x.url)).every(x=>x.language?.startsWith('ja-JP')),'request headers match navigator language on both sites');
 const blank=await win.webContents.executeJavaScript('(()=>{const f=document.createElement("iframe");document.body.append(f);return typeof f.contentWindow.RTCPeerConnection;})()');assert.equal(blank,'undefined','initial about:blank iframe');
 // reCAPTCHA v2: anchor + bframe of the same site share one renderer process; the 2nd/3rd target must not trip the guard
 for(const n of ['a','b','c']){await win.webContents.executeJavaScript(`new Promise(r=>{const f=document.createElement('iframe');f.id='rc-${n}';f.src='http://www.google.invalid/recaptcha/${n}';f.onload=()=>r();document.body.append(f);setTimeout(r,4000)})`);}
 await new Promise(r=>setTimeout(r,500));assert.equal(win.webContents.__privacyFailed,false,'same-site recaptcha frames must not trip privacy guard');
 await win.webContents.executeJavaScript(`document.getElementById('rc-a').remove()`);await new Promise(r=>setTimeout(r,600));assert.equal(win.webContents.__privacyFailed,false);
 for(const f of win.webContents.mainFrame.framesInSubtree.filter(f=>/recaptcha\/[bc]$/.test(f.url)))assert.equal(await f.executeJavaScript('Intl.DateTimeFormat().resolvedOptions().timeZone'),'Asia/Tokyo','shared-process frame keeps region time zone');
 a.region='KR';ses.setUserAgent(ses.getUserAgent(),'ko-KR,ko');await win.webContents.__privacyRefresh(a);await win.loadURL('http://brana.invalid/after-switch');
 const next=await win.webContents.executeJavaScript('first');assert.equal(next.zone,'Asia/Seoul');assert.equal(next.locale,'ko-KR');
 assert.equal(win.webContents.getWebRTCIPHandlingPolicy(),'disable_non_proxied_udp');
 await ses.netLog.stopLogging();const log=JSON.parse(fs.readFileSync(netlog,'utf8')),names=Object.fromEntries(Object.entries(log.constants.logEventTypes).map(([k,v])=>[v,k]));const leaks=log.events.filter(e=>/(?:HOST_RESOLVER.*(?:JOB|SYSTEM_TASK)|DNS_TRANSACTION)/.test(names[e.type]||'')&&/(?:brana|google|dns-leak)\.invalid/.test(JSON.stringify(e.params)));assert.deepEqual(leaks,[],'no destination/speculative DNS transactions (cache-only lookups are not packets)');fs.unlinkSync(netlog);
 console.log(JSON.stringify({passed:true,electron:process.versions.electron,main:state.main,child:state.child,worker:state.worker,afterSwitch:next,requests:seen.length}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(watchdog);win?.destroy();proxy?.close();app.exit(process.exitCode||0);});
