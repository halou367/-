// Regional outbound endpoint pool, DoH resolution, and automated route failover manager
const REGION_NAME = (() => { let dn = null; try { dn = new Intl.DisplayNames(['zh-CN'], { type: 'region' }); } catch {} return cc => { if (!cc) return '未知'; try { return (dn && dn.of(cc)) || cc; } catch { return cc; } }; })();
const regionLabel = cc => cc ? ccF(cc) + ' ' + REGION_NAME(cc) : '未知地区';

// 默认 ProxyIP 域名与 EdgeTunnel 反代库（cmliu 维护，每 3 小时更新；fxxk.dedyn.io 镜像；NiREvil 每日全球扫描库；第三方：威廉、Mia）
const DEFAULT_PIP_CC = ['HK', 'SG', 'JP', 'KR', 'TW', 'IN', 'GB', 'FR', 'DE', 'NL', 'SE', 'FI', 'PL', 'RU', 'CH', 'LV', 'US', 'CA', 'AU', 'BR', 'TR', 'IT', 'ES', 'AT', 'IE'];
const EDGETUNNEL_COLO_SRC = [
  'hkg.proxyip.cmliussss.net', 'sin.proxyip.cmliussss.net', 'nrt.proxyip.cmliussss.net', 'kix.proxyip.cmliussss.net',
  'icn.proxyip.cmliussss.net', 'tpe.proxyip.cmliussss.net', 'lax.proxyip.cmliussss.net', 'sjc.proxyip.cmliussss.net',
  'sea.proxyip.cmliussss.net', 'ord.proxyip.cmliussss.net', 'iad.proxyip.cmliussss.net', 'ewr.proxyip.cmliussss.net',
  'fra.proxyip.cmliussss.net', 'ams.proxyip.cmliussss.net', 'lhr.proxyip.cmliussss.net', 'cdg.proxyip.cmliussss.net',
  'syd.proxyip.cmliussss.net', 'yyz.proxyip.cmliussss.net',
];
const EDGETUNNEL_ASN_SRC = [
  'proxyip.oracle.cmliussss.net', 'proxyip.digitalocean.cmliussss.net', 'proxyip.vultr.cmliussss.net',
  'proxyip.linode.cmliussss.net', 'proxyip.multacom.cmliussss.net', 'proxyip.aliyun.cmliussss.net',
  'proxyip.oracle.fxxk.dedyn.io', 'proxyip.digitalocean.fxxk.dedyn.io', 'proxyip.vultr.fxxk.dedyn.io',
  'proxyip.aliyun.fxxk.dedyn.io', 'proxyip.aliyun.hw.090227.xyz', 'proxyip.digitalocean.hw.090227.xyz',
  'edtproxyip.lzj.pp.ua', 'bestproxy.onecf.eu.org', 'ipdb.rr.nu', 'di.nscl.ir',
  'bpb.yousef.isegaro.com', 'proxy.zjcloud.us.ci', 'pyip.ygkkk.dpdns.org', 'cdn.xn--b6gac.eu.org', 'cdn-all.xn--b6gac.eu.org',
];
const EDGETUNNEL_MIRROR_SRC = ['us', 'sg', 'jp', 'hk', 'kr', 'tw', 'de', 'nl', 'gb', 'fr'].map(cc => 'proxyip.' + cc + '.fxxk.dedyn.io');
const EDGETUNNEL_API_SRC = [
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/02_proxies.csv',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/ProxyIP-Daily.md',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/US.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/JP.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/SG.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/HK.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/KR.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/TW.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/DE.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/GB.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/NL.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/FR.txt',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/CA.txt',
];
const EDGETUNNEL_ALL_SRC = [
  'proxyip.cmliussss.net',
  ...DEFAULT_PIP_CC.map(cc => 'proxyip.' + cc.toLowerCase() + '.cmliussss.net'),
  ...EDGETUNNEL_COLO_SRC,
  ...EDGETUNNEL_MIRROR_SRC,
  ...EDGETUNNEL_ASN_SRC,
  ...EDGETUNNEL_API_SRC,
  'kr.william.us.ci', 'tw.william.us.ci', 'proxy.mia.xx.kg',
];
const DEFAULT_PIP_SRC = ['proxyip.cmliussss.net', ...DEFAULT_PIP_CC.map(cc => 'proxyip.' + cc.toLowerCase() + '.cmliussss.net'), 'kr.william.us.ci', 'tw.william.us.ci', 'proxy.mia.xx.kg'];
const DEFAULT_PIP_V = 1;

