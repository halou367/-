const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pricing = require('../ui/arena-trace/pricing.js');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../ui/arena-trace/catalog.json'), 'utf8')).data;

test('v19.0.0 pricing exports AGENT_P50_RATES_1015 and AGENT_P50_RATES_1014 and detects same-model effort downgrade vs cross-model route', () => {
  assert.equal(pricing.AGENT_P50_RATES_1015.epochId, '2026-10-15');
  assert.equal(pricing.AGENT_P50_RATES_1014.epochId, '2026-10-14');

  // 1. Same-model effort weakening (Turn 1: GPT 6.1 Sol xHigh with heavy hidden thinking -> Turn 2: same $10/M rate but zero thinking)
  const effortCaptures = [
    {
      url: 'https://arena.ai/api/chat/s-effort/cost',
      responseBody: JSON.stringify({
        messages: {
          m1: { basePriceUsd: 2000 * 0.435e-6 + 2500 * 0.725e-6, actual: { inputTokensCostUsd: 2000 * 2.0e-6, outputTokensCostUsd: 2500 * 10.0e-6, totalCostUsd: 2000 * 2.0e-6 + 2500 * 10.0e-6 } },
          m2: { basePriceUsd: 2200 * 0.435e-6 + 400 * 0.725e-6, actual: { inputTokensCostUsd: 2200 * 2.0e-6, outputTokensCostUsd: 400 * 10.0e-6, totalCostUsd: 2200 * 2.0e-6 + 400 * 10.0e-6 } },
        },
      }),
    },
  ];
  const effortRes = pricing.inferFromCaptures(effortCaptures, catalog, {
    extraEvidence: {
      toolFamily: 'openai',
      msgVisTokensById: { m1: 300, m2: 390 },
      msgStepCountById: { m1: 1, m2: 1 },
      msgDurationMsById: { m1: 28000, m2: 3200 },
      hasProbePlusHeavyCode: false,
    },
  });
  assert.equal(effortRes.baseMatch.ok, true);
  assert.equal(effortRes.baseMatch.effortDowngraded, true);
  assert.equal(effortRes.baseMatch.routeType, 'effort');
  assert.ok(effortRes.baseMatch.initialEffort);
  assert.ok(effortRes.baseMatch.latestEffort);

  // 2. Cross-model routing (Turn 1: $20/M Opus 5.5 -> Turn 2: $5/M Haiku 5.5)
  const routeCaptures = [
    {
      url: 'https://arena.ai/api/chat/s-route/cost',
      responseBody: JSON.stringify({
        messages: {
          m1: { basePriceUsd: 2000 * 0.435e-6 + 1200 * 0.725e-6, actual: { inputTokensCostUsd: 2000 * 4.0e-6, outputTokensCostUsd: 1200 * 20.0e-6, totalCostUsd: 2000 * 4.0e-6 + 1200 * 20.0e-6 } },
          m2: { basePriceUsd: 2500 * 0.435e-6 + 600 * 0.725e-6, actual: { inputTokensCostUsd: 2500 * 1.0e-6, outputTokensCostUsd: 600 * 5.0e-6, totalCostUsd: 2500 * 1.0e-6 + 600 * 5.0e-6 } },
        },
      }),
    },
  ];
  const routeRes = pricing.inferFromCaptures(routeCaptures, catalog, {
    extraEvidence: {
      toolFamily: 'claude',
      msgVisTokensById: { m1: 400, m2: 550 },
      msgStepCountById: { m1: 1, m2: 1 },
    },
  });
  assert.equal(routeRes.baseMatch.ok, true);
  assert.equal(routeRes.baseMatch.routeSwitched, true);
  assert.equal(routeRes.baseMatch.routeType, 'model');
  assert.ok(routeRes.baseMatch.initialModelLabel);
  assert.ok(routeRes.baseMatch.routedModelLabel);
});

