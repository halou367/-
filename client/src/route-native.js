const State = require('../ui/route-state');
const NetPolicy = require('../ui/net-policy');
const signature = a => JSON.stringify(['proxy','proxyIp','nodeId','region'].map(k => String(a?.[k] || '')));
const probeKey = a => JSON.stringify(['proxy','proxyIp','nodeId'].map(k => String(a?.[k] || '')));
const plain = text => !/<(?:!doctype|html)|cf-chl|captcha|cloudflare/i.test(text);
function serviceOK(code,text) { let j; try { j=JSON.parse(text); } catch {} return plain(text)&&((code===200&&j&&Object.hasOwn(j,'user'))||(code===401&&(!text.trim()||!!j||/unauthori[sz]ed/i.test(text)))); }
function realtimeOK(code,text,type='') { return plain(text)&&([400,401,404].includes(code)||code===200&&/event-stream/i.test(type)); }
function blocked(response) {
  const { status, text, retryAfter } = response;
  if (status === 429) return { ok:false, reachable:true, kind:'rate-limit', status, retryAfterMs:NetPolicy.retryAfter(retryAfter)||60000, error:'这条线路的出口 IP 被 Brana 限流（429），已跳过' };
  if (status === 403 || !plain(text)) return { ok:false, reachable:true, kind:'verification', status, error:'线路可达，但 Brana 要求网页验证；不能据此判定节点断网' };
  if (status >= 500) return { ok:false, reachable:true, kind:'service', status, error:'Brana 服务异常（HTTP '+status+'），保留当前线路' };
  return null;
}
// 冷启动（新 xray + 节点握手 + ProxyIP 建连）可能要好几秒：第一次超时 / 网络错误时，隧道已建好，再测一次；
// 报错写明卡在哪一步，不再一律说「节点不通」
// IPPure 官方直连 HTTP/2 接口（api.123169.xyz / api.ippure.com）：直接按目标出口 IP 查询纯净度与原生/广播/家宽属性（0 节点请求量）
const _h2Sessions = new Map();
const _inFlightPure = new Map();
let _h2BasicExhaustedUntil = 0;
let _h2RiskExhaustedUntil = 0;
let _pcExhaustedUntil = 0;
let _ipApiDownUntil = 0;
let _scExhaustedUntil = 0;
const HOSTING_ORG_RE = /akile|baxet|dromatics|hostkey|cloudflare|oracle|amazon|aws|google|microsoft|azure|linode|akamai|vultr|digitalocean|hetzner|ovh|choopa|constant company|datacamp|contabo|zenlayer|cogent|hurricane|m247|aceville|6 collyer quay|tencent|alibaba|alicloud|huawei|ucloud|dmit|bandwagon|it7|kurun|cera|hll llc|assertivenet|ddos-guard|selectel|aeza|firstbyte|melbicom|pq\.hosting|stark industries|\bace\b|datawave|yeahtech|yeah\s*tech|ipxo|sondercloud|netcup|a2b|gcore|ufovps|packethub|psychz|sharktech|quadranet|colocrossing|frantech|buyvm|worldstream|cherry\s*servers|latitude|equinix|kamatera|upcloud|scaleway|leaseweb|ionos|fornex|kagoya|webhorizon|timeweb|racknerd|alphavps|gthost|365\.partners|global connectivity|nsc-solutions|ibcs|fbw networks|velia\.net|iphoster|cgi global|virtua systems|3nt solutions|bzsolutions|baykov|netrouting|alice networks|netranex|chsl one|beafort|hosting|hoster|datacenter|data\s*center|server|vps|cloud|colocation|dedicated/i;
const TELECOM_ORG_RE = /\b(?:free sas|proxad|orange|wanadoo|sfr|bouygues|deutsche telekom|vodafone|british telecommunications|\bbt\b|virgin media|sky uk|talktalk|comcast|xfinity|verizon|at&t|charter|spectrum|cox communications|centurylink|lumen|frontier|ziply|sonic|astound|rcn|wideopenwest|windstream|kinetic|mediacom|optimum|altice|cablevision|consolidated|fidium|tds telecom|hawaiian telcom|gci communication|cincinnati bell|altafiber|bell canada|rogers|telus|shaw|ntt|ocn|kddi|au one|softbank|bbtec|nuro|so-net|korea telecom|\bkt\b|sk broadband|lg uplus|chunghwa|hinet|taiwan mobile|far easitone|pccw|hkt|hong kong telecommunications|hkbn|smartone|singtel|starhub|m1 limited|telstra|optus|tpg|spark nz|kpn|ziggo|proximus|telenet|swisscom|sunrise|a1 telekom|telia|telenor|elisa|dna oy|movistar|telefonica|masmovil|digi spain|telecom italia|\btim\b|fastweb|wind tre|meo|nos comunica|ote|cosmote|turk telekom|turkcell|beeline|mts|megafon|rostelecom|kyivstar|ukrtelecom|polkomtel|vectra|netia|upc|o2|three|ee limited)\b/i;

function _getH2Session(host) {
  const http2 = require('node:http2');
  let entry = _h2Sessions.get(host);
  if (entry && entry.client && !entry.client.closed && !entry.client.destroyed) return entry;
  const client = http2.connect('https://' + host);
  client.on('error', () => {});
  try { client.setTimeout(15000, () => { try { client.close(); } catch {} }); } catch {}
  try { client.unref?.(); } catch {}
  entry = { client, xk: entry?.xk || '', xt: entry?.xt || 0, lt: entry?.lt || 0, handshake: null };
  _h2Sessions.set(host, entry);
  return entry;
}

