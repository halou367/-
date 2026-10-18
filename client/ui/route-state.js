// Account-local route policy and authentication lease. Metadata only: no Cookies, passwords or service tokens.
const RouteState = (() => {
  const MODES = ['auto', 'node', 'proxy', 'direct'];
  const critical = ['proxy', 'proxyIp', 'nodeId', 'region', 'xout', 'fp'];
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return value ?? '';
  };
  const signature = a => JSON.stringify(critical.map(k => canonical(a?.[k] || '')));
  const isNode = a => /^vless:\/\//i.test(a?.proxy || '');
  function mode(a) {
    if (MODES.includes(a?.routeMode)) return a.routeMode;
    return isNode(a) ? (a.routeAuto === false ? 'node' : 'auto') : /^(direct|none|off|直连)$/i.test(a?.proxy || '') ? 'direct' : 'proxy';
  }
  // Expiry stops authentication, not its route lock. Unlocking always needs explicit completion/cancellation.
  const locked = a => !!a?.authLocked || !!(a?.routeAuth?.ticket && a.routeAuth.snapshot);
  const canRecover = a => !locked(a) && (mode(a) === 'node' ? isNode(a) && a.nodeFailover === true : mode(a) === 'auto' && a?.routeAuto !== false);
  const error = (message, code = 'AUTH_ROUTE_LOCKED') => Object.assign(Error(message), { code });
  function status(a, now = Date.now()) {
    if (!locked(a)) return { locked: false };
    const x = a.routeAuth || { expires: a.authExpires, kind: a.authKind };
    return { locked: true, email: x.email || '', kind: x.kind || 'login', stage: x.stage || '', preparing: x.preparing === true, expires: x.expires, expired: x.expires <= now };
  }
  function assertChange(a, patch) {
    if (!locked(a)) return;
    if (signature({ ...a, ...patch }) !== signature(a)) throw error('该账号正在认证，节点、出口、地区和指纹已锁定；请完成或明确取消认证后再修改');
    if (patch.email !== undefined && a.routeAuth?.email && String(patch.email).trim().toLowerCase() !== a.routeAuth.email.toLowerCase()) throw error('认证目标邮箱已锁定，请先取消旧任务', 'AUTH_TASK_CONFLICT');
    const policy = { routeMode: mode(a), nodeFailover: a.nodeFailover === true, routeAuto: a.routeAuto !== false };
    if (['routeMode', 'nodeFailover', 'routeAuto'].some(k => patch[k] !== undefined && patch[k] !== policy[k])) throw error('认证期间不能变更线路策略，请先完成或取消认证');
  }
  function begin(a, request, { now = Date.now(), ticket } = {}) {
    if (!a?.id || !['login', 'signup', 'forgot', 'reset', 'google', 'verify'].includes(request?.kind)) throw error('认证任务参数无效', 'AUTH_TASK_INVALID');
    const email = String(request.email || '').trim();
    if (!email && request.kind !== 'google') throw error('缺少认证目标邮箱', 'AUTH_TASK_INVALID');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw error('认证邮箱无效', 'AUTH_TASK_INVALID');
    if (request.expected && (request.expected.id !== a.id || signature(request.expected) !== signature(a))) throw error('出口检测期间账号配置已改变，请重新检测', 'AUTH_ENV_CHANGED');
    if (request.ip !== undefined && !/^[0-9A-Fa-f:.]{3,64}$/.test(request.ip)) throw error('实际出口证明无效', 'AUTH_EXIT_INVALID');
    if (locked(a)) {
      const x = a.routeAuth;
      if (x.expires <= now) throw error('认证任务已超时，线路仍被锁定；请取消旧任务后重新开始', 'AUTH_TASK_EXPIRED');
      if ((!request.prepare && x.ip && x.ip !== request.ip) || (x.environment && x.environment !== request.environment)) throw error('实际出口或浏览器环境已改变，已停止认证；请取消旧任务后核对', 'AUTH_ENV_CHANGED');
      if (x.snapshot !== signature(a)) throw error('认证环境已经改变，已停止认证，请取消旧任务后检查线路', 'AUTH_ENV_CHANGED');
      if (x.email && x.email.toLowerCase() !== email.toLowerCase()) throw error('已有其他邮箱的认证任务，请先取消旧任务', 'AUTH_TASK_CONFLICT');
      if (!request.prepare && request.ip) a.routeAuth = { ...x, ip: x.ip || request.ip, preparing: false };
      return { ticket: x.ticket, ...status(a, now) };
    }
    if (!ticket || typeof ticket !== 'string') throw error('宿主未生成认证任务标识', 'AUTH_TASK_INVALID');
    a.routeAuth = { ticket, email, kind: request.kind, at: now, expires: now + 30 * 60000, snapshot: signature(a), preparing: request.prepare === true, ...(request.ip ? { ip: request.ip } : {}), ...(request.environment ? { environment: request.environment } : {}) };
    return { ticket, ...status(a, now) };
  }
  function finish(a, request, now = Date.now()) {
    if (!locked(a) || request?.ticket !== a.routeAuth.ticket) throw error('认证任务已改变，未解锁线路', 'AUTH_TASK_STALE');
    const x = a.routeAuth;
    if (x.preparing) throw error('实际出口尚未确认，认证任务仍锁定', 'AUTH_ENV_UNSEALED');
    if ((x.ip && x.ip !== request.ip) || (x.environment && x.environment !== request.environment)) throw error('实际出口或浏览器环境已改变，未确认完成', 'AUTH_ENV_CHANGED');
    if (x.snapshot !== signature(a)) throw error('认证环境已改变，未确认完成', 'AUTH_ENV_CHANGED');
    if (x.expires <= now) throw error('认证任务已超时，请取消旧任务后重新核对', 'AUTH_TASK_EXPIRED');
    if (!request.email || (x.kind !== 'login' && x.email && x.email.toLowerCase() !== String(request.email).trim().toLowerCase())) throw error('实际账号与认证目标不一致，未解锁线路', 'AUTH_IDENTITY_MISMATCH');
    delete a.routeAuth; return { locked: false };
  }
  function stage(a, request, now = Date.now()) {
    if (!locked(a) || a.routeAuth.ticket !== request.ticket || request.stage !== 'waiting-mail' || !['signup','forgot'].includes(request.kind)) throw error('认证步骤未确认', 'AUTH_TASK_STALE');
    if (a.routeAuth.expires <= now) throw error('认证任务已过期，线路仍锁定', 'AUTH_TASK_EXPIRED');
    a.routeAuth = { ...a.routeAuth, stage: request.stage, kind: request.kind }; return { ticket: a.routeAuth.ticket, ...status(a, now) };
  }
  function cancel(a, ticket) {
    if (!locked(a)) return { locked: false };
    if (ticket !== a.routeAuth.ticket) throw error('认证任务已改变，未取消', 'AUTH_TASK_STALE');
    delete a.routeAuth; return { locked: false };
  }
  const prefs = value => { if (!MODES.includes(value)) throw error('连接模式无效', 'ROUTE_MODE_INVALID'); return { routeMode: value, routeAuto: value === 'auto', nodeFailover: value === 'node' }; };
  return { MODES, critical, canonical, signature, isNode, mode, locked, canRecover, status, assertChange, begin, finish, stage, cancel, prefs };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RouteState;
