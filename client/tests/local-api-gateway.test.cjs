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
  console.log('[1] Testing vendor inference & slug...');
  assert.strictEqual(inferVendorProtocol('claude-opus-4-6', 'Anthropic'), 'anthropic');
  assert.strictEqual(inferVendorProtocol('gemini-2.5-pro', 'Google'), 'gemini');
  assert.strictEqual(inferVendorProtocol('gpt-5.1-high', 'OpenAI'), 'openai');
  assert.strictEqual(canonicalModelSlug('Claude 3.7 Sonnet (Thinking)', ''), 'claude-3.7-sonnet-thinking');

  let gw = null;
  const activeWebContents = {
    isDestroyed: () => false,
    send: (channel, payload) => {
      if (channel === 'host:api-gateway-req') {
        const reqId = payload.reqId;
        const hasTools = Array.isArray(payload.tools) && payload.tools.length > 0;
        setImmediate(() => {
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
  const port = started.port;
  const key = started.apiKey;
  console.log('[2] Started on port', port);

  try {
    console.log('[3] GET /v1/models');
    const modelsRes = await httpReq(port, 'GET', '/v1/models', { Authorization: `Bearer ${key}` });
    assert.strictEqual(modelsRes.status, 200);
    assert.ok(modelsRes.json.data.some(m => m.id === 'claude-3.7-sonnet'));
    assert.ok(modelsRes.json.data.some(m => m.id === 'brana-current'));

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

    console.log('[5] POST /v1/chat/completions (stream SSE)');
    const oaiSse = await httpReq(port, 'POST', '/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
      model: 'claude-3.7-sonnet',
      stream: true,
      messages: [{ role: 'user', content: '你好' }],
    });
    assert.strictEqual(oaiSse.status, 200);
    assert.ok(oaiSse.raw.includes('chat.completion.chunk'));
    assert.ok(oaiSse.raw.includes('data: [DONE]'));

    console.log('[6] POST /v1/responses');
    const oaiResp = await httpReq(port, 'POST', '/v1/responses', { Authorization: `Bearer ${key}` }, {
      model: 'claude-3.7-sonnet',
      stream: false,
      input: '你好',
    });
    console.log(oaiResp); assert.strictEqual(oaiResp.status, 200);
    assert.strictEqual(oaiResp.json.object, 'response');
    assert.ok(oaiResp.json.output_text.includes('Brana'));

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
