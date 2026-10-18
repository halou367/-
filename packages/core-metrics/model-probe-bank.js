import {validateBank} from './model-probe-engine.js';

export const REMOTE_BANK = Object.freeze({
  url: 'https://whatsmyllm.com/data/bank/v2026.09.5.json',
  sha256: 'd21c1413eeac2f5238f37bc97df0299591433c14a1bbd5534546e95697fbd11f',
  label: 'WhatsMyLLM v2026.09.5',
});
export const LOCAL_BANK = Object.freeze({
  url: new URL('./modeltrace-bank.json', import.meta.url).href,
  sha256: 'e514c76928ea38d23bc0f14d3935f23c97b1efb6d96b18a19bdc88ad2d830536',
  label: 'ModelTrace d4131b3（离线后备）',
});

let cached = null;

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function fetchBank(source, remote) {
  const response = await fetch(source.url, {
    method: 'GET', credentials: 'omit', cache: remote ? 'force-cache' : 'no-cache',
    referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!(response.headers.get('content-type') || '').includes('json')) throw new Error('content type');
  const text = await response.text();
  if (text.length > 1500000 || await sha256(text) !== source.sha256) throw new Error('integrity');
  const bank = JSON.parse(text);
  validateBank(bank);
  return bank;
}

/** Loads only data, never remote code. Replies are not part of either request. */
export function loadProbeBank() {
  if (cached) return cached;
  cached = (async () => {
    try {
      const bank = await fetchBank(REMOTE_BANK, true);
      return {bank, info: {source: REMOTE_BANK.label, remote: true, models: bank.models.length}};
    } catch (remoteError) {
      const bank = await fetchBank(LOCAL_BANK, false);
      return {bank, info: {source: LOCAL_BANK.label, remote: false, models: bank.models.length}, remoteError};
    }
  })();
  cached.catch(() => { cached = null; });
  return cached;
}
