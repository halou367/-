// Target-bound editor transactions. A draft never changes its caller's account or creates a record on open.
const State = require('../ui/route-state');
const { randomUUID, createHash } = require('node:crypto');
const revision = a => JSON.stringify([State.signature(a), State.mode(a), a?.routeAuto !== false, a?.nodeFailover === true, a?.name || '', a?.remark || '', a?.email || '', a?.pw || '', !!a?.noAuto]);
const policy = a => JSON.stringify([State.mode(a), a?.routeAuto !== false, a?.nodeFailover === true]);
const digest = value => createHash('sha256').update(JSON.stringify(State.canonical(value))).digest('hex');
const failure = (message, code = 'ROUTE_DRAFT_STALE') => Object.assign(Error(message), { code });

function createDrafts({ find, publicAccount, now = Date.now, nonce = randomUUID, ttl = 10 * 60000, limit = 64 }) {
  const entries = new Map();
  function get(actor, id, { saved = false } = {}) {
    const d = entries.get(id);
    if (!d || d.actor !== actor || d.until <= now()) throw failure('连接编辑草稿已过期或窗口已改变，请重新打开编辑器');
    if (!saved && d.saved) throw failure('此草稿已经保存，请使用保存后的账号重新编辑');
    if (!d.saved && d.target && (find(d.target.id) !== d.target || revision(d.target) !== d.revision)) throw failure('目标账号已被其他操作修改，请刷新后重新检测');
    return d;
  }
  function open(actor, id = '') {
    if (!actor || typeof id !== 'string') throw failure('连接编辑器身份无效');
    const target = id ? find(id) : null;
    if (id && !target) throw failure('目标账号已删除，不能把草稿应用到其他账号');
    for (const [key, d] of entries) if (!d.busy && d.until <= now()) entries.delete(key);
    if (entries.size >= limit) throw failure('连接编辑器过多，请关闭旧编辑器后重试', 'ROUTE_DRAFT_BUSY');
    const draft = nonce(), d = { actor, id: draft, target, revision: revision(target), until: now() + ttl, owner: 'draft:' + actor + ':' + draft, busy: false, saved: null };
    entries.set(draft, d);
    return { ok: true, draft, expires: d.until, account: target ? publicAccount(target) : null };
  }
  function status(actor, id) {
    const d = get(actor, id, { saved: true });
    if (d.saved && find(d.saved.account.id) !== d.saved.account) throw failure('保存后的账号已删除');
    return { ok: true, draft: id, busy: d.busy, committed: !!d.saved, account: d.saved ? publicAccount(d.saved.account) : d.target ? publicAccount(d.target) : null };
  }
  function close(actor, id) {
    const d = get(actor, id, { saved: true });
    if (d.busy) throw failure('保存正在进行，请等待结果，不会中途重复提交', 'ROUTE_DRAFT_BUSY');
    entries.delete(id); return { ok: true };
  }
  return { open, get, status, close };
}

