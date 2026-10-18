// Shared, dependency-free workspace path/MIME/range policy (UI + Electron + tests).
const WorkspacePath = (() => {
  const MAX_BODY = 16 * 1024 * 1024, MAX_FILE = 128 * 1024 * 1024;
  const types = {
    html:'text/html', htm:'text/html', svg:'image/svg+xml', css:'text/css', js:'text/javascript', mjs:'text/javascript', cjs:'text/plain',
    json:'application/json', map:'application/json', wasm:'application/wasm', xml:'application/xml', txt:'text/plain', md:'text/plain', csv:'text/csv',
    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif', ico:'image/x-icon', bmp:'image/bmp',
    pdf:'application/pdf', mp4:'video/mp4', webm:'video/webm', ogv:'video/ogg', mp3:'audio/mpeg', m4a:'audio/mp4', aac:'audio/aac', wav:'audio/wav', ogg:'audio/ogg', flac:'audio/flac',
    woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf', vtt:'text/vtt',
  };
  function split(raw, base = '') {
    let s = String(raw ?? '').trim();
    if (s.length > 4096 || /[\u0000-\u001f\u007f\\]/.test(s)) throw Error('无效工作区路径');
    if ((s.startsWith('`') && s.endsWith('`')) || (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1,-1);
    if (/^sandbox:/i.test(s)) s = s.slice(8);
    if (/^file:/i.test(s)) { const u = new URL(s); if (u.hostname || !u.pathname.startsWith('/home/user/')) throw Error('不是工作区文件'); s = u.pathname + u.search + u.hash; }
    if (/^[a-z][a-z\d+.-]*:/i.test(s) || s.startsWith('//')) throw Error('不是工作区路径');
    const qi = s.search(/[?#]/), suffix = qi < 0 ? '' : s.slice(qi); s = qi < 0 ? s : s.slice(0,qi);
    try { s = decodeURIComponent(s); } catch { throw Error('路径编码无效'); }
    if (/[\u0000-\u001f\u007f\\]/.test(s)) throw Error('路径编码无效');
    s = s.replace(/:\d+(?::\d+)?$/, '');
    const rooted = /^(?:\/|~\/)/.test(s);
    s = s.replace(/^\/home\/user(?:\/|$)/, '').replace(/^~\//, '').replace(/^\/workspace(?:\/|$)/, '').replace(/^\//, '');
    const parts = !rooted && base ? base.split('/').slice(0,-1) : [];
    for (const p of s.split('/')) { if (!p || p === '.') continue; if (p === '..') { if (!parts.length) throw Error('路径超出工作区'); parts.pop(); } else parts.push(p); }
    return { path: parts.join('/'), suffix };
  }
  const norm = (raw, base) => split(raw, base).path;
  function local(raw) { const s = String(raw || '').trim(); if (!s || s.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(s) && !/^(file|sandbox):/i.test(s) || s.startsWith('//')) return false; try { return !!norm(s); } catch { return false; } }
  function looks(raw) { const s = String(raw || '').trim(); if (!local(s) || /[*<>|\n]/.test(s) || /^v?\d+(?:\.\d+)+(?:[-\w]*)?$/.test(s)) return false; const p = norm(s); return /\.[a-z\d]{1,12}$/i.test(p) || /^(\/home\/user\/|~\/|\.\/|\/workspace\/)/.test(s); }
  const mime = p => types[String(p).split('.').at(-1).toLowerCase()] || (/\.(py|sh|yaml|yml|toml|ini|log|sql|jsx|tsx|ts|java|c|h|cpp|rs|go|rb)$/i.test(p) ? 'text/plain' : 'application/octet-stream');
  const native = p => /^(?:text\/html|image\/|audio\/|video\/)/.test(mime(p));
  const text = p => /^text\//.test(mime(p)) || /^(application\/(json|xml)|image\/svg\+xml)$/.test(mime(p));
  const encode = p => p.split('/').map(encodeURIComponent).join('/');
  function range(value, size, cap = MAX_BODY) {
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE) return { status: 413 };
    if (!value) return size > cap ? { status: 413 } : { status: 200, start: 0, end: size - 1, length: size };
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(value));
    if (!m || (!m[1] && !m[2]) || !size) return { status: 416 };
    let start = m[1] ? +m[1] : Math.max(0, size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2],size-1) : size-1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return { status: 416 };
    end = Math.min(end,start+cap-1); return { status:206, start, end, length:end-start+1 };
  }
  // No credentials, forms, sockets, workers, popups or external resources. This is
  // a static workspace preview, not a backend server or an authenticated browser.
  const CSP = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'self'; worker-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'";
  return { split, norm, local, looks, mime, native, text, encode, range, CSP, MAX_BODY, MAX_FILE };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WorkspacePath;
