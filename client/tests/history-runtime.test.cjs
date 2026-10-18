const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../ui/core.js'), 'utf8');
const code = source.slice(source.indexOf('const ENT_AT ='), source.indexOf('// ---------- 出口 IP ----------'));
const row = (id, day = 1, type = 'agentic') => ({ id, type, title: id, updatedAt: `2026-09-${String(day).padStart(2,'0')}T00:00:00Z` });
const page = (entries, cursor = null) => ({ entries, pagination: { hasMore: !!cursor, cursor } });
function fixture(responses = []) {
  const requests = [], events = [], saved = new Map(), timers = [];
  const ctx = vm.createContext({ Set, Map, WeakMap, Date, Promise, encodeURIComponent, now: () => Date.now(), sleep: async () => {}, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout: () => {}, describe: e => e.message, Chats: new Map(), Store: { get: k => saved.get(k), set: (k,v) => saved.set(k,v) }, Bus: { emit: e => events.push(e) }, api: async (url, opt) => { requests.push({url,opt}); const r = responses.shift(); if (r instanceof Error) throw r; return typeof r === 'function' ? r(url) : r; } });
  vm.runInContext(code + ';globalThis.H = History;', ctx);
  return { H: ctx.H, requests, events, responses, saved, timers, ids: () => Array.from(ctx.H.items, e => e.id) };
}
const deferred = () => { let resolve; return { promise: new Promise(r => resolve = r), resolve: v => resolve(v) }; };
test('malformed success response never clears cached history or claims a complete scan', async () => {
  const f = fixture([{error:'temporarily unavailable'}]); f.H.items = [row('cached')]; await f.H.refresh();
  assert.deepEqual(f.ids(), ['cached']); assert(f.H.err); assert(!f.H.full);
});
test('empty filtered head page keeps cached rows until subsequent agentic pages finish', async () => {
  const f = fixture([page([row('other',3,'battle')], 'p2'), page([row('cached'),row('older')])]); f.H.items = [row('cached')];
  await f.H.refresh(); assert.deepEqual(f.ids(), ['cached']); await f.H.loadAll(); assert.deepEqual(f.ids().sort(), ['cached','older']); assert(f.H.full);
});
test('each successful refresh restarts pagination, catching new rows below the first page', async () => {
  const f = fixture([page([row('a',3)]),page([row('b',4)],'next'),page([row('c',2),row('a',1)])]);
  await f.H.refresh(); await f.H.loadAll(); await f.H.refresh(); await f.H.loadAll();
  assert.deepEqual(f.ids().sort(), ['a','b','c']); assert.equal(f.requests.length,3);
});
test('fresh scan uses a new seen set and prunes deleted rows only at the confirmed end', async () => {
  const f = fixture([page([row('a',3)],'p2'),page([row('removed'),row('z')]),page([row('a',3)],'p2'),page([row('z')])]);
  await f.H.refresh(); await f.H.loadAll(); await f.H.refresh(); assert(f.ids().includes('removed')); await f.H.loadAll(); assert.deepEqual(f.ids().sort(), ['a','z']);
});
test('same and cyclic cursors stop instead of hammering the API', async () => {
  for (const cycle of [false,true]) {
    const f = fixture([page([row('a',4)],'x'), page([row('b',3)],cycle?'y':'x'), page([row('c',2)],'x')]);
    await f.H.refresh(); await f.H.loadAll(); assert(f.H.err); assert(!f.H.full); assert(f.requests.length <= 3);
  }
});
test('pagination shape validation preserves existing state', async () => {
  for (const value of [{entries:[]},{entries:[],pagination:{hasMore:true}},{entries:[null],pagination:{hasMore:false}},{entries:[],pagination:{hasMore:'false'}}]) {
    const f = fixture([value]); f.H.items=[row('safe')]; await f.H.refresh(); assert(f.H.err); assert.deepEqual(f.ids(),['safe']);
  }
});
test('refresh waits for an in-flight page and newer head data wins', async () => {
  const d=deferred(),f=fixture([page([row('a',4)],'p2'),()=>d.promise,page([{...row('a',5),title:'new'},row('b',3)],'p2')]);
  await f.H.refresh(); const more=f.H.more(); await Promise.resolve(); const refresh=f.H.refresh(); await Promise.resolve();
  d.resolve(page([{...row('a',4),title:'old'},row('b',3)])); await Promise.all([more,refresh]);
  assert.equal(f.H.byId('a').title,'new'); assert(f.ids().includes('b')); assert.equal(f.H.cursor,'p2');
});
test('scroll and bulk scan share an in-flight page, with no duplicate requests or rows', async () => {
  const d=deferred(),f=fixture([page([row('a',3)],'next'),()=>d.promise]); await f.H.refresh();
  const m=f.H.more(),all=f.H.loadAll(); await Promise.resolve(); d.resolve(page([row('a',3),row('b'),row('b')])); await Promise.all([m,all]);
  assert.equal(f.requests.length,2); assert.deepEqual(f.ids().sort(),['a','b']); assert(f.H.full);
});
test('failed head refresh cannot prune cache or continue an obsolete cursor', async () => {
  const f=fixture([page([row('a',3)],'old'),Error('offline')]); f.H.items=[row('cached')];
  await f.H.refresh(); await f.H.refresh(); await f.H.loadAll(); assert(f.H.err); assert(!f.H.full); assert(f.ids().includes('cached')); assert.equal(f.requests.length,2);
});
test('transient page failure can retry and clears the error on success', async () => {
  const f=fixture([page([row('a',3)],'next'),Error('offline'),page([row('b')])]); await f.H.refresh(); await f.H.loadAll();
  assert.equal(f.H.err,null); assert(f.H.full); assert.deepEqual(f.ids().sort(),['a','b']);
});
test('a failed partial scan retains unseen cache and never marks it complete', async () => {
  const f=fixture([page([row('a',3)],'next'),Error('down'),Error('down'),Error('down')]); f.H.items=[row('cached')]; await f.H.refresh(); await f.H.loadAll();
  assert(f.ids().includes('cached')); assert(!f.H.full); assert(f.H.err); assert.equal(f.requests.length,4);
});
test('complete empty scan prunes stale cache, not a locally created row during the request', async () => {
  const d=deferred(),f=fixture([()=>d.promise]); f.H.items=[row('stale')]; const r=f.H.refresh();
  await new Promise(setImmediate); f.H.items.unshift(row('local',4)); d.resolve(page([])); await r; await f.H.loadAll();
  assert.deepEqual(f.ids(),['local']); assert(f.H.full);
});
test('truncated cache does not advertise complete history', async () => {
  const f=fixture(); f.H.ck='hist:fixture'; f.H.full=true; f.H.items=Array.from({length:5001},(_,i)=>row('id'+i)); f.H.saveSoon(); f.timers.at(-1)();
  assert.equal(f.saved.get(f.H.ck).items.length,5000); assert.equal(f.saved.get(f.H.ck).full,false);
});
test('bulk history events are bounded, and the final state is emitted', async () => {
  const f=fixture(Array.from({length:101},(_,i)=>page([row('id'+i)],i<100?'p'+(i+1):null)));
  await f.H.refresh(); await f.H.loadAll(); assert.equal(f.H.items.length,101); assert(f.H.full); assert(f.events.length<20);
});

test('rate limits honor Retry-After across automatic and manual refresh without a retry burst', async () => {
  const f=fixture([page([row('a')],'next'),Object.assign(Error('rate limited'),{status:429,retryAfterMs:90000})]);
  await f.H.refresh(); await f.H.loadAll(); await f.H.refresh(); await f.H.more(); await f.H.loadAll();
  assert.equal(f.requests.length,2); assert(f.H.retryAt>Date.now()+85000); assert(f.H.err); assert(!f.H.full);
});
test('authentication and challenge responses pause bulk pagination after one request', async () => {
  for (const attrs of [{status:401},{status:403},{status:200,responseFormat:true}]) {
    const f=fixture([page([row('a')],'next'),Object.assign(Error('verification'),attrs)]);
    await f.H.refresh(); await f.H.loadAll(); assert.equal(f.requests.length,2); assert(f.H.blocked); assert(!f.H.full);
  }
});
