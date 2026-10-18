const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const P=require('../src/browser-privacy'),D=require('../src/proxy-dns');
const text=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('region overrides are deterministic, valid, and never inferred from a stale status country',()=>{
 for(const [cc,r] of Object.entries(P.REGIONS)){const p=P.profile({region:cc,status:{loc:'ZZ'}});assert(p.timezone,cc);assert.equal(p.country,cc);assert.doesNotThrow(()=>new Intl.Locale(p.locale));assert(r.zones.length);}
 assert.equal(P.profile({region:'JP'}).timezone,'Asia/Tokyo');assert.equal(P.profile({region:'KR'}).locale,'ko-KR');assert.equal(P.profile({status:{loc:'JP'}}).timezone,'');
 assert.equal(P.profile({region:'US',fp:{timezone:'America/Los_Angeles'}}).timezone,'America/Los_Angeles');assert.notEqual(P.profile({region:'US',fp:{timezone:'Asia/Tokyo'}}).timezone,'Asia/Tokyo');
});
test('Chromium hardening blocks nonproxied UDP, speculative DNS and QUIC; external login has no PAC/direct fallback',()=>{
 const flags=[];P.chromiumSwitches({commandLine:{appendSwitch:(...v)=>flags.push(v)}});assert(flags.some(x=>x[0]==='dns-prefetch-disable'));assert(flags.some(x=>x[1]==='disable_non_proxied_udp'));
 const args=P.browserArgs({rules:'socks5://127.0.0.1:12345'});assert(args.includes('--disable-quic'));assert(args.find(x=>x.startsWith('--host-resolver-rules=')).includes('MAP * ~NOTFOUND'));
 assert.throws(()=>P.browserArgs({pac:'function FindProxyForURL(){return "DIRECT";}'}));assert.throws(()=>P.browserArgs({}));
});
test('document-start guard removes RTC constructors and physical geolocation, remains idempotent',()=>{
 const ctx=vm.createContext({navigator:Object.create({}),RTCPeerConnection:function(){throw Error('should not execute');},webkitRTCPeerConnection:function(){},RTCIceGatherer:function(){}});
 vm.runInContext(P.LOCKDOWN,ctx);vm.runInContext(P.LOCKDOWN,ctx);assert.equal(ctx.RTCPeerConnection,undefined);assert.equal(ctx.webkitRTCPeerConnection,undefined);
 assert.equal(Object.getOwnPropertyDescriptor(ctx,'RTCPeerConnection').configurable,false);
});
test('native locale/timezone and guard installation complete before navigation; critical failures propagate',async()=>{
 const calls=[];await P.configure(async(m,p)=>calls.push([m,p]),P.profile({region:'JP'}),{ua:'test'});
 assert.equal(calls.find(x=>x[0]==='Emulation.setUserAgentOverride')[1].acceptLanguage,'ja-JP,ja');assert(calls.some(x=>x[0]==='Emulation.setTimezoneOverride'&&x[1].timezoneId==='Asia/Tokyo'));assert(calls.some(x=>x[0]==='Page.addScriptToEvaluateOnNewDocument'));
 await assert.rejects(()=>P.configure(async m=>{if(m==='Page.addScriptToEvaluateOnNewDocument')throw Error('unsupported');},P.profile()),/unsupported/);
});
test('leaving a configured region explicitly clears native timezone and locale overrides',async()=>{
 const calls=[];await P.configure(async(m,p)=>calls.push([m,p]),P.profile());assert(calls.some(x=>x[0]==='Emulation.setTimezoneOverride'&&x[1].timezoneId===''));assert(calls.some(x=>x[0]==='Emulation.setLocaleOverride'&&x[1].locale===''));
});
test('Xray resolves only proxy endpoints via bounded encrypted bootstrap, destinations stay AsIs',async()=>{
 const queried=[],cfg={outbounds:[{protocol:'vless',settings:{vnext:[{address:'node.example',port:443}]}},{protocol:'http',settings:{servers:[{address:'proxy.example',port:8080}]}},{protocol:'blackhole'}]};
 await D.protectConfig(cfg,async name=>{queried.push(name);return['203.0.113.20'];});assert.deepEqual(queried,['node.example','proxy.example']);assert.deepEqual(cfg.dns.servers,[]);assert.equal(cfg.dns.disableFallback,true);assert.equal(cfg.routing.domainStrategy,'AsIs');assert.equal(cfg.outbounds[0].streamSettings.sockopt.domainStrategy,'UseIP');
});
test('bootstrap failure and remote ECH resolver fail closed, never use system DNS or plaintext fallback',async()=>{
 await assert.rejects(()=>D.protectConfig({outbounds:[{protocol:'vless',settings:{vnext:[{address:'node.example'}]}}]},async()=>{throw Error('bootstrap unavailable');}),/unavailable/);
 await assert.rejects(()=>D.protectConfig({outbounds:[{protocol:'vless',streamSettings:{tlsSettings:{echConfigList:'cloudflare-ech.com+ftp://resolver.example/query'}}}]}),/ECH/);
 await D.protectConfig({outbounds:[{protocol:'vless',settings:{vnext:[{address:'203.0.113.8'}]}}]},async()=>{throw Error('literal IP must not resolve');});
});
test('main proxy application fences requests, clears old sockets/cache and cannot silently go direct',()=>{
 const s=text('src/main.js');assert.match(s,/ses\.__routeBlocked=true/);assert.match(s,/closeAllConnections/);assert.match(s,/clearHostResolverCache/);assert.match(s,/proxyBypassRules: '<-loopback>'/);assert.doesNotMatch(s,/proxyBypassRules: '<local>'|www\.google\.com\/generate_204|gPac\(/);
 assert.match(s,/await uaMeta\(wc\)/);assert.match(s,/wc\.session\.__routeBlocked=true;wc\.stop\(\)/);
});
test('Android cannot continue online on missing proxy or document-start support; guards cover all origins',()=>{
 const s=text('android/app/src/main/java/ai/arena/client/MainActivity.java');assert.match(s,/removeImplicitRules\(\)/);assert.match(s,/guard, Collections\.singleton\("\*"\)/);assert.match(s,/s\.setJavaScriptEnabled\(false\)/);assert.match(s,/s\.setGeolocationEnabled\(false\)/);assert.match(s,/proxyEpoch\.get\(\)/);assert.match(s,/proxyFailed\(epoch/);assert.doesNotMatch(s,/getAllByName|119\.29\.29\.29|www\.google\.com\/generate_204|addBypassRule\(/);
 // Bootstrap DNS = several IP-literal HTTPS resolvers raced (1.1.1.1 is hijacked by some ISPs); never system/plaintext DNS.
 const boot=/BOOT_DOH = \{([^}]*)\}/.exec(s);assert(boot);const urls=boot[1].match(/"[^"]+"/g).map(x=>x.slice(1,-1));assert(urls.length>=4);assert(urls.every(u=>/^https:\/\/\d+\.\d+\.\d+\.\d+\//.test(u)));assert(urls.includes('https://1.1.1.1/dns-query'));assert.match(s,/openConnection\(java\.net\.Proxy\.NO_PROXY\)/);assert.match(s,/无法保证完整浏览器指纹隔离/);
});
test('Google/reCAPTCHA login uses the exact account tunnel without dropping ProxyIP or detaching native overrides',()=>{
 const s=text('src/main.js'),part=s.slice(s.indexOf("ipcMain.handle('host:gbStart'"),s.indexOf('// 按住标签拖动'));
 assert.doesNotMatch(part,/noPip: true|gPac|GDIRECT|ensureTunnel\(a.id \+ '-g'/);assert.match(part,/proxy = \{ rules: c\.proxyRules \}/);
 assert.doesNotMatch(text('src/gbrowser.js'),/await cdp.send\('Target.detachFromTarget'/);assert.match(text('src/gbrowser.js'),/'<\-loopback>'/);
 assert.doesNotMatch(text('ui/view.js'),/Google \/ 人机验证走本机网络/);
});
test('message timezone is evaluated at each send, not cached before a region switch',()=>{
 const s=text('ui/core.js');assert.match(s,/timezone: currentTimezone\(\)/);assert.doesNotMatch(s,/timezone: TZ\b/);
});
test('secure resolver and Blink speculative-DNS flag are both required',()=>{
 let resolver;P.secureResolver({configureHostResolver:x=>resolver=x});assert.equal(resolver.secureDnsMode,'secure');assert.deepEqual(resolver.secureDnsServers,['https://1.1.1.1/dns-query']);
 const flags=[];P.chromiumSwitches({commandLine:{appendSwitch:(...a)=>flags.push(a)}});assert(flags.some(x=>x[0]==='blink-settings'&&x[1]==='dnsPrefetchingEnabled=false'));
 assert(P.browserArgs({mode:'direct'}).includes('--blink-settings=dnsPrefetchingEnabled=false'));
});
test('missing timezone is not an implicit system-zone preference; foreign timezone remains approximate',()=>{
 assert.equal(P.canonical(undefined),'');assert.equal(P.canonical(''),'');assert.equal(P.profile({region:'US'}).approximate,true);assert.equal(P.profile({region:'US',fp:{timezone:'Asia/Tokyo'}}).approximate,true);
});
test('IPv6 literal bootstrap never queries DNS',async()=>{assert.deepEqual(await D.resolveBootstrap('[::1]'),['::1']);});
test('locale document-start fallback restores original navigator getters on unbound region',async()=>{
 const scripts=[];const send=async(m,p)=>{if(m==='Page.addScriptToEvaluateOnNewDocument')scripts.push(p.source);};
 await P.configure(send,P.profile({region:'JP'}));await P.configure(send,P.profile());
 const context=vm.createContext({});vm.runInContext('class Navigator {}; Object.defineProperty(Navigator.prototype,"language",{get:()=>"en-US",configurable:true});Object.defineProperty(Navigator.prototype,"languages",{get:()=>["en-US"],configurable:true});globalThis.Navigator=Navigator;globalThis.navigator=new Navigator();',context);
 vm.runInContext(scripts[0],context);assert.equal(context.navigator.language,'ja-JP');vm.runInContext(scripts[1],context);assert.equal(context.navigator.language,'en-US');
});
test('updater and Android native diagnostics cannot fall back from proxy to direct/system DNS',()=>{
 const js=text('src/main.js'),java=text('android/app/src/main/java/ai/arena/client/MainActivity.java');assert.doesNotMatch(js,/enet\.fetch|opt\.noPip|stripPip/);
 assert.match(java,/updRun\(json, acctId\)/);assert.doesNotMatch(java,/routes\.add\(java\.net\.Proxy\.NO_PROXY\);\s*for|Authenticator\.setDefault|InetSocketAddress\.createUnresolved/);
 assert.match(java,/isDirect\(eff\(account\)\.optString\("proxy"\)\)\) routes\.add\(java\.net\.Proxy\.NO_PROXY\)/);
});
test('superseded desktop apply cannot set a stale proxy or release the network fence',async()=>{
 const source=text('src/main.js'),code=source.slice(source.indexOf('async function applyProxy('),source.indexOf('// ---------- 指纹',source.indexOf('async function applyProxy(')));
 const calls=[],ses={closeAllConnections:async()=>{},setProxy:async c=>calls.push(c.proxyRules),clearHostResolverCache:async()=>{}};
 let release,started;const waiting=new Promise(r=>release=r),begun=new Promise(r=>started=r);
 const context=vm.createContext({Promise,Error,setTimeout,acct:()=>null,RouteState:require('../ui/route-state'),proxyStr:a=>a.proxy,tunnels:new Map(),GB:{cancel:()=>{}},prepSession:()=>ses,wins:new Map(),applyFp:()=>{},proxyConfig:async a=>{if(a.proxy==='old'){started();await waiting;}return {proxyRules:a.proxy};}});vm.runInContext(code,context);
 const first=context.applyProxy({id:'a',proxy:'old'}),rejected=assert.rejects(first,/取代/);await begun;
 const last=context.applyProxy({id:'a',proxy:'new'});assert.equal(ses.__routeBlocked,true);release();await rejected;await last;
 assert.deepEqual(calls,['new']);assert.equal(ses.__routeBlocked,false);
});
test('navigation context teardown is tolerated only after mandatory document-start protection succeeds',async()=>{
 for(const message of ['Execution context was destroyed.','Cannot find default execution context']){
  const calls=[];await P.configure(async m=>{calls.push(m);if(m==='Runtime.evaluate')throw Error(message);},P.profile({region:'JP'}));assert(calls.includes('Page.addScriptToEvaluateOnNewDocument'));
 }
 await assert.rejects(P.configure(async m=>{if(m==='Page.addScriptToEvaluateOnNewDocument')throw Error('Execution context was destroyed');},P.profile()),/destroyed/);
 await assert.rejects(P.configure(async m=>{if(m==='Runtime.evaluate')throw Error('permission denied');},P.profile()),/permission denied/);
});
