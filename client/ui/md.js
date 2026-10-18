// 轻量 Markdown 渲染（无依赖）：代码块、行内代码、标题、列表、引用、表格、链接、粗斜体、分隔线
const MD = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const local = u => typeof WorkspacePath !== 'undefined' && WorkspacePath.local(u);
  const safeUrl = u => { u = String(u).trim(); return /^(https?:|mailto:)/i.test(u) ? u : /^\/(?!\/)/.test(u) ? 'https://arena.ai' + u : '#'; };

  // 行内：先把代码、链接、图片换成占位符，再做转义和粗斜体，最后换回来（链接里的 _ * 不会被当成斜体）
  const URL_STOP = '\\s<>"\'`，。；：！？、）】》」』\\u3000-\\u9fff\\uff00-\\uffef\\u0001';
  const BARE = new RegExp('(https?:\\/\\/[^' + URL_STOP + ']+)', 'g');
  const MDLINK = /(!?)\[([^\]\n]+)\]\(\s*(?:<([^<>\n]+)>|((?:[^()\s<>]|\([^()\s]*\))+))(?:\s+"[^"\n]*")?\s*\)/g;
  const emph = s => s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  const aTag = (u, inner) => local(u) ? `<a href="#" class="fpath" data-fpath="${esc(u)}" title="在工作区打开 ${esc(u)}">${inner}</a>` : `<a href="${esc(safeUrl(u))}" target="_blank" rel="noreferrer" title="${esc(u)}">${inner}</a>`;
  function trimUrl(m) {
    let u = m, tail = '';
    while (/[.,;:!?'")\]*_~]$/.test(u)) {
      if (u.endsWith(')') && (u.match(/\(/g) || []).length >= (u.match(/\)/g) || []).length) break;
      tail = u.slice(-1) + tail; u = u.slice(0, -1);
    }
    return [u, tail];
  }
  function inline(src) {
    const slots = [], put = html => { slots.push(html); return '\u0001' + (slots.length - 1) + '\u0001'; };
    // 行内代码里的文件名 / 路径：可点击，在工作区文件查看器里打开
    const fp = c => { try { return FileLink.looks(c); } catch { return false; } };
    let s = String(src).replace(/`([^`\n]+)`/g, (_, c) => put(fp(c) ? `<code class="fpath" data-fpath="${esc(c.trim())}" title="在工作区打开 ${esc(c.trim())}">${esc(c)}</code>` : `<code>${esc(c)}</code>`));
    s = s.replace(MDLINK, (_, img, t, a, b) => { const u = a || b; return img && !local(u) ? put(`<img alt="${esc(t)}" src="${esc(safeUrl(u))}">`) : put(aTag(u, (img ? '🖼 ' : '') + emph(esc(t)))); });
    s = s.replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/g, (_, u) => put(aTag(u, esc(u))));
    s = s.replace(BARE, m => { const [u, tail] = trimUrl(m); return (u.length > 10 ? put(aTag(u, esc(u))) : u) + tail; });
    // 正文里带目录的文件路径（/home/user/a.py、src/app.js）也可以点
    s = s.replace(/(^|[\s(（:：,，])((?:\/home\/user\/|~\/|\.\/)?(?:[\w.-]+\/)+[\w.-]*[\w-]\.[a-zA-Z0-9]{1,8})(?=$|[\s)）,，。;；:：!?！？])/g, (m, pre, p) => fp(p) ? pre + put(`<span class="fpath" data-fpath="${esc(p)}" title="在工作区打开">${esc(p)}</span>`) : m);
    s = emph(esc(s));
    for (let i = 0; i < 3 && s.includes('\u0001'); i++) s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => slots[+i]);
    return s;
  }

  function table(lines) {
    const row = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    const head = row(lines[0]), al = row(lines[1]).map(c => /^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : '');
    let h = '<div class="md-table"><table><thead><tr>' + head.map((c, i) => `<th${al[i] ? ` style="text-align:${al[i]}"` : ''}>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const l of lines.slice(2)) h += '<tr>' + row(l).map((c, i) => `<td${al[i] ? ` style="text-align:${al[i]}"` : ''}>${inline(c)}</td>`).join('') + '</tr>';
    return h + '</tbody></table></div>';
  }

  function list(lines) {
    // 按缩进构建嵌套列表
    const items = lines.map(l => { const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l); return m ? { ind: m[1].replace(/\t/g, '    ').length, ord: /\d/.test(m[2]), start: parseInt(m[2]) || 1, text: m[3] } : { cont: l.trim() }; });
    let html = '', stack = [];
    for (const it of items) {
      if (it.cont != null) { html += ' ' + inline(it.cont); continue; }
      while (stack.length && it.ind < stack.at(-1).ind) { html += `</li></${stack.pop().tag}>`; }
      if (!stack.length || it.ind > stack.at(-1).ind) { const tag = it.ord ? 'ol' : 'ul'; stack.push({ ind: it.ind, tag }); html += `<${tag}${it.ord && it.start !== 1 ? ` start="${it.start}"` : ''}><li>`; }
      else html += '</li><li>';
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(it.text);
      html += task ? `<input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(task[2])}` : inline(it.text);
    }
    while (stack.length) html += `</li></${stack.pop().tag}>`;
    return html;
  }

  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    let out = '', i = 0, para = [];
    const flush = () => { if (para.length) { out += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
    while (i < lines.length) {
      const l = lines[i];
      const fence = /^(\s*)(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(l);
      if (fence) {
        flush(); const mark = fence[2], lang = fence[3] || ''; const buf = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith(mark)) { buf.push(lines[i]); i++; }
        const open = i >= lines.length; i++;
        out += `<div class="code"><div class="code-h"><span>${esc(lang || 'text')}</span><button class="copy" data-copy>复制</button></div><pre${open ? ' class="open"' : ''}><code>${esc(buf.join('\n'))}</code></pre></div>`;
        continue;
      }
      if (/^\s*$/.test(l)) { flush(); i++; continue; }
      const h = /^(#{1,6})\s+(.*)$/.exec(l);
      if (h) { flush(); out += `<h${h[1].length}>${inline(h[2].replace(/\s+#+\s*$/, ''))}</h${h[1].length}>`; i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out += '<hr>'; i++; continue; }
      if (/^\s*>/.test(l)) { flush(); const buf = []; while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; } out += '<blockquote>' + render(buf.join('\n')) + '</blockquote>'; continue; }
      if (/\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        flush(); const buf = [l, lines[i + 1]]; i += 2; while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) { buf.push(lines[i]); i++; } out += table(buf); continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        flush(); const buf = []; while (i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && buf.length))) { buf.push(lines[i]); i++; } out += list(buf); continue;
      }
      para.push(l); i++;
    }
    flush();
    return out;
  }
  return { render, esc, inline };
})();
