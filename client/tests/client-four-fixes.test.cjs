const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiDir = path.join(__dirname, '..', 'ui');
const viewSrc = fs.readFileSync(path.join(uiDir, 'view.js'), 'utf8');
const hpSrc = fs.readFileSync(path.join(uiDir, 'html-preview.js'), 'utf8');
const plusSrc = fs.readFileSync(path.join(uiDir, 'plus.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(uiDir, 'app.css'), 'utf8');

test('Issue 1: used tool row hover and spinner animations do not flicker', () => {
  // .spin and .vlogo.st-run synchronize animationDelay to monotonic clock
  assert.match(viewSrc, /e\.classList\?\.contains\('spin'\) && !e\.style\.animationDelay/);
  assert.match(viewSrc, /if \(st === 'run'\) l\.style\.animationDelay = '-' \+/);
  // R.group flush() does not include m.v in Seg.use sig
  assert.doesNotMatch(viewSrc, /busy \? 'v' \+ \(m\.v \|\| 0\)/);
  // .tr-sum does not animate opacity 0 -> 1 on hover and hides when .asf-x is present
  assert.match(cssSrc, /\.tr-sum\{[^}]*opacity:\.78;pointer-events:none\}/);
  assert.match(cssSrc, /\.trow>summary:has\(\.asf-x\) \.tr-sum\{display:none!important\}/);
});

test('Issue 2: open-source thinking is never folded into tool groups and is strongly highlighted in red', () => {
  // Open-source thinking (ThinkingStatus.visible(p) === true) is not pushed into grp.items
  assert.match(viewSrc, /if \(p\.type === 'reasoning' && !ThinkingStatus\.visible\(p\) && grp(?: && !isEvalMsg)?\) return;/);
  assert.doesNotMatch(viewSrc, /if \(p\.type === 'reasoning' && grp\) \{ if \(p\.text\) grp\.items\.push\(p\); return; \}/);
  // Open-source thinking gets .open-think class, .rs-open-badge, and stays collapsed by default (wantOpen = openThink ? false : streaming)
  assert.match(viewSrc, /d\.classList\.toggle\('open-think', openThink\)/);
  assert.match(viewSrc, /const wantOpen = openThink \? false : streaming;/);
  // Soft light-red reminder styles exist in app.css
  assert.match(cssSrc, /details\.reason\.open-think\s*\{/);
  assert.match(cssSrc, /\.rs-open-badge\s*\{/);
});

test('Issue 3: inline HTML preview card (.pvc) and preview pane (#pv) use isolated sandboxes and proportional scene scaling', () => {
  assert.match(hpSrc, /f\.setAttribute\('sandbox', 'allow-same-origin'\)/);
  assert.match(hpSrc, /f\.setAttribute\('sandbox', 'allow-scripts'\)/);
  assert.match(hpSrc, /f\.srcdoc = docOf\(text, name, \{ (?:run: true, )?thumb: true/);
  assert.match(hpSrc, /function mountStage\(stage, f, text, name, o = \{\}\)/);
});

test('Issue 4: right-hand HTML preview/code pane (#pv) loads during streaming and renders like a browser', () => {
  // Partial JSON tool input parser for input-streaming
  assert.match(viewSrc, /parsePartialInput\(raw\)/);
  assert.match(viewSrc, /latestFileText\(sid, targetPath, fallbackPart\)/);
  // UI.renderChat syncs live preview pane
  assert.match(viewSrc, /HtmlPreview\.syncLive\?\.\(chat\.sid\)/);
  assert.match(hpSrc, /function syncLive\(sid\)/);
  // root.replaceChildren(grip, sheet) happens before mountStage so clientWidth/clientHeight are real
  const idxReplace = hpSrc.indexOf('root.replaceChildren(grip, sheet);');
  const idxMount = hpSrc.indexOf('if (stageToMount) st.stage = mountStage(');
  assert.ok(idxReplace > 0 && idxMount > idxReplace, 'sheet must be mounted into root before mountStage');
  // WS.openPath has live write fallback when turn-end snapshot is not yet available
  assert.match(plusSrc, /const openLiveWrite = \(\) =>/);
});
