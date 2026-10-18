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
  function isEncoded(text) { return String(text || '').toLowerCase().startsWith(PREFIX.toLowerCase()); }
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
  async function keyFor(salt, generation) {
    if (!secret || generation !== epoch) throw Error('名称同步尚未解锁');
    const id = [...salt].join(',');
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
    if (typeof passphrase !== 'string' || passphrase.length < 9 || passphrase.length > 512) throw Error('口令需要 9–512 个字符；建议使用独特的长口令');
    secret = passphrase.normalize('NFC'); epoch++; keys.clear(); ownSalt = random(16);
  }
  function lock() { secret = ''; ownSalt = null; keys.clear(); epoch++; }
  const aad = sid => { if (!/^[\w-]{1,128}$/.test(sid || '')) throw Error('缺少有效对话 ID'); return encoder.encode('arena-client-title:v1:' + sid); };
  async function encrypt(sid, payload) {
    const generation = epoch;
    if (!secret) throw Error('请先设置名称同步口令；不会同步明文');
    const plain = encoder.encode(JSON.stringify(payload));
    if (plain.length > MAX_DATA) throw Error('名称同步信息过长，已保留本地，不会截断或回退明文');
    const salt = ownSalt.slice(), iv = random(12), key = await keyFor(salt, generation);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(sid), tagLength: 128 }, key, plain));
    if (generation !== epoch) throw Error('口令已改变，操作取消');
    const bytes = new Uint8Array(29 + ciphertext.length); bytes[0] = 1; bytes.set(salt, 1); bytes.set(iv, 17); bytes.set(ciphertext, 29);
    const title = encode(bytes); if (title.length > MAX_TITLE) throw Error('加密标题过长，未同步'); return title;
  }
  async function decrypt(sid, title) {
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
  return { PREFIX, DEFAULT_PASSPHRASE, isEncoded, encrypt, decrypt, unlock, lock, get unlocked() { return !!secret; }, get generation() { return epoch; } };
})();
