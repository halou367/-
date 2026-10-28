// Snapshot-bound workspace access. Active documents NEVER run in the main bridged WebView.
const WorkspacePreview = {
  sessions: new Map(),
  context(sid, data, signal = null) {
    if (!sid || !data?.manifest?.root || !data.node) throw Error('工作区快照尚未就绪');
    const root = structuredClone(data.manifest.root), loads = new Map(); let expanded = 0;
    const ctx = { sid, node: data.node, root, signal };
    ctx.dir = async (entry, path) => {
      if (signal?.aborted) throw Error('预览已关闭');
      if (entry.entries) return entry;
      if (!loads.has(path) && ++expanded > 512) throw Error('目录读取超过上限，请下载工作区后预览');
      if (!loads.has(path)) loads.set(path, Workspace.dir(sid, ctx.node, path, { signal }).then(d => { if (!d?.entries) throw Error('无法读取目录 ' + path); Object.assign(entry, d); return entry; }).finally(() => loads.delete(path)));
      return loads.get(path);
    };
    ctx.entry = async path => {
      if (path.split('/').length > 128) throw Error('目录层级过深');
      let dir = root, prefix = '';
      for (const part of path.split('/').filter(Boolean)) {
        if (dir.type !== 'dir' && dir !== root) return null;
        await ctx.dir(dir, prefix);
        const e = Object.hasOwn(dir.entries, part) ? dir.entries[part] : null; if (!e) return null;
        prefix += (prefix ? '/' : '') + part; dir = e;
      }
      return { e: dir, p: path, name: path.split('/').at(-1) || 'Workspace' };
    };
    ctx.find = async raw => {
      const parsed = WorkspacePath.split(raw), exact = await ctx.entry(parsed.path); if (exact) return { hits: [exact], ...parsed };
      // Relative/basename links may omit a directory. Search lazy directories too,
      // but never silently choose the first of several equally valid matches.
      const todo = [{ e: root, p: '' }], hits = []; let scanned = 0;
      while (todo.length && scanned++ < 256 && hits.length < 20) {
        const d = todo.shift(); await ctx.dir(d.e, d.p);
        for (const [name, e] of Object.entries(d.e.entries || {})) {
          const p = d.p ? d.p + '/' + name : name;
          if (p === parsed.path || p.endsWith('/' + parsed.path)) hits.push({ e, p, name });
          if (e.type === 'dir') todo.push({ e, p });
        }
      }
      return { hits, incomplete: !!todo.length, ...parsed };
    };
    return ctx;
  },
  setup() {
    if (this.bound) return; this.bound = true;
    const receive = event => {
      if (event?.closed) { const s = this.sessions.get(event.id); if (s) { s.ctl?.abort(); for (const resolve of s.waiters?.splice(0) || []) resolve(false); } this.sessions.delete(event.id); if (event.error) toast('预览已关闭：' + event.error, 'err'); return; }
      void this.respond(event);
    };
    if (Host.onPreview) Host.onPreview(receive);
    else if (window.BranaAndroid && Host.previewRespond) window.__ancPreviewEvent = receive;
  },
  async open(ctx, path, suffix = '') {
    if (!Host.previewOpen || !Host.previewRespond) throw Error('当前宿主不支持隔离预览，请更新客户端；仍可查看源码或下载文件');
    this.setup(); const id = uuid7(), ctl = new AbortController();
    const own = this.context(ctx.sid, { node: ctx.node, manifest: { root: ctx.root } }, ctl.signal);
    this.sessions.set(id, { ctx: own, ctl, busy: 0, waiters: [], at: now() });
    try {
      const result = await Host.previewOpen({ id, path: WorkspacePath.encode(path) + suffix, title: path });
      if (!result?.ok) throw Error(result?.error || '无法创建隔离预览');
    } catch (e) { ctl.abort(); const s = this.sessions.get(id); for (const resolve of s?.waiters?.splice(0) || []) resolve(false); this.sessions.delete(id); throw e; }
  },
  async respond(event) {
    const s = this.sessions.get(event?.id);
    if (!s || !/^[\w-]{1,80}$/.test(String(event.request || ''))) return;
    let result = { id: event.id, request: event.request, status: 404, mime: 'text/plain', body: '', size: 0 };
    let acquired = false;
    try {
      if (s.busy >= 4) {
        if (s.waiters.length >= 124) throw Error('等待中的预览资源过多，请分批打开');
        acquired = await new Promise(resolve => s.waiters.push(resolve)); if (!acquired) return;
      } else { s.busy++; acquired = true; }
      result = { ...result, ...await this.resource(s.ctx, event.path, event.range || '', event.method || 'GET') };
    } catch (e) { result.status = 502; result.body = btoa(unescape(encodeURIComponent('工作区预览：' + describe(e)))); }
    finally { if (acquired) { const next = s.waiters.shift(); if (next) next(true); else s.busy--; } }
    if (this.sessions.get(event.id) === s) {
      try { await Host.previewRespond(result); } catch {} // closing a preview cancels its requests
    }
  },
  async resource(ctx, raw, range = '', method = 'GET') {
    if (!['GET', 'HEAD'].includes(method)) return { status: 405, body: '', mime: 'text/plain', size: 0 };
    const path = WorkspacePath.norm(raw), found = await ctx.entry(path);
    if (!found) return { status: 404, body: btoa('Workspace file not found'), mime: 'text/plain', size: 0 };
    let { e, p } = found;
    if (e.type === 'dir') {
      await ctx.dir(e, p);
      const index = ['index.html', 'index.htm'].find(n => Object.hasOwn(e.entries, n));
      if (!index) return { status: 404, body: btoa('No index.html in this directory'), mime: 'text/plain', size: 0 };
      if (path && !String(raw).split(/[?#]/)[0].endsWith('/')) {
        const body = '<!doctype html><meta charset="utf-8"><script>location.replace(' + JSON.stringify('/' + WorkspacePath.encode(path) + '/') + ')</script>';
        return { status: 200, mime: 'text/html', body: btoa(body), size: body.length };
      }
      p = p ? p + '/' + index : index; e = e.entries[index];
    }
    const inline = e.inlineText != null ? new Blob([e.inlineText]) : null, size = inline ? inline.size : +e.size;
    const r = WorkspacePath.range(range, size);
    const meta = { status: r.status, mime: WorkspacePath.mime(p), size, start: r.start, end: r.end, length: r.length, body: '' };
    if (![200,206].includes(r.status) || method === 'HEAD') return meta;
    let blob;
    if (inline) blob = inline.slice(r.start, r.end + 1);
    else {
      if (!e.hash) throw Error('文件内容尚未写入快照');
      blob = await NetPolicy.deadline(async signal => {
        if (!range && typeof Workspace !== 'undefined' && Workspace.casCache?.has(e.hash)) {
          return Workspace.casCache.get(e.hash).slice(r.start, r.end + 1);
        }
        if (!range && size <= 6 * 1024 * 1024 && typeof Host !== 'undefined' && typeof Host.protoFetch === 'function' && !(typeof window !== 'undefined' && window.__fixture) && typeof Workspace !== 'undefined' && typeof Workspace.fetchCasBlob === 'function') {
          const fullBlob = await Workspace.fetchCasBlob(e.hash, { signal });
          return fullBlob.slice(r.start, r.end + 1);
        }
        const res = await rawFetch(Workspace.casUrl(e.hash), { credentials: 'same-origin', cache: 'no-store', signal,
          ...(range ? { headers: { Range: 'bytes=' + r.start + '-' + r.end } } : {}) });
        if ((res.status === 429 || res.status === 403) && typeof Workspace !== 'undefined' && typeof Workspace.fetchCasBlob === 'function') {
          const fullBlob = await Workspace.fetchCasBlob(e.hash, { signal });
          return fullBlob.slice(r.start, r.end + 1);
        }
        if (!res.ok) throw new HttpError(res.status, '读取工作区文件失败');
        const cr = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('Content-Range') || '');
        if (res.status === 206 && (!cr || +cr[1] !== r.start || +cr[3] !== size)) throw Error('分段数据与快照不一致');
        // Some CAS servers ignore Range. Stream/skip only to the requested slice,
        // then cancel; never buffer an entire large media file in a JS/native bridge.
        const offset = res.status === 206 ? r.start : 0, reader = res.body.getReader(), parts = [];
        let pos = offset, bytes = 0;
        try {
          while (pos <= r.end) {
            const chunk = await reader.read(); if (chunk.done) break;
            const lo = Math.max(0, r.start - pos), hi = Math.min(chunk.value.length, r.end + 1 - pos);
            if (hi > lo) { const part = chunk.value.slice(lo,hi); parts.push(part); bytes += part.length; }
            pos += chunk.value.length;
          }
        } finally { await reader.cancel().catch(() => {}); }
        if (bytes !== r.length) throw Error('文件大小与快照不一致，请刷新工作区');
        return new Blob(parts);
      }, { timeout: 45000, signal: ctx.signal });
    }
    const body = await new Promise((resolve, reject) => { const f = new FileReader(); f.onload = () => resolve(String(f.result).split(',')[1] || ''); f.onerror = () => reject(Error('无法编码预览资源')); f.readAsDataURL(blob); });
    return { ...meta, body };
  },
};
