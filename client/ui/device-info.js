// 设备信息（只读）：出口 IP / 国家、时区、语言、WebRTC、指纹摘要；时区或语言和出口国家对不上时标红。
// 只显示页面实际看到的值，不修改任何东西。国家 → 时区 / 语言表在打包时从 region-environments.json 注入。
const DeviceInfo = (() => {
  const ENV = /*__REGION_ENV__*/null || {};   // { CC: [locale, zone1, zone2, …] }
  const fnv = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16).padStart(8, '0'); };
  const offsetOf = tz => { try { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date()).find(x => x.type === 'timeZoneName')?.value || ''; return p.replace('GMT', '') || '+00:00'; } catch { return null; } };
  let canvasId = null, gpu = null;
  function canvasHash() {
    if (canvasId != null) return canvasId;
    try { const c = document.createElement('canvas'); c.width = 220; c.height = 30; const g = c.getContext('2d'); g.textBaseline = 'top'; g.font = '14px Arial'; g.fillStyle = '#f60'; g.fillRect(100, 1, 62, 20); g.fillStyle = '#069'; g.fillText('Brana 设备 ✓ 1.0', 2, 15); canvasId = fnv(c.toDataURL()); } catch { canvasId = ''; }
    return canvasId;
  }
  function gpuName() {
    if (gpu != null) return gpu;
    try { const gl = document.createElement('canvas').getContext('webgl'); const e = gl && gl.getExtension('WEBGL_debug_renderer_info'); gpu = e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL) || '') : ''; } catch { gpu = ''; }
    return gpu;
  }
  const rtc = () => (typeof RTCPeerConnection === 'undefined' && typeof webkitRTCPeerConnection === 'undefined') ? { ok: true, text: '已禁用（不会暴露本机 IP）' } : { ok: false, text: '可用（可能暴露本机 IP）' };
  // 时区：在该国时区列表里，或与其中某个时区当前偏移相同 → 一致
  function tzMatch(cc, tz) {
    const e = ENV[cc]; if (!e || !tz) return null;
    const zones = e.slice(1); if (zones.includes(tz)) return true;
    const o = offsetOf(tz); return !!o && zones.some(z => offsetOf(z) === o);
  }
  // 语言：任一首选语言的地区码等于出口国家，或主语言等于该国默认语言 → 一致
  function langMatch(cc, langs) {
    const e = ENV[cc]; if (!e || !langs?.length) return null;
    const main = String(e[0] || '').split('-')[0].toLowerCase();
    return langs.some(l => { const [p, r] = String(l).split('-'); return (r && r.toUpperCase() === cc) || p.toLowerCase() === main; });
  }
  function fpSummary() {
    const N = navigator, S = screen, ua = String(N.userAgent || '');
    const os = /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Windows/.test(ua) ? 'Windows' : /Android (\d+)/.test(ua) ? 'Android ' + RegExp.$1 : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '其它';
    const chrome = (ua.match(/Chrome\/(\d+)/) || [])[1];
    const p = { os, browser: chrome ? 'Chrome ' + chrome : '', screen: S.width + '×' + S.height, cores: N.hardwareConcurrency || 0, mem: N.deviceMemory || 0, gpu: gpuName(), canvas: canvasHash() };
    const id = fnv([ua, p.screen, p.cores, p.mem, p.gpu, p.canvas, (N.languages || []).join(','), Intl.DateTimeFormat().resolvedOptions().timeZone].join('|'));
    const gpuShort = String(p.gpu).replace(/^ANGLE \(|\)$/g, '').replace(/Direct3D.*$|vs_\d.*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return { ...p, id, gpuShort, text: [p.os, p.browser, p.screen, p.cores ? p.cores + ' 核' : '', p.mem ? p.mem + ' GB' : ''].filter(Boolean).join(' · ') };
  }
  // 当前窗口的环境（页面实际看到的值）
  function snapshot() {
    const cc = String((typeof IP !== 'undefined' && IP.loc) || '').toUpperCase(), ip = (typeof IP !== 'undefined' && IP.ip) || '';
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
    const langs = [...(navigator.languages || [navigator.language || ''])].filter(Boolean);
    const tzOk = cc ? tzMatch(cc, tz) : null, langOk = cc ? langMatch(cc, langs) : null, r = rtc(), fp = fpSummary();
    const issues = [];
    if (tzOk === false) issues.push('时区 ' + tz + ' 和出口国家 ' + cc + ' 不一致');
    if (langOk === false) issues.push('语言 ' + (langs[0] || '?') + ' 和出口国家 ' + cc + ' 不一致');
    if (!r.ok) issues.push('WebRTC 可用，可能暴露本机 IP');
    return { ip, cc, tz, offset: offsetOf(tz), langs, tzOk, langOk, rtc: r, fp, issues };
  }
  // 计划给新账号的环境：时区 / 语言按所选地区；出口国家用实测结果（没测过 = 未知）
  function planned(region, exitCc) {
    const cc = String(region || '').toUpperCase(), e = ENV[cc], x = String(exitCc || '').toUpperCase();
    const tz = e ? e[1] : '', lang = e ? e[0] : '', issues = [];
    if (x && cc && x !== cc) issues.push('实测出口 ' + x + ' 和地区 ' + cc + ' 不一致，时区 / 语言会对不上');
    if (!cc) issues.push('没有选地区：沿用系统时区和语言');
    return { cc, exit: x, tz, lang, tzOk: x && cc ? (x === cc || tzMatch(x, tz)) : null, langOk: x && cc ? (x === cc || langMatch(x, [lang])) : null, rtc: rtc(), issues };
  }
  const flagOf = cc => (typeof ccF === 'function' && cc) ? ccF(cc) : cc;
  // 右下角面板里的若干行：row(k, v, cls)
  function rows(row) {
    const s = snapshot(), bad = 'nt-bad';
    const out = [
      row('出口', s.ip ? s.ip + (s.cc ? ' · ' + flagOf(s.cc) : '') : '检测中…'),
      row('时区', (s.tz || '未知') + (s.offset ? ' (UTC' + s.offset + ')' : ''), s.tzOk === false ? bad : ''),
      row('语言', s.langs.slice(0, 2).join(', ') || '未知', s.langOk === false ? bad : ''),
      row('WebRTC', s.rtc.text, s.rtc.ok ? '' : bad),
      row('指纹', s.fp.id + ' · ' + s.fp.text),
    ];
    if (s.fp.gpuShort) out.push(row('显卡', s.fp.gpuShort));
    if (s.issues.length) out.push(h('div', { class: 'nt-v nt-down dev-warn' }, '⚠ ' + s.issues.join('；')));
    return out;
  }
  // 一行小字（添加账号 / 注册）。region 给了 = 显示新账号将使用的环境；否则显示当前窗口环境
  function line(opt = {}) {
    const el = h('div', { class: 'dev-line', role: 'status' });
    const seg = (t, bad) => h('span', { class: bad ? 'dev-bad' : '' }, t);
    el.paint = (o = opt) => {
      if (o.region !== undefined) {
        const p = planned(o.region, o.exit);
        el.replaceChildren(seg('新账号环境 '), seg('出口 ' + (p.exit ? flagOf(p.exit) : '未测'), !!p.exit && !!p.cc && p.exit !== p.cc), seg(' · 时区 ' + (p.tz || '系统'), p.tzOk === false || !p.cc), seg(' · 语言 ' + (p.lang || '系统'), p.langOk === false || !p.cc), seg(' · WebRTC ' + (p.rtc.ok ? '禁用' : '可用'), !p.rtc.ok), seg(' · 独立随机指纹'));
        el.title = p.issues.join('\n') || '时区和语言按所选地区设置，与实测出口一致';
        el.classList.toggle('bad', p.issues.length > 0 && !!p.exit || !p.cc);
      } else {
        const s = snapshot();
        el.replaceChildren(seg('出口 ' + (s.ip ? s.ip + ' ' + flagOf(s.cc) : '检测中')), seg(' · 时区 ' + (s.tz || '?'), s.tzOk === false), seg(' · 语言 ' + (s.langs[0] || '?'), s.langOk === false), seg(' · WebRTC ' + (s.rtc.ok ? '禁用' : '可用'), !s.rtc.ok), seg(' · 指纹 ' + s.fp.id));
        el.title = s.issues.join('\n') || '时区、语言和出口国家一致';
        el.classList.toggle('bad', s.issues.length > 0);
      }
    };
    el.paint(); return el;
  }
  return { snapshot, planned, rows, line, tzMatch, langMatch, ENV };
})();