const Pool = {
  fromSrc(e, line) {
    if (!e || !line) return false;
    return e.src === line || (Array.isArray(e.srcs) && e.srcs.includes(line));
  },
  isCfOfficialIp(k) {
    const host = String(k || '').trim().replace(/^\[|\]$/g, '').split(':')[0];
    const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if (!m) return false;
    const a = +m[1], b = +m[2], c = +m[3];
    return (a === 104 && b >= 16 && b <= 31) || (a === 172 && b >= 64 && b <= 71) || (a === 162 && (b === 158 || b === 159)) || (a === 108 && b === 162 && c >= 192) || (a === 198 && b === 41 && c >= 128) || (a === 141 && b === 101 && c >= 64 && c <= 127) || (a === 188 && b === 114 && c >= 96 && c <= 111);
  },
  COLO_CC: { hkg: 'HK', sin: 'SG', nrt: 'JP', kix: 'JP', fuk: 'JP', icn: 'KR', tpe: 'TW', khh: 'TW', lax: 'US', sjc: 'US', sea: 'US', ord: 'US', iad: 'US', ewr: 'US', dfw: 'US', mia: 'US', atl: 'US', den: 'US', phx: 'US', pdx: 'US', bos: 'US', yyz: 'CA', yvr: 'CA', yul: 'CA', lhr: 'GB', man: 'GB', cdg: 'FR', mrs: 'FR', fra: 'DE', muc: 'DE', dus: 'DE', ber: 'DE', ams: 'NL', arn: 'SE', hel: 'FI', waw: 'PL', dme: 'RU', led: 'RU', zrh: 'CH', rix: 'LV', bom: 'IN', del: 'IN', maa: 'IN', syd: 'AU', mel: 'AU', gru: 'BR', ist: 'TR', mxp: 'IT', fco: 'IT', mad: 'ES', vie: 'AT', dub: 'IE' },
  edgeTunnelCountryFeed(cc) {
    const c = String(cc || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(c) ? `https://raw.githubusercontent.com/NiREvil/vless/main/sub/country_proxies/${c}.txt` : '';
  },
  switching: new Set(),
  d: null, dns: new Map(), job: null, prog: null, chain: Promise.resolve(),
  blank: () => ({ v: 1, node: '', cool: 30, auto: true, src: [], ips: {} }),
  // 默认域名：新装直接带上；老用户升级后补上缺的（只补一次，之后自己删掉的不会再加回来）→ 后台解析，有节点就顺便检测新 IP
  untestedKeys() {
    return this.entries().filter(([k, e]) => e && !e.gone && !this.banned(k) && e.ok == null).map(([k]) => k);
  },
  // 按需懒检测（保护 EdgeTunnel 每日 10 万次请求配额）：
  // 当前账号所在地区已有 ≥ 4 个纯净可用 IP（或未限定地区时全池已有 ≥ 8 个纯净可用 IP）时，绝不在后台盲目全量扫描上千个待测 IP；
  // 仅当在用地区纯净余量不足（< 4）且跨窗口冷却已过时，才按需小批量（最多 12 个）补充检测。
  lazyPendingKeys(max = 12) {
    const a = typeof UI !== 'undefined' ? UI?.host?.account : null;
    const cc = String(a?.region || '').trim().toUpperCase();
    if (cc) {
      if (this.avail(cc, a?.id).length >= 4) return [];
      const regUntested = this.regionCandidates(cc).filter(([, e]) => e && e.ok == null).map(([k]) => k);
      if (regUntested.length) return regUntested.slice(0, max);
    }
    const totalPure = this.entries().filter(([k, e]) => e && e.ok === true && !e.gone && !this.banned(k) && this.state(k, e, a?.id) === 'ok').length;
    if (totalPure >= 8) return [];
    return this.untestedKeys().slice(0, max);
  },
  isFixtureEnv() {
    if (typeof window !== 'undefined' && (window.__routeFixture || window.__fixture)) return true;
    const p = String((typeof UI !== 'undefined' && UI?.host?.account?.proxy) || '').trim();
    const em = String((typeof UI !== 'undefined' && (UI?.host?.account?.email || UI?.me?.email)) || '').trim();
    return /^(?:https?:\/\/|socks5:\/\/)?127\.0\.0\.1:(?:1|9|10)\b/i.test(p) || /@example\.invalid$/i.test(em);
  },
  async seed() {
    if (this.isFixtureEnv()) return;
    if (this._seeding) return; this._seeding = true;
    try {
      await this.load();
      await this.purgeImpureAndUnstable().catch(() => {});
      const add = (this.d && (this.d.dv || 0) >= DEFAULT_PIP_V)
        ? null
        : await this.mutate(d => { if ((d.dv || 0) >= DEFAULT_PIP_V) return null; d.dv = DEFAULT_PIP_V; const a = DEFAULT_PIP_SRC.filter(l => !d.src.includes(l)); d.src.push(...a); return a; });
      if (add?.length) {
        const r = await this.importText(add.join('\n'));
        if (this.link() && Host.probe) {
          if (r.doms.length) await this.probeDomains(r.doms).catch(() => {});
          if (r.todo.length) await this.probe(r.todo.slice(0, 12)).catch(() => {});
        }
      } else if (!this.d.dom && this.domains().length && this.link() && Host.probe) {
        await this.probeDomains().catch(() => {});
      }
      // 按需小批量补扫：仅当当前在用地区纯净可用 IP 不足时才按需检测最多 12 个候选，绝不启动时把几千个 API 池全扫一遍消耗 EdgeTunnel 请求量
      const pending = this.lazyPendingKeys(12);
      if (pending.length && this.link() && Host.probe) {
        const canScan = await this.mutate(d => { if (now() - (d.bgScanAt || 0) < 10 * 60e3) return 0; d.bgScanAt = now(); return 1; }).catch(() => 0);
        if (canScan) {
          await this.probe(pending).catch(() => {});
          if (this.domains().length) await this.domSummarize(this.domains()).catch(() => {});
        }
      }
    } catch {} finally { this._seeding = false; }
  },
  async load(force) {
    if (this.d && !force) return this.d;
    let x = null; try { x = await Host.shared('pippool'); } catch {}
    if (x && x.v) {
      this.d = { ...this.blank(), ...x, ips: x.ips || {}, src: Array.isArray(x.src) ? x.src : [] };
      const hasV158Poison = (!this.d.unpoisonV163 || !this.d.unpoisonV167 || !this.d.unpoisonV175) && (
        (Object.keys(this.d.ban || {}).length + Object.keys(this.d.drop || {}).length >= 15) ||
        Object.values(this.d.ips || {}).filter(e => e && (e.banned === true || /CLOSED|关闭|重置|人机|429|不纯净|风险/i.test(String(e.err || '')))).length >= 5
      );
      this.d.unpoisonV163 = 1;
      this.d.unpoisonV167 = 1;
      if (!this.d.unpoisonV175) {
        this.d.unpoisonV175 = 1;
        if (this.d.rq && typeof this.d.rq === 'object') {
          const tNow = now();
          for (const [rip, q] of Object.entries(this.d.rq)) {
            if (!q) continue;
            if ((q.ok || 0) >= 3 && (q.rc || 0) > 0 && tNow - (q.rcAt || q.at || 0) > 1800e3) {
              q.rc = Math.max(0, Math.floor((q.rc || 0) / 3));
            }
            if ((q.l || 0) > 0 && tNow - (q.lt || 0) > 1800e3) {
              q.l = 0;
            }
          }
        }
      }
      if (!this.d.unpoisonV171 && this.d.rep && typeof this.d.rep === 'object') {
        this.d.unpoisonV171 = 1;
        let dirtyRep = false;
        for (const r of Object.values(this.d.rep)) {
          if (r && r.pu && !r.pu.via && !r.pu.res && [6, 8, 10, 12, 14, 15, 16, 22].includes(+r.pu.fs)) {
            delete r.pu.real;
            r.pu.basicOnly = 1;
            dirtyRep = true;
          }
        }
        if (dirtyRep) Host.shared('pippool', this.d).catch(() => {});
      }
      if (hasV158Poison) {
        this.d.ban = {};
        this.d.drop = {};
        this.d.banEg = {};
        this.d.pcq = { day: '', n: 0 };
        if (this.d.rep && typeof this.d.rep === 'object') {
          for (const r of Object.values(this.d.rep)) {
            if (r && r.px && r.pu && +r.pu.fs === 65) delete r.pu;
          }
        }
        const srcSet = new Set(this.d.src || []);
        const used = this.usedMap?.() || new Map();
        for (const [k, e] of Object.entries(this.d.ips || {})) {
          if (!e) continue;
          if (e.src && !srcSet.has(e.src) && !used.has(k.toLowerCase()) && !used.has(k)) {
            delete this.d.ips[k];
            continue;
          }
          if (e.banned || (e.ok === false && /CLOSED|关闭|重置|超时|502|连接失败/i.test(String(e.err || '')))) {
            delete e.gone;
            delete e.banned;
            delete e.banReason;
            e.cool = 0;
            if (e.ok === false) { delete e.ok; e.fc = 0; e.err = ''; }
          }
        }
        if (this.d.dom && typeof this.d.dom === 'object') {
          for (const dm of Object.values(this.d.dom)) {
            if (dm && dm.ok === false && /CLOSED|关闭|重置|超时|连接失败/i.test(String(dm.err || ''))) {
              delete dm.ok;
              dm.err = '';
            }
          }
        }
        for (const l of this.d.src || []) {
          const p = this.parse(l);
          if ((p?.ip || p?.chain) && !this.d.ips[p.line]) {
            this.d.ips[p.line] = { ip: p.host, port: p.port, src: '', ...(p.chain ? { chain: p.chain } : {}) };
          }
        }
        Host.shared('pippool', this.d).catch(() => {});
      }
    } else {
      // 第一次：从旧版「节点库 / ProxyIP 库」迁移
      await Nodes.load(); const d = this.blank();
      for (const v of Nodes.pips) { const p = this.parse(v); if (p && !d.src.includes(p.line)) d.src.push(p.line); }
      const cnt = new Map(); for (const a of Nodes.accts) if (a.nodeId && Nodes.get(a.nodeId)) cnt.set(a.nodeId, (cnt.get(a.nodeId) || 0) + 1);
      d.node = [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0] || (Nodes.list.length === 1 ? Nodes.list[0].id : '');  // 多个节点又没账号在用：交给 autoNode 实测挑
      for (const l of d.src) { const p = this.parse(l); if (p?.ip || p?.chain) d.ips[p.line] = { ip: p.host, port: p.port, src: '', ...(p.chain ? { chain: p.chain } : {}) }; }
      for (const k of Object.keys(d.ips || {})) { if (this.isCfOfficialIp(k) || (!d.ips[k]?.src && !(d.src || []).includes(k))) delete d.ips[k]; }
      this.d = d; if (d.src.length || d.node) Host.shared('pippool', d).catch(() => {});
    }
    return this.d;
  },
  // 所有写操作：先读最新（别的账号窗口可能刚改过冷却）→ 改 → 存
  mutate(fn) {
    const p = this.chain.then(async () => { await this.load(true); const r = fn(this.d); if (typeof IPRep !== 'undefined') IPRep.invalidate?.(); await Host.shared('pippool', this.d).catch(() => {}); Bus.emit('pool'); return r; });
    this.chain = p.catch(() => {}); return p;
  },
  node() { return this.d ? Nodes.get(this.d.node) : null; },
  link() { const n = this.node(); return n ? Vless.toLink(n) : ''; },
  // 一行：IP、IP:端口、域名、域名:端口（也接受 proxyip=… / 带协议的写法）
  parse(s) {
    const rawKey = typeof s === 'string' ? s : String(s || '');
    const pm = this._parseMemo || (this._parseMemo = new Map());
    if (pm.has(rawKey)) { const r = pm.get(rawKey); return r ? { ...r } : null; }
    const put = r => { if (pm.size >= 4000) pm.clear(); pm.set(rawKey, r); return r ? { ...r } : null; };
    // API / 订阅地址：带路径或参数的 http(s) 链接（例：https://sub.xxx/vpngate?token=…）→ 定时拉取内容，里面的 sstp:// 等链式代理、IP、IP:端口逐行解析成出口
    const am = /^(https?):\/\/([^\s/?#@]+)([/?][^\s]*)$/i.exec(rawKey.trim());
    if (am && am[3].length > 1 && !/proxyip=/i.test(am[3])) { const host = am[2].replace(/:\d+$/, '').toLowerCase(); if (/^[\w.-]{3,160}$/.test(host)) return put({ host, port: '', ip: false, api: true, line: am[1].toLowerCase() + '://' + am[2].toLowerCase() + am[3] }); }
    // 链式代理出口（edgetunnel 2.1+ 支持）：sstp://user:pass@host:port、socks5:// http:// https:// turn:// —— 整行原样作为一个出口，直接检测，不做域名解析
    const cm = /^(socks5|https?|turn|sstp):\/\/(?:([\w.~%+=!$&'()*,;:-]{1,128})@)?((?:\[[0-9a-f:]+\]|[\w.-]{3,160})(?::(\d{1,5}))?)$/i.exec(rawKey.trim());
    if (cm && !(cm[4] && +cm[4] > 65535)) { const type = cm[1].toLowerCase(), host = cm[3].replace(/:\d+$/, '').toLowerCase(); return put({ host, port: cm[4] || '', ip: false, chain: type, line: type + '://' + (cm[2] ? cm[2] + '@' : '') + host + (cm[4] ? ':' + cm[4] : '') }); }
    s = rawKey.trim().replace(/^.*?proxyip=/i, '').replace(/^[a-z][\w+.-]*:\/\//i, '').replace(/[/?#].*$/, '').trim();
    if (!s) return put(null);
    let m = s.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/);
    if (m) { if (m[1].split('.').some(x => +x > 255) || (m[2] && +m[2] > 65535)) return put(null); return put({ host: m[1], port: m[2] || '', ip: true, line: m[1] + (m[2] ? ':' + m[2] : '') }); }
    m = s.match(/^((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*)(?::(\d{1,5}))?$/i);
    if (m && !(m[2] && +m[2] > 65535)) { const host = m[1].toLowerCase(); return put({ host, port: m[2] || '', ip: false, line: host + (m[2] ? ':' + m[2] : '') }); }
    return put(null);
  },
  split(t) {
    const out = [];
    for (const rawLine of String(t || '').split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const sp = /^(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,5})(?:\s+[A-Za-z]{2,3})?$/.exec(line);
      if (sp && +sp[2] >= 1 && +sp[2] <= 65535) { out.push(sp[1] + ':' + sp[2]); continue; }
      const csv = /^(\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?)\s*,\s*([^,]*)(?:,(.*))?$/.exec(line);
      if (csv) {
        const cols = [csv[2], ...(csv[3] ? csv[3].split(',') : [])].map(s => s.trim());
        const p2 = cols[0] || '', p3 = cols[1] || '';
        const isPortRow = !csv[1].includes(':') && /^\d{2,5}$/.test(p2) && +p2 >= 80 && +p2 <= 65535 && (cols.length <= 2 || /^(?:true|false|1|0|[A-Za-z]{2,3})$/i.test(p3));
        out.push(isPortRow ? csv[1] + ':' + p2 : csv[1]);
        continue;
      }
      for (const x of line.split(/[,，;；\s|]+/)) { const s = x.trim(); if (s) out.push(s); }
    }
    return [...new Set(out)];
  },
  // DoH 解析域名的全部 IPv4（阿里 / Cloudflare / Google 三家并查取并集，60 秒缓存）
  async resolve(host, force) {
    const c = this.dns.get(host); if (!force && c && now() - c.at < 60e3) return c.ips;
    // 原生直连解析（桌面：主进程直连加密 DoH；安卓：系统 DNS + 直连 DoH）—— 页面 fetch 会走账号代理（本机代理没开 = 解析失败 0/0）
    if (Host.resolve) { const r = await Host.resolve(host).catch(() => null); const ips = (r || []).filter(x => /^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?$/.test(x)); if (ips.length) { this.dns.set(host, { at: now(), ips }); return ips; }
      // 桌面版：主进程直连加密 DNS 已经查过所有解析器，不再用页面 fetch（那会走账号代理 / 本机代理）
      if (Host.platform !== 'android') return []; }
    const qs = [['https://223.5.5.5/resolve?type=1&name=', {}], ['https://1.12.12.12/dns-query?type=A&name=', { accept: 'application/dns-json' }], ['https://dns.alidns.com/resolve?type=1&name=', {}], ['https://cloudflare-dns.com/dns-query?type=A&name=', { accept: 'application/dns-json' }], ['https://dns.google/resolve?type=A&name=', {}]];
    const one = async ([u, hd]) => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
      try { const r = await fetch(u + encodeURIComponent(host), { headers: hd, signal: ctl.signal, cache: 'no-store', credentials: 'omit' }); const j = await r.json(); if (j.Status !== 0 && j.Status !== 3) return null; return (j.Answer || []).filter(a => a.type === 1).map(a => a.data); }
      catch { return null; } finally { clearTimeout(t); }
    };
    const ok = (await Promise.all(qs.map(one))).filter(Boolean);
    if (!ok.length) return c ? c.ips : null;
    const ips = [...new Set(ok.flat())].filter(x => /^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?$/.test(x));
    this.dns.set(host, { at: now(), ips }); return ips;
  },
  // 重新解析一个域名来源：新 IP 加入（待检测），消失的 IP 移除（有账号在用的先标记 gone，换 IP 时跳过）
  async refreshSrc(line, force, options = {}) {
    const p = this.parse(line); if (!p || p.ip || p.chain) return { added: [], removed: 0 };
    if (p.api) return this.refreshApi(p.line, force, options);
    const live=()=>!options.cancelled?.();
    const ips=await this.resolve(p.host,force);if(!live())return {added:[],removed:0,cancelled:true};
    if(!ips?.length)return {added:[],removed:0,err:'解析未返回可用 IP，已保留原列表'};
    const used = this.usedMap();
    return this.mutate(d => {
      if(!live())return {added:[],removed:0,cancelled:true};
      const added = []; let removed = 0; const want = new Set(ips.map(ip => ip.includes(':') ? ip : ip + (p.port ? ':' + p.port : '')));
      // 永久拉黑 / 淘汰过的 IP（ban / drop / banEg）：非强制刷新时不再加回池子；点击「检查」强制刷新（force=true）时解除临时淘汰重新检测
      for (const k of want) {
        const low = k.toLowerCase(), [rawHost, rawPort] = k.split(':'), rawIp = rawHost.toLowerCase(), e = d.ips[k];
        if (!force && (d.ban?.[low] || d.ban?.[rawIp] || d.banEg?.[rawIp] || (!e && (d.drop?.[k] || d.drop?.[low] || d.drop?.[rawIp])))) continue;
        if (force) {
          if (d.ban) { delete d.ban[low]; if (rawIp) delete d.ban[rawIp]; }
          if (d.drop) { delete d.drop[k]; delete d.drop[low]; if (rawIp) delete d.drop[rawIp]; }
        }
        if (!e) { d.ips[k] = { ip: rawHost, port: rawPort || p.port || '', src: p.line, srcs: [p.line] }; added.push(k); }
        else if (force || (!e.banned && !d.ban?.[low])) {
          if (!e.src || !(d.src || []).includes(e.src)) e.src = p.line;
          const srcs = Array.isArray(e.srcs) ? e.srcs.filter(s => (d.src || []).includes(s)) : (e.src && (d.src || []).includes(e.src) ? [e.src] : []);
          if (!srcs.includes(p.line)) srcs.push(p.line);
          e.srcs = srcs;
          e.gone = false;
          if (force) { e.banned = false; e.cool = 0; }
        }
      }
      for (const [k, e] of Object.entries(d.ips)) if (this.fromSrc(e, p.line) && !want.has(k)) {
        // 已实测纯净的 IP 或正在等待首轮扫描的 IP 不因 DNS 轮询变化而误删，一直保留到 6 小时复检确认不可用为止
        if ((e.ok === true && typeof IPRep !== 'undefined' && IPRep.pure?.(k, e)) || e.ok === null) continue;
        if (Array.isArray(e.srcs) && e.srcs.length > 1) {
          e.srcs = e.srcs.filter(s => s !== p.line);
          if (e.src === p.line) e.src = e.srcs[0] || '';
          continue;
        }
        if (used.has(k)) e.gone = true; else delete d.ips[k];
        removed++;
      }
      return { added, removed, total: want.size };
    });
  },
  // API 内容 → 出口列表：一行一个（sstp:// socks5:// http(s):// turn://、IP、IP:端口；行尾 #备注 忽略）；兼容 EdgeTunnel / NiREvil 空格分隔（IP Port）与 CSV（IP,Port,TLS,Colo,CC,...）
  apiItems(text) {
    let t = String(text || '').trim();
    if (t && !/[:.]/.test(t.slice(0, 300)) && /^[A-Za-z0-9+/=_\-\s]+$/.test(t)) { try { const b = atob(t.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')); try { t = decodeURIComponent(escape(b)); } catch { t = b; } } catch {} }
    const out = new Map();
    const put = (l, locHint = '') => {
      const p = this.parse(String(l || '').replace(/#.*$/, '').trim());
      if (p && (p.ip || p.chain) && !out.has(p.line)) {
        if (locHint && /^[A-Z]{2}$/.test(locHint)) p.loc = locHint;
        out.set(p.line, p);
      }
    };
    for (const rawLine of t.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      // EdgeTunnel / NiREvil country_proxies/{CC}.txt: "45.85.119.83 8443"
      const sp = /^(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,5})(?:\s+([A-Za-z]{2}))?$/.exec(line);
      if (sp && +sp[2] >= 1 && +sp[2] <= 65535) { put(sp[1] + ':' + sp[2], sp[3] ? sp[3].toUpperCase() : ''); continue; }
      // EdgeTunnel / NiREvil 02_proxies.csv: "8.221.140.181,443,true,HKG,HK,Hong Kong,..."
      const csv = /^(\d{1,3}(?:\.\d{1,3}){3})\s*,\s*(\d{1,5})\s*,\s*(?:true|false|1|0)\b(?:\s*,\s*([A-Za-z]{3}))?(?:\s*,\s*([A-Za-z]{2})\b)?/i.exec(line);
      if (csv && +csv[2] >= 1 && +csv[2] <= 65535) {
        const cc = (csv[4] ? csv[4].toUpperCase() : '') || (csv[3] && this.COLO_CC?.[csv[3].toLowerCase()]) || '';
        put(csv[1] + ':' + csv[2], cc);
        continue;
      }
      // Generic CSV row starting with IP or IP:Port (e.g. xgonce Cloudflare_IP result.csv or IP,Port,CC)
      const gcsv = /^(\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?)\s*,\s*([^,]*)(?:,(.*))?$/.exec(line);
      if (gcsv) {
        const cols = [gcsv[2], ...(gcsv[3] ? gcsv[3].split(',') : [])].map(s => s.trim());
        const ccCol = cols.find(c => /^[A-Z]{2}$/.test(c)) || cols.map(c => this.COLO_CC?.[c.toLowerCase()]).find(Boolean) || '';
        const p2 = cols[0] || '', p3 = cols[1] || '';
        const isPortRow = !gcsv[1].includes(':') && /^\d{2,5}$/.test(p2) && +p2 >= 80 && +p2 <= 65535 && (cols.length <= 2 || /^(?:true|false|1|0|[A-Za-z]{2,3})$/i.test(p3));
        put(isPortRow ? gcsv[1] + ':' + p2 : gcsv[1], ccCol);
        continue;
      }
      for (const tok of line.split(/[,，;；\s|]+/)) if (tok) put(tok);
    }
    if (!out.size) for (const m of t.matchAll(/(?:(?:socks5|https?|turn|sstp):\/\/[^\s"'<>,;|\\]+)|\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\b/gi)) put(m[0]);
    if (out.size > 240) {
      const byCc = new Map(), picked = [];
      for (const item of out.values()) {
        const c = item.loc || '_', n = byCc.get(c) || 0;
        if (n >= 16) continue;
        byCc.set(c, n + 1);
        picked.push(item);
        if (picked.length >= 240) break;
      }
      return picked;
    }
    return [...out.values()].slice(0, 240);
  },
  // 拉取一个 API 来源：新出口加入（待检测），内容里没了的移除（已验证纯净的保留，有账号在用的先标记 gone）；拉取失败 / 内容为空不动现有的
  async refreshApi(line, force, options = {}) {
    const live=()=>!options.cancelled?.();
    await this.load();if(!live())return {added:[],removed:0,cancelled:true};
    const st = this.d.api?.[line]; if (!force && st?.at && now() - st.at < 10 * 60e3) return { added: [], removed: 0, total: st.n || 0, cached: true };
    let r = typeof Nodes !== 'undefined' && Nodes.fetchSub ? await Nodes.fetchSub(line).catch(e => ({ error: cleanErr(e) })) : { error: '此平台不支持' };
    if ((r?.error || typeof r?.text !== 'string') && typeof Host !== 'undefined' && typeof Host.fetchText === 'function') {
      const r2 = await Host.fetchText(line).catch(() => null);
      if (r2 && !r2.error && typeof r2.text === 'string') r = { ...r2, via: r2.via || '原生节点代理' };
    }
    if(!live())return {added:[],removed:0,cancelled:true};
    const items = r.error ? [] : this.apiItems(r.text);
    const err = r.error ? r.error.replace(/^无法获取订阅：/, '获取失败：') : !items.length ? '内容里没有识别到 IP / 代理' : '';
    if (err) { await this.mutate(d => { if(!live())return;d.api ||= {}; d.api[line] = { ...(d.api[line] || {}), err, tried: now() }; }); return { added: [], removed: 0, err }; }
    const used = this.usedMap(), apiCc = this.sourceRegionHint(line);
    return this.mutate(d => {
      if(!live())return {added:[],removed:0,cancelled:true};
      const added = []; let removed = 0; const want = new Set(items.map(p => p.line));
      // 永久拉黑 / 淘汰过的 IP（ban / drop / banEg）：永远不再加回池子
      for (const p of items) {
        const k = p.line, low = k.toLowerCase(), rawIp = String(p.host || '').toLowerCase(), e = d.ips[k], loc = p.loc || apiCc || '';
        if (d.ban?.[low] || (rawIp && d.ban?.[rawIp]) || (rawIp && d.banEg?.[rawIp]) || (!e && (d.drop?.[k] || d.drop?.[low] || (rawIp && d.drop?.[rawIp])))) continue;
        if (!e) { d.ips[k] = { ip: p.host, port: p.port, src: line, ...(loc ? { loc } : {}), ...(p.chain ? { chain: p.chain } : {}) }; added.push(k); }
        else if (!e.banned && !d.ban?.[low]) { if (!e.src || !(d.src || []).includes(e.src)) e.src = line; if (loc && !e.loc) e.loc = loc; e.gone = false; }
      }
      for (const [k, e] of Object.entries(d.ips)) if (e.src === line && !want.has(k)) {
        if (e.ok === true && typeof IPRep !== 'undefined' && IPRep.pure?.(k, e)) continue;
        if (used.has(k.toLowerCase()) || used.has(k)) e.gone = true; else delete d.ips[k];
        removed++;
      }
      d.api ||= {}; const old = d.api[line] || {};
      d.api[line] = { at: now(), tried: now(), n: want.size, err: '', ch: added.length || removed ? now() : (old.ch || now()), via: r.via || '' };
      return { added, removed, total: want.size };
    });
  },
  // 导入：返回新加入、需要检测的 key（含直接填的 IP、API 解析出的全部 IP、域名解析出的全部 IP）
  async importText(text, onStep) {
    const lines = this.split(text), bad = [], fresh = [], apiErr = [];
    for (const l of lines) { const p = this.parse(l); if (!p) bad.push(l); else fresh.push(p); }
    await this.mutate(d => {
      for (const p of fresh) {
        const low = p.line.toLowerCase(), rawIp = p.chain ? '' : String(p.host || '').toLowerCase();
        if (p.ip || p.chain) {
          if (d.ban) { delete d.ban[low]; if (rawIp) delete d.ban[rawIp]; }
          if (d.drop) { delete d.drop[p.line]; delete d.drop[low]; if (rawIp) delete d.drop[rawIp]; }
          if (d.banEg && rawIp) delete d.banEg[rawIp];
        }
        if (!d.src.includes(p.line)) d.src.push(p.line);
        if (p.ip || p.chain) {
          if (!d.ips[p.line]) d.ips[p.line] = { ip: p.host, port: p.port, src: '', ...(p.chain ? { chain: p.chain } : {}) };
          else {
            const e = d.ips[p.line];
            e.gone = false; e.banned = false; e.cool = 0;
            if (e.ok === false) { delete e.ok; e.err = ''; e.fc = 0; }
          }
        }
      }
    });
    const todo = fresh.filter(p => p.ip || p.chain).map(p => p.line).filter(k => this.d.ips[k] && this.d.ips[k].ok !== true);
    const doms = [...new Set(fresh.filter(p => !p.ip && !p.chain && !p.api).map(p => p.line))], okDoms = [];
    for (const l of [...new Set(fresh.filter(p => p.api).map(p => p.line))]) { onStep?.('拉取 API：' + l); const r = await this.refreshApi(l, true); if (r.err) apiErr.push(l + '：' + r.err); else todo.push(...this.entries().filter(([, e]) => Pool.fromSrc(e, l) && !e.gone && e.ok !== true).map(([k]) => k)); }
    let i = 0;
    for (const l of doms) {
      onStep?.('解析域名 ' + (++i) + '/' + doms.length + '：' + l);
      const r = await this.refreshSrc(l, true);
      if (r.err) bad.push(l + '（解析失败）');
      else {
        okDoms.push(l);
        todo.push(...this.entries().filter(([, e]) => Pool.fromSrc(e, l) && !e.gone && e.ok !== true).map(([k]) => k));
      }
    }
    return { todo: [...new Set(todo)], doms: okDoms, bad, apiErr, lines: fresh.length };
  },
  // 域名对应的国家：先看实测结果，其次看域名里的国家代码或 EdgeTunnel 机房代码（proxyip.jp.xxx / nrt.proxyip.xxx → JP）
  domLoc(line) {
    const d = this.d?.dom?.[line];
    if (d?.loc) return d.loc;
    return this.sourceRegionHint(line);
  },
  isDom(l) { const p = this.parse(l); return !!p && !p.ip && !p.chain && !p.api; },
  isApi(l) { return !!this.parse(l)?.api; },
  apiName(l) { try { const u = new URL(l); return u.host + (u.pathname !== '/' ? u.pathname : '') + (u.search ? '?…' : ''); } catch { return l; } },   // 显示用：不露 token
  apiLoc(okE) { const c = {}; for (const [, e] of okE) if (e.loc) c[e.loc] = (c[e.loc] || 0) + 1; const t = Object.entries(c).sort((a, b) => b[1] - a[1]); return t.length === 1 ? t[0][0] : t.length ? t[0][0] + '+' : ''; },
  apiTip(l, n, ok) { const a = this.d?.api?.[l] || {}, f = t => t ? new Date(t).toLocaleString() : '—'; return l + '\nAPI 来源：' + n + ' 个出口，' + ok + ' 个可用' + '\n上次拉取 ' + f(a.at) + (a.ch ? ' · 内容上次变化 ' + f(a.ch) : '') + (a.err ? '\n上次失败：' + a.err + '（' + f(a.tried) + '）' : '') + '\n每 30 分钟自动拉取一次：新出现的自动加入并检测，没了的自动移除\n点击展开 / 收起'; },
  isSrc(l) { const p = this.parse(l); return !!p && !p.ip && !p.chain; },   // 域名或 API：一行来源对应多个出口   // 需要 DNS 解析的域名来源（不含裸 IP、链式代理）
  domains() { return (this.d?.src || []).filter(l => { const p = this.parse(l); return p && !p.ip && !p.chain && !p.api; }); },
  apis() { return (this.d?.src || []).filter(l => this.parse(l)?.api); },
  // 域名级检测：每个域名只测 1 个 IP（不通再换 1 个），确认域名可用 + 实际出口国家 → 成为地区选项。不会把几百个 IP 全测一遍。
  async probeDomains(lines, onStep) {
    await this.load();
    lines = [...new Set((lines || this.domains()).filter(l => { const p = this.parse(l); return p && !p.ip && !p.chain && !p.api; }))];
    if (!lines.length) return { done: 0 };
    if (!this.link() || !Host.probe) return { done: 0, error: '请先选择 VLESS 节点' };
    for (const l of lines) if (!this.entries().some(([, e]) => Pool.fromSrc(e, l) && !e.gone)) { onStep?.('解析域名 ' + l); await this.refreshSrc(l).catch(() => {}); }
    const tried = new Set(), result = {};
    const run = async () => {
      for (let round = 0; round < 2; round++) {
        const pick = [];
        for (const l of lines) {
          if (result[l]?.ok) continue;
          const ks = this.entries().filter(([k, e]) => Pool.fromSrc(e, l) && !e.gone && !tried.has(k) && !this.banned(k)).sort(([, x], [, y]) => (y.ok === true) - (x.ok === true) || (x.ok === false) - (y.ok === false) || (x.ms || 9e9) - (y.ms || 9e9)).map(([k]) => k);
          if (ks[0]) { pick.push([l, ks[0]]); tried.add(ks[0]); }
        }
        if (!pick.length) break;
        for (let i = 0; i < pick.length; i += 20) {
          const part = pick.slice(i, i + 20); this.prog = { done: i, total: pick.length, dom: true }; Bus.emit('pool');
          onStep?.('检测域名（每个域名测 1 个 IP）' + (i + part.length) + '/' + pick.length + (round ? ' · 第二轮' : ''));
          const r = await this.hostProbe(part.map(x => x[1]), 9000);
          if (!Array.isArray(r)) { if (/节点|xray|平台/.test(r?.error || '')) throw new Error(r.error); continue; }
          await this.mutate(d => { d.dom ||= {}; for (const [l, k] of part) { const x = r.find(y => y.pip === k) || {}; this.apply(d, k, x); const ok = !!(x.ip && x.brana); const old = d.dom[l]; if (ok || round || !old?.ok) d.dom[l] = { ok, loc: x.loc || old?.loc || '', ms: x.ms || 0, at: now(), ip: k, err: ok ? '' : (x.error || '连接失败') }; result[l] = d.dom[l]; } });
        }
      }
    };
    const p = (this.job || Promise.resolve()).catch(() => {}).then(run);
    this.job = p.finally(() => { if (this.job === p) this.job = null; this.prog = null; Bus.emit('pool'); });
    await this.job; return { done: lines.length, result };
  },
  // 选了地区：只解析这个地区的域名与 EdgeTunnel 反代库，按需检测未测过的 IP，凑够 want 个干净可用的就停
  async fill(cc, { want = 3, log } = {}) {
    if (typeof window !== 'undefined' && (window.__routeFixture || window.__fixture)) return 0;
    await this.load();
    if (!this.link() || !Host.probe) return 0;
    const srcs = new Set([...this.domains(), ...this.apis()].filter(l => this.domLoc(l) === cc || this.sourceRegionHint(l) === cc));
    for (const [, e] of this.entries()) if (e.src && e.loc === cc) srcs.add(e.src);
    const etFeed = this.edgeTunnelCountryFeed?.(cc);
    if (etFeed && this.d?.src?.includes(etFeed)) srcs.add(etFeed);
    for (const l of srcs) await this.refreshSrc(l).catch(() => {});
    const have = () => this.avail(cc).length;
    let tested = 0;
    const probeBatch = async () => {
      for (let batch = 0; batch < 4 && have() < want; batch++) {
        const keys = this.entries().filter(([k, e]) => ((srcs.has(e.src) || (Array.isArray(e.srcs) && e.srcs.some(s => srcs.has(s)))) || (Array.isArray(e.srcs) && e.srcs.some(s => srcs.has(s)))) && !e.gone && !this.banned(k) && !this.owner(k) && (e.ok == null || (e.ok === true && e.loc === cc && now() - (e.at || 0) > 3 * 3600e3))).map(([k]) => k).sort(() => Math.random() - .5).slice(0, 8);
        if (!keys.length) break;
        log?.(regionLabel(cc) + '：检测 ' + keys.length + ' 个候选 IP（已有可用 ' + have() + ' 个）…');
        await this.probe(keys).catch(() => {}); tested += keys.length;
      }
    };
    await probeBatch();
    // 按需接入 EdgeTunnel 地区反代库：当前地区可用不足时，自动补充该国 EdgeTunnel 实时扫描库并检测
    if (have() < want && etFeed && !srcs.has(etFeed) && Host.fetchText) {
      log?.(regionLabel(cc) + '：接入 EdgeTunnel 实时反代库补充候选 IP…');
      await this.mutate(d => { if (!d.src.includes(etFeed)) d.src.push(etFeed); });
      srcs.add(etFeed);
      await this.refreshSrc(etFeed, true).catch(() => {});
      await probeBatch();
    }
    return tested;
  },
  removeSrc(line) {
    return this.mutate(d => { d.src = d.src.filter(x => x !== line); if (d.api) delete d.api[line]; for (const [k, e] of Object.entries(d.ips)) if (k === line || e.src === line) delete d.ips[k]; });
  },
  removeKey(k) { return this.mutate(d => { const e = d.ips[k]; delete d.ips[k]; if (e && !e.src) d.src = d.src.filter(x => x !== k); else if (e?.src) { d.drop ||= {}; d.drop[k] = now(); } }); },
  // 一键清除高风险 IP（< 50 分）：永久拉黑剔除，正在使用的跳过
  clearRisk() {
    const used = this.usedMap();
    return this.mutate(d => {
      let n = 0, skip = 0; d.ban ||= {}; d.drop ||= {}; d.banEg ||= {};
      for (const [k, e] of Object.entries(d.ips)) {
        if (e.ok !== true || e.gone) continue;
        const isBad = IPRep.risky(k, e);
        if (!isBad) continue;
        const low = k.toLowerCase(), eg = String(e.eg || '').trim().toLowerCase();
        d.ban[low] = now(); d.drop[k] = now(); d.drop[low] = now();
        if (eg && /^\d+\.\d+\.\d+\.\d+$/.test(eg)) d.banEg[eg] = now();
        if (used.has(low) || used.has(k)) { skip++; continue; }   // 正在用的：拉黑（不再分配），账号空闲时自动换走
        delete d.ips[k]; n++;
        if (!e.src) d.src = d.src.filter(x => x !== k);
      }
      return { n, skip };
    });
  },
  // 域名状态按它解析出的 IP 的实测结果汇总（全部检测后用）：有一个可用就算可用，地区取最多的，延迟取最低
  domSummarize(lines) {
    return this.mutate(d => { d.dom ||= {}; for (const l of lines) { const es = Object.entries(d.ips).filter(([, e]) => Pool.fromSrc(e, l) && !e.gone && e.ok != null); if (!es.length) continue;
      const ok = es.filter(([k, e]) => { const st = this.state(k, e); return st === 'ok' || st === 'used'; }), cnt = {}; for (const [, e] of ok) if (e.loc) cnt[e.loc] = (cnt[e.loc] || 0) + 1;
      const loc = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || d.dom[l]?.loc || '', ms = ok.reduce((m, [, e]) => e.ms > 0 && (!m || e.ms < m) ? e.ms : m, 0);
      d.dom[l] = { ok: ok.length > 0, loc, ms, at: now(), ip: ok[0]?.[0] || es[0][0], err: ok.length ? '' : (es[0][1].err || '连接失败'), n: es.length, nok: ok.length }; } });
  },
  // 来源文本（一行一个 IP / 域名）整体生效：返回 { added:[行], removed:[行], bad:[行] }，不检测
  async setSrcText(text) {
    const lines = this.split(text), want = [], bad = [], parsed = [];
    for (const l of lines) { const p = this.parse(l); if (!p) bad.push(l); else if (!want.includes(p.line)) { want.push(p.line); parsed.push(p); } }
    const cur = [...(this.d.src || [])], removed = cur.filter(l => !want.includes(l)), added = want.filter(l => !cur.includes(l));
    await this.mutate(d => {
      if (removed.length) {
        d.src = d.src.filter(x => !removed.includes(x));
        if (d.api) for (const l of removed) delete d.api[l];
        for (const [k, e] of Object.entries(d.ips)) if (removed.includes(k) || removed.includes(e.src)) delete d.ips[k];
      }
      for (const p of parsed) {
        if (p.ip || p.chain) {
          const low = p.line.toLowerCase(), rawIp = p.chain ? '' : String(p.host || '').toLowerCase();
          if (added.includes(p.line) || !d.ips[p.line]) {
            if (d.ban) { delete d.ban[low]; if (rawIp) delete d.ban[rawIp]; }
            if (d.drop) { delete d.drop[p.line]; delete d.drop[low]; if (rawIp) delete d.drop[rawIp]; }
            if (d.banEg && rawIp) delete d.banEg[rawIp];
          }
          if (!d.src.includes(p.line)) d.src.push(p.line);
          if (!d.ips[p.line]) d.ips[p.line] = { ip: p.host, port: p.port, src: '', ...(p.chain ? { chain: p.chain } : {}) };
        }
      }
    });
    return { added, removed, bad, want };
  },
  clearBad() {
    const used = this.usedMap();
    return this.mutate(d => { let n = 0; d.ban ||= {}; d.drop ||= {}; for (const [k, e] of Object.entries(d.ips)) if ((e.ok === false || e.gone) && !used.has(k)) { d.ban[k.toLowerCase()] = now(); d.drop[k] = now(); delete d.ips[k]; if (!e.src) d.src = d.src.filter(x => x !== k); n++; } return n; });
  },
  // 阶梯式临时冷却（针对动态人机验证 / 429 限流 / 短期信誉波动）：绝不永久删除好 IP，冷却到期后自动回归候选池并在实测通过后完全恢复
  coolTemporarily(d, k, kind = 'rc', egIp = '', why = '') {
    if (!d) return false;
    const tNow = now();
    const s = String(k || '').trim();
    const e = s ? d.ips?.[s] : null;
    const eg = String(egIp || e?.eg || '').trim().toLowerCase();
    const sub = typeof IPRep !== 'undefined' && IPRep.subnetOf ? IPRep.subnetOf(eg || s) : '';
    let coolMs = 20 * 60e3;
    if (kind === '429' || kind === 'l') {
      const hits = (e ? (e.rlHits = (e.rlHits || 0) + 1) : 1);
      coolMs = hits <= 1 ? 15 * 60e3 : hits === 2 ? 45 * 60e3 : 120 * 60e3;
      if (sub) { d.subCool ||= {}; d.subCool[sub] = Math.max(d.subCool[sub] || 0, tNow + 8 * 60e3); }
    } else if (kind === 'rc' || kind === 'verification') {
      const hits = (e ? (e.rcHits = (e.rcHits || 0) + 1) : 1);
      coolMs = hits <= 1 ? 20 * 60e3 : hits === 2 ? 60 * 60e3 : 150 * 60e3;
      if (sub) { d.subCool ||= {}; d.subCool[sub] = Math.max(d.subCool[sub] || 0, tNow + 12 * 60e3); }
    } else {
      coolMs = 25 * 60e3;
    }
    const until = tNow + coolMs;
    if (e) {
      e.cool = Math.max(e.cool || 0, until);
      e.used = tNow;
      e.err = why || (kind === '429' || kind === 'l' ? '429 限流冷却中' : kind === 'rc' ? '人机验证冷却中' : '短期信誉波动冷却中');
    }
    if (eg) {
      for (const [, ent] of Object.entries(d.ips || {})) {
        if (ent && String(ent.eg || '').toLowerCase() === eg) {
          ent.cool = Math.max(ent.cool || 0, until);
        }
      }
    }
    return true;
  },
  // 永久拉黑：仅对封号毒 IP / 极高危欺诈段 / 连续死连 IP 永久剔除；如果是临时人机验证或 429 限流则自动转为阶梯式冷却
  banForever(d, k, why = '') {
    if (!d || !k) return false;
    const s = String(k).trim(), low = s.toLowerCase();
    if (!s) return false;
    const e = d.ips?.[s];
    const eg = String(e?.eg || '').trim().toLowerCase();
    const isToxic = typeof IPRep !== 'undefined' && IPRep.isToxicBanIp && (IPRep.isToxicBanIp(eg) || IPRep.isToxicBanIp(s));
    if (!isToxic && /人机|429|限流|预检出口不纯净|热备检测/.test(String(why || ''))) {
      const kind = /429|限流/.test(String(why || '')) ? '429' : /人机|验证/.test(String(why || '')) ? 'rc' : 'impure';
      return this.coolTemporarily(d, s, kind, eg, why);
    }
    d.ban ||= {}; d.ban[low] = now();
    d.drop ||= {}; d.drop[s] = now(); d.drop[low] = now();
    const used = this.usedMap?.() || new Map();
    if (e) {
      if (eg && /^\d+\.\d+\.\d+\.\d+$/.test(eg)) { d.banEg ||= {}; d.banEg[eg] = now(); }
      e.ok = false; e.gone = true; e.banned = true; e.fc = (e.fc || 0) + 1;
      if (why) e.err = why;
      if (!used.has(low) && !used.has(s)) {
        if (!e.src) d.src = (d.src || []).filter(x => x !== s);
        delete d.ips[s];
      }
    }
    return true;
  },
  blacklistIp(k, why = '') {
    return this.mutate(d => this.banForever(d, k, why));
  },
  // 判断节点本身是否已确认连通（避免因为 VLESS 节点挂掉而误把好用的 ProxyIP 拉黑）
  isNodeConfirmedAlive(link, batchResults = null) {
    if (Array.isArray(batchResults) && batchResults.some(x => x && (x.ip || x.brana || x.ok))) return true;
    if (link && typeof NodeSpeed !== 'undefined' && typeof NodeSpeed.get === 'function') {
      const ns = NodeSpeed.get(link);
      if (ns && ns.ok === true && now() - (ns.at || 0) < 60000) return true;
    }
    return false;
  },
  purgeImpureAndUnstable() {
    if (this.d && this.d.ips) {
      let hasWork = false;
      for (const [k, e] of Object.entries(this.d.ips)) {
        if (!e) continue;
        const sc = typeof IPRep !== 'undefined' && IPRep.score ? IPRep.score?.(k, e) : null;
        const canRecover = sc && sc.known && sc.s >= (IPRep.TH || 50) && (e.banned || e.gone || this.d.ban?.[k.toLowerCase()]);
        if (canRecover) { hasWork = true; break; }
        const isSevereRisk = typeof IPRep !== 'undefined' && !IPRep.trusted?.(k) && sc?.known && (sc.s < 32 || IPRep.isToxicBanIp?.(e.eg || k));
        if (isSevereRisk && !e.banned) { hasWork = true; break; }
      }
      if (!hasWork) return Promise.resolve(0);
    }
    return this.mutate(d => {
      let n = 0;
      for (const [k, e] of Object.entries(d.ips || {})) {
        if (!e) continue;
        const sc = typeof IPRep !== 'undefined' && IPRep.score ? IPRep.score?.(k, e) : null;
        if (sc && sc.known && sc.s >= (IPRep.TH || 50) && (e.banned || e.gone || d.ban?.[k.toLowerCase()])) {
          e.banned = false; e.gone = false; if (e.ip || e.eg) e.ok = true; e.err = ''; e.fc = 0;
          if (d.ban) delete d.ban[k.toLowerCase()];
          if (e.eg && d.banEg) delete d.banEg[String(e.eg).toLowerCase()];
          continue;
        }
        const isSevereRisk = typeof IPRep !== 'undefined' && !IPRep.trusted?.(k) && sc?.known && (sc.s < 32 || IPRep.isToxicBanIp?.(e.eg || k));
        if (isSevereRisk) {
          this.banForever(d, k, '极高风险 · 已永久拉黑');
          n++;
        }
      }
      return n;
    });
  },
  // Candidate membership is not selectable membership: untested source IPs must reach testing.
  sourceRegionHint(line) {
    const raw = String(line || '').trim();
    const apiMatch = /\/country_proxies\/([A-Za-z]{2})\.txt(?:[?#]|$)/i.exec(raw);
    if (apiMatch) { const cc = apiMatch[1].toUpperCase(); if (REGION_NAME(cc) !== cc) return cc; }
    const host = this.parse(raw)?.host || '';
    const coloMatch = /^([a-z]{3})\.proxyip\./i.exec(host);
    if (coloMatch && this.COLO_CC?.[coloMatch[1].toLowerCase()]) return this.COLO_CC[coloMatch[1].toLowerCase()];
    const m = /(?:^|\.)([a-z]{2})\.[^.]+\.[^.]+$/i.exec(host) || /^([a-z]{2})\./i.exec(host), cc = m ? m[1].toUpperCase() : '';
    return /^[A-Z]{2}$/.test(cc) && REGION_NAME(cc) !== cc ? cc : '';
  },
  regionSources(cc) {
    const source=new Set();if(!cc)return source;
    for(const line of this.domains())if(this.domLoc(line)===cc||this.sourceRegionHint(line)===cc)source.add(line);
    for(const line of this.apis())if(this.sourceRegionHint(line)===cc)source.add(line);
    for(const [,e] of this.entries())if(e.src&&e.loc===cc&&!e.gone)source.add(e.src);
    return new Set([...source].sort((a,b)=>Number(this.sourceRegionHint(b)===cc)-Number(this.sourceRegionHint(a)===cc)));
  },
  regionCandidates(cc) {
    const sources=this.regionSources(cc);
    return this.entries().filter(([k,e])=>!e.gone&&!this.banned(k)&&(e.loc===cc||((sources.has(e.src) || (Array.isArray(e.srcs) && e.srcs.some(s => sources.has(s)))) || (Array.isArray(e.srcs) && e.srcs.some(s => sources.has(s))))))
      .sort(([ka,a],[kb,b])=>Number(this.sourceRegionHint(b.src)===cc)-Number(this.sourceRegionHint(a.src)===cc)||Number(b.ok==null)-Number(a.ok==null)||(a.ms||9e9)-(b.ms||9e9)||ka.localeCompare(kb));
  },
  // Streaming on new desktop runtimes; final-array fallback on older hosts.
  async streamProbe(pips,{link=this.link(),timeout=9000,signal,cancelled:stale,onItem,onStage}={}) {
    if(!Host.probe)return {error:'此平台不支持检测'};
    const keys=new Set(pips),seen=new Set(),live=()=>!signal?.aborted&&!stale?.();
    if(!live())return {cancelled:true};
    const requestId='pool-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
    let chain=Promise.resolve(),off=()=>{},abortResolve;
    const accept=(pip,result)=>{
      if(!live()||!keys.has(pip)||seen.has(pip)||!result||typeof result!=='object')return;
      seen.add(pip);chain=chain.then(()=>{if(live())return onItem?.(pip,result);});chain.catch(()=>{});
    };
    const abortWait=new Promise(r=>{abortResolve=r;});
    const abort=()=>{if(Host.cancelProbe)void Promise.resolve(Host.cancelProbe(requestId)).catch(()=>{});abortResolve({cancelled:true});};
    if(Host.onProbeProgress){off=Host.onProbeProgress(m=>{if(!live()||m?.requestId!==requestId)return;if(m.stage)onStage?.(m.stage);if(m.pip)accept(m.pip,m.result);})||off;}
    signal?.addEventListener('abort',abort,{once:true});
    try{
      if(!live())return {cancelled:true};
      const request=Promise.resolve(Host.probe({link,pips,timeout,requestId})).catch(e=>({error:String(e?.message||e)}));
      const result=signal?await Promise.race([request,abortWait]):await request;
      if(!live())return {cancelled:true};
      if(Array.isArray(result))for(const pip of pips)accept(pip,result.find(x=>x.pip===pip)||{error:'检测未返回结果'});
      await chain;return result;
    }finally{signal?.removeEventListener('abort',abort);try{off();}catch{}}
  },
  // 检测：宿主开一个 xray，N 个入口并发测；结果写回池子
  hostProbe(pips, timeout = 12000) {
    const link = this.link();
    if (!link) return Promise.resolve({ error: '请先选择 VLESS 节点' });
    if (!Host.probe) return Promise.resolve({ error: '此平台不支持检测' });
    return Host.probe({ link, pips, timeout }).catch(e => ({ error: cleanErr(e) }));
  },
  apply(d, k, r) {
    const e = d.ips[k]; if (!e) return;
    e.at = now(); if (r.loc) e.loc = r.loc; e.eg = r.ip || e.eg || ''; e.ms = r.ms || 0;
    e.ok = !!(r.ip && r.brana); e.err = e.ok ? '' : (r.error || (r.ip ? 'Brana 不可用' : '连接失败')); e.fc = e.ok ? 0 : (e.fc || 0) + 1;
    // 纯净度：检测时经隧道带回的 IPPure 风险值入库；可用的 IP 立即评估，高风险马上删除（导入 / 测全部 / 切换都走这里）
    if (typeof IPRep !== 'undefined') { if (r.pure && e.eg) IPRep.putPu?.(d, e.eg, r.pure); if (r.ipa && e.eg) IPRep.putIpa?.(d, e.eg, r.ipa); IPRep.invalidate?.(); if (e.ok) IPRep.soon?.([k]); }
    const egLow = String(e.eg || '').toLowerCase();
    const isRiskBanned = Boolean((egLow && d.banEg?.[egLow]) || (r.pure && Number.isFinite(+r.pure.fs) && +r.pure.fs >= 50));
    if (e.ok && e.banned && !isRiskBanned) { e.gone = false; e.banned = false; if (d.ban) delete d.ban[String(k || '').trim().toLowerCase()]; }
  },
  async probe(keys, onProg, options = {}) {
    keys=[...new Set(keys)].filter(k=>this.d.ips[k]&&!this.d.ips[k].gone&&!this.banned(k));if(!keys.length)return {done:0};
    if(keys.length>96){
      keys.sort((ka,kb)=>{const x=this.d.ips[ka]||{},y=this.d.ips[kb]||{};return ((y.ok===true?2:y.ok==null?1:0)-(x.ok===true?2:x.ok==null?1:0))||((x.fc||0)-(y.fc||0))||((x.ms||9e9)-(y.ms||9e9));});
      keys=keys.slice(0,96);
    }
    // 如果后台全量扫描正在进行且未指定独立取消信号，直接将新 IP 动态插队到当前扫描队列最前面优先检测
    if(this._activeScan&&!options.signal&&this.job){
      const act=this._activeScan,fresh=keys.filter(k=>!act.seenKeys.has(k));
      if(fresh.length){
        for(const k of fresh)act.seenKeys.add(k);
        const chunks=[];
        for(let i=0;i<fresh.length;i+=act.size)chunks.push(fresh.slice(i,i+act.size));
        act.queue.unshift(...chunks);
        act.state.total+=fresh.length;
        if(onProg)act.callbacks.push(onProg);
        Bus.emit('pool');
      }
      return this.job;
    }
    const run=async()=>{
      let link=this.link(),done=0,failed=0,consecFail=0,okSeen=0,fatal='',foDone=false;
      const live=()=>!options.signal?.aborted&&Boolean(this.link()||link);
      if(!live())return {done:0,cancelled:true};
      const size=Host.onProbeProgress?32:4,queue=[],completed=new Set(),seenKeys=new Set(keys),callbacks=onProg?[onProg]:[];
      const state={done:0,total:keys.length,failed:0,started:now()};
      for(let i=0;i<keys.length;i+=size)queue.push(keys.slice(i,i+size));
      this._activeScan={size,queue,seenKeys,state,callbacks};
      this.prog=state;Bus.emit('pool');
      const one=async part=>{
        const curLink=this.link();if(curLink)link=curLink;
        const partRes=[];
        const accept=async(k,result)=>{
          if(!live())return;
          partRes.push({k,result});
          await this.mutate(d=>{
            if(live()&&d.ips[k]&&!d.ips[k].gone&&!this.banned(k)){
              this.apply(d,k,result);
              const risky=typeof IPRep!=='undefined'&&!IPRep.trusted?.(k)&&Boolean(IPRep.risky?.(k,d.ips[k]));
              const challenge=result?.status===403||result?.status===503||/验证页|验证拦截/i.test(String(result?.error||''));
              if(risky||challenge){
                this.banForever(d,k,risky?'高风险 · 已永久拉黑':'验证拦截 · 已永久拉黑');
              }
            }
          });
          if(!live()||completed.has(k))return;completed.add(k);done++;
          if(result.ip&&result.brana){okSeen++;consecFail=0;}else{failed++;consecFail++;}
          Object.assign(state,{done,failed});Bus.emit('pool');
          for(const cb of callbacks){try{cb(done,state.total);}catch{}}
        };
        const r=await this.streamProbe(part,{link,timeout:12000,signal:options.signal,cancelled:()=>!live(),onItem:accept});
        // 同批连通但尚未拿到纯净度评分的出口：立即批量补评并清理高风险 IP
        if(live()&&typeof IPRep!=='undefined'&&(Host.fetchText||Host.ippureDirect)){
          const isManualPing=keys.length<=4;
          const unrated=part.filter(k=>{const e=this.d?.ips?.[k];if(!e||e.ok!==true||e.gone||this.banned(k)||IPRep.trusted?.(k))return false;if(isManualPing)return true;const eg=IPRep.egOf?.(k,e)||e.eg||k;const pu=this.d?.rep?.[eg]?.pu;return !IPRep.score?.(k,e).known||!pu||pu.basicOnly;});
          if(unrated.length){await IPRep.rate(unrated,[],{force:isManualPing}).catch(()=>{});IPRep.invalidate?.();await this.purgeImpureAndUnstable().catch(()=>{});}
        }
        return r;
      };
      const worker=async()=>{while(queue.length&&!fatal&&live()){
        const part=queue.shift();let r=await one(part);if(!live())return;
        if(r?.cancelled){fatal=r.error||'检测已取消';return;}
        // Explicit UI refresh opts out of legacy automatic node failover.
        if(options.allowFailover!==false&&!foDone&&((!Array.isArray(r)&&/节点|xray/.test(r?.error||'')&&Nodes.list.length>1)||(part.length>=6&&Array.isArray(r)&&r.every(x=>!x.ip&&x.via!=='direct-check')))&&this.entries().some(([k,e])=>e.ok&&!part.includes(k))){
          foDone=true;const f=await this.failover();if(f.ok){link=this.link();r=await one(part);}
        }
        if(!Array.isArray(r)){fatal=r?.error||'检测失败';return;}
        if(consecFail>=24&&okSeen===0){fatal='连续 '+consecFail+' 个候选连接失败，已自动停止全量扫描（可直接使用节点自身代理兜底）';return;}
      }};
      try{await Promise.all(Array.from({length:Math.min(2,queue.length)},worker));if(!live())return {done,cancelled:true};if(fatal)throw Error(fatal);return {done};}
      finally{if(this._activeScan?.state===state)this._activeScan=null;if(this.prog===state){this.prog=null;Bus.emit('pool');}}
    };
    const scheduled=(this.job||Promise.resolve()).catch(()=>{}).then(run);
    const tracked=scheduled.finally(()=>{if(this.job===tracked)this.job=null;});this.job=tracked;return tracked;
  },
  // ---- 查询 ----
  usedMap() { const m = new Map(); for (const a of Nodes.accts) if (a.proxyIp) m.set(String(a.proxyIp).trim().toLowerCase(), a); return m; },
  // 别的账号占用的出口：ProxyIP 本身、去端口的 IP、检测到的出口 IP（e.eg）都算 —— 不同账号的窗口永远不共用同一个 IP
  occ(exceptId) {
    const x = exceptId || '', c = this._occ, sig = (Nodes.accts || []).map(a => a && a.id + '=' + (a.proxyIp || '')).join('|');
    if (c && c.sig === sig && c.d === this.d && c.x === x) return c.m;
    const m = new Map(), add = (v, a) => { v = String(v || '').trim().toLowerCase(); if (v && !m.has(v)) m.set(v, a); };
    for (const a of Nodes.accts || []) {
      if (!a || a.id === exceptId) continue;
      const k = String(a.proxyIp || '').trim(); if (!k) continue;
      add(k, a); add(this.parse(k)?.host, a); add(this.d?.ips?.[k]?.eg, a);
    }
    this._occ = { sig, d: this.d, x, m }; return m;
  },
  owner(k, exceptId) {
    const m = this.occ(exceptId);
    if (!m.size) return null;
    const e = this.d?.ips?.[k], low = String(k).trim().toLowerCase();
    return m.get(low) || m.get(String(e?.ip || this.parse(k)?.host || '').toLowerCase()) || (e?.eg && m.get(String(e.eg).toLowerCase())) || null;
  },
  cooling: e => (e.cool || 0) > now(),
  // 黑名单（手动或自动永久拉黑的非纯净/失效 IP）：永远不分配；单独存，IP 从域名或 API 里消失再出现也永久拦截
  banned(k) {
    const low = String(k || '').trim().toLowerCase();
    if (!low) return false;
    if (this.d?.ban?.[low]) return true;
    const eg = String(this.d?.ips?.[k]?.eg || '').trim().toLowerCase();
    if (eg && this.d?.banEg?.[eg]) return true;
    return false;
  },
  setBan(k, on) { return this.mutate(d => { d.ban ||= {}; const x = String(k).toLowerCase(); if (on) d.ban[x] = now(); else delete d.ban[x]; }); },
  state(k, e, exceptId) {
    if (this.banned(k)) return 'ban';
    if (e.ok == null) return 'wait';
    if (e.ok === false || e.gone) return 'bad';
    if (IPRep.risky(k, e)) return 'risk';   // 纯净度低于阈值：不分配（可在列表里对单个 IP 点「信任」）
    if (IPRep.pure && !IPRep.pure(k, e)) return IPRep.score?.(k, e).known ? 'mid' : 'rate';   // 只有已评估且纯净的才能分配 / 选择
    if (this.cooling(e)) return 'cool';
    if (this.owner(k, exceptId)) return 'used';
    return 'ok';
  },
  entries() { return Object.entries(this.d?.ips || {}); },
  // 地区统计：{ JP: {ok, cool, used, all} ... }
  regions(exceptId) {
    const r = {};
    for (const [k, e] of this.entries()) {
      if (e.ok !== true || e.gone || !e.loc) continue;
      const x = r[e.loc] ||= { cc: e.loc, ok: 0, cool: 0, used: 0, all: 0, min: 0 }; x.all++;
      const s = this.state(k, e, exceptId); if (s === 'ok' && e.ms > 0 && (!x.min || e.ms < x.min)) x.min = e.ms;
      if (s === 'ok') x.ok++; else if (s === 'cool') x.cool++; else if (s === 'used') x.used++;
    }
    // 域名已确认可用、但这个地区的 IP 还没逐个测：也作为地区选项（选中后再按需检测）
    for (const l of this.domains()) { const dm = this.d?.dom?.[l]; if (!dm?.ok || !dm.loc) continue; const x = r[dm.loc] ||= { cc: dm.loc, ok: 0, cool: 0, used: 0, all: 0, min: 0 }; x.dom = (x.dom || 0) + 1; if (!x.min && dm.ms) x.min = dm.ms; }
    return Pool.sortRegions(Object.values(r));
  },
  // 地区排序：按国家名称 / 按延迟（最低延迟），设置在「代理设置」里切换，所有地区列表共用
  get sortBy() { return Store.get('pool:sort', 'name') === 'ms' ? 'ms' : 'name'; },
  set sortBy(v) { Store.set('pool:sort', v === 'ms' ? 'ms' : 'name'); Bus.emit('pool'); },
  sortRegions(list) {
    const byName = (a, b) => REGION_NAME(a.cc).localeCompare(REGION_NAME(b.cc), 'zh-Hans-CN') || a.cc.localeCompare(b.cc);
    return list.sort(this.sortBy === 'ms' ? (a, b) => (a.min || 9e9) - (b.min || 9e9) || byName(a, b) : byName);
  },
  avail(cc, exceptId, exclude) {
    const tNow = now();
    const subCool = this.d?.subCool || {};
    const isSubCold = (k, e) => {
      const sub = typeof IPRep !== 'undefined' && IPRep.subnetOf ? IPRep.subnetOf(e?.eg || k) : '';
      return !(sub && subCool[sub] > tNow);
    };
    const sortFn = (a, b) => {
      const subA = isSubCold(a[0], a[1]) ? 1 : 0;
      const subB = isSubCold(b[0], b[1]) ? 1 : 0;
      if (subB !== subA) return subB - subA;
      const scA = typeof IPRep !== 'undefined' && IPRep.score?.(a[0], a[1])?.known ? Math.round(IPRep.score?.(a[0], a[1]).s) : -1;
      const scB = typeof IPRep !== 'undefined' && IPRep.score?.(b[0], b[1])?.known ? Math.round(IPRep.score?.(b[0], b[1]).s) : -1;
      if (scB !== scA) return scB - scA;
      const kdRank = x => { const c = typeof IPRep !== 'undefined' ? IPRep.kind?.(...x)?.c : ''; return c === 'res' ? 3 : c === 'mob' ? 2 : c === 'dc' ? 1 : 0; };
      const kdDiff = kdRank(b) - kdRank(a);
      if (kdDiff !== 0) return kdDiff;
      const passA = typeof IPRep !== 'undefined' && IPRep.hasRecentPass?.(a[0], a[1], 6 * 3600e3) ? 1 : 0;
      const passB = typeof IPRep !== 'undefined' && IPRep.hasRecentPass?.(b[0], b[1], 6 * 3600e3) ? 1 : 0;
      if (passB !== passA) return passB - passA;
      return (a[1].ms || 9e9) - (b[1].ms || 9e9) || (a[1].used || 0) - (b[1].used || 0);
    };
    const tier1 = this.entries()
      .filter(([k, e]) => e.loc === cc && this.state(k, e, exceptId) === 'ok' && !(exclude && exclude.has(k)))
      .sort(sortFn)
      .map(([k]) => k);
    if (tier1.length) return tier1;
    // 二级兜底：当该地区 ≥75 分的 IP 均在冷却时，允许启用 58~74 分且近期 0 人机/0 限流、未冷却、未被占用的稳定 IP，避免无 IP 可用
    return this.entries()
      .filter(([k, e]) => {
        if (!e || e.loc !== cc || e.ok !== true || e.gone || this.banned(k) || this.cooling(e) || this.owner(k, exceptId)) return false;
        if (exclude && exclude.has(k)) return false;
        const sc = typeof IPRep !== 'undefined' && IPRep.score ? IPRep.score?.(k, e) : null;
        return Boolean(sc && sc.known && sc.s >= 58 && !IPRep.isToxicBanIp?.(e.eg || k));
      })
      .sort(sortFn)
      .map(([k]) => k);
  },
  // 跨所有国家挑选纯净、稳定、可用的最低延迟 ProxyIP（超过 2 次网络问题时直接用全库最低延迟可用 IP）
  availAllPureLowestLatency(exceptId, exclude) {
    return this.entries()
      .filter(([k, e]) => e && e.ok === true && !e.gone && !this.banned(k) && this.state(k, e, exceptId) === 'ok' && !(exclude && exclude.has(k)))
      .sort((a, b) => {
        if (typeof IPRep !== 'undefined' && IPRep.kind) {
          const ka = IPRep.kind?.(...a)?.c === 'res' ? 1 : 0;
          const kb = IPRep.kind?.(...b)?.c === 'res' ? 1 : 0;
          if (kb !== ka) return kb - ka;
        }
        return (a[1].ms || 9e9) - (b[1].ms || 9e9) || (typeof IPRep !== 'undefined' && IPRep.rank ? IPRep.rank(...b) - IPRep.rank(...a) : 0);
      })
      .map(([k]) => k);
  },
  earliest(cc) { let t = 0; for (const [, e] of this.entries()) if (e.loc === cc && e.ok && !e.gone && this.cooling(e) && (!t || e.cool < t)) t = e.cool; return t; },
  // 账号当前 IP 还能不能继续用（地区一致、检测通过、没被别人占）
  keeps(a, cc) { const k = a.proxyIp && String(a.proxyIp).trim(), e = k && this.d?.ips[k]; return !!(e && e.ok && !e.gone && e.loc === cc && !this.banned(k) && !this.owner(k, a.id) && !(!(IPRep.pure ? IPRep.pure(k, e) : !IPRep.risky(k, e)) && this.avail(cc, a.id, new Set([k])).length)); },   // 高风险且同地区有更干净的 → 不再沿用
  // 刚检测过（10 分钟内）、可用、没被占的 ProxyIP：「使用 Google 添加账号」直接用它，不再重新检测一遍
  fresh(k, cc, exceptId) { const e = k && this.d?.ips[k]; return !!(e && e.loc === cc && this.state(k, e, exceptId) === 'ok' && now() - (e.at || 0) < 10 * 60e3); },
  pickSync(cc, a) { if (this.keeps(a, cc)) return String(a.proxyIp).trim(); return this.avail(cc, a.id)[0] || ''; },
  // ---- 地区绑定：一个地区只给一个账号 ----
  regionOwner(cc, exceptId) { return cc ? (Nodes.accts || []).find(x => x.id !== exceptId && x.region === cc && isVless(x.proxy)) || null : null; },
  freeRegions(exceptId, skip) { return this.regions(exceptId).filter(r => (r.ok > 0 || r.dom > 0) && !this.regionOwner(r.cc, exceptId) && !(skip && skip.has(r.cc))); },
  // 延迟最低、没人绑定的地区
  bestFree(exceptId, skip) { const f = this.freeRegions(exceptId, skip); return f.sort((a, b) => (a.min || 9e9) - (b.min || 9e9))[0]?.cc || ''; },
  randomFree(exceptId, skip) { const f = this.freeRegions(exceptId, skip); return f.length ? f[Math.floor(Math.random() * f.length)].cc : ''; },
  // 强制把地区让出来：原来绑定这个地区的账号改回默认代理（地区清空）
  async release(o) { if (!o) return; await Host.saveAccount({ id: o.id, proxy: '', proxyIp: '', nodeId: '', region: '' }); await Nodes.refreshAccts(); Bus.emit('pool'); },
  // ---- 分配 / 轮换 ----
  canRotate(a) { if (typeof RouteState !== 'undefined' && (RouteState.locked(a) || RouteState.mode(a) === 'node')) return false; return !!(this.d?.auto && a && !this.switching.has(a.id) && a.region && isVless(a.proxy) && Host.probe && this.link()); },
  // 在地区里挑一个 IP：域名来源先重新解析 → 一次并发实测 3 个候选（能连 + Brana 正常 + 出口地区一致，7 秒超时）→ 最快的那个直接保存到账号。
  // 连续失败多了 / 没得挑了：把这个地区用到的域名重新解析、检测新 IP，再接着挑（失效太多时自动更新 IP 库）
  async acquire(a, cc, options = {}) {
    if (RouteState.locked(a) || (!options?.allowNodeMode && RouteState.mode(a) === 'node')) return { ok: false, error: '认证锁或固定节点模式禁止通过共享节点池改换出口，请使用当前账号的节点选择' };
    if(this.switching.has(a.id))return {ok:false,wait:now()+5000,error:'该账号正在切换 IP，请稍后重试'};
    this.switching.add(a.id);
    try{return await this.acquire0(a,cc,options);}finally{this.switching.delete(a.id);}
  },
  async acquire0(a, cc, { exclude = new Set(), log, prefer = '', noScreen = false, allowNodeMode = false } = {}) {
    await Nodes.refreshAccts(); await this.load(true);
    const ownRoute = Boolean(isVless(a.proxy) && (allowNodeMode || (typeof AutoRoute !== 'undefined' && AutoRoute.enabled()) || (typeof RouteState !== 'undefined' && RouteState.mode?.(a) === 'node')));
    const link = ownRoute ? a.proxy : this.link(), node = ownRoute ? Nodes.get(a.nodeId) : this.node(); if (!link) return { ok: false, error: '没有设置 VLESS 节点' };
    const tried = new Set(exclude); let fails = 0, healed = false, foTried = false, fills = 0;
    for (let round = 0; round < 10; round++) {
      let cands = this.avail(cc, a.id, tried);
      if (prefer && !tried.has(prefer) && this.d.ips[prefer] && this.state(prefer, this.d.ips[prefer], a.id) === 'ok') cands = [prefer, ...cands.filter(k => k !== prefer)];
      cands = cands.slice(0, 3);
      if (!cands.length || (fails >= 3 && !healed)) {
        if (!this.prog && fills < 1 && !this.avail(cc, a.id, tried).length) { fills++; if (fails >= 3) { healed = true; fails = 0; } log?.(regionLabel(cc) + '：按需补充候选 IP…'); const n = await this.fill(cc, { want: 3, log }).catch(() => 0); if (n || this.avail(cc, a.id, tried).length) continue; }
        if (!healed) healed = true;
        // 检测过还是一个都不通：多半是节点坏了 → 自动换节点，再从头挑一次
        if (!foTried && fails >= 3 && Nodes.list.length > 1) { foTried = true; const f = await this.failover({ log }); if (f.ok) { tried.clear(); exclude.forEach(k => tried.add(k)); fails = 0; healed = false; continue; } }
        break;
      }
      cands.forEach(k => tried.add(k));
      // 切换 IP 直接在已验证纯净池中秒切，不再重新解析域名来源
      if (typeof IPRep !== 'undefined' && IPRep.rate) {
        const unrated = cands.filter(k => this.d.ips[k] && !IPRep.score?.(k, this.d.ips[k]).known);
        if (unrated.length) await IPRep.rate(unrated).catch(() => {});
        cands = cands.filter(k => this.d.ips[k] && this.state(k, this.d.ips[k], a.id) === 'ok');
      }
      cands = cands.filter(k => this.d.ips[k] && !this.d.ips[k].gone); if (!cands.length) continue;
      const r = ownRoute ? await Host.probe({ link, pips: cands, timeout: 7000 }) : await this.hostProbe(cands, 7000), link2 = ownRoute ? link : this.link();
      if (!Array.isArray(r) && /节点|xray|平台/.test(r?.error || '')) {
        if (!foTried && Nodes.list.length > 1) { foTried = true; const f = await this.failover({ log }); if (f.ok) { cands.forEach(k => tried.delete(k)); continue; } }
        return { ok: false, error: r.error };
      }
      const res = cands.map((k, j) => [k, Array.isArray(r) ? (r.find(x => x.pip === k) || r[j] || {}) : { error: r?.error || '检测失败' }]);
      const nodeAliveForBatch = this.isNodeConfirmedAlive(link, Array.isArray(r) ? r : null);
      await this.mutate(d => {
        for (const [k, x] of res) {
          this.apply(d, k, x);
          if (!(x.ip && x.brana)) {
            if (nodeAliveForBatch || x.ip || x.via === 'direct-check') {
              const ent = d.ips?.[k];
              const fc = ent ? (ent.fc || 0) : 1;
              if (fc >= 3) this.banForever(d, k, '节点正常但该 ProxyIP 连续 3 次不可用 · 已永久拉黑');
              else if (ent) { ent.cool = Math.max(ent.cool || 0, now() + 10 * 60e3); }
            }
          } else if (x.loc && x.loc !== cc && d.ips[k]) {
            d.ips[k].err = '出口地区是 ' + x.loc;
          }
        }
      });
      if (typeof IPRep !== 'undefined' && IPRep.rate && Host.fetchText) {
        const postUnrated = res.filter(([k, x]) => x.ip && x.brana && this.d.ips[k] && !IPRep.score?.(k, this.d.ips[k]).known).map(([k]) => k);
        if (postUnrated.length) await IPRep.rate(postUnrated).catch(() => {});
      }
      const good = res.filter(([k, x]) => {
        if (!(x.ip && x.brana && (!x.loc || x.loc === cc))) return false;
        if (this.banned(k)) return false;
        if (typeof IPRep !== 'undefined') {
          const e = this.d?.ips?.[k];
          if (IPRep.risky?.(k, e) || IPRep.impure?.(k, e)) return false;
          if (IPRep.pure && !IPRep.pure(k, e)) return false;
        }
        return true;
      }).sort((p, q) => {
        if (typeof IPRep !== 'undefined' && IPRep.rank) {
          const rd = IPRep.rank(q[0], this.d?.ips?.[q[0]]) - IPRep.rank(p[0], this.d?.ips?.[p[0]]);
          if (Math.abs(rd) >= 0.3) return rd;
        }
        return (p[1].ms || 9e9) - (q[1].ms || 9e9);
      });
      for (const [k, x] of res) if (!good.find(g => g[0] === k)) { fails++; log?.('ProxyIP ' + k + (x.ip && x.brana && x.loc && x.loc !== cc ? ' 出口地区是 ' + x.loc + '（不是 ' + cc + '）' : ' 不可用（' + (x.error || '超时') + '，已拉黑）') + '，换下一个'); }
      for (const [k, x] of good) {
        const nd = (ownRoute ? node : this.node()) || node || { id: a.nodeId || '' }, lk = link2 || link;
        try { await Host.saveAccount({ id: a.id, proxy: lk, nodeId: nd.id, region: cc, proxyIp: k }); }
        catch (err) { log?.('ProxyIP ' + k + '：' + cleanErr(err)); await Nodes.refreshAccts(); continue; }
        await this.mutate(d => { if (d.ips[k]) d.ips[k].used = now(); });
        await Nodes.refreshAccts(); Object.assign(a, { proxy: lk, nodeId: nd.id, region: cc, proxyIp: k });
        return { ok: true, to: k, ip: x.ip, loc: x.loc || cc, ms: x.ms };
      }
    }
    const wait = this.earliest(cc);
    // 一个非高风险的都没有：弹窗一直筛选到出现为止，再用它
    if (!wait && !noScreen && typeof IPRep !== 'undefined' && IPRep.screen && typeof document !== 'undefined') {
      const sr = await IPRep.screen(cc, { exceptId: a.id });
      if (sr.ok) return this.acquire0(a, cc, { log, prefer: sr.keys[0], noScreen: true });
      if (sr.cancelled) return { ok: false, error: '已取消筛选，未切换' };
    }
    return { ok: false, wait, error: wait ? '这个地区的 ProxyIP 都在冷却' : '这个地区没有可用的 ProxyIP' };
  },
  // 修复一个地区（或全部）：重新解析相关域名 → 检测新出现的 / 之前失败的 IP
  async heal(cc) {
    if (cc) return this.fill(cc, { want: 3 });
    const r = await this.probeDomains().catch(() => null);
    return r?.done || 0;
  },
  async healAll(cc) {
    const srcs = [...new Set(this.entries().filter(([, e]) => e.src && (!cc || e.loc === cc)).map(([, e]) => e.src))];
    const add = [];
    for (const l of srcs) { const r = await this.refreshSrc(l, true).catch(() => null); for (const k of r?.added || []) add.push(k); }
    const redo = this.entries().filter(([k, e]) => !e.gone && !this.banned(k) && e.ok == null).map(([k]) => k);
    const keys = [...new Set([...add, ...redo])].slice(0, cc ? 60 : 2000);
    if (keys.length && this.link() && Host.probe) await this.probe(keys);
    return keys.length;
  },
  // ---- 节点：自动挑选 / 不通自动切换 ----
  // 用池里几个已知地区的可用 ProxyIP 测一个节点：能连 + Brana 正常 + 出口地区和记录一致（说明这个节点支持 ProxyIP）才算能用
  async nodeOk(n, timeout = 8000) {
    const link = Vless.toLink(n), refs = this.entries().filter(([, e]) => e.ok && !e.gone && e.loc).sort((a, b) => (a[1].ms || 9e9) - (b[1].ms || 9e9)).slice(0, 3);
    if (refs.length && Host.probe) {
      const r = await Host.probe({ link, pips: refs.map(([k]) => k), timeout }).catch(e => ({ error: cleanErr(e) }));
      if (!Array.isArray(r)) return { ok: false, error: r?.error || '失败' };
      const hit = refs.map(([k, e], i) => [e, r.find(x => x.pip === k) || r[i] || {}]).filter(([e, x]) => x.ip && x.brana && (!x.loc || x.loc === e.loc));
      return hit.length ? { ok: true, ms: Math.min(...hit.map(([, x]) => x.ms || 9e9)) } : { ok: false, error: (r[0]?.error) || '不通 / 不支持 ProxyIP' };
    }
    const t = await Host.testIp({ proxy: link, proxyIp: '' }).catch(e => ({ error: cleanErr(e) }));
    // 池里还没有测过的 ProxyIP：节点能直连 Brana，或节点本身通（CF 类节点缺 ProxyIP 时到 Brana 会被关）都算能用
    return t?.ip || t?.code === 'needPip' ? { ok: true, weak: !t?.ip } : { ok: false, error: t?.error || '失败' };
  },
  // 在给定节点里挑第一个能用的，设为全局节点（导入节点后 / 还没选节点时）
  async autoNode(list, { log } = {}) {
    await Nodes.load(); await this.load(true);
    let cands = (list || Nodes.list).filter(n => n && n.id && Nodes.get(n.id) && !(this.bad?.get(n.id) > now()));
    // 先用 url-test 并发测一遍延迟，按延迟排序、跳过不通的，再逐个确认 Brana —— 不再按订阅顺序一个个串行试
    if (typeof NodeSpeed !== 'undefined' && Host.urlTest) { log?.('并发测速 ' + cands.length + ' 个节点…'); await NodeSpeed.test(cands).catch(() => {}); const s = NodeSpeed.sort(cands), up = s.filter(n => NodeSpeed.get(n)?.ok); cands = up.length ? up : s; }
    cands = cands.slice(0, 15);
    for (const n of cands) {
      log?.('测试节点 ' + (n.name || n.address) + '…');
      const r = await this.nodeOk(n);
      if (r.ok) { await this.setNode(n.id); if (!this.entries().some(([, e]) => e.ok)) this.heal().catch(() => {}); return { ok: true, node: n }; }
      (this.bad ||= new Map()).set(n.id, now() + 10 * 60e3);
    }
    return { ok: false };
  },
  // 从订阅的节点里挑最合适的：并发实测（3 路，最多 10 个），能用的里面挑延迟最低的设为全局节点
  async bestNode({ log } = {}) {
    await Nodes.load(); if (!Nodes.subsLoaded) await Nodes.loadSubs(); await this.load();
    const subs = new Set((Nodes.subs || []).map(s => s.url));
    let list = Nodes.list.filter(n => subs.size ? subs.has(n.sub) : true); if (!list.length) list = Nodes.list.slice();
    list = list.filter(n => !(this.bad?.get(n.id) > now())).slice(0, 10);
    if (!list.length) return { ok: false };
    const good = []; let i = 0, done = 0;
    const worker = async () => {
      while (i < list.length) {
        const n = list[i++];
        const r = await this.nodeOk(n, 7000).catch(() => ({ ok: false }));
        done++; log?.('测试节点 ' + done + '/' + list.length + (good.length ? '（已有 ' + (good.length + (r.ok ? 1 : 0)) + ' 个能用）' : '') + '…');
        if (r.ok) good.push([n, r]); else (this.bad ||= new Map()).set(n.id, now() + 10 * 60e3);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (!good.length) return { ok: false };
    good.sort((p, q) => ((p[1].weak ? 1 : 0) - (q[1].weak ? 1 : 0)) || (p[1].ms || 9e9) - (q[1].ms || 9e9));
    const best = good[0][0];
    if (this.d.node !== best.id) await this.setNode(best.id);
    if (!this.entries().some(([, e]) => e.ok)) this.heal().catch(() => {});
    return { ok: true, node: best, ms: good[0][1].ms, good: good.length, tested: list.length };
  },
  // 当前节点不通：按顺序试节点库里的其它节点，第一个能用的直接切换（所有按地区的账号跟着换）；两次切换至少隔 30 秒
  async failover({ log } = {}) {
    if (typeof AutoRoute !== 'undefined' && AutoRoute.enabled()) return { ok: false, error: '自动选路按账号恢复，不自动批量更换全局节点' };
    if (this.foP) return this.foP;
    if (now() - (this.foAt || 0) < 30e3) return { ok: false, error: '刚切换过节点' };
    return this.foP = (async () => {
      try {
        await Nodes.load(); await this.load(true);
        const cur = this.d.node; (this.bad ||= new Map()).set(cur, now() + 10 * 60e3);
        const others = Nodes.list.filter(n => n.id !== cur);
        if (!others.length) return { ok: false, error: '节点库里没有其它节点' };
        log?.('当前节点不通，自动切换节点…');
        const r = await this.autoNode(others, { log });
        if (r.ok) { this.foAt = now(); toast('节点不通，已自动切换到 ' + (r.node.name || r.node.address)); }
        return r.ok ? r : { ok: false, error: '没有能用的节点' };
      } finally { this.foP = null; }
    })();
  },
  // ---- 注册专用 ProxyIP 冷却（30 分钟内注册过的 ProxyIP 不重复用于注册）----
  REG_COOL_MS: 30 * 60 * 1000,
  regLastUsed(k) {
    if (!k) return 0;
    const low = String(k).trim().toLowerCase(), host = String(this.parse(k)?.host || '').toLowerCase();
    const e = this.d?.ips?.[k] || this.d?.ips?.[low], eg = String(e?.eg || '').trim().toLowerCase();
    const rc = this.d?.regCool || {};
    return Math.max(+rc[low] || 0, host ? (+rc[host] || 0) : 0, eg ? (+rc[eg] || 0) : 0, +e?.regAt || 0);
  },
  regCoolRemaining(k, at = now()) {
    const usedAt = this.regLastUsed(k);
    return usedAt > 0 ? Math.max(0, (usedAt + this.REG_COOL_MS) - at) : 0;
  },
  isRegCooling(k, at = now()) {
    return this.regCoolRemaining(k, at) > 0;
  },
  markRegUsed(k, eg = '', at = now()) {
    if (!k) return Promise.resolve();
    const low = String(k).trim().toLowerCase(), host = String(this.parse(k)?.host || '').toLowerCase(), lowEg = String(eg || '').trim().toLowerCase();
    if (this.d) {
      this.d.regCool ||= {};
      this.d.regCool[low] = at;
      if (host) this.d.regCool[host] = at;
      if (lowEg) this.d.regCool[lowEg] = at;
      if (this.d.ips?.[k]) { this.d.ips[k].regAt = at; this.d.ips[k].used = at; }
    }
    return this.mutate(d => {
      d.regCool ||= {};
      d.regCool[low] = at;
      if (host) d.regCool[host] = at;
      if (lowEg) d.regCool[lowEg] = at;
      if (d.ips?.[k]) { d.ips[k].regAt = at; d.ips[k].used = at; }
      for (const [ck, ct] of Object.entries(d.regCool)) {
        if (at - (+ct || 0) > this.REG_COOL_MS * 4) delete d.regCool[ck];
      }
    });
  },
  regCandidateList(exceptId, excludeSet = new Set()) {
    const ex = excludeSet instanceof Set ? excludeSet : new Set(Array.isArray(excludeSet) ? excludeSet : []);
    return this.entries().filter(([k, e]) => {
      if (!e || e.gone || e.ok === false || this.banned(k) || this.cooling(e)) return false;
      if (typeof IPRep !== 'undefined' && IPRep.risky?.(k, e)) return false;
      if (this.owner(k, exceptId)) return false;
      const low = String(k).trim().toLowerCase(), host = String(this.parse(k)?.host || '').toLowerCase(), eg = String(e.eg || '').trim().toLowerCase();
      if (ex.has(k) || ex.has(low) || (host && ex.has(host)) || (eg && ex.has(eg))) return false;
      return true;
    });
  },
  regAvail(exceptId, excludeSet = new Set(), at = now()) {
    return this.regCandidateList(exceptId, excludeSet)
      .filter(([k, e]) => e.ok === true && !this.isRegCooling(k, at))
      .sort((a, b) => (typeof IPRep !== 'undefined' && IPRep.rank ? IPRep.rank(...b) - IPRep.rank(...a) : 0) || ((a[1].regAt || a[1].used || 0) - (b[1].regAt || b[1].used || 0)) || ((a[1].ms || 9e9) - (b[1].ms || 9e9)));
  },
  earliestRegCoolWait(exceptId, excludeSet = new Set(), at = now()) {
    let minRem = 0;
    for (const [k] of this.regCandidateList(exceptId, excludeSet)) {
      const rem = this.regCoolRemaining(k, at);
      if (rem > 0 && (!minRem || rem < minRem)) minRem = rem;
    }
    return minRem;
  },
  async acquireForRegistration(acct, { exclude = new Set(), log } = {}) {
    try { await Nodes.load(); await this.load(true); await Nodes.refreshAccts(); } catch {}
    if (!this.node() && Nodes.list?.length) await this.autoNode(Nodes.list, { log }).catch(() => null);
    if (!this.entries().length && typeof this.seed === 'function') await this.seed().catch(() => {});
    const exceptId = acct?.id || '';
    const callerEx = new Set([...(exclude instanceof Set ? exclude : Array.isArray(exclude) ? exclude : [])].map(x => String(x || '').trim().toLowerCase()).filter(Boolean));
    const ex = new Set(callerEx);
    for (let round = 0; round < 4; round++) {
      let avail = this.regAvail(exceptId, ex);
      if (!avail.length) {
        const untested = this.regCandidateList(exceptId, ex).filter(([k, e]) => e.ok == null && !this.isRegCooling(k)).map(([k]) => k).slice(0, 10);
        if (!untested.length && round === 0) {
          for (const dom of this.domains().slice(0, 4)) await this.refreshSrc(dom).catch(() => {});
        }
        const toProbe = untested.length ? untested : this.regCandidateList(exceptId, ex).filter(([k, e]) => e.ok == null && !this.isRegCooling(k)).map(([k]) => k).slice(0, 10);
        if (toProbe.length && this.link() && Host.probe) {
          log?.('正在检测 ' + toProbe.length + ' 个未冷却候选 ProxyIP…');
          await this.probe(toProbe).catch(() => {});
          avail = this.regAvail(exceptId, ex);
        }
      }
      if (!avail.length) break;
      const batch = avail.slice(0, 3).map(([k]) => k);
      batch.forEach(k => { ex.add(k); ex.add(k.toLowerCase()); });
      const link = this.link(), nd = this.node();
      if (!link || !Host.probe) {
        const [k, e] = avail[0];
        await this.markRegUsed(k, e.eg || '');
        return { ok: true, proxy: link || acct?.proxy || '', nodeId: nd?.id || acct?.nodeId || '', proxyIp: k, ip: e.eg || k.split(':')[0], region: e.loc || acct?.region || 'US', ms: e.ms || 0 };
      }
      log?.('正在实测验证注册 ProxyIP（' + batch.join('、') + '）…');
      const r = await this.hostProbe(batch, 8000);
      if (!Array.isArray(r)) continue;
      const res = batch.map((k, j) => [k, r.find(x => x.pip === k) || r[j] || {}]);
      await this.mutate(d => { for (const [k, x] of res) this.apply(d, k, x); });
      const good = res.filter(([k, x]) => {
        if (!(x.ip && x.brana)) return false;
        if (this.owner(k, exceptId) || this.owner(x.ip, exceptId)) return false;
        if (this.isRegCooling(k) || this.isRegCooling(x.ip)) return false;
        if (callerEx.has(String(x.ip).toLowerCase())) return false;
        return true;
      }).sort((p, q) => (p[1].ms || 9e9) - (q[1].ms || 9e9));
      if (good.length) {
        const [k, x] = good[0];
        const e = this.d?.ips?.[k] || {};
        await this.markRegUsed(k, x.ip || e.eg || '');
        return { ok: true, proxy: this.link() || link, nodeId: this.node()?.id || nd?.id || '', proxyIp: k, ip: x.ip || e.eg || '', region: x.loc || e.loc || 'US', ms: x.ms || e.ms || 0 };
      }
    }
    const waitMs = this.earliestRegCoolWait(exceptId, exclude);
    const coolMs = waitMs > 0 ? waitMs : 60 * 1000;
    return {
      ok: false,
      cooling: true,
      waitMs: coolMs,
      readyAt: now() + coolMs,
      error: waitMs > 0 ? '可用 ProxyIP 均在 30 分钟注册冷却中' : '当前可用 ProxyIP 已用尽，正在等待 30 分钟冷却结束',
    };
  },
  // 全局节点换了：所有使用节点的账号同步切换（共用节点，各自独立保留不同的 ProxyIP）
  async setNode(id) {
    await this.mutate(d => { d.node = id; });
    const n = Nodes.get(id); if (!n) return 0;
    const link = Vless.toLink(n); let c = 0;
    for (const a of await Nodes.refreshAccts()) {
      if (RouteState.locked(a) || (a.proxy && !isVless(a.proxy))) continue;
      if (a.proxy === link && a.nodeId === n.id) continue;
      try { await Host.saveAccount({ id: a.id, proxy: link, nodeId: n.id, region: a.region || '', proxyIp: a.proxyIp || '' }); c++; } catch (e) { toast(a.name + '：' + cleanErr(e), 'err'); }
    }
    await Nodes.refreshAccts(); return c;
  },
};
// 节点在编辑器里改了（propagate 会同步按地区的账号，因为它们记着 nodeId）；这里只需要刷新界面
Bus.on('nodes', () => Bus.emit('pool'));
// 安卓：把全局节点（不带 ProxyIP 的 xray 出站）下发给宿主 —— 没设代理的账号默认走它，不用开 Clash
Pool.gnode = () => { const n = Pool.node(); if (!n) return null; try { return { link: Vless.toLink(n), xout: JSON.stringify(Vless.outbound(n, '')), name: n.name || n.address || 'VLESS 节点' }; } catch { return null; } };
Pool.pushG = async () => {
  if (Host.platform !== 'android') return;
  try { await Nodes.load(); await Pool.load(); } catch { return; }
  const g = Pool.gnode(), k = JSON.stringify(g); if (k === Pool._gk) return;
  const first = Pool._gk === undefined; Pool._gk = k;
  let cur = null; if (first) { try { cur = await Host.shared('gnode'); } catch {} if (JSON.stringify(cur ?? null) === k) return; }
  await Host.shared('gnode', g).catch(() => {});
  if (!first) { try { UI.host = await Host.info(); UI.renderAcct?.(); } catch {} setTimeout(() => { try { IP.poll(); } catch {} }, 2000); }
};
if (Host.platform === 'android') Bus.on('pool', () => { Pool.pushG(); });
// 安卓：xray 出站由界面生成（与桌面同一份 vless.js）
if (Host.platform === 'android' && Host.probe) {
  const probe0 = Host.probe;
  Host.probe = async o => { const n = Vless.parse(o.link); if (!n) return { error: 'VLESS 节点链接不正确' }; const r = await probe0({ pips: o.pips, timeout: o.timeout, outs: o.pips.map(p => Vless.outbound(n, p)) }); return r; };
}

// ---------- 本机代理自动检测 ----------
// 常用代理软件的本地端口：扫一遍能连上的，再按 HTTP / SOCKS5 实测能不能访问 Brana
const LOCAL_PORTS = [7890, 7897, 10809, 10808, 18080, 17890, 7891, 7893, 7899, 1080, 1081, 1086, 1087, 2080, 2081, 12334, 20171, 20172, 20170, 8889, 6152, 6153, 3067, 4780, 8118, 10810, 33210, 8080, 8888];
const LOCAL_NAME = { 7890: 'Clash / Mihomo / FlClash', 7891: 'Clash SOCKS', 7893: 'Clash', 7897: 'Clash Verge', 7899: 'Clash Verge', 10808: 'v2rayN / v2rayNG', 10809: 'v2rayN / v2rayNG', 10810: 'v2rayN', 1080: 'Shadowsocks', 1081: 'Shadowsocks', 1086: 'ShadowsocksX', 1087: 'ShadowsocksX', 2080: 'NekoBox / sing-box', 2081: 'NekoBox', 12334: 'Hiddify', 20170: 'v2rayA', 20171: 'v2rayA', 20172: 'v2rayA', 8889: 'Qv2ray', 6152: 'Surge', 6153: 'Surge', 3067: 'Karing', 4780: 'Loon', 8118: 'Privoxy', 33210: 'Clash' };
const LocalProxy = {
  last: null, at: 0, p: null,
  can() { return !!Host.localScan; },
  // → [{ port, proxy, ip, loc, ms, name }]，按延迟排序；force = 不用 1 分钟内的缓存
  scan({ log, force } = {}) {
    if (!this.can()) return Promise.resolve([]);
    if (!force && this.last && now() - this.at < 60e3) return Promise.resolve(this.last);
    if (this.p) return this.p;
    return this.p = (async () => {
      try {
        log?.('正在扫描本机常用代理端口（' + LOCAL_PORTS.length + ' 个）…');
        const r = await Host.localScan(LOCAL_PORTS).catch(e => ({ error: cleanErr(e) }));
        const list = (Array.isArray(r?.list) ? r.list : []).map(x => ({ ...x, name: LOCAL_NAME[x.port] || '' })).sort((x, y) => (x.ms || 9e9) - (y.ms || 9e9));
        this.last = list; this.open = r?.open || []; this.at = now(); return list;
      } finally { this.p = null; }
    })();
  },
};

// ---------- 连接面板：「自动 / 节点 / 代理 / 直连」----------
// 自动：本机有能访问 Brana 的代理（Clash 7890 / 7897、v2rayN 10808 / 10809 等）→ 用本机代理；没有 → 有订阅就用节点；都没有 → 试直连；还不行提示粘贴订阅
// 节点：订阅地址（所有账号共用）+ 账号地区（右边齿轮 = ProxyIP 列表）。选地区 / 改订阅后自动：从订阅的节点里挑最合适的节点 →
//       在这个地区挑最快、没人用、没拉黑的 ProxyIP → 显示出口 IP。live（登录页）时检测通过直接应用到账号。
// 代理：本地代理地址（留空 = 默认 127.0.0.1:7890）；直连：不走代理。改了自动测出口。
// 对外接口和以前一样：mode（region / local / def / direct / node）、proxy、proxyIp、nodeId、region、err()、block()。
function proxyField(a = {}, opt = {}) {
  const measured = typeof NodeRoutes !== 'undefined' ? NodeRoutes.field(a, opt) : null; if (measured) return measured;
  const p0 = String(a.proxy || '').trim();
  const legacy = isVless(p0) && !a.region;
  let mode = a.region ? 'region' : !p0 ? 'def' : isDirectP(p0) ? 'direct' : isVless(p0) ? 'node' : 'local';
  // 安卓的「默认」就是全局节点：显示成「节点」（选了地区才会绑定 ProxyIP）
  let region = a.region || '', chosen = a.region ? String(a.proxyIp || '').trim() : '', touched = false;
  const live = !!(opt.live && a.id);
  let autoRun = false, autoNote = '';
  const tab = () => autoRun ? 'auto' : mode === 'region' || mode === 'node' || (mode === 'def' && Host.platform === 'android') ? 'node' : mode === 'direct' ? 'direct' : 'proxy';
  const segBtn = (k, t, tip) => h('button', { type: 'button', 'data-k': k, title: tip, onclick: () => setTab(k) }, t);
  const seg = h('div', { class: 'pseg', role: 'tablist' }, LocalProxy.can() ? segBtn('auto', '自动', '自动判断：本机有能用的代理（Clash / v2rayN 等）就先用本机代理；没有就用订阅节点；都没有再试直连') : null, segBtn('node', '节点', '订阅里的 VLESS 节点 + 按地区分配 ProxyIP（每个账号一个地区、各自的 IP）'), segBtn('proxy', '代理', '本机代理（Clash / FlClash 等），或 http / socks5 代理地址'), segBtn('direct', '直连', '不走代理，用本机网络'));
  // ----- 节点：订阅地址 -----
  const subIn = h('input', { class: 'psub', placeholder: '粘贴订阅地址（也可以直接粘贴 vless:// 链接）', spellcheck: false, autocomplete: 'off' });
  const subBtn = h('button', { type: 'button', class: 'ib', title: '重新获取订阅，并重新挑选最合适的节点', onclick: () => applySub(true) }, icon('refresh'));
  const subVal = () => (Nodes.subs || []).map(x => x.url).join(' ');
  let subShown = null;
  const fillSub = () => { const v = subVal(); if (document.activeElement !== subIn && subShown !== v) { subIn.value = v; subShown = v; } };
  subIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); subIn.blur(); } });
  subIn.addEventListener('change', () => applySub(false));
  // ----- 节点：账号地区 -----
  const regSel = h('button', { type: 'button', class: 'preg', title: '出口地区（一个地区只绑定一个账号）', onclick: () => openPick() });
  const pipBtn = h('button', { type: 'button', class: 'ib', title: 'ProxyIP 列表：查看 / 添加 / 刷新检测 / 拉黑', onclick: () => ProxySet.open() }, icon('gear'));
  // ----- 代理 -----
  const local = h('input', { class: 'plocal', value: mode === 'local' ? p0 : '', placeholder: Host.platform === 'android' ? '留空 = 默认（全局节点）；或 socks5://user:pass@host:port' : '留空 = 默认 127.0.0.1:7890；或 socks5://user:pass@host:port', spellcheck: false, autocomplete: 'off' });
  const lpBtn = h('button', { type: 'button', class: 'ib', title: '检测本机代理：扫描 Clash / v2rayN / sing-box 等常用端口，找能访问 Brana 的', onclick: () => scanLocal(false) }, icon('search'));
  const lpBox = h('div', { class: 'lpbox' });
  let lt = 0; local.addEventListener('input', () => { autoNote = ''; touched = true; mode = local.value.trim() ? 'local' : 'def'; sync(); clearTimeout(lt); lt = setTimeout(() => { if (!api.err()) check('proxy'); }, 900); });
  // ----- 出口 -----
  const outBox = h('div', { class: 'pg-out pout' });
  const reBtn = h('button', { type: 'button', class: 'ib', title: '重新检测出口 IP', onclick: () => check('manual') }, icon('pulse'));
  const say = (kind, ...kids) => { outBox.dataset.k = kind; outBox.replaceChildren(...K(kind === 'busy' ? h('i', { class: 'spin' }) : null, ...kids)); };
  const ipLine = (ip, loc, ms, extra) => K(h('span', { class: 'pout-ip mono' }, ip), loc ? h('span', { class: 'pout-loc' }, ccF(loc)) : null, ms ? h('small', {}, ms + 'ms') : null, extra ? h('small', { class: 'dim' }, extra) : null);
  const row = (lab, ...cells) => h('div', { class: 'pg-r' }, h('span', { class: 'pg-l' }, lab), ...cells);
  const span2 = el => { el.classList.add('pg-w'); return el; };
  const rowSub = row('订阅地址', subIn, subBtn), rowReg = row('账号地区', regSel, pipBtn), rowLocal = row('代理地址', local, LocalProxy.can() ? lpBtn : h('span')), rowLp = row('本机', span2(lpBox)), rowOut = row('出口', outBox, reBtn);
  const hint = h('div', { class: 'phint dim' }), rowHint = h('div', { class: 'pg-r pg-hint' }, h('span'), span2(hint));
  const grid = h('div', { class: 'pfield pgrid pgrid2' }, rowSub, rowReg, rowLocal, rowLp, rowOut, rowHint);
  const wrap = h('div', { class: 'pconn' }, seg, grid);
  const fillReg = () => {
    const rs = Pool.d ? Pool.regions(a.id) : [], cur = rs.find(r => r.cc === region);
    const ph = rs.some(r => r.ok > 0 || r.dom > 0) ? '自动选择最合适的地区' : Pool.d && Pool.entries().length ? '（暂无可用地区）' : '（ProxyIP 列表为空）';
    regSel.replaceChildren(h('span', { class: 'preg-t' }, region ? regionLabel(region) + ' · ' + (cur?.ok ? cur.ok + ' 可用' : cur?.dom ? '域名可用 · 选中后检测 IP' : '0 可用') + (cur?.min ? ' · ' + cur.min + 'ms' : '') : ph), icon('chev'));
  };
  // 地区选择：已被别的账号绑定的地区灰显，点它会问要不要强制切换（原账号的地区清空）
  const openPick = () => {
    const rs = Pool.d ? Pool.regions(a.id) : [];
    const list = h('div', { class: 'rpick' });
    const choose = async r => {
      const o = Pool.regionOwner(r.cc, a.id);
      if (o) {
        if (!await Dialog.confirm({ title: '强制切换地区', text: regionLabel(r.cc) + ' 已绑定给账号「' + emailUser(o) + '」。\n强制切换后，该账号的地区会被清空（改回默认代理），这个地区归当前账号。', ok: '强制切换', danger: true })) return;
        try { await Pool.release(o); } catch (e) { toast(cleanErr(e), 'err'); return; }
      }
      back.remove(); touched = true; mode = 'region'; region = r.cc; chosen = ''; fillReg(); sync(); opt.onRegion?.(region); check('region');
    };
    for (const r of rs) {
      const o = Pool.regionOwner(r.cc, a.id), none = !(r.ok > 0 || r.dom > 0) && r.cc !== region;
      list.append(h('button', { type: 'button', class: 'rp-row' + (r.cc === region ? ' on' : '') + (o ? ' taken' : '') + (none ? ' none' : ''), disabled: none || null, onclick: () => choose(r) },
        h('span', { class: 'rp-f' }, flagOf(r.cc) || '🌐'), h('span', { class: 'rp-n' }, h('b', {}, r.cc + ' ' + REGION_NAME(r.cc)), h('small', {}, (r.ok ? r.ok + ' 个 IP 可用' : r.dom ? '域名可用 · 选中后按需检测 IP' : '0 可用') + (r.min ? ' · 最低 ' + r.min + 'ms' : '') + (r.cool ? ' · ' + r.cool + ' 冷却' : ''))),
        o ? h('span', { class: 'rp-o' }, icon('user'), emailUser(o)) : r.cc === region ? icon('check', 'rp-ck') : null));
    }
    if (!rs.length) list.append(h('p', { class: 'note' }, Pool.d && Pool.entries().length ? '暂无可用地区' : 'ProxyIP 列表为空：点地区右边的齿轮添加'));
    const free = rs.filter(r => (r.ok > 0 || r.dom > 0) && !Pool.regionOwner(r.cc, a.id)).length;
    const auto = h('button', { type: 'button', class: 'rp-row rp-auto', onclick: () => { back.remove(); touched = true; mode = 'region'; region = ''; chosen = ''; fillReg(); check('region'); } }, h('span', { class: 'rp-f' }, '✨'), h('span', { class: 'rp-n' }, h('b', {}, '自动选择'), h('small', {}, '挑延迟最低、没人用的地区')));
    const back = modal('选择地区', K(h('div', { class: 'dim rp-sum' }, free + ' 个地区可选 · 灰色 = 已绑定给别的账号（点它可强制切换）'), auto, list), K(h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => back.remove() }, '取消')), 'small rpk');
    setTimeout(() => list.querySelector('.rp-row.on')?.scrollIntoView({ block: 'center' }), 30);
  };
  // 检测到的本机代理：一排可点的小卡片（端口 · 软件 · 出口国家 · 延迟），点一下就用它
  function paintLp(list) {
    const cur = local.value.trim();
    lpBox.replaceChildren(...(list || []).map(x => h('button', { type: 'button', class: 'lpchip' + (cur === x.proxy ? ' on' : ''), title: (x.name ? x.name + ' · ' : '') + x.proxy + ' · 出口 ' + (x.ip || '') + (x.loc ? ' ' + x.loc : ''), onclick: () => useLocal(x, '') },
      h('b', { class: 'mono' }, (/^socks/.test(x.proxy) ? 'socks5 ' : '') + x.port), x.name ? h('span', {}, x.name) : null, x.loc ? h('span', {}, ccF(x.loc)) : null, x.ms ? h('small', {}, x.ms + 'ms') : null)));
    rowLp.hidden = tab() !== 'proxy' || !lpBox.childElementCount;
  }
  function useLocal(x, note) {
    local.value = x.proxy; mode = 'local'; touched = true; autoNote = note ? note + x.proxy + (x.name ? '（' + x.name + '）' : '') + ' · 用本机代理的账号共用这个出口 IP（要各自独立 IP 用「节点」）' : '';
    sync(); paintLp(LocalProxy.last); check('proxy');
  }
  // fill = 地址还空着时直接用第一个能用的
  async function scanLocal(fill) {
    const my = ++seq; lpBtn.disabled = true;
    try {
      say('busy', '正在扫描本机代理端口…');
      const list = await LocalProxy.scan({ force: true }); if (my !== seq || !wrap.isConnected) return;
      paintLp(list);
      if (!list.length) { say('bad', LocalProxy.open?.length ? '本机端口 ' + LocalProxy.open.join('、') + ' 在监听，但都访问不了 Brana' : '本机常用代理端口上没有找到代理（Clash / v2rayN 等没开？）'); return; }
      if (fill && !local.value.trim()) useLocal(list[0], '已自动填入本机代理 ');
      else say('ok', '找到 ' + list.length + ' 个能用的本机代理，点下面的卡片使用');
    } finally { lpBtn.disabled = false; }
  }
  async function runAuto() {
    const my = ++seq, stale = () => my !== seq || !wrap.isConnected;
    autoRun = true; autoNote = ''; touched = true; sync();
    const list = await LocalProxy.scan({ force: true, log: t => { if (!stale()) say('busy', '自动判断：' + t); } });
    if (stale()) return;
    autoRun = false;
    if (list.length) { useLocal(list[0], '自动判断：本机代理可用，已使用 '); return; }
    await Promise.all([Nodes.load(), Pool.load(), Nodes.subsLoaded ? null : Nodes.loadSubs()]).catch(() => {}); if (stale()) return;
    if (Nodes.list.length) { mode = 'region'; chosen = ''; autoNote = '自动判断：本机没有可用代理 → 用订阅节点'; sync(); check('node'); return; }
    mode = 'direct'; sync(); say('busy', '自动判断：本机没有可用代理，正在测试直连…');
    const t = await Host.testIp({ ...a, proxy: 'direct', proxyIp: '', nodeId: '', region: '' }).catch(() => null); if (stale()) return;
    if (t?.ip) { autoNote = '自动判断：本机没有代理、也没有订阅，直连能访问 Brana → 用直连'; sync(); check('direct'); return; }
    mode = 'region'; autoNote = ''; sync(); say('bad', '自动判断：本机没有可用代理，直连也访问不了 Brana——请粘贴订阅地址（或在「代理」里填代理地址）'); setTimeout(() => subIn.focus(), 30);
  }
  function setTab(k) {
    if (k === 'auto') { runAuto(); return; }
    if (tab() === k && !(k === 'node' && mode !== 'region')) return;
    touched = true; autoNote = '';
    if (k === 'proxy' && !local.value.trim() && LocalProxy.can()) { mode = 'def'; sync(); scanLocal(true); return; }
    if (k === 'node') { mode = 'region'; chosen = ''; }
    else if (k === 'direct') mode = 'direct';
    else mode = local.value.trim() ? 'local' : 'def';
    sync(); check(k);
  }
  // 当前（没改过）时显示底栏的出口；改过之后显示检测结果
  function showCurrent() {
    if (touched) return;
    if (mode === 'node') { const n = Vless.parse(p0); say('dim', '旧设置：单独节点 ' + (n ? Vless.short(n) : '') + (a.proxyIp ? ' · ProxyIP ' + a.proxyIp : '') + '。选个地区即可改成新的方式。'); return; }
    const cur = !!a.id && UI.host?.account?.id === a.id;
    const ip = cur ? IP.ip : a.status?.ip, loc = cur ? IP.loc : a.status?.loc;
    if (ip) say('ok', ...ipLine(ip, loc, 0, (mode === 'region' && chosen ? 'ProxyIP ' + chosen + ' · ' : '') + '当前'));
    else if (mode === 'region' && !region) say('dim', Pool.node() ? '选好地区后自动检测' : '粘贴订阅地址后自动挑选节点和地区');
    else say('dim', '点右边按钮检测出口 IP');
  }
  function sync() {
    const t = tab();
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === t));
    rowSub.hidden = rowReg.hidden = t !== 'node'; rowLocal.hidden = t !== 'proxy'; rowLp.hidden = t !== 'proxy' || !lpBox.childElementCount;
    fillSub(); fillReg();
    const e = api.err(), n = Pool.node();
    const subs = Nodes.subs || [];
    hint.textContent = e || (autoNote && t !== 'auto' ? autoNote : '') || (t === 'auto' ? '自动判断：本机代理 → 订阅节点 → 直连，按顺序找第一个能访问 Brana 的' : t === 'node' ? (n ? '节点：' + (n.name || n.address) + (subs.length ? '（订阅共 ' + Nodes.list.filter(x => subs.some(s => s.url === x.sub)).length + ' 个节点，不通时自动换）' : '') : '') : t === 'proxy' && !local.value.trim() ? (Host.platform === 'android' ? (gnodeName() ? '留空：走全局节点 ' + gnodeName() : '留空：走 App 默认端口 7890') : '留空：走本机 127.0.0.1:7890（Clash / FlClash 等的默认端口）') : '');
    hint.classList.toggle('bad', !!e); rowHint.hidden = !hint.textContent;
    grid.classList.toggle('bad', !!e && !!Pool.node());
  }
  // 订阅：换了地址 → 获取订阅 → 从订阅节点里挑最合适的 → 接着检测地区
  async function applySub(force) {
    const v = subIn.value.trim();
    if (!force && v === subVal()) return;
    if (!v) { toast('请粘贴订阅地址', 'err'); return; }
    touched = true; mode = 'region'; sync();
    say('busy', '正在获取订阅…'); subBtn.disabled = true;
    try {
      const r = await Nodes.setSub(v, t => say('busy', t));
      if (r.error) { say('bad', '订阅获取失败：' + r.error); toast('订阅获取失败：' + r.error, 'err'); return; }
      toast('订阅获取成功：' + r.n + ' 个节点' + (r.added ? '（新增 ' + r.added + '）' : '') + '，正在挑选节点和地区…');
      subShown = null; fillSub();
      await check('sub', r);
    } finally { subBtn.disabled = false; }
  }
  // ----- 自动检测：每次改动（邮箱 / 密码除外）都重新核查，挑最合适的节点和地区 -----
  let seq = 0;
  async function check(why, subRes) {
    const my = ++seq, stale = () => my !== seq || !wrap.isConnected;
    reBtn.disabled = true;
    try {
      if (tab() === 'node') {
        mode = 'region';
        await Promise.all([Nodes.load(), Pool.load(), Nodes.subsLoaded ? null : Nodes.loadSubs()]); await Nodes.refreshAccts();
        if (!Nodes.list.length) { say('dim', '先粘贴订阅地址'); sync(); return; }
        // 节点：换了订阅 / 还没有节点 / 当前节点被标记为坏 → 实测订阅里的节点，挑延迟最低的
        if (why === 'sub' || !Pool.node() || (Pool.bad?.get(Pool.d.node) > now())) {
          say('busy', '正在从 ' + Nodes.list.length + ' 个节点里挑最合适的…');
          const b = await Pool.bestNode({ log: t => { if (!stale()) say('busy', t); } });
          if (stale()) return;
          if (!b.ok && !Pool.node()) { say('bad', '订阅里的节点都连不上，换个订阅地址试试'); sync(); return; }
        }
        if (!Pool.entries().some(([, e]) => e.ok)) { say('busy', '正在检测 ProxyIP 域名（每个域名测 1 个 IP）…'); await Pool.heal().catch(() => {}); if (stale()) return; }
        // 地区：没选就挑延迟最低、没人用的
        if (!region) { region = Pool.bestFree(a.id); fillReg(); if (region) opt.onRegion?.(region); }
        if (!region) { say('bad', '暂无可用地区：点地区右边的齿轮添加 ProxyIP'); sync(); return; }
        sync();
        const log = t => { if (!stale()) say('busy', t); };
        say('busy', '正在检测 ' + regionLabel(region) + ' 的 ProxyIP…');
        if (live) {
          const r = await Pool.acquire(a, region, { prefer: chosen, log });
          if (stale()) return;
          if (!r.ok) { say('bad', regionLabel(region) + '：' + r.error); sync(); return; }
          chosen = r.to; try { UI.host = await Host.info(); UI.renderAcct?.(); } catch {}
          say('ok', ...ipLine(r.ip, r.loc, r.ms, 'ProxyIP ' + r.to + ' · 已应用'));
          setTimeout(() => { try { IP.poll(); } catch {} }, 1200);
        } else {
          // 还没保存的账号：只实测，不保存（保存 / 登录时再分配）
          const cands = Pool.avail(region, a.id).slice(0, 3);
          if (!cands.length) { say('bad', regionLabel(region) + ' 暂无可用 ProxyIP'); return; }
          const r = await Pool.hostProbe(cands, 7000); if (stale()) return;
          if (!Array.isArray(r)) { say('bad', r?.error || '检测失败'); return; }
          const res = cands.map((k, j) => [k, r.find(x => x.pip === k) || r[j] || {}]);
          await Pool.mutate(d => { for (const [k, x] of res) Pool.apply(d, k, x); });
          const good = res.filter(([, x]) => x.ip && x.brana && (!x.loc || x.loc === region)).sort((p, q) => (p[1].ms || 9e9) - (q[1].ms || 9e9))[0];
          if (!good) { say('bad', regionLabel(region) + '：这几个 ProxyIP 都不通，稍后再试或换个地区'); return; }
          chosen = good[0]; say('ok', ...ipLine(good[1].ip, good[1].loc, good[1].ms, 'ProxyIP ' + good[0]));
        }
      } else {
        const px = api.proxy;
        if (api.err()) { sync(); return; }
        say('busy', '正在检测出口 IP…');
        const t = await Host.testIp({ ...a, proxy: px, proxyIp: '', nodeId: '', region: '' }).catch(e => ({ error: cleanErr(e) }));
        if (stale()) return;
        if (t && t.error) { say('bad', (mode === 'direct' ? '直连' : '代理') + '不可用：' + t.error); return; }
        const changed = px !== p0 || !!a.region;
        if (live && changed) { await Host.saveAccount({ ...a, proxy: px, proxyIp: '', nodeId: '', region: '' }).catch(e => { throw e; }); Object.assign(a, { proxy: px, proxyIp: '', nodeId: '', region: '' }); try { UI.host = await Host.info(); UI.renderAcct?.(); } catch {} }
        if (t?.ip) say('ok', ...ipLine(t.ip, t.loc, 0, live && changed ? '已应用' : ''));
        else { if (live) { await IP.poll().catch?.(() => {}); if (stale()) return; } say(IP.ip ? 'ok' : 'dim', ...(IP.ip ? ipLine(IP.ip, IP.loc, 0, '已应用') : ['已保存，稍后看底栏出口 IP'])); }
      }
    } catch (e) { if (!stale()) say('bad', cleanErr(e)); }
    finally { if (my === seq) reBtn.disabled = false; }
  }
  const api = {
    inp: wrap, hint, refresh: () => refresh(), check: () => check('manual'),
    block() { sync(); showCurrent(); return wrap; },
    setRegion(cc) { if (!cc) return; mode = 'region'; region = cc; fillReg(); sync(); },
    get mode() { return mode; },
    get proxy() { return mode === 'def' ? '' : mode === 'direct' ? 'direct' : mode === 'local' ? local.value.trim() : mode === 'node' ? p0 : Pool.link(); },
    get proxyIp() { return mode === 'region' ? (chosen || (region && Pool.d ? Pool.pickSync(region, a) : '')) : mode === 'node' ? (a.proxyIp || '') : ''; },
    get nodeId() { return mode === 'region' ? (Pool.node()?.id || '') : mode === 'node' ? (a.nodeId || '') : ''; },
    get region() { return mode === 'region' ? region : ''; },
    err() {
      if (mode === 'local') { const v = local.value.trim(); return PROXY_RE.test(v) ? '' : '代理格式不正确（例：127.0.0.1:7890、socks5://host:port）'; }
      if (mode !== 'region') return '';
      if (!Pool.d) return '正在读取设置…';
      if (!Pool.node()) return Nodes.list.length ? '正在挑选节点…' : '请粘贴订阅地址';
      if (!region) return '请选择地区';
      if (!api.proxyIp) return regionLabel(region) + ' 暂无可用 ProxyIP' + (Pool.earliest(region) ? '（都在冷却）' : '');
      return '';
    },
  };
  // 新账号（opt.autoRegion）：没设过代理 → 按节点、自动挑地区并检测；用户手动改过就不再动
  let autoDone = false;
  // 新账号：先自动判断（本机代理能用就用本机，其次订阅节点，再其次直连）
  const auto = () => {
    if (autoDone || !opt.autoRegion || touched || region || p0 || a.region || !Pool.d) return;
    autoDone = true;
    if (LocalProxy.can()) { setTimeout(runAuto, 0); return; }
    mode = 'region';
    if (Pool.node() || Nodes.list.length) { region = Pool.bestFree(a.id); if (region) opt.onRegion?.(region); setTimeout(() => check('auto'), 0); }
  };
  const refresh = () => { auto(); sync(); if (!touched) showCurrent(); };
  sync();
  Promise.all([Nodes.load(), Pool.load(), Nodes.loadSubs()]).then(() => Nodes.refreshAccts()).then(refresh);
  let seen = false; const off = Bus.on('pool', () => { if (!wrap.isConnected) { if (seen) off?.(); return; } seen = true; sync(); });
  const offIp = Bus.on('ip', () => { if (!wrap.isConnected) { offIp?.(); return; } if (!touched) showCurrent(); });
  return api;
}

// ---------- 代理设置面板 ----------
const ProxySet = {
  filter: '',
  async open() {
    document.querySelectorAll('.modal-back:not(.anc-gh).pset').forEach(x => x.remove());
    await Nodes.load(); await Pool.load(true); await Nodes.refreshAccts();
    const S = { msg: '' };
    // 节点
    const nodeSel = h('select', { class: 'ps-node' });
    const nodeRes = h('span', { class: 'nm-st dim' });
    const fillNodes = () => {
      nodeSel.replaceChildren(...K(h('option', { value: '' }, Nodes.list.length ? '选择节点…' : '（节点库为空）'), ...Nodes.list.map(n => h('option', { value: n.id }, (n.name || n.address) + ' · ' + n.network + (n.security !== 'none' ? '+' + n.security : ''))), h('option', { value: '__new' }, '＋ 导入节点（订阅地址 / vless）…')));
      nodeSel.value = Pool.node() ? Pool.d.node : '';
    };
    const setNode = async id => { const c = await Pool.setNode(id); toast('已切换节点' + (c ? '，' + c + ' 个按地区的账号已同步' : '') + (Pool.entries().length ? '；建议点「全部重新检测」' : '')); fillNodes(); render(); };
    nodeSel.addEventListener('change', () => {
      if (nodeSel.value === '__new') { fillNodes(); NodeImport.open(() => { fillNodes(); render(); }); return; }
      setNode(nodeSel.value);
    });
    const testNode = h('button', { class: 'ib', title: '测试节点（经池里最快的 ProxyIP）', onclick: async () => {
      const n = Pool.node(); if (!n) { toast('先选择节点', 'err'); return; }
      nodeRes.className = 'nm-st dim'; nodeRes.textContent = '测试中…'; const t0 = now();
      // Brana 在 Cloudflare 上：CF Workers / Pages 节点不带 ProxyIP 访问不了，所以用池里最快的可用 ProxyIP 测
      const pip = Pool.entries().filter(([, e]) => e.ok && !e.gone).sort((a, b) => (a[1].ms || 9e9) - (b[1].ms || 9e9))[0]?.[0] || '';
      const r = await Host.testIp({ proxy: Vless.toLink(n), proxyIp: pip }).catch(e => ({ error: cleanErr(e) }));
      nodeRes.className = 'nm-st ' + (r?.ip ? 'ok' : 'bad'); nodeRes.textContent = r?.ip ? '✓ ' + r.ip + (r.loc ? ' · ' + ccF(r.loc) : '') + ' · ' + ((now() - t0) / 1000).toFixed(1) + 's' + (pip ? '（经 ProxyIP ' + pip + '）' : '') : '✗ ' + (r?.error || '失败');
      if (r?.code === 'needPip') { addBox.open = true; quick.classList.add('hl'); imp.focus(); }
    } }, icon('pulse'));
    const edBtn = h('button', { class: 'ib', title: '编辑节点', onclick: () => { const n = Pool.node(); if (n) NodeEditor.open(n, () => { fillNodes(); render(); }); else NodeEditor.open(null, x => setNode(x.id)); } }, icon('pen'));
    const libBtn = h('button', { class: 'ib', title: '节点库', onclick: () => NodeMgr.open(() => { fillNodes(); render(); }) }, icon('layers'));
    // 导入
    const imp = h('textarea', { class: 'nm-imp ps-imp', rows: 3, spellcheck: false, placeholder: '一行一个：IP、IP:端口、域名（自动解析出全部 IP），或链式代理 sstp:// socks5:// http(s):// turn://（需 edgetunnel 2.1+），或 API 地址（内容里的 sstp / IP 自动解析、定时更新）\n例：60.249.21.30\nProxyIP.JP.CMLiussss.net\nsstp://vpn:vpn@public-vpn-90.opengw.net:443\n这里就是 ProxyIP 来源：加一行即生效，删掉一行即移除', title: '这里就是全部 ProxyIP 来源：直接增删行，停顿 1.5 秒 / 离开输入框 / 点「检查」后生效（新加的自动检测，删掉的连同解析出的 IP 一起移除）' });
    const impBtn = h('button', { class: 'btn', title: '让输入框的内容生效并检测；内容没变时重新检测全部来源', onclick: () => doImport(true) }, icon('check'), '检查');
    // 快速添加：常用公共 ProxyIP 域名与 EdgeTunnel 反代库（按地区 / 机房 / 云厂商 / 每日实时扫描 API）
    const QUICK = [...DEFAULT_PIP_CC];
    const QOPTS = [
      ['__all', '⚡ 全部 EdgeTunnel 反代库（' + EDGETUNNEL_ALL_SRC.length + ' 项）', EDGETUNNEL_ALL_SRC.join('\n')],
      ['__et_colo', '🏢 EdgeTunnel 机房池（' + EDGETUNNEL_COLO_SRC.length + ' 个机房域名）', EDGETUNNEL_COLO_SRC.join('\n')],
      ['__et_asn', '☁️ EdgeTunnel 云厂商 ASN 池（' + EDGETUNNEL_ASN_SRC.length + ' 项）', EDGETUNNEL_ASN_SRC.join('\n')],
      ['__et_api', '🔄 EdgeTunnel 实时扫描 API（NiREvil 全球 3400+ IP 库）', EDGETUNNEL_API_SRC.join('\n')],
      ['g', '🌐 全球（ProxyIP.CMLiussss.net）', 'ProxyIP.CMLiussss.net'],
      ...QUICK.map(cc => [cc, regionLabel(cc), 'ProxyIP.' + cc + '.CMLiussss.net']),
      ['wkr', '威廉 · KR', 'kr.william.us.ci'], ['wtw', '威廉 · TW', 'tw.william.us.ci'], ['mia', 'Mia', 'proxy.mia.xx.kg'],
    ];
    const quick = h('select', { class: 'ps-qsel', title: '常用的公共 ProxyIP 域名，选一个就导入并检测' }, h('option', { value: '' }, '快速添加…'), ...QOPTS.map(([v, n, d]) => h('option', { value: v, title: d }, n)));
    quick.addEventListener('change', () => { const o = QOPTS.find(x => x[0] === quick.value); quick.value = ''; if (!o) return; const have = new Set(Pool.split(imp.value).map(l => Pool.parse(l)?.line || l)), add = Pool.split(o[2]).filter(l => !have.has(Pool.parse(l)?.line || l)); if (add.length) imp.value = (imp.value.trim() ? imp.value.trim() + '\n' : '') + add.join('\n'); quick.classList.remove('hl'); doImport(); });
    const status = h('div', { class: 'ps-status' });
    const chips = h('div', { class: 'ps-chips' });
    const list = h('div', { class: 'ps-list' });
    const srcBox = h('div', { class: 'ps-srcs' });
    // 纯净度（自动过滤 / 评估状态 / proxycheck Key）
    const repSt = h('span', { class: 'ps-rep dim' });
    const repBtn = h('button', { class: 'btn ghost sm', title: '马上查一遍还没评估 / 过期的出口 IP', onclick: async () => { repBtn.disabled = true; try { await IPRep.run(true); } finally { repBtn.disabled = false; render(); } } }, '立即评估');
    const keyIn = h('input', { class: 'ps-key', type: 'text', spellcheck: false, autocomplete: 'off', placeholder: 'proxycheck Key（可选）', title: '到 proxycheck.io 免费注册一个 Key：每天可查 1000 个 IP（不填每天约 100 个）', value: Pool.d.pckey || '', onchange: () => Pool.mutate(d => { d.pckey = keyIn.value.trim(); }) });
    const say = (t, kind = '') => {
      S.msg=t;status.className='ps-status '+kind;
      const progress=kind==='busy'&&Pool.prog?h('progress',{max:Math.max(1,Pool.prog.total),value:Pool.prog.done,'aria-label':'ProxyIP 检测进度'}):null;
      status.replaceChildren(...K(...(kind==='busy'?[h('i',{class:'spin'})]:[]),t,progress));
    };
    async function runProbe(keys,label){
      if(!Pool.node()){say('先选择 VLESS 节点再检测','bad');return;}
      if(!keys.length){say('没有需要检测的 IP');return;}
      // 后台持续全量扫描：不绑定弹窗生命周期、不中断已有扫描，新导入的 IP 自动并入后台队列直至全部测完
      say(label+' 0/'+keys.length+'（后台持续扫描，关闭窗口不影响进度）…','busy');
      try{
        const r=await Pool.probe(keys,(d,t)=>{
          const pureCnt=Pool.entries().filter(([k,e])=>e?.ok===true&&!e.gone&&!Pool.banned(k)&&(typeof IPRep==='undefined'||!IPRep.pure||IPRep.pure(k,e))).length;
          say(label+' '+d+'/'+t+' · 已留存纯净 '+pureCnt+' 个 · 剩余 '+Math.max(0,t-d),'busy');
        },{allowFailover:false});
        await Pool.purgeImpureAndUnstable().catch(()=>{});
        const pureCnt=Pool.entries().filter(([k,e])=>e?.ok===true&&!e.gone&&!Pool.banned(k)&&(typeof IPRep==='undefined'||!IPRep.pure||IPRep.pure(k,e))).length;
        say(r?.cancelled?'检测已暂停，已完成结果保留。':'全量检测完成：当前池中留存纯净可用 IP '+pureCnt+' 个（一般/高风险/不通均已永久拉黑剔除）',r?.cancelled?'':pureCnt?'ok':'bad');
      }catch(e){say(cleanErr(e),'bad');}
    }
    // 输入框 = 来源列表（Pool.d.src）+ 无法识别的行（不生效，留着方便改）
    S.bad = []; S.dirty = false;
    const srcText = () => [...(Pool.d.src || []), ...S.bad].join('\n');
    const syncImp = () => { if (!S.dirty && imp.ownerDocument.activeElement !== imp && imp.value !== srcText()) imp.value = srcText(); };
    let impT = 0;
    imp.addEventListener('input', () => { S.dirty = true; clearTimeout(impT); impT = setTimeout(() => doImport(false), 1500); });
    imp.addEventListener('blur', () => { if (S.dirty) doImport(false); });
    imp.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doImport(true); } });
    let impJob = null;
    async function doImport(force) {
      clearTimeout(impT);
      if (impJob) { await impJob.catch(() => {}); if (!S.dirty && !force) return; }
      const text = imp.value; S.dirty = false;
      impJob = (async () => {
        impBtn.disabled = true;
        try {
          const r = await Pool.setSrcText(text);
          S.bad = r.bad.filter(l => !/（解析失败）$/.test(l));
          if (r.removed.length) say('已移除 ' + r.removed.length + ' 行来源' + (r.removed.length <= 3 ? '：' + r.removed.join('、') : ''), 'ok');
          // 要检测的：点击「检查」(force=true) 强制刷新全部来源与 IP；自动变更仅检测新加的行
          const lines = force ? r.want : (r.added.length ? r.added : []);
          if (lines.length || force) {
            say('解析中…', 'busy');
            const x = r.added.length ? await Pool.importText(r.added.join('\n'), m => say(m, 'busy')) : { bad: [], doms: [] };
            const doms = lines.filter(l => Pool.isDom(l) && (!r.added.includes(l) || force));
            for (const [i, l] of doms.entries()) { say('解析域名 ' + (i + 1) + '/' + doms.length + '：' + l, 'busy'); await Pool.refreshSrc(l, true).catch(() => {}); }
            const apis = lines.filter(l => Pool.isApi(l) && (!r.added.includes(l) || force)), apiErr = [...(x.apiErr || [])];
            for (const [i, l] of apis.entries()) { say('拉取 API ' + (i + 1) + '/' + apis.length + '：' + l, 'busy'); const y = await Pool.refreshApi(l, true).catch(e => ({ err: cleanErr(e) })); if (y.err) apiErr.push(l + '：' + y.err); }
            const failed = x.bad.filter(l => /（解析失败）$/.test(l)).map(l => l.replace(/（解析失败）$/, ''));
            const keys = Pool.entries().filter(([k, e]) => !e.gone && (force || lines.includes(k) || (e.src && lines.includes(e.src)))).map(([k]) => k);
            if (!keys.length) say(apiErr.length ? apiErr.join('；') : failed.length ? '解析失败：' + failed.join('、') + '（直连加密 DNS 都没有返回 IP，检查域名是否正确）' : '没有可检测的 IP', 'bad');
            else {
              await runProbe(keys, '检测');
              if (doms.length) await Pool.domSummarize(doms);
              const ok = keys.filter(k => Pool.d.ips[k]?.ok).length;
              if (!/先选择|失败|xray|节点/.test(S.msg)) say('检测完成：' + ok + '/' + keys.length + ' 个 IP 可用' + (doms.length ? '（' + doms.length + ' 个域名）' : '') + (failed.length ? '；解析失败：' + failed.join('、') : '') + (apiErr.length ? '；' + apiErr.join('；') : ''), ok ? 'ok' : 'bad');
            }
          }
          if (S.bad.length) say(S.bad.length + ' 行无法识别，未生效：' + S.bad.slice(0, 3).join('、'), 'bad');
        } finally { impBtn.disabled = false; }
      })();
      try { await impJob; } finally { impJob = null; if (S.dirty) impT = setTimeout(() => doImport(false), 300); else render(); }
    }
    const act = (ic, fn, title) => h('button', { class: 'ib', title, onclick: fn }, icon(ic));
    const acts = h('div', { class: 'ps-acts' },
      act('refresh', () => runProbe(Pool.entries().filter(([, e]) => !e.gone).map(([k]) => k), '重新检测'), '全部重新检测'),
      act('globe', async () => { const ds = Pool.d.src.filter(l => Pool.isSrc(l)); if (!ds.length) { say('没有域名 / API 来源'); return; } let add = [], rm = 0; for (const [i, l] of ds.entries()) { say('解析 ' + (i + 1) + '/' + ds.length + '：' + l, 'busy'); const r = await Pool.refreshSrc(l, true); add = add.concat(r.added || []); rm += r.removed || 0; } say('域名已刷新：新增 ' + add.length + ' · 移除 ' + rm); if (add.length) runProbe(add, '检测新 IP'); }, '刷新域名：重新解析所有域名，新 IP 自动检测，消失的 IP 移除'),
      act('trash', async () => { const n = await Pool.clearBad(); say('已清除 ' + n + ' 个不可用的 IP'); }, '清除不可用的 IP'),
      act('shield-x', async () => { const x = await Pool.clearRisk(); say(x.n || x.skip ? '已清除 ' + x.n + ' 个高风险 IP' + (x.skip ? '（' + x.skip + ' 个正在被账号使用，已跳过）' : '') : '没有高风险 IP', x.n ? 'ok' : ''); }, '一键清除高风险 IP（纯净度低于 ' + IPRep.TH + ' 分、未信任；正在使用的跳过；域名解析出的 30 天内不再加回）'),
      // 导出：原样导出导入时填的内容（导入的是域名就是域名，导入的是 IP 就是 IP），不是解析后的 IP 列表
      act('upload', () => {
        const src = [...new Set(Pool.d.src || [])]; if (!src.length) { say('ProxyIP 池是空的，没有可导出的内容'); return; }
        const txt = src.join('\n'), ta = h('textarea', { class: 'nm-imp ps-exp', rows: Math.min(12, Math.max(3, src.length)), readonly: true, spellcheck: false }, txt);
        const m = modal('导出 ProxyIP', h('div', {}, h('p', { class: 'note' }, '共 ' + src.length + ' 行，和导入时填的一样（域名还是域名，IP 还是 IP）；粘贴到任意设备的导入框即可。'), ta),
          K(h('button', { class: 'btn ghost', onclick: () => (typeof FileExport !== 'undefined' && FileExport.text ? void FileExport.text(txt + '\n', 'proxyip.txt', 'text/plain') : saveBlob(new Blob([txt + '\n'], { type: 'text/plain' }), 'proxyip.txt')) }, '保存为文件'), h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => { copyText(txt); m.remove(); } }, '复制')));
        setTimeout(() => ta.select(), 30);
      }, '导出：原样导出导入过的 IP / 域名（一行一个）'));
    function render() {
      if (!back.isConnected) return;
      syncImp();
      const es = Pool.entries(), used = Pool.usedMap();
      const cnt = { ok: 0, cool: 0, used: 0, bad: 0, wait: 0, ban: 0, risk: 0, mid: 0, rate: 0 }; for (const [k, e] of es) cnt[Pool.state(k, e)]++;
      const rs = Pool.regions();
      const f = ProxySet.filter;
      const chip = (id, label, n, cls = '') => h('button', { class: 'ps-chip ' + cls + (f === id ? ' on' : ''), onclick: () => { ProxySet.filter = f === id ? '' : id; if (ProxySet.filter) listBox.open = true; render(); } }, label, h('b', {}, n));
      const byMs = Pool.sortBy === 'ms';
      const sortBtn = h('button', { class: 'ps-sort', title: '地区排序（地区下拉框也按这个排）：点一下切换「按国家名称 / 按最低延迟」', onclick: () => { Pool.sortBy = byMs ? 'name' : 'ms'; render(); } }, icon('sort'), byMs ? '按延迟' : '按名称');
      regCnt.textContent = String(rs.length); regCur.textContent = !f ? '全部' : f === '~cool' ? '冷却中' : f === '~bad' ? '不可用' : f === '~wait' ? '待检测' : f === '~ban' ? '黑名单' : f === '~risk' ? '高风险' : regionLabel(f);
      chips.replaceChildren(...K(sortBtn, chip('', '全部', es.length), ...rs.map(r => { const c = chip(r.cc, regionLabel(r.cc), r.ok + (r.all > r.ok ? '/' + r.all : ''), r.ok ? 'ok' : ''); if (r.min) c.append(h('small', { class: 'ps-ms' }, r.min + 'ms')); return c; }),
        cnt.cool ? chip('~cool', '冷却中', cnt.cool, 'cool') : null, cnt.bad ? chip('~bad', '不可用', cnt.bad, 'bad') : null, cnt.wait ? chip('~wait', '待检测', cnt.wait) : null, cnt.risk ? chip('~risk', '高风险', cnt.risk, 'bad') : null, cnt.ban ? chip('~ban', '黑名单', cnt.ban, 'bad') : null));
      const show = es.filter(([k, e]) => { const s = Pool.state(k, e); return !f ? true : f === '~cool' ? s === 'cool' : f === '~bad' ? s === 'bad' : f === '~wait' ? s === 'wait' : f === '~ban' ? s === 'ban' : f === '~risk' ? s === 'risk' : e.loc === f && e.ok && s !== 'ban'; });
      const ord = { ok: 0, used: 1, cool: 2, rate: 3, mid: 3, wait: 3, risk: 4, bad: 5, ban: 6 };
      const rank = new Map(rs.map((r, i) => [r.cc, i]));
      const purVal = x => (typeof IPRep !== 'undefined' && IPRep.score?.(x[0], x[1])?.known) ? Math.round(IPRep.score?.(x[0], x[1]).s) : -1;
      show.sort((a, b) => ord[Pool.state(...a)] - ord[Pool.state(...b)] || (purVal(b) - purVal(a)) || (byMs ? (a[1].ms || 9e9) - (b[1].ms || 9e9) : (rank.get(a[1].loc) ?? 999) - (rank.get(b[1].loc) ?? 999) || (a[1].ms || 9e9) - (b[1].ms || 9e9)));
      const row = ([k, e]) => {
        const s = Pool.state(k, e), o = used.get(k.toLowerCase());
        // 纯净度徽章：分数 + 档位，悬停看扣分明细
        const rp = e.ok === true && !e.gone ? IPRep.score?.(k, e) : null, tr = IPRep.trusted(k);
        const pur = rp ? h('span', { class: 'ps-pur ' + (tr ? 'tr' : rp.tier || 'na'), title: (tr ? '已信任：不参与自动过滤\n' : '') + '纯净度 ' + (rp.known ? rp.s + ' 分 · ' + IPRep.label(rp) : '未评估') + '\n' + rp.why.join('\n') }, rp.known ? String(rp.s) : '?') : null;
        const st = s === 'mid' ? h('span', { class: 'dim', title: '纯净度不足 ' + IPRep.PURE + ' 分：不作为选项，不分配' }, '不纯净') : s === 'rate' ? h('span', { class: 'dim', title: '纯净度评估中：评估为纯净后才会成为选项' }, '评估中') : s === 'risk' ? h('span', { class: 'bad', title: '纯净度低于 ' + IPRep.TH + ' 分，不会再分配给账号' }, '高风险') : s === 'ban' ? h('span', { class: 'bad', title: '已拉黑：不会再分配给任何账号' }, '已拉黑') : s === 'ok' ? h('button', { type: 'button', class: 'dly dly-ping d-good', title: '点击直接 ping（同时测试纯净度与延迟）', onclick: ev => { ev.stopPropagation(); void runProbe([k], '检测'); } }, e.ms + 'ms') : s === 'used' ? h('button', { type: 'button', class: 'dly dly-ping d-good', title: '点击直接 ping（同时测试纯净度与延迟）', onclick: ev => { ev.stopPropagation(); void runProbe([k], '检测'); } }, e.ms + 'ms') : s === 'cool' ? h('span', { class: 'warn', title: '冷却到 ' + new Date(e.cool).toLocaleTimeString() }, '冷却 ' + Math.ceil((e.cool - now()) / 60000) + ' 分') : s === 'wait' ? h('span', { class: 'dim' }, Pool.prog ? '检测中…' : '待检测') : h('span', { class: 'bad', title: e.err || '' }, e.gone ? '已不在域名解析里' : (e.err || '不可用'));
        return h('div', { class: 'ps-row ' + s },
          h('span', { class: 'ps-loc' }, e.loc ? ccF(e.loc) : '—'),
          h('span', { class: 'ps-ip mono', title: (e.eg && e.eg !== e.ip ? 'Brana 看到的出口 ' + e.eg + '\n' : '') + (e.at ? '检测于 ' + new Date(e.at).toLocaleString() : '') }, k),
          h('span', { class: 'ps-src dim', title: e.src || '' }, e.src || ''),
          h('span', { class: 'ps-st' }, st, pur),
          o ? h('span', { class: 'tagb ok', title: '账号「' + (o.email || o.name) + '」正在使用' }, emailUser(o)) : h('span', { class: 'ps-own' }),
          h('span', { class: 'ps-act' },
            h('button', { class: 'ib xs', title: '重新检测', onclick: () => runProbe([k], '检测') }, icon('refresh')),
            s === 'cool' ? h('button', { class: 'ib xs', title: '解除冷却', onclick: () => Pool.mutate(d => { if (d.ips[k]) d.ips[k].cool = 0; }) }, icon('check')) : null,
            s === 'risk' || tr ? h('button', { class: 'ib xs' + (tr ? ' on' : ''), title: tr ? '取消信任（重新参与自动过滤）' : '信任这个 IP：不再因为纯净度低被过滤', onclick: () => IPRep.setTrust(k, !tr) }, icon('shield')) : null,
            h('button', { class: 'ib xs' + (s === 'ban' ? ' on' : ''), title: s === 'ban' ? '解除拉黑' : '拉黑（高风险 / 被风控的 IP）：不再分配给任何账号；正在用它的账号自动换同地区的下一个', onclick: () => ProxySet.ban(k, s !== 'ban', o, say) }, icon(s === 'ban' ? 'check' : 'ban')),
            h('button', { class: 'ib xs', title: '移除', onclick: () => Pool.removeKey(k) }, icon('x'))));
      };
      // 两个列表：「IP」= 直接导入的裸 IP；「域名解析」= 每个域名一行（点开看它解析出的 IP）
      const MAX = 300, srcSet = new Set(Pool.d.src || []), bare = show.filter(([k, e]) => !e.src && srcSet.has(k));
      list.replaceChildren(...K(...(bare.length ? bare.slice(0, MAX).map(row) : [h('p', { class: 'note' }, es.some(([, e]) => !e.src) ? '没有匹配的 IP' : '没有直接导入的 IP（在上面一行一个粘贴 IP，点「检查」）')]), bare.length > MAX ? h('p', { class: 'note' }, '还有 ' + (bare.length - MAX) + ' 个未显示，点地区筛选') : null));
      listCnt.textContent = String(bare.length);
      const doms = Pool.d.src.filter(l => Pool.isSrc(l)), openD = ProxySet.openDom ||= new Set();
      let domIps = 0;
      const drows = [];
      for (const l of doms) {
        const api = Pool.isApi(l), ad = api ? Pool.d.api?.[l] : null;
        const mine = es.filter(([, e]) => Pool.fromSrc(e, l));
        const vis = show.filter(([, e]) => Pool.fromSrc(e, l)).sort((a, b) => ord[Pool.state(...a)] - ord[Pool.state(...b)] || (purVal(b) - purVal(a)) || (a[1].ms || 9e9) - (b[1].ms || 9e9));
        if (f && !vis.length) continue;
        const scope = f ? vis : mine, n = scope.length;
        const okE = scope.filter(([k, e]) => { const s = Pool.state(k, e); return s === 'ok' || s === 'used'; });
        const ok = okE.length, dd = api ? null : Pool.d.dom?.[l], cc = api ? Pool.apiLoc(okE.length ? okE : scope) : Pool.domLoc(l);
        const ms = okE.reduce((m, [, e]) => e.ms > 0 && (!m || e.ms < m) ? e.ms : m, 0) || (!f && dd?.ok && ok ? dd.ms : 0);
        domIps += mine.length;
        const on = openD.has(l);
        drows.push(h('div', { class: 'ps-drow' + (on ? ' open' : '') + (n && !ok && mine.some(([, e]) => e.ok === false) ? ' bad' : ''), role: 'button', tabindex: '0', 'aria-expanded': String(on), title: api ? Pool.apiTip(l, n, ok) : l + '\n解析出 ' + n + ' 个 IP，' + ok + ' 个可用（使用前都会重新解析）' + (dd?.err && !ok ? '\n' + dd.err : '') + '\n点击展开 / 收起', onclick: e => { if (e.target.closest('button')) return; on ? openD.delete(l) : openD.add(l); render(); } },
          icon('chev', 'ps-dchev'), api ? h('span', { class: 'ps-dn mono' }, h('b', { class: 'ps-api' }, 'API'), Pool.apiName(l), ad?.err ? h('small', { class: 'ps-apierr' }, ' · ' + ad.err) : null) : h('span', { class: 'ps-dn mono' }, l), h('span', { class: 'ps-dl' }, cc ? ccF(cc) : ''), h('span', { class: 'ps-dc' + (ok ? ' ok' : '') }, n ? ok + '/' + n : api ? (ad?.err ? '失败' : '未拉取') : '未解析'), h('span', { class: 'ps-dm' }, ms ? ms + 'ms' : ''),
          h('button', { class: 'ib xs', title: api ? '重新拉取这个 API 并检测它的全部出口' : '重新解析并检测这个域名的全部 IP', 'aria-label': '检测 ' + l, onclick: async () => { if (api) say('拉取 API：' + Pool.apiName(l), 'busy'); const y = await Pool.refreshSrc(l, true).catch(e => ({ err: cleanErr(e) })); if (y?.err) { say(Pool.apiName(l) + '：' + y.err, 'bad'); return; } const ks = Pool.entries().filter(([, e]) => Pool.fromSrc(e, l) && !e.gone).map(([k]) => k); await runProbe(ks, api ? Pool.apiName(l) : l); if (!api) await Pool.domSummarize([l]); } }, icon('refresh')),
          h('button', { class: 'ib xs', title: api ? '移除这个 API 和它的全部出口' : '移除这个域名和它解析出的 IP', 'aria-label': '移除 ' + l, onclick: async () => { if (await Dialog.confirm({ title: api ? '移除 API' : '移除域名', text: '移除「' + (api ? Pool.apiName(l) : l) + '」和它' + (api ? '的 ' : '解析出的 ') + n + ' 个' + (api ? '出口' : ' IP') + '？', ok: '移除', danger: true })) Pool.removeSrc(l); } }, icon('x'))));
        if (on) drows.push(h('div', { class: 'ps-dips' }, ...(vis.length ? vis.slice(0, 120).map(row) : [h('p', { class: 'note' }, api ? (ad?.err || '还没有拉取到出口') : '还没有解析出 IP')])));
      }
      srcBox.replaceChildren(...(drows.length ? drows : [h('p', { class: 'note' }, doms.length ? '没有匹配的来源' : '没有域名 / API 来源（在上面粘贴域名或 API 地址，一行一个）')]));
      { const na = doms.filter(l => Pool.isApi(l)).length, nd = doms.length - na; srcCnt.textContent = doms.length ? [nd ? nd + ' 个域名' : '', na ? na + ' 个 API' : ''].filter(Boolean).join(' · ') + ' · ' + domIps + ' 个出口' : '0'; }
      maintEl.replaceChildren(icon('refresh'), h('span', {}, PoolMaint.running ? '正在自动维护…' : '自动维护 · 每 4 小时' + (Pool.d.mt ? ' · 上次 ' + new Date(Pool.d.mt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')), tipI('某个域名解析出的 IP 可用率低于 40% 时会立刻重新解析、检测；连续 3 次检测失败又没人在用的 IP 会移出池子（域名还解析得到的话下次刷新会重新加入）。'));
      { const st = IPRep.stats(), day = new Date().toISOString().slice(0, 10), pq = Pool.d.pcq?.day === day ? Pool.d.pcq.n || 0 : 0;
        repSt.textContent = IPRep.running ? '正在评估纯净度…' : st.n ? '出口 ' + st.n + ' 个：纯净 ' + st.good + ' · 一般 ' + st.mid + ' · 高风险 ' + st.bad + (st.none ? ' · 未评估 ' + st.none : '') + (pq ? ' · 今日已查 ' + pq : '') : '还没有可评估的 IP';
        repSt.title = IPRep.lastErr ? '上次评估出错：' + IPRep.lastErr : (IPRep.at ? '上次评估 ' + new Date(IPRep.at).toLocaleString() : ''); }
      const n = Pool.node(); edBtn.title = n ? '编辑节点' : '添加节点';
      if (!Pool.prog && !status.classList.contains('busy') && !S.msg) say(es.length ? '共 ' + es.length + ' 个 IP · 可用 ' + cnt.ok + (cnt.used ? ' · 在用 ' + cnt.used : '') + (cnt.cool ? ' · 冷却 ' + cnt.cool : '') + (cnt.bad ? ' · 不可用 ' + cnt.bad : '') : '');
    }
    // 折叠：添加（粘贴 / 快速添加）、IP 列表、域名来源 —— 平时只看节点、地区概览
    srcBox.className = 'ps-dlist';
    const addBox = h('details', { class: 'ps-fold ps-add', open: true }, h('summary', {}, icon('list'), '导入 IP / 域名 / API', h('span', { class: 'grow' }), quick), h('div', { class: 'lrow ps-improw' }, imp, impBtn));
    quick.addEventListener('click', e => e.stopPropagation()); quick.addEventListener('pointerdown', e => e.stopPropagation());
    const listCnt = h('b', { class: 'dim' }), srcCnt = h('b', { class: 'dim' }), maintEl = h('div', { class: 'ps-maint dim' });
    // 国家 / 地区：折叠起来（标题上显示地区数和当前筛选），点开才是各地区的按钮
    const regCnt = h('b', { class: 'dim' }), regCur = h('span', { class: 'ps-regcur' });
    const regBox = h('details', { class: 'ps-fold ps-regs' }, h('summary', {}, icon('grid'), '国家 / 地区', regCnt, h('span', { class: 'grow' }), regCur, icon('chev', 'ps-chev')), chips);
    const listBox = h('details', { class: 'ps-fold ps-bare' }, h('summary', {}, icon('menu'), 'IP', listCnt, icon('chev', 'ps-chev')), list);
    const domBox = h('details', { class: 'ps-fold ps-doms', open: true }, h('summary', {}, icon('globe'), '域名 / API', srcCnt, icon('chev', 'ps-chev')), srcBox);
    const repBox = h('details', { class: 'ps-fold ps-repf' }, h('summary', {}, icon('shield'), '纯净度', h('span', { class: 'ps-repsum' }, repSt), icon('chev', 'ps-chev')),
      h('div', { class: 'ps-reprow2' }, h('span', { class: 'ps-auto', title: '评估出低于 ' + IPRep.TH + ' 分的 IP 自动拉黑并删除，永远不会被分配或切换到；正在用的空闲时自动换走' }, '高风险 IP（低于 ' + IPRep.TH + ' 分）一律禁用：自动拉黑并删除'),
        tipI('纯净度按 Brana 看到的「出口 IP」打分，后台自动评估、不用管：\n① ip-api.com：是不是机房 IP、有没有被标记为代理 / VPN\n② proxycheck.io：风险值 0–100（免费每天约 100 次，优先查账号在用的和各地区最快的；填了免费 Key 每天 1000 次）\n③ 实测：用这个出口发送时 v3 直接通过几次、被要求人机验证几次、429 几次 —— 被要求验证越多扣分越多\n分配 IP 时先挑「纯净」（≥75 分），再挑一般的；列表里每个 IP 后面的数字就是分数，悬停看扣分明细。误判的 IP 可以点盾牌「信任」。')),
      h('div', { class: 'lrow ps-reprow' }, keyIn, repBtn));
    const body = h('div', { class: 'nm ps' },
      h('div', { class: 'nm-h' }, h('b', {}, '全部 ProxyIP'), tipI('导入后每个 IP 都会测两步：① 经节点 + 这个 ProxyIP 能否连通（得到出口地区和延迟）② 能否正常打开 Brana（不是验证页 / 限流）。两步都通过才算可用。账号里只选地区，自动分配没人用的 IP；域名来源的 IP 每次使用前都会重新解析。'), h('span', { class: 'grow' }), acts),
      addBox, h('div', { class: 'ps-stline' }, status, maintEl), regBox, listBox, domBox, repBox);
    const back = modal('ProxyIP 列表', body, K(h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => back.remove() }, '完成')), 'wide pset');
    fillNodes(); render();
    const off = Bus.on('pool', () => { if (!back.isConnected) { off?.(); return; } clearTimeout(ProxySet.t); ProxySet.t = setTimeout(render, 80); });
    // 冷却倒计时 / 其它窗口的改动
    const tick = setInterval(async () => { if (!back.isConnected) { clearInterval(tick); return; } if (!Pool.prog) { await Pool.load(true); await Nodes.refreshAccts(); } render(); }, 15000);
    return back;
  },
  // 拉黑 / 解除：拉黑正在用的 IP → 那个账号立刻换同地区的下一个
  async ban(k, on, o, say) {
    await Pool.setBan(k, on);
    if (!on || !o || !o.region) return;
    say?.('已拉黑 ' + k + '，正在给「' + emailUser(o) + '」换 ' + regionLabel(o.region) + ' 的下一个 IP…', 'busy');
    const r = await Pool.acquire(o, o.region, { exclude: new Set([k]), log: t => say?.(t, 'busy') }).catch(e => ({ ok: false, error: cleanErr(e) }));
    say?.(r.ok ? '「' + emailUser(o) + '」已换到 ' + r.to + (r.ip ? '（出口 ' + r.ip + '）' : '') : '换 IP 失败：' + r.error, r.ok ? 'ok' : 'bad');
    if (r.ok && UI.host?.account?.id === o.id) { try { UI.host = await Host.info(); UI.renderAcct?.(); } catch {} setTimeout(() => { try { IP.poll(); } catch {} }, 1200); }
  },
};

// ---------- 当前账号的 ProxyIP 守护：连不上 / 超时 / 出口国家不对 → 立刻换同地区下一个（并发测，最快的直接应用）----------
const PoolGuard = {
  busy: false, last: 0, fails: 0, backoff: 0,
  async check() {
    // 自动选路（AutoRoute）是唯一的自动切换者；「节点 / 代理 / 直连」模式下绝不自动切换。
    if (typeof AutoRoute !== 'undefined' && AutoRoute.adapter) return;
    const a = UI.host?.account; if (!a || this.busy || navigator.onLine === false) return;
    try { await Pool.load(); } catch { return; }
    if (!Pool.canRotate(a)) { this.fails = 0; return; }
    const bad = IP.err && !NetHealth.recent() ? 'err' : '';   // 出口国家不一致但能正常访问：不切换
    if (!bad) { this.fails = 0; return; }
    if (bad === 'err' && ++this.fails < 2) { setTimeout(() => IP.poll(), 2500); return; }   // 再确认一次，避免偶发抖动
    if (now() - this.last < 15000 || now() < this.backoff) return;
    this.busy = true; this.last = now();
    const cur = String(a.proxyIp || '').trim(), why = bad === 'loc' ? '出口国家是 ' + IP.loc + '（绑定 ' + a.region + '）' : (IP.err || '连接失败');
    try {
      // 换之前单独实测当前 ProxyIP 两次（隔 3 秒）：只要有一次能正常打开 Brana、出口国家也对，就当是网络抖动，不换 —— 尽量不频繁换 IP
      if (cur) {
        for (let i = 0; i < 2; i++) {
          if (i) await sleep(3000);
          const r = await Pool.hostProbe([cur], 9000); const x = Array.isArray(r) ? (r.find(y => y.pip === cur) || r[0] || {}) : null;
          if (x && x.ip && x.brana && (!x.loc || x.loc === a.region)) { this.fails = 0; this.backoff = now() + 60e3; this.jitter = now() - (this.jAt || 0) < 3600e3 ? (this.jitter || 0) + 1 : 1; this.jAt = now(); setTimeout(() => IP.poll(), 1500); return; }
          if (!x) break;   // 检测本身失败（节点 / xray 问题）：按原来的流程
        }
      }
      if (!await RouteConfirm.ask({ title: '当前线路连接失败，需切换 IP 节点，是否切换？', text: 'ProxyIP ' + (cur || '—') + ' 复测两次都连不上。' })) { this.backoff = now() + 180e3; return; }
      const r = await Pool.acquire(a, a.region, { exclude: new Set(cur ? [cur] : []) });
      if (r.ok) {
        if (cur) await Pool.mutate(d => { const e = d.ips[cur]; if (e) { e.ok = false; e.err = why; e.fc = (e.fc || 0) + 1; e.at = now(); } });
        this.fails = 0; try { UI.host = await Host.info(); UI.renderAcct?.(); } catch {}
        toast('ProxyIP ' + (cur || '—') + ' ' + (bad === 'loc' ? '出口国家不对' : '连不上（已复测确认）') + '，已自动换到 ' + r.to + '（' + regionLabel(r.loc) + (r.ms ? ' · ' + r.ms + 'ms' : '') + '）');
        RegionAdvisor.note(bad === 'loc' ? '出口国家不对' : '连接失败', a.region);
        setTimeout(() => IP.poll(), 800);
      } else { this.backoff = now() + 120e3; toast('ProxyIP 失效（' + why + '），自动换 IP 失败：' + r.error, 'err'); }
      if (!r.ok && !r.wait && Nodes.list.length > 1) { const f = await Pool.failover(); if (f.ok) { this.backoff = 0; this.last = 0; this.busy = false; return this.check(); } }
    } catch {} finally { this.busy = false; }
  },
};
Bus.on('ip', () => { PoolGuard.check().catch(() => {}); });
// 接口请求连不上 / 超时：马上查一次出口（不等下一轮定时），坏了就换
Bus.on('neterr', () => { if (now() - (PoolGuard.nAt || 0) > 5000) { PoolGuard.nAt = now(); IP.poll(); } });

// ---------- 地区建议：当前地区不稳定 / IP 不干净 / 只剩很少可用 IP，而别的空闲地区明显更好时 ----------
// 没有对话在跑、没在抽卡时弹窗询问（切换 / 保持 / 24 小时内不再提示），确认后才换；持续抽卡（∞）时自动换，不询问。
const RegionAdvisor = {
  hist: [], at: 0, busy: false,
  endless() { try { const r = Gacha.run; return !!(r && ['running', 'stopping'].includes(r.status) && r.settings?.endless); } catch { return false; } },
  idle() { return ![...Chats.values()].some(c => c.busy) && !(typeof Gacha !== 'undefined' && Gacha.busy?.()) && !document.querySelector('.modal-back:not(.anc-gh), .dlg-back:not(.anc-gh), .rc-back, .asheet-back:not(.anc-gh), .lpick'); },
  note(why, cc) { this.hist = [...this.hist.filter(x => now() - x.at < 3 * 3600e3), { at: now(), why, cc }]; clearTimeout(this.nt); this.nt = setTimeout(() => this.check({ why: 'unstable' }).catch(() => {}), 60e3); },
  evaluate(a) {
    const cc = a.region, k = String(a.proxyIp || '').trim(), e = k ? Pool.d?.ips?.[k] : null, why = [];
    const n = this.hist.filter(x => x.cc === cc && now() - x.at < 3600e3).length;
    if (n >= 2) why.push('最近 1 小时自动换了 ' + n + ' 次 IP');
    if ((PoolGuard.jitter || 0) >= 3 && now() - (PoolGuard.jAt || 0) < 3600e3) why.push('连接经常中断');
    const cur = Pool.regions(a.id).find(r => r.cc === cc), ok = cur?.ok || 0;
    if (ok <= 1) why.push('这个地区只剩 ' + ok + ' 个可用 IP');
    const sc = k && e ? IPRep.score?.(k, e) : null, risky = !!(sc?.known && sc.s < IPRep.TH && !IPRep.trusted?.(k));
    if (risky) why.push('当前 IP 纯净度低（' + sc.s + ' 分）');
    const ms = e?.ms || 0; if (ms > 1500) why.push('延迟高（' + ms + 'ms）');
    if (!why.length) return null;
    // 只是 IP 不干净、地区本身没问题：优先换同地区更干净的 IP（地区不变）
    if (risky && why.length === 1) {
      const b = Pool.avail(cc, a.id, new Set([k]))[0], be = b && Pool.d.ips[b], bs = be ? IPRep.score?.(b, be) : null;
      if (bs && bs.tier !== 'bad' && (!bs.known || bs.s > sc.s + 10)) return { cc, why, alt: { cc, same: true, ip: b, ok: Math.max(0, ok - 1), ms: be.ms || 0, s: bs.known ? bs.s : null, tier: bs.tier || '' }, k, ms, sc, ok };
    }
    const alts = Pool.freeRegions(a.id, new Set([cc])).filter(r => r.ok >= 3).map(r => {
      const b = Pool.avail(r.cc, a.id)[0], be = b && Pool.d.ips[b], bs = be ? IPRep.score?.(b, be) : null;
      return { cc: r.cc, ok: r.ok, ms: r.min || be?.ms || 0, s: bs?.known ? bs.s : null, tier: bs?.tier || '' };
    }).filter(x => x.tier !== 'bad' && (!ms || !x.ms || x.ms < Math.max(ms * 1.5, 900)) && !(risky && x.s != null && sc && x.s <= sc.s))
      .sort((x, y) => (y.tier === 'good') - (x.tier === 'good') || (y.ok >= 5) - (x.ok >= 5) || (x.ms || 9e9) - (y.ms || 9e9));
    return alts.length ? { cc, why, alt: alts[0], k, ms, sc, ok } : null;
  },
  describe(g) {
    const A = g.alt, lab = x => regionLabel(x);
    return '建议：' + (A.same ? '换 ' + lab(A.cc) + ' 另一个更干净的 IP ' + A.ip : lab(A.cc)) + '（' + [A.ms ? '延迟 ' + A.ms + 'ms' : '', A.s != null ? (A.tier === 'good' ? '纯净 ' : '纯净度 ') + A.s + ' 分' : '', '可用 ' + A.ok + ' 个'].filter(Boolean).join(' · ') + '）'
      + '\n当前：' + lab(g.cc) + (g.k ? ' · ' + g.k : '') + '\n原因：' + g.why.join('；')
      + '\n\n切换后这个账号绑定到新地区（每个账号一个地区，不会和别的账号串 IP）。';
  },
  async check({ why = 'tick' } = {}) {
    if (typeof AutoRoute !== 'undefined') return;   // 网络优先 + 自动同步地区：不再弹窗提示因为延迟/抖动/地区去换 IP
    const a = UI.host?.account; if (this.busy || !a || navigator.onLine === false) return;
    try { await Pool.load(); } catch { return; }
    if (!Pool.canRotate(a) || !a.region) return;
    const g = this.evaluate(a); if (!g) return;
    const sz = Store.get('regSug', {}); if (sz.acct === a.id && sz.until > now() && (sz.all || (sz.cc === g.alt.cc && sz.from === g.cc))) return;
    if (this.endless()) {   // 持续抽卡：等两抽之间（没有在跑的抽卡请求）自动换
      if (Gacha.flights) { clearTimeout(this.rt); this.rt = setTimeout(() => this.check({ why }).catch(() => {}), 5000); return; }
      this.busy = true; try { await this.apply(a, g, true); } finally { this.busy = false; } return;
    }
    if (!this.idle() || document.hidden || (Host.platform !== 'android' && !document.hasFocus())) { clearTimeout(this.rt); this.rt = setTimeout(() => this.check({ why }).catch(() => {}), 60e3); return; }
    if (why === 'tick' && now() - this.at < 30 * 60e3) return;
    this.at = now(); this.busy = true;
    try {
      const v = await Dialog.open((box, done) => {
        const go = h('button', { class: 'btn', onclick: () => done('go') }, g.alt.same ? '换 IP' : '切换为 ' + REGION_NAME(g.alt.cc));
        box.append(h('div', { class: 'dlg-t' }, '有更适合这个账号的地区 IP'), h('div', { class: 'dlg-h' }, this.describe(g)),
          h('div', { class: 'dlg-row' }, h('button', { class: 'btn ghost sm', onclick: () => done('mute') }, '24 小时内不再提示'), h('span', { class: 'grow' }),
            h('button', { class: 'btn ghost', onclick: () => done('keep') }, '保持'), go));
        setTimeout(() => go.focus(), 60);   // 默认焦点在「切换」上，不在「24 小时内不再提示」
      });
      if (v === 'go') { const a2 = UI.host?.account; if (a2?.id === a.id) await this.apply(a2, g, false); }
      else if (v === 'mute') Store.set('regSug', { acct: a.id, all: true, until: now() + 24 * 3600e3 });
      else Store.set('regSug', { acct: a.id, cc: g.alt.cc, from: g.cc, until: now() + 72 * 3600e3 });   // 保持：同样的建议 3 天内不再提
    } finally { this.busy = false; }
  },
  async apply(a, g, auto) {
    const cc = g.alt.cc; if (!g.alt.same && Pool.regionOwner(cc, a.id)) return false;
    const r = await Pool.acquire(a, cc, g.alt.same ? { prefer: g.alt.ip, exclude: new Set(g.k ? [g.k] : []) } : {}).catch(e => ({ ok: false, error: cleanErr(e) }));
    if (!r.ok) { toast('切换到 ' + regionLabel(cc) + ' 失败：' + (r.error || '没有可用 IP'), 'err'); return false; }
    this.hist = []; PoolGuard.jitter = 0; try { UI.host = await Host.info(); UI.renderAcct?.(); } catch {}
    const msg = g.alt.same ? (auto ? '持续抽卡：' : '') + '已换到 ' + regionLabel(cc) + ' 更干净的 IP ' + r.to + (r.ms ? ' · ' + r.ms + 'ms' : '') : (auto ? '持续抽卡：' + regionLabel(g.cc) + ' 不稳定，已自动切换到 ' : '已切换到 ') + regionLabel(r.loc || cc) + ' · ProxyIP ' + r.to + (r.ms ? ' · ' + r.ms + 'ms' : '');
    toast(msg); try { if (auto) Gacha.note?.(msg); } catch {}
    setTimeout(() => { try { IP.poll(); } catch {} }, 800); return true;
  },
};
if (!globalThis.__BRANA_OFFLINE__) setInterval(() => { RegionAdvisor.check().catch(() => {}); }, 10 * 60e3);
if (!globalThis.__BRANA_OFFLINE__) setTimeout(() => { RegionAdvisor.check().catch(() => {}); }, 3 * 60e3);

// ---------- IP 库自动维护：每 6 小时后台静默增量更新一次（拉黑的绝不回来、一般与高风险永久淘汰，池内只留纯净 IP）；未完成的首轮扫描自动断点续扫 ----------
const PoolMaint = {
  EVERY: 12 * 3600e3, MAXGAP: 12 * 3600e3, input: now(), running: false,
  quiet() { return ![...Chats.values()].some(c => c.busy) && !(typeof Gacha !== 'undefined' && Gacha.busy?.()); },
  idle() { return (document.hidden || now() - this.input > 120e3) && this.quiet(); },
  async tick() {
    if (this.running || navigator.onLine === false || Pool.isFixtureEnv()) return;
    try {
      await Nodes.load();
      if (!Pool.d) await Pool.load(true);
    } catch { return; }
    const hasLink = Boolean(Pool.link() && Host.probe);
    const bgDue = hasLink && !Pool.prog && now() - (Pool.d?.bgScanAt || 0) >= 10 * 60e3;
    const maintDue = Boolean((Pool.entries().length || Pool.d?.src?.length) && (now() - (Pool.d?.mt || 0) >= this.EVERY));
    if (!bgDue && !maintDue) return;
    try { await Pool.load(true); } catch { return; }
    await Pool.purgeImpureAndUnstable().catch(() => {});
    if (!Pool.link() || !Host.probe) return;
    // 仅当当前地区纯净可用 IP 不足（< 4）且跨窗口冷却已过时，才按需小批量补充检测最多 12 个待测 IP
    const pending = Pool.lazyPendingKeys(12);
    if (pending.length && !Pool.prog && now() - (Pool.d?.bgScanAt || 0) >= 10 * 60e3) {
      const canScan = await Pool.mutate(d => { if (now() - (d.bgScanAt || 0) < 10 * 60e3) return 0; d.bgScanAt = now(); return 1; }).catch(() => 0);
      if (canScan) void Pool.probe(pending).then(() => Pool.purgeImpureAndUnstable()).catch(() => {});
    }
    if (!Pool.entries().length && !Pool.d?.src?.length) return;
    const d = Pool.d, gap = now() - (d.mt || 0), due = gap >= this.EVERY;
    if (!due) return;
    const go = await Pool.mutate(d => { if (now() - (d.mt || 0) < this.EVERY) return 0; d.mt = now(); return 1; });
    if (!go) return;
    this.running = true; Bus.emit('pool');
    try {
      const srcs = Pool.d.src.filter(l => Pool.isSrc(l));
      for (const l of srcs) await Pool.refreshSrc(l, true).catch(() => {});
      const keys = Pool.lazyPendingKeys(12);
      if (keys.length) await Pool.probe(keys).catch(() => {});
      await Pool.purgeImpureAndUnstable().catch(() => {});
      if (Pool.domains().length) await Pool.domSummarize(Pool.domains()).catch(() => {});
    } finally { this.running = false; Bus.emit('pool'); }
  },
};
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => { PoolMaint.input = now(); }, { capture: true, passive: true });
if (!globalThis.__BRANA_OFFLINE__) setTimeout(() => { PoolMaint.tick().catch(() => {}); setInterval(() => PoolMaint.tick().catch(() => {}), 5 * 60e3); }, 30e3);

// API 来源自动更新：每 12 小时拉取一次（已拉黑/不纯净的永久跳过不加回，只入库候选并按需懒检测，绝不后台全量扫池消耗节点请求）
const ApiMaint = {
  EVERY: 12 * 3600e3, running: false,
  async tick(force) {
    if (this.running || navigator.onLine === false || (!force && Pool.isFixtureEnv())) return;
    try { if (!Pool.d || force) await Pool.load(true); } catch { return; }
    let ls = Pool.apis(); if (!ls.length) return;
    let dueLs = ls.filter(l => { const st = Pool.d.api?.[l]; const waitMs = st?.err ? 5 * 60e3 : this.EVERY; return force || now() - (st?.tried || 0) >= waitMs; });
    if (!dueLs.length) return;
    if (!force) {
      try { await Pool.load(true); } catch { return; }
      ls = Pool.apis();
      dueLs = ls.filter(l => { const st = Pool.d.api?.[l]; const waitMs = st?.err ? 5 * 60e3 : this.EVERY; return now() - (st?.tried || 0) >= waitMs; });
      if (!dueLs.length) return;
    }
    this.running = true;
    try {
      const add = [];
      for (const l of dueLs) { const r = await Pool.refreshApi(l, true).catch(() => null); if (r?.added?.length) add.push(...r.added); }
      const lazyKeys = add.length ? Pool.lazyPendingKeys(12) : [];
      if (lazyKeys.length && Pool.link() && Host.probe) await Pool.probe(lazyKeys).catch(() => {});
      await Pool.purgeImpureAndUnstable().catch(() => {});
    } finally { this.running = false; Bus.emit('pool'); }
  },
};
if (!globalThis.__BRANA_OFFLINE__) setTimeout(() => { ApiMaint.tick().catch(() => {}); setInterval(() => ApiMaint.tick().catch(() => {}), 5 * 60e3); }, 60e3);

// 启动后稍等一会儿再补默认域名（不跟首屏抢网络）
if (!globalThis.__BRANA_OFFLINE__) setTimeout(() => { Pool.seed().catch(() => {}); }, 9000);

// 订阅自动更新：每 30 分钟看一次，超过 6 小时没更新的订阅就重新拉取（新节点加入、已下线的移除）
const SubMaint = {
  start() {
    if (this.t) return;
    const tick = async () => {
      if (Pool.isFixtureEnv()) return;
      try {
        await Nodes.loadSubs();
        if (Nodes.subs.some(s => now() - (s.at || 0) > 6 * 3600e3)) { const r = await Nodes.refreshSubs(); if (r.add || r.rm) Bus.emit('pool'); }
        // 还没有全局节点但节点库里有：自动挑一个能用的
        await Pool.load(); if (!Pool.node() && Nodes.list.length) await Pool.autoNode();
      } catch {}
    };
    this.t = setInterval(tick, 30 * 60e3); setTimeout(tick, 20e3);
  },
};
if (!globalThis.__BRANA_OFFLINE__) SubMaint.start();
