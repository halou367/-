'use strict';

const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 40 * 1024 * 1024;
const MAX_MEDIA_COUNT = 12;
const MAX_OUTPUT_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_STORED_MEDIA_BYTES = 96 * 1024 * 1024;
const MAX_STORED_MEDIA_ITEMS = 80;
const MEDIA_TTL_MS = 30 * 60 * 1000;

function apiError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function cleanMime(value, fallback = 'application/octet-stream') {
  const raw = String(value || '').split(';')[0].trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw === 'audio/x-wav' || raw === 'audio/wave') return 'audio/wav';
  return raw;
}

function defaultMimeForType(type) {
  if (type === 'image') return 'image/png';
  if (type === 'video') return 'video/mp4';
  if (type === 'audio') return 'audio/wav';
  return 'application/octet-stream';
}

function mediaTypeForMime(mime, fallback = 'file') {
  const value = cleanMime(mime, '');
  if (value.startsWith('image/')) return 'image';
  if (value.startsWith('video/')) return 'video';
  if (value.startsWith('audio/')) return 'audio';
  return fallback || 'file';
}

function safeMediaName(name, type, mimeType) {
  let value = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim().slice(0, 120);
  if (value) return value;
  const ext = ({
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/flac': 'flac',
  })[cleanMime(mimeType, '')] || 'bin';
  return (type === 'image' ? 'api-image' : type === 'video' ? 'api-video' : type === 'audio' ? 'api-audio' : 'api-file') + '.' + ext;
}

