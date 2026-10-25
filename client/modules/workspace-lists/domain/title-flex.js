// TitleFlex: Extended 100-character payload support for scores up to 26,214.3 (including 8971.3)
// and unpreset model identification. Fits in exactly 13 data bytes (49 frame bytes / 100 chars).
const TitleFlex = (() => {
  const DATA_BYTES = 13;
  const MAX_SCORE = 26214.3;
  const MAX_AVG = 1638.3;

  function isFlex(bytes) {
    if (!bytes || bytes.length !== DATA_BYTES) return false;
    return (bytes[DATA_BYTES - 1] & 0x30) === 0x30;
  }

  function pack(value) {
    if (!Array.isArray(value) || value.length !== 10) {
      throw Object.assign(Error('名称字段结构不兼容'), { status: 422 });
    }
    const [, name, confidence, score, average, time, , tier, source] = value;
    const parts = { base: String(name || '').replace(/[?？]+$/, '').trim() };
    const TIERS = typeof TitleCompact !== 'undefined' ? TitleCompact.tiers : [];
    const MODELS = typeof TitleCompact !== 'undefined' ? TitleCompact.models : [];
    const SOURCES = ['local', 'fingerprint', 'api'];

    let id = MODELS.indexOf(parts.base);
    if (id < 0) {
      // Find matching family
      const lower = parts.base.toLowerCase();
      const match = MODELS.find(m => lower === m || lower.startsWith(m + '-') || lower.includes(m));
      id = match ? MODELS.indexOf(match) : 0;
    }

    const sVal = score === null || score === undefined ? 262143 : Math.min(262142, Math.max(0, Math.round(score * 10)));
    const aVal = average === null || average === undefined ? 16383 : Math.min(16382, Math.max(0, Math.round(average * 10)));
    const cVal = confidence === null || confidence === undefined ? 1023 : Math.min(1000, Math.max(0, Math.round(confidence * 1000)));
    const tierIdx = Math.max(0, TIERS.indexOf(String(tier || '').toLowerCase()));
    const srcIdx = Math.max(0, SOURCES.indexOf(String(source || '').toLowerCase()));
    const tVal = Number.isSafeInteger(time) && time >= 0 ? time : Date.now();

    const fields = [
      [id, 12],
      [cVal, 10],
      [sVal, 18],
      [aVal, 14],
      [tVal, 42],
      [srcIdx, 2],
      [3, 2], // Markers for TitleCompact to reject and TitleFlex to detect
      [tierIdx, 4]
    ];

    let n = 0n;
    for (const [val, bits] of fields) n = (n << BigInt(bits)) | BigInt(val);
    const bytes = new Uint8Array(DATA_BYTES);
    for (let i = DATA_BYTES - 1; i >= 0; i--) {
      bytes[i] = Number(n & 255n);
      n >>= 8n;
    }
    return bytes;
  }

  function unpack(bytes) {
    if (!bytes || bytes.length !== DATA_BYTES) {
      throw Object.assign(Error('定长名称数据损坏'), { status: 422 });
    }
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    const take = bits => {
      const v = Number(n & ((1n << BigInt(bits)) - 1n));
      n >>= BigInt(bits);
      return v;
    };
    const TIERS = typeof TitleCompact !== 'undefined' ? TitleCompact.tiers : [];
    const MODELS = typeof TitleCompact !== 'undefined' ? TitleCompact.models : [];
    const SOURCES = ['local', 'fingerprint', 'api'];

    const tierIdx = take(4);
    const flag = take(2);
    const srcIdx = take(2);
    const time = take(42);
    const aVal = take(14);
    const sVal = take(18);
    const cVal = take(10);
    const id = take(12);

    const model = MODELS[id] || '未知';
    const conf = cVal === 1023 ? null : cVal / 1000;
    const score = sVal === 262143 ? null : Number((sVal / 10).toFixed(1));
    const avg = aVal === 16383 ? null : Number((aVal / 10).toFixed(1));
    const tier = TIERS[tierIdx] || '';
    const src = SOURCES[srcIdx] || 'local';

    return [2, model, conf, score, avg, time, '', tier, src, time];
  }

  return { isFlex, pack, unpack, MAX_SCORE, MAX_AVG };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TitleFlex;
