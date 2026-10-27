'use strict';
const http = require('http');
const crypto = require('crypto');
const ApiMultimodal = require('./api-multimodal');
const MAX_API_BODY_BYTES = 60 * 1024 * 1024;

function genApiKey() {
  return 'sk-brana-' + crypto.randomBytes(12).toString('hex');
}

function inferVendorProtocol() {
  return 'arena';
}

function canonicalModelSlug(rawName, rawInternal, fam) {
  const base = String(rawInternal && rawInternal !== 'auto' && rawInternal !== 'default' ? rawInternal : (rawName || '')).trim();
  if (!base) return 'brana-current';
  const slug = base
    .toLowerCase()
    .replace(/\(([^)]+)\)/g, '-$1')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'brana-current';
}

function parseJsonSafe(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

const normalizeIncomingRequest = ApiMultimodal.normalizeIncomingRequest;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta, x-goog-api-key, OpenAI-Beta, X-Requested-With, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
}

function createResponseAdapter(res, normReq, state, mediaStore) {
  const { protocol, stream } = normReq;
  const createdSec = Math.floor(Date.now() / 1000);
  const msgId = 'chatcmpl_brana_' + crypto.randomBytes(8).toString('hex');
  const anthId = 'msg_brana_' + crypto.randomBytes(8).toString('hex');
  const respId = 'resp_brana_' + crypto.randomBytes(8).toString('hex');
  let resolvedModel = normReq.model && normReq.model !== 'brana-current' ? normReq.model : (state.modelId || 'brana-current');

  let headersSent = false;
  let finished = false;
  let fullReasoning = '';
  let fullText = '';
  const toolCalls = [];
  const outputMedia = [];

  let anthStarted = false;
  let anthCurBlockType = null;
  let anthBlockIndex = -1;

  const ensureStreamHeaders = () => {
    if (headersSent || res.writableEnded) return;
    headersSent = true;
    setCorsHeaders(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    });
    if (protocol === 'openai') {
      const initChunk = {
        id: msgId,
        object: 'chat.completion.chunk',
        created: createdSec,
        model: resolvedModel,
        choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
      };
      res.write('data: ' + JSON.stringify(initChunk) + '\n\n');
    } else if (protocol === 'openai-responses') {
      res.write('event: response.created\ndata: ' + JSON.stringify({ type: 'response.created', response: { id: respId, object: 'response', created_at: createdSec, model: resolvedModel, status: 'in_progress', output: [] } }) + '\n\n');
    } else if (protocol === 'anthropic') {
      anthStarted = true;
      const startEvt = {
        type: 'message_start',
        message: {
          id: anthId,
          type: 'message',
          role: 'assistant',
          model: resolvedModel,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 120, output_tokens: 1 },
        },
      };
      res.write('event: message_start\ndata: ' + JSON.stringify(startEvt) + '\n\n');
    }
  };

  const openAnthBlock = (type, extra = {}) => {
    if (anthCurBlockType === type && type !== 'tool_use') return;
    if (anthCurBlockType !== null && anthBlockIndex >= 0) {
      res.write('event: content_block_stop\ndata: ' + JSON.stringify({ type: 'content_block_stop', index: anthBlockIndex }) + '\n\n');
    }
    anthBlockIndex += 1;
    anthCurBlockType = type;
    const content_block = type === 'thinking'
      ? { type: 'thinking', thinking: '' }
      : type === 'text'
        ? { type: 'text', text: '' }
        : { type: 'tool_use', id: extra.id, name: extra.name, input: {} };
    res.write('event: content_block_start\ndata: ' + JSON.stringify({ type: 'content_block_start', index: anthBlockIndex, content_block }) + '\n\n');
  };

  return {
    onReasoning(delta) {
      if (finished || !delta) return;
      fullReasoning += delta;
      if (!stream) return;
      ensureStreamHeaders();
      if (protocol === 'openai') {
        const chunk = {
          id: msgId,
          object: 'chat.completion.chunk',
          created: createdSec,
          model: resolvedModel,
          choices: [{ index: 0, delta: { reasoning_content: delta, reasoning: delta }, finish_reason: null }],
        };
        res.write('data: ' + JSON.stringify(chunk) + '\n\n');
      } else if (protocol === 'anthropic') {
        openAnthBlock('thinking');
        res.write('event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', index: anthBlockIndex, delta: { type: 'thinking_delta', thinking: delta } }) + '\n\n');
      } else if (protocol === 'gemini') {
        const gChunk = {
          candidates: [{ content: { role: 'model', parts: [{ text: delta, thought: true }] }, index: 0 }],
          modelVersion: resolvedModel,
        };
        res.write('data: ' + JSON.stringify(gChunk) + '\n\n');
      }
    },

    onText(delta) {
      if (finished || !delta) return;
      fullText += delta;
      if (!stream) return;
      ensureStreamHeaders();
      if (protocol === 'openai') {
        const chunk = {
          id: msgId,
          object: 'chat.completion.chunk',
          created: createdSec,
          model: resolvedModel,
          choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
        };
        res.write('data: ' + JSON.stringify(chunk) + '\n\n');
      } else if (protocol === 'openai-responses') {
        res.write('event: response.output_text.delta\ndata: ' + JSON.stringify({ type: 'response.output_text.delta', delta }) + '\n\n');
      } else if (protocol === 'anthropic') {
        openAnthBlock('text');
        res.write('event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', index: anthBlockIndex, delta: { type: 'text_delta', text: delta } }) + '\n\n');
      } else if (protocol === 'gemini') {
        const gChunk = {
          candidates: [{ content: { role: 'model', parts: [{ text: delta }] }, index: 0 }],
          modelVersion: resolvedModel,
        };
        res.write('data: ' + JSON.stringify(gChunk) + '\n\n');
      }
    },

    async onMedia(raw = {}) {
      if (finished || !raw) return;
      const dataUrlValue = raw.dataUrl || raw.data_url || '';
      let type = String(raw.type || '').toLowerCase().replace(/_url$/, '');
      let mimeType = String(raw.mimeType || raw.mime_type || raw.contentType || raw.content_type || '');
      if (!mimeType && dataUrlValue) mimeType = String(/^data:([^;,]+)/i.exec(String(dataUrlValue))?.[1] || '');
      if (!mimeType) mimeType = type === 'image' ? 'image/png' : type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/wav' : 'application/octet-stream';
      if (!['image', 'video', 'audio', 'file'].includes(type)) type = ApiMultimodal.mediaTypeForMime(mimeType, 'file');
      if (mimeType === 'application/octet-stream' && type !== 'file') mimeType = type === 'image' ? 'image/png' : type === 'video' ? 'video/mp4' : 'audio/wav';
      const rawData = raw.data || raw.base64 || '';
      let dataUrl = String(dataUrlValue || '');
      if (!dataUrl && rawData) {
        const dataString = String(rawData);
        dataUrl = /^data:/i.test(dataString) ? dataString : 'data:' + mimeType + ';base64,' + dataString.replace(/\s+/g, '');
      }
      const media = {
        type,
        mimeType,
        name: String(raw.name || raw.filename || raw.fileName || ''),
        dataUrl,
        url: String(raw.url || raw.fileUri || raw.file_uri || ''),
      };
      if (!media.dataUrl && /^data:/i.test(media.url)) { media.dataUrl = media.url; media.url = ''; }
      if (!media.dataUrl && media.url) {
        const wrapper = { messages: [{ role: 'user', content: '', toolCalls: [], media: [media] }] };
        try {
          await ApiMultimodal.hydrateIncomingMedia(wrapper);
          const hydrated = wrapper.messages[0].media[0];
          media.dataUrl = hydrated.dataUrl || '';
          media.mimeType = hydrated.mimeType || media.mimeType;
          media.url = '';
        } catch { return; }
      }
      if (!media.dataUrl) return;
      if (finished || res.writableEnded) return;
      const apiUrl = mediaStore ? mediaStore.add(media) : media.url;
      const item = { ...media, apiUrl: apiUrl || '' };
      outputMedia.push(item);
      const markdown = ApiMultimodal.appendMediaMarkdown('', [item]);
      if (markdown) this.onText(markdown + '\n\n');
      if (!stream) return;
      ensureStreamHeaders();
      if (protocol === 'openai') {
        const chunk = {
          id: msgId,
          object: 'chat.completion.chunk',
          created: createdSec,
          model: resolvedModel,
          choices: [{ index: 0, delta: { media: [ApiMultimodal.mediaPublicShape(item)] }, finish_reason: null }],
        };
        res.write('data: ' + JSON.stringify(chunk) + '\n\n');
      } else if (protocol === 'gemini') {
        const part = ApiMultimodal.geminiMediaPart(item);
        if (part) res.write('data: ' + JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] }, index: 0 }], modelVersion: resolvedModel }) + '\n\n');
      }
    },

    onToolCall(tc) {
      if (finished || !tc || !tc.name) return;
      const callId = String(tc.id || ((protocol === 'anthropic' ? 'toolu_' : 'call_') + crypto.randomBytes(6).toString('hex')));
      const argsStr = typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {});
      const idx = toolCalls.length;
      toolCalls.push({ id: callId, name: String(tc.name), arguments: argsStr });
      if (!stream) return;
      ensureStreamHeaders();
      if (protocol === 'openai') {
        const chunk = {
          id: msgId,
          object: 'chat.completion.chunk',
          created: createdSec,
          model: resolvedModel,
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: idx,
                id: callId,
                type: 'function',
                function: { name: String(tc.name), arguments: argsStr },
              }],
            },
            finish_reason: null,
          }],
        };
        res.write('data: ' + JSON.stringify(chunk) + '\n\n');
      } else if (protocol === 'anthropic') {
        openAnthBlock('tool_use', { id: callId, name: String(tc.name) });
        res.write('event: content_block_delta\ndata: ' + JSON.stringify({ type: 'content_block_delta', index: anthBlockIndex, delta: { type: 'input_json_delta', partial_json: argsStr } }) + '\n\n');
        res.write('event: content_block_stop\ndata: ' + JSON.stringify({ type: 'content_block_stop', index: anthBlockIndex }) + '\n\n');
        anthCurBlockType = null;
      } else if (protocol === 'gemini') {
        const gChunk = {
          candidates: [{
            content: {
              role: 'model',
              parts: [{ functionCall: { name: String(tc.name), args: parseJsonSafe(argsStr, {}) || {} } }],
            },
            index: 0,
          }],
          modelVersion: resolvedModel,
        };
        res.write('data: ' + JSON.stringify(gChunk) + '\n\n');
      }
    },

    onDone(meta = {}) {
      if (finished || res.writableEnded) return;
      finished = true;
      if (meta.model) resolvedModel = meta.model;
      const inTok = Number(meta.inputTokens) || Math.max(16, Math.ceil(JSON.stringify(normReq.messages || []).length / 3.5));
      const outTok = Number(meta.outputTokens) || Math.max(8, Math.ceil((fullText.length + fullReasoning.length) / 3.5));
      const hasTools = toolCalls.length > 0;
      const mediaMeta = outputMedia.map(ApiMultimodal.mediaPublicShape);
      const gemMedia = outputMedia.map(ApiMultimodal.geminiMediaPart).filter(Boolean);
      const responsesMedia = outputMedia.map(ApiMultimodal.responsesOutputMedia).filter(Boolean);

      if (stream) {
        ensureStreamHeaders();
        if (protocol === 'openai') {
          const endChunk = {
            id: msgId,
            object: 'chat.completion.chunk',
            created: createdSec,
            model: resolvedModel,
            choices: [{ index: 0, delta: {}, finish_reason: hasTools ? 'tool_calls' : 'stop' }],
            usage: { prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok },
          };
          if (mediaMeta.length) endChunk.media = mediaMeta;
          res.write('data: ' + JSON.stringify(endChunk) + '\n\ndata: [DONE]\n\n');
        } else if (protocol === 'openai-responses') {
          const finalResp = {
            id: respId,
            object: 'response',
            created_at: createdSec,
            model: resolvedModel,
            status: 'completed',
            output_text: fullText,
            output: [{
              type: 'message',
              id: msgId,
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: fullText, annotations: [] }, ...responsesMedia],
            }],
            usage: { input_tokens: inTok, output_tokens: outTok, total_tokens: inTok + outTok },
          };
          res.write('event: response.completed\ndata: ' + JSON.stringify({ type: 'response.completed', response: finalResp }) + '\n\n');
        } else if (protocol === 'anthropic') {
          if (!anthStarted && !fullText && !fullReasoning && !hasTools) openAnthBlock('text');
          if (anthCurBlockType !== null && anthBlockIndex >= 0) {
            res.write('event: content_block_stop\ndata: ' + JSON.stringify({ type: 'content_block_stop', index: anthBlockIndex }) + '\n\n');
            anthCurBlockType = null;
          }
          const deltaEvt = {
            type: 'message_delta',
            delta: { stop_reason: hasTools ? 'tool_use' : 'end_turn', stop_sequence: null },
            usage: { output_tokens: outTok },
          };
          res.write('event: message_delta\ndata: ' + JSON.stringify(deltaEvt) + '\n\nevent: message_stop\ndata: ' + JSON.stringify({ type: 'message_stop' }) + '\n\n');
        } else if (protocol === 'gemini') {
          const endGem = {
            candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: 'STOP', index: 0 }],
            usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: outTok, totalTokenCount: inTok + outTok },
            modelVersion: resolvedModel,
          };
          res.write('data: ' + JSON.stringify(endGem) + '\n\n');
        }
        res.end();
        return;
      }

      setCorsHeaders(res);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      if (protocol === 'anthropic') {
        const content = [];
        if (fullReasoning) content.push({ type: 'thinking', thinking: fullReasoning });
        if (fullText || !hasTools) content.push({ type: 'text', text: fullText });
        for (const tc of toolCalls) {
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: parseJsonSafe(tc.arguments, {}) || {} });
        }
        res.end(JSON.stringify({
          id: anthId,
          type: 'message',
          role: 'assistant',
          model: resolvedModel,
          content,
          media: mediaMeta,
          stop_reason: hasTools ? 'tool_use' : 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: inTok, output_tokens: outTok },
        }));
      } else if (protocol === 'gemini') {
        const parts = [];
        if (fullReasoning) parts.push({ text: fullReasoning, thought: true });
        if (fullText || !hasTools) parts.push({ text: fullText });
        for (const media of gemMedia) parts.push(media);
        for (const tc of toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: parseJsonSafe(tc.arguments, {}) || {} } });
        }
        res.end(JSON.stringify({
          candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }],
          usageMetadata: { promptTokenCount: inTok, candidatesTokenCount: outTok, totalTokenCount: inTok + outTok },
          modelVersion: resolvedModel,
        }));
      } else if (protocol === 'openai-responses') {
        res.end(JSON.stringify({
          id: respId,
          object: 'response',
          created_at: createdSec,
          model: resolvedModel,
          status: 'completed',
          output_text: fullText,
          output: [{
            type: 'message',
            id: msgId,
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text: fullText, annotations: [] }, ...responsesMedia],
          }],
          usage: { input_tokens: inTok, output_tokens: outTok, total_tokens: inTok + outTok },
        }));
      } else {
        const msgObj = { role: 'assistant', content: fullText || (hasTools ? null : '') };
        if (fullReasoning) {
          msgObj.reasoning_content = fullReasoning;
          msgObj.reasoning = fullReasoning;
        }
        if (mediaMeta.length) msgObj.media = mediaMeta;
        if (hasTools) {
          msgObj.tool_calls = toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          }));
        }
        res.end(JSON.stringify({
          id: msgId,
          object: 'chat.completion',
          created: createdSec,
          model: resolvedModel,
          choices: [{ index: 0, message: msgObj, finish_reason: hasTools ? 'tool_calls' : 'stop' }],
          usage: { prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok },
        }));
      }
    },

    onError(errMsg, code = 500) {
      if (finished || res.writableEnded) return;
      finished = true;
      const msg = String(errMsg || 'Internal gateway error');
      if (headersSent) {
        if (protocol === 'anthropic') {
          res.write('event: error\ndata: ' + JSON.stringify({ type: 'error', error: { type: 'api_error', message: msg } }) + '\n\n');
        } else {
          res.write('data: ' + JSON.stringify({ error: { message: msg, type: 'api_error' } }) + '\n\ndata: [DONE]\n\n');
        }
        res.end();
        return;
      }
      setCorsHeaders(res);
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { message: msg, type: 'api_error', code: String(code) } }));
    },
  };
}