// build returns { candidate, fields }; publish returns an undo function and may not await.
function createSave({ drafts, busy, build, validate, apply, publish, persist, publicAccount, discard = async () => {}, exists = () => true, after = () => {}, now = Date.now }) {
  return async (actor, request) => {
    let d, prepared, started = false, undo, reserved = false;
    try {
      if (!request || !request.account || typeof request.account !== 'object' || Array.isArray(request.account)) throw failure('账号保存参数无效');
      d = drafts.get(actor, request.draft, { saved: true });
      const key = digest(request.account);
      if (d.saved) {
        drafts.status(actor, request.draft);
        if (key !== d.saved.key) throw failure('此草稿已经保存，不能重用它创建或修改另一个账号');
        return { ok: true, repeated: true, account: publicAccount(d.saved.account) };
      }
      if (d.busy) throw failure('保存正在进行，请等待结果', 'ROUTE_DRAFT_BUSY');
      if (String(request.account.id || '') !== (d.target?.id || '')) throw failure('检测草稿与保存目标不一致，未修改任何账号');
      prepared = build(d.target, request.account);
      const c = prepared.candidate;
      if (!c?.id || busy.has(c.id)) throw failure('目标账号的线路正在切换', 'ROUTE_DRAFT_BUSY');
      const routeChanged = !d.target || State.signature(c) !== State.signature(d.target) || policy(c) !== policy(d.target);
      if (d.target) State.assertChange(d.target, c);
      validate(d, c, request, routeChanged);
      d.busy = true; busy.add(c.id); reserved = true;
      {
        if (routeChanged) { started = true; await apply(c); }
        drafts.get(actor, request.draft);
        if (d.target) State.assertChange(d.target, c);
        validate(d, c, request, routeChanged);
        if (routeChanged) { c.routeAt = now(); if (!prepared.fields.includes('routeAt')) prepared.fields.push('routeAt'); }
        undo = publish(d.target, c, prepared.fields);
        try { persist(); } catch (e) { undo(); undo = null; throw e; }
        const account = d.target || c;
        d.saved = { key, account }; // Idempotency acknowledgement survives a lost renderer reply.
        try { after(account, request, d); } catch {}
        return { ok: true, account: publicAccount(account) };
      }
    } catch (error) {
      if (started && !d?.saved) {
        try { if (d?.target && exists(d.target)) await apply(d.target); else if (prepared) await discard(prepared.candidate); } catch {}
      }
      return { ok: false, code: error.code || 'ROUTE_SAVE_FAILED', error: String(error.message || error) };
    } finally { if (reserved) { d.busy = false; busy.delete(prepared.candidate.id); } }
  };
}

function buildAccount(current, input, { newId, genFp, cleanFp, encPw, validProxy }) {
  const allowed = new Set(['id', 'name', 'remark', 'email', 'password', 'clearPassword', 'proxy', 'proxyIp', 'nodeId', 'region', 'routeMode', 'routeAuto', 'nodeFailover', 'fp']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw failure('连接编辑器包含不支持的账号字段', 'ROUTE_SAVE_INVALID');
  const c = current ? { ...current } : { id: newId(), name: '账号', email: '', proxy: '', proxyIp: '', nodeId: '', region: '', fp: input.fp ? cleanFp(input.fp) : genFp() };
  const fields = new Set(current ? [] : Object.keys(c));
  const set = (key, value) => { c[key] = value; fields.add(key); };
  if (input.name != null) set('name', String(input.name || c.name).slice(0, 40));
  if (input.email != null) {
    const email = String(input.email).trim().slice(0, 200);
    if (email !== c.email) set('status', null);
    set('email', email);
    if (!input.name && !current) set('name', email || '账号');
  }
  if (input.password != null && String(input.password)) { set('pw', encPw(String(input.password))); set('noAuto', false); }
  if (input.clearPassword === true) { set('pw', undefined); set('noAuto', true); }
  if (input.remark != null) set('remark', String(input.remark).trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 40));
  if (input.fp) set('fp', cleanFp(input.fp));
  for (const k of ['proxy', 'proxyIp', 'nodeId']) if (input[k] != null) set(k, String(input[k]).trim());
  if (!validProxy(c.proxy)) throw failure('代理 / 节点格式不正确', 'ROUTE_SAVE_INVALID');
  if (c.proxyIp && !/^(?:[\w.:\[\]-]{3,120}|(?:socks5|https?|turn|sstp):\/\/(?:[\w.~%+=!$&'()*,;:-]{1,128}@)?[\w.\[\]:-]{3,160})$/i.test(c.proxyIp)) throw failure('ProxyIP 格式不正确', 'ROUTE_SAVE_INVALID');
  if (input.region != null) set('region', String(input.region).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4));
  if (input.routeMode != null) for (const [key, value] of Object.entries(State.prefs(input.routeMode))) set(key, value);
  if (typeof input.routeAuto === 'boolean' && State.mode(c) === 'auto') set('routeAuto', input.routeAuto);
  if (typeof input.nodeFailover === 'boolean' && State.mode(c) === 'node') set('nodeFailover', input.nodeFailover);
  if (State.isNode(c) === false && c.proxyIp) throw failure('非节点线路不能绑定 ProxyIP', 'ROUTE_SAVE_INVALID');
  if (!current || ['proxy', 'nodeId', 'region'].some(k => c[k] !== current[k])) set('routeHome', c.region || '');
  return { candidate: c, fields: [...fields] };
}
module.exports = { revision, policy, digest, createDrafts, createSave, buildAccount };
