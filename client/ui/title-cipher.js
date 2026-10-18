// Versioned, authenticated title envelope. Passphrases/keys stay in memory, never Store/Host.shared.
// Word encoding is reversible transport, not a claim that ciphertext is natural language.
const TitleCipher = (() => {
  const PREFIX = 'Quiet stories begin.';
  const DEFAULT_PASSPHRASE = '755287249'; // User-selected shared default, NOT a private secret.
  const WORDS = 'able acorn actor adobe after agile ahead aisle album alert alive amber angel apple apron arbor brana argue arise arrow atlas audio autumn awake azure badge baker basic basil beach beard beast began berry birth black blade blaze blend bliss bloom blue board bonus boost brain brave bread brick bride brief bring brisk broad brook brown brush build cabin cable cacao camel canal candy canoe cargo cedar chain chair chalk charm chase chess chest child choir cider city clear cliff climb clock cloud coast coral couch crane creek crest crisp crown curve dance dawn delta depth diary diner diver dream drift drink drive eagle earth ebony echo elder elite elm ember enjoy enter equal event exact extra fable fairy faith fancy feast field final finch first flame flash fleet float flora flute focus force forest forge forth frame fresh frost fruit fully funny garden gate gentle giant gift given glass globe glory glow gold grace grain grand grape grass great green grove guard guess guest guide habit happy hardy haste haven hazel heart hedge heron honey honor horse hotel house human hum joy judge juice jump kayak keen kite known label lake lamb large laser later laugh layer leaf learn lemon light lilac limit linen little live local logic lotus loyal lucky lunar lunch lyric magic major mango maple march marsh match meadow melon merry metal mild mint model money month moral moss motor mount mouse music myth neat never new night noble north novel nurse oasis ocean olive onion opera orbit order other otter outer'.split(' ');
  const INDEX = new Map(WORDS.map((word, i) => [word, i]));
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
  const ITERATIONS = 310000, MAX_TITLE = 12000, MAX_DATA = 2048;
  let secret = '', epoch = 0, ownSalt = null;
  const keys = new Map();
  const random = n => crypto.getRandomValues(new Uint8Array(n));
  function isEncoded(text) { return TitleCompact.isEncoded(text) || String(text || '').toLowerCase().startsWith(PREFIX.toLowerCase()); }
  function encode(bytes) {
    const words = [...bytes].map(n => WORDS[n]);
    return PREFIX + ' ' + words.map((word, i) => word + ((i + 1) % 12 === 0 || i === words.length - 1 ? '.' : '')).join(' ');
  }
  function decode(text) {
    if (!isEncoded(text) || text.length > MAX_TITLE) throw Error('不是支持的加密标题，或标题过长');
    const words = text.slice(PREFIX.length).toLowerCase().replace(/\./g, '').trim().split(/\s+/);
    if (words.length < 46 || words.length > MAX_DATA + 64 || words.some(w => !INDEX.has(w))) throw Error('加密标题损坏或被截断，保留云端原名');
    return Uint8Array.from(words, w => INDEX.get(w));
  }
  async function keyFor(salt, generation, version=1) {
    if (!secret || generation !== epoch) throw Error('名称同步尚未解锁');
    const id = version+':'+[...salt].join(',');
    if(version===2||version===3||version===4){const domain=encoder.encode('arena-client-title:v'+version+':');const combined=new Uint8Array(domain.length+salt.length);combined.set(domain);combined.set(salt,domain.length);salt=combined;}
    let p = keys.get(id);
    if (!p) {
      const phrase = secret;
      p = (async () => {
        const material = await crypto.subtle.importKey('raw', encoder.encode(phrase), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      })();
      if (keys.size >= 64) keys.delete(keys.keys().next().value);
      keys.set(id, p);
    }
    const key = await p;
    if (generation !== epoch || !secret) throw Error('口令已改变，操作取消');
    return key;
  }
  function unlock(passphrase) {
    if (!crypto?.subtle) throw Error('当前环境不支持 Web Crypto，请升级客户端或系统 WebView');
    if (typeof passphrase !== 'string' || passphrase.length < 7 || passphrase.length > 512) throw Error('口令需要 7–512 个字符；建议使用独特的长口令');
    secret = passphrase.normalize('NFC'); epoch++; keys.clear(); ownSalt = random(16);
  }
  function lock() { secret = ''; ownSalt = null; keys.clear(); epoch++; }
  const aad = sid => { if (!/^[\w-]{1,128}$/.test(sid || '')) throw Error('缺少有效对话 ID'); return encoder.encode('arena-client-title:v1:' + sid); };
  const aadV2 = sid => { aad(sid);return encoder.encode('arena-client-title:v2:'+sid); };
  const aadV3 = sid => { aad(sid);return encoder.encode('arena-client-title:v3:'+sid); };
  const aadV4 = sid => { aad(sid);return encoder.encode('arena-client-title:v4:'+sid); };
  // New titles: v3 "Qy " frame (known ids + original names of unlisted models). v2 "Qz " stays readable.
  // v4 "Qx " frame: same model data plus favourite flag and note (still exactly 100 characters).
  async function encrypt4(sid, payload, ext) {
    const generation=epoch;
    if(!secret)throw Error('请先解锁名称同步口令；不会发送明文');
    const plain=TitleCompact.pack4(payload,ext);
    const salt=ownSalt.slice(0,4),nonce=random(6),iv=new Uint8Array(12);iv.set(nonce);
    const key=await keyFor(salt,generation,4);
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aadV4(sid),tagLength:64},key,plain));
    if(generation!==epoch)throw Error('口令已改变，操作取消');
    const bytes=new Uint8Array(TitleCompact.FRAME4);bytes.set(salt);bytes.set(nonce,4);bytes.set(ciphertext,10);
    const title=TitleCompact.encode4(bytes);
    if(title.length!==100)throw Error('内部定长编码错误');
    return title;
  }
  async function encrypt(sid, payload, ext) {
    if(ext&&(ext.note||ext.fav||ext.v4))return encrypt4(sid,payload,ext);
    const generation=epoch;
    if(!secret)throw Error('请先解锁名称同步口令；不会发送明文');
    const plain=TitleCompact.pack3(payload);
    const salt=ownSalt.slice(0,4),nonce=random(6),iv=new Uint8Array(12);iv.set(nonce);
    const key=await keyFor(salt,generation,3);
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aadV3(sid),tagLength:64},key,plain));
    if(generation!==epoch)throw Error('口令已改变，操作取消');
    const bytes=new Uint8Array(49);bytes.set(salt);bytes.set(nonce,4);bytes.set(ciphertext,10);
    const title=TitleCompact.encode3(bytes);
    if(title.length!==100)throw Error('内部定长编码错误');
    return title;
  }
  async function decryptCompact(sid,title){
    const generation=epoch,{version,bytes}=TitleCompact.decodeAny(title);
    if(version===4){
      const key=await keyFor(bytes.slice(0,4),generation,4),iv=new Uint8Array(12);iv.set(bytes.slice(4,10));
      let plain;
      try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aadV4(sid),tagLength:64},key,bytes.slice(10));}
      catch{throw Error('口令不匹配、对话 ID 不匹配或密文被修改；不会覆盖云端名称');}
      if(generation!==epoch)throw Error('口令已改变，操作取消');
      const x=TitleCompact.unpack4(new Uint8Array(plain)),v=x.value.slice();v[6]=x.note;v.fav=x.fav;v.v4=true;return v;
    }
    if(version===3){
      const key=await keyFor(bytes.slice(0,4),generation,3),iv=new Uint8Array(12);iv.set(bytes.slice(4,10));
      let plain;
      try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aadV3(sid),tagLength:64},key,bytes.slice(10));}
      catch{throw Error('口令不匹配、对话 ID 不匹配或密文被修改；不会覆盖云端名称');}
      if(generation!==epoch)throw Error('口令已改变，操作取消');
      return TitleCompact.unpack3(new Uint8Array(plain));
    }
    const key=await keyFor(bytes.slice(0,8),generation,2);
    let plain;
    try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(8,20),additionalData:aadV2(sid),tagLength:128},key,bytes.slice(20));}
    catch{throw Error('口令不匹配、对话 ID 不匹配或密文被修改；不会覆盖云端名称');}
    if(generation!==epoch)throw Error('口令已改变，操作取消');
    const plainBytes = new Uint8Array(plain);
    if (typeof TitleFlex !== 'undefined' && TitleFlex.isFlex(plainBytes)) {
      return TitleFlex.unpack(plainBytes);
    }
    return TitleCompact.unpack(plainBytes);
  }
  async function decrypt(sid, title) {
    if(TitleCompact.isEncoded(title))return decryptCompact(sid,title);
    const generation = epoch, bytes = decode(title);
    if (bytes[0] !== 1) throw Error('不支持的加密标题版本');
    const key = await keyFor(bytes.slice(1, 17), generation);
    let plain;
    try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(17, 29), additionalData: aad(sid), tagLength: 128 }, key, bytes.slice(29)); }
    catch { throw Error('口令不匹配、对话 ID 不匹配或密文被修改；不会覆盖云端名称'); }
    if (generation !== epoch) throw Error('口令已改变，操作取消');
    if (plain.byteLength > MAX_DATA) throw Error('解密内容过长');
    return JSON.parse(decoder.decode(plain));
  }
  // ---------- 轻量级收藏 / 金色传说专属加密前缀（⟦...⟧ 原有标题，仅对收藏或金色传说对话生效，避免全量改名封号）----------
  const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const B62_MAP = new Map([...B62].map((c, i) => [c, i]));
  const GOLD_PFX_RE = /^⟦([0-9A-Za-z]{4,72})⟧(?:\s+|$)([\s\S]*)$/;
  const EXTRA_MODELS = [
    'claude-opus-5.6-max', 'claude-opus-5.6-high', 'claude-opus-5.6-medium', 'claude-opus-5.6',
    'claude-sonnet-5.5-max', 'claude-sonnet-5.5-high', 'claude-sonnet-5.5-medium', 'claude-sonnet-5.5',
    'claude-haiku-5.5', 'claude-fable-5-high', 'claude-fable-5.1-max', 'claude-fable-5.1-high',
    'gpt-6.1-sol-max', 'gpt-6.1-sol-xhigh', 'gpt-6.1-sol-high', 'gpt-6.1-sol-medium', 'gpt-6.1-sol',
    'gpt-6-astra-max', 'gpt-6-astra-xhigh', 'gpt-6-astra-high', 'gpt-6-astra-medium', 'gpt-6-astra',
    'gpt-6-sol-max', 'gpt-6-sol-xhigh', 'gpt-6-sol-high', 'gpt-6-sol-medium', 'gpt-6-sol',
    'gpt-6-luna-high', 'gpt-6-luna-medium', 'gpt-6-luna-low', 'gpt-6-luna',
    'gemini-4-argon-high', 'gemini-4-argon-medium', 'gemini-4-argon',
    'deepseek-v4.1-flash', 'deepseek-v4.1',
  ];
  function fnv32(str, h = 0x811c9dc5) {
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function streamByte(keySeed, idx) {
    return (fnv32(keySeed + '#' + (idx >> 2)) >>> ((idx & 3) * 8)) & 0xff;
  }
  function toB62(bytes) {
    let n = 1n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let out = '';
    while (n > 0n) { out = B62[Number(n % 62n)] + out; n /= 62n; }
    return out;
  }
  function fromB62(str) {
    let n = 0n;
    for (const c of String(str || '')) {
      const v = B62_MAP.get(c);
      if (v === undefined) return null;
      n = n * 62n + BigInt(v);
    }
    if (n <= 1n) return null;
    const arr = [];
    while (n > 1n) { arr.push(Number(n & 0xffn)); n >>= 8n; }
    if (n !== 1n) return null;
    return Uint8Array.from(arr.reverse());
  }
  function decodeGoldPrefix(rawTitle) {
    const m = GOLD_PFX_RE.exec(String(rawTitle || ''));
    if (!m) return null;
    const enc = fromB62(m[1]);
    if (!enc || enc.length < 3) return null;
    const pfxKey = 'arena-gp:v1:' + DEFAULT_PASSPHRASE;
    const mac = (enc[0] << 8) | enc[1];
    const plain = new Array(enc.length - 2);
    for (let i = 0; i < plain.length; i++) plain[i] = enc[2 + i] ^ streamByte(pfxKey + ':enc:' + mac, i);
    if (((fnv32(pfxKey + ':mac:' + plain.join(',')) & 0xffff) !== mac) || ((plain[0] >> 5) !== 1)) return null;
    const flags = plain[0], fav = !!(flags & 1), gold = !!(flags & 2);
    let pos = 1, model = '', score = null;
    const baseList = TitleCompact.models || [];
    if (flags & 4) {
      if (pos + 2 > plain.length) return null;
      const idx = (plain[pos] << 8) | plain[pos + 1]; pos += 2;
      if (idx < baseList.length) model = baseList[idx] || '';
      else if (idx - baseList.length < EXTRA_MODELS.length) model = EXTRA_MODELS[idx - baseList.length] || '';
    } else if (flags & 8) {
      if (pos + 1 > plain.length) return null;
      const len = plain[pos++];
      if (pos + len > plain.length) return null;
      try { model = decoder.decode(Uint8Array.from(plain.slice(pos, pos + len))); } catch { return null; }
      pos += len;
    }
    if (flags & 16) {
      if (pos + 2 > plain.length) return null;
      score = ((plain[pos] << 8) | plain[pos + 1]) / 10;
      pos += 2;
    }
    return { v: 1, fav, gold, model, score, prefix: '⟦' + m[1] + '⟧', cleanTitle: String(m[2] || '').trim() };
  }
  function stripGoldPrefix(rawTitle) {
    let cur = String(rawTitle || '');
    for (let i = 0; i < 3; i++) {
      const d = decodeGoldPrefix(cur);
      if (!d) break;
      cur = d.cleanTitle;
    }
    return cur;
  }
  function isGoldPrefixed(rawTitle) { return !!decodeGoldPrefix(rawTitle); }
  function encodeGoldPrefix(sid, meta = {}, origTitle = '') {
    const clean = stripGoldPrefix(origTitle).trim() || '新对话';
    const fav = !!meta?.fav, gold = !!(meta?.gold || fav);
    let model = String(meta?.model || '').trim().toLowerCase().replace(/[（(][^）)]*[）)]/g, '').replace(/[?？\s]+$/g, '').trim().replace(/\s+/g, '-');
    if (model === '未识别' || model === '待定' || model === '未知') model = '';
    const baseList = TitleCompact.models || [];
    let mIdx = model ? baseList.indexOf(model) : -1;
    if (mIdx < 0 && model) { const ei = EXTRA_MODELS.indexOf(model); if (ei >= 0) mIdx = baseList.length + ei; }
    const mBytes = (mIdx < 0 && model) ? encoder.encode(model.slice(0, 32)) : null;
    const hasScore = Number.isFinite(meta?.score) && meta.score >= 0 && meta.score <= 1000;
    const sc10 = hasScore ? Math.min(10000, Math.round(Number(meta.score) * 10)) : 0;
    const flags = (1 << 5) | (fav ? 1 : 0) | (gold ? 2 : 0) | (mIdx >= 0 ? 4 : 0) | (mBytes?.length ? 8 : 0) | (hasScore ? 16 : 0);
    const plain = [flags];
    if (mIdx >= 0) plain.push((mIdx >> 8) & 0xff, mIdx & 0xff);
    else if (mBytes?.length) plain.push(mBytes.length & 0xff, ...mBytes);
    if (hasScore) plain.push((sc10 >> 8) & 0xff, sc10 & 0xff);
    const pfxKey = 'arena-gp:v1:' + DEFAULT_PASSPHRASE;
    const mac = fnv32(pfxKey + ':mac:' + plain.join(',')) & 0xffff;
    const enc = new Uint8Array(2 + plain.length);
    enc[0] = (mac >> 8) & 0xff; enc[1] = mac & 0xff;
    for (let i = 0; i < plain.length; i++) enc[2 + i] = plain[i] ^ streamByte(pfxKey + ':enc:' + mac, i);
    const tag = '⟦' + toB62(enc) + '⟧';
    const full = clean ? (tag + ' ' + clean) : tag;
    return full.length > 120 ? full.slice(0, 120) : full;
  }
  return { PREFIX, DEFAULT_PASSPHRASE, isCompact:TitleCompact.isExact, isEncoded, isGoldPrefixed, encodeGoldPrefix, decodeGoldPrefix, stripGoldPrefix, encrypt, decrypt, unlock, lock, get unlocked() { return !!secret; }, get generation() { return epoch; } };
})();
