// Outbound endpoint health scoring, ASN/proxy telemetry evaluation, and automated failover filtering
const ScreenPop = {
  open(cc, title) {
    const v = { cancelled: false, fin: false, lines: [] };
    const logEl = h('div', { class: 'scr-log', role: 'log', 'aria-live': 'polite' }), stat = h('div', { class: 'scr-stat' }), bar = h('div', { class: 'scr-bar' }, h('i'));
    const back = h('div', { class: 'modal-back scr-back' });
    v.close = () => { back.remove(); };
    const btn = h('button', { type: 'button', class: 'btn ghost', onclick: () => { if (v.fin) v.close(); else { v.cancelled = true; btn.textContent = '正在停止…'; btn.disabled = true; v.wake?.(); } } }, '取消');
    back.append(h('div', { class: 'modal scr-pop', role: 'dialog', 'aria-modal': 'true', 'aria-label': '筛选 ProxyIP' },
      h('div', { class: 'modal-h' }, title || '正在为 ' + regionLabel(cc) + ' 筛选纯净 IP'),
      h('div', { class: 'modal-b' }, h('div', { class: 'scr-tip' }, '只使用纯净 IP：评估为高风险的自动拉黑并删除，一直筛选到出现纯净的 IP 为止。'), bar, stat, logEl),
      h('div', { class: 'modal-f' }, btn)));
    document.body.append(back);
    const ts = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    v.log = t => { v.lines.push(ts() + '  ' + t); v.lines = v.lines.slice(-8); logEl.replaceChildren(...v.lines.map(x => h('div', {}, x))); };
    v.stat = t => { stat.textContent = t; };
    v.sleep = ms => new Promise(r => { const tm = setTimeout(r, ms); v.wake = () => { clearTimeout(tm); r(); }; });
    v.done = t => { v.fin = true; v.log(t); bar.classList.add('ok'); btn.textContent = '关闭'; btn.disabled = false; setTimeout(v.close, 1500); };
    v.fail = t => { v.fin = true; v.log(t); bar.classList.add('bad'); btn.textContent = '关闭'; btn.disabled = false; };
    return v;
  },
};
const IPRep = {
  TH: 50, PURE: 75, running: false, at: 0, lastErr: '', rotAt: 0, rot: false,
  _d: null, _memo: new Map(), _rates: [],
  // 封号溯源高危毒 IP 与假国家聚合 ASN 黑名单（吸收自千面助手 v9.2 ban_forensics 报告）
  TOXIC_BAN_IPS: new Set([
    '150.109.11.223', '31.57.27.38', '5.175.236.53', '126.78.133.130', '188.253.22.211',
    '207.65.189.9', '193.122.119.241', '139.28.169.72', '67.220.80.99', '104.238.191.179',
    '194.147.88.43', '132.243.30.210', '14.137.235.154', '162.4.173.74', '192.236.234.71',
    '213.176.18.108', '219.76.13.167', '176.10.125.114', '62.182.198.178', '82.118.20.234',
    '185.232.204.222', '78.129.155.37', '84.234.17.132', '159.203.18.237', '23.246.165.123',
    '198.20.138.119', '83.228.193.177', '43.170.8.95', '43.175.16.48', '38.65.9.251',
    '77.73.71.200',
  ]),
  BLACKLISTED_ASNS: ['AS42532'],
  isToxicBanIp(ip, asn = '') {
    const clean = String(ip || '').trim().replace(/^\[|\]$/g, '').split(':')[0];
    if (clean && this.TOXIC_BAN_IPS.has(clean)) return true;
    const asnUp = String(asn || '').toUpperCase();
    return Boolean(asnUp && this.BLACKLISTED_ASNS.some(b => asnUp.includes(b)));
  },
  on() { return true; },   // 高风险过滤不可关：高风险 IP 一律禁止使用
  isIpLit(ip) {
    const s = String(ip || '').trim().replace(/^\[|\]$/g, '');
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(s) || (/^[0-9a-f:]+$/i.test(s) && s.includes(':'));
  },
  normIp(ip) {
    const s = String(ip || '').trim().replace(/^\[|\]$/g, '');
    return this.isIpLit(s) ? s : '';
  },
  hostOf(k, e) {
    if (e?.ip && this.isIpLit(e.ip)) return this.normIp(e.ip);
    if (this.isIpLit(k)) return this.normIp(k);
    const s = String(k || '').trim();
    const ci = s.indexOf(':');
    if (ci > 0 && s.indexOf(':', ci + 1) < 0) {
      const h = s.slice(0, ci);
      if (this.isIpLit(h)) return h;
    }
    const p0 = typeof Pool !== 'undefined' && Pool.parse ? Pool.parse(k) : null;
    return p0?.ip && this.isIpLit(p0.host) ? this.normIp(p0.host) : '';
  },
  egOf(k, e) {
    e ||= Pool.d?.ips?.[k];
    if (e?.eg && this.isIpLit(e.eg)) return this.normIp(e.eg);
    return this.hostOf(k, e);
  },
  repOf(k, e, d = Pool.d) {
    e ||= d?.ips?.[k];
    const host = this.hostOf(k, e);
    const eg = (e?.eg && this.isIpLit(e.eg)) ? this.normIp(e.eg) : host;
    const rEg = eg ? d?.rep?.[eg] : null;
    const rHost = host && host !== eg ? d?.rep?.[host] : null;
    if (!rEg && !rHost) return { eg: eg || host, host, p: {} };
    if (rEg && !rHost) return { eg, host, p: rEg };
    if (!rEg && rHost) return { eg: eg || host, host, p: rHost };
    const mergePu = (a, b) => {
      if (!a || !b) return a || b;
      const aReal = Boolean(a.real || ![8, 12, 15, 16, 22].includes(+a.fs));
      const bReal = Boolean(b.real || ![8, 12, 15, 16, 22].includes(+b.fs));
      if (aReal !== bReal) return aReal ? a : b;
      return (+b.fs > +a.fs)
        ? { ...a, ...b, fs: +b.fs, dc: Boolean(a.dc || b.dc), bc: Boolean(a.bc || b.bc) }
        : { ...b, ...a, fs: +a.fs, dc: Boolean(a.dc || b.dc), bc: Boolean(a.bc || b.bc) };
    };
    return {
      eg,
      host,
      p: {
        ...rHost,
        ...rEg,
        pu: mergePu(rEg.pu, rHost.pu),
        a: rEg.a || rHost.a,
        c: rEg.c || rHost.c,
        r: Math.max(+rEg.r || 0, +rHost.r || 0),
        px: Boolean(rEg.px || rHost.px),
        h: Boolean(rEg.h || rHost.h),
        m: Boolean(rEg.m || rHost.m),
        pp: Boolean(rEg.pp || rHost.pp),
        pt: rEg.pt || rHost.pt || '',
        isp: rEg.isp || rHost.isp || '',
        as: rEg.as || rHost.as || '',
      },
    };
  },
  trusted(k) { return !!Pool.d?.trust?.[String(k).toLowerCase()]; },
  invalidate(k) {
    if (!k) { this._memo.clear(); return; }
    const eg = this.egOf(k);
    if (eg) this._memo.delete(eg);
    this._memo.delete(String(k));
  },
  // 每次池子数据换了（mutate / load 都会换对象）就清缓存，重新统计各出口的实测人机验证率
  sync() {
    if (this._d === Pool.d) return;
    this._d = Pool.d; this._memo = new Map();
    if (Pool.d?.rq && Pool.d.rqv !== 2) { Pool.d.rq = {}; Pool.d.rqv = 2; }
    this._rates = Object.entries(Pool.d?.rq || {}).map(([ip, q]) => [ip, (q.ok || 0) + (q.rc || 0), q.rc || 0]).filter(x => x[1] >= 3).map(x => [x[0], x[2] / x[1]]).sort((a, b) => a[1] - b[1]);
  },
  // 别的出口里最好的实测人机验证率：拿来当基准（浏览器本身的问题会让所有 IP 都要验证，那就不怪某个 IP）
  best(eg) { const x = this._rates.find(r => r[0] !== eg); return x ? x[1] : 0; },
  score(k, e) {
    this.sync();
    if (k && !e) { const _memoHit = this._memo.get(String(k)); if (_memoHit) return _memoHit; }
    const d = Pool.d || {};
    e ||= d?.ips?.[k];
    const host = this.hostOf(k, e);
    const eg = (e?.eg && this.isIpLit(e.eg)) ? this.normIp(e.eg) : host;
    if (!eg) return { s: 0, known: false, why: [], tier: '' };
    const memoKey = host && host !== eg ? eg + '|' + host : eg;
    const m = this._memo.get(memoKey); if (m) { if (k && String(k) !== memoKey) this._memo.set(String(k), m); return m; }
    const { p } = this.repOf(k, e, d);
    const q = d.rq?.[eg] || (host ? d.rq?.[host] : null);
    const hasPu = Boolean(p.pu && Number.isFinite(+p.pu.fs));
    const hasCleanPu = Boolean(hasPu && +p.pu.fs < 25);
    const isCloudIsp = /\b(?:akile|akilecloud|dromatics|akamai|linode|digitalocean|vultr|constant company|choopa|hetzner|ovh|oracle|amazon|aws|google cloud|microsoft|azure|cloudflare|alibaba|aliyun|tencent|aceville|6 collyer quay|huawei|contabo|fornex|ionos|kagoya|webhorizon|cyberverse|brainoza|eurohoster|virterion|kaopu|light\s*node|scaleway|leaseweb|m247|datacamp|cdn77|zenlayer|dmit|veesp|trabia|baxet|waicore|trunk networks|hostkey|timeweb|racknerd|hostpapa|alphavps|livi hosting|terratransit|rocketcloud|hosting|hoster|datacenter|data\s*center|server|vps|cloud|colocation|dedicated)\b/i.test((p.isp || '') + ' ' + (p.pu?.org || ''));
    const isHosting = Boolean(p.h || p.pu?.dc || isCloudIsp);
    let s = 100, known = false; const why = ['出口 ' + eg];
    const asnStr = [p.as, p.pu?.asn, p.isp, p.pu?.org].filter(Boolean).join(' ');
    const isToxic = this.isToxicBanIp(eg, asnStr) || Boolean(host && this.isToxicBanIp(host, asnStr));
    if (isToxic) {
      known = true;
      s = Math.min(s, 12);
      why.push('−88 命中封号溯源毒 IP / 假国家黑名单节点（自动拦截禁用）');
    }
    if (p.a) {
      known = true;
      if (p.px && !hasCleanPu) { s -= 35; why.push('−35 IP 库标记为代理 / VPN 出口'); if (isHosting) { s -= 15; why.push('−15 机房公开代理（极易触发人机验证）'); } }
      if (isHosting && !hasCleanPu) { s -= 8; why.push('−8 机房 / 云厂商 IP' + (p.isp ? '（' + p.isp + '）' : '')); }
      else why.push((p.m ? '移动网络' : '家宽 / 企业网络') + (p.isp ? '（' + p.isp + '）' : ''));
    }
    if (p.c) {
      known = true;
      const r = Math.max(0, Math.min(100, +p.r || 0)), rawPen = r > 33 ? Math.round((r - 33) * 0.9) : 0, pen = hasCleanPu && r <= 75 ? Math.min(10, rawPen) : rawPen;
      s -= pen; why.push((pen ? '−' + pen + ' ' : '') + '风险值 ' + r + '/100' + (p.pt ? '（' + p.pt + '）' : ''));
      if (!(hasCleanPu && r <= 75)) {
        if (p.pp && /tor|compromised|socks|http|inference|proxy/i.test(p.pt || '')) { s -= 25; why.push('−25 公开代理 / 被入侵的设备'); }
        else if (p.pp) { s -= 20; why.push('−20 代理 / VPN 出口' + (p.pt ? '（' + p.pt + '）' : '')); }
      }
    }
    // IPv6 隧道出口或机房/云厂商 IP 若尚未拿到 IPPure 或复核评分，绝不能仅凭 ip-api 标成「≥75 纯净」或直接误判为「<50 高风险永久拉黑」
    if ((eg.includes(':') || isHosting || p.px) && !hasPu && !p.c) {
      known = false;
      s = Math.max(52, Math.min(s, 68));
      why.push((eg.includes(':') ? 'IPv6 出口' : '机房 / 云厂商 IP') + '尚未完成 IPPure 隧道复核（不作为纯净候选）');
    }
    // IPPure（经同一条隧道查「调用方」出口）：fraudScore 0–100，≥50 即高风险 → 分数封顶 99−fs
    if (hasPu) {
      known = true;
      const fs = +p.pu.fs, cap = 99 - fs, band = fs < 15 ? '极度纯净' : fs < 25 ? '纯净' : fs < 40 ? '中性' : fs < 50 ? '轻微风险' : fs < 70 ? '高风险' : '极度风险';
      if (s > cap) { why.push('−' + (s - cap) + ' IPPure 风险值 ' + fs + '/100（' + band + '）'); s = cap; }
      else why.push('IPPure 风险值 ' + fs + '/100（' + band + '）');
      if (p.pu.dc && p.pu.bc) { s -= 8; why.push('−8 机房广播 IP（IPPure）'); }
      else if (p.pu.res && fs < 25 && !p.px) { s = Math.min(100, s + 5); why.push('+5 住宅原生出口（IPPure）'); }
      why.push('IPPure：' + (p.pu.res ? '家宽' : (p.pu.dc || isHosting) ? '机房' : '非家宽') + (p.pu.bc ? ' · 广播 IP' : ' · 原生 IP') + (p.pu.org ? '（' + p.pu.org + '）' : ''));
    }
    if (q) {
      const n = (q.ok || 0) + (q.rc || 0), rc = q.rc || 0, ok = q.ok || 0;
      if (n >= 3) {
        known = true;
        const rate = rc / n, base = this._rates.length ? Math.min(0.25, this.best(eg)) : 0;
        const pen = rc ? Math.max(rc >= 2 && rate >= 0.5 ? 52 : (rate >= 0.25 ? 28 : 0), Math.round((rate - base) * 80)) : 0;
        s -= pen; why.push((pen ? '−' + pen + ' ' : '') + '实测发送 ' + n + ' 次，' + rc + ' 次被要求人机验证');
        if (!rc && ok >= 5) { s += 5; why.push('+5 实测从没被要求人机验证'); }
      } else if (rc >= 1) {
        known = true;
        const pen = rc >= 2 && !ok ? 55 : 30;
        s -= pen; why.push('−' + pen + ' 实测发送 ' + n + ' 次即出现 ' + rc + ' 次人机验证报错（自动降级筛除）');
      } else if (n) why.push('实测发送 ' + n + ' 次，0 次被要求人机验证');
      if (q.l && now() - (q.lt || 0) < 48 * 3600e3) { const pen = Math.min(20, q.l * 5); s -= pen; why.push('−' + pen + ' 最近 ' + q.l + ' 次 429 限流'); }
    }
    if (!known) why.push('还没评估（后台自动进行）');
    if (isToxic) s = Math.min(s, 12);
    s = Math.max(0, Math.min(100, s));
    const r = { s, known, why, tier: !known ? '' : s >= 75 ? 'good' : s >= this.TH ? 'mid' : 'bad' };
    this._memo.set(memoKey, r);
    if (k && String(k) !== memoKey) this._memo.set(String(k), r);
    return r;
  },
  // 提取 IPv4 /24 或 IPv6 /64 子网键（用于跨账号子网去重防连坐）
  subnetOf(ip) {
    const raw = this.normIp(ip);
    if (!raw) return '';
    if (raw.includes('.')) {
      const parts = raw.split('.');
      if (parts.length === 4) return parts.slice(0, 3).join('.');
    }
    if (raw.includes(':')) {
      const parts = raw.split(':');
      if (parts.length >= 4) return parts.slice(0, 4).join(':');
    }
    return raw;
  },
  // A07 Cox 比例风险与 RTT 综合纯净存活度评分（0–100）
  coxSurvivalScore(k, e, rttMs = 115) {
    const sc = this.score(k, e);
    const d = (typeof Pool !== 'undefined' && Pool.d) ? Pool.d : {};
    const { eg } = this.repOf(k, e, d);
    const q = eg ? d.rq?.[eg] : null;
    const rcCount = Math.max(0, +(q?.rc || 0));
    const rlCount = Math.max(0, +(q?.l || 0));
    const hazardPenalty = Math.exp(-0.85 * rcCount - 0.35 * rlCount);
    const rtt = Math.max(10, Number(rttMs || e?.ms || 115) || 115);
    const rttFactor = 1.0 / (1.0 + Math.pow(rtt / 220.0, 1.8));
    const basePurity = (sc.known ? sc.s : 68) / 100.0;
    const purityScore = Math.round(100.0 * basePurity * hazardPenalty * (0.65 + 0.35 * rttFactor) * 100) / 100;
    return {
      purityScore: Math.max(0, Math.min(100, purityScore)),
      coxSurvivalProb: Math.round(hazardPenalty * 10000) / 10000,
      rttFactor: Math.round(rttFactor * 10000) / 10000,
      subnet: this.subnetOf(eg || k),
    };
  },
  // A12 订阅源节点 EWMA-UCB1 上置信界质量评分（0–100）
  ucbNodeScore(okCount = 48, totalTrials = 50, ewmaLatencyMs = 108, totalPoolTrials = 500) {
    const nI = Math.max(1, Number(totalTrials) || 1);
    const pHat = Math.max(0, Math.min(1, (Number(okCount) || 0) / nI));
    const latPen = 0.25 * (Math.max(10, Number(ewmaLatencyMs) || 108) / 250.0);
    const ucbBonus = 0.12 * Math.sqrt(2.0 * Math.log(Math.max(2, Number(totalPoolTrials) || 2)) / nI);
    return Math.round(Math.max(0, Math.min(100, (pHat - latPen + ucbBonus) * 100)) * 100) / 100;
  },
  // ---- IPPure 结果入库（检测时经隧道顺带取回）：按出口 IP 记，7 天内有效 ----
  // 出口 IP 类型标签：IPPure 判定优先（家宽 = 住宅、数据中心 = 机房），其次 ip-api（mobile = 移动、hosting = 机房）；都不知道 → null（不显示）
  kind(k, e) {
    const { eg, p: r } = this.repOf(k, e); if (!eg || !r || (!r.a && !r.pu && !r.c)) return null;
    const pu = r.pu, puOk = pu && Number.isFinite(+pu.fs), org = pu?.org || r.isp || '', tail = org ? '（' + org + '）' : '';
    if (pu?.res) return { t: '住宅', c: 'res', why: '住宅 IP（IPPure 判定为家宽）' + tail + '\n出口 ' + eg };
    if (r.m && !pu?.dc && !r.h) return { t: '移动', c: 'mob', why: '移动网络 IP（ip-api）' + tail + '\n出口 ' + eg };
    if (pu?.dc || r.h) return { t: '机房', c: 'dc', why: '机房 / 数据中心 IP（' + (pu?.dc ? 'IPPure' : 'ip-api') + '）' + tail + '\n出口 ' + eg };
    // IPPure 只可靠地给「是不是家宽」：评估过且不是家宽 = 机房 / 企业线路
    if (puOk) return { t: '机房', c: 'dc', why: '非住宅 IP（IPPure 判定不是家宽）' + tail + '\n出口 ' + eg };
    // 只有 ip-api：没标机房 / 代理 = 家宽或企业宽带，按住宅显示
    if (r.a && !r.px) return { t: '住宅', c: 'res', why: '住宅 / 宽带 IP（ip-api 未标机房）' + tail + '\n出口 ' + eg };
    return null;
  },
  // 底栏：当前出口还没评估（节点出口、尚未解析的 ProxyIP 域名…）就自己查一次（ip-api + IPPure；同一 IP 10 分钟内最多一次）
  curEval(ip) {
    // 只在客户端页面里查（浏览器模式 / 官网页面不发任何请求，结果在本机共享，客户端查完浏览器模式底栏也会显示）
    if (location.pathname !== '/robots.txt' && !window.__ANC_CLIENT_SHELL) return;
    ip = this.normIp(ip);
    if (!ip || typeof Pool === 'undefined') return;
    const r = Pool.d?.rep?.[ip];
    const hasVerifiedPu = Boolean(r?.pu && Number.isFinite(+r.pu.fs) && (r.pu.real === 1 || ![8, 12, 15, 16, 22].includes(+r.pu.fs)));
    if (hasVerifiedPu) return;
    this._curAt ||= {}; if (now() - (this._curAt[ip] || 0) < 10 * 60e3) return; this._curAt[ip] = now();
    const tasks = [];
    if (!r?.a && Host.fetchText) {
      tasks.push(Pool.load().then(() => Host.fetchText('http://ip-api.com/json/' + encodeURIComponent(ip) + '?fields=status,query,isp,org,as,mobile,proxy,hosting', { direct: true })).then(res => {
        let x = null; try { x = res?.text ? JSON.parse(res.text) : null; } catch {}
        if (!x || x.status !== 'success') return;
        return Pool.mutate(d => this.putIpa(d, ip, { ip: x.query || ip, h: !!x.hosting, px: !!x.proxy, m: !!x.mobile, isp: x.isp || x.org || '', as: String(x.as || '').split(' ')[0] }));
      }).catch(() => {}));
    }
    if (!hasVerifiedPu && (Host.ippureDirect || typeof fetch === 'function')) {
      tasks.push((async () => {
        if (Host.ippureDirect) {
          const aHost = (typeof UI !== 'undefined' && UI.host?.account?.proxyIp) ? this.hostOf(UI.host.account.proxyIp) : '';
          const v4Host = (ip.includes(':') && aHost && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(aHost)) ? aHost : '';
          const [dp, dpV4] = await Promise.all([
            Host.ippureDirect(ip).catch(() => null),
            v4Host ? Host.ippureDirect(v4Host).catch(() => null) : Promise.resolve(null),
          ]);
          if ((dp && Number.isFinite(+dp.fs)) || (dpV4 && Number.isFinite(+dpV4.fs))) {
            await Pool.mutate(d => {
              if (dp && Number.isFinite(+dp.fs)) {
                const puIp = this.normIp(dp.ip) || ip;
                this.putPu(d, puIp, dp);
                if (puIp !== ip) this.putPu(d, ip, { ...dp, ip });
              }
              if (dpV4 && Number.isFinite(+dpV4.fs) && v4Host) {
                this.putPu(d, v4Host, { ...dpV4, ip: v4Host, real: 1 });
              }
            });
            return;
          }
        }
        if (typeof fetch !== 'function') return;
        const res = await fetch('https://my.ippure.com/v1/info', { cache: 'no-store' });
        const j = res.ok ? await res.json() : null;
        if (!j || !Number.isFinite(+j.fraudScore)) return;
        const puIp = this.normIp(j.ip) || ip;
        await Pool.mutate(d => {
          this.putPu(d, puIp, { ip: puIp, fs: +j.fraudScore, res: !!j.isResidential, bc: !!j.isBroadcast, dc: !!j.isDataCenter, org: String(j.asOrganization || '').slice(0, 40), real: 1 });
          if (puIp !== ip) this.putPu(d, ip, { ip, fs: +j.fraudScore, res: !!j.isResidential, bc: !!j.isBroadcast, dc: !!j.isDataCenter, org: String(j.asOrganization || '').slice(0, 40), real: 1 });
        });
      })().catch(() => {}));
    }
    if (!tasks.length) return;
    void Promise.all(tasks).then(() => {
      this._d = null; this._memo?.clear?.();
      try { Bar.render(); } catch {}
      try { this.check({ forceOnHighRisk: true }); } catch {}
    }).catch(() => {});
  },
  // 出口类型（只标类型，不显示具体来源）：sstp:// → SSTP，socks5:// → SOCKS5 …；普通 ProxyIP → ProxyIP
  via(k) { try { const p = typeof Pool !== 'undefined' && Pool.parse ? Pool.parse(k) : null; return p?.chain ? ({ socks5: 'SOCKS5', http: 'HTTP', https: 'HTTPS', turn: 'TURN', sstp: 'SSTP' }[p.chain] || String(p.chain).toUpperCase()) : 'ProxyIP'; } catch { return 'ProxyIP'; } },
  // 当前账号出口的纯净度 / 类型（底栏、地区 IP 弹窗共用）：有 ProxyIP 按它的出口算；没有就按实测出口 IP 查库
  cur(a, ip) {
    const out = { k: '', e: null, sc: null, label: '未评估', cls: 'r-none', kind: null, pct: null };
    try {
      const k = a?.proxyIp || '', P = typeof Pool !== 'undefined' ? Pool : null;
      const nip = this.normIp(ip);
      let e = k && P ? P.d?.ips?.[k] : null;
      if (e && nip && e.eg !== nip) e = { ...e, eg: nip };
      if (!e && nip && P?.d?.rep?.[nip]) e = { eg: nip };
      if (!e && nip) { this.curEval(nip); return out; }
      if (!e) return out;
      const key = k || nip, sc = this.score(key, e), label = this.label(sc);
      const curPu = P?.d?.rep?.[this.egOf(key, e)]?.pu;
      const unverifiedCurPu = !curPu || (!curPu.real && [8, 12, 15, 16, 22].includes(+curPu.fs));
      if ((!sc.known || unverifiedCurPu) && nip) this.curEval(nip);
      return { k: key, e, sc, label, cls: { 纯净: 'r-good', 一般: 'r-mid', 高风险: 'r-bad' }[label] || 'r-none', kind: this.kind(key, e), pct: sc.known ? Math.round(sc.s) : null };
    } catch { return out; }
  },
  putPu(d, eg, pu) {
    eg = this.normIp(eg);
    if (!pu || !eg || !Number.isFinite(+pu.fs)) return;
    const puIp = this.normIp(pu.ip);
    const isDualStack = Boolean(puIp && eg.includes(':') !== puIp.includes(':'));
    if (puIp && puIp !== eg && !isDualStack) return;
    const entry = { fs: +pu.fs, res: !!pu.res, bc: !!pu.bc, dc: !!pu.dc, org: String(pu.org || '').slice(0, 40), at: now(), ...(pu.real ? { real: 1 } : {}) };
    d.rep ||= {}; (d.rep[eg] ||= {}).pu = entry;
    if (isDualStack && puIp) (d.rep[puIp] ||= {}).pu = entry;
  },
  // ip-api 经隧道查到的（调用方 = 出口）：等同批量查询结果
  putIpa(d, eg, x) {
    eg = this.normIp(eg);
    const xIp = this.normIp(x?.ip);
    const isDualStack = Boolean(xIp && eg && eg.includes(':') !== xIp.includes(':'));
    if (!x || !eg || (xIp && xIp !== eg && !isDualStack)) return;
    const patch = { a: now(), h: !!x.h, px: !!x.px, m: !!x.m, isp: String(x.isp || '').slice(0, 40), as: String(x.as || '').split(' ')[0].slice(0, 12) };
    d.rep ||= {}; Object.assign(d.rep[eg] ||= {}, patch);
    if (isDualStack && xIp) Object.assign(d.rep[xIp] ||= {}, patch);
  },
  // 线路检测（确认 / 一键切换）带回的结果
  notePure(pip, r) {
    if (!(r?.pure || r?.ipa) || !r.ip || typeof Pool === 'undefined') return;
    const k = String(pip || '').trim();
    Pool.mutate(d => { this.putPu(d, r.ip, r.pure); this.putIpa(d, r.ip, r.ipa); if (k && d.ips?.[k] && !d.ips[k].eg) d.ips[k].eg = r.ip; }).then(() => this.soon(k ? [k] : [])).catch(() => {});
  },
  // 有新检测结果：稍等合并后立即处理 —— 没拿到 IPPure 的用 ip-api / proxycheck 补评，高风险的马上拉黑删除（零容忍）
  soon(keys) {
    this._q ||= new Set(); for (const k of keys || []) if (k) this._q.add(k);
    clearTimeout(this._st); this._st = setTimeout(() => this.flushSoon().catch(() => {}), 1200);
  },
  async flushSoon() {
    if (this._fl) { this.soon([]); return; }
    const keys = [...(this._q || [])]; this._q = new Set(); this._fl = true;
    try {
      await Pool.load();
      const unk = keys.filter(k => { const e = Pool.d.ips?.[k]; return e && e.ok === true && !e.gone && !this.trusted(k) && !this.score(k, e).known; });
      const r = unk.length && Host.fetchText ? await this.rate(unk) : await Pool.clearRisk().then(x => ({ removed: x?.n || 0, banned: x?.skip || 0 }));
      if (r?.removed || r?.banned) this.check();
    } finally { this._fl = false; Bus.emit('pool'); }
  },
  // 手动选的 ProxyIP 确认前把关：先评估（IPPure 已随检测取回，否则 ip-api / proxycheck），高风险 → 拉黑删除并拒绝
  async vet(pip, eg) {
    pip = String(pip || '').trim(); if (!pip || this.trusted(pip) || typeof Pool === 'undefined') return { ok: true };
    await Pool.load(true).catch(() => {});
    eg = this.isIpLit(eg) ? this.normIp(eg) : this.egOf(pip); if (!eg) return { ok: true };
    // 实测出口和列表里记的出口不一样（ProxyIP 换了落地）：以实测为准写回，列表的纯净度 / 类型跟着更新，不再显示旧出口的分数
    { const e0 = Pool.d?.ips?.[pip]; if (e0 && this.isIpLit(eg) && e0.eg !== eg) await Pool.mutate(d => { const x = d.ips?.[pip]; if (x) x.eg = eg; }).catch(() => {}); }
    const sc = () => { this._d = null; return this.score(pip, { eg }); };
    let r = sc();
    if (!r.known && Host.fetchText) { await this.rate([], [eg]).catch(() => {}); r = sc(); }
    if (!r.known) return { ok: false, error: '出口 IP ' + pip + ' 暂时无法评估纯净度（评估服务没有结果），只能使用已确认纯净的 IP' };
    if (r.s >= this.PURE) return { ok: true, s: r.s, known: true };
    const used = Pool.usedMap(), x = pip.toLowerCase();
    if (r.s >= this.TH) return { ok: false, s: r.s, error: '出口 IP ' + pip + ' 纯净度 ' + r.s + ' 分（一般），只能使用纯净（≥ ' + this.PURE + ' 分）的 IP' };
    await Pool.mutate(d => {
      if (typeof Pool.banForever === 'function') Pool.banForever(d, pip, '高风险（' + r.s + ' 分）· 已永久拉黑');
      else { d.ban ||= {}; d.ban[x] = now(); if (d.ips[pip] && !used.has(x)) { const e = d.ips[pip]; delete d.ips[pip]; if (!e.src) d.src = (d.src || []).filter(y => y !== pip); else { d.drop ||= {}; d.drop[pip] = now(); } } }
    }).catch(() => {});
    Bus.emit('pool');
    return { ok: false, s: r.s, error: '出口 IP ' + pip + (eg !== pip ? '（' + eg + '）' : '') + ' 纯净度 ' + r.s + ' 分，属于高风险，已拉黑并删除' };
  },
  // 可选 / 可应用的必须是「已评估且纯净」（≥ PURE 分）；手动「信任」的除外。未评估、一般、高风险一律不作为选项
  pure(k, e) { if (this.trusted(k)) return true; const r = this.score(k, e); return r.known && r.s >= this.PURE; },
  // 非纯净判定（< 75 分，含「一般 50-74」与「高风险 < 50」）：在池扫描与自动清理中一律永久拉黑并剔除，保证池中只留纯净 IP
  impure(k, e) { if (!this.on() || this.trusted(k)) return false; const r = this.score(k, e); return r.known && r.s < this.PURE; },
  // 打开地区 / 出口选择时：若已有纯净 IP 或后台全量扫描正在进行，直接复用现有纯净池，不阻塞也不触发重扫
  async prime(cc) {
    if (!cc || typeof Pool === 'undefined' || Pool.prog) return; this._pr ||= {};
    if (now() - (this._pr[cc] || 0) < 600e3) return; this._pr[cc] = now();
    try {
      await Pool.load();
      const ks = () => Pool.entries().filter(([k, e]) => e.loc === cc && !e.gone && e.ok === true && !Pool.banned(k) && !this.trusted(k));
      if (ks().some(([k, e]) => this.pure(k, e))) return;
      const unk = () => ks().filter(([k, e]) => !this.score(k, e).known).map(([k]) => k);
      let u = unk(); if (u.length && Host.fetchText) await this.rate(u.slice(0, 25)).catch(() => {});
    } catch {} finally { Bus.emit('pool'); }
  },
  risky(k, e) { if (!this.on() || this.trusted(k)) return false; const r = this.score(k, e); return r.known && r.s < this.TH; },
  // 择优排序用：纯净 2 / 未评估、一般 1 / 高风险 0
  rank(k, e) { const r = this.score(k, e); return !r.known ? 1 : r.s >= 75 ? 2 : r.s >= this.TH ? 1 : 0; },
  label(r) { return !r.known ? '未评估' : r.s >= 75 ? '纯净' : r.s >= this.TH ? '一般' : '高风险'; },
  setTrust(k, on) { return Pool.mutate(d => { d.trust ||= {}; const x = String(k).toLowerCase(); if (on) d.trust[x] = now(); else delete d.trust[x]; }); },
  setOn(on) { return Pool.mutate(d => { d.repOn = !!on; }).then(() => { if (on) this.check(); }); },

  // ---- 实测记录：发送结果按「Brana 看到的出口 IP」记 ----
  // kind: ok = v3 直接通过；rc = 被要求人机验证；l = 429
  note(kind) {
    try {
      const a = UI.host?.account, pip = a && isVless(a.proxy) && a.proxyIp ? String(a.proxyIp).trim() : '';
      const eg = this.normIp((pip && Pool.d?.ips?.[pip]?.eg) || (!IP.err && IP.ip) || ''); if (!eg) return;
      Pool.mutate(d => {
        if (d.rq && d.rqv !== 2) d.rq = {};
        d.rqv = 2; d.rq ||= {}; const q = d.rq[eg] ||= { ok: 0, rc: 0 };
        if (now() - (q.at || 0) > 3 * 86400e3) { q.ok >>= 1; q.rc >>= 1; }   // 旧数据减半：IP 信誉会变
        if (kind === 'l') { if (now() - (q.lt || 0) > 48 * 3600e3) q.l = 0; q.l = (q.l || 0) + 1; q.lt = now(); }
        else { q[kind] = (q[kind] || 0) + 1; if (q.ok + q.rc > 40) { q.ok = Math.round(q.ok * 0.75); q.rc = Math.round(q.rc * 0.75); } }
        if ((kind === 'rc' || kind === 'l') && pip) {
          if (d.ips?.[pip]) d.ips[pip].cool = Math.max(d.ips[pip].cool || 0, now() + 30 * 60e3);
          if (typeof Pool.banForever === 'function') Pool.banForever(d, pip, kind === 'rc' ? '触发人机验证 · 不纯净已永久拉黑' : '触发 429 限流 · 不稳定已永久拉黑');
          else { d.ban ||= {}; d.ban[pip.toLowerCase()] = now(); }
        }
        q.at = now();
      }).then(() => { if (kind === 'rc') this.soon(pip ? [pip] : []); if (kind !== 'ok') setTimeout(() => this.check({ forceOnError: true }), 1500); }).catch(() => {});
    } catch {}
  },

  // ---- 发消息前智能轻量预检：与取令牌并行核对当前实际落地出口与 IPPure 纯净度；若发现出口漂移变脏（<75 分）则在真正 POST 前无感换纯 IP ----
  async ensurePreSendPure(opt = {}) {
    try {
      if (typeof Prefs !== 'undefined' && Prefs.preSendPurityCheck === false) return { ok: true, skipped: true };
      if (navigator.onLine === false || typeof Pool === 'undefined' || Pool.isFixtureEnv?.()) return { ok: true, skipped: true };
      const a = typeof UI !== 'undefined' ? UI?.host?.account : null;
      if (!a || !isVless(a.proxy)) return { ok: true, skipped: true };
      await Pool.load();
      const k = String(a.proxyIp || '').trim();
      if (!k || this.trusted(k)) return { ok: true, skipped: true };
      const timeoutMs = Math.max(400, Math.min(2000, Number(opt?.timeoutMs) || 1200));
      const traceFresh = Boolean(typeof IP !== 'undefined' && IP.ip && !IP.err && (now() - Math.max(IP.checkedAt || 0, IP.at || 0) < 90000));
      if (!traceFresh && typeof IP !== 'undefined' && typeof IP.ping === 'function' && typeof Host !== 'undefined' && Host.ippureDirect) {
        await Promise.race([IP.ping(true).catch(() => {}), sleep(Math.min(850, timeoutMs))]);
      }
      let e = Pool.d?.ips?.[k] || null;
      const liveIp = this.normIp((typeof IP !== 'undefined' && !IP.err && IP.ip) || '');
      if (e && liveIp && e.eg !== liveIp) {
        await Pool.mutate(d => { if (d.ips?.[k]) d.ips[k].eg = liveIp; }).catch(() => {});
        e = Pool.d?.ips?.[k] || { ...e, eg: liveIp };
        this.invalidate(k);
      }
      const eg = liveIp || this.egOf(k, e);
      if (!eg) return { ok: true };
      const repEntry = Pool.d?.rep?.[eg];
      const kHost = k ? this.hostOf(k) : '';
      const v4Host = (eg.includes(':') && kHost && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(kHost)) ? kHost : '';
      const repHost = v4Host ? Pool.d?.rep?.[v4Host] : null;
      const needRealPu = !repEntry?.pu || (!repEntry.pu.real && [8, 12, 15, 16, 22].includes(+repEntry.pu.fs)) || (now() - (repEntry.pu.at || 0) > 7 * 86400e3) || Boolean(v4Host && (!repHost?.pu || (!repHost.pu.real && [8, 12, 15, 16, 22].includes(+repHost.pu.fs))));
      if (needRealPu && typeof Host !== 'undefined' && typeof Host.ippureDirect === 'function') {
        const [dp, dpV4] = await Promise.race([
          Promise.all([
            Host.ippureDirect(eg).catch(() => null),
            v4Host ? Host.ippureDirect(v4Host).catch(() => null) : Promise.resolve(null),
          ]),
          sleep(Math.min(850, timeoutMs)).then(() => [null, null]),
        ]);
        if ((dp && Number.isFinite(+dp.fs)) || (dpV4 && Number.isFinite(+dpV4.fs))) {
          await Pool.mutate(d => {
            if (dp && Number.isFinite(+dp.fs)) {
              this.putPu(d, eg, dp);
              const puIp = this.normIp(dp.ip);
              if (puIp && puIp !== eg) this.putPu(d, puIp, dp);
            }
            if (dpV4 && Number.isFinite(+dpV4.fs) && v4Host) {
              this.putPu(d, v4Host, { ...dpV4, ip: v4Host, real: 1 });
            }
          }).catch(() => {});
          this.invalidate(k);
        }
      }
      const liveEntry = liveIp ? { ...(e || {}), eg: liveIp } : e;
      const sc = this.score(k, liveEntry);
      const isBanned = Boolean(Pool.banned?.(k) || Pool.d?.banEg?.[eg.toLowerCase()]);
      const isDirty = isBanned || Boolean(sc.known && sc.s < this.PURE);
      if (!isDirty) return { ok: true, pure: true, score: sc.s, eg };
      await Pool.mutate(d => {
        if (!this.trusted(k) && typeof Pool.banForever === 'function') {
          Pool.banForever(d, k, '发消息前预检出口不纯净（' + sc.s + ' 分）· 已自动拉黑切换');
        }
        if (eg && sc.s < this.TH) { d.banEg ||= {}; d.banEg[eg.toLowerCase()] = now(); }
      }).catch(() => {});
      const targetCc = String(a.region || (e?.loc && e.loc !== '?' ? e.loc : '') || '').trim().toUpperCase();
      if (!targetCc || !Pool.canRotate?.(a) || !Pool.avail(targetCc, a.id).length) {
        return { ok: false, dirty: true, score: sc.s, eg };
      }
      const sw = await Pool.acquire(a, targetCc, { exclude: new Set([k]), noScreen: true }).catch(() => null);
      if (sw?.ok) {
        try { UI.host = await Host.info(); UI.renderAcct?.(); } catch {}
        if (typeof toast === 'function') {
          toast('发消息前检测到 ProxyIP ' + k + ' 出口变脏（' + sc.s + ' 分），已自动切换至纯净出口 ' + sw.to);
        }
        setTimeout(() => { try { IP.poll(); } catch {} }, 600);
        return { ok: true, switched: true, from: k, to: sw.to, score: sc.s, eg };
      }
      return { ok: false, dirty: true, score: sc.s, eg };
    } catch {
      return { ok: true };
    }
  },

  // ---- 当前账号的 IP 变成高风险 / 被拉黑 / 缺失 ProxyIP：自动切换到已验证纯净的 ProxyIP（正常非高风险时不因延迟切换） ----
  async check(opt = {}) {
    try {
      const a = UI.host?.account; if (!a || this.rot || navigator.onLine === false || !isVless(a.proxy)) return;
      if (typeof AutoRoute !== 'undefined' && AutoRoute.manualLockUntil && now() < AutoRoute.manualLockUntil && !opt?.forceOnError && !opt?.forceOnHighRisk) return;
      await Pool.load();
      const k = a.proxyIp && String(a.proxyIp).trim() || '';
      const e = k ? Pool.d.ips?.[k] : null;
      const liveIp = this.normIp(!IP?.err && IP?.ip || '');
      const liveEntry = liveIp ? { ...(e || {}), eg: liveIp } : e;
      const isChainNode = /\/video\//i.test(a.proxy || '');
      const isRisky = Boolean((k && e && this.risky(k, e)) || (liveIp && this.risky(k || liveIp, liveEntry)));
      if (!isRisky && liveIp && this.pure(k || liveIp, liveEntry)) {
        if (e?.banned || e?.gone || e?.ok === false || (k && Pool.d?.ban?.[k.toLowerCase()]) || Pool.d?.banEg?.[liveIp.toLowerCase()]) {
          await Pool.mutate(d => {
            if (k && d.ban) delete d.ban[k.toLowerCase()];
            if (d.banEg) delete d.banEg[liveIp.toLowerCase()];
            if (k && d.ips?.[k]) Object.assign(d.ips[k], { ok: true, gone: false, banned: false, err: '', fc: 0 });
          }).catch(() => {});
        }
        return;
      }
      const liveBad = Boolean(liveIp && (this.risky(k || liveIp, liveEntry) || Pool.d?.banEg?.[liveIp.toLowerCase()]));
      const kBad = Boolean(k && !this.trusted(k) && (Pool.banned(k) || e?.gone || (!liveIp && e?.ok === false) || (e && this.risky(k, e))));
      const kMissing = Boolean(!k && !isChainNode && liveBad);
      const forceImpure = Boolean(opt?.forceOnError && k && e && this.score(k, e).known && !this.pure(k, e));
      if (!(kBad || liveBad || kMissing || forceImpure)) return;
      if (!opt?.forceOnError && !opt?.forceOnHighRisk) {
        if (typeof RouteState !== 'undefined' && RouteState.mode && RouteState.mode(a) !== 'auto') return;
        if (typeof Pool !== 'undefined' && Pool.canRotate && !Pool.canRotate(a)) return;
      }
      const hard = kBad || liveBad || kMissing;
      if (!opt?.forceOnError && !opt?.forceOnHighRisk && now() - this.rotAt < (hard ? 15e3 : 30 * 60e3)) return;
      if ([...Chats.values()].some(c => c.busy) || document.querySelector('.rc-back') || this.screening) { clearTimeout(this.ct); this.ct = setTimeout(() => this.check(opt), 30e3); return; }
      this.rot = true; this.rotAt = now();
      if (liveBad && k && !this.trusted(k)) {
        await Pool.mutate(d => {
          if (typeof Pool.banForever === 'function') Pool.banForever(d, k, '实测出口 ' + liveIp + ' 高风险 · 已永久拉黑');
          if (liveIp) { d.banEg ||= {}; d.banEg[liveIp.toLowerCase()] = now(); }
        }).catch(() => {});
      }
      const sc = (k || liveIp) ? this.score(k || liveIp, liveEntry) : null;
      let targetCc = a.region || (e?.loc && e.loc !== '?' ? e.loc : '') || '';
      if (!targetCc || !Pool.avail(targetCc, a.id).length) {
        const bestAny = Pool.availAllPureLowestLatency?.(a.id)?.[0];
        if (bestAny && (!targetCc || !a.region)) targetCc = Pool.d?.ips?.[bestAny]?.loc || targetCc || 'JP';
      }
      if (!k && (!targetCc || !Pool.avail(targetCc, a.id).length)) return;
      const bgNoScreen = !k || (!opt?.forceOnError && !opt?.forceOnHighRisk);
      let r;
      if (targetCc && Pool.canRotate(a)) r = await Pool.acquire(a, targetCc, { exclude: new Set(k ? [k] : []), noScreen: bgNoScreen });
      else if ((opt?.forceOnError || opt?.forceOnHighRisk) && typeof RegionIP !== 'undefined' && RegionIP.switchNext) r = await RegionIP.switchNext({ owner: a.id, noScreen: bgNoScreen });
      else return;
      if (r?.ok) {
        try { UI.host = await Host.info(); UI.renderAcct?.(); } catch {}
        toast((k ? 'ProxyIP ' + k : '当前出口 ' + (liveIp || '未绑定 ProxyIP')) + (sc?.known && sc.s >= this.TH ? ' 不够纯净' : ' 属于高风险/异常') + (sc?.known ? '（' + sc.s + ' 分）' : '') + '，已自动切换到纯净出口 ' + r.to);
        setTimeout(() => { try { IP.poll(); } catch {} }, 800);
      } else if (r && !r.cancelled && k) toast('当前 ProxyIP ' + k + ' 是高风险，自动更换失败：' + (r.error || '没有可用纯净 IP'), 'err');
    } catch {} finally { this.rot = false; }
  },

  // ---- 后台评估：只查过期的（ip-api 7 天、proxycheck 14 天），多个账号窗口共用一把锁和每日额度 ----
  async run(force) {
    if (this.running || navigator.onLine === false || !Host.fetchText) return;
    try { await Pool.load(true); } catch { return; }
    if (!Pool.entries().length) return;
    const go = await Pool.mutate(d => { if (!force && now() - (d.repRun || 0) < 20 * 60e3) return false; d.repRun = now(); return true; }).catch(() => false);
    if (!go) return;
    this.running = true; this.lastErr = ''; Bus.emit('pool');
    try {
      const used = Pool.usedMap(), egs = new Map();
      for (const [k, e] of Pool.entries()) {
        if (e.gone || e.ok !== true) continue;
        const eg = this.egOf(k, e); if (!eg) continue;
        const pr = used.has(k.toLowerCase()) ? 0 : 1, c = egs.get(eg);
        if (!c || pr < c.pr || (pr === c.pr && (e.ms || 9e9) < c.ms)) egs.set(eg, { pr, ms: e.ms || 9e9, loc: e.loc || '?' });
      }
      const rep = () => Pool.d.rep || {};
      // ① ip-api：一批 100 个，每分钟不超过 15 批
      const a = [...egs.keys()].filter(ip => now() - (rep()[ip]?.a || 0) > 7 * 86400e3);
      for (let i = 0; i < a.length; i += 100) {
        if (i) await sleep(4500);
        const part = a.slice(i, i + 100);
        const r = await Host.fetchText('http://ip-api.com/batch?fields=status,query,isp,org,as,mobile,proxy,hosting', { method: 'POST', body: JSON.stringify(part), type: 'application/json', direct: true }).catch(e => ({ error: cleanErr(e) }));
        let arr = null; try { arr = r?.text ? JSON.parse(r.text) : null; } catch {}
        if (!Array.isArray(arr)) { this.lastErr = 'ip-api：' + (r?.error || '返回格式不对'); break; }
        await Pool.mutate(d => {
          d.rep ||= {};
          for (const x of arr) if (x && x.status === 'success' && x.query) Object.assign(d.rep[x.query] ||= {}, { a: now(), h: !!x.hosting, px: !!x.proxy, m: !!x.mobile, isp: String(x.isp || x.org || '').slice(0, 40), as: String(x.as || '').split(' ')[0].slice(0, 12) });
        });
      }
      // ② proxycheck：每日额度内，先查账号在用的，再按地区轮流挑延迟最低的
      const key = String(Pool.d.pckey || '').trim(), cap = key ? 900 : 90, day = new Date().toISOString().slice(0, 10);
      const left = cap - (Pool.d.pcq?.day === day ? Pool.d.pcq.n || 0 : 0);
      if (left > 0) {
        const cand = [...egs].filter(([ip]) => now() - (rep()[ip]?.c || 0) > 14 * 86400e3).sort((x, y) => x[1].pr - y[1].pr || x[1].ms - y[1].ms);
        const first = cand.filter(x => x[1].pr === 0), groups = {};
        for (const x of cand) if (x[1].pr !== 0) (groups[x[1].loc] ||= []).push(x);
        const rr = []; for (let i = 0; ; i++) { let any = false; for (const g of Object.values(groups)) if (g[i]) { rr.push(g[i]); any = true; } if (!any) break; }
        const pick = [...first, ...rr].slice(0, left).map(x => x[0]);
        for (let i = 0; i < pick.length; i += 25) {
          if (i) await sleep(1500);
          const part = pick.slice(i, i + 25);
          const r = await Host.fetchText('https://proxycheck.io/v2/?vpn=1&risk=1' + (key ? '&key=' + encodeURIComponent(key) : ''), { method: 'POST', body: 'ips=' + part.join(','), type: 'application/x-www-form-urlencoded', direct: true }).catch(e => ({ error: cleanErr(e) }));
          let j = null; try { j = r?.text ? JSON.parse(r.text) : null; } catch {}
          if (!j || typeof j !== 'object') { this.lastErr = 'proxycheck：' + (r?.error || '返回格式不对'); break; }
          if (j.status === 'denied' || j.status === 'error') {
            this.lastErr = 'proxycheck：' + String(j.message || j.status).slice(0, 120);
            await Pool.mutate(d => { d.pcq = { day, n: cap }; }); break;   // 今天额度用完了
          }
          await Pool.mutate(d => {
            d.rep ||= {}; d.pcq = d.pcq?.day === day ? d.pcq : { day, n: 0 }; d.pcq.n = (d.pcq.n || 0) + part.length;
            for (const ip of part) { const x = j[ip]; if (x && typeof x === 'object') Object.assign(d.rep[ip] ||= {}, { c: now(), r: +x.risk || 0, pt: String(x.type || '').slice(0, 20), pp: x.proxy === 'yes' }); }
          });
        }
      }
      // ③ IPPure 兜底：上面都没评出来的（ip-api 失败、proxycheck 额度用完），优先走直连 IPPure HTTP/2（0 节点请求），仅在未命中时按需补测
      const curAcct = typeof UI !== 'undefined' ? UI?.host?.account : null;
      const curCc = String(curAcct?.region || '').trim().toUpperCase();
      const regionRich = !force && curCc && Pool.avail?.(curCc, curAcct?.id)?.length >= 4;
      if (!regionRich) {
        const unk = []; const seenEg = new Set();
        for (const [k, e] of Pool.entries()) { if (e.gone || e.ok !== true || this.trusted(k)) continue; if (curCc && e.loc && e.loc !== curCc) continue; const eg = this.egOf(k, e); if (!eg || seenEg.has(eg)) continue; seenEg.add(eg); const p = rep()[eg]; if (!this.score(k, e).known && !(p?.pu && now() - (p.pu.at || 0) < 7 * 86400e3)) unk.push(k); }
        if (unk.length && Host.ippureDirect) {
          const batchK = unk.slice(0, 10);
          const puRows = await Promise.all(batchK.map(async k => {
            const eg = this.egOf(k, Pool.d?.ips?.[k]);
            if (!eg) return null;
            const dp = await Host.ippureDirect(eg).catch(() => null);
            return dp && Number.isFinite(+dp.fs) ? [eg, dp] : null;
          }));
          const validPu = puRows.filter(Boolean);
          if (validPu.length) await Pool.mutate(d => { for (const [eg, dp] of validPu) this.putPu(d, eg, dp); });
        } else if (unk.length && Pool.link?.() && Host.probe) {
          await Pool.probe(unk.slice(0, 6)).catch(() => {});
        }
      }
      // 清理：已经不在池子里、30 天没更新的出口记录；并限制未在用历史记录上限（800 条）
      await Pool.mutate(d => {
        const live = new Set(); for (const [k, e] of Object.entries(d.ips)) { const eg = this.egOf(k, e); if (eg) live.add(eg); }
        for (const m of [d.rep, d.rq]) if (m) {
          const stale = [];
          for (const [ip, x] of Object.entries(m)) {
            const ts = Math.max(x?.a || 0, x?.c || 0, x?.at || 0, x?.pu?.at || 0);
            if (!live.has(ip) && now() - ts > 30 * 86400e3) delete m[ip];
            else if (!live.has(ip)) stale.push([ip, ts]);
          }
          if (Object.keys(m).length > 800 && stale.length) {
            stale.sort((a, b) => a[1] - b[1]);
            const dropN = Math.min(stale.length, Object.keys(m).length - 800);
            for (let i = 0; i < dropN; i++) delete m[stale[i][0]];
          }
        }
      });
      await Pool.clearRisk().catch(() => {});   // 评估出的高风险：直接拉黑并删除
    } catch (e) { this.lastErr = cleanErr(e); }
    finally { this.running = false; this.at = now(); Bus.emit('pool'); }
    this.check();
  },
  // ---- 按需评估指定 ProxyIP 的出口（筛选 / 切换前用）：ip-api + proxycheck（每日额度内）+ 直连 IPPure；评估完自动拉黑并删除高风险 ----
  async rate(keys, extra = []) {
    const egs = [...new Set([...(keys || []).map(k => this.egOf(k)), ...extra].filter(Boolean))];
    if (!egs.length || !Host.fetchText) return { ok: false };
    const rep = () => Pool.d.rep || {};
    const a = egs.filter(ip => now() - (rep()[ip]?.a || 0) > 7 * 86400e3).slice(0, 100);
    if (a.length) {
      const r = await Host.fetchText('http://ip-api.com/batch?fields=status,query,isp,org,as,mobile,proxy,hosting', { method: 'POST', body: JSON.stringify(a), type: 'application/json', direct: true }).catch(e => ({ error: cleanErr(e) }));
      let arr = null; try { arr = r?.text ? JSON.parse(r.text) : null; } catch {}
      if (Array.isArray(arr)) await Pool.mutate(d => { d.rep ||= {}; for (const x of arr) if (x && x.status === 'success' && x.query) Object.assign(d.rep[x.query] ||= {}, { a: now(), h: !!x.hosting, px: !!x.proxy, m: !!x.mobile, isp: String(x.isp || x.org || '').slice(0, 40) }); });
    }
    const key = String(Pool.d.pckey || '').trim(), cap = key ? 900 : 90, day = new Date().toISOString().slice(0, 10);
    const left = cap - (Pool.d.pcq?.day === day ? Pool.d.pcq.n || 0 : 0);
    let quota = left > 0;
    const c = egs.filter(ip => now() - (rep()[ip]?.c || 0) > 14 * 86400e3).slice(0, Math.max(0, Math.min(25, left)));
    if (c.length) {
      const r = await Host.fetchText('https://proxycheck.io/v2/?vpn=1&risk=1' + (key ? '&key=' + encodeURIComponent(key) : ''), { method: 'POST', body: 'ips=' + c.join(','), type: 'application/x-www-form-urlencoded', direct: true }).catch(e => ({ error: cleanErr(e) }));
      let j = null; try { j = r?.text ? JSON.parse(r.text) : null; } catch {}
      if (j && (j.status === 'denied' || j.status === 'error')) { quota = false; await Pool.mutate(d => { d.pcq = { day, n: cap }; }); }
      else if (j && typeof j === 'object') await Pool.mutate(d => {
        d.rep ||= {}; d.pcq = d.pcq?.day === day ? d.pcq : { day, n: 0 }; d.pcq.n = (d.pcq.n || 0) + c.length;
        for (const ip of c) { const x = j[ip]; if (x && typeof x === 'object') Object.assign(d.rep[ip] ||= {}, { c: now(), r: +x.risk || 0, pt: String(x.type || '').slice(0, 20), pp: x.proxy === 'yes' }); }
      });
    }
    if (Host.ippureDirect) {
      const needPu = egs.filter(ip => !(rep()[ip]?.pu && now() - (rep()[ip].pu.at || 0) < 7 * 86400e3)).slice(0, 10);
      if (needPu.length) {
        const puRows = await Promise.all(needPu.map(async ip => {
          const dp = await Host.ippureDirect(ip).catch(() => null);
          return dp && Number.isFinite(+dp.fs) ? [ip, dp] : null;
        }));
        const validPu = puRows.filter(Boolean);
        if (validPu.length) await Pool.mutate(d => { for (const [ip, dp] of validPu) this.putPu(d, ip, dp); });
      }
    }
    if (!quota || egs.some(ip => rep()[ip]?.a && !rep()[ip]?.c && !rep()[ip]?.pu)) {
      await Pool.mutate(d => {
        d.rep ||= {};
        for (const ip of egs) {
          const p = d.rep[ip];
          if (p && p.a && !p.c && !p.pu) Object.assign(p, { c: now(), r: p.px ? 85 : (p.h ? 15 : 0), pt: p.px ? 'VPN' : (p.h ? 'Hosting' : 'ISP'), pp: !!p.px });
        }
      });
    }
    const x = await Pool.clearRisk().catch(() => ({ n: 0, skip: 0 }));
    return { ok: true, quota, removed: x.n || 0, banned: x.skip || 0 };
  },
  // ---- 筛选：一直找到这个地区「非高风险、没被其他账号占用」的 ProxyIP 为止；弹窗显示进度，可取消 ----
  screen(cc, { exceptId = '', title = '' } = {}) {
    if (this.screening) return this.screening;
    const pop = ScreenPop.open(cc, title);
    const run = (async () => {
      let dry = 0, removed = 0, checked = 0; const t0 = now();
      try {
        for (let round = 1; !pop.cancelled; round++) {
          await Pool.load(true).catch(() => {}); try { await Nodes.refreshAccts?.(); } catch {}
          let av = Pool.avail(cc, exceptId);
          const unk = Pool.entries().filter(([k, e]) => e.loc === cc && Pool.state(k, e, exceptId) === 'rate').map(([k]) => k).slice(0, 25);   // 只有评估过且纯净的才进 avail，所以从「待评估」里挑
          pop.log('第 ' + round + ' 轮：' + av.length + ' 个候选' + (unk.length ? '，评估其中 ' + unk.length + ' 个的纯净度…' : ''));
          if (unk.length) { const r = await this.rate(unk); checked += unk.length; removed += r.removed || 0; av = Pool.avail(cc, exceptId); }
          pop.stat('已评估 ' + checked + ' 个 · 高风险已拉黑删除 ' + removed + ' 个 · 用时 ' + Math.round((now() - t0) / 1000) + ' 秒');
          if (av.length) { pop.done('找到纯净 IP：' + av[0] + (av.length > 1 ? '（共 ' + av.length + ' 个）' : '')); return { ok: true, keys: av }; }
          if (pop.cancelled) break;
          pop.log(regionLabel(cc) + '：暂无纯净 IP，解析域名、检测新 IP…');
          const n = await Pool.fill(cc, { want: 5, log: t => pop.log(t) }).catch(() => 0);
          if (n) { dry = 0; continue; }
          dry++; if (dry === 2) { pop.log('重新解析全部相关域名…'); await Pool.heal(cc).catch(() => {}); }
          if (now() - t0 > 30 * 60e3) { pop.fail('已筛选 30 分钟仍没有纯净 IP，请在「代理设置」里添加新的 ProxyIP 来源'); return { ok: false, error: '这个地区没有纯净的 ProxyIP' }; }
          const w = Math.min(60, 10 * dry); pop.log('暂时没有新 IP，' + w + ' 秒后继续筛选…'); await pop.sleep(w * 1000);
        }
        pop.close(); return { ok: false, cancelled: true, error: '已取消筛选' };
      } catch (e) { pop.fail('筛选出错：' + cleanErr(e)); return { ok: false, error: cleanErr(e) }; }
      finally { this.screening = null; Bus.emit('pool'); }
    })();
    this.screening = run; return run;
  },
  // 统计（代理设置里显示）
  stats() {
    const c = { good: 0, mid: 0, bad: 0, none: 0 }, seen = new Set();
    for (const [k, e] of Pool.entries()) {
      if (e.gone || e.ok !== true) continue;
      const eg = this.egOf(k, e); if (!eg || seen.has(eg)) continue; seen.add(eg);
      const r = this.score(k, e); c[r.tier || 'none']++;
    }
    return { ...c, n: seen.size };
  },
};
// 后台：启动 1 分钟后评估一次，之后每 30 分钟看一眼（只查过期的，没有就什么都不做）；出口 IP 变了 / 一轮结束时顺便看当前 IP 要不要换
if (!globalThis.__BRANA_OFFLINE__) setTimeout(() => { IPRep.run().catch(() => {}); setInterval(() => { if (navigator.onLine !== false) IPRep.run().catch(() => {}); }, 30 * 60e3); }, 60e3);
Bus.on('ip', () => { if (now() - (IPRep.cAt || 0) > 60e3) { IPRep.cAt = now(); IPRep.check(); } });
Bus.on('turn', () => { setTimeout(() => IPRep.check(), 5000); });