test('Route pause prompt (10s countdown + Settings toggle) and immediate open-source thinking pause', () => {
  const autoRoute = fs.readFileSync(path.join(__dirname, '../ui/auto-route.js'), 'utf8');
  const core = fs.readFileSync(path.join(__dirname, '../ui/core.js'), 'utf8');
  const dock = fs.readFileSync(path.join(__dirname, '../ui/dock.js'), 'utf8');
  const sq = fs.readFileSync(path.join(__dirname, '../ui/send-queue.js'), 'utf8');
  const bpui = fs.readFileSync(path.join(__dirname, '../ui/billing-probe-ui.js'), 'utf8');

  assert.match(autoRoute, /askModelRoute\(chat,\s*\{\s*routeType\s*=\s*'model',\s*fromLabel\s*=\s*'',\s*toLabel\s*=\s*'',\s*reason\s*=\s*'',(?:\s*toTurn\s*=\s*null,)?\s*seconds\s*=\s*10\s*\}/);
  assert.match(autoRoute, /检测到同型号的强度削弱，是否暂停对话？/);
  assert.match(autoRoute, /检测到路由到其他模型，是否暂停对话？/);
  assert.match(dock, /row\('路由弹窗倒计时暂停'/);
  assert.match(dock, /sw\('routePausePrompt',\s*true\)/);
  assert.match(core, /出现开源思考（路由开源模型），自动暂停/);
  assert.match(core, /checkMidStreamRoute\(t,\s*ch\)/);
  assert.match(sq, /chat\._routePaused/);
  assert.match(bpui, /RouteConfirm\.askModelRoute\(chat/);
  assert.match(bpui, /isOpenCandidateName\((?:routeToLabel \|\| best\.id|cleanTo)\)/);
});

test('Mobile account picker card tap, swipe-left delete, and import region-IP auto-matching parity with PC', () => {
  const acc = fs.readFileSync(path.join(__dirname, '../ui/accounts.js'), 'utf8');
  const mgr = fs.readFileSync(path.join(__dirname, '../ui/mgr.js'), 'utf8');
  const mob = fs.readFileSync(path.join(__dirname, '../ui/mobile.js'), 'utf8');

  assert.match(acc, /const flatMode = list\.classList\.contains\('acct-flat'\);/);
  assert.match(acc, /if \(list\.closest\('\.lpick'\)\) return;/);
  assert.match(acc, /if \(!c\) return;\s*\/\/ 任意账号卡片均可左滑删除/);
  assert.match(acc, /Pool\.autoNode\(Nodes\.list\)/);
  assert.match(acc, /Pool\.acquire\(saved,\s*reg/);
  assert.match(acc, /LaunchPick\.cache = null;/);
  assert.match(mgr, /swipe = swipeDel\(list,[\s\S]*?await render\(\);/);
  assert.match(mob, /document\.querySelector\('\.lpick:not\(\.out\)'\)/);
});

test('Billing endpoint HTTP 401 fallback, relogin recovery, and native cookie headers', () => {
  const bp = fs.readFileSync(path.join(__dirname, '../ui/billing-probe.js'), 'utf8');
  const bpui = fs.readFileSync(path.join(__dirname, '../ui/billing-probe-ui.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const java = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');

  assert.match(bpui, /runFallbackWithRelogin/);
  assert.match(bpui, /if \(r\.status === 401 \|\| r\.status === 403\)\s*\{\s*return await runFallbackWithRelogin\(path,\s*options\);/);
  assert.match(bp, /e\.status === 403 \? 120000 : e\.status === 401 \? 15000/);
  assert.match(main, /ses\.cookies\.get\(\{\s*url:\s*'https:\/\/arena\.ai'\s*\}\)/);
  assert.match(java, /CountDownLatch\(1\)/);
  assert.match(java, /ph-toolbar-overrides=%7B%22credit-system-m1%22%3A%22cost-shown%22%7D/);
});

test('One-shot billing lock, route/effort UI sync across all surfaces, (High) (High) deduplication, and per-bash route marker', () => {
  const bp = fs.readFileSync(path.join(__dirname, '../ui/billing-probe.js'), 'utf8');
  const bpui = fs.readFileSync(path.join(__dirname, '../ui/billing-probe-ui.js'), 'utf8');
  const strength = fs.readFileSync(path.join(__dirname, '../ui/strength.js'), 'utf8');
  const cl = fs.readFileSync(path.join(__dirname, '../ui/conversation-labels.js'), 'utf8');
  const ts = fs.readFileSync(path.join(__dirname, '../ui/title-sync.js'), 'utf8');
  const dock = fs.readFileSync(path.join(__dirname, '../ui/dock.js'), 'utf8');
  const view = fs.readFileSync(path.join(__dirname, '../ui/view.js'), 'utf8');
  const core = fs.readFileSync(path.join(__dirname, '../ui/core.js'), 'utf8');

  // 1. diagnostics() includes row.dynamicLabel when routed/weakened and cleans duplicate (High) (High) suffixes
  assert.match(bp, /cleanModelLabel\(row\.effortProfile\?\.stealthModelLabel \|\| \(isRoutedOrWeak \? row\.dynamicLabel : null\) \|\| row\.label \|\| candId\)/);
  assert.match(bp, /const i = state\.info \|\| state\.lastInfo/);

  // 2. One-shot post-turn lock & no mid-stream polling
  assert.match(bpui, /function probeMidTurn\(chat\)\s*\{\s*if \(!autoEnabled\(\) \|\| !chat\?\.sid \|\| chat\?\.busy/);
  assert.match(bpui, /if \(!uncovered && stNow\.status === 'ready' && stNow\.info && !stNow\.info\.reason\)/);
  assert.match(bpui, /reverseCandidates:\s*Array\.isArray\(sum\.mergedCandidates\)/);

  // 3. Route/effort weakening synchronization across Models, Strength, ConversationLabels, TitleSync, Dock, and View
  assert.match(bpui, /detectMessageRouteStep\(latest,\s*cleanFrom,\s*cleanTo,\s*routeType,\s*runningToolFam\)/);
  assert.match(bpui, /Strength\.noteReverse\(sid,\s*nextEntry\)/);
  assert.match(bpui, /路由提示：对话疑似 \$\{(?:suspectedModel|toShort)\}`/);
  assert.match(strength, /function noteReverse\(sid,\s*entry\)/);
  assert.match(cl, /if \(entry\?\.routed\)\s*\{\s*const r = sane\(entry\?\.reverseScore\);/);
  assert.match(ts, /const score = \(mi\?\.routed \? sane\(mi\?\.reverseScore\) : null\)/);
  assert.match(dock, /m\?\.routed && savedModelName/);
  assert.match(view, /tr-route-tag/);
  assert.match(view, /`路由提示：对话疑似 \$\{p\._routeStart\.toLabel\}`/);
  assert.match(view, /路由提示：对话疑似 \$\{suspectedModel\}(?:\$\{stepSuffix\})?`;/);
  assert.match(view, /msg-turn-model/);

  // 4. Background /cost requests respect ReadLimit (no bg:false override)
  assert.ok(!core.includes('if (isCost && opt.bg) opt = { ...opt, bg: false };'));

  // 5. Interactive card direct-send auto-skip (ask_user / propose_plan / add_voice / generate_image)
  assert.match(core, /if \(n === 'ask_user'\) return \{ skipped: true, answers: \[\] \};/);
  assert.match(core, /if \(n === 'propose_plan'\) return \{ decision: 'no_decision' \};/);
  assert.match(core, /return this\.skipHitlSend\(text, opt\);/);
  assert.match(view, /if \(Hitl\.blocked\(c\) \|\| c\?\._qBusy\)/);
});
