// Full production bundle + real DOM interactions; all API/native calls are fixtures.
// NODE_PATH=<playwright>/node_modules node client/scripts/check-workspace-browser.cjs
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright'),{build}=require('../src/bundle');
const version=require('../package.json').version,bundle=build(path.join(__dirname,'../ui'),version),sid='019a0010-0000-7000-8000-000000000019';
const results=[];let browser;
const pass=name=>{results.push({name,passed:true});console.log('PASS',name);};
async function fixture(platform,width){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:platform==='android',hasTouch:platform==='android'});
  await context.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>fixture</title><body></body>'}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-03T02:00:00Z')});await page.goto('https://arena.ai/robots.txt');
  await page.evaluate(({platform,sid,version})=>{
    const prefs={theme:'light',notify:false,autoTitle:false,pinOn:false,keepAlive:false,ipPoll:600,wsOpen:true};
    const user={id:'fixture-user',email:'fixture@example.invalid'},account={id:'fixture',name:'功能回归测试',email:user.email,proxy:'',routeAuto:false};
    const entry={id:sid,type:'agentic',productMode:'agentic',title:'工作区与队列',updatedAt:new Date().toISOString(),createdAt:new Date().toISOString()};
    const put=(k,v)=>localStorage.setItem('anc:'+k,JSON.stringify(v));put('prefs',prefs);put('me:u',user);put('tabs',[{key:'fixture-tab',sid,title:entry.title,draft:''}]);put('tab','fixture-tab');put('hist:fixture',{at:Date.now(),items:[entry],full:true});
    const f=window.__fixture={requests:[],previews:[],responses:[],downloads:[],nativeEvents:null,closed:[],version:1},shared={prefs,nodes:[],pippool:{}};
    window.BranaHost={platform,info:async()=>({platform,account,version}),ready:async()=>null,listAccounts:async()=>[account],shared:async(k,v)=>v===undefined?shared[k]??null:shared[k]=v,getCred:async()=>null,noteAccount:async()=>{},setTitle:async()=>{},takeCmd:async()=>null,takeOpen:async()=>null,takeEnter:()=>false,launchPick:()=>false,notifyPerm:async()=>({}),bgWork:async()=>null,bgStatus:async()=>null,fetchText:async()=>({text:JSON.stringify({version,files:{}})}),login:async()=>{},back:async()=>{},openExternal:async()=>{},exportAccounts:async()=>[],saveAccount:async()=>null,
      onPreview:cb=>f.nativeEvents=cb,
      previewOpen:async o=>{const old=f.previews.at(-1);if(old)f.nativeEvents({id:old.id,closed:true});f.previews.push(o);Promise.resolve().then(()=>f.nativeEvents({id:o.id,request:'root-'+f.previews.length,path:'/'+o.path,method:'GET'}));return{ok:true};},
      previewRespond:async o=>{f.responses.push(o);return true;},previewClose:async id=>{f.closed.push(id);f.nativeEvents({id,closed:true});},
      downloadStart:async(name,mime,size)=>{f.downloads.push({name,mime,size,chunks:[]});return{ok:true,id:'download-id'};},downloadChunk:async(id,b64)=>{f.downloads.at(-1).chunks.push(b64);return{ok:true};},downloadFinish:async()=>({ok:true,path:'Download/BranaAi/index.html'}),downloadCancel:async()=>true,
    };
    window.grecaptcha={enterprise:{ready:f=>f(),execute:async()=> 'captcha'}};
    const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}}),txt=inlineText=>({type:'file',inlineText,size:new TextEncoder().encode(inlineText).length});
    const dirs={site:{type:'dir',entries:{'raw.bin':txt('BIN-DATA'),'index.html':txt('<!doctype html><h1>preview</h1><script>window.__workspaceRan=true</script><link rel="stylesheet" href="styles/main.css">'),styles:{type:'dir'},'data.json':txt('{"ok":true}') }},'site/styles':{type:'dir',entries:{'main.css':txt('body{color:rgb(1,2,3)}')}},one:{type:'dir',entries:{'a.svg':txt('<svg xmlns="http://www.w3.org/2000/svg"/>')}},two:{type:'dir',entries:{'a.svg':txt('<svg xmlns="http://www.w3.org/2000/svg"/>')}}};
    const token='fixture.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.fixture';
    window.fetch=async(input,opt={})=>{const u=new URL(String(input),location.href),p=u.pathname;f.requests.push({path:p,search:u.search,method:opt.method||'GET'});
      if(p==='/api/me')return json({user});if(p==='/api/history/unified')return json({entries:[entry],pagination:{hasMore:false}});if(p==='/api/me/pulse')return json({pulse:100});if(p==='/cdn-cgi/trace')return new Response('ip=203.0.113.9\nloc=JP\ncolo=NRT');
      if(p==='/api/chat/trigger-token')return json({token});
      if(p==='/api/chat/'+sid)return json({messages:[{id:'u-1',role:'user',parts:[{type:'text',text:'工作区'}]},{id:'assistant-1',role:'assistant',parts:[{type:'text',text:'[打开预览](site/index.html?mode=1#part) · [同名图](a.svg)'}],metadata:{pending:false}}],lastEventId:'42',publicAccessToken:token,pagination:{hasMore:false}});
      if(p.endsWith('/workspace/latest'))return json({manifestNodeId:'node-'+f.version,manifest:{root:{type:'dir',totalFiles:5,totalSize:500,entries:{site:{type:'dir',totalFiles:3},one:{type:'dir',totalFiles:1},two:{type:'dir',totalFiles:1}}}}});
      if(p.includes('/workspace/')&&p.endsWith('/dir'))return json({directory:dirs[u.searchParams.get('path')]});
      if(p.endsWith('/out'))return new Response('data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
      return json({});
    };
  },{platform,sid,version});
  await page.addScriptTag({content:bundle});await page.clock.runFor(700);await page.waitForFunction(()=>__anc?.UI.authed&&__anc.UI.els?.chat?.loaded);return{page,context,errors};
}
(async()=>{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const [platform,width] of [['android',390],['desktop',1280]]){
    const {page,context,errors}=await fixture(platform,width);
    await page.getByRole('link',{name:'打开预览',exact:true}).click();
    await page.waitForSelector('#pv iframe.pv-frame');
    const pane=await page.evaluate(()=>({on:document.body.classList.contains('pv-on'),previews:__fixture.previews.length,ran:window.__workspaceRan===true,sandbox:document.querySelector('#pv iframe.pv-frame').getAttribute('sandbox')}));
    assert.equal(pane.on,true);assert.equal(pane.previews,0);assert.equal(pane.ran,false);assert.equal(pane.sandbox,'allow-scripts');pass(platform+': workspace html opens in the embedded pane (no native window; scripts only inside the opaque-origin sandbox)');
    await page.getByRole('button',{name:'在隔离窗口运行'}).click();
    await page.waitForFunction(()=>__fixture.responses.length>0);
    const open=await page.evaluate(()=>({path:__fixture.previews[0].path,response:__fixture.responses[0],ran:window.__workspaceRan===true,scope:document.querySelector('[data-fpath]')?.closest('[data-wsid]')?.dataset.wsid,frames:document.querySelectorAll('.ws-preview iframe').length}));
    assert.equal(open.path,'site/index.html?mode=1#part');assert.equal(open.response.mime,'text/html');assert.equal(open.ran,false);assert.equal(open.frames,0);assert.equal(open.scope,sid);pass(platform+': Markdown link opens the right snapshot through native host, never in the bridged DOM');
    await page.evaluate(()=>{const o=__fixture.previews[0];__fixture.nativeEvents({id:o.id,request:'css',path:'/site/styles/main.css',method:'GET'});});
    await page.waitForFunction(()=>__fixture.responses.some(r=>r.request==='css'));const css=await page.evaluate(()=>__fixture.responses.find(r=>r.request==='css'));
    assert.equal(css.mime,'text/css');assert.equal(Buffer.from(css.body,'base64').toString(),'body{color:rgb(1,2,3)}');assert.ok(await page.evaluate(()=>__fixture.requests.some(r=>r.path.endsWith('/workspace/node-1/dir')&&r.search.includes('site%2Fstyles'))));pass(platform+': lazy relative resources remain attached to captured conversation/node');
    await page.locator('#pv .pv-x').click();await page.clock.runFor(200);
    await page.evaluate(()=>{__anc.WS.openPath('site/raw.bin',null);});await page.waitForSelector('.ws-preview:not(.anc-gh)');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);pass(platform+': source/download modal fits the viewport');
    if(platform==='android'){
      await page.locator('.ws-preview:not(.anc-gh)').getByRole('button',{name:'下载原文件'}).click();await page.waitForFunction(()=>__fixture.downloads.length&&__fixture.downloads[0].chunks.length);
      const d=await page.evaluate(()=>__fixture.downloads[0]);assert.equal(d.name,'raw.bin');assert.match(Buffer.concat(d.chunks.map(x=>Buffer.from(x,'base64'))).toString(),/BIN-DATA/);pass('Android: workspace file downloads as native binary chunks, not a blob anchor');
    }
    await page.locator('.ws-preview:not(.anc-gh)').getByRole('button',{name:'关闭',exact:true}).click();await page.clock.runFor(300);
    await page.locator('#ws button[title="收起工作区"]').click(); await page.clock.runFor(300);
    await page.getByRole('link',{name:'同名图',exact:true}).click();await page.waitForSelector('.ws-choice');assert.equal(await page.locator('.ws-choice').count(),2);assert.equal(await page.evaluate(()=>__fixture.previews.length),1);
    await page.getByRole('button',{name:'two/a.svg',exact:true}).click();await page.waitForSelector('#pv iframe.pv-frame');assert.equal(await page.evaluate(()=>document.querySelector('#pv .pv-n').title),'two/a.svg');assert.equal(await page.evaluate(()=>__fixture.previews.length),1);pass(platform+': duplicate lazy file paths require explicit selection instead of first-match guessing');
    await page.locator('#pv .pv-x').click();await page.clock.runFor(350);
    await page.evaluate(()=>{__anc.WS.set(false);const c=__anc.UI.els.chat;c.status='streaming';c.sentAt=0;c.live=null;c.emit();});await page.clock.runFor(80);
    const composer=page.locator('#view .composer'),ta=composer.locator('textarea');await ta.fill('队列第一条');await composer.locator('.sendbtn').click();await ta.fill('队列第二条');await composer.locator('.sendbtn').click();
    assert.deepEqual(await page.evaluate(()=>__anc.UI.els.chat.queue.map(x=>x.text)),['队列第一条','队列第二条']);pass(platform+': real composer enqueues multiple messages in order');
    await page.evaluate(()=>{const c=__anc.UI.els.chat;c.status='idle';c.fpLocked=true;c.emit();});await page.clock.runFor(70);await composer.locator('.q-now').click();assert.equal(await page.evaluate(()=>__anc.UI.els.chat.queue.length),2);pass(platform+': manual send cannot consume a fingerprint-locked queue');
    await ta.fill('新的输入');await composer.locator('.sendbtn').click();assert.equal(await ta.inputValue(),'');assert.deepEqual(await page.evaluate(()=>__anc.UI.els.chat.queue.map(x=>x.text)),['队列第一条','队列第二条','新的输入']);pass(platform+': idle queue merge preserves content even when preflight rejects');
    await page.evaluate(()=>{const c=__anc.UI.els.chat;__anc.SendQ.clear(c);c.fpLocked=false;c.send=async()=>{throw Error('fixture preflight reject');};c.emit();});await ta.fill('不能丢的直接输入');await composer.locator('.sendbtn').click();assert.equal(await ta.inputValue(),'不能丢的直接输入');pass(platform+': direct-send preflight failure keeps the composer draft');
    const phases=await page.evaluate(()=>{const c=__anc.UI.els.chat;c.status='streaming';c.live={id:'turn-current',role:'assistant',parts:[],metadata:{},v:0};c.messages.push(c.live);c.parts.clear();c.phase='思考中';__anc.Models.set(c.sid,{name:'gpt-6-astra',response:'gpt-6-astra',messageId:'old'});c.apply({type:'text-delta',id:'text',delta:'thinking in normal text'});const text=c.phase;c.apply({type:'tool-output-available',toolCallId:'bash',output:'thinking log'});return{text,tool:c.phase,closed:__anc.ThinkingStatus.isClosed(c),reasonParts:c.live.parts.filter(p=>p.type==='reasoning').length};}).catch(e=>{throw e;});
    assert.equal(phases.text,'输出中');assert.equal(phases.tool,'工具结果已返回');assert.equal(phases.closed,false);assert.equal(phases.reasonParts,0);pass(platform+': real stream deltas/tool logs do not inherit old closed-model thinking labels');
    {const q=page.locator('#ws .ws-qin');await page.evaluate(()=>{__anc.WS.q='';__anc.WS.set(true);__anc.WS.render();});await page.clock.runFor(300);
     await q.fill('main');const tick=async()=>{for(let i=0;i<12;i++){await page.clock.runFor(300);await page.waitForTimeout(40);}};await tick();
     let hits=await page.locator('#ws .ws-hit').evaluateAll(xs=>xs.map(x=>x.textContent));assert.ok(hits.some(x=>/main\.css/.test(x)&&/site\/styles/.test(x)),'nested unexpanded file is found: '+JSON.stringify(hits));
     assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('ws-qin')),true,'search input keeps focus across re-render');
     await q.fill('a.svg');await tick();hits=await page.locator('#ws .ws-hit').evaluateAll(xs=>xs.map(x=>x.textContent));assert.equal(hits.length,2,'same file name in two folders');
     await q.fill('two svg');await tick();assert.equal(await page.locator('#ws .ws-hit').count(),1,'space-separated terms all match');
     await q.press('Escape');await page.clock.runFor(200);assert.equal(await page.locator('#ws .ws-hit').count(),0);assert.ok(await page.locator('#ws .ws-row.dir').count()>0,'Escape restores the tree');
     pass(platform+': workspace search finds files in unexpanded folders, keeps focus, Escape clears');}
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log(JSON.stringify({passed:results.length,chromium:browser.version(),results},null,2));await browser.close();
})().catch(async e=>{console.error(e.stack||e);if(browser)await browser.close();process.exitCode=1;});
