// 节点延迟（Clash url-test 式）：所有节点并发经 xray 访问 generate_204，只看连通 + 延迟。
// 结果按节点链接（去掉名字）存在 Host.shared('nodedelay')，各窗口共享；启动时过期才测，之后每 5 分钟后台复测，复测期间保留旧结果。
const NodeSpeed = (() => {
  const URL = 'https://www.gstatic.com/generate_204', TTL = 5 * 60e3, TMO = 5000, BG = 30 * 60e3;   // 后台整批复测：30 分钟一次（以前 5 分钟，每次经每个节点各握手一遍）
  let res = {}, at = 0, loaded = null, job = null;
  const testing = new Set(), probing = new Set();   /* probing = 单节点连测中 */
  const linkOf = n => { try { return typeof n === 'string' ? n : Vless.toLink(n); } catch { return ''; } };
  const key = n => { try { const p = typeof n === 'string' ? Vless.parse(n) : n; return p ? Nodes.key(p) : ''; } catch { return ''; } };
  function load(force) {
    if (!loaded || force) loaded = (async () => { try { const x = await Host.shared('nodedelay'); if (x && x.res && typeof x.res === 'object') { res = { ...x.res, ...Object.fromEntries(Object.entries(res).filter(([k, v]) => (v.at || 0) > (x.res[k]?.at || 0))) }; at = Math.max(at, x.at || 0); } } catch {} })();
    return loaded;
  }
  function save() {
    const keep = new Set(Nodes.list.map(key));
    for (const k of Object.keys(res)) if (!keep.has(k) && Date.now() - (res[k].at || 0) > 24 * 3600e3) delete res[k];
    Host.shared('nodedelay', { at, res }).catch(() => {});
  }
  const get = n => res[key(n)] || null;
  const busy = n => testing.has(key(n));
  const fresh = n => { const r = get(n); return !!r && Date.now() - (r.at || 0) < TTL; };
  // 排序：通的按延迟升序 → 未测 → 不通
  const score = n => { const r = get(n); return r?.ok ? r.ms : r ? 1e9 : 1e8; };
  const sort = list => list.slice().sort((a, b) => score(a) - score(b) || String(a.name || '').localeCompare(String(b.name || '')));
  const best = list => { const s = sort(list || Nodes.list)[0]; return s && get(s)?.ok ? s : null; };
  function badge(n) {
    if (probing.has(key(n))) return { cls: 'd-wait', text: '测速中', title: '单独连测 3 次…' };
    if (busy(n) && !get(n)) return { cls: 'd-wait', text: '测速中' };
    const r = get(n);
    if (!r) return { cls: 'd-wait', text: '未测' };
    if (!r.ok) return { cls: 'd-fail', text: /超时|timeout|abort/i.test(r.err || '') ? '超时' : '不通', title: r.err || '' };
    return { cls: r.ms < 300 ? 'd-good' : r.ms < 800 ? 'd-mid' : 'd-bad', text: r.ms + ' ms', title: r.runs?.length > 1 ? `单独连测 ${r.runs.length + (r.fails || 0)} 次：${r.runs.join(' / ')} ms${r.fails ? '，失败 ' + r.fails + ' 次' : ''}（取中位数）` : '' };
  }
  // list：节点对象或 vless 链接；force：忽略 5 分钟缓存
  async function test(list, { force = false, timeout = TMO } = {}) {
    if (!Host.urlTest) return { error: '此平台不支持测速' };
    await load();
    const todo = [];
    for (const n of (list || Nodes.list)) { const k = key(n), link = linkOf(n); if (!k || !link || testing.has(k) || todo.some(x => x.k === k)) continue; if (!force && fresh(n)) continue; todo.push({ k, link }); }
    if (!todo.length) return job || { done: 0 };
    todo.forEach(x => testing.add(x.k)); Bus.emit('nodespeed');
    const CH = Host.platform === 'android' ? 32 : 16, chunks = [];
    for (let i = 0; i < todo.length; i += CH) chunks.push(todo.slice(i, i + CH));
    const run = async part => {
      let r; try { r = await Host.urlTest({ items: part.map(x => ({ link: x.link })), url: URL, timeout }); } catch (e) { r = { error: String(e?.message || e) }; }
      part.forEach((x, j) => { const y = Array.isArray(r) ? r[j] : null; res[x.k] = { at: Date.now(), ok: !!y?.ok, ms: y?.ok ? Math.max(1, Math.round(y.ms || 0)) : 0, err: y?.ok ? '' : String(y?.error || r?.error || '失败').slice(0, 120) }; testing.delete(x.k); });
      Bus.emit('nodespeed');
    };
    const p = Promise.all(chunks.map(run)).then(() => { at = Date.now(); save(); return { done: todo.length }; }, e => { todo.forEach(x => testing.delete(x.k)); Bus.emit('nodespeed'); return { error: String(e?.message || e) }; });
    job = p; p.finally(() => { if (job === p) job = null; });
    return p;
  }
  // 单个节点连测几次取中位数：一次测速包含 xray 冷启动 / 握手，偶尔偏高或偶然失败，批量测速时更明显；这里一次只测这一个节点，连测 rounds 次，
  // 有成功的就取成功次数的中位数（偶然失败不算不通），全部失败才算不通。结果写进同一份共享结果，列表、自动选路都用它。
  async function testOne(n, { rounds = 3, timeout = TMO } = {}) {
    if (!Host.urlTest) return { error: '此平台不支持测速' };
    await load();
    const k = key(n), link = linkOf(n); if (!k || !link || probing.has(k)) return null;
    probing.add(k); Bus.emit('nodespeed');
    try {
      const ms = [], errs = [];
      for (let i = 0; i < rounds; i++) {
        let r; try { r = await Host.urlTest({ items: [{ link }], url: URL, timeout }); } catch (e) { r = { error: String(e?.message || e) }; }
        const y = Array.isArray(r) ? r[0] : null;
        if (y?.ok) ms.push(Math.max(1, Math.round(y.ms || 0))); else errs.push(String(y?.error || r?.error || '失败').slice(0, 120));
      }
      const s = ms.slice().sort((a, b) => a - b), mid = s.length ? (s.length % 2 ? s[s.length >> 1] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)) : 0;
      res[k] = { at: Date.now(), ok: s.length > 0, ms: mid, err: s.length ? '' : errs[0] || '失败', runs: ms, fails: errs.length };
      at = Math.max(at, Date.now()); save();
      return res[k];
    } finally { probing.delete(k); Bus.emit('nodespeed'); }
  }
  // 后台：启动 3 秒后（结果过期才测），之后窗口可见时每 30 分钟复测全部节点
  function start() {
    if (start.on || !Host.urlTest) return; start.on = true;
    const tick = async () => { try { await Nodes.load(); await load(true); if (!Nodes.list.length || document.hidden) return; if (Date.now() - at >= BG) await test(Nodes.list, { force: true }); else await test(Nodes.list.filter(n => !get(n))); } catch {} };
    setTimeout(tick, 3000); setInterval(tick, 60e3);
    Bus.on('nodes', () => { setTimeout(() => void test(Nodes.list.filter(n => !get(n))), 500); });
  }
  return { URL, TTL, load, get, busy, fresh, sort, best, badge, test, testOne, start, key, get at() { return at; }, get testing() { return testing.size + probing.size; }, probingNow: n => probing.has(key(n)) };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NodeSpeed;
else if (typeof Host !== 'undefined' && Host.urlTest) NodeSpeed.start();