function dataUrlInfo(value, maxBytes = MAX_MEDIA_BYTES) {
  const raw = String(value || '');
  const match = /^data:([^,]*?),(.*)$/is.exec(raw);
  if (!match) return null;
  const header = match[1] || '';
  const params = header.split(';');
  const mimeType = cleanMime(params.shift(), 'application/octet-stream');
  const isBase64 = params.some(x => String(x).trim().toLowerCase() === 'base64');
  let buffer;
  if (isBase64) {
    const payload = String(match[2] || '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const estimate = Math.floor(payload.replace(/=+$/, '').length * 3 / 4);
    if (estimate > maxBytes) throw apiError('单个多模态附件超过 20 MB 限制', 413);
    buffer = Buffer.from(payload, 'base64');
  } else {
    let decoded;
    try { decoded = decodeURIComponent(match[2] || ''); }
    catch { throw apiError('data URI 格式无效', 400); }
    if (Buffer.byteLength(decoded) > maxBytes) throw apiError('单个多模态附件超过 20 MB 限制', 413);
    buffer = Buffer.from(decoded, 'utf8');
  }
  if (buffer.length > maxBytes) throw apiError('单个多模态附件超过 20 MB 限制', 413);
  return { dataUrl: raw, mimeType, buffer };
}

function addMedia(list, requestedType, rawValue, mimeType, name, rawIsBase64 = false) {
  if (rawValue == null) return false;
  let value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) return false;
  let mime = cleanMime(mimeType, defaultMimeForType(requestedType));
  if (/^data:/i.test(value)) {
    const header = /^data:([^,]*),/i.exec(value)?.[1] || '';
    const embeddedMime = header.split(';')[0];
    if (embeddedMime) mime = cleanMime(embeddedMime, mime);
  } else if (rawIsBase64) {
    value = 'data:' + mime + ';base64,' + value.replace(/\s+/g, '');
  }
  const type = mediaTypeForMime(mime, requestedType || 'file');
  const entry = { type, mimeType: mime, name: safeMediaName(name, type, mime) };
  if (/^data:/i.test(value)) entry.dataUrl = value;
  else if (/^https?:\/\//i.test(value) || /^gs:\/\//i.test(value)) entry.url = value;
  else return false;
  list.push(entry);
  return true;
}

function audioMimeForFormat(format) {
  const f = String(format || '').toLowerCase().replace(/^\./, '');
  return ({ wav: 'audio/wav', mp3: 'audio/mpeg', mpeg: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
    aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', pcm: 'audio/pcm', pcm16: 'audio/pcm' })[f] || 'audio/wav';
}

function normalizeIncomingRequest(req, urlObj, body, state = {}) {
  const pathname = String(urlObj?.pathname || '/').replace(/\/+$/, '') || '/';
  const headers = req?.headers || {};
  let protocol = 'openai';
  const gemMatch = pathname.match(/\/models\/([^/:]+):(streamGenerateContent|generateContent)$/i);
  if (gemMatch) protocol = 'gemini';
  else if (/\/(?:v1\/)?messages$/i.test(pathname) || headers['anthropic-version']) protocol = 'anthropic';
  else if (/\/(?:v1\/)?responses$/i.test(pathname)) protocol = 'openai-responses';
  else if (/\/(?:v1\/)?auto$/i.test(pathname)) {
    if (Array.isArray(body?.contents)) protocol = 'gemini';
    else if (headers['anthropic-version'] || (body?.system !== undefined && Array.isArray(body?.messages))) protocol = 'anthropic';
    else if (body?.input !== undefined && !Array.isArray(body?.messages)) protocol = 'openai-responses';
  }

  let pathModel = '';
  if (gemMatch) { try { pathModel = decodeURIComponent(gemMatch[1]); } catch { pathModel = gemMatch[1]; } }
  const model = String(body?.model || pathModel || state.modelId || 'brana-current').trim();
  let stream = Boolean(body?.stream);
  if (protocol === 'gemini' && gemMatch) {
    stream = /^streamGenerateContent$/i.test(gemMatch[2]) || urlObj.searchParams.get('alt') === 'sse' || Boolean(body?.stream);
  }

  let systemText = '';
  const messages = [];
  const tools = [];
  const pushToolMessage = (toolCallId, content, isError = false) => messages.push({
    role: 'tool', toolCallId: String(toolCallId || 'tool'), isError: Boolean(isError), content: String(content ?? ''), toolCalls: [], media: [],
  });
  const pushMessage = (role, content, toolCalls = [], media = []) => {
    if (content || toolCalls.length || media.length) messages.push({ role, content: String(content || ''), toolCalls, media });
  };
  const pushTool = (name, description, parameters) => {
    if (!name) return;
    tools.push({ name: String(name), description: String(description || ''), parameters: parameters || { type: 'object', properties: {} } });
  };

  if (protocol === 'anthropic') {
    if (typeof body?.system === 'string') systemText = body.system.trim();
    else if (Array.isArray(body?.system)) {
      systemText = body.system.map(x => typeof x === 'string' ? x : String(x?.text || '')).filter(Boolean).join('\n\n').trim();
    }
    for (const m of (Array.isArray(body?.messages) ? body.messages : [])) {
      if (!m || !m.role) continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const textParts = [], toolCalls = [], toolResults = [], media = [];
      if (typeof m.content === 'string') textParts.push(m.content);
      else if (Array.isArray(m.content)) {
        for (const blk of m.content) {
          if (!blk) continue;
          if (blk.type === 'text' && blk.text) textParts.push(String(blk.text));
          else if (blk.type === 'tool_use') {
            toolCalls.push({ id: String(blk.id || ('toolu_' + crypto.randomBytes(6).toString('hex'))), name: String(blk.name || 'tool'), arguments: typeof blk.input === 'string' ? blk.input : JSON.stringify(blk.input || {}) });
          } else if (blk.type === 'tool_result') {
            const result = typeof blk.content === 'string' ? blk.content : Array.isArray(blk.content)
              ? blk.content.map(c => typeof c === 'string' ? c : String(c?.text || JSON.stringify(c))).join('\n')
              : JSON.stringify(blk.content ?? '');
            toolResults.push({ toolCallId: String(blk.tool_use_id || ''), isError: Boolean(blk.is_error), content: result });
          } else if (blk.type === 'image' || blk.type === 'video' || blk.type === 'audio' || blk.type === 'document') {
            const src = blk.source || {};
            const type = blk.type === 'document' ? 'file' : blk.type;
            const raw = src.data || src.url || blk.data || blk.url;
            const mime = src.media_type || src.mime_type || blk.mimeType || blk.contentType || defaultMimeForType(type);
            addMedia(media, type, raw, mime, blk.name || src.name || type + '-attachment', src.type === 'base64' || Boolean(src.data && !src.url));
          }
        }
      }
      for (const tr of toolResults) pushToolMessage(tr.toolCallId, tr.content, tr.isError);
      pushMessage(role, textParts.join('\n'), toolCalls, media);
    }
    for (const t of (Array.isArray(body?.tools) ? body.tools : [])) pushTool(t?.name, t?.description, t?.input_schema || t?.parameters);
  } else if (protocol === 'gemini') {
    const sysInst = body?.systemInstruction || body?.system_instruction;
    if (sysInst) {
      const parts = Array.isArray(sysInst.parts) ? sysInst.parts : [sysInst];
      systemText = parts.map(p => String(p?.text || '')).filter(Boolean).join('\n\n').trim();
    }
    for (const c of (Array.isArray(body?.contents) ? body.contents : [])) {
      if (!c) continue;
      const role = c.role === 'model' || c.role === 'assistant' ? 'assistant' : 'user';
      const textParts = [], toolCalls = [], media = [];
      for (const part of (Array.isArray(c.parts) ? c.parts : [])) {
        if (!part) continue;
        if (typeof part.text === 'string' && !part.thought) textParts.push(part.text);
        const inline = part.inlineData || part.inline_data;
        if (inline?.data) addMedia(media, mediaTypeForMime(inline.mimeType || inline.mime_type, 'file'), inline.data, inline.mimeType || inline.mime_type, part.name, true);
        const fileData = part.fileData || part.file_data;
        if (fileData?.fileUri || fileData?.file_uri) addMedia(media, mediaTypeForMime(fileData.mimeType || fileData.mime_type, 'file'), fileData.fileUri || fileData.file_uri, fileData.mimeType || fileData.mime_type, part.name);
        if (part.functionCall) toolCalls.push({ id: 'call_' + crypto.randomBytes(6).toString('hex'), name: String(part.functionCall.name || 'tool'), arguments: JSON.stringify(part.functionCall.args || {}) });
        if (part.functionResponse) pushToolMessage(part.functionResponse.name || 'tool', typeof part.functionResponse.response === 'string' ? part.functionResponse.response : JSON.stringify(part.functionResponse.response || {}));
      }
      pushMessage(role, textParts.join('\n'), toolCalls, media);
    }
    for (const group of (Array.isArray(body?.tools) ? body.tools : [])) {
      const decls = Array.isArray(group?.functionDeclarations) ? group.functionDeclarations : (group?.name ? [group] : []);
      for (const d of decls) pushTool(d?.name, d?.description, d?.parameters);
    }
  } else if (protocol === 'openai-responses') {
    if (typeof body?.instructions === 'string') systemText = body.instructions.trim();
    const input = body?.input;
    if (typeof input === 'string') pushMessage('user', input);
    else if (Array.isArray(input)) {
      for (const item of input) {
        if (!item) continue;
        if (item.type === 'function_call_output') {
          pushToolMessage(item.call_id, typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? ''));
          continue;
        }
        const role = item.role === 'assistant' ? 'assistant' : (item.role === 'system' || item.role === 'developer' ? 'system' : 'user');
        const textParts = [], media = [];
        const addResponsesPart = part => {
          if (!part) return;
          if (typeof part === 'string') { textParts.push(part); return; }
          if (typeof part.text === 'string' || typeof part.input_text === 'string' || typeof part.output_text === 'string') textParts.push(String(part.text || part.input_text || part.output_text || ''));
          const type = String(part.type || '').toLowerCase();
          if (type === 'input_image' || type === 'image_url') addMedia(media, 'image', part.image_url?.url || part.image_url || part.url, part.mimeType || part.mime_type || 'image/png', part.name);
          else if (type === 'input_video' || type === 'video_url') addMedia(media, 'video', part.video_url?.url || part.video_url || part.url, part.mimeType || part.mime_type || 'video/mp4', part.name);
          else if (type === 'input_audio' || type === 'audio_url') {
            const audio = part.input_audio || part.audio || part;
            const raw = audio.data || audio.url || part.audio_url?.url || part.audio_url || part.url;
            addMedia(media, 'audio', raw, audio.mimeType || audio.mime_type || audioMimeForFormat(audio.format), part.name, Boolean(audio.data && !/^data:/i.test(String(audio.data))));
          } else if (type === 'input_file' || type === 'file' || type === 'file_url') {
            const file = part.file || part.input_file || part;
            const raw = file.file_data || file.file_url || file.url || file.data;
            addMedia(media, 'file', raw, file.mimeType || file.mime_type || 'application/octet-stream', file.filename || file.name, Boolean(file.file_data && !/^data:/i.test(String(file.file_data))));
          }
        };
        if (typeof item.content === 'string') textParts.push(item.content);
        else if (Array.isArray(item.content)) for (const part of item.content) addResponsesPart(part);
        if (item.type === 'input_image' || item.type === 'input_video' || item.type === 'input_audio' || item.type === 'input_file') addResponsesPart(item);
        const text = textParts.filter(Boolean).join('\n');
        if (role === 'system') systemText = (systemText ? systemText + '\n\n' : '') + text;
        else pushMessage(role, text, [], media);
      }
    }
    for (const t of (Array.isArray(body?.tools) ? body.tools : [])) {
      const fn = t?.function || t;
      pushTool(fn?.name, fn?.description, fn?.parameters);
    }
  } else {
    const sysParts = [];
    for (const m of (Array.isArray(body?.messages) ? body.messages : [])) {
      if (!m || !m.role) continue;
      const textParts = [], media = [];
      if (typeof m.content === 'string') textParts.push(m.content);
      else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (!part) continue;
          if (typeof part === 'string') { textParts.push(part); continue; }
          if (part.type === 'text' || part.type === 'input_text' || part.type === 'output_text') {
            if (part.text || part.input_text || part.output_text) textParts.push(String(part.text || part.input_text || part.output_text));
          } else if (part.type === 'image_url' || part.type === 'input_image') {
            const image = part.image_url || part;
            addMedia(media, 'image', image?.url || image, part.mimeType || part.mime_type || 'image/png', part.name);
          } else if (part.type === 'video_url' || part.type === 'input_video') {
            const video = part.video_url || part;
            addMedia(media, 'video', video?.url || video, part.mimeType || part.mime_type || 'video/mp4', part.name);
          } else if (part.type === 'input_audio' || part.type === 'audio_url') {
            const audio = part.input_audio || part.audio || part;
            const raw = audio.data || audio.url || part.audio_url?.url || part.audio_url || part.url;
            addMedia(media, 'audio', raw, audio.mimeType || audio.mime_type || audioMimeForFormat(audio.format), part.name, Boolean(audio.data && !/^data:/i.test(String(audio.data))));
          } else if (part.type === 'file' || part.type === 'file_url' || part.type === 'input_file') {
            const file = part.file || part.input_file || part;
            const raw = file.file_data || file.file_url || file.url || file.data;
            addMedia(media, 'file', raw, file.mimeType || file.mime_type || 'application/octet-stream', file.filename || file.name, Boolean(file.file_data && !/^data:/i.test(String(file.file_data))));
          }
        }
      }
      if (Array.isArray(m.images)) for (const image of m.images) addMedia(media, 'image', typeof image === 'string' ? image : image?.url, image?.mimeType || image?.mime_type || 'image/png', image?.name);
      const text = textParts.join('\n');
      if (m.role === 'system' || m.role === 'developer') {
        if (text.trim()) sysParts.push(text.trim());
      } else if (m.role === 'tool' || m.role === 'function') {
        pushToolMessage(m.tool_call_id || m.name || 'tool', text);
      } else {
        const toolCalls = Array.isArray(m.tool_calls) ? m.tool_calls.map(tc => ({
          id: String(tc?.id || ('call_' + crypto.randomBytes(6).toString('hex'))),
          name: String(tc?.function?.name || tc?.name || 'tool'),
          arguments: typeof tc?.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc?.function?.arguments || {}),
        })) : [];
        pushMessage(m.role === 'assistant' ? 'assistant' : 'user', text, toolCalls, media);
      }
    }
    if (!messages.length && typeof body?.prompt === 'string') pushMessage('user', body.prompt);
    systemText = sysParts.join('\n\n');
    const rawTools = Array.isArray(body?.tools) ? body.tools : (Array.isArray(body?.functions) ? body.functions : []);
    for (const t of rawTools) {
      const fn = t?.function || t;
      pushTool(fn?.name, fn?.description, fn?.parameters || fn?.input_schema);
    }
  }

  return { protocol, model, stream, systemText, messages, tools, gemAltSse: urlObj?.searchParams?.get('alt') === 'sse' };
}