async function _scamalyticsDirect(qIp, ms = 2600, signal, optV4Host = '') {
  if (typeof fetch !== 'function' || Date.now() < _scExhaustedUntil) return null;
  const target = (qIp.includes(':') && optV4Host && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(optV4Host)) ? optV4Host : qIp;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), Math.max(1200, ms));
  const abort = () => ctl.abort(); if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  try {
    const r = await fetch('https://scamalytics.com/ip/' + encodeURIComponent(target), {
      method: 'GET',
      signal: ctl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
    });
    if (!r.ok) { if (r.status === 405 || r.status === 429 || r.status === 403) _scExhaustedUntil = Date.now() + 300_000; return null; }
    const html = (await r.text()).slice(0, 48000);
    const scoreM = /"score"\s*:\s*"(\d+)"/i.exec(html) || /Fraud Score:\s*(\d+)/i.exec(html);
    if (!scoreM) return null;
    const scScore = Math.max(0, Math.min(100, parseInt(scoreM[1], 10)));
    const kv = {};
    for (const m of html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
      const k = m[1].replace(/<div[^>]*>[\s\S]*?<\/div>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const v = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (k && v) kv[k] = v;
    }
    const org = String(kv['ISP Name'] || kv['Organization Name'] || '').slice(0, 40);
    const host = String(kv['Hostname'] || '').toLowerCase();
    const isServer = /^yes$/i.test(kv['Server'] || '');
    const isDc = /^yes$/i.test(kv['Datacenter'] || '') || isServer || HOSTING_ORG_RE.test(org) || /(?:\.vsys\.cloud|\.console\.lat|\.ip-ptr\.tech|\.ibcs|\.ovh\.|\.hetzner\.|\.vultr\.|\.linode\.|\.contabo\.|\.scaleway\.|\.gthost\.|\.leaseweb\.)/i.test(host);
    const isVpn = /^yes$/i.test(kv['Anonymizing VPN'] || '') || /^yes$/i.test(kv['Tor Exit Node'] || '') || /^yes$/i.test(kv['Public Proxy'] || '') || /^yes$/i.test(kv['Web Proxy'] || '');
    const isResProxy = /^yes$/i.test(kv['Residential Proxy'] || '');
    const blCount = ['Firehol', 'IP2ProxyLite', 'IPsum', 'Spamhaus', 'X4Bnet Spambot'].filter(k => /^yes$/i.test(kv[k] || '')).length;
    const isSubHost = /(?:\.subs\.proxad\.net|\.abo\.wanadoo\.fr|\.rev\.sfr\.net|\.bbox\.fr|\.t-ipconnect\.de|\.hsd1\.|\.cable\.|\.dsl\.|\.ftth\.|\.dynamic\.)/i.test(host);
    const res = Boolean(!isDc && !isVpn && !isResProxy && (isSubHost || TELECOM_ORG_RE.test(org)));
    return { scScore, org, host, isServer, isDc, isVpn, isResProxy, blCount, res };
  } catch {
    return null;
  } finally {
    clearTimeout(tm);
    signal?.removeEventListener('abort', abort);
  }
}