function createLocalApiGateway(options = {}) {
  const state = {
    running: false,
    port: Number(options.port) || 18765,
    host: '127.0.0.1',
    apiKey: options.apiKey || genApiKey(),
    requireKey: false,
    sessionMode: 'bound',
    toolMode: 'auto_bridge',
    protocolPref: 'openai',
    boundSid: null,
    boundTitle: '',
    modelName: '自动识别 / 当前会话模型',
    modelId: 'brana-current',
    modelFam: '',
    vendorProtocol: 'arena',
    reqCount: 0,
    lastReqAt: 0,
    lastError: '',
    logs: [],
  };

  let server = null;
  let activeWebContents = null;
  let reqSeq = 0;
  const inflight = new Map();
  const mediaStore = ApiMultimodal.createMediaStore(state);

  const pushLog = (entry) => {
    state.logs.unshift({ id: ++reqSeq, at: Date.now(), ...entry });
    if (state.logs.length > 30) state.logs.length = 30;
  };

  const getPublicState = () => ({
    ...state,
    baseUrlOpenAI: 'http://' + state.host + ':' + state.port + '/v1',
    baseUrlAnthropic: 'http://' + state.host + ':' + state.port,
    baseUrlGemini: 'http://' + state.host + ':' + state.port + '/v1beta',
    endpointOpenAI: 'http://' + state.host + ':' + state.port + '/v1/chat/completions',
    endpointResponses: 'http://' + state.host + ':' + state.port + '/v1/responses',
    endpointAnthropic: 'http://' + state.host + ':' + state.port + '/v1/messages',
    endpointGemini: 'http://' + state.host + ':' + state.port + '/v1beta/models/' + (state.modelId || 'brana-current') + ':generateContent',
  });

  const resolveTargetWebContents = () => {
    if (activeWebContents && !activeWebContents.isDestroyed()) return activeWebContents;
    if (typeof options.getFallbackWebContents === 'function') {
      const wc = options.getFallbackWebContents();
      if (wc && !wc.isDestroyed()) return wc;
    }
    return null;
  };

  const buildModelsList = () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const list = [];
    const seen = new Set();
    const addModel = (id, ownedBy, displayName) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({ id, object: 'model', created: nowSec, owned_by: ownedBy || 'brana-local-gateway', display_name: displayName || id });
    };
    if (state.modelId && state.modelId !== 'brana-current') {
      addModel(state.modelId, 'arena-session', state.modelName || state.modelId);
    }
    addModel('brana-current', 'arena-session', 'Brana 当前 Arena 会话模型 (' + (state.modelName || '自动跟随') + ')');
    return list;
  };

  const handleHttpRequest = (req, res) => {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlObj = new URL(req.url || '/', 'http://' + (req.headers.host || '127.0.0.1'));
    const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';

    const mediaMatch = pathname.match(/^\/v1\/media\/([a-f0-9]{32})$/i);
    if ((req.method === 'GET' || req.method === 'HEAD') && mediaMatch) {
      const media = mediaStore.get(mediaMatch[1].toLowerCase());
      if (!media) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'Media not found or expired', type: 'invalid_request_error' } }));
        return;
      }
      const size = media.buffer.length;
      const filename = String(media.name || 'media.bin').replace(/[\"\r\n]/g, '_');
      res.setHeader('Content-Type', media.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
      res.setHeader('Cache-Control', 'private, max-age=1800');
      res.setHeader('Accept-Ranges', 'bytes');
      let start = 0;
      let end = size - 1;
      let status = 200;
      const rangeHeader = String(req.headers.range || '');
      if (rangeHeader) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        if (!range || !size) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + size });
          res.end();
          return;
        }
        if (!range[1]) {
          const suffix = Number(range[2]);
          if (!suffix) {
            res.writeHead(416, { 'Content-Range': 'bytes */' + size });
            res.end();
            return;
          }
          start = Math.max(0, size - suffix);
        } else start = Number(range[1]);
        end = range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
        if (start >= size || start > end) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + size });
          res.end();
          return;
        }
        status = 206;
        res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
      }
      res.setHeader('Content-Length', String(Math.max(0, end - start + 1)));
      res.writeHead(status);
      if (req.method === 'HEAD') res.end();
      else res.end(media.buffer.subarray(start, end + 1));
      return;
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/health' || pathname === '/v1/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        service: 'Brana AI Local API Gateway',
        running: state.running,
        port: state.port,
        modelId: state.modelId,
        modelName: state.modelName,
        vendorProtocol: state.vendorProtocol,
        sessionMode: state.sessionMode,
        toolMode: state.toolMode,
        boundSid: state.boundSid,
      }));
      return;
    }

    if (req.method === 'GET' && (/\/(?:v1|v1beta)\/models$/i.test(pathname) || pathname === '/models')) {
      const models = buildModelsList();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      if (/v1beta\/models$/i.test(pathname)) {
        res.end(JSON.stringify({
          models: models.map((m) => ({
            name: 'models/' + m.id,
            displayName: m.display_name || m.id,
            supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
          })),
        }));
      } else {
        res.end(JSON.stringify({ object: 'list', data: models }));
      }
      return;
    }

    if (state.requireKey && state.apiKey) {
      const authHeader = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
      const xKey = String(req.headers['x-api-key'] || req.headers['x-goog-api-key'] || urlObj.searchParams.get('key') || '').trim();
      const provided = authHeader || xKey;
      if (provided !== state.apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } }));
        return;
      }
    }

    if (req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { message: 'Unsupported endpoint: ' + req.method + ' ' + pathname, type: 'invalid_request_error' } }));
      return;
    }

    const declaredBodyLength = Number(req.headers['content-length'] || 0);
    if (declaredBodyLength > MAX_API_BODY_BYTES) {
      res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { message: 'Request body exceeds the 60 MB gateway limit', type: 'invalid_request_error', code: '413' } }));
      req.resume();
      return;
    }
    const chunks = [];
    let totalBytes = 0;
    let bodyTooLarge = false;
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes <= MAX_API_BODY_BYTES) chunks.push(chunk);
      else bodyTooLarge = true;
    });
    req.on('end', async () => {
      if (bodyTooLarge || totalBytes > MAX_API_BODY_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'Request body exceeds the 60 MB gateway limit', type: 'invalid_request_error', code: '413' } }));
        return;
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const body = parseJsonSafe(rawBody, null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON request body', type: 'invalid_request_error' } }));
        return;
      }

      let normReq;
      try {
        normReq = normalizeIncomingRequest(req, urlObj, body, state);
        await ApiMultimodal.hydrateIncomingMedia(normReq);
      } catch (err) {
        const code = Number(err?.status) || 400;
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: String(err?.message || 'Invalid multimodal request'), type: 'invalid_request_error', code: String(code) } }));
        return;
      }
      const adapter = createResponseAdapter(res, normReq, state, mediaStore);
      const wc = resolveTargetWebContents();
      if (!wc) {
        adapter.onError('未找到活跃的 Brana AI 聊天窗口，请保持客户端窗口打开。', 503);
        return;
      }

      const reqId = 'apireq_' + Date.now() + '_' + (++reqSeq);
      state.reqCount += 1;
      state.lastReqAt = Date.now();

      const previewUser = [...(normReq.messages || [])].reverse().find((m) => m.role === 'user' || m.role === 'tool');
      pushLog({
        reqId,
        protocol: normReq.protocol,
        model: normReq.model,
        stream: normReq.stream,
        toolsCount: (normReq.tools || []).length,
        preview: String(previewUser?.content || '').slice(0, 80),
        status: 'streaming',
      });

      const timeoutTimer = setTimeout(() => {
        if (inflight.has(reqId)) {
          inflight.delete(reqId);
          adapter.onError('等待模型响应超时 (300s)', 504);
        }
      }, 300000);

      inflight.set(reqId, { adapter, normReq, timeoutTimer, createdAt: Date.now() });

      res.on('close', () => {
        if (inflight.has(reqId) && !res.writableEnded) {
          const item = inflight.get(reqId);
          clearTimeout(item.timeoutTimer);
          inflight.delete(reqId);
        }
      });

      const jobPayload = {
        reqId,
        protocol: normReq.protocol,
        model: normReq.model,
        stream: normReq.stream,
        systemText: normReq.systemText,
        messages: normReq.messages,
        tools: normReq.tools,
        sessionMode: state.sessionMode,
        toolMode: state.toolMode,
        boundSid: state.boundSid,
      };

      let sentOk = false;
      try {
        if (typeof wc.send === 'function') {
          wc.send('host:api-gateway-req', jobPayload);
          sentOk = true;
        }
      } catch {}
      try {
        if (typeof wc.executeJavaScript === 'function') {
          await wc.executeJavaScript(
            'window.__BranaLocalApiGateway && window.__BranaLocalApiGateway._onMainRequest(' + JSON.stringify(jobPayload) + ')',
            true
          );
          sentOk = true;
        }
      } catch (err) {
        if (!sentOk && inflight.has(reqId)) {
          clearTimeout(timeoutTimer);
          inflight.delete(reqId);
          adapter.onError('转发至客户端渲染器失败: ' + (err?.message || err), 500);
        }
      }
    });
  };

  const startServer = async (desiredPort) => {
    const targetPort = Number(desiredPort) || state.port || 18765;
    if (server && state.running && state.port === targetPort) return getPublicState();
    if (server) {
      try { server.closeAllConnections?.(); } catch {}
      try { await new Promise((r) => server.close(() => r())); } catch {}
      server = null;
      state.running = false;
    }

    let boundPort = 0;
    let lastErr = null;
    for (let offset = 0; offset <= 15; offset++) {
      const tryPort = targetPort + offset;
      const srv = http.createServer(handleHttpRequest);
      const ok = await new Promise((resolve) => {
        srv.once('error', (err) => { lastErr = err; resolve(false); });
        srv.listen(tryPort, state.host, () => resolve(true));
      });
      if (ok) {
        server = srv;
        boundPort = tryPort;
        break;
      }
    }

    if (!boundPort) {
      state.running = false;
      state.lastError = lastErr?.message || '端口绑定失败';
      return getPublicState();
    }

    state.port = boundPort;
    state.running = true;
    state.lastError = '';
    return getPublicState();
  };

  const stopServer = async () => {
    if (server) {
      try { server.closeAllConnections?.(); } catch {}
      try { await new Promise((r) => server.close(() => r())); } catch {}
      server = null;
    }
    state.running = false;
    for (const [reqId, item] of inflight.entries()) {
      clearTimeout(item.timeoutTimer);
      try { item.adapter.onError('本地 API 网关已停止', 503); } catch {}
      inflight.delete(reqId);
    }
    return getPublicState();
  };

  const updateMeta = (patch = {}, senderWc = null) => {
    if (senderWc && !senderWc.isDestroyed()) activeWebContents = senderWc;
    if (patch.boundSid !== undefined) state.boundSid = patch.boundSid || null;
    if (patch.boundTitle !== undefined) state.boundTitle = String(patch.boundTitle || '');
    if (patch.sessionMode && ['bound', 'stateless'].includes(patch.sessionMode)) state.sessionMode = patch.sessionMode;
    if (patch.toolMode && ['auto_bridge', 'client_tools_only', 'arena_native_only'].includes(patch.toolMode)) state.toolMode = patch.toolMode;
    if (patch.protocolPref && ['auto', 'openai', 'anthropic', 'gemini'].includes(patch.protocolPref)) state.protocolPref = patch.protocolPref === 'auto' ? 'openai' : patch.protocolPref;
    if (typeof patch.requireKey === 'boolean') state.requireKey = patch.requireKey;
    if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) state.apiKey = patch.apiKey.trim();
    if (patch.regenKey) state.apiKey = genApiKey();
    if (patch.modelName !== undefined || patch.modelInternal !== undefined || patch.modelFam !== undefined) {
      const mName = String(patch.modelName || state.modelName || '').trim();
      const mFam = String(patch.modelFam || state.modelFam || '').trim();
      const mSlug = canonicalModelSlug(mName, patch.modelInternal, mFam);
      state.modelName = mName || '自动识别 / 当前会话模型';
      state.modelId = mSlug;
      state.modelFam = mFam;
      state.vendorProtocol = 'arena';
    }
    return getPublicState();
  };

  const handleStreamEvent = async (payload = {}) => {
    const { reqId, type } = payload;
    if (!reqId || !inflight.has(reqId)) return { ok: false };
    const item = inflight.get(reqId);
    const { adapter, timeoutTimer } = item;
    if (type === 'reasoning') {
      adapter.onReasoning(String(payload.delta || ''));
    } else if (type === 'text') {
      adapter.onText(String(payload.delta || ''));
    } else if (type === 'tool_call') {
      adapter.onToolCall(payload.call || {});
    } else if (type === 'media' || type === 'image' || type === 'video' || type === 'audio') {
      const mediaItems = Array.isArray(payload.media) ? payload.media : [payload.media || (type === 'media' ? {} : { ...payload, type })];
      for (const media of mediaItems) await adapter.onMedia(media);
    } else if (type === 'done') {
      clearTimeout(timeoutTimer);
      inflight.delete(reqId);
      if (payload.modelName || payload.modelInternal) {
        updateMeta({
          modelName: payload.modelName,
          modelInternal: payload.modelInternal,
          modelFam: payload.modelFam,
        });
      }
      const logEnt = state.logs.find((l) => l.reqId === reqId);
      if (logEnt) logEnt.status = 'done';
      adapter.onDone({
        model: payload.modelId || state.modelId,
        inputTokens: payload.inputTokens,
        outputTokens: payload.outputTokens,
      });
    } else if (type === 'error') {
      clearTimeout(timeoutTimer);
      inflight.delete(reqId);
      const logEnt = state.logs.find((l) => l.reqId === reqId);
      if (logEnt) logEnt.status = 'error';
      adapter.onError(payload.error || '对话生成失败', 500);
    }
    return { ok: true };
  };

  const handleIpc = async (senderWc, payload = {}) => {
    if (senderWc && !senderWc.isDestroyed()) activeWebContents = senderWc;
    const op = String(payload?.op || 'status');
    if (op === 'stream') return handleStreamEvent(payload);
    if (op === 'start') {
      updateMeta(payload, senderWc);
      return await startServer(payload.port);
    }
    if (op === 'stop') return await stopServer();
    if (op === 'update' || op === 'sync') {
      const next = updateMeta(payload, senderWc);
      if (payload.port && Number(payload.port) !== state.port && state.running) {
        return await startServer(Number(payload.port));
      }
      return next;
    }
    if (op === 'clearLogs') {
      state.logs = [];
      return getPublicState();
    }
    return getPublicState();
  };

  return {
    handleIpc,
    startServer,
    stopServer,
    getPublicState,
    normalizeIncomingRequest,
    inferVendorProtocol,
    canonicalModelSlug,
  };
}

module.exports = {
  createLocalApiGateway,
  inferVendorProtocol,
  canonicalModelSlug,
  normalizeIncomingRequest,
};