function isPublicIPv4(address) {
  const p = String(address || '').split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)) ) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)) ) ||
      (a === 203 && b === 0 && c === 113)) return false;
  return true;
}

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family !== 6) return false;
  const value = String(address).toLowerCase();
  if (value.startsWith('::ffff:')) {
    const tail = value.slice(7);
    if (tail.includes('.')) return isPublicIPv4(tail);
    const parts = tail.split(':');
    if (parts.length === 2) {
      const hi = parseInt(parts[0], 16), lo = parseInt(parts[1], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) return isPublicIPv4([hi >> 8, hi & 255, lo >> 8, lo & 255].join('.'));
    }
    return false;
  }
  if (!/^[23]/.test(value)) return false;
  if (/^2001:(?:0?db8|0?10|0?2|20)(?::|$)/.test(value)) return false;
  return true;
}

async function resolvePublicAddress(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(?:localhost|local|internal|lan|home\.arpa)$/.test(host)) throw apiError('媒体 URL 不允许访问本机或内网地址', 400);
  let records;
  if (net.isIP(host)) records = [{ address: host, family: net.isIP(host) }];
  else {
    try { records = await dns.lookup(host, { all: true, verbatim: true }); }
    catch { throw apiError('媒体 URL 域名解析失败', 400); }
  }
  if (!records?.length || records.some(x => !isPublicAddress(x.address))) throw apiError('媒体 URL 不允许访问本机或内网地址', 400);
  return records[0];
}

