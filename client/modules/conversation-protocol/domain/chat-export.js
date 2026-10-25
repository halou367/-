// 导出当前对话：完整内容（正文 / 思考 / 工具调用含 bash 命令、stdout、stderr、退出码 / 附件 / 错误）→ Markdown，存到用户选择的文件夹
const ChatExport = {
  busy: false,
  // 代码块围栏要比内容里最长的连续反引号还长，否则内容里的 ``` 会把块截断
  fence(text, lang = '') {
    const s = String(text ?? ''), n = Math.max(3, ...[...s.matchAll(/`+/g)].map(m => m[0].length + 1));
    const f = '`'.repeat(n); return f + lang + '\n' + s.replace(/\n$/, '') + '\n' + f;
  },
  when(m) {
    const v = m?.createdAt || m?.created_at || m?.timestamp || m?.at || m?._sentAt || m?.metadata?.timing?.startedAt || m?._finishedAt || m?.metadata?.timing?.completedAt || (typeof idTime === 'function' ? idTime(m?.id) : 0);
    if (!v) return '';
    const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v); if (isNaN(d)) return '';
    const p = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },
  dur(m) {
    const t0 = Number(m?.metadata?.timing?.startedAt || 0), t1 = Number(m?.metadata?.timing?.completedAt || m?._finishedAt || 0);
    if (!(t0 > 0 && t1 > t0 && t1 - t0 < 86400e3)) return '';
    return ((t1 - t0) / 1000).toFixed(1) + 's';
  },
  resolveTitle(chat) {
    const sid = chat?.sid, row = typeof History !== 'undefined' ? History.byId?.(sid) : null, mi = typeof Models !== 'undefined' ? Models.get?.(sid) : null;
    const synced = (typeof Titles !== 'undefined' && typeof Titles.view === 'function') ? Titles.view(sid, row?.title || chat?.title, row?.localTitle) : '';
    return synced || row?.localTitle || row?.title || chat?.title || mi?.name || '对话';
  },
  quote(text) { return String(text ?? '').replace(/\n$/, '').split('\n').map(l => '> ' + l).join('\n'); },
  json(v) { if (typeof v === 'string') return v; try { return JSON.stringify(v, null, 2); } catch { return String(v); } },
  toolInput(p) { return p.input ?? (p.inputText ? (() => { try { return JSON.parse(p.inputText); } catch { return p.inputText; } })() : undefined); },
  isShell(name) { return /^(bash|shell|sh|run_command|run_shell|execute_command|terminal|exec|command)$/i.test(name); },
  tool(p) {
    const name = p.toolName || String(p.type || '').replace(/^tool-/, '') || '工具';
    const inp = this.toolInput(p), out = [], o = p.output;
    const st = p.state === 'output-available' ? (o?.exit_code != null && o.exit_code !== 0 ? '失败' : '完成') : p.state === 'output-error' ? '出错' : p.state === 'output-denied' ? '已拒绝' : '未完成';
    out.push(`#### 🔧 ${name} · ${st}`);
    if (inp !== undefined) {
      const cmd = inp && typeof inp === 'object' ? inp.command ?? inp.cmd ?? inp.script : null;
      if (typeof cmd === 'string' && this.isShell(name)) {
        out.push(this.fence(cmd, 'bash'));
        const rest = { ...inp }; delete rest.command; delete rest.cmd; delete rest.script;
        if (Object.keys(rest).length) out.push('参数：', this.fence(this.json(rest), 'json'));
      } else if (inp && typeof inp === 'object' && typeof inp.content === 'string' && (inp.path || inp.file_path)) {
        // 写文件：路径 + 文件内容
        const fp = inp.path || inp.file_path, ext = (String(fp).match(/\.([\w]+)$/) || [])[1] || '';
        const rest = { ...inp }; delete rest.content;
        out.push('参数：', this.fence(this.json(rest), 'json'), '内容：', this.fence(inp.content, ext));
      } else out.push('输入：', this.fence(this.json(inp), typeof inp === 'string' ? '' : 'json'));
    }
    if (o !== undefined) {
      if (o && typeof o === 'object' && ('stdout' in o || 'stderr' in o)) {
        if (o.stdout) out.push('stdout：', this.fence(o.stdout, 'text'));
        if (o.stderr) out.push('stderr：', this.fence(o.stderr, 'text'));
        const meta = [o.exit_code != null ? 'exit ' + o.exit_code : '', o.status || '', o.duration_ms != null ? (o.duration_ms / 1000).toFixed(1) + 's' : '', o.stdout_truncated || o.stderr_truncated ? '输出已被截断' : ''].filter(Boolean);
        if (meta.length) out.push('`' + meta.join(' · ') + '`');
        const rest = { ...o }; for (const k of ['stdout', 'stderr', 'exit_code', 'status', 'duration_ms', 'stdout_truncated', 'stderr_truncated']) delete rest[k];
        if (Object.keys(rest).length) out.push('其他输出：', this.fence(this.json(rest), 'json'));
      } else out.push('输出：', this.fence(this.json(o), typeof o === 'string' ? 'text' : 'json'));
    }
    if (p.errorText) out.push('错误：', this.fence(p.errorText, 'text'));
    return out.join('\n\n');
  },
  part(p) {
    if (!p || typeof p !== 'object') return '';
    const t = String(p.type || '');
    if (t === 'text') return String(p.text || '').trim() ? String(p.text) : '';
    if (t === 'reasoning') return String(p.text || '').trim() ? '> 💭 **思考**\n>\n' + this.quote(p.text) : '> 💭 **思考**（闭源隐藏思考已完成）';
    if (p.toolCallId || t.startsWith('tool-') || t === 'dynamic-tool') return this.tool(p);
    if (t === 'file') { const n = p.filename || p.name || p.mediaType || '附件'; const u = p.url && !/^data:/.test(p.url) ? p.url : ''; return `📎 附件：${u ? `[${n}](${u})` : n}${p.mediaType ? ' `' + p.mediaType + '`' : ''}`; }
    if (t === 'source-url') return `🔗 来源：[${p.title || p.url}](${p.url})`;
    if (t === 'source-document') return `📄 来源文档：${p.title || p.filename || ''}`;
    if (t === 'error') return '> ⚠️ **错误**\n>\n' + this.quote(p.errorText || p.text || this.json(p.error ?? p));
    if (t === 'step-start') return '';
    if (t === 'data-compaction' && p.data?.summary) return '> 🗜️ **上下文压缩摘要**\n>\n' + this.quote(p.data.summary);
    if (t.startsWith('data-')) return '';   // 内部状态（进度条之类），不是对话内容
    return `<!-- 未识别的内容类型：${t} -->\n` + this.fence(this.json(p), 'json');
  },
  build(chat) {
    const sid = chat.sid, title = this.resolveTitle(chat), mi = Models.get?.(sid);
    const msgs = chat.messages || [], L = [];
    let tools = 0; for (const m of msgs) for (const p of m.parts || []) if (p?.toolCallId) tools++;
    L.push('# ' + String(title).replace(/\n/g, ' '), '');
    L.push('| 项目 | 内容 |', '|---|---|');
    L.push(`| 对话 ID | \`${sid}\` |`);
    if (mi?.name) L.push(`| 模型 | ${String(mi.name).replace(/\|/g, '\\|')}${mi.guess ? '（识别结果）' : ''} |`);
    L.push(`| 消息 | ${msgs.length} 条（工具调用 ${tools} 次） |`);
    if (chat.hasMore) L.push('| 注意 | 服务器还有更早的消息没读到，这份导出不完整 |');
    L.push(`| 导出时间 | ${this.when({ at: Date.now() })} |`, `| 导出工具 | Brana AI v${VERSION} |`, '');
    msgs.forEach((m, i) => {
      const who = m.role === 'user' ? '👤 用户' : m.role === 'assistant' ? '🤖 助手' : '⚙️ ' + (m.role || '系统');
      const at = this.when(m), dStr = m.role === 'assistant' ? this.dur(m) : '';
      const model = m.role === 'assistant' ? (m._turnModelLabel || m.metadata?.model || m.model || mi?.name || '') : '';
      L.push('---', '', `## ${who} · #${i + 1}${model ? ' · ' + model : ''}${at ? ' · ' + at : ''}${dStr ? ' · 耗时 ' + dStr : ''}`, '');
      const rawBody = (m.parts || []).map(p => this.part(p)).filter(Boolean);
      const body = [];
      for (const item of rawBody) {
        if (item === '> 💭 **思考**（闭源隐藏思考已完成）' && body.at(-1) === item) continue;
        body.push(item);
      }
      if (m.role === 'assistant' && !(m.parts || []).some(p => p?.type === 'reasoning') && (Number(m._fmt?.rN) > 0 || m._sseMeta?.hasReasoning)) {
        body.unshift(`> 💭 **思考**（闭源隐藏思考 · ${Number(m._fmt?.rN) || 1} 段）`);
      }
      if (!body.length && typeof m.content === 'string' && m.content.trim()) body.push(m.content);
      if (m.failed) body.push('> ⚠️ 这条消息发送失败');
      L.push(body.length ? body.join('\n\n') : '*（空）*', '');
    });
    return L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  },
  name(chat) {
    const t = String(this.resolveTitle(chat) || 'chat').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').trim().slice(0, 60) || 'chat';
    const d = new Date(), p = x => String(x).padStart(2, '0');
    return `${t}-${chat.sid.slice(0, 8)}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.md`;
  },
  // 桌面客户端：系统「另存为」窗口（自己选文件夹）；浏览器：文件选择器；安卓：系统保存
  async save(text, name) {
    if (typeof Host.saveAs === 'function') return Host.saveAs(name, 'text/markdown', text);
    if (Host.platform === 'android') return FileExport.write(text, name, 'text/markdown');
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }] });
        const w = await fh.createWritable(); await w.write(new Blob([text], { type: 'text/markdown' })); await w.close(); return { ok: true, path: fh.name };
      } catch (e) { if (e?.name === 'AbortError') return { canceled: true }; }
    }
    saveBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), name); return { ok: true, path: '浏览器下载目录 / ' + name, blob: true };
  },
  async run(chat) {
    if (!chat?.sid) { toast('先打开一个对话'); return; }
    if (this.busy) { toast('正在导出，请稍候'); return; }
    this.busy = true;
    try {
      if (chat.loaded && !chat.busy && typeof chat.reconcile === 'function') {
        await Promise.race([chat.reconcile(0), new Promise(res => setTimeout(res, 2500))]).catch(() => {});
      }
      if (chat.hasMore && typeof chat.loadAll === 'function') { toast('正在读取更早的消息…'); await chat.loadAll(); }
      const text = this.build(chat), r = await this.save(text, this.name(chat));
      if (r?.canceled) toast('已取消导出');
      else if (r?.error) toast('导出失败：' + r.error, 'err');
      else { toast('已导出：' + (r?.path || this.name(chat)) + (chat.hasMore ? '（更早的消息没读全）' : '')) }
      return r;
    } catch (e) { toast('导出失败：' + describe(e), 'err'); }
    finally { this.busy = false; }
  }
};
