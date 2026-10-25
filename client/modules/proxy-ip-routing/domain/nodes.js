// ---------- 节点库 + ProxyIP 库（所有账号共用，存在宿主的共享存储里）----------
// 节点：粘贴 v2rayN 分享链接 → 自动填好高级编辑器（和 v2rayN 一样的字段）→ 可改、可命名、可测试 → 保存到列表；账号里下拉选择。
// ProxyIP：批量导入（逗号 / 换行分隔），账号里可搜索的下拉框，新填的值自动加入库；同一个节点可配不同 ProxyIP，但两个账号不能用同一个 ProxyIP（留空不限）。
// 默认 ECH：连接前用阿里 DoH 实时查询 cloudflare-ech.com 的 HTTPS 记录（Cloudflare 会轮换密钥，不能写死 Base64）。
// 节点自带 ECH 时沿用节点的；填 none 表示这个节点不用 ECH。
const DEFAULT_ECH = 'cloudflare-ech.com+https://dns.alidns.com/dns-query';
const DEFAULT_STATIC_ECH = DEFAULT_ECH; // 兼容旧名称
const STALE_ECH = new Set([
  'AEX+DQBBrwAgACB3V6T2X69/mCGQn8NhU8fkBpvDcuxha8C+xpuUHFRPGQAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=',
  'AEX+DQBBmQAgACD7Shh1d6qs0wpKexZQye4mLOUQsE3TN9MW0nZe3I37bwAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=',
  'AE3+DQBFTQAgACBlwB13ip+UAr5g/fd8sS7C+M/b8V2y+H6f2I5h9W7e1wAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=',
]);
const needsDefaultEch = n => n && n.security === 'tls' && (!n.ech || STALE_ECH.has(n.ech));
const Nodes = {
  list: [], pips: [], accts: [], loaded: false, ready: null,
  load() {
    return this.ready ||= (async () => {
      try { const l = await Host.shared('nodes'); this.list = Array.isArray(l) ? l.filter(x => x && x.id) : []; let fixed = 0; for (const n of this.list) if (needsDefaultEch(n)) { n.ech = DEFAULT_ECH; fixed++; } if (fixed) Host.shared('nodes', this.list).catch(() => {}); } catch {}
      try { const p = await Host.shared('proxyips'); this.pips = Array.isArray(p) ? p.filter(x => typeof x === 'string') : []; } catch {}
      await this.refreshAccts();
      this.loaded = true; Bus.emit('nodes');
    })();
  },
  async refreshAccts() { try { this.accts = await Host.listAccounts(true) || []; } catch { this.accts = []; } return this.accts; },
  save() { Host.shared('nodes', this.list.map(x => ({ ...x }))).catch(() => {}); Bus.emit('nodes'); },
  savePips() { Host.shared('proxyips', this.pips.slice()).catch(() => {}); Bus.emit('nodes'); },
  get(id) { return id ? this.list.find(x => x.id === id) || null : null; },
  key(n) { try { return n ? Vless.toLink({ ...n, name: '' }) : ''; } catch { return ''; } },
  byLink(link) { const n = Vless.parse(link); if (!n) return null; const k = this.key(n); return this.list.find(x => this.key(x) === k) || null; },
  newId: () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  add(n) { const x = { ...Vless.blank(), ...n, id: this.newId(), at: now() }; if (!x.name) x.name = x.address + ':' + x.port; if (needsDefaultEch(x)) x.ech = DEFAULT_ECH; const k = this.key(x), ex = this.list.find(y => this.key(y) === k); if (ex) return ex; this.list.push(x); this.save(); return x; },
  link(id) { const n = this.get(id); return n ? Vless.toLink(n) : ''; },
  usedBy(n) { const k = this.key(n); return this.accts.filter(a => isVless(a.proxy) && (a.nodeId === n.id || this.key(Vless.parse(a.proxy)) === k)); },
  // ProxyIP
  PIP_RE: Vless.PIP_RE,   // IP / 域名，或链式代理 sstp:// socks5:// http(s):// turn://
  splitPips: t => String(t || '').split(/[\s,，;；|]+/).map(x => x.trim().replace(/^\/?proxyip=/i, '')).filter(Boolean),
  addPips(text) { let n = 0; for (const v of this.splitPips(text)) { if (!this.PIP_RE.test(v) || this.pips.some(x => x.toLowerCase() === v.toLowerCase())) continue; this.pips.push(v); n++; } if (n) this.savePips(); return n; },
  removePip(v) { this.pips = this.pips.filter(x => x !== v); this.savePips(); },
  pipOwner(v, exceptId) { v = String(v || '').trim().toLowerCase(); if (!v) return null; return this.accts.find(a => a.id !== exceptId && String(a.proxyIp || '').trim().toLowerCase() === v) || null; },
  // 节点改了：把用着它的账号一起更新（当前账号会立即按新配置重连）
  async propagate(node, oldKey) {
    await this.refreshAccts(); const link = Vless.toLink(node); let n = 0;
    for (const a of this.accts) {
      if (!isVless(a.proxy)) continue;
      const k = this.key(Vless.parse(a.proxy));
      if (a.nodeId === node.id || k === oldKey) { if (a.proxy === link && a.nodeId === node.id) continue; try { await Host.saveAccount({ id: a.id, proxy: link, proxyIp: a.proxyIp || '', nodeId: node.id }); n++; } catch (e) { toast(a.name + '：' + cleanErr(e), 'err'); } }
    }
    await this.refreshAccts(); return n;
  },
  // 安卓：xray 出站配置由界面生成（和桌面同一份 vless.js）；链接或 vless.js 变了就重新下发
  async syncAndroid() {
    if (Host.platform !== 'android') return;
    const a = (await Host.info().catch(() => null))?.account; if (!a || !isVless(a.proxy)) return;
    let x = ''; try { x = JSON.stringify(Vless.outbound(Vless.parse(a.proxy), a.proxyIp)); } catch { return; }
    if (x !== a.xout) await Host.saveAccount({ id: a.id, proxy: a.proxy, proxyIp: a.proxyIp || '' }).catch(() => {});
  },
};
// ---------- 节点智能导入：vless:// 链接 / 订阅地址（v2rayN base64 或明文列表）/ 直接粘贴的 base64 内容 ----------
const b64txt = s => { try { s = String(s).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))); } catch { return ''; } };
Object.assign(Nodes, {
  subs: [],
  mk(n, sub) {
    const x = { ...Vless.blank(), ...n, id: this.newId(), at: now() };
    if (sub) x.sub = sub;
    if (!x.name) x.name = x.address + ':' + x.port;
    if (needsDefaultEch(x)) x.ech = DEFAULT_ECH;
    return x;
  },
  async loadSubs() { try { const x = await Host.shared('nodesubs'); this.subs = Array.isArray(x) ? x.filter(s => s && s.url) : []; } catch { this.subs = []; } this.subsLoaded = true; return this.subs; },
  saveSubs() { Host.shared('nodesubs', this.subs.map(s => ({ ...s }))).catch(() => {}); Bus.emit('nodes'); },
  // 一段订阅内容 → { nodes: [...vless], other: 非 VLESS 的数量 }
  parseSub(text) {
    let t = String(text || '').trim();
    if (!/:\/\//.test(t)) { const d = b64txt(t); if (/:\/\//.test(d)) t = d; }
    const lines = t.split(/[\r\n]+|\s+/).map(x => x.trim()).filter(Boolean);
    const nodes = []; let other = 0;
    for (const l of lines) { if (/^vless:\/\//i.test(l)) { const n = Vless.parse(l); if (n) nodes.push(n); } else if (/^(vmess|trojan|ss|ssr|hysteria2?|hy2|tuic|socks|wireguard):\/\//i.test(l)) other++; }
    if (!nodes.length && /^\s*proxies\s*:/m.test(t)) {
      const parts = t.split(/- +(?:name|server):/);
      for (const b of parts) {
        if (!/type:\s*vless/i.test(b)) continue;
        const get = k => { const m = new RegExp('(?:^|\\n)\\s*' + k + ':\\s*["\']?([^"\'\\r\\n]+)["\']?', 'i').exec(b); return m ? m[1].trim() : ''; };
        const server = get('server'), port = get('port'), uuid = get('uuid');
        if (server && port && uuid) {
          const sec = /tls:\s*true/i.test(b) ? 'tls' : (get('reality-opts') ? 'reality' : 'none');
          nodes.push({ ...Vless.blank(), name: get('name') || (server + ':' + port), address: server, port: Number(port) || 443, uuid, network: get('network') || 'tcp', security: sec, flow: get('flow') || '', sni: get('servername') || get('sni') || '' });
        }
      }
    }
    const clash = !nodes.length && /^\s*proxies\s*:/m.test(t);
    return { nodes, other, clash };
  },
  // 订阅：经账号线路和直连「同时」去拉，谁先成功用谁（手机没开代理、节点未配好时不再干等超时）
  async fetchSub(url, onStep) {
    if(typeof Host.fetchSubscription==='function'){
      const started=now(),tick=setInterval(()=>onStep?.('获取订阅中… '+Math.round((now()-started)/1000)+' 秒（先直连，失败后自动识别本机代理）'),1000);
      try{
        onStep?.('先尝试直连获取订阅，失败后自动识别本机代理…');
        const r=await Host.fetchSubscription(url);
        if(!r||r.error||typeof r.text!=='string'){
          const details=(r?.attempts||[]).slice(0,4).map(x=>(x.phase==='direct'?'直连':x.proxy?'代理 '+x.proxy:'自动获取')+'：'+x.code).join('；');
          return {error:(r?.error||'订阅获取失败')+(details?'；'+details:''),code:r?.code};
        }
        onStep?.('订阅已获取（'+(r.via||'自动网络')+' · '+((now()-started)/1000).toFixed(1)+' 秒）');return r;
      }catch(error){return {error:'无法获取订阅：'+cleanErr(error)};}finally{clearInterval(tick);}
    }
    const t0 = now(), errs = [], ctls = [];
    const isHtmlDoc = s => /^\s*(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(String(s || ''));
    const countValidLines = s => String(s || '').split(/\r?\n/).filter(l => { const x = l.trim(); return x && !x.startsWith('<') && !x.startsWith('{'); }).length;
    const tag = (p, name) => Promise.resolve(p).then(r => {
      if (!r || r.error || typeof r.text !== 'string' || !r.text.trim()) throw new Error(name + '：' + (r?.error || '无响应'));
      if (isHtmlDoc(r.text)) throw new Error(name + '：返回了网页而非订阅内容');
      return { ...r, via: name, _lines: countValidLines(r.text) };
    }).catch(e => { errs.push(cleanErr(e)); throw e; });
    const pageGet = (u, ms = 10000) => (async () => { const ctl = new AbortController(); ctls.push(ctl); const tm = setTimeout(() => ctl.abort(), ms); if (tm && typeof tm.unref === "function") tm.unref(); try { const x = await fetch(u, { cache: 'no-store', credentials: 'omit', signal: ctl.signal }); if (!x.ok) throw new Error('HTTP ' + x.status); return { text: await x.text() }; } finally { clearTimeout(tm); } })();
    const jobs = [];
    if (Host.fetchText) { jobs.push(tag(Host.fetchText(url), '经当前线路')); jobs.push(tag(Host.fetchText(url, { direct: true }), '直连')); }
    jobs.push(tag(pageGet(url, 10000), '页面网络'));
    const ghM = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i.exec(String(url || '').trim());
    if (ghM) {
      const [, owner, repo, branch, restPath] = ghM;
      const mirrors = [
        [`https://testingcf.jsdelivr.net/gh/${owner}/${repo}@${branch}/${restPath}`, '镜像(cf)'],
        [`https://fastly.jsdelivr.net/gh/${owner}/${repo}@${branch}/${restPath}`, '镜像(fastly)'],
        [`https://gcore.jsdelivr.net/gh/${owner}/${repo}@${branch}/${restPath}`, '镜像(gcore)'],
        [`https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${restPath}`, '镜像(jsdelivr)'],
        [`https://ghfast.top/${url}`, '镜像(ghfast)'],
      ];
      for (const [mu, mName] of mirrors) {
        if (Host.fetchText) jobs.push(tag(Host.fetchText(mu, { direct: true }), mName));
        jobs.push(tag(pageGet(mu, 9000), mName));
      }
    }
    const tick = setInterval(() => onStep?.('获取订阅中… ' + Math.round((now() - t0) / 1000) + ' 秒（经线路 / 直连 / 镜像同时尝试）'), 1000);
    // 兼顾防截断与防卡死：先收到小响应（<40行）时等待最多 1200ms 让完整响应到达；收到大响应（>=40行）后再等 220ms 择优即刻返回，绝不被挂死的直连阻塞 20 秒
    try {
      const good = [];
      await new Promise(resolve => {
        let rem = jobs.length, graceTimer = null, settled = false;
        const finish = () => { if (settled) return; settled = true; if (graceTimer) clearTimeout(graceTimer); resolve(); };
        if (!rem) return finish();
        for (const j of jobs) {
          Promise.resolve(j).then(v => {
            if (v && typeof v.text === 'string' && v.text.trim()) {
              good.push(v);
              const isFull = (v._lines || 0) >= 40 || v.text.length >= 1200;
              const waitMs = isFull ? 220 : 1200;
              if (graceTimer) clearTimeout(graceTimer);
              graceTimer = setTimeout(finish, waitMs);
            }
          }, () => {}).finally(() => {
            if (--rem <= 0) finish();
          });
        }
      });
      if (good.length) {
        good.sort((a, b) => (b._lines || 0) - (a._lines || 0) || b.text.length - a.text.length);
        const r = good[0];
        onStep?.('订阅已获取（' + r.via + ' · ' + good.length + ' 个来源 · ' + ((now() - t0) / 1000).toFixed(1) + ' 秒）');
        return r;
      }
      return { error: '无法获取订阅：' + ([...new Set(errs)].slice(0, 4).join('；') || '全部超时') };
    } catch (e) { return { error: '无法获取订阅：' + cleanErr(e) }; }
    finally { clearInterval(tick); for (const c of ctls) { try { c.abort(); } catch {} } }
  },
  // 导入任意文本：返回 { added: [节点], exist, other, subs: [{url, n, error}], bad }
  async importAny(text, onStep) {
    await this.load(); await this.loadSubs();
    const toks = String(text || '').split(/[\r\n]+|\s+/).map(x => x.trim()).filter(Boolean);
    const out = { added: [], exist: 0, other: 0, subs: [], bad: 0 };
    const put = (n, sub) => { const x = this.mk(n, sub), k = this.key(x), ex = this.list.find(y => this.key(y) === k); if (ex) { out.exist++; if (sub && !ex.sub) ex.sub = sub; return ex; } this.list.push(x); out.added.push(x); return x; };   // 按补完默认 ECH 后的样子判重
    for (const t of toks) {
      if (/^vless:\/\//i.test(t)) { const n = Vless.parse(t); if (n) put(n); else out.bad++; continue; }
      if (/^https?:\/\//i.test(t)) {
        onStep?.('获取订阅：' + new URL(t).origin);
        const r = await this.fetchSub(t, onStep);
        if (r.error) { out.subs.push({ url: t, n: 0, error: r.error }); continue; }
        const p = this.parseSub(r.text); out.other += p.other;
        p.nodes.forEach(n => put(n, t));
        const s = this.subs.find(x => x.url === t) || (this.subs.push({ url: t }), this.subs.at(-1)); Object.assign(s, { at: now(), n: p.nodes.length, error: p.nodes.length ? '' : p.clash ? 'Clash 格式暂不支持，请用 v2rayN / 通用订阅地址' : '没有 VLESS 节点' });
        out.subs.push({ url: t, n: p.nodes.length, error: s.error }); continue;
      }
      if (/^(vmess|trojan|ss|ssr|hysteria2?|hy2|tuic):\/\//i.test(t)) { out.other++; continue; }
      const p = this.parseSub(t); if (p.nodes.length) p.nodes.forEach(n => put(n)); else out.bad++; out.other += p.other;
    }
    this.save(); this.saveSubs();
    return out;
  },
  // 连接面板里的「订阅地址」：换成新的订阅（可多个，空格分隔；也接受 vless:// 链接）→ 旧订阅和它的节点移除
  async setSub(text, onStep) {
    const toks = String(text || '').split(/\s+/).map(x => x.trim()).filter(Boolean);
    if (!toks.length) return { error: '请填写订阅地址' };
    const r = await this.importAny(toks.join('\n'), onStep);
    const urls = toks.filter(u => /^https?:\/\//i.test(u));
    if (urls.length) {
      const ok = r.subs.filter(x => !x.error && x.n);
      if (!ok.length) return { error: r.subs.find(x => x.error)?.error || '订阅里没有 VLESS 节点' };
      const keep = new Set(ok.map(x => x.url));
      this.subs = this.subs.filter(x => keep.has(x.url));
      this.list = this.list.filter(n => !n.sub || keep.has(n.sub));   // 旧订阅的节点全部移除（正在用的也移除，下面把账号换到新节点）
      this.save(); this.saveSubs();
      const mg = await this.migrate([...keep]);
      return { ok: true, n: ok.reduce((t, x) => t + x.n, 0), added: r.added.length, moved: mg.moved };
    }
    if (!r.added.length && !r.exist) return { error: '没有识别到订阅地址或 vless:// 链接' };
    return { ok: true, n: r.added.length + r.exist, added: r.added.length };
  },
  // 订阅更新 / 变更后：账号和全局节点一律换到最新订阅里的节点（不再沿用旧节点 / 旧链接里的旧 ProxyIP）
  // 同名节点 → 同地址端口 → 全局节点 → 第一个；账号的 ProxyIP 失效 / 被拉黑 / 高风险 / 被占用时清空，交给自动重新挑选
  async migrate(subUrls) {
    const subs = new Set(subUrls || this.subs.map(x => x.url));
    const fresh = this.list.filter(n => n.sub && subs.has(n.sub)); if (!fresh.length) return { moved: 0 };
    try { await this.refreshAccts(); } catch {}
    const pick = (old, name) => fresh.find(n => name && n.name === name) || (old && fresh.find(n => n.address === old.address && +n.port === +old.port)) || (typeof Pool !== 'undefined' && fresh.find(n => n.id === Pool.d?.node)) || fresh[0];
    const parse = l => { try { return Vless.parse(l); } catch { return null; } };
    let moved = 0, failed = 0;
    if (typeof Pool !== 'undefined' && Pool.d && Pool.d.node && !this.get(Pool.d.node)) { const n = pick(null, ''); try { await Pool.mutate(d => { d.node = n.id; }); } catch {} }
    for (const a of [...(this.accts || [])]) {
      if (!a || !isVless(a.proxy) || (typeof RouteState !== 'undefined' && RouteState.locked(a))) continue;
      const cur = this.get(a.nodeId);
      if (cur && (Vless.toLink(cur) === a.proxy || this.key(cur) === this.key(parse(a.proxy)))) continue;   // 已经是最新订阅里的节点
      const old = parse(a.proxy), n = cur || pick(old, old?.name || '');
      let pip = String(a.proxyIp || '').trim();
      if (pip && typeof Pool !== 'undefined') { const e = Pool.d?.ips?.[pip]; if (!e || e.gone || Pool.banned(pip) || (typeof IPRep !== 'undefined' && (IPRep.risky(pip, e) || (IPRep.pure && !IPRep.pure(pip, e)))) || Pool.owner(pip, a.id)) pip = ''; }
      if (!pip && typeof Pool !== 'undefined' && !/\/video\//i.test(n?.path || '')) {
        const altPip = (a.region && Pool.avail?.(a.region, a.id)?.[0]) || Pool.availAllPureLowestLatency?.(a.id)?.[0] || '';
        if (altPip) pip = altPip;
      }
      const nextReg = a.region || (pip && typeof Pool !== 'undefined' && Pool.d?.ips?.[pip]?.loc !== '?' ? Pool.d?.ips?.[pip]?.loc : '') || '';
      try { await Host.saveAccount({ id: a.id, proxy: Vless.toLink(n), nodeId: n.id, region: nextReg, proxyIp: pip }); moved++; } catch { failed++; }
    }
    try { await this.refreshAccts(); } catch {}
    try { if (typeof NodeRoutes !== 'undefined') NodeRoutes.cache?.clear?.(); } catch {}
    try { if (typeof NodeSpeed !== 'undefined') NodeSpeed.clear?.(); } catch {}
    try { UI.host = await Host.info(); UI.renderAcct?.(); } catch {}
    Bus.emit('pool'); return { moved, failed };
  },
  // 刷新所有订阅：新节点加入；订阅里已经没有的节点删掉（正在用的也删，账号随后换到最新订阅的节点）
  async refreshSubs() {
    await this.load(); await this.loadSubs(); let add = 0, rm = 0; const okSubs = [];
    for (const s of this.subs) {
      const r = await this.fetchSub(s.url); if (r.error) { s.error = r.error; continue; }
      const p = this.parseSub(r.text); if (!p.nodes.length) { s.error = '没有 VLESS 节点'; continue; }
      // 按「加入节点库后的样子」比较（mk 会补默认 ECH）：以前拿原始订阅节点比，新节点刚加入就被当成「订阅里没有」删掉，账号只能留在旧节点上
      const fresh = p.nodes.map(n => this.mk(n, s.url)), keys = new Set(fresh.map(n => this.key(n)));
      for (const n of fresh) { const k = this.key(n); if (!this.list.some(x => this.key(x) === k)) { this.list.push(n); add++; } }
      const before = this.list.length; this.list = this.list.filter(x => x.sub !== s.url || keys.has(this.key(x))); okSubs.push(s.url); rm += before - this.list.length;
      Object.assign(s, { at: now(), n: p.nodes.length, error: '' });
    }
    this.save(); this.saveSubs();
    const mg = okSubs.length ? await this.migrate(okSubs) : { moved: 0 };
    return { add, rm, moved: mg.moved };
  },
});

// 导入节点对话框：粘贴订阅地址或 vless:// 链接（可多行）→ 自动加入节点库 → 没有全局节点时自动挑一个能用的
const NodeImport = {
  open(onDone) {
    const ta = h('textarea', { class: 'nm-imp', rows: 4, spellcheck: false, placeholder: '粘贴订阅地址或 vless:// 链接，一行一个\n例：https://example.com/sub?token=…\nvless://uuid@host:443?…#名称' });
    const msg = h('div', { class: 'lmsg' });
    const go = h('button', { class: 'btn' }, icon('download'), '导入');
    const back = modal('导入节点', K(h('p', { class: 'muted' }, '自动识别：订阅地址（v2rayN / 通用 base64 订阅）、vless:// 链接、直接粘贴的订阅内容都可以。导入后加入节点库，订阅会定期自动更新；节点不通时自动切换到下一个能用的。'), ta, msg),
      K(h('button', { class: 'btn ghost', onclick: () => back.remove() }, '取消'), go), 'small');
    go.onclick = async () => {
      const t = ta.value.trim(); if (!t) { ta.focus(); return; }
      go.disabled = true; back.dataset.busy = '1'; msg.className = 'lmsg'; msg.textContent = '导入中…';
      try {
        const r = await Nodes.importAny(t, s => { msg.textContent = s; });
        const se = r.subs.filter(s => s.error);
        const txt = '新增 ' + r.added.length + ' 个节点' + (r.exist ? '，' + r.exist + ' 个已存在' : '') + (r.other ? '，跳过 ' + r.other + ' 个非 VLESS 节点' : '') + (se.length ? '；订阅失败：' + se.map(s => s.error).join('、') : '');
        if (!r.added.length && !r.exist) { msg.textContent = txt; msg.className = 'lmsg bad'; return; }
        msg.textContent = txt; msg.className = 'lmsg ok';
        if (typeof Pool !== 'undefined') { await Pool.load(true); if (!Pool.node()) { msg.textContent = txt + '；正在自动挑选能用的节点…'; const a = await Pool.autoNode(r.added.length ? r.added : Nodes.list); msg.textContent = txt + (a.ok ? '；已自动选用 ' + (a.node.name || a.node.address) : '；没有测到能用的节点，请在列表里手动选'); } }
        toast(msg.textContent); setTimeout(() => { back.remove(); onDone?.(r); }, 900);
      } catch (e) { msg.textContent = cleanErr(e); msg.className = 'lmsg bad'; }
      finally { go.disabled = false; delete back.dataset.busy; }
    };
    setTimeout(() => ta.focus(), 30);
  },
};

// 安卓宿主：保存 / 测试节点账号时附上 xray 出站配置
if (Host.platform === 'android') {
  const xo = a => { if (!a || !isVless(a.proxy)) return { ...a, xout: '' }; const n = Vless.parse(a.proxy); return { ...a, xout: JSON.stringify(Vless.outbound(n, a.proxyIp)) }; };
  const save0 = Host.saveAccount, test0 = Host.testIp;
  Host.saveAccount = async a => { const r = await save0(xo(a)); if (r && r.error && !r.id) throw new Error(r.error); return r; };
  Host.testIp = async a => { let b; try { b = xo(a); } catch (e) { return { error: e.message }; } return test0(b); };
}

// ---------- 节点高级编辑器（字段和 v2rayN 一致）----------
const NodeEditor = {
  open(node, onSave) {
    const orig = node ? { ...node } : null, oldKey = node ? Nodes.key(node) : '';
    let n = { ...Vless.blank(), ...(node || {}) };
    const F = {}, rows = {};
    const inp = (k, ph, type = 'text') => { const e = h('input', { type, value: n[k] ?? '', placeholder: ph || '', spellcheck: false, oninput: () => { n[k] = type === 'number' ? +e.value : e.value; upd(); } }); F[k] = e; return e; };
    const sel = (k, opts) => { const e = h('select', { onchange: () => { n[k] = e.value === 'true' ? true : e.value === 'false' ? false : e.value; vis(); upd(); } }, ...opts.map(o => Array.isArray(o) ? h('option', { value: o[0] }, o[1]) : h('option', { value: o }, o || '（空）'))); e.value = String(n[k] ?? ''); F[k] = e; return e; };
    const ta = (k, ph) => { const e = h('textarea', { rows: 3, placeholder: ph || '', spellcheck: false, oninput: () => { n[k] = e.value; upd(); } }); e.value = n[k] || ''; F[k] = e; return e; };
    const fld = (k, label, ctl, tip) => { const r = h('label', { class: 'ne-f' + (ctl.tagName === 'TEXTAREA' ? ' w2' : '') }, h('span', { class: 'ne-l' }, label, tip ? tipI(tip) : null), ctl); rows[k] = r; return r; };
    const refill = () => { for (const [k, e] of Object.entries(F)) { if (e.type === 'checkbox') e.checked = !!n[k]; else e.value = String(n[k] ?? ''); } vis(); upd(); };
    const paste = h('textarea', { class: 'ne-paste', rows: 2, placeholder: '粘贴 vless:// 分享链接，自动填写下面所有字段', spellcheck: false, oninput: () => { const p = Vless.parse(paste.value.trim()); if (p) { n = { ...Vless.blank(), ...p, id: n.id, name: p.name || n.name }; refill(); paste.classList.remove('bad'); toast('已从链接填写'); } else paste.classList.toggle('bad', !!paste.value.trim()); } });
    const mux = h('input', { type: 'checkbox', checked: n.mux || null, onchange: () => { n.mux = mux.checked; upd(); } }); F.mux = mux;
    const body = h('div', { class: 'ne' },
      h('div', { class: 'ne-sec' }, paste),
      h('div', { class: 'ne-h' }, '基本'),
      h('div', { class: 'ne-g' },
        fld('name', '别名', inp('name', '例 🇰🇷 首尔')), fld('address', '地址', inp('address', 'example.com / 1.2.3.4')), fld('port', '端口', inp('port', '443', 'number')),
        fld('uuid', '用户 ID', inp('uuid', 'UUID')), fld('flow', '流控', sel('flow', [['', '（空）'], 'xtls-rprx-vision', 'xtls-rprx-vision-udp443'])), fld('encryption', '加密', inp('encryption', 'none'))),
      h('div', { class: 'ne-h' }, '传输'),
      h('div', { class: 'ne-g' },
        fld('network', '传输协议', sel('network', Vless.NETS.map(x => [x, x === 'tcp' ? 'raw (tcp)' : x]))),
        fld('headerType', '伪装类型', sel('headerType', ['none', 'http', 'srtp', 'utp', 'wechat-video', 'dtls', 'wireguard'])),
        fld('host', '伪装域名 (host)', inp('host', '多个用逗号分隔')), fld('path', '路径 (path)', inp('path', '/'), 'ws / httpupgrade / xhttp 的路径。edgetunnel 节点的 /proxyip=… 也在这里；账号里填的 ProxyIP 会替换它。'),
        fld('mode', 'xhttp 模式', sel('mode', ['', ...Vless.XMODES])),
        fld('serviceName', 'gRPC serviceName', inp('serviceName', '')), fld('authority', 'gRPC authority', inp('authority', '')), fld('seed', 'mKCP seed', inp('seed', '')),
        fld('extra', 'xhttp Extra（JSON）', ta('extra', '{"xPaddingBytes":"100-1000", …}'), 'XHTTP 的高级参数（xPadding、xmux、下行分离等），原样放进 xhttpSettings.extra。分享链接里的 extra= 会自动填到这里。')),
      h('div', { class: 'ne-h' }, '传输层安全'),
      h('div', { class: 'ne-g' },
        fld('security', 'TLS', sel('security', ['none', 'tls', 'reality'])), fld('sni', 'SNI', inp('sni', '留空 = 伪装域名')), fld('fp', 'Fingerprint', sel('fp', ['', ...Vless.FPS])),
        fld('alpn', 'Alpn', sel('alpn', ['', 'h3', 'h2', 'http/1.1', 'h3,h2', 'h2,http/1.1', 'h3,h2,http/1.1'])), fld('allowInsecure', '跳过证书验证', sel('allowInsecure', [['false', 'false'], ['true', 'true']])),
        fld('ech', 'EchConfigList', inp('ech', '默认：cloudflare-ech.com+https://dns.alidns.com/dns-query'), 'ECH（加密 Client Hello）：留空自动使用 cloudflare-ech.com + 阿里 DoH，每次连接前实时获取最新配置；也可填静态 Base64、「域名+DoH 地址」，填 none 表示不用 ECH。'),
        fld('pcs', '证书指纹固定 (SHA256)', inp('pcs', '')), fld('vcn', '按名称校验证书', inp('vcn', '')),
        fld('pbk', 'PublicKey', inp('pbk', '')), fld('sid', 'ShortId', inp('sid', '')), fld('spx', 'SpiderX', inp('spx', '')), fld('pqv', 'Mldsa65Verify', inp('pqv', ''))),
      h('div', { class: 'ne-h' }, '其它'),
      h('div', { class: 'ne-g' },
        h('label', { class: 'ne-f chk' }, mux, h('span', {}, '启用 Mux 多路复用'), inp('muxConc', '8', 'number')),
        fld('fm', 'Finalmask（JSON）', ta('fm', ''))));
    const res = h('span', { class: 'ne-res dim' });
    const linkBtn = h('button', { class: 'btn ghost', onclick: () => { const e = Vless.validate(n); if (e) { toast(e, 'err'); return; } copyText(Vless.toLink(n)); } }, icon('copy'), '复制链接');
    const testBtn = h('button', { class: 'btn ghost', onclick: async () => {
      const e = Vless.validate(n); if (e) { res.textContent = e; res.className = 'ne-res bad'; return; }
      res.className = 'ne-res dim'; res.replaceChildren(h('i', { class: 'spin' }), '测试中…'); testBtn.disabled = true; const t0 = now();
      const r = await Host.testIp({ proxy: Vless.toLink(n), proxyIp: '' }).catch(err => ({ error: cleanErr(err) }));
      testBtn.disabled = false;
      if (r?.ip) { res.textContent = '✓ 出口 ' + r.ip + (r.loc ? ' · ' + ccF(r.loc) : '') + ' · ' + ((now() - t0) / 1000).toFixed(1) + 's'; res.className = 'ne-res ok'; }
      else { res.textContent = '✗ ' + (r?.error || (r === null ? '此平台不支持单独测试' : '连接失败')); res.className = 'ne-res bad'; }
    } }, '测试连接');
    const saveBtn = h('button', { class: 'btn', onclick: async () => {
      const e = Vless.validate(n); if (e) { toast(e, 'err'); return; }
      if (!n.name) n.name = n.address + ':' + n.port;
      let x;
      if (orig) { x = Nodes.get(orig.id); if (x) Object.assign(x, n, { id: orig.id, at: now() }); else { x = { ...n, id: orig.id, at: now() }; Nodes.list.push(x); } Nodes.save(); }
      else { const k = Nodes.key(n), dup = Nodes.list.find(y => Nodes.key(y) === k); if (dup) { Object.assign(dup, { name: n.name }); Nodes.save(); x = dup; toast('节点库里已有同样的节点，已更新名称'); } else x = Nodes.add(n); }
      back.remove();
      if (orig && oldKey !== Nodes.key(x)) { const c = await Nodes.propagate(x, oldKey); if (c) toast('已同步更新 ' + c + ' 个使用这个节点的账号'); }
      onSave?.(x);
    } }, '保存');
    const back = modal(orig ? '编辑节点' : '添加节点', body, K(linkBtn, testBtn, res, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => back.remove() }, '取消'), saveBtn), 'wide nedit');
    function vis() {
      const net = n.network, sec = n.security, show = (k, v) => { if (rows[k]) rows[k].hidden = !v; };
      show('headerType', net === 'tcp' || net === 'kcp'); show('host', /^(tcp|ws|httpupgrade|xhttp)$/.test(net)); show('path', /^(ws|httpupgrade|xhttp)$/.test(net) || (net === 'tcp' && n.headerType === 'http'));
      show('mode', net === 'xhttp'); show('extra', net === 'xhttp'); show('serviceName', net === 'grpc'); show('authority', net === 'grpc'); show('seed', net === 'kcp');
      for (const k of ['sni', 'fp', 'alpn', 'allowInsecure']) show(k, sec !== 'none');
      for (const k of ['ech', 'pcs', 'vcn']) show(k, sec === 'tls');
      for (const k of ['pbk', 'sid', 'spx', 'pqv']) show(k, sec === 'reality');
      F.muxConc.disabled = !n.mux;
    }
    function upd() {
      for (const k of ['extra', 'fm']) { let bad = false; const v = String(n[k] || '').trim(); if (v) try { JSON.parse(v); } catch { bad = true; } F[k]?.classList.toggle('bad', bad); }
      saveBtn.disabled = !!Vless.validate(n);
    }
    vis(); upd();
    if (!orig) setTimeout(() => paste.focus(), 50);
    return back;
  },
};

// ---------- 节点库管理（ProxyIP 在「代理设置」里）----------
const NodeMgr = {
  async open(onClose) {
    await Nodes.load(); await Nodes.refreshAccts();
    const list = h('div', { class: 'nm-list' });
    const res = new Map();
    function renderNodes() {
      if (!Nodes.list.length) { list.replaceChildren(h('p', { class: 'note' }, '还没有节点。点「导入」粘贴订阅地址或 vless:// 链接。')); return; }
      const acctParsed = Nodes.accts.filter(a => isVless(a.proxy)).map(a => ({ a, key: Nodes.key(Vless.parse(a.proxy)) }));
      list.replaceChildren(...Nodes.list.map(n => {
        const nk = Nodes.key(n), used = acctParsed.filter(x => x.a.nodeId === n.id || x.key === nk).map(x => x.a);
        const r = res.get(n.id);
        const st = h('span', { class: 'nm-st ' + (r?.ok ? 'ok' : r?.bad ? 'bad' : 'dim') }, r?.text || '');
        const paintSt = rv => { st.className = 'nm-st ' + (rv?.ok ? 'ok' : rv?.bad ? 'bad' : 'dim'); st.textContent = rv?.text || ''; };
        return h('div', { class: 'nm-row' },
          h('div', { class: 'nm-main' }, h('b', {}, n.name || n.address), h('span', { class: 'dim' }, n.address + ':' + n.port + ' · ' + n.network + (n.security !== 'none' ? '+' + n.security : '') + (n.ech ? ' · ECH' : '') + (Vless.proxyIpOf(n.path) ? ' · proxyip=' + Vless.proxyIpOf(n.path) : '')),
            h('span', { class: 'nm-used dim' }, used.length ? used.length + ' 个账号在用：' + used.map(a => emailUser(a)).join('、') : '没有账号在用'), st),
          h('div', { class: 'nm-act' },
            h('button', { class: 'btn ghost xs', onclick: async () => { const w = { text: '测试中…' }; res.set(n.id, w); paintSt(w); const t0 = now(); const x = await Host.testIp({ proxy: Vless.toLink(n), proxyIp: '' }).catch(e => ({ error: cleanErr(e) })); const fin = x?.ip ? { ok: 1, text: '✓ ' + x.ip + (x.loc ? ' ' + x.loc : '') + ' · ' + ((now() - t0) / 1000).toFixed(1) + 's' } : { bad: 1, text: '✗ ' + (x?.error || '失败') }; res.set(n.id, fin); paintSt(fin); } }, '测试'),
            h('button', { class: 'btn ghost xs', onclick: () => NodeEditor.open(n, () => renderNodes()) }, '编辑'),
            h('button', { class: 'btn ghost xs', title: '复制分享链接', onclick: () => copyText(Vless.toLink(n)) }, icon('copy')),
            h('button', { class: 'btn ghost xs danger', onclick: async () => { if (!await Dialog.confirm({ title: '删除节点', text: '删除「' + (n.name || n.address) + '」？' + (used.length ? '\n正在使用它的账号会保留当前配置，但以后不再同步。' : ''), ok: '删除', danger: true })) return; Nodes.list = Nodes.list.filter(x => x !== n); Nodes.save(); renderNodes(); } }, '删除')));
      }));
    }
    renderNodes();
    const body = h('div', { class: 'nm' },
      h('div', { class: 'nm-h' }, h('b', {}, '节点'), h('span', { class: 'dim' }, Nodes.list.length + ' 个'), tipI('在「代理设置」里选一个节点作为全局节点，所有按地区的账号共用它。编辑节点后，使用它的账号会自动同步。安卓和桌面都用内置 xray 内核连接，不需要另开 Clash。'), h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost sm', title: '为无 ECH 的 TLS 节点统一设置默认 ECH', onclick: () => {
          let changed = 0;
          for (const n of Nodes.list) {
            if (n.security === 'tls' && (!n.ech || n.ech === 'none' || STALE_ECH.has(n.ech))) {
              n.ech = DEFAULT_ECH;
              changed++;
            }
          }
          if (changed > 0) {
            Nodes.save();
            renderNodes();
            toast('已为 ' + changed + ' 个 TLS 节点统一设置默认 ECH');
          } else {
            toast('所有 TLS 节点已有 ECH 配置');
          }
        } }, '统一 ECH'),
        h('button', { class: 'ib', title: '刷新订阅', onclick: async () => { toast('正在刷新订阅…'); const r = await Nodes.refreshSubs(); toast('订阅已刷新：新增 ' + r.add + '，移除 ' + r.rm); renderNodes(); } }, icon('refresh')),
        h('button', { class: 'ib', title: '手动添加 / 编辑一个节点', onclick: () => NodeEditor.open(null, () => renderNodes()) }, icon('pen')),
        h('button', { class: 'btn sm', onclick: () => NodeImport.open(() => renderNodes()) }, icon('plus'), '导入（订阅 / vless）')),
      list);
    const back = modal('节点库', body, K(h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => back.remove() }, '完成')), 'wide nmgr');
    const off = () => { if (!back.isConnected) { onClose?.(); return; } setTimeout(off, 500); }; setTimeout(off, 500);
  },
};
