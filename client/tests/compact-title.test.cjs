const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {webcrypto,randomBytes}=require('node:crypto');
const ui=path.join(__dirname,'../ui');
function device(crypto=webcrypto){const c=vm.createContext({TextEncoder,TextDecoder,Uint8Array,crypto});for(const f of ['title-compact.js','title-cipher.js'])vm.runInContext(fs.readFileSync(path.join(ui,f),'utf8'),c);vm.runInContext('this.codec=TitleCompact;this.cipher=TitleCipher;',c);return c;}
const payload=(model='gpt-6-astra')=>[2,model,.997,191.7,31.4,1791080000123,'private local note','high','fingerprint',1791080000456];
const plain=a=>JSON.parse(JSON.stringify(a));
test('100-character proof: every 49-byte frame encodes to 14 six-letter groups without retries',()=>{
 const {codec}=device();for(let i=0;i<5002;i++){const bytes=i===0?Buffer.alloc(49):i===1?Buffer.alloc(49,255):randomBytes(49);const title=codec.encode(bytes);assert.equal(title.length,100);assert.match(title,/^Qz (?:[a-z]{6} ){13}[a-z]{6}$/);assert.equal(Buffer.compare(Buffer.from(codec.decode(title)),bytes),0);}
 assert.throws(()=>codec.encode(new Uint8Array(50)));assert.throws(()=>codec.decode('Qz '+Array(14).fill('zzzzzz').join(' ')),/溢出/);
});
test('model IDs are append-only, frozen, deterministic, and cover shipped fingerprint banks',()=>{
 const {codec}=device(),prefix=require('./fixtures/title-model-prefix-v2.json');assert(Object.isFrozen(codec.models));assert.deepEqual(Array.from(codec.models).slice(0,prefix.length),prefix);assert(codec.models.length<=4096);assert.equal(new Set(codec.models).size,codec.models.length);
 for(const filename of ['../data/fingerprint-bank-v2026.09.5.json','../../packages/core-metrics/modeltrace-bank.json'])for(const m of JSON.parse(fs.readFileSync(path.join(__dirname,filename),'utf8')).models)assert(codec.models.includes(m.id.toLowerCase()),m.id);
 for(const name of codec.models){const p=payload(name),packed=codec.pack(p);assert.equal(packed.length,13);assert.deepEqual(plain(codec.unpack(packed)),plain(codec.canonical(p)));}
});
test('fixed numeric ranges, null sentinels and millisecond time round trip without integer overflow',()=>{
 const {codec}=device();
 for(const [c,s,a,t]of [[null,null,null,0],[0,0,0,1],[1,6551.9,26214.2,4398046511103],[.997,191.7,31.4,1791080000123]]){const p=payload();[p[2],p[3],p[4],p[5]]=[c,s,a,t];assert.deepEqual(plain(codec.unpack(codec.pack(p))),plain(codec.canonical(p)));}
 const p=payload();p[2]=.99744;p[3]=191.746;p[4]=31.449;const d=codec.unpack(codec.pack(p));assert.equal(d[2],.997);assert.equal(d[3],191.7);assert.equal(d[4],31.4);assert.equal(d[5],p[5]);assert.equal(d[6],'');
 for(const [index,value]of [[2,1.1],[3,6552],[4,26215],[5,4398046511104],[5,-1],[5,1.5],[3,NaN]]){const p=payload();p[index]=value;assert.throws(()=>codec.pack(p));}
});
test('all skip statuses are reversible, including unconfirmed stops, and never acquire invented scores',()=>{
 const {codec}=device();for(const reason of ['因思考跳过','数字超量','回复超长','循环输出','单条超时','多段回复异常','输出异常'])for(const tail of ['','（停止未确认）']){const p=payload('待定 · '+reason+tail);p[2]=p[3]=p[4]=null;const d=codec.unpack(codec.pack(p));assert.equal(d[1],p[1]);assert.deepEqual(plain(d.slice(2,5)),[null,null,null]);}
});
test('unknown models are never hashed into or confused with another model ID',()=>{
 const {codec}=device();assert.throws(()=>codec.pack(payload('future-model-not-in-table')),/尚未收录/);assert.throws(()=>codec.pack(payload('gpt-6-astra-extra-private-suffix')),/尚未收录/);
});
test('independent Python PBKDF2/AES-GCM v2 vector still decrypts (old titles stay readable)',async()=>{
 const vector=require('./fixtures/title-v2-vector.json');let n=0;const c=device({subtle:webcrypto.subtle,getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=n++;return a;}});
 assert.equal(Buffer.from(c.codec.pack(vector.payload)).toString('hex'),vector.plain_hex);c.cipher.unlock(vector.phrase);assert.deepEqual(plain(await c.cipher.decrypt(vector.sid,vector.title)),vector.payload);
 const fresh=await c.cipher.encrypt(vector.sid,vector.payload);assert.match(fresh,/^Qy (?:[a-z]{6} ){13}[a-z]{6}$/);assert.equal(fresh.length,100);assert.deepEqual(plain(await c.cipher.decrypt(vector.sid,fresh)),vector.payload);
});
test('v3 keeps unlisted model names (no substitution) inside exactly 100 characters',async()=>{
 const a=device(),b=device();a.cipher.unlock('755287249');b.cipher.unlock('755287249');
 for(const [name,want] of [['qwen3-max','qwen3-max'],['Step Muse','step-muse'],['gpt-6.1-sol?','gpt-6.1-sol'],['qwen3-235b-a22b-thinking-2507','qwen3-235b-a22b-thinking']]){
  const p=payload();p[1]=name;p[3]=8971.3;const t=await a.cipher.encrypt('sid-x',p);assert.equal(t.length,100);const d=await b.cipher.decrypt('sid-x',t);assert.equal(d[1],want);assert.equal(d[3],8971.3);
 }
 b.cipher.unlock('1326565');const t=await a.cipher.encrypt('sid-x',payload());await assert.rejects(()=>b.cipher.decrypt('sid-x',t),/口令/);
});
test('independent devices and seven-digit passwords restore core metadata; notes are never in compact payloads',async()=>{
 const a=device(),b=device();a.cipher.unlock('755287249');b.cipher.unlock('755287249');const p=payload();p[6]='备注'.repeat(10000);
 const first=await a.cipher.encrypt('same',p),second=await a.cipher.encrypt('same',p);assert.equal(first.length,100);assert.equal(second.length,100);assert.notEqual(first,second);assert.deepEqual(plain(await b.cipher.decrypt('same',first)),plain(a.codec.canonical(p)));
 b.cipher.unlock('1326565');await assert.rejects(()=>b.cipher.decrypt('same',first),/口令/);const other=await b.cipher.encrypt('same',p);assert.notEqual(other,first);assert.equal(other.length,100);
});
test('wrong SID, changed salt/IV/tag, truncation and noncanonical text all fail closed',async()=>{
 const {cipher,codec}=device();cipher.unlock('755287249');const title=await cipher.encrypt('id-a',payload());await assert.rejects(()=>cipher.decrypt('id-b',title),/对话 ID/);
 for(const byte of [0,3,4,9,10,32,48]){const data=codec.decodeAny(title).bytes;data[byte]^=1;await assert.rejects(()=>cipher.decrypt('id-a',codec.encode3(data)),/口令|修改/);}
 for(const bad of [title.slice(0,-1),title+' ',title.replace(/ /,'  '),title.toUpperCase()])await assert.rejects(()=>cipher.decrypt('id-a',bad));
});
test('lock or password changes cancel in-flight compact encryption and decryption',async()=>{
 const {cipher}=device();cipher.unlock('755287249');const pending=cipher.encrypt('sid',payload());cipher.lock();await assert.rejects(()=>pending,/口令/);
 cipher.unlock('755287249');const title=await cipher.encrypt('sid',payload());const reading=cipher.decrypt('sid',title);cipher.unlock('1326565');await assert.rejects(()=>reading,/口令/);
});
test('v4 Qx titles stay exactly 100 characters and carry note + favourite across devices',async()=>{
  const a=device(),b=device();a.cipher.unlock('correct horse battery');b.cipher.unlock('correct horse battery');
  for(const note of ['','脚本修改','x'.repeat(118),'长'.repeat(59),'混合 note 备注 🙂']){
    const t=await a.cipher.encrypt('sid-1',payload(),{note,fav:true,v4:true});
    assert.equal(t.length,100);assert.match(t,/^Qx [\u4e00-\u8dff]{97}$/);assert(a.cipher.isCompact(t));assert(a.cipher.isEncoded(t));
    const v=await b.cipher.decrypt('sid-1',t);assert.equal(v[6],note);assert.equal(v.fav,true);assert.equal(v.v4,true);assert.equal(v[1],'gpt-6-astra');
  }
  const off=await a.cipher.encrypt('sid-1',payload(),{note:'',fav:false,v4:true});const v=await b.cipher.decrypt('sid-1',off);assert.equal(v[6],'');assert.equal(v.fav,false);assert.equal(v.v4,true);
  await assert.rejects(a.cipher.encrypt('sid-1',payload(),{note:'长'.repeat(60),v4:true}),/上限/);
  await assert.rejects(b.cipher.decrypt('sid-2',off),/不匹配/);
  // without ext the v3 Qy format is unchanged
  assert.match(await a.cipher.encrypt('sid-1',payload()),/^Qy /);
});
