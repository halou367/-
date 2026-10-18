// Optional real-Xray regression: BRANA_XRAY=/path/to/xray node client/scripts/check-proxy-dns.cjs
// Only loopback fixture traffic. Bootstrap is injected; no public DNS/website request.
const assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process'),D=require('../src/proxy-dns');
const exe=process.env.BRANA_XRAY;if(!exe)throw Error('Set BRANA_XRAY to the core executable');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'brana-xray-fixture-'));
let upstream,child;const sockets=new Set(),seen=[];
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
(async()=>{
 upstream=http.createServer();upstream.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 upstream.on('connect',(req,s)=>{seen.push(req.url);s.write('HTTP/1.1 200 Connection Established\r\n\r\n');s.once('data',()=>s.end('HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nfixture'));});await listen(upstream);
 const tmp=net.createServer();await listen(tmp);const port=tmp.address().port;await new Promise(r=>tmp.close(r));
 const config={log:{loglevel:'warning'},inbounds:[{listen:'127.0.0.1',port,protocol:'http',settings:{}}],outbounds:[{protocol:'http',settings:{address:'endpoint.invalid',port:upstream.address().port}},{protocol:'blackhole'}]};
 const queried=[];await D.protectConfig(config,async name=>{queried.push(name);return ['127.0.0.1'];});assert.deepEqual(queried,['endpoint.invalid']);
 const f=path.join(root,'config.json');fs.writeFileSync(f,JSON.stringify(config));
 const parsed=spawnSync(exe,['run','-test','-c',f],{encoding:'utf8',timeout:10000});assert.equal(parsed.status,0,parsed.stdout+parsed.stderr);
 child=spawn(exe,['run','-c',f],{stdio:['ignore','pipe','pipe']});let logs='';for(const s of [child.stdout,child.stderr])s.on('data',d=>logs+=d);
 const until=Date.now()+8000;let response,error;
 do{try{response=await new Promise((resolve,reject)=>{const q=http.get({hostname:'127.0.0.1',port,path:'http://brana.invalid/test',headers:{Host:'brana.invalid'},timeout:1500},r=>{let body='';r.on('data',d=>body+=d);r.on('end',()=>resolve(body));});q.on('error',reject);q.on('timeout',()=>q.destroy(Error('timeout')));});break;}catch(e){error=e;await new Promise(r=>setTimeout(r,100));}}while(Date.now()<until);
 assert.equal(response,'fixture',String(error||'')+logs);assert(seen.includes('brana.invalid:80'),'destination domain forwarded, not locally resolved');
 for(const outbound of [{protocol:'socks',settings:{address:'endpoint.invalid',port:1080}},{protocol:'vless',settings:{vnext:[{address:'endpoint.invalid',port:443,users:[{id:'00000000-0000-4000-8000-000000000001',encryption:'none'}]}]}}]){
  const cfg=await D.protectConfig({...config,outbounds:[outbound]},async()=>['127.0.0.1']);fs.writeFileSync(f,JSON.stringify(cfg));const x=spawnSync(exe,['run','-test','-c',f],{encoding:'utf8',timeout:10000});assert.equal(x.status,0,x.stdout+x.stderr);
 }
 console.log(JSON.stringify({passed:true,core:spawnSync(exe,['version'],{encoding:'utf8'}).stdout.split('\n')[0],bootstrap:queried,forwarded:seen,configs:['http','socks','vless']}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{child?.kill();for(const s of sockets)s.destroy();upstream?.close();fs.rmSync(root,{recursive:true,force:true});});
