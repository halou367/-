const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function makeMiniDom() {
  class MiniEl {
    constructor(tag, attrs = {}, text = '') {
      this.tag = tag.toLowerCase();
      this.attrs = { ...attrs };
      this.textContent = text;
      this.children = [];
      this.parent = null;
    }
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
    removeAttribute(k) { delete this.attrs[k]; }
    append(...els) { for (const e of els) if (e) { e.parent = this; this.children.push(e); } }
    prepend(...els) { for (const e of els.reverse()) if (e) { e.parent = this; this.children.unshift(e); } }
    remove() {
      if (!this.parent) return;
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
    replaceWith(el) {
      if (!this.parent) return;
      const i = this.parent.children.indexOf(this);
      if (i >= 0) { el.parent = this.parent; this.parent.children[i] = el; }
      this.parent = null;
    }
    get outerHTML() {
      const a = Object.entries(this.attrs).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('');
      if (this.tag === 'meta' || this.tag === 'link' || this.tag === 'img' || this.tag === 'source') return `<${this.tag}${a}>`;
      const inner = this.children.length ? this.children.map(c => c.outerHTML).join('') : this.textContent;
      return `<${this.tag}${a}>${inner}</${this.tag}>`;
    }
  }

  function parseAttrs(s) {
    const out = {};
    const re = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let m;
    while ((m = re.exec(s))) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
    return out;
  }

  class MiniDoc {
    constructor(html) {
      this.head = new MiniEl('head');
      this.body = new MiniEl('body');
      this.documentElement = new MiniEl('html');
      this.documentElement.append(this.head, this.body);
      const parseInto = (parent, chunk) => {
        const tagRe = /<(meta|link)\b([^>]*)>|<script\b([^>]*)>([\s\S]*?)<\/script>|<style\b([^>]*)>([\s\S]*?)<\/style>|<(img|source|image)\b([^>]*?)(?:\/>|>)|<a\b([^>]*)>([\s\S]*?)<\/a>|<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi;
        let m;
        while ((m = tagRe.exec(chunk))) {
          if (m[1]) parent.append(new MiniEl(m[1], parseAttrs(m[2])));
          else if (m[3] !== undefined) parent.append(new MiniEl('script', parseAttrs(m[3]), m[4]));
          else if (m[5] !== undefined) parent.append(new MiniEl('style', parseAttrs(m[5]), m[6]));
          else if (m[7]) parent.append(new MiniEl(m[7], parseAttrs(m[8])));
          else if (m[9] !== undefined) parent.append(new MiniEl('a', parseAttrs(m[9]), m[10]));
          else if (m[11] !== undefined) parent.append(new MiniEl('svg', parseAttrs(m[11]), m[12]));
        }
      };
      const hm = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html);
      const bm = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
      parseInto(this.head, hm ? hm[1] : '');
      parseInto(this.body, bm ? bm[1] : html);
    }
    createElement(tag) { return new MiniEl(tag); }
    querySelectorAll(sel) {
      const all = [];
      const walk = n => { for (const c of n.children) { all.push(c); walk(c); } };
      walk(this.documentElement);
      const parts = sel.split(',').map(s => s.trim());
      return all.filter(el => parts.some(p => {
        if (p === 'meta[http-equiv]') return el.tag === 'meta' && el.hasAttribute('http-equiv');
        if (p === 'link[rel~="stylesheet"][href]') return el.tag === 'link' && /\bstylesheet\b/i.test(el.getAttribute('rel') || '') && el.hasAttribute('href');
        if (p === 'script') return el.tag === 'script';
        if (p === 'script[src]') return el.tag === 'script' && el.hasAttribute('src');
        if (p === 'img[src]') return el.tag === 'img' && el.hasAttribute('src');
        if (p === 'source[src]') return el.tag === 'source' && el.hasAttribute('src');
        if (p === 'image') return el.tag === 'image';
        if (p === 'a[href]') return el.tag === 'a' && el.hasAttribute('href');
        if (p === 'form') return el.tag === 'form';
        return el.tag === p;
      }));
    }
  }

  return class DOMParser {
    parseFromString(src) { return new MiniDoc(String(src || '')); }
  };
}

