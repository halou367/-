// node --test stuck-guard.test.cjs  (extracts StuckGuard from ui/core.js and runs it against stubs)
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(process.env.CORE || path.join(__dirname, '..', 'ui', 'core.js'), 'utf8');
const a = src.indexOf('const StuckGuard = {'), b = src.indexOf('\ntry { if (typeof window', a);
const code = src.slice(a, b);
function make(srvMsgs, chatOver = {}) {
  const T = 1_000_000;
  const user = { id: 'u1', role: 'user' }, live = { id: 'a1', role: 'assistant', metadata: { pending: true }, parts: [{ type: 'text', text: 'hi' }] };
  const c = { sid: 's1', status: 'streaming', busy: true, live, messages: [user, live], recAt: T - 60000, sentAt: T - 900000, trc: [],
    dbg(k, o) { this.trc.push({ k, ...o }); }, emit() {}, finishTurn() { this.finished = true; this.live = null; this.status = 'idle'; this.busy = false; }, mergeServer() { return false; }, ...chatOver };
  const Chats = new Map([[c.sid, c]]);
  const api = async () => ({ messages: srvMsgs, lastEventId: '99' });
  const ReadLimit = { active: () => false };
  const console = { warn() {} };
  const SG = new Function('Chats', 'api', 'ReadLimit', 'now', 'console', 'document', code + '\nreturn StuckGuard;')(Chats, api, ReadLimit, () => T, console, { hidden: false });
  return { SG, c };
}
const done = { id: 'a1', role: 'assistant', metadata: { pending: false, timing: { completedAt: 1 } }, parts: [] };
test('finishes when server confirms same turn done', async () => { const { SG, c } = make([{ id: 'u1', role: 'user' }, done]); await SG.tick(); assert.equal(c.finished, true); assert.equal(c.status, 'idle'); });
test('finishes when ids differ but follows same user message', async () => { const { SG, c } = make([{ id: 'u1', role: 'user' }, { ...done, id: 'zz' }]); await SG.tick(); assert.equal(c.finished, true); });
test('keeps when server last is user (turn in progress)', async () => { const { SG, c } = make([{ id: 'u0', role: 'user' }, { ...done, id: 'old' }, { id: 'u1', role: 'user' }]); await SG.tick(); assert.notEqual(c.finished, true); });
test('keeps when server final belongs to an older turn', async () => { const { SG, c } = make([{ id: 'u0', role: 'user' }, { ...done, id: 'old' }]); await SG.tick(); assert.notEqual(c.finished, true); });
test('keeps while a tool is running', async () => { const { SG, c } = make([{ id: 'u1', role: 'user' }, done]); c.live.parts.push({ toolCallId: 't', state: 'input-available' }); await SG.tick(); assert.notEqual(c.finished, true); });
test('keeps when records arrived recently', async () => { const { SG, c } = make([{ id: 'u1', role: 'user' }, done], { recAt: 1_000_000 - 5000 }); await SG.tick(); assert.notEqual(c.finished, true); });
test('keeps when server still pending', async () => { const { SG, c } = make([{ id: 'u1', role: 'user' }, { ...done, metadata: { pending: true } }]); await SG.tick(); assert.notEqual(c.finished, true); });
test('rate: at most one snapshot per 45s per chat', async () => { const { SG, c } = make([{ id: 'u1', role: 'user' }, { ...done, metadata: { pending: true } }]); await SG.tick(); const n = c.trc.length; await SG.tick(); assert.equal(c.trc.length, n); });