function fetchedMime(expectedType, actualMime, expectedMime) {
  let mime = cleanMime(actualMime, cleanMime(expectedMime, defaultMimeForType(expectedType)));
  if (mime === 'application/octet-stream' && expectedType !== 'file') mime = cleanMime(expectedMime, defaultMimeForType(expectedType));
  if (expectedType !== 'file' && !mime.startsWith(expectedType + '/')) throw apiError('媒体 URL 返回的内容类型与请求不匹配', 415);
  if (expectedType === 'file' && /^(?:text\/html|application\/xhtml\+xml|application\/javascript|text\/javascript)$/.test(mime)) throw apiError('不接受 HTML 或脚本作为附件', 415);
  return mime;
}

async function fetchPublicMedia(rawUrl, expectedType, expectedMime, redirects = 0, firstProtocol = '') {
  if (redirects > 3) throw apiError('媒体 URL 重定向次数过多', 400);
  let parsed;
  try { parsed = new URL(String(rawUrl)); } catch { throw apiError('媒体 URL 格式无效', 400); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw apiError('媒体附件仅支持公开 HTTP(S) URL 或 data URI', 400);
  const originProtocol = firstProtocol || parsed.protocol;
  if (originProtocol === 'https:' && parsed.protocol !== 'https:') throw apiError('媒体 URL 不允许从 HTTPS 降级到 HTTP', 400);
  const address = await resolvePublicAddress(parsed.hostname);
  const client = parsed.protocol === 'https:' ? https : http;
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      if (err) reject(err); else resolve(result);
    };
    const pinnedLookup = (_hostname, options, callback) => {
      if (options && options.all) callback(null, [{ address: address.address, family: address.family }]);
      else callback(null, address.address, address.family);
    };
    const req = client.request(parsed, {
      method: 'GET',
      headers: { Accept: 'image/*,video/*,audio/*,application/octet-stream;q=0.5', 'Accept-Encoding': 'identity', 'User-Agent': 'Brana-Local-API-Gateway/1.0' },
      lookup: pinnedLookup,
      ...(net.isIP(parsed.hostname) ? {} : { servername: parsed.hostname }),
    }, res => {
      const status = Number(res.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = res.headers.location;
        res.resume();
        if (!location) { finish(apiError('媒体 URL 重定向缺少目标地址', 400)); return; }
        let next;
        try { next = new URL(location, parsed).href; } catch { finish(apiError('媒体 URL 重定向地址无效', 400)); return; }
        fetchPublicMedia(next, expectedType, expectedMime, redirects + 1, originProtocol).then(value => finish(null, value), finish);
        return;
      }
      if (status < 200 || status >= 300) { res.resume(); finish(apiError('下载媒体 URL 失败 (HTTP ' + status + ')', 400)); return; }
      const declaredLength = Number(res.headers['content-length'] || 0);
      if (declaredLength > MAX_MEDIA_BYTES) { res.destroy(); finish(apiError('单个多模态附件超过 20 MB 限制', 413)); return; }
      let mimeType;
      try { mimeType = fetchedMime(expectedType, res.headers['content-type'], expectedMime); }
      catch (err) { res.destroy(); finish(err); return; }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_MEDIA_BYTES) { res.destroy(); finish(apiError('单个多模态附件超过 20 MB 限制', 413)); return; }
        chunks.push(chunk);
      });
      res.on('error', err => finish(err));
      res.on('end', () => finish(null, { buffer: Buffer.concat(chunks), mimeType }));
    });
    req.setTimeout(15000, () => req.destroy(apiError('下载媒体 URL 超时', 408)));
    req.on('error', err => finish(err));
    req.end();
  });
}