test('HTML preview isolates sessions with identical filenames, updates shorter edits, and inlines relative session assets', () => {
  const uiDir = path.join(__dirname, '../ui');
  const hpSrc = fs.readFileSync(path.join(uiDir, 'html-preview.js'), 'utf8');
  const vwSrc = fs.readFileSync(path.join(uiDir, 'view.js'), 'utf8');

  // Extract R object slice around _fileTextCache / _chatWriteStamp / latestFileText from view.js
  const iStart = vwSrc.indexOf('_fileTextCache:');
  const iEnd = vwSrc.indexOf('tstate(p)', iStart);
  assert.ok(iStart > 0 && iEnd > iStart, 'found R.latestFileText slice in view.js');

  const chatsMap = new Map();
  const ctx = vm.createContext({
    ICON: {},
    DOMParser: makeMiniDom(),
    Blob,
    URL,
    encodeURIComponent,
    setTimeout: () => 0,
    clearTimeout: () => {},
    now: () => 1000,
    h: () => ({ classList: { toggle() {}, add() {}, remove() {} }, append() {}, querySelector() { return null; }, setAttribute() {}, style: {} }),
    icon: () => '',
    toast: () => {},
    describe: e => String(e?.message || e),
    Bus: { on() {}, emit() {} },
    Tabs: { cur: null },
    UI: { layout() {}, opens: new Map() },
    Chats: { map: chatsMap, get: sid => chatsMap.get(sid) || null, cur: null },
    MsgCache: { put() {} },
    document: { body: { classList: { contains: () => false, add() {}, remove() {} } }, querySelectorAll: () => [] },
    window: {},
  });

  const rHarness = `
    const R = {
      normPath: p => String(p || '').replace(/\\\\/g, '/').replace(/^\\/home\\/user\\//, '').replace(/^~\\//, '').replace(/^\\.\\//, '').replace(/^\\/+/, ''),
      tname: p => String(p?.toolName || p?.name || String(p?.type || '').replace(/^tool-/, '')),
      tinput: p => p?.input || {},
      ${vwSrc.slice(iStart, iEnd)}
    };
    this.R = R;
  `;
  vm.runInContext(rHarness, ctx);
  vm.runInContext(hpSrc + '\n;this.HtmlPreview = HtmlPreview;', ctx);

  const { HtmlPreview, R } = ctx;
  const sidA = '01a175e8-0000-7000-8000-000000000001';
  const sidB = '01a1737d-3edf-7e0e-8f07-ae6f971e3e1d';
  const longHtmlA = '<!doctype html><html><head><title>Session A</title></head><body><!-- ' + 'A'.repeat(4000) + ' --><svg viewBox="0 0 100 100"></svg></body></html>';
  const shortHtmlB = '<!doctype html><html><head><title>Session B</title></head><body><svg viewBox="0 0 80 80"></svg></body></html>';
  const editedShorterB = '<!doctype html><html><head><title>B2</title></head><body><svg viewBox="0 0 40 40"></svg></body></html>';

  // 1. Session A caches a long pelican-bicycle.html; Session B must NOT inherit it
  assert.equal(HtmlPreview.cacheResolvedText(sidA, 'pelican-bicycle.html', longHtmlA), true);
  assert.equal(HtmlPreview.resolvedText(sidB, 'pelican-bicycle.html'), '');

  // 2. Session B has a real shorter pelican-bicycle.html + sibling relative CSS/JS/SVG assets
  chatsMap.set(sidB, {
    sid: sidB,
    busy: false,
    messages: [{
      id: 'm1',
      v: 1,
      role: 'assistant',
      parts: [
        { type: 'tool-write_file', toolCallId: 'w1', state: 'output-available', input: { path: 'pelican-bicycle.html', content: shortHtmlB } },
        { type: 'tool-write_file', toolCallId: 'w2', state: 'output-available', input: { path: 'site/style.css', content: 'body{background:#123456}' } },
        { type: 'tool-write_file', toolCallId: 'w3', state: 'output-available', input: { path: 'site/app.js', content: 'window.__ranApp=1;' } },
        { type: 'tool-write_file', toolCallId: 'w4', state: 'output-available', input: { path: 'site/badge.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>' } },
        { type: 'tool-write_file', toolCallId: 'w5', state: 'output-available', input: { path: 'site/index.html', content: '<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><img src="./badge.svg"><script src="./app.js"></script></body></html>' } },
      ]
    }]
  });

  assert.equal(R.latestFileText(sidB, 'pelican-bicycle.html'), shortHtmlB);

  // 3. Shorter complete rewrite updates cacheResolvedText, while unclosed streaming fragment is rejected
  assert.equal(HtmlPreview.cacheResolvedText(sidB, 'pelican-bicycle.html', shortHtmlB), true);
  assert.equal(HtmlPreview.cacheResolvedText(sidB, 'pelican-bicycle.html', editedShorterB), true);
  assert.equal(HtmlPreview.resolvedText(sidB, 'pelican-bicycle.html'), editedShorterB);
  assert.equal(HtmlPreview.cacheResolvedText(sidB, 'pelican-bicycle.html', '<!doctype html><html><body><div>partial'), false);
  assert.equal(HtmlPreview.resolvedText(sidB, 'pelican-bicycle.html'), editedShorterB);

  // 4. docOf inlines same-session relative CSS, JS, and SVG, does not leak across sessions, and preserves native performance.now
  const docB = HtmlPreview.docOf(R.latestFileText(sidB, 'site/index.html'), 'index.html', { run: true, sid: sidB, basePath: 'site/index.html' });
  assert.match(docB, /body\{background:#123456\}/);
  assert.match(docB, /window\.__ranApp=1;/);
  assert.match(docB, /data:image\/svg\+xml;charset=utf-8,/);
  assert.doesNotMatch(docB, /Date\.now\(\)\/3600000/);

  const docA = HtmlPreview.docOf('<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body></body></html>', 'index.html', { run: true, sid: sidA, basePath: 'site/index.html' });
  assert.doesNotMatch(docA, /body\{background:#123456\}/);
});
