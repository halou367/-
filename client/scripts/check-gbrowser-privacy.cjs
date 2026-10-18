// Optional Chrome/Edge OAuth privacy regression. All traffic terminates at a local fixture proxy.
// BRANA_GBROWSER=/path/to/chrome xvfb-run -a node client/scripts/check-gbrowser-privacy.cjs
const assert=require('node:assert/strict'),http=require('node:http'),os=require('node:os'),path=require('node:path'),fs=require('node:fs');
const GB=require('../src/gbrowser'),P=require('../src/browser-privacy');
const report=`({rtc:typeof RTCPeerConnection,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,locale:navigator.language})`;
let proxy,cdp,sid;const seen=[];const send=GB.Cdp.prototype.send;
GB.Cdp.prototype.send=function(method,params,sessionId,...rest){if(method==='Page.navigate'){cdp=this;sid=sessionId;}return send.call(this,method,params,sessionId,...rest);};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'brana-gprivacy-'));
(async()=>{
 proxy=http.createServer((req,res)=>{seen.push({url:req.url,language:req.headers['accept-language']});res.setHeader('Content-Type','text/html');const child=req.url.includes('google.invalid');res.end(`<script>window.first=${report};${child?'parent.postMessage(first,"*")':'window.onmessage=e=>window.child=e.data'}</script>${child?'':'<iframe src="http://google.invalid/captcha"></iframe>'}`);});proxy.on('connect',(_req,socket)=>socket.destroy());await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const started=await GB.start({id:'fixture',ses:{cookies:{get:async()=>[]}},proxy:{rules:'http://127.0.0.1:'+proxy.address().port},privacy:P.profile({region:'JP'}),userData:root,url:'http://brana.invalid/',noSandbox:true});assert.equal(started.started,true,JSON.stringify(started));
 let state;const until=Date.now()+10000;do{await new Promise(r=>setTimeout(r,100));try{const x=await cdp.send('Runtime.evaluate',{expression:'JSON.stringify({main:window.first,child:window.child})',returnByValue:true},sid);state=JSON.parse(x.result.value);}catch{}if(state?.child)break;}while(Date.now()<until);
 assert(state?.main&&state?.child,'both origins complete');for(const x of Object.values(state)){assert.equal(x.rtc,'undefined');assert.equal(x.zone,'Asia/Tokyo');assert.equal(x.locale,'ja-JP');}
 assert(seen.filter(x=>/brana.invalid|google.invalid/.test(x.url)).every(x=>x.language?.startsWith('ja-JP')));console.log(JSON.stringify({passed:true,externalBrowser:started.name,state,requests:seen.length}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{GB.cancel('fixture');proxy?.close();await new Promise(r=>setTimeout(r,3000));fs.rmSync(root,{recursive:true,force:true});process.exit(process.exitCode||0);});