async function hydrateIncomingMedia(normReq) {
  let count = 0;
  let totalBytes = 0;
  for (const message of (normReq?.messages || [])) {
    for (const media of (message?.media || [])) {
      if (++count > MAX_MEDIA_COUNT) throw apiError('单次请求最多支持 12 个多模态附件', 413);
      if (media.dataUrl) {
        const parsed = dataUrlInfo(media.dataUrl, MAX_MEDIA_BYTES);
        if (!parsed) throw apiError('附件 data URI 格式无效', 400);
        const actualMime = cleanMime(parsed.mimeType, media.mimeType || defaultMimeForType(media.type));
        if (media.type !== 'file' && !actualMime.startsWith(media.type + '/')) throw apiError('附件 MIME 类型与媒体类型不匹配', 415);
        media.mimeType = actualMime;
        media.sizeBytes = parsed.buffer.length;
        totalBytes += parsed.buffer.length;
      } else if (media.url) {
        const fetched = await fetchPublicMedia(media.url, media.type, media.mimeType);
        media.mimeType = fetched.mimeType;
        media.sizeBytes = fetched.buffer.length;
        media.dataUrl = 'data:' + fetched.mimeType + ';base64,' + fetched.buffer.toString('base64');
        delete media.url;
        totalBytes += fetched.buffer.length;
      } else {
        throw apiError('附件缺少可读取的 URL 或 data URI', 400);
      }
      if (totalBytes > MAX_TOTAL_MEDIA_BYTES) throw apiError('单次请求的多模态附件总量超过 40 MB 限制', 413);
    }
  }
  return normReq;
}