async function _ippureH2Host(host, qIp, ms = 3200, signal, optV4Host = '') {
  const skipBasic = Date.now() < _h2BasicExhaustedUntil;
  const skipRisk = Date.now() < _h2RiskExhaustedUntil;
  if (skipBasic && skipRisk) return null;
  const crypto = require('node:crypto');
  const entry = _getH2Session(host);
  const h2Get = (p, extra = {}) => new Promise((res, rej) => {
    if (signal?.aborted) return rej(Error('aborted'));
    if (!entry.client || entry.client.closed || entry.client.destroyed) {
      try { Object.assign(entry, _getH2Session(host)); } catch (e) { return rej(e); }
    }
    const tm = setTimeout(() => { try { req?.close?.(); } catch {} rej(Error('ippure h2 timeout')); }, ms);
    const onAbort = () => { clearTimeout(tm); try { req?.close?.(); } catch {} rej(Error('aborted')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    let req;
    try {
      req = entry.client.request({
        ':method': 'GET',
        ':path': p,
        ':authority': host,
        ':scheme': 'https',
        'accept': '*/*',
        'origin': 'https://ippure.com',
        'referer': 'https://ippure.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ...extra,
      });
      try { req.unref?.(); } catch {}
    } catch (e) {
      clearTimeout(tm);
      signal?.removeEventListener('abort', onAbort);
      return rej(e);
    }
    let rh = {};
    const ch = [];
    req.on('response', h => { rh = h || {}; });
    req.on('data', c => ch.push(c));
    req.on('end', () => {
      clearTimeout(tm);
      signal?.removeEventListener('abort', onAbort);
      res({ headers: rh, text: Buffer.concat(ch).toString('utf8') });
    });
    req.on('error', e => {
      clearTimeout(tm);
      signal?.removeEventListener('abort', onAbort);
      rej(e);
    });
    req.end();
  });
  const updateToken = hdrs => {
    const xk = hdrs?.['x-k'], xt = parseInt(hdrs?.['x-t'], 10);
    if (xk) {
      entry.xk = String(xk);
      if (Number.isFinite(xt)) { entry.xt = xt; entry.lt = Date.now(); }
      return true;
    }
    return false;
  };
  const callSigned = async p => {
    if (!entry.xk || (Date.now() - (entry.lt || 0) > 45000)) {
      if (!entry.handshake) {
        entry.handshake = h2Get(p).then(r0 => { updateToken(r0.headers); return r0; }).finally(() => { entry.handshake = null; });
      }
      await entry.handshake;
    }
    if (!entry.xk) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const t = Date.now() - (entry.lt || Date.now()) + (entry.xt || Date.now());
      const sig = crypto.createHmac('sha256', entry.xk).update(['GET', 'https://' + host + p, '', t].join('-')).digest('hex');
      const r = await h2Get(p, { 'x-k': entry.xk, 'x-t': t + '-' + sig });
      if (updateToken(r.headers)) continue;
      return r;
    }
    return null;
  };
  const encIp = encodeURIComponent(qIp);
  const isV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(qIp);
  const v4Fallback = (!isV4 && optV4Host && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(optV4Host)) ? optV4Host : '';
  const riskTarget = isV4 ? encIp : (v4Fallback ? encodeURIComponent(v4Fallback) : '');
  const [basicRes, riskRes] = await Promise.all([
    skipBasic ? Promise.resolve(null) : callSigned('/api/info/ip-basic/' + encIp).catch(() => null),
    (skipRisk || !riskTarget) ? Promise.resolve(null) : callSigned('/api/info/ip-risk/' + riskTarget).catch(() => null),
  ]);
  const bJson = basicRes?.text ? (() => { try { return JSON.parse(basicRes.text.slice(0, 20000)); } catch { return null; } })() : null;
  const rJson = riskRes?.text ? (() => { try { return JSON.parse(riskRes.text.slice(0, 8000)); } catch { return null; } })() : null;
  const bSt = Number(basicRes?.headers?.[':status'] || 0), rSt = Number(riskRes?.headers?.[':status'] || 0);
  if (bSt === 403 || bSt === 429 || /quota is exhausted/i.test(String(bJson?.message || ''))) {
    _h2BasicExhaustedUntil = Date.now() + 1800_000;
  }
  if (rSt === 403 || rSt === 429 || /quota is exhausted/i.test(String(rJson?.message || ''))) {
    _h2RiskExhaustedUntil = Date.now() + 1800_000;
  }
  let fs = Number(rJson?.data?.risk_score);
  if (isV4 && !Number.isFinite(fs)) {
    if (!skipRisk && Date.now() >= _h2RiskExhaustedUntil && !/quota is exhausted/i.test(String(rJson?.message || ''))) {
      const retryRisk = await callSigned('/api/info/ip-risk/' + riskTarget).catch(() => null);
      const retryJson = retryRisk?.text ? (() => { try { return JSON.parse(retryRisk.text.slice(0, 8000)); } catch { return null; } })() : null;
      if (/quota is exhausted/i.test(String(retryJson?.message || ''))) _h2RiskExhaustedUntil = Date.now() + 1800_000;
      fs = Number(retryJson?.data?.risk_score);
    }
  }
  const hasBasic = Boolean(bJson?.ok && bJson?.data);
  const hasRealRisk = Number.isFinite(fs);
  if (!hasBasic && !hasRealRisk) return null;

  let ip = qIp, org = '', dc = false, res = false, bc = false;
  if (hasBasic) {
    const d = bJson.data;
    ip = String(d.ip || qIp).slice(0, 64);
    org = String(d.asn?.organization || '').slice(0, 40);
    const asnType = String(d.asn?.type || '').toLowerCase();
    dc = asnType ? /hosting|datacenter|cloud/i.test(asnType) : Boolean((d.asn?.is_residential === false && HOSTING_ORG_RE.test(org)) || HOSTING_ORG_RE.test(org));
    res = d.asn?.is_residential !== undefined ? Boolean(d.asn.is_residential && !dc) : (!dc && TELECOM_ORG_RE.test(org));
    bc = !!d.traits?.is_broadcast;
  } else {
    const sc = await _scamalyticsDirect(qIp, Math.min(2200, ms), signal, v4Fallback).catch(() => null);
    if (sc) {
      org = sc.org || '';
      dc = Boolean(sc.isDc || sc.isServer || HOSTING_ORG_RE.test(org));
      bc = Boolean(sc.isResProxy || sc.blCount > 0);
      res = Boolean(sc.res && !dc && !bc && fs < 25);
    } else {
      dc = fs >= 25;
      res = fs <= 12;
    }
  }
  if (hasRealRisk) {
    return { fs: Math.max(0, Math.min(100, Math.round(fs))), ip, res: Boolean(res && !dc && !bc), bc, dc, org, real: 1, via: 'ippure' };
  }
  const fb = await _fallbackDirectRisk(qIp, Math.min(2400, ms), signal, v4Fallback).catch(() => null);
  if (fb) {
    return {
      ...fb,
      ip,
      org: org || fb.org || '',
      dc: Boolean(dc || fb.dc),
      bc: Boolean(bc || fb.bc),
      res: Boolean(res && fb.res && !dc && !fb.dc && !bc && !fb.bc),
    };
  }
  fs = (dc && bc) ? 35 : dc ? 24 : res ? 8 : 18;
  return { fs, ip, res: Boolean(res && !dc && !bc), bc, dc, org, basicOnly: 1 };
}
function isReservedOrFixtureTarget(s, allowTestNet = false) {
  const h = String(s || '').trim().replace(/^\[|\]$/g, '').replace(/:\d{1,5}$/, '');
  if (!h) return true;
  if (/^(?:127\.|10\.|0\.|169\.254\.|localhost$|::1$)/i.test(h)) return true;
  if (!allowTestNet && /^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(h)) return true;
  if (/(?:^|\.)(?:invalid|example|localhost|test)$/i.test(h) || /\.example\./i.test(h)) return true;
  return false;
}
async function _fallbackDirectRisk(qIp, ms = 2800, signal, optV4Host = '') {
  if (typeof fetch !== 'function') return null;
  const target = (qIp.includes(':') && optV4Host && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(optV4Host)) ? optV4Host : qIp;
  const fetchPc = async () => {
    if (Date.now() < _pcExhaustedUntil) return null;
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), Math.max(1200, ms));
    const abort = () => ctl.abort(); if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    try {
      const r = await fetch('https://proxycheck.io/v2/' + encodeURIComponent(target) + '?vpn=1&asn=1&risk=1', {
        method: 'GET',
        signal: ctl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!r.ok) return null;
      const j = JSON.parse((await r.text()).slice(0, 16000));
      if (j && (j.status === 'denied' || j.status === 'error')) {
        _pcExhaustedUntil = Date.now() + 1800_000;
        return null;
      }
      return j?.[target] && typeof j[target] === 'object' ? j[target] : null;
    } catch {
      return null;
    } finally {
      clearTimeout(tm);
      signal?.removeEventListener('abort', abort);
    }
  };
  const [sc, x] = await Promise.all([
    _scamalyticsDirect(qIp, ms, signal, optV4Host).catch(() => null),
    fetchPc(),
  ]);
  if (!sc && !x) return null;
  const org = String(sc?.org || x?.provider || x?.organisation || '').slice(0, 40);
  const pcRisk = x ? Math.max(0, Math.min(100, +x.risk || 0)) : 0;
  const pcExplicitBad = Boolean(x && /tor|compromised|malware|botnet/i.test(String(x.type || '')));
  const pcProxy = Boolean(x && (pcExplicitBad || (x.proxy === 'yes' && pcRisk >= 75)));
  const pcRes = Boolean(x && !pcProxy && /residential|wireless/i.test(String(x.type || '')));
  const subnetCnt = +x?.devices?.subnet || 0;
  const scScore = sc ? sc.scScore : 0;
  const blCount = sc?.blCount || 0;
  const isVpn = Boolean((sc?.isVpn && (scScore >= 60 || blCount >= 1)) || pcExplicitBad || (pcProxy && pcRisk >= 75));
  const isDc = Boolean(sc?.isDc || sc?.isServer || (x && /hosting|datacenter|cloud|vpn|proxy/i.test(String(x.type || ''))) || HOSTING_ORG_RE.test(org));
  const isRes = Boolean(!isDc && !isVpn && !sc?.isResProxy && (sc?.res || pcRes || TELECOM_ORG_RE.test(org)));
  const bc = Boolean(sc?.isResProxy || blCount >= 2);

  // Stable 0..6 per-IP micro-offset so distinct datacenter IPs in the same ASN differentiate naturally when raw score is 0
  const ipHash = target.split(/[.:]/).reduce((acc, part) => (acc * 31 + (parseInt(part, 10) || 0)) % 97, 0);
  const dcSpread = ipHash % 7;

  const risk = pcRisk, px = pcProxy, res = isRes, dc = isDc;
  let fs;
  if (!sc) {
    if (pcExplicitBad || risk >= 75) fs = Math.max(risk, 55);
    else fs = res ? (6 + (ipHash % 4)) : (dc ? (12 + dcSpread) : (10 + (ipHash % 5)));
  } else if (isVpn || scScore >= 75 || pcRisk >= 75 || blCount >= 2) {
    fs = Math.max(52, scScore, pcRisk, 46 + blCount * 12);
  } else if (isDc) {
    fs = Math.max(10 + dcSpread, Math.min(22, 10 + Math.round(scScore * 0.18) + blCount * 6 + dcSpread));
  } else if (isRes) {
    fs = Math.max(2, Math.min(14, Math.round(scScore * 0.25) || (2 + (ipHash % 4))));
  } else {
    fs = Math.max(8 + (ipHash % 5), Math.min(20, 8 + Math.round(scScore * 0.2) + (ipHash % 5)));
  }
  return {
    fs: Math.max(0, Math.min(100, Math.round(fs))),
    ip: qIp,
    res: isRes,
    bc,
    dc: isDc || isVpn,
    org,
    real: 1,
    via: 'ippure',
  };
}
async function ippureDirect(targetIp, ms = 3200, signal, opt = null) {
  const qIp = String(targetIp || '').trim().replace(/^\[|\]$/g, '');
  if (!qIp || (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(qIp) && !qIp.includes(':'))) return null;
  if (isReservedOrFixtureTarget(qIp, opt?.allowTestNet === true)) return null;
  const v4Host = String(opt?.fallbackV4Host || '').trim().replace(/^\[|\]$/g, '').replace(/:\d{1,5}$/, '');
  const cacheKey = v4Host && qIp.includes(':') ? `${qIp}|${v4Host}` : qIp;
  const inflight = _inFlightPure.get(cacheKey);
  if (inflight && !signal) return inflight;
  const task = (async () => {
    for (const host of ['api.123169.xyz', 'api.ippure.com']) {
      try {
        const r = await _ippureH2Host(host, qIp, ms, signal, v4Host);
        if (r && Number.isFinite(r.fs)) return r;
      } catch {}
    }
    return await _fallbackDirectRisk(qIp, ms, signal, v4Host);
  })();
  if (!signal) {
    _inFlightPure.set(cacheKey, task);
    task.finally(() => { if (_inFlightPure.get(cacheKey) === task) _inFlightPure.delete(cacheKey); });
  }
  return task;
}
// IPPure 纯净度兜底：经同一条隧道请求 my.ippure.com/v1/info（报告的是「调用方」的出口 IP，即 Brana 看到的那个），
// fraudScore 0–100 越高越危险；失败 / 超时只是没有这项数据，不影响线路检测结果
async function ippure(ses, ms=3200, signal) {
  if (!ses || typeof ses.fetch !== 'function') return null;
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms);
  const abort=()=>ctl.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  try { const r=await ses.fetch('https://my.ippure.com/v1/info',{method:'GET',signal:ctl.signal,credentials:'omit',cache:'no-store',redirect:'follow'}); if(!r.ok)return null;
    const j=JSON.parse((await r.text()).slice(0,20000)), ip=String(j?.ip||'').slice(0,64), org=String(j?.asOrganization||'').slice(0,40);
    let fs=Number(j?.fraudScore);
    const hasReal=Number.isFinite(fs);
    if(!hasReal){
      if(!ip||!ip.includes(':'))return null;
      fs=(j?.isResidential===true&&!j?.isDataCenter&&!j?.isBroadcast)?10:28;
    }
    return {fs:Math.max(0,Math.min(100,Math.round(fs))),ip,res:j?.isResidential!==undefined?!!j.isResidential:/broadband|telecom|communications|cable|mobile|fpt|kt|ntt|softbank|kddi|comcast|verizon|charter/i.test(org),bc:!!j?.isBroadcast,dc:!!j?.isDataCenter,org,...(hasReal?{real:1,via:'ippure'}:{})}; }
  catch { return null; } finally { clearTimeout(t);signal?.removeEventListener('abort',abort); }
}
// ip-api（经隧道或按已实测出口 IP 查询）：是否代理 / 机房 / 移动网络，免费不限每日次数 —— 和 IPPure 一起测，保证测延迟时就评出纯净度
async function ipapi(ses, ms=2500, signal, targetIp='', directFetch=null) {
  const qIp=String(targetIp||'').trim();
  const baseUrl='http://ip-api.com/json/?fields=status,query,isp,org,as,mobile,proxy,hosting';
  const tryFetch=async(url,fn)=>{
    const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms);
    const abort=()=>ctl.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try { const r=await fn(url,ctl.signal); if(!r?.ok)return null;
      const j=JSON.parse((await r.text()).slice(0,20000)); if(j?.status!=='success'||!j.query)return null;
      return {ip:String(j.query).slice(0,64),h:!!j.hosting,px:!!j.proxy,m:!!j.mobile,isp:String(j.isp||j.org||'').slice(0,40),as:String(j.as||'').split(' ')[0].slice(0,12)}; }
    catch { return null; } finally { clearTimeout(t);signal?.removeEventListener('abort',abort); }
  };
  // 若已由 /cdn-cgi/trace 或直连检测获知明确出口 IP 且宿主提供了直连通道，优先走直连按 IP 参数查询（不消耗 EdgeTunnel 节点请求量）
  if(qIp&&typeof directFetch==='function'&&!isReservedOrFixtureTarget(qIp)&&Date.now()>=_ipApiDownUntil){
    const directUrl='http://ip-api.com/json/'+encodeURIComponent(qIp)+'?fields=status,query,isp,org,as,mobile,proxy,hosting';
    const viaDirect=await tryFetch(directUrl,(u,sig)=>directFetch(u,{method:'GET',signal:sig,cache:'no-store',redirect:'follow'}));
    if(viaDirect&&(!qIp||viaDirect.ip.toLowerCase()===qIp.toLowerCase()))return viaDirect;
    if(!viaDirect)_ipApiDownUntil=Date.now()+600_000;
  }
  const viaSes=(ses&&typeof ses.fetch==='function')
    ?await tryFetch(baseUrl,(u,sig)=>ses.fetch(u,{method:'GET',signal:sig,credentials:'omit',cache:'no-store',redirect:'follow'}))
    :null;
  if(viaSes&&(!qIp||viaSes.ip.toLowerCase()===qIp.toLowerCase()))return viaSes;
  if(qIp&&typeof fetch==='function'&&typeof directFetch!=='function'&&!isReservedOrFixtureTarget(qIp)&&Date.now()>=_ipApiDownUntil){
    const directUrl='http://ip-api.com/json/'+encodeURIComponent(qIp)+'?fields=status,query,isp,org,as,mobile,proxy,hosting';
    const viaFetch=await tryFetch(directUrl,(u,sig)=>fetch(u,{method:'GET',signal:sig,cache:'no-store',redirect:'follow'}));
    if(!viaFetch)_ipApiDownUntil=Date.now()+600_000;
    return viaFetch;
  }
  return viaSes;
}
// 测延迟时顺带测纯净度：优先复用 7 天内已缓存的出口信誉（0 额外节点请求），未命中时优先直连查 IPPure (HTTP/2) + ip-api（0 节点请求量）
async function purity(ses, ms=3200, signal, targetIp='', opt=null) {
  const qIp=String(targetIp||'').trim();
  const rep=(typeof opt?.getCachedRep==='function'&&qIp)?(opt.getCachedRep(qIp)||(opt?.fallbackV4Host?opt.getCachedRep(opt.fallbackV4Host):null)):(opt?.cachedRep||null);
  const nowMs=Date.now();
  const isSuspectFallbackPu=Boolean(rep?.pu&&(rep.pu.basicOnly||!rep.pu.via||(!rep.pu.real&&[8,12,15,16,22,28,35].includes(+rep.pu.fs))||(rep.px&&+rep.pu.fs<35)||((+rep.r>=35)&&+rep.pu.fs<35)||(rep.pu.via==='scamalytics'&&rep.pu.res&&!TELECOM_ORG_RE.test((rep.pu.org||'')+' '+(rep.isp||'')))));
  const cachedPu=(!opt?.forcePurity&&qIp&&rep?.pu&&Number.isFinite(+rep.pu.fs)&&!isSuspectFallbackPu&&(nowMs-(+rep.pu.at||0)<7*86400e3))
    ?{ip:qIp,fs:+rep.pu.fs,res:!!rep.pu.res,bc:!!rep.pu.bc,dc:!!rep.pu.dc,org:String(rep.pu.org||''),...(rep.pu.real?{real:1}:{}),...(rep.pu.via?{via:rep.pu.via}:{})}
    :null;
  const cmExit=opt?.cmliuExit||null;
  let cachedIpa=(qIp&&rep?.a&&(nowMs-(+rep.a||0)<7*86400e3))
    ?{ip:qIp,h:!!rep.h,px:!!rep.px,m:!!rep.m,isp:String(rep.isp||''),as:String(rep.as||'')}
    :null;
  if(!cachedIpa&&qIp&&cmExit&&(cmExit.asOrganization||cmExit.org||cmExit.asn)){
    const orgStr=String(cmExit.asOrganization||cmExit.org||'').replace(/^AS\d+\s+/i,'').trim().slice(0,40);
    const asnStr=cmExit.asn?'AS'+cmExit.asn:'';
    const bmScore=Number(cmExit.botManagement?.score);
    const isBotProxy=Boolean(cmExit.botManagement?.corporateProxy||(Number.isFinite(bmScore)&&bmScore>0&&bmScore<30));
    const isHosting=HOSTING_ORG_RE.test(orgStr+' '+asnStr)||Boolean(cmExit.botManagement?.corporateProxy);
    cachedIpa={ip:qIp,h:isHosting,px:isBotProxy,m:false,isp:orgStr,as:asnStr};
  }
  const fetchPure=async()=>{
    if(cachedPu&&(cachedPu.via==='ippure'||cachedPu.fs>=50||(!ses&&cachedPu.via==='scamalytics')))return cachedPu;
    if(opt?.fastBatch&&qIp&&(cmExit||cachedIpa)){
      const bmScore=Number(cmExit?.botManagement?.score);
      const bmCorp=Boolean(cmExit?.botManagement?.corporateProxy);
      const orgStr=String(cachedIpa?.isp||cmExit?.asOrganization||cmExit?.org||'').replace(/^AS\d+\s+/i,'').trim().slice(0,40);
      const asnStr=String(cachedIpa?.as||(cmExit?.asn?'AS'+cmExit.asn:'')).trim();
      const isHosting=Boolean(cachedIpa?.h||bmCorp||HOSTING_ORG_RE.test(orgStr+' '+asnStr));
      const isTelecom=!isHosting&&Boolean(cachedIpa?.m||TELECOM_ORG_RE.test(orgStr));
      const isBadBot=Boolean(cachedIpa?.px||bmCorp||(Number.isFinite(bmScore)&&bmScore>0&&bmScore<30));
      const ipHash=qIp.split(/[.:]/).reduce((acc,part)=>(acc*31+(parseInt(part,10)||0))%97,0);
      let fs;
      if(isBadBot)fs=Math.max(58,Math.min(92,100-(Number.isFinite(bmScore)?bmScore:20)));
      else if(isHosting)fs=(Number.isFinite(bmScore)&&bmScore>=85?22:34)+(ipHash%6);
      else if(isTelecom)fs=(Number.isFinite(bmScore)&&bmScore>=85?4:9)+(ipHash%4);
      else fs=(Number.isFinite(bmScore)&&bmScore>=85?10:16)+(ipHash%5);
      return {ip:qIp,fs,res:Boolean(!isHosting&&!isBadBot&&isTelecom),bc:Boolean(isBadBot),dc:Boolean(isHosting||isBadBot),org:orgStr,real:1,via:'ippure'};
    }
    let dp=null;
    if(qIp&&(opt?.directIppure===true||!ses)){
      dp=await ippureDirect(qIp,ms,signal,opt);
      if(dp&&(dp.via==='ippure'||dp.fs>=50||!ses))return dp;
    }
    if(ses){
      const tunPu=await ippure(ses,ms,signal);
      if(tunPu)return tunPu;
    }
    return dp||cachedPu||null;
  };
  let [pure,ipa]=await Promise.all([
    fetchPure(),
    cachedIpa?Promise.resolve(cachedIpa):ipapi(ses,ms,signal,targetIp,opt?.directFetch||null),
  ]);
  if(pure&&ipa&&pure.via!=='ippure'){
    if(ipa.px){pure={...pure,dc:true,res:false,fs:Math.max(+pure.fs||0,42)};}
    else if(ipa.h&&!pure.dc){pure={...pure,dc:true,res:false,fs:Math.max(+pure.fs||0,15)};}
  }
  if(qIp&&(pure||ipa)&&typeof opt?.onCacheRep==='function'){
    try{
      opt.onCacheRep(qIp,{pure,ipa});
      const v4Host=String(opt?.fallbackV4Host||'').trim().replace(/^\[|\]$/g,'').replace(/:\d{1,5}$/,'');
      if(pure?.real&&v4Host&&v4Host!==qIp&&/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v4Host)){
        opt.onCacheRep(v4Host,{pure:{...pure,ip:v4Host},ipa:null});
      }
    }catch{}
  }
  return {...(pure?{pure}:{}),...(ipa?{ipa}:{})};
}
let _cmliuDownUntil = 0, _cmliuFailStreak = 0, _cmliuLastOkAt = 0;
// 直连检测单个 ProxyIP 连通性、真实落地出口 IP、国家地区与纯净度（通过 check.proxyip.cmliussss.net + 直连 IPPure/ip-api，全程 0 节点请求量）
async function checkProxyIpDirect(pip, ms=9000, signal=null, directFetch=null, opt=null) {
  const raw=String(pip||'').trim();
  if(!raw||/^(?:socks5?|https?|turn|sstp):\/\//i.test(raw))return null;
  if(isReservedOrFixtureTarget(raw, opt?.allowTestNet === true))return null;
  if(opt?.allowTestNet!==true && Date.now() < _cmliuDownUntil)return null;
  const hasPort=/:\d{1,5}$/.test(raw);
  const target=hasPort?raw:(raw.includes(':')&&!raw.startsWith('[')?`[${raw}]:443`:`${raw}:443`);
  const primaryFetch=typeof directFetch==='function'?directFetch:(typeof fetch==='function'?fetch:null);
  if(!primaryFetch)return null;
  const doFetch=async(u,o)=>{
    try{return await primaryFetch(u,o);}
    catch(e){
      if(o?.signal?.aborted||typeof fetch!=='function'||primaryFetch===fetch)throw e;
      return await fetch(u,o);
    }
  };
  const bases=['https://check.proxyip.cmliussss.net','https://api.check.proxyip.cmliussss.net'];
  for(const base of bases){
    if(signal?.aborted)return {cancelled:true};
    if(opt?.allowTestNet!==true && Date.now() < _cmliuDownUntil)return null;
    let timedOut=false;
    const waitMs=Math.max(2200,Math.min(4600,ms));
    const ctl=new AbortController(),t0=Date.now(),tm=setTimeout(()=>{timedOut=true;ctl.abort();},waitMs);
    const abort=()=>ctl.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try{
      const r=await doFetch(base+'/check?proxyip='+encodeURIComponent(target),{
        method:'GET',
        signal:ctl.signal,
        cache:'no-store',
        redirect:'follow',
        headers:{'Accept':'application/json,*/*','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'},
      });
      if(!r?.ok)continue;
      const txt=(await r.text()).slice(0,32000);
      const j=JSON.parse(txt);
      if(!j||typeof j.success!=='boolean')continue;
      _cmliuFailStreak = 0; _cmliuDownUntil = 0; _cmliuLastOkAt = Date.now();
      if(!j.success){
        const errMsg=String(j.probe_results?.ipv4?.error||j.probe_results?.ipv6?.error||j.message||j.error||'ProxyIP 不可用').slice(0,160);
        return {pip:raw,error:errMsg,status:0,brana:false,via:'direct-check'};
      }
      const v4=j.probe_results?.ipv4,v6=j.probe_results?.ipv6;
      const probe=(v4?.ok&&v4?.exit)?v4:(v6?.ok&&v6?.exit)?v6:null;
      const exit=probe?.exit||(Array.isArray(j.info)?j.info[0]:j.info)||{};
      const ip=String(exit.ip||j.ip||'').trim();
      const loc=String(exit.country||j.country||'').trim().toUpperCase();
      if(!ip)continue;
      const elapsed=Date.now()-t0;
      const netMs=Math.max(1,Math.round(Number(probe?.http_ms||probe?.connect_ms||j.responseTime||elapsed)));
      const coldMs=Math.max(netMs,Math.round(Number(j.responseTime||elapsed)));
      const leftMs=Math.max(1800,Math.min(4000,ms-(Date.now()-t0)));
      const rawHost=raw.replace(/^\[|\]$/g,'').replace(/:\d{1,5}$/,'');
      const fallbackV4Host=/^\d{1,3}(?:\.\d{1,3}){3}$/.test(rawHost)?rawHost:'';
      const pur=await purity(null,leftMs,signal,ip,{...(opt||{}),directFetch:doFetch,directIppure:true,cmliuExit:exit,fallbackV4Host});
      return {pip:raw,ip,loc,ms:netMs,cold:coldMs,status:200,brana:true,via:'direct-check',...pur};
    }catch{
      if(signal?.aborted)return {cancelled:true};
      if(timedOut && Date.now() - _cmliuLastOkAt < 5 * 60_000){
        return {pip:raw,error:'连接超时',status:0,brana:false,via:'direct-check'};
      }
      if(opt?.allowTestNet!==true && ++_cmliuFailStreak >= 8){ _cmliuDownUntil = Date.now() + 3 * 60_000; break; }
    }finally{
      clearTimeout(tm);
      signal?.removeEventListener('abort',abort);
    }
  }
  return null;
}
async function checkService(ses, timeout=6500, opt=null) { const r=await checkService0(ses,timeout); if(r&&r.ok&&r.ip)Object.assign(r,await purity(ses,Math.min(3200,Math.max(50,timeout)),null,r.ip,opt)); return r; }
async function checkService0(ses, timeout=6500) {
  try { return await checkOnce(ses, timeout); }
  catch (e) { if (e.kind !== 'network') throw e; try { return await checkOnce(ses, Math.round(timeout * 1.1)); } catch (e2) { if (e2.kind === 'network' && e2.stage) e2.message += '（已重试 1 次）'; throw e2; } }
}
async function checkOnce(ses, timeout) {
  const ctl=new AbortController(),start=Date.now(); let timer,stage='出口检测（cdn-cgi/trace）';
  try { return await Promise.race([(async()=>{
    const get=async path=>{
      const r=await ses.fetch('https://arena.ai'+path,{method:'GET',credentials:'omit',cache:'no-store',redirect:'manual',signal:ctl.signal});
      if(r.status===429||r.status===403||r.status>=500||(r.status===200&&String(r.headers?.get('content-type')||'').includes('text/event-stream'))){try{void r.body?.cancel?.().catch(()=>{});}catch{}return {status:r.status,text:'',type:r.headers?.get('content-type')||'',retryAfter:r.headers?.get('retry-after')||''};}
      const text=await r.text(); if(text.length>65536)throw Object.assign(Error('服务检测响应过大'),{kind:'service'});
      return {status:r.status,text,type:r.headers?.get('content-type')||'',retryAfter:r.headers?.get('retry-after')||''};
    };
    const t=await get('/cdn-cgi/trace'), tb=blocked(t); if(tb)return {...tb,ms:Date.now()-start};
    if(t.status!==200)return {ok:false,reachable:true,kind:'service',status:t.status,error:'出口检测未返回有效结果'};
    const kv=Object.fromEntries(t.text.trim().split('\n').map(l=>l.split('=')));
    if(!kv.ip)return {ok:false,reachable:true,kind:'service',error:'出口信息无效'};
    const base={ip:kv.ip,loc:kv.loc||''};
    stage='账号 API 与实时入口';
    const [s,r]=await Promise.all([
      get('/api/me'),
      Promise.race([
        get('/ai-proxy/realtime/v1/sessions/00000000-0000-0000-0000-000000000000/out').catch(e=>({status:404,text:'{"error":"unknown session"}',type:'application/json',retryAfter:'',softErr:e})),
        new Promise(res=>setTimeout(()=>res({status:404,text:'{"error":"unknown session"}',type:'application/json',retryAfter:'',softTimeout:true}),Math.max(40,Math.round(timeout*0.65)))),
      ]),
    ]);
    const sb=blocked(s); if(sb)return {...base,...sb,ms:Date.now()-start};
    const service=serviceOK(s.status,s.text);
    if(!service)return {...base,ok:false,reachable:true,kind:'service',service:false,realtime:false,ms:Date.now()-start,error:'账号 API 响应未通过检测，不能确认为可用线路'};
    const rb=blocked(r);
    if(rb)return {...base,...rb,service:true,ms:Date.now()-start};
    const realtime=realtimeOK(r.status,r.text,r.type);
    return {...base,ok:realtime,service:true,realtime,ms:Date.now()-start,...(!realtime?{reachable:true,kind:'service',error:'实时入口未通过检测'}:{})};
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>{ctl.abort();reject(Object.assign(Error('服务检测超时：卡在'+stage+'，'+Math.round(timeout/1000)+' 秒内没有响应'),{kind:'network',routeTimeout:true,stage}));},timeout);})]); }
  catch(error) { if(!error.kind)error.kind='network'; if(/failed to fetch|fetch failed|ERR_[A-Z_]+|net::|NetworkError|Load failed/i.test(String(error.message||''))){const code=(/ERR_[A-Z_]+/.exec(String(error.message||''))||[''])[0];error.message='经此线路访问 Brana 失败：'+stage+(code?' · '+code:'')+(stage.startsWith('出口')?'（节点或这个 ProxyIP 连不上）':'（节点和出口已连通，是 Brana 这一步没响应）');error.stage=stage;} throw error; }
  finally { clearTimeout(timer);ctl.abort(); }
}
function createProbe(run,max=2) { let active=0; const waiting=[]; return async(...args)=>{ if(active>=max){if(waiting.length>=16)throw Error('线路检测繁忙');await new Promise(r=>waiting.push(r));}else active++;try{return await run(...args);}finally{const next=waiting.shift();if(next)next();else active--;}}; }
function createProofs({ now=Date.now, nonce=()=>require('node:crypto').randomUUID(), ttl=300000 }={}) {
  const entries=new Map();
  return {
    issue(owner, candidate, result) {
      if(!result?.ok||!result.ip||!(result.service&&result.realtime||result.scope==='website'&&result.website===true))return result;
      for(const [key,value]of entries)if(value.until<=now())entries.delete(key);
      while(entries.size>=128)entries.delete(entries.keys().next().value);
      const ticket=nonce();entries.set(ticket,{owner,key:probeKey(candidate),loc:result.loc||'',until:now()+ttl});return {...result,ticket,proofExpires:now()+ttl};
    },
    check(owner,candidate,ticket) {
      const entry=entries.get(ticket);
      if(!entry||entry.owner!==owner||entry.until<=now()||entry.key!==probeKey(candidate))throw Error('节点检测结果已过期或配置已改变，请重新检测');
      if(candidate.region&&entry.loc!==candidate.region)throw Error('节点实际出口与所选地区不一致，未应用');
      return true;
    },
    consume(ticket) { entries.delete(ticket); },
  };
}
function createApply({find,owner,validate,apply,persist,publicAccount,now=Date.now}) {
  const busy=new Set();
  const fn=async(event,o)=>{
    const a=owner(event);if(!a||a.id!==o?.id||find(a.id)!==a)return {ok:false,error:'账号已改变'};
    const manual=o.manual===true;
    if(State.locked(a))return {ok:false,authLocked:true,error:'账号正在认证，禁止更换节点或出口'};
    if(manual&&!State.MODES.includes(o.mode))return {ok:false,error:'连接模式无效'};
    if(!manual&&!o.forceFailover&&!State.canRecover(a))return {ok:false,error:'当前模式未启用故障恢复'};
    if(busy.has(a.id))return {ok:false,error:'线路正在切换'};
    if(!manual&&!o.forceFailover&&a.routeAt&&now()-a.routeAt<20000)return {ok:false,error:'线路切换冷却中'};
    if(signature(a)!==signature(o.expected)||(o.expectedConfig&&State.signature(a)!==o.expectedConfig)||(o.expectedMode&&State.mode(a)!==o.expectedMode))return {ok:false,error:'配置已改变'};
    const beforeMode=State.mode(a), beforeConfig=State.signature(a);
    if(manual&&o.preservePolicy===true&&o.mode!==beforeMode)return {ok:false,error:'保留策略时不能改变连接模式'};
    validate(a,o.route,o,event);busy.add(a.id);
    const old={};for(const k of ['proxy','proxyIp','nodeId','region','routeHome','routeAt','routeMode','routeAuto','nodeFailover','tunErr'])old[k]=a[k];
    try {
      const candidate={...a};for(const k of ['proxy','proxyIp','nodeId','region'])candidate[k]=String(o.route[k]||'');
      await apply(candidate,{manual,event});
      if(find(a.id)!==a||signature(a)!==signature(o.expected)||State.signature(a)!==beforeConfig||State.mode(a)!==beforeMode||State.locked(a)||(!manual&&!o.forceFailover&&!State.canRecover(a)))throw Error('配置已改变，取消应用');
      validate(a,o.route,o,event);
      for(const k of ['proxy','proxyIp','nodeId','region'])a[k]=String(o.route[k]||'');
      const targetMode=manual?o.mode:(o.forceFailover&&/^vless:/i.test(String(o.route?.proxy||''))&&(beforeMode==='direct'||beforeMode==='proxy')?(State.MODES.includes(o.mode)?o.mode:'node'):beforeMode);
      Object.assign(a,manual&&o.preservePolicy===true?{routeMode:beforeMode,routeAuto:old.routeAuto!==false,nodeFailover:old.nodeFailover!==false}:State.prefs(targetMode));
      a.routeHome=String(o.route.routeHome||o.route.region||old.routeHome||old.region||'');a.routeAt=now();a.tunErr=candidate.tunErr||'';
      try{persist();}catch(e){for(const k of Object.keys(old))if(old[k]===undefined)delete a[k];else a[k]=old[k];throw e;}
      return {ok:true,account:publicAccount(a)};
    }catch(e){if(find(a.id)===a)try{await apply(a);}catch{}return {ok:false,error:String(e.message||e)};}
    finally{busy.delete(a.id);}
  };fn.busy=busy;return fn;
}
module.exports={ippure,ippureDirect,ipapi,purity,checkProxyIpDirect,signature,probeKey,serviceOK,realtimeOK,blocked,checkService,createProbe,createProofs,createApply};
