// Browser-extension content scripts mount their UI (floating panels, styles) before the client bundle runs.
// UI.build() rebuilds the whole document with innerHTML, so those nodes must be detached first and
// re-attached afterwards; otherwise an installed extension silently shows nothing inside Brana.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'view.js'), 'utf8');
const start = source.indexOf('const ExtensionNodes = {');
const closer = /\r?\n};\r?\n/g; closer.lastIndex = Math.max(start, 0);
const tail = closer.exec(source);
assert.ok(start > 0 && tail, 'ExtensionNodes helper must exist in ui/view.js');
const ExtensionNodes = vm.runInNewContext(source.slice(start, tail.index + tail[0].length) + '\nExtensionNodes;', {});

function el(tagName, children = []) {
  const node = {
    tagName, children: [], parentNode: null,
    remove() { if (!this.parentNode) return; const list = this.parentNode.children; list.splice(list.indexOf(this), 1); this.parentNode = null; },
    append(...nodes) { for (const n of nodes) { n.remove(); n.parentNode = this; this.children.push(n); } },
  };
  node.append(...children);
  return node;
}
const tags = parent => parent.children.map(x => x.tagName + (x.id ? '#' + x.id : ''));

function robotsDocument(extras = {}) {
  const head = el('HEAD', [el('META'), ...(extras.head || [])]);
  const body = el('BODY', [el('PRE'), ...(extras.body || [])]);
  const html = el('HTML', [head, body, ...(extras.html || [])]);
  return { documentElement: html, head, body };
}
// Simulates `document.documentElement.innerHTML = '<head>…</head><body></body>'` plus Brana's own nodes.
function rebuild(doc) {
  const head = el('HEAD', [el('META'), el('TITLE'), el('STYLE')]), body = el('BODY', [el('DIV')]);
  body.children[0].id = 'app';
  doc.documentElement.children.splice(0); doc.documentElement.append(head, body); doc.head = head; doc.body = body;
}

test('extension nodes survive the full-page rebuild in their original tiers', () => {
  const panel = el('DIV'); panel.id = '__arena_trace_inspector';
  const widget = el('DIV'); widget.id = 'ext-widget';
  const style = el('STYLE'); style.id = 'ext-style';
  const script = el('SCRIPT');
  const doc = robotsDocument({ html: [panel], body: [widget, script], head: [style] });
  const kept = ExtensionNodes.detach(doc);
  assert.deepEqual(tags(doc.documentElement), ['HEAD', 'BODY'], 'foreign <html> children are detached');
  assert.deepEqual(tags(doc.body), ['PRE', 'SCRIPT'], 'the robots.txt <pre> and scripts stay behind to be wiped');
  assert.deepEqual(tags(doc.head), ['META'], 'extension styles are detached from <head>');
  rebuild(doc);
  ExtensionNodes.restore(doc, kept);
  assert.deepEqual(tags(doc.documentElement), ['HEAD', 'BODY', 'DIV#__arena_trace_inspector']);
  assert.deepEqual(tags(doc.body), ['DIV#app', 'DIV#ext-widget'], 'body widgets come after the client root');
  assert.deepEqual(tags(doc.head), ['META', 'TITLE', 'STYLE', 'STYLE#ext-style']);
  assert.equal(panel.parentNode, doc.documentElement);
});

test('a pristine robots.txt document yields nothing to restore', () => {
  const doc = robotsDocument();
  const kept = ExtensionNodes.detach(doc);
  assert.deepEqual(kept, { html: [], head: [], body: [] });
  rebuild(doc);
  ExtensionNodes.restore(doc, kept);
  assert.deepEqual(tags(doc.documentElement), ['HEAD', 'BODY']);
  assert.deepEqual(tags(doc.body), ['DIV#app']);
});

test('missing document parts never throw', () => {
  assert.deepEqual(ExtensionNodes.detach({}), { html: [], head: [], body: [] });
  assert.doesNotThrow(() => ExtensionNodes.restore({}, { html: [el('DIV')], head: [], body: [] }));
  assert.doesNotThrow(() => ExtensionNodes.restore(robotsDocument(), null));
  const doc = { documentElement: el('HTML', [el('BODY', [el('PRE'), el('DIV')])]) };
  doc.body = doc.documentElement.children[0];
  const kept = ExtensionNodes.detach(doc);
  assert.equal(kept.body.length, 1, 'documents without <head> still work');
});

test('UI.build() detaches before the innerHTML wipe and restores after the client root is appended', () => {
  const build = source.slice(source.indexOf('  build() {'), source.indexOf('  layout() {'));
  const detach = build.indexOf('ExtensionNodes.detach(document)'), wipe = build.indexOf('documentElement.innerHTML ='), restore = build.indexOf('ExtensionNodes.restore(document, kept)');
  const appRoot = build.indexOf("h('div', { id: 'app' }");
  assert.ok(detach >= 0 && wipe > detach, 'detach must run before the wipe');
  assert.ok(appRoot > wipe && restore > appRoot, 'restore must run after the client root exists');
});