const SAFE_OUTPUT_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac',
]);

function createMediaStore(state) {
  const items = new Map();
  let totalBytes = 0;
  const remove = id => {
    const old = items.get(id);
    if (old) totalBytes = Math.max(0, totalBytes - old.buffer.length);
    items.delete(id);
  };
  const prune = () => {
    const now = Date.now();
    for (const [id, item] of items) if (item.expiresAt <= now) remove(id);
    while (items.size >= MAX_STORED_MEDIA_ITEMS || totalBytes > MAX_STORED_MEDIA_BYTES) remove(items.keys().next().value);
  };
  return {
    add(media = {}) {
      const raw = String(media.dataUrl || media.url || '');
      if (!raw) return '';
      if (!/^data:/i.test(raw)) return /^https?:\/\//i.test(raw) ? raw : '';
      let parsed;
      try { parsed = dataUrlInfo(raw, MAX_OUTPUT_MEDIA_BYTES); } catch { return ''; }
      if (!parsed || !SAFE_OUTPUT_MIMES.has(cleanMime(parsed.mimeType, ''))) return '';
      if (!parsed.buffer.length || parsed.buffer.length > MAX_OUTPUT_MEDIA_BYTES) return '';
      prune();
      while (items.size >= MAX_STORED_MEDIA_ITEMS || totalBytes + parsed.buffer.length > MAX_STORED_MEDIA_BYTES) {
        const oldest = items.keys().next().value;
        if (!oldest) break;
        remove(oldest);
      }
      if (totalBytes + parsed.buffer.length > MAX_STORED_MEDIA_BYTES) return '';
      const id = crypto.randomBytes(16).toString('hex');
      items.set(id, {
        buffer: parsed.buffer,
        mimeType: cleanMime(parsed.mimeType, 'application/octet-stream'),
        name: safeMediaName(media.name, media.type || mediaTypeForMime(parsed.mimeType), parsed.mimeType),
        expiresAt: Date.now() + MEDIA_TTL_MS,
      });
      totalBytes += parsed.buffer.length;
      return 'http://' + (state.host || '127.0.0.1') + ':' + state.port + '/v1/media/' + id;
    },
    get(id) {
      const item = items.get(String(id || ''));
      if (!item) return null;
      if (item.expiresAt <= Date.now()) { remove(String(id)); return null; }
      return item;
    },
    clear() { items.clear(); totalBytes = 0; },
  };
}

