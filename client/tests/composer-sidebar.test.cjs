const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function env(opt={}){
 const saved=opt.saved||new Map(),models=new Map();
 const c=vm.createContext({crypto:require('node:crypto').webcrypto,Store:{get:(k,d)=>saved.has(k)?saved.get(k):d,set:(k,v)=>{if(!opt.quota)saved.set(k,v);}},
  Strength:{canon:n=>String(n).toLowerCase(),ver10:opt.ver10||(()=>60),level:()=>null},
  ...(opt.rank?{Ranking:{score:opt.rank,rev:1}}:{}),ICON:{},Models:{get:id=>models.get(id)},noteBase:s=>String(s).split('/')[0],entAt:e=>e.at,
  Brand:{of:n=>/^(gpt|claude|qwen)/i.exec(n||'')?.[1]||(/\b(opus|sonnet|fable)\b/i.test(n||'')?'claude':''),NAME:{claude:'Claude'}},...(opt.titles?{Titles:{view:opt.titles}}:{}),Gacha:{settings:()=>({targetKeywords:opt.target||['gpt','claude'],sortSidebar:opt.pin!==false})},Gold:{manual:false},Fav:{has:id=>(opt.favs||[]).includes(id)}});
 for(const name of ['conversation-labels.js','slash-commands.js'])vm.runInContext(fs.readFileSync(path.join(root,'ui',name),'utf8'),c);
 vm.runInContext(fs.readFileSync(path.join(root,'ui/gview.js'),'utf8').split('// ---------- 抽卡标签页')[0]+'\nthis.Side=Side;this.Labels=ConversationLabels;this.Slash=SlashCommands;',c);
 return {c,saved,models,S:c.Slash,L:c.Labels,side:c.Side};
}
test('long legacy fingerprint label compacts without losing confidence or score',()=>{const {L}=env(),p=L.parse('gpt-6-luna · 匹配置信度 100.0% · 估算推理分 64.1 · 强度未校准');assert.equal(L.format(p),'gpt-6-luna(100.0%)-64.1分');assert.equal(p.score,64.1);});
test('compact label roundtrips and ordinary model numbers are not scores',()=>{const {L}=env();for(const s of ['gpt-6-luna(100.0%)-64.1分','gpt-6-astra-39.4分','gpt-6-luna(99.9%)'])assert.equal(L.format(L.parse(s)),s);assert.equal(L.parse('gpt-6-luna').score,null);});
test('historical score does not leak across a changed model identity',()=>{const {L}=env();assert.equal(L.score({name:'gpt-6-astra'},'gpt-6-luna(99.9%)-64.1分'),null);assert.equal(L.label({name:'gpt-6-astra'},'gpt-6-luna(99.9%)-64.1分'),'gpt-6-astra');});
test('missing scores and skipped results stay missing, not fabricated zero',()=>{const {L}=env();assert.equal(L.score({fingerprint:{reasoning:{score:null}}},'gpt-6-luna-5分'),null);assert.equal(L.score({fingerprint:{skipped:'compat-thinking',reasoning:{score:8}}},''),null);assert.equal(L.format(L.parse('gpt-6-luna · 推理分不可用 · 强度未校准')),'gpt-6-luna');});
function item(id,name,score,at){return {id,title:name+(score==null?'':'(100.0%)-'+score+'分'),at};}
test('all same-model rows stay together; newest first inside a model, score is NOT a sort key (astra group outranks luna in the same version)',()=>{const {side}=env();const rows=[item('low','gpt-6-luna',39.4,70),item('other','gpt-6-astra',90,60),item('mid','gpt-6-luna',54.4,50),item('oldhigh','gpt-6-luna',64.1,20),item('high','gpt-6-luna',64.1,30),item('none','gpt-6-luna',null,100)];assert.equal(side.build(rows).flatMap(g=>g.rows.map(r=>r.e.id)).join(','),'other,none,low,mid,high,oldhigh');});
test('groups with no version / leaderboard difference fall back to newest member, never to maximum score',()=>{const {side}=env();const rs=[item('old','gpt-6-luna',900,30),item('new','claude-opus-5-5',1,80)];assert.equal(side.build(rs)[0].rows[0].e.id,'new');});
test('reasoning score (fingerprint or title) never changes the order inside a model: newest first',()=>{const {side,models}=env();models.set('a',{name:'gpt-6-luna',fingerprint:{reasoning:{score:12}}});const rs=[item('a','gpt-6-luna',200,100),item('b','gpt-6-luna',40,90)];assert.equal(side.build(rs)[0].rows.map(r=>r.e.id).join(','),'a,b');});
test('unknown untitled conversations are not accidentally merged into a model',()=>{const {side}=env();assert.equal(side.build([item('a','未命名',null,2),item('b','未命名',null,1)]).length,2);});
test('favorites retain their own priority area, ordered newest first inside a model',()=>{const {side}=env({favs:['a','b']});const gs=side.build([item('x','gpt-6-astra',1000,100),item('a','gpt-6-luna',1,90),item('b','gpt-6-luna',2,80)]);assert.equal(gs[0].group,'收藏');assert.equal(gs[0].rows.map(r=>r.e.id).join(','),'a,b');});
test('optional target priority still works; inside a model newest first',()=>{const {side}=env({target:['gpt']});const gs=side.build([item('x','claude-opus',5,100),item('a','gpt-6-luna',1,50),item('b','gpt-6-luna',2,40)]);assert.equal(gs[0].rows.map(r=>r.e.id).join(','),'a,b');});
test('slash requires first character; embedded/leading-space slashes do not trigger',()=>{const {S}=env();for(const s of ['你好/',' /测','你好 /提示词','\n/测','/你好\n世界'])assert.equal(S.query(s),null);assert.equal(S.query('/测'),'测');});
test('picker filters functions and actual prompt content by substring',()=>{const {S}=env();S.save('你好，帮我翻译');S.save('总结这段文字');assert.equal(S.matches('/测').map(p=>p.text).join(','),'测指纹');assert.equal(S.matches('/你').map(p=>p.text).join(','),'你好，帮我翻译');assert.equal(S.matches('/提示词').length,5);assert.ok(S.matches('/').every(p=>['功能','提示词'].includes(p.kind)));});
test('saved prompts survive a new module instance and edits/deletes preserve IDs',()=>{const h=env(),a=h.S.save('你好');const other=env({saved:h.saved});assert.equal(other.S.list()[0].text,'你好');other.S.save('新提示词',a.id);assert.equal(h.S.list()[0].id,a.id);assert.equal(h.S.matches('/新')[0].text,'新提示词');h.S.remove(a.id);assert.equal(other.S.list().length,0);});
test('blank/too-long prompts rejected; multiline text preserved literally',()=>{const {S}=env();assert.throws(()=>S.save('  '));assert.throws(()=>S.save('a'.repeat(S.MAX_TEXT+1)));const p=S.save('  第一行\n第二行 <img onerror=alert(1)>');assert.equal(p.text,'  第一行\n第二行 <img onerror=alert(1)>');});
test('duplicate add reuses existing prompt and conflicting edit is refused',()=>{const {S}=env(),a=S.save('你好'),b=S.save('再见');assert.equal(S.save('你好').id,a.id);assert.throws(()=>S.save('你好',b.id));assert.equal(S.list().length,2);});
test('quota failure is surfaced rather than reporting success',()=>{const {S}=env({quota:true});assert.throws(()=>S.save('你好'),/本地保存失败/);assert.equal(S.list().length,0);});
test('corrupted local storage does not break composer or expose prototype entries',()=>{const saved=new Map([['quick-prompts:v1',{broken:true}]]),{S}=env({saved});assert.equal(S.list().length,0);assert.equal(S.matches('/').length,4);});
test('unlimited mode keeps non-favorites strictly recent first while favorites are always gold and pinned (收藏就是标金)',()=>{
 const {side}=env({target:[],favs:['old']});const rows=[item('old','gpt-6-luna',999,10),item('new','gpt-6-luna',1,40),item('between','claude-opus-5-5',10,30),item('medium','gpt-6-luna',500,20)];
 const gs=side.build(rows);assert.equal(gs.length,2);assert.equal(gs[0].group,'收藏');assert.equal(gs[0].rows.map(r=>r.e.id).join(','),'old');assert.ok(gs[0].rows[0].vip);
 assert.equal(gs[1].rows.map(r=>r.e.id).join(','),'new,between,medium');assert.ok(gs[1].rows.every(r=>!r.hit&&!r.vip&&!r.tint));
});
test('unlimited equal timestamps retain official list order regardless of inferred names',()=>{
 const {side,models}=env({target:[]});const rows=[item('b','chat',null,10),item('a','chat',null,10),item('c','chat',null,5)];
 const ids=()=>side.build(rows).flatMap(g=>g.rows.map(r=>r.e.id)).join(',');assert.equal(ids(),'b,a,c');
 models.set('c',{name:'gpt-6-luna',fingerprint:{reasoning:{score:900}}});models.set('b',{name:'GPT（推测）',guess:true});assert.equal(ids(),'b,a,c');
});
test('unlimited recent-first rule does not depend on the target-pinning switch',()=>{const {side}=env({target:[],pin:false});assert.equal(side.build([item('a','gpt-6-luna',9,1),item('b','gpt-6-luna',1,2)])[0].rows.map(r=>r.e.id).join(','),'b,a');});
function guessHarness(extra={}){
 const models=new Map(),events=[];let manual=false;
 const ctx=vm.createContext({Models:{get:s=>models.get(s),set:(s,e)=>models.set(s,e)},Fingerprint:{isRunning:()=>manual},Fmt:{guess:()=>({fam:'gpt',sure:true}),NAME:{gpt:'GPT（推测）'},entry:g=>({name:'GPT（推测）',guess:true,sure:g.sure}),est:()=>null},Bus:{emit:(...x)=>events.push(x)},...extra});
 const src=fs.readFileSync(path.join(root,'ui/core.js'),'utf8'),start=src.indexOf('  guessModel(g) {'),end=src.indexOf('  // 识别本轮模型',start);vm.runInContext('this.C=class { '+src.slice(start,end)+' };',ctx);
 const chat=new ctx.C();Object.assign(chat,{sid:'s',busy:true,fmt:{ids:['x'],toolIds:[]},fmtGuess:{fam:'gpt'},emit(){}});
 return {chat,models,events,manual:v=>manual=v};
}
test('fingerprint gacha never publishes transient GPT format guesses between probes',()=>{const h=guessHarness();h.chat.gacha={fingerprint:true};for(const busy of [true,false,true,false]){h.chat.busy=busy;assert.equal(h.chat.guessModel(),null);}assert.equal(h.models.size,0);assert.equal(h.events.length,0);assert.equal(h.chat.fmtGuess.fam,'gpt');});
test('manual fingerprint test also leaves the existing name untouched',()=>{const h=guessHarness();const known={name:'gpt-6-luna',guess:false};h.models.set('s',known);h.manual(true);h.chat.guessModel();assert.equal(h.models.get('s'),known);assert.equal(h.events.length,0);});
test('final fingerprint survives cleanup and regular non-fingerprint guesses still work',()=>{const h=guessHarness();h.chat.gacha=null;h.chat.guessModel();assert.equal(h.models.get('s').name,'GPT（推测）');const final={name:'gpt-6-luna',guess:true,fingerprint:{reasoning:{score:64.1}}};h.models.set('s',final);h.chat.guessModel();assert.equal(h.models.get('s'),final);});

