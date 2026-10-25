const COST_SKEW_DPLS = [
  'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT',
  'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
];
const CORE_COST_DPLS = new Set(['dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', 'dpl_BcGa9YULV843didEQWsFTd5taD4h']);
const EXPIRED_COST_DPLS = new Set([
  'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
  'dpl_ESfaucDQhCnPyQUz9QQZg82hdgNT',
  'dpl_A8xveHwwqjrHna3G4BNGYY7jqqSu',
  'dpl_9gD8cB3xQ7eTwzU2jLmVpR5kHs1Y',
  'dpl_4NhYCxHezktNSfr9x2GMwqJnbJPa',
  'dpl_Gxhd5ZSm5y3NhjeyXwjCYo8o3ADC',
  'dpl_DaEk6YQDh7utsYDiEtpTgeRc5jct',
  'dpl_6gJxa2MLrLxAx6KcYkVgvMmbV2EA',
  'dpl_D2yWTJ2pjpQeiwvqpbtqDTpsZnY4',
  'dpl_2W47bX6FpYa8XrFCCjzBA2JNNZ4V',
  'dpl_BieRM8wzCXHw6R6ToLUsTdhu4ZBZ',
]);
let activeCostSkewDpl = COST_SKEW_DPLS[0];
let activeCostPathTpl = '/api/chat/{sid}/cost?includeSession=true';
let lastSkewDiscoverAt = 0;

function rememberCostDpl(dpl, verified = false) {
  const d = String(dpl || '').trim();
  if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(d)) return;
  if (verified) {
    EXPIRED_COST_DPLS.delete(d);
    const idx = COST_SKEW_DPLS.indexOf(d);
    if (idx > 0) COST_SKEW_DPLS.splice(idx, 1);
    if (!COST_SKEW_DPLS.includes(d)) COST_SKEW_DPLS.unshift(d);
    activeCostSkewDpl = d;
    try {
      if (DB && typeof DB === 'object') {
        if (!DB.shared || typeof DB.shared !== 'object') DB.shared = {};
        if (!DB.shared.prefs || typeof DB.shared.prefs !== 'object') DB.shared.prefs = {};
        if (DB.shared.prefs.autoCostDpl !== d) {
          DB.shared.prefs.autoCostDpl = d;
          DB.shared.prefs.autoCostPool = COST_SKEW_DPLS.filter(x => !EXPIRED_COST_DPLS.has(x)).slice(0, 12);
          if (typeof saveSoon === 'function') saveSoon();
        }
      }
    } catch {}
    return;
  }
  if (!verified && !CORE_COST_DPLS.has(d)) return;
  if (EXPIRED_COST_DPLS.has(d)) return;
  if (!COST_SKEW_DPLS.includes(d)) COST_SKEW_DPLS.push(d);
}
let lastProtoCost403At = 0;

function demoteCostDpl(dpl) {
  const d = String(dpl || '').trim();
  if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(d) || d === 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT') return;
  const manualPin = String(DB?.shared?.prefs?.pinDpl || '').trim();
  if (manualPin && d === manualPin) return;
  if (!CORE_COST_DPLS.has(d)) {
    EXPIRED_COST_DPLS.add(d);
    const idx = COST_SKEW_DPLS.indexOf(d);
    if (idx >= 0 && COST_SKEW_DPLS.length > 1) COST_SKEW_DPLS.splice(idx, 1);
  } else {
    const idx = COST_SKEW_DPLS.indexOf(d);
    if (idx >= 0 && COST_SKEW_DPLS.length > 1) {
      COST_SKEW_DPLS.splice(idx, 1);
      COST_SKEW_DPLS.push(d);
    }
  }
  if (activeCostSkewDpl === d) {
    const next = COST_SKEW_DPLS.find(x => x !== d && !EXPIRED_COST_DPLS.has(x));
    if (next) activeCostSkewDpl = next;
  }
}

async function discoverFreshCostDpl(ses, force = false) {
  if (!force && Date.now() - lastSkewDiscoverAt < 45000) return null;
  lastSkewDiscoverAt = Date.now();
  // 先强制把 arena_build_bucket=stable 锁定，避免 canary 分桶导致页面和 /cost 不出账单
  try {
    const existing = await ses.cookies.get({ name: 'arena_build_bucket' }).catch(() => []);
    for (const c of existing || []) {
      if (c && (c.value !== 'stable' || c.httpOnly)) {
        const host = String(c.domain || 'arena.ai').replace(/^\.+/, '');
        if (ses?.cookies) await ses.cookies.remove('https://' + host + (c.path || '/'), 'arena_build_bucket').catch(() => {});
      }
    }
    await ses.cookies.set({
      url: 'https://arena.ai',
      name: 'arena_build_bucket',
      value: 'stable',
      path: '/',
      secure: true,
      sameSite: 'lax',
      expirationDate: Math.floor(Date.now() / 1000) + 31536000,
    }).catch(() => {});
  } catch {}
  const discovered = [];
  const collectText = text => {
    const s = String(text || '');
    if (!s) return;
    const patterns = [
      /[?&]dpl=(dpl_[A-Za-z0-9]{16,48})\b/g,
      /\\?"deploymentId\\?"\s*:\s*\\?"(dpl_[A-Za-z0-9]{16,48})\\?"/g,
      /\\?"dpl\\?"\s*:\s*\\?"(dpl_[A-Za-z0-9]{16,48})\\?"/g,
    ];
    for (const re of patterns) {
      for (const m of s.matchAll(re)) {
        const id = m[1];
        if (id && !EXPIRED_COST_DPLS.has(id) && !discovered.includes(id)) {
          discovered.push(id);
          rememberCostDpl(id, false);
        }
      }
    }
  };
  const probeUrls = [
    'https://arena.ai/leaderboard/agent',
    'https://arena.ai/?mode=agent',
    'https://arena.ai/',
  ];
  const fetchOneUrl = async (pUrl) => {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3200);
      const r = await ses.fetch(pUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: ctl.signal,
        headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      }).finally(() => clearTimeout(t));
      const hdrDpl = r.headers.get('x-nextjs-deployment-id') || r.headers.get('x-deployment-id') || '';
      if (/^dpl_[A-Za-z0-9]{16,48}$/.test(hdrDpl) && !EXPIRED_COST_DPLS.has(hdrDpl) && !discovered.includes(hdrDpl)) {
        discovered.push(hdrDpl);
        rememberCostDpl(hdrDpl, false);
      }
      const html = await r.text().catch(() => '');
      collectText(html);
    } catch {}
  };
  await Promise.allSettled(probeUrls.slice(0, 2).map(fetchOneUrl));
  if (!discovered.length && probeUrls[2]) await fetchOneUrl(probeUrls[2]);
  return discovered[0] || null;
}