function mediaPublicShape(media) {
  return { type: media.type, mime_type: media.mimeType, name: media.name, url: media.apiUrl || media.url || '' };
}

function appendMediaMarkdown(text, mediaList) {
  const blocks = [];
  const base = String(text || '').trimEnd();
  if (base) blocks.push(base);
  for (const media of (mediaList || [])) {
    const url = String(media.apiUrl || media.url || '').replace(/[\r\n<>]/g, '');
    const name = String(media.name || media.type || 'media').replace(/[\r\n\[\]]/g, ' ').trim().slice(0, 100) || 'media';
    if (!url) { blocks.push('[' + (media.type || '媒体') + '附件未能生成可访问链接]'); continue; }
    if (media.type === 'image') blocks.push('![' + name + '](<' + url + '>)');
    else blocks.push('[' + (media.type === 'video' ? '视频' : media.type === 'audio' ? '音频' : '附件') + ': ' + name + '](<' + url + '>)');
  }
  return blocks.join('\n\n');
}

function geminiMediaPart(media) {
  if (media?.dataUrl) {
    try {
      const parsed = dataUrlInfo(media.dataUrl, MAX_OUTPUT_MEDIA_BYTES);
      if (parsed) return { inlineData: { mimeType: parsed.mimeType, data: parsed.buffer.toString('base64') } };
    } catch {}
  }
  const url = media?.apiUrl || media?.url || '';
  return url ? { fileData: { mimeType: media.mimeType || defaultMimeForType(media.type), fileUri: url } } : null;
}

function responsesOutputMedia(media) {
  const url = media?.apiUrl || media?.url || '';
  if (!url) return null;
  const type = media.type === 'image' ? 'output_image' : media.type === 'video' ? 'output_video' : media.type === 'audio' ? 'output_audio' : 'output_file';
  return { type, [media.type === 'image' ? 'image_url' : media.type === 'video' ? 'video_url' : media.type === 'audio' ? 'audio_url' : 'file_url']: url, mime_type: media.mimeType || defaultMimeForType(media.type), name: media.name || '' };
}

module.exports = {
  MAX_MEDIA_BYTES,
  MAX_TOTAL_MEDIA_BYTES,
  MAX_MEDIA_COUNT,
  normalizeIncomingRequest,
  hydrateIncomingMedia,
  dataUrlInfo,
  mediaTypeForMime,
  createMediaStore,
  mediaPublicShape,
  appendMediaMarkdown,
  geminiMediaPart,
  responsesOutputMedia,
};