const verOf=n=>{const m=/(\d{1,2})(?:[.-](\d))?(?=-|$)/.exec(String(n).replace(/^[a-z]+-(?:[a-z]+-)?/,''));return m?+m[1]+(m[2]?+m[2]/10:0):0;};
const idsOf=(side,rows)=>side.build(rows).flatMap(g=>g.rows.map(r=>r.e.id)).join(',');
test('sidebar: major version is a tier (6.x above 5.x) regardless of recency; astra > sol > luna inside a version',()=>{
 const {side}=env({ver10:verOf});
 const rows=[item('l55','gpt-5.5-luna',null,900),item('l56','gpt-5.6-luna',null,800),item('s61','gpt-6.1-sol',null,10),item('s6','gpt-6-sol',null,20),item('a6','gpt-6-astra',null,5),item('lu6','gpt-6-luna',null,700)];
 assert.equal(idsOf(side,rows),'a6,s61,s6,lu6,l56,l55');
});
test('sidebar: inside one major version the Brana leaderboard decides (fable can beat opus, or the reverse)',()=>{
 const rank=n=>/fable/.test(n)?1:/opus/.test(n)?2:1000;
 const rows=[item('o','claude-opus-5-5',null,900),item('f','claude-fable-5-1',null,10)];
 assert.equal(idsOf(env({ver10:verOf,rank}).side,rows),'f,o');
 const rank2=n=>/fable/.test(n)?2:/opus/.test(n)?1:1000;
 assert.equal(idsOf(env({ver10:verOf,rank:rank2}).side,rows),'o,f');
});
test('sidebar: 5-5 / 5.5 / 5.6 stay below any 6',()=>{
 const {side}=env({ver10:verOf});
 assert.equal(idsOf(side,[item('a','gpt-5-5',null,999),item('b','gpt-5.6-luna',null,998),item('c','gpt-6-luna',null,1)]),'c,b,a');
});

