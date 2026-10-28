const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const clientRoot = path.resolve(__dirname, '..');
const {
  createLocalApiGateway,
  inferVendorProtocol,
  canonicalModelSlug,
} = require(path.join(clientRoot, 'src/local-api-gateway.js'));

function httpReq(port, method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: {
        Connection: 'close',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, raw, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('[1] Testing protocol-neutral model identity & slug...');
  assert.strictEqual(inferVendorProtocol('claude-opus-4-6', 'Anthropic'), 'arena');
  assert.strictEqual(inferVendorProtocol('gemini-2.5-pro', 'Google'), 'arena');
  assert.strictEqual(inferVendorProtocol('gpt-5.1-high', 'OpenAI'), 'arena');
  assert.strictEqual(canonicalModelSlug('Claude 3.7 Sonnet (Thinking)', ''), 'claude-3.7-sonnet-thinking');

  const inputMediaB64 = {
    image: Buffer.from('request-image').toString('base64'),
    video: Buffer.from('request-video').toString('base64'),
    audio: Buffer.from('request-audio').toString('base64'),
  };
  const generatedMediaBytes = {
    image: Buffer.from('image-output'),
    video: Buffer.from('video-output'),
    audio: Buffer.from('audio-output'),
  };
  const generatedMedia = [
    { type: 'image', mimeType: 'image/png', name: 'generated-image.png', dataUrl: 'data:image/png;base64,' + generatedMediaBytes.image.toString('base64') },
    { type: 'video', mimeType: 'video/mp4', name: 'generated-video.mp4', dataUrl: 'data:video/mp4;base64,' + generatedMediaBytes.video.toString('base64') },
    { type: 'audio', mimeType: 'audio/wav', name: 'generated-audio.wav', dataUrl: 'data:audio/wav;base64,' + generatedMediaBytes.audio.toString('base64') },
  ];
  let latestGatewayRequest = null;
  let gw = null;
  const activeWebContents = {
    isDestroyed: () => false,
    send: (channel, payload) => {
      if (channel === 'host:api-gateway-req') {
        latestGatewayRequest = payload;
        const reqId = payload.reqId;
        const hasTools = Array.isArray(payload.tools) && payload.tools.length > 0;
        const wantsMedia = JSON.stringify(payload.messages || []).includes('MEDIA_TEST');
        setImmediate(async () => {
          gw.handleIpc(activeWebContents, { op: 'stream', reqId, type: 'reasoning', delta: '先分析用户请求...' });
          gw.handleIpc(activeWebContents, { op: 'stream', reqId, type: 'text', delta: '你好！这是来自 Brana 当前对话模型的回复。' });
          if (hasTools) {
            gw.handleIpc(activeWebContents, {
              op: 'stream',
              reqId,
              type: 'tool_call',
              call: {
                id: 'call_test_01',
                name: payload.tools[0].name,
                arguments: { city: 'Frankfurt', unit: 'celsius' },
              },
            });
          }
          if (wantsMedia) {
            await gw.handleIpc(activeWebContents, {
              op: 'stream',
              reqId,
              type: 'media',
              media: generatedMedia,
            });
          }
          gw.handleIpc(activeWebContents, {
            op: 'stream',
            reqId,
            type: 'done',
            sid: 'sid-bound-demo',
            modelId: 'claude-3.7-sonnet',
          });
        });
      }
    },
  };

  gw = createLocalApiGateway({
    getFallbackWebContents: () => activeWebContents,
  });

  console.log('[2] Starting server...');
  const started = await gw.handleIpc(activeWebContents, {
    op: 'start',
    port: 18975,
    sessionMode: 'bound',
    boundSid: 'sid-bound-demo',
    boundTitle: '测试对话',
    modelName: 'Claude 3.7 Sonnet',
    modelFam: 'anthropic',
  });

  assert.strictEqual(started.running, true);
  assert.strictEqual(started.vendorProtocol, 'arena');
  const port = started.port;
  const key = started.apiKey;
  console.log('[2] Started on port', port);

  try {
    console.log('[3] GET /v1/models');
    const modelsRes = await httpReq(port, 'GET', '/v1/models', { Authorization: `Bearer ${key}` });
    assert.strictEqual(modelsRes.status, 200);
    assert.deepStrictEqual(modelsRes.json.data.map(m => m.id).sort(), ['brana-current', 'claude-3.7-sonnet']);
    assert.ok(modelsRes.json.data.every(m => m.owned_by === 'arena-session'));

    console.log('[4] POST /v1/chat/completions (non-stream + tools)');
    const oaiJson = await httpReq(port, 'POST', '/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
      model: 'brana-current',
      stream: false,
      messages: [{ role: 'user', content: '查一下法兰克福天气' }],
      tools: [{ type: 'function', function: { name: 'get_weather', description: '查询天气', parameters: { type: 'object' } } }],
    });
    assert.strictEqual(oaiJson.status, 200);
    assert.strictEqual(oaiJson.json.choices[0].finish_reason, 'tool_calls');
    assert.strictEqual(oaiJson.json.choices[0].message.reasoning_content, '先分析用户请求...');
    assert.strictEqual(oaiJson.json.choices[0].message.tool_calls[0].function.name, 'get_weather');

    console.log('[4a] OpenAI-compatible multimodal request hydration + generated media playback URL');
    const oaiMedia = await httpReq(port, 'POST', '/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
      model: 'brana-current',
      stream: false,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'MEDIA_TEST_OPENAI' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + inputMediaB64.image } },
        { type: 'video_url', video_url: { url: 'data:video/mp4;base64,' + inputMediaB64.video } },
        { type: 'input_audio', input_audio: { data: inputMediaB64.audio, format: 'wav' } },
      ] }],
    });
    assert.strictEqual(oaiMedia.status, 200);
    assert.deepStrictEqual(latestGatewayRequest.messages[0].media.map(m => m.type).sort(), ['audio', 'image', 'video']);
    assert.ok(latestGatewayRequest.messages[0].media.every(m => m.dataUrl.startsWith('data:')));
    const oaiMediaItems = oaiMedia.json.choices[0].message.media;
    assert.deepStrictEqual(oaiMediaItems.map(m => m.type).sort(), ['audio', 'image', 'video']);
    assert.ok(oaiMediaItems.every(m => new URL(m.url).pathname.startsWith('/v1/media/')));
    const imageUrl = new URL(oaiMediaItems.find(m => m.type === 'image').url);
    const imageRange = await httpReq(port, 'GET', imageUrl.pathname, { Range: 'bytes=0-2' });
    assert.strictEqual(imageRange.status, 206);
    assert.strictEqual(imageRange.headers['content-type'], 'image/png');
    assert.strictEqual(imageRange.headers['content-range'], `bytes 0-2/${generatedMediaBytes.image.length}`);
    assert.strictEqual(imageRange.raw, generatedMediaBytes.image.subarray(0, 3).toString());
    const audioUrl = new URL(oaiMediaItems.find(m => m.type === 'audio').url);
    const audioHead = await httpReq(port, 'HEAD', audioUrl.pathname);
    assert.strictEqual(audioHead.status, 200);
    assert.strictEqual(audioHead.headers['content-type'], 'audio/wav');
    assert.strictEqual(Number(audioHead.headers['content-length']), generatedMediaBytes.audio.length);
    assert.strictEqual(audioHead.raw, '');

    console.log('[5] POST /v1/chat/completions (stream SSE)');
    const oaiSse = await httpReq(port, 'POST', '/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
      model: 'claude-3.7-sonnet',
      stream: true,
      messages: [{ role: 'user', content: '你好' }],
    });
    assert.strictEqual(oaiSse.status, 200);
    assert.ok(oaiSse.raw.includes('chat.completion.chunk'));
    assert.ok(oaiSse.raw.includes('data: [DONE]'));

    console.log('[5a] OpenAI-compatible streaming multimodal response');
    const oaiMediaSse = await httpReq(port, 'POST', '/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
      model: 'brana-current',
      stream: true,
      messages: [{ role: 'user', content: 'MEDIA_TEST_OPENAI_STREAM' }],
    });
    assert.strictEqual(oaiMediaSse.status, 200);
    assert.ok(oaiMediaSse.raw.includes('/v1/media/'));
    assert.ok(oaiMediaSse.raw.includes('data: [DONE]'));

    console.log('[6] POST /v1/responses');
    const oaiResp = await httpReq(port, 'POST', '/v1/responses', { Authorization: `Bearer ${key}` }, {
      model: 'claude-3.7-sonnet',
      stream: false,
      input: '你好',
    });
    console.log(oaiResp); assert.strictEqual(oaiResp.status, 200);
    assert.strictEqual(oaiResp.json.object, 'response');
    assert.ok(oaiResp.json.output_text.includes('Brana'));

    console.log('[6a] OpenAI Responses multimodal request + output mapping');
    const responsesMedia = await httpReq(port, 'POST', '/v1/responses', { Authorization: `Bearer ${key}` }, {
      model: 'brana-current',
      stream: false,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: 'MEDIA_TEST_RESPONSES' },
        { type: 'input_image', image_url: 'data:image/png;base64,' + inputMediaB64.image },
        { type: 'input_video', video_url: 'data:video/mp4;base64,' + inputMediaB64.video },
        { type: 'input_audio', input_audio: { data: inputMediaB64.audio, format: 'wav' } },
      ] }],
    });
    assert.strictEqual(responsesMedia.status, 200);
    assert.deepStrictEqual(latestGatewayRequest.messages[0].media.map(m => m.type).sort(), ['audio', 'image', 'video']);
    const responseParts = responsesMedia.json.output.flatMap(o => o.content || []);
    const outputMediaParts = responseParts.filter(p => /^output_(image|video|audio)$/.test(p.type));
    assert.deepStrictEqual(outputMediaParts.map(p => p.type).sort(), ['output_audio', 'output_image', 'output_video']);
    assert.ok(outputMediaParts.every(p => new URL(p.image_url || p.video_url || p.audio_url).pathname.startsWith('/v1/media/')));

    console.log('[7] POST /v1/messages (Anthropic non-stream + tools)');
    const antJson = await httpReq(port, 'POST', '/v1/messages', { 'x-api-key': key }, {
      model: 'claude-3.7-sonnet',
      stream: false,
      messages: [{ role: 'user', content: '查天气' }],
      tools: [{ name: 'get_weather', description: '查询天气', input_schema: { type: 'object' } }],
    });
    assert.strictEqual(antJson.status, 200);
    assert.strictEqual(antJson.json.stop_reason, 'tool_use');
    assert.ok(antJson.json.content.some(b => b.type === 'thinking'));
    assert.ok(antJson.json.content.some(b => b.type === 'tool_use' && b.name === 'get_weather'));

    console.log('[7a] Anthropic-compatible image/video/audio input and media output');
    const antMedia = await httpReq(port, 'POST', '/v1/messages', { 'x-api-key': key }, {
      model: 'claude-3.7-sonnet',
      stream: false,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'MEDIA_TEST_ANTHROPIC' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: inputMediaB64.image } },
        { type: 'video', source: { type: 'base64', media_type: 'video/mp4', data: inputMediaB64.video } },
        { type: 'audio', source: { type: 'base64', media_type: 'audio/wav', data: inputMediaB64.audio } },
      ] }],
    });
    assert.strictEqual(antMedia.status, 200);
    assert.deepStrictEqual(latestGatewayRequest.messages[0].media.map(m => m.type).sort(), ['audio', 'image', 'video']);
    assert.deepStrictEqual(antMedia.json.media.map(m => m.type).sort(), ['audio', 'image', 'video']);
    assert.ok(antMedia.json.media.every(m => new URL(m.url).pathname.startsWith('/v1/media/')));

    console.log('[8] POST /v1/messages (Anthropic stream SSE)');
    const antSse = await httpReq(port, 'POST', '/v1/messages', { 'x-api-key': key }, {
      model: 'claude-3.7-sonnet',
      stream: true,
      messages: [{ role: 'user', content: '你好' }],
    });
    assert.strictEqual(antSse.status, 200);
    assert.ok(antSse.raw.includes('event: message_start'));
    assert.ok(antSse.raw.includes('event: content_block_delta'));
    assert.ok(antSse.raw.includes('event: message_stop'));

    console.log('[9] POST /v1beta/models/gemini-2.5-pro:generateContent');
    const gemJson = await httpReq(port, 'POST', `/v1beta/models/gemini-2.5-pro:generateContent?key=${key}`, {}, {
      contents: [{ role: 'user', parts: [{ text: '查天气' }] }],
      tools: [{ functionDeclarations: [{ name: 'get_weather', description: '查询天气' }] }],
    });
    assert.strictEqual(gemJson.status, 200);
    const parts = gemJson.json.candidates[0].content.parts;
    assert.ok(parts.some(p => p.thought === true));
    assert.ok(parts.some(p => p.functionCall && p.functionCall.name === 'get_weather'));

    console.log('[9a] Gemini multimodal request + image/video/audio response parts');
    const gemMedia = await httpReq(port, 'POST', `/v1beta/models/gemini-2.5-pro:generateContent?key=${key}`, {}, {
      contents: [{ role: 'user', parts: [
        { text: 'MEDIA_TEST_GEMINI' },
        { inlineData: { mimeType: 'image/png', data: inputMediaB64.image } },
        { inlineData: { mimeType: 'video/mp4', data: inputMediaB64.video } },
        { inlineData: { mimeType: 'audio/wav', data: inputMediaB64.audio } },
      ] }],
    });
    assert.strictEqual(gemMedia.status, 200);
    assert.deepStrictEqual(latestGatewayRequest.messages[0].media.map(m => m.type).sort(), ['audio', 'image', 'video']);
    const gemMediaParts = gemMedia.json.candidates[0].content.parts.filter(p => p.inlineData);
    assert.deepStrictEqual(gemMediaParts.map(p => p.inlineData.mimeType).sort(), ['audio/wav', 'image/png', 'video/mp4']);
    assert.ok(gemMediaParts.every(p => p.inlineData.data.length > 0));

    console.log('[9b] Battle proxy card registration (-battle-A / -battle-B routing & toggle/delete)');
    const upSt = await gw.handleIpc(activeWebContents, {
      op: 'upsertProxy',
      card: {
        sid: 'battle-sid-999',
        accountId: 'acc-1',
        title: '视频 Battle 对话',
        mode: 'battle',
        modality: 'video',
        battleTarget: 'B',
      },
    });
    assert.strictEqual(upSt.proxies.length, 1);
    const bCard = upSt.proxies[0];
    assert.ok(bCard.modelIdA.endsWith('-battle-A'));
    assert.ok(bCard.modelIdB.endsWith('-battle-B'));
    assert.strictEqual(bCard.modelId, bCard.modelIdB);

    const modelsAfterBattle = await httpReq(port, 'GET', '/v1/models');
    const modelIdsAfter = modelsAfterBattle.json.data.map(m => m.id);
    assert.ok(modelIdsAfter.includes(bCard.modelIdA), 'models list must include <id>-battle-A');
    assert.ok(modelIdsAfter.includes(bCard.modelIdB), 'models list must include <id>-battle-B');

    const resBattleB = await httpReq(port, 'POST', '/v1/chat/completions', { Authorization: 'Bearer ' + key }, {
      model: bCard.modelIdB,
      messages: [{ role: 'user', content: '继续生成下一个视频' }],
    });
    assert.strictEqual(resBattleB.status, 200);
    assert.strictEqual(latestGatewayRequest.boundSid, 'battle-sid-999');
    assert.strictEqual(latestGatewayRequest.battleSide, 'b');

    const resBattleA = await httpReq(port, 'POST', '/v1/chat/completions', { Authorization: 'Bearer ' + key }, {
      model: bCard.modelIdA,
      messages: [{ role: 'user', content: '继续生成下一个视频' }],
    });
    assert.strictEqual(resBattleA.status, 200);
    assert.strictEqual(latestGatewayRequest.battleSide, 'a');

    await gw.handleIpc(activeWebContents, { op: 'toggleProxy', sid: 'battle-sid-999', enabled: false });
    const stoppedRes = await httpReq(port, 'POST', '/v1/chat/completions', { Authorization: 'Bearer ' + key }, {
      model: bCard.modelIdB,
      messages: [{ role: 'user', content: '测试暂停' }],
    });
    assert.strictEqual(stoppedRes.status, 403);

    const afterDel = await gw.handleIpc(activeWebContents, { op: 'deleteProxy', sid: 'battle-sid-999' });
    assert.strictEqual(afterDel.proxies.length, 0);

    const tunSt = await gw.handleIpc(activeWebContents, { op: 'tunnelConfig', mode: 'custom', customDomain: 'https://api.example.com' });
    assert.strictEqual(tunSt.publicBaseUrlOpenAI, 'https://api.example.com/v1');

    console.log('[10] Checking UI bundle source & Direct/Battle mode copy button stability...');
    const coreCode = fs.readFileSync(path.join(clientRoot, 'ui/core.js'), 'utf8');
    const viewCode = fs.readFileSync(path.join(clientRoot, 'ui/view.js'), 'utf8');
    const dockCode = fs.readFileSync(path.join(clientRoot, 'ui/dock.js'), 'utf8');
    const probeUiCode = fs.readFileSync(path.join(clientRoot, 'ui/billing-probe-ui.js'), 'utf8');
    const plusCode = fs.readFileSync(path.join(clientRoot, 'ui/plus.js'), 'utf8');
    const cssCode = fs.readFileSync(path.join(clientRoot, 'ui/app.css'), 'utf8');
    assert.ok(viewCode.includes("ICON.api =") || viewCode.includes("api: '<path"));
    assert.ok(viewCode.includes("canonDirect"));
    assert.ok(viewCode.includes("BranaHost.copyText"));
    assert.ok(coreCode.includes("Boolean(prev.directMode) === Boolean(v.directMode)"));
    assert.ok(dockCode.includes("BillingProbe.summary?.(sid, { readOnly: true })"));
    assert.ok(probeUiCode.includes("!isEvalSess &&"));
    assert.ok(plusCode.includes("const LocalApiGateway = (() =>"));
    assert.ok(plusCode.includes("computeModalSig"));
    assert.ok(plusCode.includes("_pointerDownInModal"));
    assert.ok(plusCode.includes("eval:stream"));
    assert.ok(cssCode.includes(".menu.plus-menu"));
    assert.ok(cssCode.includes(".modal.api-gw-modal"));
    assert.ok(cssCode.includes(".api-gw-cp.copied"));

    console.log('ALL_LOCAL_API_GATEWAY_TESTS_PASSED', {
      port,
      modelsCount: modelsRes.json.data.length,
      logsCount: gw.getPublicState().logs.length,
    });
  } finally {
    await gw.stopServer();
  }
})().catch((err) => {
  console.error('TEST_FAILED:', err);
  process.exit(1);
});
