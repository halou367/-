const _mdPartCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _toolInputCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

const R = {
  text(p, streaming, m = null, chat = null, keyPrefix = 'txt') {
    const htmlSegs = R.extractInlineHtmlSegments(p?.text, streaming);
    if (htmlSegs) {
      const canSeg = (streaming || keyPrefix !== 'txt') && typeof Seg !== 'undefined' && !Seg.off;
      const sid = m?.id || 'eval';
      const wrap = canSeg ? Seg.box(sid, keyPrefix + ':flow', () => h('div', { class: 'inline-html-flow' })) : h('div', { class: 'inline-html-flow' });
      const kids = [];
      htmlSegs.forEach((hs, hi) => {
        if (hs.type === 'html') {
          const ihKey = keyPrefix + ':ih:' + hs.idx;
          const hSig = (hs.running ? 'R' : 'D') + ':' + hs.code.length + ':' + hs.code.slice(-24);
          kids.push(canSeg ? Seg.use(sid, ihKey, hSig, () => R.inlineHtmlCard(hs, ihKey, m, chat)) : R.inlineHtmlCard(hs, ihKey, m, chat));
        } else if (hs.text && hs.text.trim()) {
          const isTailStream = Boolean(streaming && hi === htmlSegs.length - 1);
          if (canSeg && typeof StreamMD !== 'undefined') {
            const box = Seg.box(sid, keyPrefix + ':m:' + hi, () => h('div', { class: 'md prose', lang: '', translate: 'no' }));
            kids.push(StreamMD.paint(box, hs.text, isTailStream));
          } else {
            const d = h('div', { class: 'md prose' + (isTailStream ? ' streaming' : ''), lang: '', translate: 'no' });
            d.innerHTML = MD.render(hs.text);
            kids.push(d);
          }
        }
      });
      if (typeof patchKids === 'function') patchKids(wrap, kids);
      else wrap.replaceChildren(...kids);
      return wrap;
    }
    const rawText = String(p?.text || '');
    if ((streaming || keyPrefix !== 'txt') && typeof StreamMD !== 'undefined' && typeof Seg !== 'undefined' && !Seg.off && (m?.id || keyPrefix !== 'txt')) {
      const box = Seg.box(m?.id || 'eval', keyPrefix, () => h('div', { class: 'md prose', lang: '', translate: 'no' }));
      return StreamMD.paint(box, rawText, Boolean(streaming));
    }
    if (p && typeof p === 'object') {
      if (p._mdEl !== undefined) delete p._mdEl;
      if (p._mdSrc !== undefined) delete p._mdSrc;
    }
    const cachedMd = (!streaming && p && typeof p === 'object' && _mdPartCache) ? _mdPartCache.get(p) : null;
    if (cachedMd && cachedMd.src === rawText && cachedMd.el && cachedMd.el.nodeType === 1 && !cachedMd.el.isConnected) {
      return cachedMd.el;
    }
    const d = h('div', { class: 'md prose' + (streaming ? ' streaming' : ''), lang: '', translate: 'no' });
    d.innerHTML = MD.render(rawText);
    if (!streaming && p && typeof p === 'object' && _mdPartCache) {
      _mdPartCache.set(p, { src: rawText, el: d });
    }
    return d;
  },
  reasoning(p, open, key, labels=null, live=true) {
    if (!p.text && p.state === 'done') return null;
    const openThink = ThinkingStatus.visible(p);
    const defOpen = openThink ? false : open;
    if (key) open = R.openOf(key, defOpen); else open = defOpen;
    let lbl = (labels?.of ? labels.of(p, live && p.state === 'streaming') : labels?.[live && p.state === 'streaming' ? 'live' : 'done']) || ThinkingStatus.label(null, null, live && p.state === 'streaming', undefined, p);
    if (openThink) { lbl = String(lbl || '').replace(/^闭源思考/, '开源思考'); if (!/^开源/.test(lbl)) lbl = '开源思考 · ' + lbl; }
    const d = h('details', { class: 'reason not-prose' + (openThink ? ' open-think' : ''), 'data-state': open ? 'open' : 'closed', open: open || null, title: '有可见思考文字 = 开源模型；思考为空（只有「…」）= 闭源模型。已从运行记录确认型号时以型号为准。' }, h('summary', { role: 'button', 'aria-expanded': open ? 'true' : 'false', 'data-state': open ? 'open' : 'closed' }, icon('brain'), openThink ? h('span', { class: 'rs-open-badge' }, '开源思考') : null, h('span', { class: 'rs-t' }, lbl)));
    if (key) R.keep(d, key);
    const b = h('div', { class: 'md prose muted', lang: '', translate: 'no' });
    let mdBuilt = false;
    const ensureMd = () => { if (mdBuilt) return; mdBuilt = true; b.innerHTML = MD.render(p.text || '…'); };
    if (open || (live && p.state === 'streaming')) ensureMd();
    else d.addEventListener('toggle', () => { if (d.open) ensureMd(); });
    d.append(b); return d;
  },
  tool(p) {
    const name = p.toolName || String(p.type).replace(/^tool-/, '');
    const inp = R.tinput(p);
    const st = R.tstate(p);
    const lab = { ok: '完成', warn: '注意', bad: '失败', run: p.state === 'input-streaming' ? '准备中' : '执行中' }[st] || '完成';
    const sum = typeof inp === 'object' && inp ? (inp.command || inp.path || inp.url || inp.query || inp.file_path || Object.values(inp).find(v => typeof v === 'string') || '') : String(inp || '');
    const d = h('details', { class: 'tool ' + st }, h('summary', {}, icon('tool'), h('b', {}, name), h('code', { class: 'tool-sum' }, String(sum).split('\n')[0].slice(0, 140)), h('span', { class: 'tool-st' }, st === 'run' ? h('i', { class: 'spin' }) : null, lab)));
    const body = h('div', { class: 'tool-b' });
    if (inp !== undefined) body.append(h('div', { class: 'tool-l' }, '输入'), h('pre', {}, typeof inp === 'string' ? inp : JSON.stringify(inp, null, 2)));
    if (p.output !== undefined) {
      const o = p.output;
      if (o && typeof o === 'object' && ('stdout' in o || 'stderr' in o)) {
        if (o.stdout) body.append(h('div', { class: 'tool-l' }, 'stdout'), h('pre', {}, o.stdout));
        if (o.stderr) body.append(h('div', { class: 'tool-l' }, 'stderr'), h('pre', { class: 'err' }, o.stderr));
        body.append(h('div', { class: 'tool-l dim' }, `exit ${o.exit_code ?? '—'} · ${o.status || ''}${o.duration_ms != null ? ' · ' + (o.duration_ms / 1000).toFixed(1) + 's' : ''}`));
      } else body.append(h('div', { class: 'tool-l' }, '输出'), h('pre', {}, typeof o === 'string' ? o : JSON.stringify(o, null, 2)));
    }
    if (p.errorText) body.append(h('div', { class: 'tool-l' }, '错误'), h('pre', { class: 'err' }, p.errorText));
    d.append(body); return d;
  },
  // ---- 工具调用：参考 Brana 官方，连续的调用合并成可折叠的一组，写文件单独显示成文件卡片 ----
  tname(p) { return p.toolName || String(p.type).replace(/^tool-/, ''); },
  parsePartialStr(raw, key) {
    const m = new RegExp('"' + key + '"\\s*:\\s*"').exec(raw);
    if (!m) return undefined;
    let i = m.index + m[0].length, out = '';
    while (i < raw.length) {
      const ch = raw[i++];
      if (ch === '"') break;
      if (ch === '\\') {
        if (i >= raw.length) break;
        const esc = raw[i++];
        if (esc === 'n') out += '\n';
        else if (esc === 'r') out += '\r';
        else if (esc === 't') out += '\t';
        else if (esc === 'b') out += '\b';
        else if (esc === 'f') out += '\f';
        else if (esc === 'u' && i + 4 <= raw.length) {
          const hex = raw.slice(i, i + 4);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 4; }
          else out += 'u';
        } else out += esc;
      } else out += ch;
    }
    return out;
  },
  parsePartialInput(raw) {
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch {}
    const out = {};
    for (const k of ['path', 'file_path', 'content', 'text', 'command', 'url', 'query', 'pattern', 'old_text', 'new_text']) {
      const v = R.parsePartialStr(raw, k);
      if (v !== undefined) out[k] = v;
    }
    return Object.keys(out).length ? out : raw;
  },
  tinput(p) {
    if (!p) return undefined;
    if (p._parsedInputRaw !== undefined) delete p._parsedInputRaw;
    if (p._parsedInputVal !== undefined) delete p._parsedInputVal;
    if (p.input != null) return p.input;
    const raw = p.inputText;
    if (!raw) return undefined;
    const cached = _toolInputCache ? _toolInputCache.get(p) : null;
    if (cached && cached.raw === raw) return cached.val;
    const val = R.parsePartialInput(raw);
    if (_toolInputCache) _toolInputCache.set(p, { raw, val });
    return val;
  },
  normPath(pth) { return String(pth || '').replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, ''); },
  _fileTextCache: new Map(),
  _chatWriteStamp(chat) {
    if (!chat || !Array.isArray(chat.messages)) return '';
    const msgs = chat.messages, L = msgs.length, last = L ? msgs[L - 1] : null;
    const lp = last?.parts, lpl = Array.isArray(lp) ? lp.length : 0, tailP = lpl ? lp[lpl - 1] : null;
    const tailLen = (tailP?.inputText?.length || 0) + (tailP?.text?.length || 0) + (tailP?.state || '');
    return L + ':' + (last?.v || 0) + ':' + lpl + ':' + tailLen + ':' + (chat.busy ? 1 : 0);
  },
  latestFileText(sid, targetPath, fallbackPart) {
    const norm = R.normPath(targetPath);
    const chat = (sid && typeof Chats !== 'undefined' && Chats.get?.(sid)) || (typeof Chats !== 'undefined' ? Chats.cur : null);
    if (chat && norm) {
      const cSid = chat.sid || sid || '_cur', stamp = R._chatWriteStamp(chat);
      let entry = R._fileTextCache.get(cSid);
      if (!entry || entry.stamp !== stamp) {
        const files = new Map();
        for (const m of chat.messages || []) {
          for (const p of m.parts || []) {
            if (!p || !(String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool')) continue;
            const n = R.tname(p).toLowerCase(), inp = R.tinput(p);
            if (!inp || typeof inp !== 'object') continue;
            const pth = R.normPath(inp.path || inp.file_path || '');
            if (!pth) continue;
            if (/^(write_?file|create_?file|write)$/.test(n)) {
              const c = typeof inp.content === 'string' ? inp.content : typeof inp.text === 'string' ? inp.text : '';
              if (c || !files.has(pth)) files.set(pth, c);
            } else if (files.has(pth) && /^(edit_file|str_replace|edit)$/.test(n)) {
              const oldT = inp.old_text ?? inp.old_str, newT = inp.new_text ?? inp.new_str, cur = files.get(pth) || '';
              if (typeof oldT === 'string' && typeof newT === 'string' && oldT && cur.includes(oldT)) files.set(pth, cur.replace(oldT, newT));
            }
          }
        }
        entry = { stamp, files };
        if (R._fileTextCache.size >= 40) R._fileTextCache.delete(R._fileTextCache.keys().next().value);
        R._fileTextCache.set(cSid, entry);
      }
      const hit = entry.files.get(norm);
      if (hit) return hit;
    }
    let text = '', found = false;
    for (const m of chat?.messages || []) {
      for (const p of m.parts || []) {
        if (!p || !(String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool')) continue;
        const n = R.tname(p).toLowerCase(), inp = R.tinput(p);
        if (!inp || typeof inp !== 'object') continue;
        const pth = R.normPath(inp.path || inp.file_path || '');
        if (!pth || (norm && pth !== norm)) continue;
        if (/^(write_?file|create_?file|write)$/.test(n)) {
          const c = typeof inp.content === 'string' ? inp.content : typeof inp.text === 'string' ? inp.text : '';
          if (c || !found) { text = c; found = true; }
        } else if (found && /^(edit_file|str_replace|edit)$/.test(n)) {
          const oldT = inp.old_text ?? inp.old_str, newT = inp.new_text ?? inp.new_str;
          if (typeof oldT === 'string' && typeof newT === 'string' && oldT && text.includes(oldT)) text = text.replace(oldT, newT);
        }
      }
    }
    if (found && text) return text;
    if (fallbackPart) {
      const i = R.tinput(fallbackPart) || {};
      return typeof i.content === 'string' ? i.content : typeof i.text === 'string' ? i.text : text;
    }
    return text;
  },
  tstate(p) {
    if (p?.state === 'output-available') {
      if (p.preliminary) return p._superseded ? 'warn' : 'run';
      if (CmdTranslate.isTimeout(p)) return 'warn';
      if (CmdTranslate.benignExit(p)) return 'ok';
      return (p.output?.exit_code != null && p.output.exit_code !== 0) ? 'bad' : 'ok';
    }
    if (p?._superseded || CmdTranslate.isTimeout(p)) return 'warn';
    return (p?.state === 'output-error' || p?.state === 'output-denied') ? 'bad' : 'run';
  },
  isWrite(p) { const n = R.tname(p).toLowerCase(), i = R.tinput(p); return /^(write_?file|create_?file|write)$/.test(n) && i && typeof i === 'object' && (i.path || i.file_path); },
  tlabel(n) { const m = { bash: 'Bash', shell: 'Bash', run_command: 'Bash', read_file: 'Read', edit_file: 'Edit', str_replace: 'Edit', write_file: 'Write', web_search: 'Search', fetch_page: 'Fetch', fetch: 'Fetch', list_files: 'List', glob: 'Glob', grep: 'Grep', image_search: 'Image search', generate_image: 'Generate image', generate_speech: 'Speech', add_voice: 'Voice', present_file: 'Present', start_process: 'Start process', stop_process: 'Stop process', get_process_output: 'Process output', ask_user: 'Ask', propose_plan: 'Plan', python: 'Python', code_interpreter: 'Python' }; return m[n.toLowerCase()] || n.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()); },
  toolStarts: new Map(),
  toolDurs: new Map(),
  toolEnds: new Map(),
  nudgedTools: new Set(),
  fmtClockSec(ts) {
    const dt = new Date(Number(ts) || Date.now());
    const p2 = v => String(v).padStart(2, '0');
    return p2(dt.getHours()) + ':' + p2(dt.getMinutes()) + ':' + p2(dt.getSeconds());
  },
  fmtDurMs(ms, live = false) {
    if (ms == null || !Number.isFinite(+ms) || +ms < 0) return '';
    ms = +ms;
    if (ms < 1000) return live ? '⏱ 00:00' : Math.round(ms) + 'ms';
    const sec = Math.floor(ms / 1000), m = Math.floor(sec / 60), s = sec % 60, h = Math.floor(m / 60), mm = m % 60;
    const p2 = n => String(n).padStart(2, '0');
    if (live) return '⏱ ' + (h > 0 ? h + ':' + p2(mm) + ':' + p2(s) : p2(m) + ':' + p2(s));
    return h > 0 ? h + 'h ' + mm + 'm' : m > 0 ? m + 'm ' + s + 's' : s + 's';
  },
  tdur(p, tid = '') {
    const o = p?.output;
    let ms = o && typeof o === 'object' ? (o.duration_ms ?? o.durationMs) : null;
    if (ms == null && p?._durMs != null) ms = p._durMs;
    if (ms == null && tid && R.toolDurs.has(tid)) ms = R.toolDurs.get(tid);
    return R.fmtDurMs(ms, false);
  },
  chatOfEl(el) {
    const sid = el?.closest?.('[data-wsid]')?.getAttribute('data-wsid') || (typeof UI !== 'undefined' && UI.els?.chat?.sid) || (typeof Tabs !== 'undefined' && Tabs.cur?.sid) || null;
    if (sid && typeof Chats !== 'undefined' && typeof Chats.get === 'function') {
      const ch = Chats.get(sid);
      if (ch) return ch;
    }
    if (typeof UI !== 'undefined' && UI.els?.chat) return UI.els.chat;
    return (typeof Tabs !== 'undefined' && Tabs.cur && ('busy' in Tabs.cur || 'live' in Tabs.cur || 'streaming' in Tabs.cur)) ? Tabs.cur : null;
  },
  async nudgeBash(el, p, tid, why = 'manual') {
    const c = R.chatOfEl(el);
    const curP = el?.__curPart || p;
    if (!c) return;
    if (why === 'timeout' && (!c.busy || !c.live || R.tstate(curP) !== 'run' || R.nudgedTools.has(tid))) return;
    if (tid) R.nudgedTools.add(tid);
    toast(why === 'timeout' ? '检测到 Bash 执行满 1 小时卡住，正在自动暂停并发送「继续」…' : '正在暂停当前卡住的回合，并自动发送「继续」…', 'ok');
    try {
      if (c.busy && typeof c.stop === 'function') await c.stop();
    } catch {}
    setTimeout(() => {
      try {
        if (why === 'timeout') {
          if (typeof c.send === 'function' && !c.busy) void c.send('继续', { autoContinue: true });
        } else if (typeof Drafts !== 'undefined' && typeof Drafts.sendNow === 'function') {
          void Drafts.sendNow(c, '继续', []);
        } else if (typeof c.send === 'function') {
          void c.send('继续', {});
        }
      } catch {}
    }, 650);
  },
  tsum(inp) { return typeof inp === 'object' && inp ? (inp.command || inp.path || inp.file_path || inp.url || inp.query || inp.pattern || Object.values(inp).find(v => typeof v === 'string') || '') : String(inp || ''); },
  openOf(key, def) { return UI.opens.has(key) ? UI.opens.get(key) : def; },
  // 只记住用户自己点开 / 收起的状态；进行中自动展开的不记（否则跑完以后一直保持展开，不会自动收起）
  extPart(p, key) {
    const n = R.tname(p);
    return { ...p, type: String(p?.type || '').startsWith('tool-') ? p.type : 'tool-' + n, toolCallId: p?.toolCallId || p?.id || String(key || '') };
  },
  keep(el, key) {
    const syncAria = () => {
      const sm = el.querySelector(':scope > summary');
      const st = el.open ? 'open' : 'closed';
      el.dataset.state = st;
      if (sm) { sm.setAttribute('role', 'button'); sm.setAttribute('aria-expanded', el.open ? 'true' : 'false'); sm.dataset.state = st; }
    };
    syncAria();
    el.addEventListener('click', e => { const sm = e.target.closest('summary'); if (sm && sm.parentElement === el) el.__user = true; });
    el.addEventListener('toggle', () => { syncAria(); if (el.__user) { el.__user = false; UI.opens.set(key, el.open); } });
    return el;
  },
  // 原生工具的专门展示（编辑 = 差异、搜索 = 结果列表、文件类 = 可点开的路径），其余走通用的输入 / 输出
  fpathEl(pth) { const short = String(pth).replace(/^\/home\/user\//, ''); return h('code', { class: 'fpath', 'data-fpath': short, title: '在工作区打开' }, short); },
  toolSpecial(p) {
    const n = R.tname(p).toLowerCase(), inp = R.tinput(p), o = p.output, box = h('div', { class: 'tool-b' });
    const I = inp && typeof inp === 'object' ? inp : {};
    const err = () => { if (p.errorText) box.append(h('pre', { class: 'err' }, p.errorText)); return box; };
    const outText = () => o === undefined ? '' : typeof o === 'string' ? o : o && typeof o === 'object' && typeof (o.content ?? o.text ?? o.result) === 'string' ? (o.content ?? o.text ?? o.result) : JSON.stringify(o, null, 2);
    if (/^(edit_file|str_replace|edit)$/.test(n) && (I.old_text != null || I.new_text != null || I.old_str != null)) {
      const pth = I.path || I.file_path; if (pth) box.append(h('div', { class: 'tool-l' }, R.fpathEl(pth)));
      const oldT = String(I.old_text ?? I.old_str ?? ''), newT = String(I.new_text ?? I.new_str ?? '');
      box.append(h('pre', { class: 'tdiff' }, ...oldT.split('\n').map(l => h('span', { class: 'd-del' }, '- ' + l)), ...newT.split('\n').map(l => h('span', { class: 'd-add' }, '+ ' + l))));
      if (o !== undefined && typeof o === 'string' && o.length < 400) box.append(h('div', { class: 'tool-l dim' }, o));
      return err();
    }
    if (/^(web_search|search)$/.test(n)) {
      if (I.query) box.append(h('div', { class: 'tool-l' }, '搜索：' + I.query));
      const arr = Array.isArray(o) ? o : Array.isArray(o?.results) ? o.results : Array.isArray(o?.items) ? o.items : null;
      if (arr) box.append(h('div', { class: 'tsearch' }, ...arr.slice(0, 20).map(r => h('a', { href: r.url || r.link || '#', target: '_blank', title: r.url || '' }, h('b', {}, r.title || r.url || '结果'), h('small', {}, String(r.url || '').replace(/^https?:\/\//, '').slice(0, 80)), r.content || r.snippet ? h('span', {}, String(r.content || r.snippet).slice(0, 220)) : null))));
      else if (o !== undefined) box.append(h('pre', {}, outText().slice(0, 20000)));
      return err();
    }
    if (/^(fetch_page|fetch)$/.test(n)) {
      if (I.url) box.append(h('div', { class: 'tool-l' }, h('a', { href: I.url, target: '_blank' }, I.url)));
      if (o !== undefined) box.append(h('pre', {}, outText().slice(0, 20000)));
      return err();
    }
    if (/^(read_file|present_file|generate_image|generate_speech|image_search|write_file)$/.test(n)) {
      const paths = new Set(); const pth = I.path || I.file_path; if (pth) paths.add(pth);
      const scan = v => { if (typeof v === 'string') { for (const m of v.matchAll(/(\/home\/user\/[^\s"',;)]+|~\/[^\s"',;)]+)/g)) paths.add(m[1]); } else if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') Object.values(v).forEach(scan); };
      scan(o);
      if (paths.size) box.append(h('div', { class: 'tool-l tpaths' }, ...[...paths].slice(0, 12).map(x => R.fpathEl(x))));
      const rest = { ...I }; delete rest.path; delete rest.file_path;
      if (Object.keys(rest).length) box.append(h('pre', {}, JSON.stringify(rest, null, 2).slice(0, 4000)));
      if (o !== undefined && n === 'read_file') box.append(h('pre', {}, outText().slice(0, 40000)));
      else if (o !== undefined && !paths.size) box.append(h('pre', {}, outText().slice(0, 8000)));
      return err();
    }
    return null;
  },
  toolBody(p) {
    const sp = R.toolSpecial(p); if (sp) return sp;
    const inp = R.tinput(p), body = h('div', { class: 'tool-b' });
    if (inp !== undefined) { const cmd = typeof inp === 'object' && inp && typeof inp.command === 'string' ? inp.command : null; body.append(h('pre', { class: cmd ? 'cmd' : '' }, cmd ? '$ ' + cmd : typeof inp === 'string' ? inp : JSON.stringify(inp, null, 2))); }
    if (p.output !== undefined) {
      const o = p.output;
      if (o && typeof o === 'object' && ('stdout' in o || 'stderr' in o)) {
        if (o.stdout) body.append(h('pre', {}, o.stdout));
        if (o.stderr) body.append(h('pre', { class: 'err' }, o.stderr));
        body.append(h('div', { class: 'tool-l dim' }, `exit ${o.exit_code ?? '—'}${o.duration_ms != null ? ' · ' + R.tdur(p) : ''}`));
      } else body.append(h('pre', {}, typeof o === 'string' ? o : JSON.stringify(o, null, 2)));
    }
    if (p.errorText) body.append(h('pre', { class: 'err' }, p.errorText));
    return body;
  },
  toolRow(p, key, opts = null) {
    const rawSt = R.tstate(p), n = R.tname(p), inp = R.tinput(p);
    const chatCur = R.chatOfEl(null);
    const chatCurActive = Boolean(chatCur && (typeof Hitl !== 'undefined' && typeof Hitl.blocked === 'function' ? Hitl.blocked(chatCur) : (chatCur.busy || chatCur.live)));
    const isStaleToolRun = rawSt === 'run' && !Hitl.name(p) && chatCur && (!chatCurActive || (chatCur.live && Array.isArray(chatCur.live.parts) && !chatCur.live.parts.includes(p)));
    const st = isStaleToolRun ? 'warn' : rawSt;
    const tid = String(p?.toolCallId || p?.id || key || ''), isBash = /^(bash|shell|run_command)$/i.test(n);
    if (st === 'run' || opts?.showAppearTime) {
      if (!R.toolStarts.has(tid)) R.toolStarts.set(tid, Number(p?._startAt) > 0 ? Number(p._startAt) : Date.now());
      if (R.toolStarts.size > 600) R.toolStarts.delete(R.toolStarts.keys().next().value);
    }
    if (st !== 'run' && R.toolStarts.has(tid) && !R.toolDurs.has(tid)) {
      R.toolDurs.set(tid, Math.max(0, Date.now() - R.toolStarts.get(tid)));
      if (R.toolDurs.size > 600) R.toolDurs.delete(R.toolDurs.keys().next().value);
    }
    const startAt = Number(p?._startAt) > 0 ? Number(p._startAt) : (R.toolStarts.get(tid) || Date.now());
    if (opts?.showAppearTime && p && typeof p === 'object' && !p._startAt) p._startAt = startAt;
    const durSpan = h('span', { class: 'tr-dur' + (st === 'run' ? ' is-live' : '') }, st === 'run' ? R.fmtDurMs(Date.now() - startAt, true) : R.tdur(p, tid));
    let d = null;
    const nudgeBtn = (st === 'run' && isBash) ? h('button', {
      type: 'button',
      class: 'tr-nudge',
      title: '暂停当前卡住的 Bash 回合，并自动发送「继续」推进后续执行',
      onclick: e => { e.preventDefault(); e.stopPropagation(); void R.nudgeBash(d, p, tid, 'manual'); }
    }, '⏹ 中断并继续') : null;
    const routeStartTag = p?._routeStart
      ? h('span', {
          class: 'tr-route-tag',
          title: p._routeStart.title || (p._routeStart.fromLabel ? `路由切换：${p._routeStart.fromLabel} → ${p._routeStart.toLabel}` : `路由提示：对话疑似 ${p._routeStart.toLabel}`),
        }, p._routeStart.fromLabel ? `⚠️ 路由切换：${p._routeStart.fromLabel} → ${p._routeStart.toLabel}` : `⚠️ 路由提示：对话疑似 ${p._routeStart.toLabel}`)
      : null;
    if (st !== 'run' && opts?.showAppearTime) {
      if (!R.toolEnds.has(tid)) {
        const initEnd = Number(p?._endAt) > 0 ? Number(p._endAt) : Date.now();
        R.toolEnds.set(tid, initEnd);
        if (R.toolEnds.size > 600) R.toolEnds.delete(R.toolEnds.keys().next().value);
      }
      if (p && typeof p === 'object' && !p._endAt) p._endAt = R.toolEnds.get(tid);
    }
    const isTurnActive = Boolean(opts?.live || st === 'run' || chatCurActive);
    const fmtSec = ms => {
      const v = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
      if (v < 60) return v + 's';
      const m = Math.floor(v / 60), sc = v % 60, hr = Math.floor(m / 60), mm = m % 60;
      return hr > 0 ? (hr + 'h ' + mm + 'm ' + sc + 's') : (m + 'm ' + sc + 's');
    };
    const computePhaseInfo = (curPart) => {
      const curSt = R.tstate(curPart);
      if (curSt === 'run') {
        const elap = Math.max(0, Date.now() - startAt);
        return {
          text: '运行 ' + fmtSec(elap),
          tip: '当前命令正在运行中（已运行 ' + fmtSec(elap) + '）',
          mode: 'run',
          elap,
        };
      }
      if (!R.toolEnds.has(tid)) {
        const eTs = Number(curPart?._endAt) > 0 ? Number(curPart._endAt) : Date.now();
        R.toolEnds.set(tid, eTs);
        if (curPart && typeof curPart === 'object' && !curPart._endAt) curPart._endAt = eTs;
      }
      const endAt = Number(curPart?._endAt) > 0 ? Number(curPart._endAt) : (R.toolEnds.get(tid) || Date.now());
      const waitMs = Math.max(0, Date.now() - endAt);
      return {
        text: '等待 ' + fmtSec(waitMs),
        tip: '本条命令已结束，正在等待下一条步骤或回复输出（已等待 ' + fmtSec(waitMs) + '）',
        mode: 'wait',
        elap: waitMs,
      };
    };
    const initPhase = (opts?.showAppearTime && isTurnActive) ? computePhaseInfo(p) : null;
    const appearSpan = initPhase
      ? h('span', {
          class: 'tr-appear-time is-active is-' + initPhase.mode + (initPhase.elap >= 300000 ? ' is-stuck' : initPhase.elap >= 120000 ? ' is-warn' : ''),
          title: initPhase.tip,
        }, initPhase.text)
      : null;
    const stIcon = st === 'run' ? h('i', { class: 'spin' }) : h('span', { class: 'tr-st' + (st === 'warn' ? ' warn' : st === 'bad' ? ' bad' : ''), title: st === 'warn' ? '注意' : null }, st === 'ok' ? '✓' : st === 'warn' ? '!' : '✗');
    const ctChips = CmdTranslate.renderRowChips(p, st);
    const rawCmdTip = (inp && typeof inp === 'object' && (inp.command || inp.path || inp.file_path)) ? String(inp.command || inp.path || inp.file_path) : '';
    const smTitle = rawCmdTip ? ((inp?.cwd ? '（' + inp.cwd + '）\n' : '') + (rawCmdTip.length > 800 ? rawCmdTip.slice(0, 800) + '…' : rawCmdTip)) : null;
    const sm = h('summary', smTitle ? { title: smTitle } : {}, icon('term', 'ti'), h('span', { class: 'min-w-0 tr-main' }, h('span', { class: 'tr-used' }, 'used'), h('b', {}, R.tlabel(n)),
      stIcon,
      durSpan, ctChips, h('code', { class: 'tr-sum' }, String(R.tsum(inp)).split('\n')[0].slice(0, 160))), routeStartTag, nudgeBtn, appearSpan, icon('chev', 'tr-chev'));
    sm.__reactFiber = { memoizedProps: { part: R.extPart(p, key) }, return: null };
    const isOpen = !!R.openOf(key, false);
    d = R.keep(h('details', { class: 'trow ' + st + (isBash ? ' is-bash' : '') + (p?._routeStart ? ' is-route-start' : ''), open: isOpen || null }, sm), key);
    if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; }
    if (d.__appearTm) { clearInterval(d.__appearTm); d.__appearTm = null; }
    d.__curPart = p;
    if (appearSpan && isTurnActive) {
      const mountAppearAt = Date.now();
      const tickAppear = () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (!d.isConnected && Date.now() - mountAppearAt > 3000) { if (d.__appearTm) { clearInterval(d.__appearTm); d.__appearTm = null; } return; }
        const curP = d.__curPart || p;
        const cNow = R.chatOfEl(d);
        const cNowActive = Boolean(cNow && (typeof Hitl !== 'undefined' && typeof Hitl.blocked === 'function' ? Hitl.blocked(cNow) : (cNow.busy || cNow.live)));
        const stillActive = Boolean(cNow ? cNowActive : R.tstate(curP) === 'run');
        if (!stillActive) {
          appearSpan.remove();
          if (d.__appearTm) { clearInterval(d.__appearTm); d.__appearTm = null; }
          return;
        }
        const ph = computePhaseInfo(curP);
        appearSpan.textContent = ph.text;
        appearSpan.title = ph.tip;
        appearSpan.className = 'tr-appear-time is-active is-' + ph.mode + (ph.elap >= 300000 ? ' is-stuck' : ph.elap >= 120000 ? ' is-warn' : '');
      };
      d.__appearTm = setInterval(tickAppear, 1000);
    }
    if (st === 'run') {
      const mountAt = Date.now();
      const timeoutMs = ((typeof Prefs !== 'undefined' && Number(Prefs.bashTimeoutMin) > 0) ? Number(Prefs.bashTimeoutMin) : 60) * 60000;
      const tickDur = () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        const curP = d.__curPart || p;
        const chat = R.chatOfEl(d);
        const chatActive = Boolean(chat && (typeof Hitl !== 'undefined' && typeof Hitl.blocked === 'function' ? Hitl.blocked(chat) : (chat.busy || chat.live)));
        if (!d.isConnected && Date.now() - mountAt > 3000) { if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; } return; }
        if (R.tstate(curP, chat ? chatActive : true) !== 'run' || (chat && !chatActive)) {
          if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; }
          const rawEnd = R.tstate(curP);
          const endSt = rawEnd === 'ok' ? 'ok' : (rawEnd === 'warn' || rawEnd === 'run') ? 'warn' : 'bad';
          d.classList.remove('run', 'is-stuck');
          d.classList.add(endSt);
          const spinEl = sm.querySelector('i.spin');
          if (spinEl) spinEl.replaceWith(h('span', { class: 'tr-st' + (endSt === 'warn' ? ' warn' : endSt === 'bad' ? ' bad' : ''), title: endSt === 'warn' ? '注意' : null }, endSt === 'ok' ? '✓' : endSt === 'warn' ? '!' : '✗'));
          durSpan.className = 'tr-dur';
          durSpan.textContent = R.tdur(curP, tid);
          const oldCt = sm.querySelector('.ct-x');
          const nextCt = CmdTranslate.renderRowChips(curP, endSt);
          if (oldCt && nextCt) oldCt.replaceWith(nextCt);
          else if (oldCt) oldCt.remove();
          else if (nextCt) durSpan.after(nextCt);
          nudgeBtn?.remove();
          return;
        }
        const elap = Math.max(0, Date.now() - startAt);
        const isStuck = elap >= timeoutMs, isWarn = !isStuck && elap >= 300000;
        durSpan.className = 'tr-dur is-live' + (isStuck ? ' is-stuck' : isWarn ? ' is-warn' : '');
        durSpan.textContent = R.fmtDurMs(elap, true) + (isStuck ? ' · 超时卡住' : '');
        d.classList.toggle('is-stuck', isStuck);
        if (isStuck && isBash && chat?.busy && chat?.live) {
          if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; }
          void R.nudgeBash(d, curP, tid, 'timeout');
        }
      };
      d.__durTm = setInterval(tickDur, 1000);
      tickDur();
    }
    if (isOpen) {
      d.append(R.toolBody(p)); d.__bodyBuilt = true;
    } else {
      d.addEventListener('toggle', () => {
        if (d.open && !d.__bodyBuilt) { d.__bodyBuilt = true; d.append(R.toolBody(p)); }
      });
    }
    return d;
  },
  // 工具组：前序已经跑完的收在折叠组里（默认收起）；始终把最新的一条工具/命令单行露在折叠组下面（不展开具体内容）
  group(g, key, live, labels) {
    const items = g.items, tools = items.filter(p => p.type !== 'reasoning');
    let lastToolIdx = -1;
    for (let k = items.length - 1; k >= 0; k--) { if (items[k]?.type !== 'reasoning') { lastToolIdx = k; break; } }
    for (let k = 0; k < lastToolIdx; k++) {
      const it = items[k];
      if (it && it.type !== 'reasoning' && R.tstate(it) === 'run') it._superseded = true;
    }
    let cut = items.length;
    if (live) { const i = items.findIndex((p, idx) => idx >= lastToolIdx && p.type !== 'reasoning' && R.tstate(p) === 'run'); if (i >= 0) cut = i; }
    if (lastToolIdx >= 0 && cut > lastToolIdx) cut = lastToolIdx;
    const doneItems = items.slice(0, cut), doneTools = doneItems.filter(p => p.type !== 'reasoning'), n = doneTools.length;
    const allBash = tools.every(p => /^(bash|shell|run_command)$/i.test(R.tname(p)));
    const what = allBash ? '命令' : '工具';
    const wrap = h('div', { class: 'tg-wrap' });
    const appendFoldedSegment = (segEntries, segKey) => {
      const segTools = segEntries.filter(e => e.p.type !== 'reasoning').map(e => e.p);
      const segN = segTools.length;
      if (!segN) {
        segEntries.forEach(({ p, j }) => { const r = R.reasoning(p, false, key + ':r' + j, labels, live); if (r) wrap.append(r); });
        return;
      }
      const bad = segTools.filter(p => R.tstate(p) === 'bad').length;
      const warn = segTools.filter(p => R.tstate(p) === 'warn').length;
      const hasRouteStart = segTools.some(p => p?._routeStart);
      const grpChips = CmdTranslate.renderGroupChips(segTools);
      const gsm = h('summary', {}, icon('chevr', 'tg-chev'), icon('term', 'ti'), h('span', { class: 'tg-lbl' }, '已运行' + what), h('span', { class: 'tg-n' }, String(segN)), grpChips, bad ? h('span', { class: 'tg-bad' }, bad + ' 个失败') : null, (!grpChips && warn) ? h('span', { class: 'tg-warn' }, warn + ' 个注意') : null, hasRouteStart ? h('span', { class: 'tg-bad tg-route' }, '⚠️ 含路由转折') : null);
      gsm.__reactFiber$extcompat = { memoizedProps: { parts: segTools.map((x, j) => R.extPart(x, segKey + ':' + j)), isActive: cut < items.length }, return: null };
      const isOpen = !!R.openOf(segKey, false);
      const d = R.keep(h('details', { class: 'tgroup', open: isOpen || null }, gsm), segKey);
      const box = h('div', { class: 'tg-list' });
      const buildRows = () => {
        if (box.__builtCount === segEntries.length) return;
        box.replaceChildren();
        segEntries.forEach(({ p, j }) => {
          if (p.type === 'reasoning') { const r = R.reasoning(p, false, key + ':r' + j, labels, live); if (r) box.append(r); }
          else {
            const rowKey = key + ':' + j, rowSig = R.tstate(p) + ':' + (p.errorText ? 1 : 0) + ':' + (R.openOf(rowKey, false) ? 1 : 0) + ':' + (p._routeStart ? 'R' : '') + ':' + (CmdTranslate.isEnabled() ? 1 : 0);
            box.append(Seg.use(key, 'tr:' + j, rowSig, () => R.toolRow(p, rowKey)));
          }
        });
        box.__builtCount = segEntries.length;
      };
      if (isOpen) buildRows();
      else d.addEventListener('toggle', () => { if (d.open) buildRows(); });
      d.append(box); wrap.append(d);
    };
    if (n) {
      let curSeg = [];
      let segIdx = 0;
      const flushSeg = () => {
        if (!curSeg.length) return;
        const sKey = segIdx === 0 ? key : (key + ':s' + segIdx);
        segIdx++;
        appendFoldedSegment(curSeg, sKey);
        curSeg = [];
      };
      doneItems.forEach((p, j) => {
        if (p.type !== 'reasoning' && R.tstate(p) === 'bad') {
          flushSeg();
          const rowKey = key + ':' + j, rowSig = R.tstate(p) + ':' + (p.errorText ? 1 : 0) + ':' + (R.openOf(rowKey, false) ? 1 : 0) + ':' + (p._routeStart ? 'R' : '') + ':' + (CmdTranslate.isEnabled() ? 1 : 0);
          wrap.append(h('div', { class: 'tg-live tg-fail-out' }, Seg.use(key, 'tr:' + j, rowSig, () => R.toolRow(p, rowKey))));
        } else {
          curSeg.push({ p, j });
        }
      });
      flushSeg();
    } else doneItems.forEach((p, j) => { const r = R.reasoning(p, false, key + ':r' + j, labels, live); if (r) wrap.append(r); });
    if (cut < items.length) {
      const tail = h('div', { class: 'tg-live' });
      const tailSlice = items.slice(cut);
      let lastTailToolIdx = -1;
      for (let tIdx = tailSlice.length - 1; tIdx >= 0; tIdx--) { if (tailSlice[tIdx]?.type !== 'reasoning') { lastTailToolIdx = tIdx; break; } }
      tailSlice.forEach((p, k) => {
        if (p.type === 'reasoning') {
          const r = R.reasoning(p, false, key + ':r' + (cut + k), labels, live);
          if (r) tail.append(r);
        } else {
          tail.append(R.toolRow(p, key + ':' + (cut + k), k === lastTailToolIdx ? { showAppearTime: true, live } : null));
        }
      });
      wrap.append(tail);
    }
    return wrap;
  },
  wraps: new Map(),
  classifyInlineHtml(code, lang = '', running = false) {
    const t = String(code || '').trim();
    if (t.length < 100) return null;
    const lg = String(lang || '').trim().toLowerCase();
    if (lg && !/^(html?|svg|xml)$/.test(lg)) return null;
    if (/^\s*(?:import\s+[\w{*\s,]+from\s+|export\s+(?:default|const|function|class)\s+|package\s+[\w.]+;|#include\s+<)/m.test(t)) return null;
    const isSvg = (lg === 'svg' || /^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(t)) && !/<html[\s>]/i.test(t) && (running || /<\/svg\s*>/i.test(t));
    if (isSvg && (t.length >= 120 || t.split('\n').length >= 4)) {
      const mTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(t);
      return { ext: 'svg', kind: 'SVG', title: mTitle ? mTitle[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '' };
    }
    const isFullDoc = /(?:<!doctype\s+html|<html[\s>])/i.test(t) && (running || /<\/(?:html|body|head|style|script|svg)\s*>/i.test(t));
    const hasRichTags = (lg === 'html' || lg === 'htm' || (!lg && /^\s*</.test(t))) &&
      /<(?:head|body|style|script|canvas|main|section|article|header|footer|nav|table|form|div|svg)\b/i.test(t) &&
      (running || /<\/(?:html|body|style|script|canvas|main|section|article|div|svg|table|form)\s*>/i.test(t)) &&
      (t.length >= 160 || t.split('\n').length >= 6);
    if (isFullDoc || hasRichTags) {
      const mTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(t) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(t);
      return { ext: 'html', kind: 'HTML', title: mTitle ? mTitle[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 48) : '' };
    }
    return null;
  },
  _inlineHtmlMemoKey: '',
  _inlineHtmlMemoVal: null,
  _inlineHtmlMemoMap: new Map(),
  countLinesFast(s) {
    if (!s) return 0;
    let n = 1;
    for (let i = 0, L = s.length; i < L; i++) if (s.charCodeAt(i) === 10) n++;
    return n;
  },
  extractInlineHtmlSegments(text, streaming = false) {
    const raw = String(text || '');
    if (raw.length < 100) return null;
    let rawHash = 2166136261 >>> 0;
    for (let hi = 0; hi < raw.length; hi++) { rawHash ^= raw.charCodeAt(hi); rawHash = Math.imul(rawHash, 16777619) >>> 0; }
    const memoKey = (streaming ? '1:' : '0:') + raw.length + ':' + rawHash.toString(36) + ':' + raw.slice(0, 48) + ':' + raw.slice(-48);
    if (this._inlineHtmlMemoKey === memoKey) return this._inlineHtmlMemoVal;
    if (this._inlineHtmlMemoMap.has(memoKey)) {
      const hit = this._inlineHtmlMemoMap.get(memoKey);
      this._inlineHtmlMemoKey = memoKey; this._inlineHtmlMemoVal = hit;
      return hit;
    }
    if (!/<(?:!doctype\s+html|html[\s>]|svg[\s>]|head[\s>]|body[\s>])|(?:`{3,}|~{3,})[ \t]*(?:html?|svg|xml)\b/i.test(raw)) {
      this._inlineHtmlMemoKey = memoKey; this._inlineHtmlMemoVal = null;
      if (this._inlineHtmlMemoMap.size >= 256) this._inlineHtmlMemoMap.delete(this._inlineHtmlMemoMap.keys().next().value);
      this._inlineHtmlMemoMap.set(memoKey, null);
      return null;
    }
    const out = [];
    let htmlIdx = 0;
    const pushUnfencedOrMd = (chunk, isTail) => {
      if (!chunk) return;
      if (chunk.length < 120 || !/<(?:!doctype\s+html|html[\s>]|svg[\s>])/i.test(chunk)) {
        out.push({ type: 'md', text: chunk });
        return;
      }
      const docRe = /(?:<!doctype\s+html[^>]*>[\s\S]*?<\/html\s*>|<html\b[^>]*>[\s\S]*?<\/html\s*>|(?:<\?xml[^>]*>\s*)?<svg\b[^>]*>[\s\S]*?<\/svg\s*>)/gi;
      let pos = 0, m;
      while ((m = docRe.exec(chunk)) !== null) {
        const info = R.classifyInlineHtml(m[0], '', false);
        if (!info) continue;
        if (m.index > pos) out.push({ type: 'md', text: chunk.slice(pos, m.index) });
        out.push({ type: 'html', code: m[0].trim(), ext: info.ext, kind: info.kind, title: info.title, running: false, idx: htmlIdx++ });
        pos = m.index + m[0].length;
      }
      const rem = chunk.slice(pos);
      if (isTail && streaming && rem.length >= 140) {
        const openMatch = /(?:<!doctype\s+html|<html[\s>]|<svg\b[^>]*>)/i.exec(rem);
        if (openMatch) {
          const cand = rem.slice(openMatch.index);
          const info = R.classifyInlineHtml(cand, '', true);
          if (info) {
            if (openMatch.index > 0) out.push({ type: 'md', text: rem.slice(0, openMatch.index) });
            out.push({ type: 'html', code: cand.trim(), ext: info.ext, kind: info.kind, title: info.title, running: true, idx: htmlIdx++ });
            return;
          }
        }
      }
      if (rem) out.push({ type: 'md', text: rem });
    };
    const fenceRe = /(`{3,}|~{3,})[ \t]*([A-Za-z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\1[ \t]*(?=\r?\n|$)/g;
    let lastPos = 0, fm;
    while ((fm = fenceRe.exec(raw)) !== null) {
      const lang = fm[2] || '', body = fm[3] || '';
      const info = R.classifyInlineHtml(body, lang, false);
      if (!info) continue;
      if (fm.index > lastPos) pushUnfencedOrMd(raw.slice(lastPos, fm.index), false);
      out.push({ type: 'html', code: body.trim(), ext: info.ext, kind: info.kind, title: info.title, running: false, idx: htmlIdx++ });
      lastPos = fm.index + fm[0].length;
    }
    const tail = raw.slice(lastPos);
    const openFence = /(`{3,}|~{3,})[ \t]*(html?|svg|xml)?[ \t]*\r?\n([\s\S]{100,})$/i.exec(tail);
    if (openFence) {
      const info = R.classifyInlineHtml(openFence[3], openFence[2] || '', true);
      if (info) {
        if (openFence.index > 0) pushUnfencedOrMd(tail.slice(0, openFence.index), false);
        out.push({ type: 'html', code: openFence[3].trim(), ext: info.ext, kind: info.kind, title: info.title, running: Boolean(streaming), idx: htmlIdx++ });
        const res = htmlIdx > 0 ? out : null;
        this._inlineHtmlMemoKey = memoKey; this._inlineHtmlMemoVal = res;
        if (this._inlineHtmlMemoMap.size >= 256) this._inlineHtmlMemoMap.delete(this._inlineHtmlMemoMap.keys().next().value);
        this._inlineHtmlMemoMap.set(memoKey, res);
        return res;
      }
    }
    pushUnfencedOrMd(tail, true);
    const res = htmlIdx > 0 ? out : null;
    this._inlineHtmlMemoKey = memoKey; this._inlineHtmlMemoVal = res;
    if (this._inlineHtmlMemoMap.size >= 256) this._inlineHtmlMemoMap.delete(this._inlineHtmlMemoMap.keys().next().value);
    this._inlineHtmlMemoMap.set(memoKey, res);
    return res;
  },
  inlineHtmlPath(m, seg) {
    const midShort = String(m?.id || 'msg').replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'msg';
    return `inline-${midShort}-${(seg?.idx ?? 0) + 1}.${seg?.ext || 'html'}`;
  },
  inlineHtmlCard(seg, key, m, chat) {
    const vpath = R.inlineHtmlPath(m, seg);
    const text = String(seg?.code || '');
    const lines = R.countLinesFast(text);
    const running = !!seg?.running;
    const ext = String(seg?.ext || 'html').toUpperCase();
    const posTag = m?.participantPosition === 'a' ? 'Model A · ' : m?.participantPosition === 'b' ? 'Model B · ' : '';
    const dispTitle = seg?.title ? `${posTag}${seg.title} (${vpath})` : `${posTag}内嵌 ${ext} 页面 (${vpath})`;
    const existingWrap = !Seg.off ? R.wraps.get(key) : null;
    if (existingWrap && existingWrap._detailsEl) {
      const d = existingWrap._detailsEl;
      d.__inlineCode = text;
      d.classList.toggle('run', running);
      d.classList.toggle('ok', !running);
      if (existingWrap._titleEl && existingWrap._titleEl.textContent !== dispTitle) existingWrap._titleEl.textContent = dispTitle;
      if (existingWrap._linesEl) {
        const lTxt = lines ? lines + ' 行' : '';
        if (existingWrap._linesEl.textContent !== lTxt) existingWrap._linesEl.textContent = lTxt;
      }
      if (existingWrap._spinEl) existingWrap._spinEl.hidden = !running;
      if (d.open && existingWrap._preEl) {
        existingWrap._preEl.textContent = text.length > 60000 ? text.slice(0, 60000) + '\n…' : text || '（空）';
      }
      if (typeof HtmlPreview !== 'undefined' && HtmlPreview.card) {
        const card = HtmlPreview.card(key, { path: vpath, running, get: existingWrap._getTxt, getWsid: existingWrap._getWsid, onOpen: existingWrap._onOpen });
        const old = existingWrap.querySelector(':scope>.pvc');
        if (old !== card) old ? old.replaceWith(card) : existingWrap.append(card);
      }
      return existingWrap;
    }
    let d = null;
    const sidOf = el => el?.closest?.('[data-wsid]')?.getAttribute('data-wsid') || chat?.sid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) || null;
    const getTxt = () => d?.__inlineCode || text;
    const openPv = (mode = 'run') => {
      if (typeof HtmlPreview === 'undefined' || !HtmlPreview.open) return;
      const sid = sidOf(d);
      const curChat = chat || (sid && typeof Chats !== 'undefined' ? Chats.get?.(sid) : null);
      if (curChat?.isEvaluation && m && typeof HtmlPreview.openEvalMessage === 'function') {
        HtmlPreview.openEvalMessage(curChat, m, { path: vpath, mode });
        return;
      }
      HtmlPreview.open({ sid, path: vpath, get: getTxt, wsid: sid, mode });
    };
    const pvBtn = h('button', {
      type: 'button',
      class: 'btn ghost xs wc-pv-btn',
      title: '点击在预览窗口中运行查看',
      onclick: e => { e.preventDefault(); e.stopPropagation(); openPv('run'); }
    }, icon('pvplay'), h('span', {}, '预览'));
    const codeBtn = h('button', {
      type: 'button',
      class: 'btn ghost xs wc-code-btn',
      title: '点击在预览窗口中查看完整代码',
      onclick: e => { e.preventDefault(); e.stopPropagation(); openPv('code'); }
    }, icon('pvcode'), h('span', {}, '代码'));
    const titleEl = h('code', { class: 'wc-p', title: '点击在预览窗口展开查看' }, dispTitle);
    const linesEl = h('span', { class: 'dim' }, lines ? lines + ' 行' : '');
    const spinEl = h('i', { class: 'spin', hidden: !running });
    const wsm = h('summary', {},
      h('span', { class: 'wc-w' }, ext),
      titleEl,
      linesEl,
      spinEl,
      h('span', { class: 'grow' }),
      pvBtn,
      codeBtn,
      icon('chevr', 'tg-chev')
    );
    const isOpen = Boolean(R.openOf(key, false));
    d = R.keep(h('details', { class: 'wcard ' + (running ? 'run' : 'ok') + ' pvable inline-html-card', open: isOpen || null }, wsm), key);
    d.__inlineCode = text;
    wsm.addEventListener('click', ev => {
      if (ev.target.closest('.tg-chev,button')) return;
      ev.preventDefault();
      ev.stopPropagation();
      openPv('run');
    });
    let bodyBuilt = false, preEl = null, wrap = null;
    const ensureBody = () => {
      if (bodyBuilt) return;
      bodyBuilt = true;
      const curTxt = getTxt();
      preEl = h('pre', { class: 'wc-code' }, curTxt.length > 60000 ? curTxt.slice(0, 60000) + '\n…' : curTxt || '（空）');
      if (wrap) wrap._preEl = preEl;
      d.append(h('div', { class: 'wc-card' },
        h('div', { class: 'wc-h' }, icon('file'), h('span', {}, dispTitle), h('span', { class: 'grow' }), h('span', { class: 'wc-lang' }, ext),
          h('button', { class: 'ib xs', title: '复制代码', onclick: e => { e.preventDefault(); e.stopPropagation(); copyText(getTxt()); } }, icon('copy'))),
        preEl
      ));
    };
    if (isOpen) ensureBody();
    else d.addEventListener('toggle', () => { if (d.open) ensureBody(); }, { passive: true });
    if (Seg.off || typeof HtmlPreview === 'undefined' || !HtmlPreview.card) return d;
    const getWsidFn = () => sidOf(d);
    const onOpenFn = mode => openPv(mode || 'run');
    const card = HtmlPreview.card(key, { path: vpath, running, get: getTxt, getWsid: getWsidFn, onOpen: onOpenFn });
    wrap = h('div', { class: 'wc-wrap inline-html-wrap' }, d, card);
    wrap._detailsEl = d;
    wrap._titleEl = titleEl;
    wrap._linesEl = linesEl;
    wrap._spinEl = spinEl;
    wrap._preEl = preEl;
    wrap._getTxt = getTxt;
    wrap._getWsid = getWsidFn;
    wrap._onOpen = onOpenFn;
    R.wraps.set(key, wrap);
    if (R.wraps.size > 200) R.wraps.delete(R.wraps.keys().next().value);
    return wrap;
  },
  // 这个对话里 Write 出来的所有可预览文件（含对话正文内嵌的完整 HTML/SVG）：预览面板的「文件」下拉与自动截图共用
  _writesCache: new Map(),
  writes(sid) {
    const chat = Chats.get(sid);
    if (!chat) return [];
    const stamp = R._chatWriteStamp(chat);
    const cached = R._writesCache.get(sid);
    if (cached && cached.stamp === stamp) return cached.list;
    const seen = new Map();
    for (const m of chat.messages || []) for (const p of m.parts || []) {
      if (!p) continue;
      if ((String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') && R.isWrite(p)) {
        const inp = R.tinput(p) || {}, path = R.normPath(inp.path || inp.file_path || '');
        if (!path || !HtmlPreview.previewable(path)) continue;
        seen.set(path, { path, running: Boolean(Hitl.blocked(chat) && R.tstate(p, true) === 'run'), get: () => R.latestFileText(sid, path, p) });
      } else if (m.role === 'assistant' && p.type === 'text' && p.text) {
        const segs = R.extractInlineHtmlSegments(p.text, false);
        if (segs) {
          for (const hs of segs) {
            if (hs.type !== 'html') continue;
            const vpath = R.inlineHtmlPath(m, hs);
            seen.set(vpath, { path: vpath, running: !!hs.running, get: () => hs.code });
          }
        }
      }
    }
    const list = [...seen.values()];
    if (R._writesCache.size >= 40) R._writesCache.delete(R._writesCache.keys().next().value);
    R._writesCache.set(sid, { stamp, list });
    return list;
  },
  writeCard(p, key, live = false) {
    const inp = R.tinput(p) || {}, path = String(inp.path || inp.file_path || ''), short = R.normPath(path);
    const sidOf = el => el?.closest?.('[data-wsid]')?.getAttribute('data-wsid') || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) || null;
    const getTxt = () => R.latestFileText(sidOf(d), short, p);
    const text = (typeof inp.content === 'string' ? inp.content : typeof inp.text === 'string' ? inp.text : '') || R.latestFileText(null, short, p);
    const lines = R.countLinesFast(text), st = R.tstate(p, live), name = path.split('/').pop() || path;
    const ext = (/\.([\w]+)$/.exec(name)?.[1] || 'plain').toUpperCase();
    const pv = HtmlPreview.previewable(path);   // html / svg：点这一行在右侧内嵌预览（箭头仍是展开代码）
    const wsm = h('summary', {}, h('span', { class: 'wc-w' }, 'Write'), pv ? h('code', { class: 'wc-p', title: '点击在右侧预览' }, short) : h('code', { class: 'wc-p fpath', 'data-fpath': short, title: '在工作区打开' }, short), h('span', { class: 'dim' }, lines ? lines + ' 行' : ''), st === 'run' ? h('i', { class: 'spin' }) : st === 'bad' ? h('span', { class: 'tr-st bad' }, '✗') : null, h('span', { class: 'grow' }), icon('chevr', 'tg-chev'));
    wsm.__reactFiber$extcompat = { memoizedProps: { part: R.extPart(p, key) }, return: null };
    const isOpen = Boolean(R.openOf(key, false) || p.errorText);
    const d = R.keep(h('details', { class: 'wcard ' + st + (pv ? ' pvable' : ''), open: isOpen || null }, wsm), key);
    if (pv) HtmlPreview.bindRow(d.querySelector('summary'), { path: short, get: getTxt, getWsid: () => sidOf(d) });
    let bodyBuilt = false;
    const ensureBody = () => {
      if (bodyBuilt) return;
      bodyBuilt = true;
      const curTxt = getTxt() || text;
      d.append(h('div', { class: 'wc-card' }, h('div', { class: 'wc-h' }, icon('file'), h('span', {}, name), h('span', { class: 'grow' }), h('span', { class: 'wc-lang' }, ext.length > 6 ? 'PLAIN' : ext), h('button', { class: 'ib xs', title: '复制', onclick: e => { e.preventDefault(); copyText(getTxt() || text); } }, icon('copy'))),
        h('pre', { class: 'wc-code' }, curTxt.length > 60000 ? curTxt.slice(0, 60000) + '\n…' : curTxt || '（空）'),
        p.errorText ? h('pre', { class: 'err' }, p.errorText) : null));
    };
    if (isOpen) ensureBody();
    else d.addEventListener('toggle', () => { if (d.open) ensureBody(); }, { passive: true });
    // html / svg：和网页版一样，在这一行下面直接显示页面缩略图（点一下放大）；其它文件仍然只有这一行
    if (!pv || Seg.off || HtmlPreview.kindOf(path) !== 'html') return d;
    const card = HtmlPreview.card(key, { path: short, running: st === 'run', get: getTxt, getWsid: () => sidOf(d) });
    let wrap = R.wraps.get(key);
    if (!wrap) { wrap = h('div', { class: 'wc-wrap' }, d, card); R.wraps.set(key, wrap); if (R.wraps.size > 200) R.wraps.delete(R.wraps.keys().next().value); }
    else { wrap.firstElementChild?.replaceWith(d); const old = wrap.querySelector(':scope>.pvc'); if (old !== card) old ? old.replaceWith(card) : wrap.append(card); }
    return wrap;
  },
  // ---- 人在回路：ask_user 交互式问答（和官方卡片一致）/ propose_plan / 选声音 / 选图片 ----
  findPart(chat, id) { for (let i = chat.messages.length - 1; i >= 0; i--) { const p = (chat.messages[i].parts || []).find(x => x.toolCallId === id); if (p) return p; } return null; },
  hitlBrief(r, chat) {
    const o = r?.output || {}, p = R.findPart(chat, r?.toolCallId), inp = p ? Hitl.input(p) || {} : {};
    if (r.tool === 'ask_user') {
      if (o.skipped) return '已跳过提问';
      const qs = inp.questions || [];
      return (o.answers || []).map(a => { const q = qs.find(x => x.id === a.questionId); const op = q?.options?.find(x => x.id === a.selectedOptionId); return [op?.label, a.customResponse].filter(Boolean).join(' · ') || '（空）'; }).join('；') || '已回答';
    }
    if (r.tool === 'propose_plan') return '计划：' + ({ accepted: '已接受', revise: '需要修改', rejected: '已拒绝', no_decision: '未决定' }[o.decision] || o.decision || '已回应');
    if (r.tool === 'add_voice' || r.tool === 'generate_image') return (r.tool === 'add_voice' ? '声音' : '图片') + '：' + (o.selection_method === 'skip' ? '跳过' : '选了第 ' + ((o.selected_index ?? 0) + 1) + ' 个');
    return '已回应';
  },
  hitlSend(chat, p, out, opt = {}) {
    if (!UI.me) { UI.loginGate('请先登录'); return Promise.resolve(); }
    const d = UI.hitlDraft.get(p.toolCallId) || {}; d.sending = true; d.err = ''; UI.hitlDraft.set(p.toolCallId, d); chat.emit(); scheduleChat(chat);
    return chat.submitHitl(p, out, opt).then(r => {
      if (r?.staged) {
        // 同一步里模型发了好几个提问：先记下这个（草稿保留，点「修改」可以改），滚到下一个还没回答的
        d.sending = false; toast(`已记下，还有 ${r.left} 个提问待回答，答完后一起提交`); chat.emit(); scheduleChat(chat);
        setTimeout(() => { const nx = Hitl.pending(chat).find(x => !chat.hitlStage?.has(x.toolCallId)); const el = nx && [...document.querySelectorAll('#view .hitl.ask')].find(x => x.dataset.tc === nx.toolCallId); el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 80);
        return;
      }
      UI.hitlDraft.delete(p.toolCallId);
    })
      .catch(async e => {
        if (e?.status === 403 && /recaptcha/i.test(e.body || '') && !opt.v2) { toast('需要人机验证', 'err'); const tok = await Recaptcha.v2().catch(() => null); if (tok) { d.sending = false; return R.hitlSend(chat, p, out, { ...opt, v2: tok }); } }
        // 失败原因留在卡片上（toast 几秒就没了，看不到就没法判断是哪一步出的问题）；选项草稿还在，直接再点提交即可
        d.sending = false; d.err = describe(e) + (e?.status ? '（HTTP ' + e.status + '）' : ''); toast('提交失败：' + describe(e), 'err'); chat.emit(); scheduleChat(chat);
      });
  },
  // 卡片底部状态行：提交中显示卡在哪一步（等服务器 / 人机验证 / 发送中…），失败显示原因
  hitlNote(chat, p) {
    const d = UI.hitlDraft.get(p.toolCallId) || {};
    if (d.err) return h('div', { class: 'hq-note err' }, '没有发出去：' + d.err + '。选项已保留，可以直接再点提交。');
    if (d.sending && chat.phase) return h('div', { class: 'hq-note' }, h('i', { class: 'spin' }), chat.phase);
    return null;
  },
  hitl(p, chat, m, isLast) {
    const n = Hitl.name(p), inp = Hitl.input(p) || {}, ans = Hitl.answerOf(chat, p);
    const waiting = ans === undefined && Hitl.awaiting(p) && isLast;
    const staged = chat.hitlStage?.has(p.toolCallId);
    const off = !waiting || Hitl.blocked(chat) || !chat.loaded || staged || UI.hitlDraft.get(p.toolCallId)?.sending;
    // 卡片已经不在等回答、本地却找不到回答（多半是在网页 / 别的设备上回答的，本地没同步到）：向服务器补一次
    if (ans === undefined && !waiting && !staged && chat.loaded && !chat.gacha && Hitl.awaiting(p) && !chat.recP && now() - (chat.recoAt || 0) > 15000) setTimeout(() => chat.reconcile(), 0);
    const card = n === 'ask_user' ? R.askCard(p, chat, inp, ans, waiting, off, staged) : n === 'propose_plan' ? R.planCard(p, chat, inp, ans, waiting, off) : R.battleCard(p, chat, n, inp, ans, waiting, off);
    { const note = card && ans === undefined ? R.hitlNote(chat, p) : null; if (note) card.append(note); }
    // 输入框带固定标识：卡片不得不重建时，把焦点和光标位置搬到新卡片的同一个输入框（正在输入的内容不丢）
    card?.querySelectorAll?.('textarea,input').forEach((x, j) => { x.dataset.fk = p.toolCallId + ':' + j; });
    if (card?.dataset) card.dataset.tc = p.toolCallId;
    return card;
  },
  hitlSig(p, chat, isLast) {
    const ans = Hitl.answerOf(chat, p), d = UI.hitlDraft.get(p.toolCallId);
    let a = ''; try { a = ans === undefined ? 'u' : JSON.stringify(ans); } catch { a = 'x'; }
    let i = ''; try { i = JSON.stringify(Hitl.input(p) || {}); } catch {}
    let o = ''; try { const n = Hitl.norm(p.output); o = n && typeof n === 'object' ? JSON.stringify({ status: n.status || '', candidates: n.candidates || [], voice_id: n.voice_id || '' }) : String(n ?? ''); } catch {}
    return [p.state, a, i, isLast, chat.hitlStage?.has(p.toolCallId), Hitl.blocked(chat), chat.loaded, !!chat.recP, d?.sending, d?.err || '', p.output ? 1 : 0, o].join('|');
  },
  askCard(p, chat, inp, ans, waiting, off, staged) {
    const qs = Array.isArray(inp.questions) ? inp.questions.filter(q => q && typeof q === 'object') : [];
    if (!qs.length) return h('div', { class: 'hitl muted' }, h('div', { class: 'hq-h' }, h('span', { class: 'hq-q' }, p.state === 'input-streaming' ? '正在准备问题…' : '提问')));
    // 题目 / 选项没有 id 时用序号兜底（否则几道题会共用同一个选择）
    const qk = (q, i) => q.id != null && q.id !== '' ? String(q.id) : 'q' + (i + 1);
    const ok = (op, i) => op.id != null && op.id !== '' ? String(op.id) : String(op.label ?? i);
    // 已回答：紧凑摘要
    if (!waiting || staged) {
      const o = staged ? chat.hitlStage.get(p.toolCallId).output : ans || {};
      const box = h('div', { class: 'hitl done' });
      const syncing = ans === undefined && !staged && !!chat.recP;
      if (o.skipped) box.append(h('div', { class: 'hq-h' }, h('span', { class: 'hq-q' }, qs[0].question), h('span', { class: 'hq-tag' }, '已跳过')));
      else qs.forEach((q, qi) => {
        const a = (o.answers || []).find(x => String(x.questionId) === qk(q, qi)), op = (q.options || []).find((x, oi) => ok(x, oi) === String(a?.selectedOptionId));
        const txt = [op?.label, a?.customResponse].filter(Boolean).join(' · ');
        box.append(h('div', { class: 'hq-sum' }, h('div', { class: 'hq-q' }, q.question), h('div', { class: 'hq-a' + (txt ? '' : ' dim') }, txt ? icon('check') : null, txt || (ans === undefined && !staged ? (syncing ? '同步中…' : '（未回答）') : '（空）'))));
      });
      if (staged) box.append(h('div', { class: 'hq-foot dim' }, h('span', { class: 'grow' }, '已记下，回答完其余提问后一起提交'),
        h('button', { class: 'hq-skip', onclick: () => { chat.hitlStage.delete(p.toolCallId); chat.messages.forEach(x => x.v = (x.v || 0) + 1); chat.emit(); scheduleChat(chat); } }, '修改')));
      return box;
    }
    const d = UI.hitlDraft.get(p.toolCallId) || { sel: {}, txt: {} }; UI.hitlDraft.set(p.toolCallId, d); d.sel ||= {}; d.txt ||= {};
    const card = h('div', { class: 'hitl ask' + (off ? ' off' : '') });
    const secs = [];
    const done = (q, i) => !!d.sel[qk(q, i)] || !!String(d.txt[qk(q, i)] || '').trim();
    const left = () => qs.map((q, i) => done(q, i) ? 0 : i + 1).filter(Boolean);
    const build = () => ({ skipped: false, answers: qs.map((q, i) => ({ questionId: qk(q, i), selectedOptionId: d.sel[qk(q, i)] || null, customResponse: String(d.txt[qk(q, i)] || '').trim().slice(0, 2000) || null })) });
    // 提交：没答完的题标红并滚过去（按钮不再「点了没反应」）
    const go = () => {
      if (off) { if (Hitl.blocked(chat)) toast('这一轮还在进行中，结束后才能提交', 'err'); return; }
      const miss = left();
      secs.forEach((sec, i) => sec.classList.toggle('miss', miss.includes(i + 1)));
      if (miss.length) { toast(qs.length > 1 ? `还有第 ${miss.join('、')} 题没回答` : '请先选择一个选项或填写回答', 'err'); secs[miss[0] - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      R.hitlSend(chat, p, build());
    };
    const submit = h('button', { class: 'hq-submit' + (left().length ? ' part' : ''), disabled: off || null, onclick: go }, d.sending ? '提交中…' : qs.length > 1 ? `Submit ${qs.length - left().length}/${qs.length}` : 'Submit');
    const refresh = () => { const n = left().length; submit.classList.toggle('part', !!n); if (qs.length > 1 && !d.sending) submit.textContent = `Submit ${qs.length - n}/${qs.length}`; secs.forEach((sec, i) => { if (done(qs[i], i)) sec.classList.remove('miss'); }); };
    qs.forEach((q, qi) => {
      const k = qk(q, qi), sec = h('div', { class: 'hq' }); secs.push(sec);
      sec.append(h('div', { class: 'hq-h' }, qs.length > 1 ? h('span', { class: 'hq-n' }, (qi + 1) + '/' + qs.length) : null, h('span', { class: 'hq-q' }, q.question),
        qi === 0 ? h('button', { class: 'hq-skip', disabled: off || null, title: '跳过这次提问', onclick: () => R.hitlSend(chat, p, { skipped: true, answers: [] }) }, 'Skip') : null));
      (q.options || []).forEach((op, oi) => {
        const oid = ok(op, oi);
        const row = h('label', { class: 'hq-opt' + (d.sel[k] === oid ? ' on' : '') },
          h('input', { type: 'radio', name: 'hq-' + p.toolCallId + '-' + k, checked: d.sel[k] === oid || null, disabled: off || null, onchange: () => {
            d.sel[k] = oid; sec.querySelectorAll('.hq-opt').forEach(x => x.classList.toggle('on', x === row)); refresh();
            // 和网页一致：只有一道题时点选项就是回答（没写补充说明的话）；多道题时自动滚到下一道没答的
            if (qs.length === 1 && !String(d.txt[k] || '').trim()) { setTimeout(go, 120); return; }
            const nx = left()[0]; if (nx && nx > qi + 1) secs[nx - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } }),
          h('span', { class: 'hq-dot' }, icon('check')),
          h('span', { class: 'hq-l' }, h('span', {}, op.label ?? oid), op.description ? h('span', { class: 'hq-d' }, op.description) : null));
        sec.append(row);
      });
      if (q.allowCustomResponse !== false) {
        const ta = h('textarea', { class: 'hq-in', rows: 1, maxlength: 2000, placeholder: 'Revise options or write your own...', disabled: off || null,
          oninput: e => { d.txt[k] = e.target.value; e.target.style.height = 'auto'; e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px'; refresh(); },
          onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMob()) { e.preventDefault(); go(); } } });
        ta.value = d.txt[k] || '';
        sec.append(h('div', { class: 'hq-cus' }, icon('pen'), ta, qi === qs.length - 1 ? submit : null));
      } else if (qi === qs.length - 1) sec.append(h('div', { class: 'hq-cus end' }, h('span', { class: 'grow' }), submit));
      card.append(sec);
    });
    return card;
  },
  planCard(p, chat, inp, ans, waiting, off) {
    const path = String(inp.path || ''), short = path.replace(/^\/home\/user\/(workspace\/)?/, '');
    const card = h('div', { class: 'hitl plan' + (off ? ' off' : '') },
      h('div', { class: 'hq-h' }, icon('file'), h('span', { class: 'hq-q' }, '计划'), path ? h('code', { class: 'fpath', 'data-fpath': short, title: '在工作区打开' }, short) : null,
        ans !== undefined ? h('span', { class: 'hq-tag' }, { accepted: '已接受', revise: '需要修改', rejected: '已拒绝', no_decision: '未决定' }[ans?.decision] || '已回应') : null),
      Array.isArray(inp.highlights) && inp.highlights.length ? h('ul', { class: 'hp-hl' }, inp.highlights.map(x => h('li', {}, x))) : null);
    if (waiting) {
      const d = UI.hitlDraft.get(p.toolCallId) || {}; UI.hitlDraft.set(p.toolCallId, d);
      const ta = h('textarea', { class: 'hq-in', rows: 1, placeholder: '修改意见（可选，选「修改」时一起发送）', disabled: off || null, oninput: e => { d.txt = e.target.value; } }); ta.value = d.txt || '';
      const go = dec => R.hitlSend(chat, p, { decision: dec }, { text: dec === 'accepted' ? '' : d.txt });
      card.append(h('div', { class: 'hq-cus' }, icon('pen'), ta),
        h('div', { class: 'hp-act' }, h('button', { class: 'btn sm', disabled: off || null, onclick: () => go('accepted') }, '接受'), h('button', { class: 'btn sm ghost', disabled: off || null, onclick: () => go('revise') }, '修改'), h('button', { class: 'btn sm danger', disabled: off || null, onclick: () => go('rejected') }, '拒绝')));
    }
    return card;
  },
  // 卡片每次刷新都会重建：图片 / 音频节点按地址复用（不再每次重新加载 → 不闪、不跳高度，播放中的声音不被打断）
  media(key, mk) { const m = R._media ||= new Map(); let el = m.get(key); if (el) { m.delete(key); m.set(key, el); return el; } el = mk(); m.set(key, el); if (m.size > 240) m.delete(m.keys().next().value); return el; },
  battleCard(p, chat, n, inp, ans, waiting, off) {
    const o = p.output && typeof p.output === 'object' ? p.output : {}, cands = Array.isArray(o.candidates) ? o.candidates : [];
    const voice = n === 'add_voice', url = hsh => ORIGIN + '/api/chat/workspace/cas/user/' + encodeURIComponent(hsh);
    if (!voice) {
      const wsUrl = fp => {
        const short = String(fp || '').replace(/^\/home\/user\//, '').replace(/^~\//, '');
        if (!short) return '';
        const wf = (typeof WS !== 'undefined' && WS.sid === chat?.sid && Array.isArray(WS.data)) ? WS.data.find(f => String(f.path || '').replace(/^\/home\/user\//, '') === short) : null;
        if (wf?.hash) return url(wf.hash);
        return chat?.sid ? ORIGIN + '/api/agent/sessions/' + encodeURIComponent(chat.sid) + '/files/' + short.split('/').map(encodeURIComponent).join('/') : '';
      };
      const candUrl = c => {
        if (!c) return '';
        if (c.url || c.src) return String(c.url || c.src).startsWith('/') ? ORIGIN + String(c.url || c.src) : String(c.url || c.src);
        if (c.hash) return url(c.hash);
        if (c.path || c.file_path) return wsUrl(c.path || c.file_path);
        return '';
      };
      const singlePath = o.path || o.file_path || inp.file_path || inp.path || '';
      const singleItem = (!cands.length && p.state === 'output-available' && o.status !== 'error' && (o.hash || o.url || singlePath))
        ? [{ hash: o.hash, url: o.url, path: singlePath }]
        : [];
      const list = cands.length ? cands : singleItem;
      const isMulti = cands.length > 1 || (!list.length && inp.offer_options !== false);
      const headTxt = list.length > 1 || (waiting && isMulti) ? 'Which image do you prefer?' : (p.state !== 'output-available' ? 'Generating image…' : 'Generated image');
      const card = h('div', { class: 'hitl battle img-official text-text-primary rounded-md border border-border-faint bg-surface-primary my-4 max-w-[680px] p-4 shadow-none' + (off ? ' off' : '') },
        h('div', { class: 'img-off-head flex items-start justify-between gap-3' },
          h('p', { class: 'img-off-title text-text-primary text-base leading-snug' }, headTxt),
          waiting ? h('button', { class: 'img-off-skip inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors text-text-secondary hover:bg-surface-raised hover:text-text-primary h-7 shrink-0 rounded-md px-2 text-xs', type: 'button', 'aria-label': 'Skip image selection', disabled: off || null, onclick: () => R.hitlSend(chat, p, { status: 'completed', selected_index: 0, selection_method: 'skip' }) }, 'Skip')
            : ans !== undefined ? h('span', { class: 'hq-tag' }, ans?.selection_method === 'skip' ? 'Skipped' : 'Selected #' + ((ans?.selected_index ?? 0) + 1)) : null));
      if (p.state === 'output-available' && o.status === 'error') { card.append(h('pre', { class: 'err' }, o.message || '出错')); return card; }
      if (!list.length) {
        if (!ans && p.state !== 'output-available') {
          const skelGrid = h('div', { class: 'img-off-grid mt-3 grid grid-cols-2 gap-2' + (isMulti ? '' : ' single') });
          for (let k = 0; k < (isMulti ? 2 : 1); k++) skelGrid.append(h('div', { class: 'img-off-item' }, h('div', { class: 'img-off-skel' }, h('i', { class: 'spin' }), h('span', {}, 'Generating image ' + (isMulti ? (k + 1) : '') + '…'))));
          card.append(skelGrid);
        }
        return card;
      }
      const eyeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye size-3" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      const grid = h('div', { class: 'hb-grid img-off-grid mt-3 grid grid-cols-2 gap-2' + (list.length === 1 ? ' single' : '') });
      list.forEach((c, i) => {
        const sel = ans && ans.selection_method !== 'skip' && ans.selected_index === i;
        const u = candUrl(c);
        const label = list.length > 1 ? 'Candidate image ' + (i + 1) : (singlePath.split('/').pop() || 'Generated image');
        const imgEl = R.media('i:' + (c.hash || u) + ':' + i, () => h('img', { alt: label, class: 'zimg file-img h-full w-full object-cover transition-transform duration-150 group-hover:scale-[1.02]', src: u, 'data-name': label, 'data-sub': String(inp.prompt || '').slice(0, 60), loading: 'lazy' }));
        const viewBtn = h('button', { type: 'button', 'aria-label': 'View image ' + (i + 1), class: 'img-off-view bg-surface-secondary group relative aspect-square w-full overflow-hidden rounded', onclick: e => { e.stopPropagation(); ImgView.open(imgEl.src || u, label, imgEl); } },
          imgEl,
          h('div', { class: 'img-off-ov pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/35 via-transparent to-transparent p-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100' },
            h('span', { class: 'img-off-pill inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white', html: eyeSvg + 'View' })));
        const item = h('div', { class: 'hb-c img-off-item border-border-faint bg-surface-secondary/20 flex flex-col gap-2 rounded-md border p-2' + (sel ? ' on' : '') }, viewBtn);
        if (waiting) {
          item.append(h('button', { class: 'img-off-sel inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors border border-border-medium bg-surface-primary text-text-primary hover:bg-surface-raised h-8 w-full rounded-md px-3 text-xs', type: 'button', disabled: off || null, onclick: () => R.hitlSend(chat, p, { status: 'completed', selected_index: i, selection_method: 'user', ...(c.id ? { selected_candidate_id: c.id } : {}) }) }, 'Select'));
        } else if (ans !== undefined && list.length > 1) {
          item.append(h('button', { class: 'img-off-sel' + (sel ? ' on' : ''), type: 'button', disabled: true }, sel ? 'Selected ✓' : 'Select'));
        }
        grid.append(item);
      });
      card.append(grid);
      if (singlePath) card.append(h('div', { class: 'img-off-foot' }, R.fpathEl(singlePath), inp.prompt ? h('span', { class: 'dim', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(inp.prompt).slice(0, 80)) : null));
      return card;
    }
    const title = '选择声音';
    const card = h('div', { class: 'hitl battle' + (off ? ' off' : '') }, h('div', { class: 'hq-h' }, icon('mic'), h('span', { class: 'hq-q' }, title), h('code', { class: 'dim' }, String(inp.text || '').slice(0, 80)),
      ans !== undefined ? h('span', { class: 'hq-tag' }, ans?.selection_method === 'skip' ? '已跳过' : '已选第 ' + ((ans?.selected_index ?? 0) + 1) + ' 个') : null,
      waiting ? h('button', { class: 'hq-skip', disabled: off || null, onclick: () => R.hitlSend(chat, p, { status: 'completed', candidates: cands, selected_index: 0, selection_method: 'skip', ...(o.voice_id ? { voice_id: o.voice_id } : {}) }) }, 'Skip') : null));
    if (p.state === 'output-available' && o.status === 'error') card.append(h('pre', { class: 'err' }, o.message || '出错'));
    if (!cands.length) { if (!ans && p.state !== 'output-available') card.append(h('div', { class: 'dim hq-foot' }, h('i', { class: 'spin' }), '正在生成候选声音…')); return card; }
    const grid = h('div', { class: 'hb-grid voice' });
    cands.forEach((c, i) => {
      const sel = ans && ans.selection_method !== 'skip' && ans.selected_index === i;
      grid.append(h('div', { class: 'hb-c' + (sel ? ' on' : '') },
        h('div', { class: 'hb-n' }, '声音 ' + (i + 1)),
        R.media('a:' + c.hash, () => h('audio', { controls: true, preload: 'none', src: url(c.hash) })),
        waiting ? h('button', { class: 'btn sm primary', disabled: off || null, onclick: () => R.hitlSend(chat, p, { status: 'completed', candidates: cands, selected_index: i, selection_method: 'user', ...(o.voice_id ? { voice_id: o.voice_id } : {}) }) }, '选这个') : null));
    });
    card.append(grid);
    return card;
  },
  part(p, ctx) {
    if (!p || !p.type) return null;
    if (p.type === 'text') return p.text ? R.text(p, p.state === 'streaming') : null;
    if (p.type === 'reasoning') return R.reasoning(p, ctx.live && p.state === 'streaming');
    if (p.type === 'step-start') return null;
    if (p.type === 'error') return h('div', { class: 'part-err' }, '⚠ ' + (typeof formatOfficialErrorText === 'function' ? formatOfficialErrorText(p.text) : p.text));
    if (p.type.startsWith('tool-') || p.type === 'dynamic-tool') return R.tool(p);
    if (p.type === 'source-url') return h('a', { class: 'src', href: p.url, target: '_blank' }, p.title || p.url);
    if (p.type === 'file') return /^image\//.test(p.mediaType || '') ? R.media('f:' + p.url, () => h('img', { class: 'file-img zimg', src: p.url, 'data-name': p.filename || '', onclick: e => ImgView.open(p.url, p.filename || '', e.currentTarget) })) : h('a', { class: 'src', href: p.url, target: '_blank' }, p.filename || '文件');
    if (p.type.startsWith('data-')) return null;
    return null;
  },
  // prev：上一次渲染的同一条消息节点。助手消息原地更新（外壳 / 正文节点不换），只替换变了的部分
  message(m, chat, isLast, prev, seg) {
    if (!prev || m.role === 'user' || prev.dataset.id !== m.id) return R.message0(m, chat, isLast, null, seg);
    const out = {}, el = R.message0(m, chat, isLast, out, seg);
    if (!out.kids) return el;
    prev.className = out.cls;
    const isSettledAsst0 = m.role === 'assistant' && !m.metadata?.pending && !m._incomplete && Boolean(m._finishedAt || m.metadata?.timing?.completedAt || m.metadata?.aborted || m.metadata?.error || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn');
    const liveNow = !m.failed && !Hitl.idleWait(chat) && !(isSettledAsst0 && !chat?.streaming) && (chat.live === m || !!(isLast && m.role === 'assistant' && !isSettledAsst0 && Hitl.blocked(chat) && !chat?.waitingForeign));
    if (liveNow) prev.setAttribute('data-streaming', 'true'); else prev.removeAttribute('data-streaming');
    patchKids(prev, out.kids);
    return prev;
  },
  message0(m, chat, isLast, out, seg) {
    const isUnverifiedCache = Boolean((chat?.cached && !chat?.loaded) || chat?._recoveringIncomplete);
    const isIncTail = Boolean(isLast && m.role === 'assistant' && !m._userStopped && isUnverifiedCache && (
      m.metadata?.pending ||
      m._incomplete ||
      m.status === 'pending' ||
      m.status === 'streaming' ||
      (typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(m))
    ));
    if (isIncTail && chat && !chat.busy && !chat.loading && !chat._incSyncing && !(typeof window !== 'undefined' && window.__BRANA_BROWSE_MODE)) {
      chat._incSyncing = true;
      setTimeout(() => {
        const p = (chat.isEvaluation && typeof EvalEngine !== 'undefined' && typeof EvalEngine.loadChat === 'function')
          ? EvalEngine.loadChat(chat, true)
          : (typeof chat.load === 'function' ? chat.load(true) : null);
        Promise.resolve(p).catch(() => {}).finally(() => { chat._incSyncing = false; });
      }, 30);
    }
    const isSettledAsst = m.role === 'assistant' && !m.metadata?.pending && !m._incomplete && Boolean(m._finishedAt || m.metadata?.timing?.completedAt || m.metadata?.aborted || m.metadata?.error || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn');
    const live = !m.failed && !Hitl.idleWait(chat) && !(isSettledAsst && !chat?.streaming) && (chat.live === m || !!(isLast && m.role === 'assistant' && !isSettledAsst && ((Hitl.blocked(chat) && !chat?.waitingForeign) || isIncTail)));
    const segCls = m.role === 'assistant' && seg ? (seg.head ? ' seg-head' : seg.mid ? ' seg-mid' : seg.tail ? ' seg-tail' : '') : '';
    const isAutoCont = m.role === 'user' && !!(m._autoContinue || m.metadata?.autoContinue);
    const el = h('div', {
      id: m.id ? 'chat-message-' + m.id : null,
      tabindex: '-1',
      class: 'msg ' + m.role + (m.failed ? ' failed' : '') + segCls + (isAutoCont ? ' auto-cont-msg' : ''),
      'data-id': m.id,
      'data-message-id': m.id || null,
      'data-chat-message-id': m.id || null,
      'data-agent-transcript-message': 'true',
      'data-message-author-role': m.role,
      'data-role': m.role,
      'data-streaming': live ? 'true' : null,
      'data-user-message-layout': m.role === 'user' ? 'true' : null
    });
    if (m.role === 'user') {
      if (isAutoCont) {
        el.append(h('span', { class: 'auto-cont-pill', title: '检测到官方工具链中途停顿，已自动无感续接' }, h('i', { class: 'auto-cont-dot' }), h('span', {}, '⚡ 自动续接')));
        return el;
      }
      const txt = (m.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n') || String(m.text || '');
      const ups = userAtts(m);
      if (ups.length) el.append(h('div', { class: 'att-row mine' }, ups.map(u => attView(u, true))));
      const tr = (m.parts || []).filter(p => p.type === 'data-tool-results' && Array.isArray(p.data)).flatMap(p => p.data);
      if (tr.length) el.append(h('div', { class: 'hitl-chip' }, icon('check'), tr.map(r => R.hitlBrief(r, chat)).join('；')));
      if (txt) el.append(h('div', { class: 'bubble prose' + (m.failed ? ' is-unsent' : ''), lang: '', translate: 'no', 'data-user-message-body-row': 'true' }, txt));
      if (!txt && tr.length) return el;
      const st = m._sentAt || idTime(m.id);
      el.append(h('div', { class: 'msg-act' + (m.failed ? ' is-failed' : ''), 'data-user-message-action': 'true' },
        m.failed ? h('span', { class: 'msg-fail-tag', title: '该消息未发出（服务器未收到），点击右侧「重试」重新发送' }, '⚠ 未发出') : null,
        m.failed ? h('button', { class: 'btn sm msg-retry-btn', type: 'button', title: '重新发送这条未发出的消息', onclick: ev => { ev.stopPropagation(); UI.retry(chat, m, false); } }, '↻ 重试') : null,
        h('button', { class: 'ib', type: 'button', title: '复制', 'aria-label': 'Copy', onclick: () => copyText(txt) }, icon('copy')),
        st ? h('span', { class: 'mtime', title: '发送时间 ' + clockFull(st) }, clock(st)) : null));
      return el;
    }
    // 正文区域保持同一个节点，段落按指纹复用（见 Seg）
    if (chat?.sid) el.setAttribute('data-wsid', chat.sid);
    const reasonAccess=ThinkingStatus.access(chat,m),reasonLabels={live:ThinkingStatus.label(chat,m,chat.phase==='思考中',reasonAccess),done:ThinkingStatus.label(chat,m,false,reasonAccess),of:(p,s)=>ThinkingStatus.label(chat,m,s,reasonAccess,p)};
    if (live) m._streamed = true;
    const body = Seg.box(m.id, 'body', () => h('div', { class: 'msg-body' })), segs = [], mid = m.id;
    const running = p => p.state !== 'output-available' && p.state !== 'output-error' && p.state !== 'output-denied' || !!p.preliminary;
    const outSig = p => p.output === undefined ? -1 : typeof p.output === 'string' ? p.output.length : (p.output?.stdout?.length || 0) + (p.output?.stderr?.length || 0) + (p.output?.exit_code ?? 0);
    const pSig = p => p.type + ':' + (p.state || '') + ':' + (p.text?.length || 0) + ':' + (p.inputText?.length || 0) + ':' + (p.input ? 1 : 0) + ':' + outSig(p) + ':' + (p.preliminary ? 1 : 0) + ':' + (p.errorText ? 1 : 0);
    const isEvalMsg = Boolean(chat?.isEvaluation || m.webdev || m.webdevTemplate || m.activeWorkflowRunId || m.metadata?.workflowRunId);
    let grp = null;
    const flush = () => {
      if (!grp) return; const g = grp; grp = null;
      const sig = (live ? 'L' : '') + (CmdTranslate.isEnabled() ? 'T' : '') + '|' + g.items.map(pSig).join(',');
      if (isEvalMsg && typeof EvalView !== 'undefined' && typeof EvalView.renderToolStepGroup === 'function') {
        segs.push(Seg.use(mid, 'wdg:' + g.start, sig, () => EvalView.renderToolStepGroup(g.items, chat, m, 'a', live)));
        return;
      }
      segs.push(Seg.use(mid, 'g:' + g.start, sig, () => R.group(g, mid + ':' + g.start, live, reasonLabels)));
    };
    (m.parts || []).forEach((p, i) => {
      if (!p || !p.type) return;
      const isTool = p.type.startsWith('tool-') || p.type === 'dynamic-tool';
      if (isTool && Hitl.name(p)) { flush(); segs.push(Seg.use(mid, 'h:' + (p.toolCallId || i), R.hitlSig(p, chat, isLast), () => R.hitl(p, chat, m, isLast))); return; }
      if (isTool && (isEvalMsg || !R.isWrite(p))) { (grp ||= { start: i, items: [] }).items.push(p); return; }
      if (p.type === 'step-start' || p.type.startsWith('data-') || (p.type === 'text' && !p.text)) return;
      // 开源思考（有可见思考文字）绝不能像 bash 一样被折叠进「已运行工具」中：先 flush 工具组，再独立标红展示
      if (p.type === 'reasoning' && !ThinkingStatus.visible(p) && grp && !isEvalMsg) return;
      flush();
      if (isTool) { segs.push(Seg.use(mid, 'w:' + i, pSig(p) + (live ? ':L' : ''), () => R.writeCard(p, mid + ':' + i, live))); return; }
      if (p.type === 'text') {
        const streaming = live && p.state === 'streaming';
        const htmlSegs = R.extractInlineHtmlSegments(p.text, streaming);
        if (htmlSegs) {
          htmlSegs.forEach((hs, hi) => {
            if (hs.type === 'html') {
              const hKey = mid + ':ih:' + i + ':' + hs.idx;
              const hSig = (hs.running ? 'R' : 'D') + ':' + hs.code.length + ':' + hs.code.slice(-24);
              segs.push(Seg.use(mid, 'ih:' + i + ':' + hs.idx, hSig, () => R.inlineHtmlCard(hs, hKey, m, chat)));
            } else if (hs.text && hs.text.trim()) {
              const tKey = 't:' + i + ':m' + hi;
              if (m._streamed) segs.push(StreamMD.paint(Seg.box(mid, tKey, () => h('div', { class: 'md prose', lang: '', translate: 'no' })), hs.text, streaming && hi === htmlSegs.length - 1));
              else segs.push(Seg.use(mid, tKey, hs.text.length + ':' + hs.text.slice(-24), () => R.text({ text: hs.text }, false)));
            }
          });
          return;
        }
        if (m._streamed) segs.push(StreamMD.paint(Seg.box(mid, 't:' + i, () => h('div', { class: 'md prose', lang: '', translate: 'no' })), p.text, streaming));
        else segs.push(Seg.use(mid, 't:' + i, p.text.length + ':' + p.text.slice(-24), () => R.text(p, false)));
        return;
      }
      if (p.type === 'reasoning') {
        if (!p.text && p.state === 'done') return;
        const key = mid + ':r' + i, d = Seg.box(mid, 'r:' + i, () => {
          const b = h('div', { class: 'md prose muted', lang: '', translate: 'no' });
          const badge = h('span', { class: 'rs-open-badge', hidden: true }, '开源思考');
          const x = R.keep(h('details', { class: 'reason not-prose' }, h('summary', { role: 'button' }, icon('brain'), badge, h('span', { class: 'rs-t' })), b), key);
          x.__b = b; x.__badge = badge;
          x.addEventListener('toggle', () => {
            if (x.open && x.__rawTxt !== undefined) StreamMD.paint(b, x.__rawTxt || '…', !!x.__rawStream);
          });
          return x;
        });
        const streaming = live && p.state === 'streaming', isClosedTurn = reasonAccess?.type === 'closed' || (typeof Fingerprint !== 'undefined' && Fingerprint.isClosedSourceStream?.(chat)), openThink = !isClosedTurn && ThinkingStatus.visible(p);
        d.classList.toggle('open-think', openThink);
        if (d.__badge) d.__badge.hidden = !openThink;
        let lbl = reasonLabels.of(p, streaming);
        if (openThink) { lbl = String(lbl || '').replace(/^闭源思考/, '开源思考'); if (!/^开源/.test(lbl)) lbl = '开源思考 · ' + lbl; }
        d.querySelector('.rs-t').textContent = lbl;
        d.querySelector('summary').title = '有可见思考文字 = 开源模型；思考为空（只有「…」）= 闭源模型。已从运行记录确认型号时以型号为准。';
        // 开源思考默认保持展开并标红强烈凸显（除非用户手动点过收起）；闭源思考按流式状态自动展开/收起
        const wantOpen = openThink ? false : streaming;
        if (UI.opens.has(key)) { d.open = !!UI.opens.get(key); d.__auto = null; }
        else if (d.__auto !== wantOpen) { d.__auto = wantOpen; d.open = wantOpen; }
        const st = d.open ? 'open' : 'closed'; d.dataset.state = st;
        const sm = d.querySelector(':scope > summary'); if (sm) { sm.setAttribute('aria-expanded', d.open ? 'true' : 'false'); sm.dataset.state = st; }
        d.__rawTxt = p.text || '…';
        d.__rawStream = streaming;
        if (d.open) StreamMD.paint(d.__b, d.__rawTxt, streaming);
        segs.push(d); return;
      }
      const n = Seg.use(mid, 'p:' + i, pSig(p) + ':' + (p.url || '') + (live ? 'L' : ''), () => R.part(p, { live }));
      if (n) segs.push(n);
    });
    flush();
    if (isEvalMsg && typeof EvalView !== 'undefined' && typeof EvalView.renderWebDevStatusFooter === 'function') {
      const wdFoot = EvalView.renderWebDevStatusFooter(chat, m, 'a', live);
      if (wdFoot) segs.push(wdFoot);
    }
    const miRoute = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
    const stripTierV = s => String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
    const validNotice = n => {
      if (!n) return null;
      const fl = String(n.fromShort || n.fromLabel || miRoute?.routeFrom || '').trim();
      const tl = String(n.toShort || n.toLabel || miRoute?.routeTo || '').trim();
      if (fl && tl && ((n.type === 'model' && stripTierV(fl) === stripTierV(tl)) || fl.toLowerCase() === tl.toLowerCase())) return null;
      return n;
    };
    const rn = !seg?.hideFoot ? validNotice(m._routeNotice || (m.id && miRoute?.routeNotices?.[m.id]) || null) : null;
    let prevNotice = (!seg?.hideFoot && !rn && m.id && miRoute?.routed && miRoute?.routeNotices)
      ? Object.values(miRoute.routeNotices).map(validNotice).find(n => n && n.prevMessageId === m.id) || null
      : null;
    if (!seg?.hideFoot && !rn && !prevNotice && m.id && Array.isArray(chat?.messages)) {
      let nextAsst = seg?.nextAsstMsg !== undefined ? seg.nextAsstMsg : undefined;
      if (nextAsst === undefined) {
        const assts = chat.messages.filter(x => x && x.role === 'assistant' && x.id);
        const myIdx = assts.findIndex(x => x.id === m.id);
        nextAsst = myIdx >= 0 ? (assts[myIdx + 1] || null) : null;
      }
      if (nextAsst) {
        prevNotice = validNotice(nextAsst._routeNotice || (nextAsst.id && miRoute?.routeNotices?.[nextAsst.id]) || null);
      }
    }
    const isPivotPrev = !seg?.hideFoot && !rn && (m._routePivotRole === 'prev' || Boolean(prevNotice));
    const isPivotNext = !seg?.hideFoot && (m._routePivotRole === 'next' || Boolean(rn));
    if (rn) {
      const suspectedModel = String(rn.toLabel || rn.toShort || miRoute?.routeTo || miRoute?.reverseLabel || miRoute?.candidateName || miRoute?.name || '其他模型')
        .replace(/(\s*\((?:None|Minimal|Low|Medium|High|xHigh|Max)\))(?:\s*\1)+/gi, '$1')
        .replace(/[?？]+$/, '')
        .trim();
      const fromModel = String(rn.fromLabel || rn.fromShort || miRoute?.routeFrom || '')
        .replace(/(\s*\((?:None|Minimal|Low|Medium|High|xHigh|Max)\))(?:\s*\1)+/gi, '$1')
        .replace(/[?？]+$/, '')
        .trim();
      const sm = m._routeStepInfo || rn.stepMeta || null;
      const stepSuffix = sm && sm.toolIdx ? `（自本轮第 #${sm.toolIdx} 步 ${sm.toolName || 'tool'} 起）` : '';
      const isFollowup = Boolean(rn.isFollowup);
      const rText = isFollowup
        ? `⚠️ 路由切换提醒：当前回复由切换后的 ${suspectedModel} 生成${fromModel ? '（自第 #' + (rn.toTurn || '?') + ' 轮起由 ' + fromModel + ' 切换）' : ''}`
        : fromModel
          ? `⚠️ 路由切换提醒：本轮起模型已由 ${fromModel} 切换为 ${suspectedModel}${stepSuffix}`
          : `⚠️ 路由提示：对话疑似 ${suspectedModel}${stepSuffix}`;
      const rTitle = [
        fromModel ? `检测到中途路由：${fromModel} → ${suspectedModel}` : `对话疑似切换为 ${suspectedModel}`,
        rn.fromTurn && rn.toTurn ? `切换位置：第 #${rn.fromTurn} 轮 → 第 #${rn.toTurn} 轮` : '',
        rn.reason || miRoute?.routeReason ? `判据：${rn.reason || miRoute?.routeReason}` : ''
      ].filter(Boolean).join(' · ');
      segs.push(Seg.use(mid, 'route-alert', rText, () => h('div', {
        class: `msg-route-alert${isFollowup ? ' is-followup' : ''}`,
        'data-route-pivot': isFollowup ? '0' : '1',
        role: 'status',
        title: rTitle
      }, icon('alert'), h('span', {}, rText))));
    }
    if (live) segs.push(Seg.box(mid, 'typing', () => h('div', { class: 'typing', title: '正在生成与执行中…' }, h('i'), h('i'), h('i'))));
    patchKids(body, segs);
    const kids = [body];
    if (!live && !(seg?.hideFoot && !(m.metadata?.aborted || m.metadata?.feedback?.interruption === 'stop'))) {
      const md = m.metadata || {}, tm = md.timing, txt = (seg?.fullText || (m.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n\n')).trim();
      const foot = h('div', { class: 'msg-act' });
      const pivotLabel = isPivotPrev
        ? String(m._turnModelLabel || prevNotice?.fromShort || prevNotice?.fromLabel || miRoute?.routeFrom || '').trim()
        : isPivotNext
          ? String(m._turnModelLabel || rn?.toShort || rn?.toLabel || miRoute?.routeTo || '').trim()
          : '';
      if (pivotLabel) {
        const cleanPivot = typeof Strength !== 'undefined' && Strength.canon ? String(Strength.canon(pivotLabel)).replace(/[?？]+$/, '') : pivotLabel;
        foot.append(h('span', {
          class: 'badge msg-turn-model' + (isPivotNext ? ' is-routed' : ' is-route-prev'),
          title: isPivotPrev
            ? `路由转折前（上一句回复）模型：${cleanPivot}`
            : `路由转折后（下一句回复）模型：${cleanPivot}`,
        }, cleanPivot));
      }
      // 结束时间 + 用时（多段连续工具合并显示总时长，避免同一结束时间重复刷屏）
      const meta=h('div',{class:'msg-meta','aria-label':'Message cost'}), tools=h('div',{class:'msg-tools'});
      const rawT0 = tm?.startedAt || idTime(m.id), t0 = (seg?.turnStartAt && (!rawT0 || seg.turnStartAt < rawT0)) ? seg.turnStartAt : rawT0, t1 = tm?.completedAt || 0;
      if (t1) meta.append(h('span', { class: 'mtime', title: (t0 ? '开始 ' + clockFull(t0) + '\n' : '') + '结束 ' + clockFull(t1) }, '结束 ' + clock(t1)));
      if (t0 && t1 && t1 > t0) meta.append(h('span', { class: 'dim' }, durTxt((t1 - t0) / 1000)));
      if (md.aborted || md.feedback?.interruption === 'stop') {
        const isOpenThinkStop = Boolean(
          md.openThinkStopped ||
          chat.thinkStopped ||
          (miRoute?.fingerprint?.skipped === 'compat-thinking' || miRoute?.fingerprint?.skipped === 'visible-thinking') ||
          ((m.parts || []).some(p => (p?.type === 'reasoning' || p?.type === 'thinking') && /[^\s.…·。]/.test(String(p.text || ''))) && !(typeof ThinkingStatus !== 'undefined' && ThinkingStatus.isClosed(chat)))
        );
        if (isOpenThinkStop) md.openThinkStopped = true;
        meta.append(h('span', { class: 'dim' }, isOpenThinkStop ? '开源思考已停止' : '已停止'));
        if (isLast && !chat.busy && isOpenThinkStop) {
          meta.append(h('button', {
            class: 'btn ghost xs',
            style: { marginLeft: '6px' },
            title: '本对话已被官方服务端路由为开源模型：点击允许本对话继续执行（不再因开源思考自动暂停，以便让 AI 执行完搬运文件/清理工作区等指令）',
            onclick: () => {
              chat._allowOpenThink = true;
              toast('已允许本对话使用当前模型继续执行（不再因开源思考自动暂停），正在重发…');
              void UI.retry(chat, null, false);
            }
          }, '▶ 允许继续执行（不暂停）'));
        }
      }
      if (txt || isLast) tools.append(h('button', { class: 'ib', type: 'button', title: '复制', 'aria-label': 'Copy', onclick: () => copyText(txt) }, icon('copy')));
      if (typeof FingerprintReview !== 'undefined' && FingerprintReview.isReviewable(chat, m)) {
        tools.append(h('button', {
          class: 'btn ghost xs fp-calib-btn',
          title: '校准指纹（仅分析已有回复，不发送新消息）',
          onclick: () => FingerprintReview.calibrate(chat, m)
        }, '校准指纹'));
      }
      if (isLast && !chat.busy) tools.append(h('button', { class: 'ib', title: '重新生成', onclick: () => UI.regen(chat) }, icon('retry')));
      foot.append(h('div',{class:'msg-tail'},meta,tools));
      kids.push(foot);
    }
    if (out) { out.cls = el.className; out.kids = kids; return el; }
    el.append(...kids);
    return el;
  },
};

// ---------- 浏览器扩展挂进页面的节点 ----------
// 扩展的内容脚本在 document_start / document_idle 运行，比客户端脚本（dom-ready 之后才注入）更早，可能已经往页面里
// 挂了自己的节点（悬浮面板、样式）。UI.build() 用 innerHTML 整页重建会把它们一起清掉，于是扩展"装上了、没报错、却完全
// 没效果"。按 robots.txt 原始文档的形状识别外来节点：<html> 下 head / body 以外的元素、<body> 下 <pre> 以外的元素、
// <head> 里的 style / link；重建后挂回原来的层级。脚本节点不挂回（已经执行过，挪回去也不会再跑）。
const ExtensionNodes = {
  detach(doc) {
    const out = { html: [], head: [], body: [] }, root = doc?.documentElement; if (!root) return out;
    const take = (parent, list, keep) => { for (const el of [...(parent?.children || [])]) if (!keep(el)) { list.push(el); el.remove(); } };
    take(root, out.html, el => el.tagName === 'HEAD' || el.tagName === 'BODY');
    take(doc.head, out.head, el => el.tagName !== 'STYLE' && el.tagName !== 'LINK');
    take(doc.body, out.body, el => el.tagName === 'PRE' || el.tagName === 'SCRIPT');
    return out;
  },
  restore(doc, kept) {
    if (!kept || !doc?.documentElement) return;
    try { if (doc.head) doc.head.append(...kept.head); if (doc.body) doc.body.append(...kept.body); doc.documentElement.append(...kept.html); } catch {}
  },
};

// ---------- 主界面 ----------