test('tint follows the DISPLAYED order top to bottom (deep to light); no target vendor = no tint at all',()=>{
 const rows=[item('o1','claude-opus-5',null,10),item('g','gpt-6-luna',null,500),item('o2','claude-opus-5',null,30),item('s','claude-sonnet-4',null,20)];
 const {side}=env({target:['claude']}),flat=side.build(rows).flatMap(g=>g.rows),hit=flat.filter(r=>r.hit);
 assert.equal(hit.map(r=>r.e.id).sort().join(),'o1,o2,s');
 const v=hit.map(r=>parseFloat(r.tint));assert.ok(v.every(Number.isFinite));assert.equal(v.join(),[...v].sort((a,b)=>b-a).join());
 assert.equal(flat.find(r=>r.e.id==='g').tint,'');
 const none=env({target:[]}).side.build(rows).flatMap(g=>g.rows);assert.ok(none.every(r=>r.tint===''&&!r.hit&&!r.vip));
});

test('same model written differently stays in ONE group and all of the vendor hits (claude-opus-5-5 / opus-5-5 / opus-5-5?)',()=>{
 const rows=[item('a','claude-opus-5-5',null,50),item('x','sonnet-5-5',null,45),item('b','opus-5-5',null,40),item('c','claude-opus-5-5?',null,30),item('d','sonnet-5-5',null,20),item('g','gpt-6-luna',null,10)];
 const {side}=env({target:['claude']}),flat=side.build(rows).flatMap(g=>g.rows),ids=flat.map(r=>r.e.id).join(',');
 const pos=id=>flat.findIndex(r=>r.e.id===id);
 assert.equal(Math.max(pos('a'),pos('b'),pos('c'))-Math.min(pos('a'),pos('b'),pos('c')),2,'opus-5-5 rows contiguous: '+ids);
 assert.equal(Math.abs(pos('x')-pos('d')),1,'sonnet-5-5 rows contiguous: '+ids);
 assert.ok(['a','b','c','x','d'].every(id=>flat[pos(id)].hit),'vendor hit even when the title has no claude: '+ids);
 assert.ok(!flat[pos('g')].hit);
});

