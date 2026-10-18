// Host authority for an account's authentication environment. Persists metadata only.
const { randomUUID } = require('node:crypto');
const State = require('../ui/route-state');
function createAuthRouteGuard({ find, persist, busy = () => false, now = Date.now, nonce = randomUUID, requireExit = false }) {
  function task(id, request = {}) {
    const a = find(id);
    if (!a) throw Error('账号不存在');
    if (request.op === 'status') return { ok: true, ...State.status(a, now()), ...(a.routeAuth?.ticket ? { ticket: a.routeAuth.ticket } : {}) };
    if (busy(a)) throw Error('线路正在切换或初始化，请等待结果后再认证');
    if (requireExit && ['prepare','begin'].includes(request.op) && (!request.expected || (request.op === 'begin' && !request.ip) || !request.environment)) throw Error('缺少当前账号实际出口或环境证明');
    const previous = a.routeAuth;
    try {
      let result;
      if (request.op === 'prepare' || request.op === 'begin') result = State.begin(a, { ...request, prepare: request.op === 'prepare', ...(request.op === 'prepare' ? { ip: undefined } : {}) }, { now: now(), ticket: nonce() });
      else if (request.op === 'finish') result = State.finish(a, request, now());
      else if (request.op === 'stage') result = State.stage(a, request, now());
      else if (request.op === 'cancel') result = State.cancel(a, request.ticket);
      else throw Error('认证任务操作无效');
      persist();
      return { ok: true, ...result };
    } catch (error) { if (previous === undefined) delete a.routeAuth; else a.routeAuth = previous; throw error; }
  }
  return { task, assertChange: State.assertChange, locked: id => State.locked(find(id)) };
}
module.exports = { createAuthRouteGuard };
