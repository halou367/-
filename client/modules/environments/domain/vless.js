// ---------- VLESS 节点：分享链接解析 / 生成、xray 出站配置（桌面主进程、界面、安卓共用这一份）----------
// 支持 v2rayN 分享链接的全部常用参数：
//   传输：type=tcp/raw/ws/httpupgrade/xhttp(splithttp)/grpc/kcp，host、path、mode、extra(xhttp 高级 JSON)、headerType、serviceName、authority、seed
//   安全：security=none/tls/reality，sni、fp、alpn、allowInsecure、ech(echConfigList)、pcs(证书指纹固定)、vcn(按名称校验证书)、pbk/sid/spx/pqv(reality)
//   其它：encryption、flow、fm(finalmask JSON)、mux
// ProxyIP：路径里 /proxyip=xxx 的 xxx（edgetunnel 一类 Workers 节点的落地），同一个节点可以配不同的 ProxyIP。
const Vless = (() => {
  const NETS = ['tcp', 'ws', 'xhttp', 'httpupgrade', 'grpc', 'kcp'];
  const XMODES = ['auto', 'packet-up', 'stream-up', 'stream-one'];
  const FPS = ['chrome', 'firefox', 'safari', 'ios', 'android', 'edge', '360', 'qq', 'random', 'randomized', 'none'];
  const blank = () => ({ name: '', address: '', port: 443, uuid: '', encryption: 'none', flow: '', network: 'tcp', headerType: 'none', host: '', path: '/', mode: '', extra: '', serviceName: '', authority: '', seed: '', security: 'none', sni: '', fp: 'chrome', alpn: '', allowInsecure: false, ech: '', pcs: '', vcn: '', pbk: '', sid: '', spx: '', pqv: '', fm: '', mux: false, muxConc: 8 });
  const dec = s => { try { return decodeURIComponent(String(s).replace(/\+/g, '%20')); } catch { return String(s); } };
  function parse(link) {
    link = String(link || '').trim(); const m = /^vless:\/\/([^@]+)@([^?#]+?)(?:\?([^#]*))?(?:#(.*))?$/i.exec(link); if (!m) return null;
    const hp = m[2].replace(/\/+$/, ''); let host, port;
    const b6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(hp); if (b6) { host = b6[1]; port = +b6[2] || 443; } else { const i = hp.lastIndexOf(':'); if (i > 0 && /^\d+$/.test(hp.slice(i + 1))) { host = hp.slice(0, i); port = +hp.slice(i + 1); } else { host = hp; port = 443; } }
    const q = {}; String(m[3] || '').split('&').forEach(kv => { if (!kv) return; const i = kv.indexOf('='); const k = dec(i < 0 ? kv : kv.slice(0, i)), v = i < 0 ? '' : dec(kv.slice(i + 1)); q[k] = v; });
    const g = (...ks) => { for (const k of ks) if (q[k] != null && q[k] !== '') return q[k]; return ''; };
    const n = blank();
    n.uuid = dec(m[1]); n.address = host; n.port = port; n.name = m[4] ? dec(m[4]) : '';
    n.encryption = g('encryption') || 'none'; n.flow = g('flow');
    let net = (g('type', 'net') || 'tcp').toLowerCase(); if (net === 'splithttp') net = 'xhttp'; if (net === 'raw') net = 'tcp'; if (net === 'h2' || net === 'http') net = 'xhttp'; n.network = NETS.includes(net) ? net : 'tcp';
    n.headerType = g('headerType') || 'none'; n.host = g('host'); n.path = g('path') || (n.network === 'grpc' || n.network === 'kcp' ? '' : '/');
    n.mode = g('mode'); n.extra = g('extra'); n.serviceName = g('serviceName') || (n.network === 'grpc' ? g('path') : ''); n.authority = g('authority'); n.seed = g('seed') || (n.network === 'kcp' ? g('path') : '');
    let sec = (g('security') || 'none').toLowerCase(); if (sec === 'xtls') sec = 'tls'; n.security = ['none', 'tls', 'reality'].includes(sec) ? sec : 'none';
    n.sni = g('sni', 'peer', 'serverName'); n.fp = g('fp') || (n.security === 'none' ? '' : 'chrome'); n.alpn = g('alpn');
    n.allowInsecure = /^(1|true)$/i.test(g('allowInsecure', 'insecure'));
    n.ech = g('ech'); n.pcs = g('pcs'); n.vcn = g('vcn'); n.pbk = g('pbk'); n.sid = g('sid'); n.spx = g('spx'); n.pqv = g('pqv'); n.fm = g('fm');
    const mx = g('mux'); if (mx) { n.mux = /^(1|true|on)$/i.test(mx); } const mc = +g('muxConcurrency', 'concurrency'); if (mc) n.muxConc = mc;
    return n;
  }
  function toLink(n) {
    n = { ...blank(), ...n }; const P = [];
    const add = (k, v) => { if (v !== '' && v != null && v !== false) P.push(k + '=' + encodeURIComponent(v === true ? '1' : String(v))); };
    add('encryption', n.encryption || 'none'); add('flow', n.flow); add('security', n.security);
    if (n.security !== 'none') { add('sni', n.sni); add('fp', n.fp); add('alpn', n.alpn); if (n.allowInsecure) add('allowInsecure', '1'); }
    if (n.security === 'tls') { add('ech', n.ech); add('pcs', n.pcs); add('vcn', n.vcn); }
    if (n.security === 'reality') { add('pbk', n.pbk); add('sid', n.sid); add('spx', n.spx); add('pqv', n.pqv); }
    add('type', n.network);
    if (n.network === 'tcp' && n.headerType && n.headerType !== 'none') add('headerType', n.headerType);
    if (n.network === 'kcp') { add('headerType', n.headerType !== 'none' ? n.headerType : ''); add('seed', n.seed); }
    if (/^(tcp|ws|httpupgrade|xhttp)$/.test(n.network)) { add('host', n.host); if (n.network !== 'tcp' || n.headerType === 'http') add('path', n.path); }
    if (n.network === 'xhttp') { add('mode', n.mode); add('extra', n.extra); }
    if (n.network === 'grpc') { add('serviceName', n.serviceName); add('mode', n.mode); add('authority', n.authority); }
    add('fm', n.fm);
    if (n.mux) { add('mux', '1'); add('muxConcurrency', n.muxConc || 8); }
    const h = /:/.test(n.address) && !/^\[/.test(n.address) ? '[' + n.address + ']' : n.address;
    return 'vless://' + encodeURIComponent(n.uuid) + '@' + h + ':' + (+n.port || 443) + '?' + P.join('&') + (n.name ? '#' + encodeURIComponent(n.name) : '');
  }
  // ProxyIP：替换路径里 /proxyip= 后面的值（也兼容 ?proxyip=）；路径是 / 时变成 /proxyip=X，其它路径在末尾追加
  // 链式代理（edgetunnel 2.1+）：sstp:// socks5:// http:// https:// turn:// 作为「出口」时写成路径 /sstp://user:pass@host:port（全局链式），并去掉原来的 /proxyip=
  const CHAIN_RE = /^(socks5|https?|turn|sstp):\/\/(?:([\w.~%+=!$&'()*,;:-]{1,128})@)?([\w.\[\]:-]{3,160})$/i;
  const PIP_RE = /^(?:[\w.:\[\]-]{3,120}|(?:socks5|https?|turn|sstp):\/\/(?:[\w.~%+=!$&'()*,;:-]{1,128}@)?[\w.\[\]:-]{3,160})$/i;
  const chainOf = pip => { const m = CHAIN_RE.exec(String(pip || '').trim()); return m ? { type: m[1].toLowerCase(), auth: m[2] || '', hostport: m[3] } : null; };
  function withProxyIp(p, pip) {
    p = p == null || p === '' ? '/' : String(p); pip = String(pip || '').trim(); if (!pip) return p;
    const qi = p.indexOf('?'); let base = qi < 0 ? p : p.slice(0, qi), qs = qi < 0 ? '' : p.slice(qi + 1);
    if (chainOf(pip)) {
      base = base.replace(/\/video\/[^/]*/i, '').replace(/\/proxyip=[^/]*/ig, '').replace(/\/(?:socks5?|https?|turn|sstp):\/?\/?[^/]*/ig, '').replace(/\/(?:g?s5|socks5|g?https?|g?turn|g?sstp)=[^/]*/ig, '').replace(/\/+$/, '');
      qs = qs.split('&').filter(x => x && !/^(proxyip|socks5|https?|turn|sstp|globalproxy)(=|$)/i.test(x)).join('&');
      return base + '/' + pip + (qs ? '?' + qs : '');
    }
    base = base.replace(/\/video\/[^/]*/i, '').replace(/\/(?:socks5?|https?|turn|sstp):\/?\/?[^/]*/ig, '').replace(/\/(?:g?s5|socks5|g?https?|g?turn|g?sstp)=[^/]*/ig, '');
    if (/(^|&)proxyip=/i.test(qs) && !/\/proxyip=/i.test(base)) { qs = qs.replace(/(^|&)proxyip=[^&]*/i, '$1proxyip=' + pip); return (base || '/') + '?' + qs; }
    if (/\/proxyip=/i.test(base)) base = base.replace(/\/proxyip=[^/]*/i, '/proxyip=' + pip);
    else if (base === '/' || base === '') base = '/proxyip=' + pip;
    else base = base.replace(/\/+$/, '') + '/proxyip=' + pip;
    return base + (qs ? '?' + qs : '');
  }
  const proxyIpOf = p => { const c = /\/((?:socks5|https?|turn|sstp):\/\/[^/?#]+)/i.exec(String(p || '')); if (c) return dec(c[1]); const m = /\/proxyip=([^/?&#]*)/i.exec(String(p || '')) || /[?&]proxyip=([^&#]*)/i.exec(String(p || '')); return m ? dec(m[1]) : ''; };
  const json = (s, what) => { s = String(s || '').trim(); if (!s) return undefined; try { const v = JSON.parse(s); if (v && typeof v === 'object') return v; } catch {} throw new Error(what + ' 不是有效的 JSON'); };
  function validate(n) {
    if (!n) return '链接格式不正确（应以 vless:// 开头）';
    if (!n.address) return '缺少地址';
    if (!(+n.port >= 1 && +n.port <= 65535)) return '端口不正确';
    if (!/^[0-9a-f-]{16,}$/i.test(n.uuid || '') && !/^.{1,30}$/.test(n.uuid || '')) return '用户 ID（UUID）不正确';
    if (!n.uuid) return '缺少用户 ID（UUID）';
    if (n.security === 'reality' && !n.pbk) return 'REALITY 需要公钥（pbk）';
    try { json(n.extra, 'xhttp extra'); json(n.fm, 'finalmask'); } catch (e) { return e.message; }
    return '';
  }
  // xray 出站（tag = proxy）
  function outbound(n, pip) {
    n = { ...blank(), ...n }; const err = validate(n); if (err) throw new Error(err);
    const st = { network: n.network, security: n.security };
    const sni = n.sni || n.host || (/^[\d.:[\]]+$/.test(n.address) ? '' : n.address);
    if (n.security === 'tls') {
      st.tlsSettings = { serverName: sni, fingerprint: n.fp || 'chrome' };
      if (n.alpn) st.tlsSettings.alpn = n.alpn.split(',').map(x => x.trim()).filter(Boolean);
      if (n.allowInsecure) st.tlsSettings.allowInsecure = true;
      if (n.ech && String(n.ech).trim().toLowerCase() !== 'none') st.tlsSettings.echConfigList = String(n.ech).trim();
      if (n.pcs) st.tlsSettings.pinnedPeerCertSha256 = n.pcs;
      if (n.vcn) st.tlsSettings.verifyPeerCertByName = n.vcn;
    } else if (n.security === 'reality') {
      st.realitySettings = { serverName: sni, fingerprint: n.fp || 'chrome', publicKey: n.pbk, shortId: n.sid || '', spiderX: n.spx || '' };
      if (n.pqv) st.realitySettings.mldsa65Verify = n.pqv;
    }
    const path = withProxyIp(n.path, pip), host = n.host || '';
    if (n.network === 'ws') st.wsSettings = { path, host };
    else if (n.network === 'httpupgrade') st.httpupgradeSettings = { path, host };
    else if (n.network === 'xhttp') { st.xhttpSettings = { path, host, mode: XMODES.includes(n.mode) ? n.mode : 'auto' }; const ex = json(n.extra, 'xhttp extra'); if (ex) st.xhttpSettings.extra = ex; }
    else if (n.network === 'grpc') st.grpcSettings = { serviceName: n.serviceName || '', multiMode: n.mode === 'multi', ...(n.authority ? { authority: n.authority } : {}) };
    else if (n.network === 'kcp') st.kcpSettings = { header: { type: n.headerType || 'none' }, ...(n.seed ? { seed: n.seed } : {}) };
    else if (n.network === 'tcp' && n.headerType === 'http') st.tcpSettings = { header: { type: 'http', request: { path: [path || '/'], headers: host ? { Host: host.split(',').map(x => x.trim()) } : {} } } };
    const fm = json(n.fm, 'finalmask'); if (fm) st.finalmask = fm;
    const ob = { tag: 'proxy', protocol: 'vless', settings: { vnext: [{ address: n.address, port: +n.port, users: [{ id: n.uuid, encryption: n.encryption || 'none', ...(n.flow ? { flow: n.flow } : {}) }] }] }, streamSettings: st };
    if (n.mux && !n.flow) ob.mux = { enabled: true, concurrency: +n.muxConc || 8 };
    return ob;
  }
  // 完整配置：本地 127.0.0.1:port 入口（socks，同时接受 HTTP 代理请求）
  function config(ob, port, level = 'warning') {
    return { log: { loglevel: level }, inbounds: [{ tag: 'in', listen: '127.0.0.1', port, protocol: 'socks', settings: { udp: false, auth: 'noauth' }, sniffing: { enabled: false } }], outbounds: [ob, { tag: 'block', protocol: 'blackhole' }], routing: { domainStrategy: 'AsIs' } };
  }
  // ---- 验证码专用线路（可选，默认关闭）----
  // ProxyIP 通常只能中转 Cloudflare 托管的站点（arena.ai 是，Google 不是），所以节点 + ProxyIP 时 reCAPTCHA 常常连不上。
  // 打开后只有这几个域名改走 local（本机网络直连）或一个备用 HTTP / SOCKS 代理，其余请求照旧走账号线路。
  const CAP_DOMAINS = ['domain:google.com', 'domain:gstatic.com', 'domain:recaptcha.net', 'domain:googleapis.com', 'domain:youtube.com'];
  function capParse(v) {
    v = String(v || '').trim(); if (!v || /\s/.test(v)) return null;
    let u; try { u = new URL(/^[a-z0-9]+:\/\//i.test(v) ? v : 'http://' + v); } catch { return null; }
    const sc = u.protocol.replace(':', '').toLowerCase(), kind = { http: 'http', https: 'http', socks: 'socks', socks5: 'socks', socks5h: 'socks' }[sc];
    const port = u.port || (/^[a-z0-9]+:\/\/[^/?#]*:(\d+)(?:[/?#]|$)/i.exec(/^[a-z0-9]+:\/\//i.test(v) ? v : 'http://' + v) || [])[1];   // https://host:443 时 URL 会把默认端口吃掉，要从原文取
    if (!kind || !u.hostname || !/^\d+$/.test(String(port || '')) || +port < 1 || +port > 65535) return null;
    return { kind, tls: sc === 'https', host: u.hostname.replace(/^\[|\]$/g, ''), port: +port, user: decodeURIComponent(u.username || ''), pass: decodeURIComponent(u.password || '') };
  }
  // 规范化：'' = 不启用；'local' = 本机网络；其余必须是合法的 http(s):// / socks5:// 代理，否则当作无效（返回 null）
  const capSpec = v => { v = String(v ?? '').trim(); return !v ? '' : v.toLowerCase() === 'local' ? 'local' : capParse(v) ? v : null; };
  function capOutbound(v) {
    const spec = capSpec(v); if (!spec) return null;
    if (spec === 'local') return { tag: 'cap', protocol: 'freedom', settings: { domainStrategy: 'AsIs' } };
    const p = capParse(spec), settings = { address: p.host, port: p.port, ...(p.user ? { user: p.user, pass: p.pass } : {}) };
    const ob = { tag: 'cap', protocol: p.kind, settings };
    if (p.tls) ob.streamSettings = { security: 'tls', tlsSettings: { serverName: p.host } };
    return ob;
  }
  // 在 xray 配置（单入口）上加规则：验证码域名 → cap 出站。没启用 / 无效 = 原样返回
  function withCap(cfg, v) {
    const ob = capOutbound(v); if (!ob) return cfg;
    cfg.outbounds = [...cfg.outbounds, ob];
    cfg.routing = { ...cfg.routing, rules: [{ type: 'field', domain: CAP_DOMAINS, outboundTag: 'cap' }, ...(cfg.routing?.rules || [])] };
    return cfg;
  }
  const sig = (n, pip) => { try { return JSON.stringify(outbound(n, pip)); } catch { return ''; } };
  const short = n => n ? (n.name || n.address + ':' + n.port) + ' · ' + n.network + (n.security !== 'none' ? '+' + n.security : '') : '';
  return { NETS, XMODES, FPS, blank, parse, toLink, withProxyIp, proxyIpOf, chainOf, PIP_RE, CHAIN_RE, validate, outbound, config, sig, short, CAP_DOMAINS, capSpec, capParse, capOutbound, withCap };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Vless;