test('titles that only decode through Titles.view (synced / encoded) group with the same model and keep the vendor hit',()=>{
 const coded={c1:{model:'claude-sonnet-5-5',vid:'claude'},c2:{model:'claude-sonnet-5-5',vid:'claude'}};
 const titles=(id,t)=>coded[id]||{model:'',vid:'',title:t};
 const rows=[item('s1','sonnet-5-5',null,10),item('o','claude-opus-5-5',null,50),item('c1','ZZ-ENC-1',null,70),item('s4','claude-sonnet-4-6',null,40),item('c2','ZZ-ENC-2',null,5)];
 const flat=env({target:['claude'],titles}).side.build(rows).flatMap(g=>g.rows),pos=id=>flat.findIndex(r=>r.e.id===id),ids=flat.map(r=>r.e.id).join(',');
 const sonnet=['s1','c1','c2'].map(pos).sort((a,b)=>a-b);
 assert.equal(sonnet[2]-sonnet[0],2,'sonnet-5-5 rows contiguous (4-6 not in between): '+ids);
 assert.ok(flat.every(r=>r.hit),'all claude rows hit: '+ids);
});

test('a vendor-only local model never outranks the more specific synced title model when grouping',()=>{
 const coded={v1:{model:'claude-sonnet-5-5',vid:'claude'}};
 const titles=(id,t)=>coded[id]||{model:'',vid:'',title:t};
 const e=env({target:['claude'],titles});e.models.set('v1',{name:'claude',guess:true});
 const rows=[item('s1','sonnet-5-5',null,10),item('s4','claude-sonnet-4-6',null,40),item('v1','ZZ-ENC-1',null,5),item('s2','sonnet-5-5',null,70)];
 const flat=e.side.build(rows).flatMap(g=>g.rows),pos=id=>flat.findIndex(r=>r.e.id===id),ids=flat.map(r=>r.e.id).join(',');
 const sonnet=['s1','s2','v1'].map(pos).sort((a,b)=>a-b);
 assert.equal(sonnet[2]-sonnet[0],2,'v1 groups with sonnet-5-5, not "claude": '+ids);
});

test('a format guess never pushes a chat back from the model already measured in the synced title',()=>{
 const Brand={of:n=>/claude|sonnet|opus/i.test(n||'')?'anthropic':/gpt/i.test(n||'')?'openai':''};
 const Fmt={guess:()=>({fam:'claude',sure:true}),NAME:{claude:'claude'},entry:g=>({name:'claude',guess:true,sure:g.sure,why:'toolu_ ids'}),est:()=>null};
 const run=(model,source)=>{const h=guessHarness({Brand,Fmt,TitleSync:{restored:()=>model?{model,source}:null}});h.chat.gacha=null;h.chat.guessModel();return h.models.get('s');};
 const a=run('sonnet-5-5','fingerprint');
 assert.equal(a.name,'sonnet-5-5');assert.equal(a.fromTitle,true);assert.ok(!a.why,'no format-guess provenance on a measured model');
 assert.equal(run('gpt-6-luna','fingerprint').name,'gpt-6-luna','measured model wins even when the weak format hint names another vendor');
 assert.equal(run('sonnet-5-5','local').name,'sonnet-5-5','same-vendor specific name is adopted');
 assert.equal(run('gpt-6-luna','local').name,'claude','unmeasured title of another vendor does not override');
 assert.equal(run(null).name,'claude','no synced model: plain vendor guess');
 assert.equal(run('未识别','fingerprint').name,'claude');
});
