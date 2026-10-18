// Fingerprint beta adapter. Uses normal Chat.send; no trace endpoint is required for identity scoring.
const Fingerprint = (() => {
  const PROBES = ProbeLib.PROBES;
  const sessions = new WeakMap();
  const promptKey = prompt => {
    const p = PROBES.find(p => p.prompt === String(prompt || '').trim());
    return p ? ProbeLib.PROBE_PROTOCOL + ':' + p.id : '';
  };
  const loadBank = async options => {
    const base=await ProbeBankCache.load(options);
    if(options?.dynamic)return base; // Do not mix randomized prompts into fixed-protocol personal references.
    if(typeof PersonalFP==='undefined')return base;
    try{return await PersonalFP.load(base,options);}catch(e){return {...base,personalError:e?.message||'个人库读取失败',source:base.source+' · 个人库不可用'};}
  };
  function check(signal) {
    if (signal?.aborted) throw Object.assign(Error('已停止；已发送的消息不会撤回'), { name: 'AbortError' });
  }
  function abortable(promise, signal) {
    check(signal);
    return new Promise((resolve, reject) => {
      const stop = () => { cleanup(); reject(Object.assign(Error('已停止'), { name: 'AbortError' })); };
      const cleanup = () => signal?.removeEventListener('abort', stop);
      signal?.addEventListener('abort', stop, { once: true });
      Promise.resolve(promise).then(v => { cleanup(); resolve(v); }, e => { cleanup(); reject(e); });
    });
  }
  const textOf = m => (m?.parts || []).filter(p => p.type === 'text').map(p => p.text || '').join('\n');
  function currentAnswer(chat, prompt) {
    const messages = chat.messages || [];
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { idx = i; break; }
    if (idx < 0) return null;
    if (textOf(messages[idx]).trim() !== prompt) throw Error('当前对话插入了其他消息，已停止探测');
    const answers = messages.slice(idx + 1).filter(m => m.role === 'assistant');
    if (!answers.length) return null;
    if (answers.length !== 1) throw Error('本轮有多条助手消息，无法保证探针对应关系');
    return answers[0];
  }
  function extractAnswer(message) {
    if (!message || message.metadata?.aborted || message.metadata?.pending) throw Error('回复被停止或尚未完成');
    if ((message.parts || []).some(p => p.toolCallId || /tool|refusal/i.test(p.type || ''))) throw Error('探针触发工具或交互面板，已保留对话并停止');
    const text = textOf(message);
    if (!text.trim()) throw Error('没有完整文本回复');
    return text;
  }
  function armProbe(chat, probe) {
    const state=sessions.get(chat); if(!state)return;
    state.probe=probe; state.owner=null; state.at=now(); state.checked=null;
  }
  function ownedTurn(chat) {
    const state=sessions.get(chat);if(!state?.probe)return null;
    const messages=chat.messages||[];
    let idx=messages.length-1;while(idx>=0&&messages[idx].role!=='user')idx--;
    const user=messages[idx];if(!user||textOf(user).trim()!==state.probe.prompt)return null;
    const key=user.id||user;
    if(state.owner&&state.owner!==key)return null;
    if(!state.owner){state.owner=key;state.at=Number.isFinite(chat.sentAt)&&chat.sentAt>0?Math.min(now(),chat.sentAt):now();}
    return {state,answers:messages.slice(idx+1).filter(m=>m.role==='assistant')};
  }
  const skipFlag = chat => sessions.get(chat)?.skip || chat.gacha?.compatSkip;
  function requestSkip(chat, diagnostic) {
    if(skipFlag(chat))return false;
    const state=sessions.get(chat);if(!state&&!chat.gacha)return false;
    const flag={...diagnostic,at:now(),error:'',stopped:false};
    if(state)state.skip=flag;
    if(flag.reason==='visible-thinking'||flag.reason==='compat-thinking'){chat.thinkStopped=true;if(chat.live)chat.live.metadata={...(chat.live.metadata||{}),openThinkStopped:true};}
    try { Strength.markAborted?.(chat.sid); } catch {}
    if(chat.gacha)chat.gacha.compatSkip=flag;
    chat.probeProgress=(ProbeOutputGuard.LABELS[flag.reason]||'输出异常')+'，正在确认停止';
    flag.promise=Promise.resolve().then(()=>chat.busy?chat.stop({strict:true}):undefined).then(()=>{flag.stopped=true;},e=>{flag.error=e?.message||'停止请求失败';});
    recordSkip(chat,flag,false);return true;
  }
  function maybeGuardProbe(chat) {
    if(skipFlag(chat))return false;
    const turn=ownedTurn(chat);if(!turn)return false;
    const {state,answers}=turn;
    if(answers.length>1)return requestSkip(chat,{reason:'probe-multiple',detail:'本轮有多条助手消息，无法保证探针对应关系；保留对话，不评分'});
    const text=answers.map(textOf).join('\n');
    // Streaming chunks and polling share the same bounded scanner; unchanged text is not rescanned.
    const key=String(!!chat.busy)+':'+text;
    if(state.checked!==key){
      state.checked=key;
      const anomaly=ProbeOutputGuard.inspect(text,state.probe.expected_count,!!chat.busy,state.probe.maxExtra ?? null);
      if(anomaly)return requestSkip(chat,anomaly);
    }
    if(now()-state.at>=ProbeOutputGuard.TIMEOUT_MS)return requestSkip(chat,{reason:'probe-timeout',detail:'单条探针等待达到 180 秒；保留对话，不截取或评分'});
    return false;
  }
  async function waitAnswer(chat, probe, signal) {
    while (true) {
      check(signal);
      maybeStopCompat(chat);maybeGuardProbe(chat);
      if (skipFlag(chat)) return { skipped: await finishCompatSkip(chat, signal) };
      if (chat.error && !chat.busy) throw Error('回复失败：' + chat.error);
      const answer = currentAnswer(chat, probe.prompt);
      if (answer && (answer.parts || []).some(p => p.toolCallId || /tool|refusal/i.test(p.type || ''))) extractAnswer(answer);
      if (!chat.busy && answer) return { message: answer, text: extractAnswer(answer) };
      // Missing/mismatched input must not leave a timer-less loop or stop somebody else's turn.
      if(!ownedTurn(chat))throw Error('当前探针消息已改变，已停止探测');
      await abortable(sleep(200), signal);
    }
  }
  // opt.live === false：这一轮不是对话里最新的一轮（校准更早的回复）——chat.fmt 是最新一轮的实时数据，不能拿来算这一轮的思考时长
  function reasonScore(chat, probe, familyHint, opt = {}) {
    const useLive = opt.live !== false;
    try {
      const t = (Trace.turns(chat.sid) || []).filter(t => t.done && !t.changed && !t.outcome && t.prompt?.trim() === probe.prompt).at(-1);
      if (t?.sum) {
        const durations = (t.calls || []).map(c => c.ms).filter(v => Number.isFinite(v) && v > 0);
        const live = useLive ? Fmt.est(chat.fmt, familyHint, true) : null, x = { out: t.sum.output, tok: t.sum.tok, usd: t.sum.usd, rs: t.sum.reasoning, think: live?.think, rChars: useLive ? chat.fmt?.rChars : undefined, sec: durations.length ? durations.reduce((a, b) => a + b, 0) / 1000 : null };
        const score = Strength.scoreOf(x);
        if (Number.isFinite(score)) return { score, source: Strength.isLive(x) ? 'measured' : 'estimated', ...x };
      }
    } catch {}
    const est = useLive ? Fmt.est(chat.fmt, familyHint, true) : null;
    return est && Number.isFinite(est.score) ? { ...est, source: 'estimated' } : { score: null, source: 'unavailable' };
  }
  function calibrationRows() {
    const rows = [];
    for (const [name, samples] of Object.entries(Strength.samples || {})) {
      const parts = Strength.parts(name);
      for (const r of samples || []) if (r.promptKey) rows.push({ key: String(r.k).split(':')[0], family: ProbeLib.baseModelId(name), tier: parts.tier, promptKey: r.promptKey, source: 'measured', score: Strength.scoreOf(r) });
    }
    // Estimates have their own cohort; never compare estimated new-chat scores with measured old-chat scores.
    for (const r of Store.get('fingerprint:calibration', []) || []) rows.push(r);
    return rows;
  }
  function saveKnownCalibration(chat, measurement, key) {
    const known = Models.get(chat.sid);
    if (!known?.name || known.guess || !Number.isFinite(measurement.score)) return;
    const tier = Strength.parts(known.name).tier;
    if (!/^(none|minimal|low|medium|high|xhigh|max)$/.test(tier || '')) return;
    const row = { key: chat.sid, family: ProbeLib.baseModelId(known.name), tier, promptKey: key, source: measurement.source, score: measurement.score };
    const rows = (Store.get('fingerprint:calibration', []) || []).filter(r => !(r.key === row.key && r.promptKey === key && r.source === row.source));
    rows.push(row); Store.set('fingerprint:calibration', rows.slice(-600));
  }
  function compatibleFamily(result, format) {
    // Format evidence is only a weak hint. Conflicting hints suppress automatic identity decisions;
    // never turn an out-of-bank compatible model into GPT simply because GPT is the nearest candidate.
    if (!format?.fam || !result) return !!result;
    const fam = result.nearest.family;
    if (format.fam === 'compat') return !['gpt', 'claude', 'gemini'].includes(fam);
    // 数字编号的回复流 Anthropic（Claude）和 Google（Gemini）接口长得一样，格式只能说明「不是 GPT / 兼容接口」，
    // 不能在这两家之间否决数字指纹（toolu_ 工具编号才是 Claude 独有）
    if (format.fam === 'claude' || format.fam === 'gemini') {
      if (/toolu_/.test(format.why || '')) return fam === 'claude';
      return fam === 'claude' || fam === 'gemini';
    }
    if (format.sure === false) return true;   // 不确定的格式提示只是提示，不否决指纹
    const known = ['gpt', 'claude', 'gemini', 'mistral'];
    return !known.includes(format.fam) || fam === format.fam;
  }
  function blacklistMatch(entry, settings) {
    const fp = entry?.fingerprint, api = fp?.apiIdentity;
    if (!settings.archiveOn || !Array.isArray(settings.archiveKeywords) || !fp || fp.skipped || fp.probeError || fp.apiUnsafe) return '';
    if (!api && fp.apiIdentity === null && !entry.guess && (entry.internal || entry.response)) return '';
    const result = fp.result, probability = result?.signals?.relative_probability ?? result?.nearest?.probability;
    if (!api && (fp.error || fp.conflict || !['clear', 'close'].includes(result?.status) || !Number.isFinite(probability) || probability < 0.95 || probability > 1)) return '';
    const name = api ? (api.name || api.model) : result.nearest?.id;
    return GachaPrompts.match(name || '', settings.archiveKeywords);
  }
  function classify(entry, settings, matches) {
    const fp = entry?.fingerprint;
    // Blacklist uses its explicit 95% threshold; target hits still require a clear result.
    if (!fp || fp.skipped || fp.probeError || fp.apiUnsafe) return 'keep';
    const api=fp.apiIdentity;
    if (!api && fp.apiIdentity===null && !entry.guess && (entry.internal||entry.response)) return 'keep'; // Historical Models cache cannot borrow a candidate's clarity.
    if (blacklistMatch(entry, settings)) return 'archive';
    if (!api && (fp.error || fp.conflict || !fp.result || fp.result.status !== 'clear')) return 'keep';
    const min = settings.minStr;
    const tiers = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };
    const level = tiers[api ? (api.tier || (fp.reasoning?.model===api.model ? fp.reasoning.tier : null)) : fp.reasoning?.tier];
    const strong = !min || (Number.isFinite(level) && (min === 'top' ? level >= 5 : level >= 4));
    if (matches && strong) return 'hit';
    return 'keep';
  }
  function details(entry) {
    const fp = entry?.fingerprint; if (!fp) return entry?.name || '';
    if (fp.skipped) return describe(entry) + '（未评分） · ' + (fp.skipDetail || fp.error || '按旧版思考开关跳过');
    const r = fp.reasoning;
    const score = Number.isFinite(r?.score) ? `${/^estimated/.test(r.source||'') ? '估算' : ''}推理分 ${r.score}` : '推理分不可用';
    const tier = fp.apiIdentity?.tier ? `接口档位 ${fp.apiIdentity.tier}` : r?.tier ? `${r.tier}≈ · 参考 ${r.reference}` : '档位未校准';
    return `${entry.name}${fp.apiIdentity?" · 接口识别":fp.apiIdentity===null&&!entry.guess?" · 既往接口身份（本轮未核验）":""}${(!fp.apiIdentity&&(entry.guess||!(entry.internal||entry.response)))?(fp.suffix||''):(fp.result?' · 指纹候选 '+fp.result.nearest.id+(fp.suffix||''):'')}${fp.result?.library?' · 指纹库 '+fp.result.library:''} · ${score} · ${tier}`+(!fp.apiIdentity?.tier&&r?.tier&&Number.isFinite(r.confidence)?' · 档位相对匹配 '+(r.confidence*100).toFixed(1)+'%':'')+(fp.library?' · '+fp.library.message:'')+(fp.personalError?' · 个人库不可用：'+fp.personalError:'')+(fp.personal?' · 个人库权重未经总体概率校准':'')+(fp.result?.reason==='personal_context_mismatch'?' · 跨上下文参考，仅作候选':'');
  }
  // 几个指纹库各说各的时，说明谁说了什么（最终取各库平均概率最大者，且只算「接近」）
  const libNote = entry => { const d = entry?.fingerprint?.result?.disagree; return d?.length ? ' · 指纹库不一致：' + d.map(x => x.lib + '→' + x.id).join('、') + '，按各库平均概率取最大者' : ''; };
  function describe(entry) {
    if(entry?.fingerprint && typeof ConversationLabels!=='undefined')return ConversationLabels.fingerprintLabel(entry);
    const fp=entry?.fingerprint;if(!fp)return entry?.name||'';
    if(fp.skipped && fp.stopConfirmed===false)return entry.name+' · '+(ProbeOutputGuard.LABELS[fp.skipped]||'输出异常')+'（停止未确认）';
    if(fp.skipped)return entry.name+' · '+(fp.skipped==='compat-thinking'||fp.skipped==='visible-thinking'?'因思考跳过':(ProbeOutputGuard.LABELS[fp.skipped]||'输出异常')+'（已跳过）');
    const confidence=/匹配置信度\s*(\d+(?:\.\d+)?)%/.exec(fp.suffix||'')?.[1];
    const score=(n=>Number.isFinite(n)&&n>=0&&n<=100?n:undefined)(fp.reasoning?.score);
    const tier=(!fp.apiIdentity&&(entry.guess||!(entry.internal||entry.response)))&&fp.reasoning?.tier?(' '+fp.reasoning.tier+'≈'+(Number.isFinite(fp.reasoning.confidence)?'('+(fp.reasoning.confidence*100).toFixed(1)+'%)':'')):'';
    return entry.name+(confidence!=null&&(!fp.apiIdentity&&(entry.guess||!(entry.internal||entry.response)))?'('+confidence+'%)':'')+tier+(Number.isFinite(score)?'-'+score+'分':'');
  }
  // 判断当前流是否已具有明确的闭源思考/闭源流特征（闭源思考绝不触发暂停，仅真正的开源思考才暂停）
  function isClosedSourceStream(chat) {
    if (!chat) return false;
    if (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.isClosed(chat)) return true;
    const f = chat.fmt;
    if (f) {
      if ((f.toolIds || []).some(i => /^toolu_/i.test(String(i || '')))) return true;
      const ids = Array.isArray(f.ids) ? f.ids : [];
      const all = ids.map(x => String(x?.[1] ?? '')).filter(Boolean);
      const rs = ids.filter(x => x?.[0] === 'r').map(x => String(x?.[1] ?? '')).filter(Boolean);
      if (all.length > 0) {
        const hasCompatId = all.some(i => /^(?:txt|reasoning)-\d+$/i.test(i) || /^[0-9a-z]{9}$/.test(i));
        if (!hasCompatId) {
          if (all.some(i => /^(?:msg|rs)_[0-9a-f]{16,}/i.test(i)) || (rs.some(i => /^tc_[A-Za-z0-9_-]{10,}$/.test(i)) && (Number(f.rChars) || 0) === 0)) return true;
          if (all.every(i => /^\d+$/.test(i)) && ((Number(f.rChars) || 0) === 0 || /^\s*\*\*[^\n*]{2,80}\*\*/.test(String(f.rHead || '')))) return true;
        }
      }
      if (/^\s*\*\*[^\n*]{2,80}\*\*/.test(String(f.rHead || '')) && !ids.some(x => /^(?:txt|reasoning)-\d+$/i.test(String(x?.[1] ?? '')))) return true;
    }
    if (chat.sid && typeof Models !== 'undefined' && typeof Pricing !== 'undefined' && Pricing.isClosedSourceModel) {
      const m = Models.get(chat.sid);
      if (m && (m.reverseInferred || m.billing) && m.name && Pricing.isClosedSourceModel({ id: m.response || m.internal || m.name, name: m.name }) && !Pricing.isOpenSourceModel?.({ id: m.response || m.internal || m.name, name: m.name })) {
        const all = Array.isArray(f?.ids) ? f.ids.map(x => String(x?.[1] ?? '')).filter(Boolean) : [];
        const hasCompatId = all.some(i => /^(?:txt|reasoning)-\d+$/i.test(i) || /^[0-9a-z]{9}$/.test(i));
        if (!hasCompatId) return true;
      }
    }
    return false;
  }
  // Kept as an API name for existing stream hooks; only open-source visible thinking pauses.
  function maybeStopCompat(chat) {
    if (!chat?.busy || !chat.gacha?.skipCompatThinking || skipFlag(chat) || active.has(chat)) return false;
    if (isClosedSourceStream(chat)) return false;
    const head = String(chat.fmt?.rHead || '');
    if (!/[^\s.…·。]/.test(head)) return false;
    return requestSkip(chat,{reason:'visible-thinking',detail:'抽卡开关开启：检测到开源可见 Thinking 思考内容，已跳过'});
  }
  async function finishCompatSkip(chat, signal) {
    const flag=skipFlag(chat);if(!flag)return null;
    const fail=message=>{recordSkip(chat,flag,false,message);return Object.assign(Error(message),{code:'COMPAT_STOP_FAILED'});};
    let timer;
    try {
      await abortable(Promise.race([flag.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('停止请求超时，抽卡已暂停')),30000);})]),signal);
    } finally {clearTimeout(timer);}
    check(signal);
    if(flag.error || !flag.stopped)throw fail('无法确认停止请求成功，抽卡已暂停：'+(flag.error||'未知错误'));
    const until=now()+20000;
    while(chat.busy){check(signal);if(now()>=until)throw fail('停止后对话仍在输出，抽卡已暂停');await abortable(sleep(100),signal);}
    return recordSkip(chat,flag,true);
  }
  function recordSkip(chat,flag,confirmed,stopError='') {
    const known=Models.get(chat.sid);
    const entry={name:'待定',guess:true,tier:null,provider:'探针保护',fingerprint:{
      skipped:flag.reason,stopConfirmed:confirmed,skipDetail:flag.detail+(stopError?'；'+stopError:''),guard:{at:flag.at,observed:flag.observed,limit:flag.limit,period:flag.period},
      count:0,result:null,conflict:false,error:flag.detail,suffix:'',reasoning:{score:null,tier:null},
      warning:'本轮跳过，不截取样本，不用于指纹或推理分校准；可见思考不是开源身份证明。'
    }};
    const final=known?.name&&!known.guess?{...known,fingerprint:entry.fingerprint}:entry;
    Models.set(chat.sid,final);chat.probeNumbers=[];Bus.emit('model',chat,final);chat.emit();return final;
  }
  async function waitCompatDecision(chat, signal) {
    const until=now()+600000;
    while(chat.busy || chat.gacha?.compatSkip){
      check(signal);maybeStopCompat(chat);
      if(chat.gacha?.compatSkip)return finishCompatSkip(chat,signal);
      if(now()>=until)throw Object.assign(Error('等待抽卡回复超时，已暂停'),{code:'COMPAT_STOP_FAILED'});
      await abortable(sleep(100),signal);
    }
    return null;
  }
  function command(chat, text, {attachments=false}={}) {
    if(String(text||'').trim()!=='/测指纹')return {handled:false};
    const error=typeof FingerprintBatch!=='undefined'&&FingerprintBatch.busy?'批量测指纹正在运行，请等待或停止':!chat?.sid?'请先打开需要验证的旧对话，再输入 /测指纹':attachments?'指纹命令不能附带附件':chat.busy?'当前回复未结束，指纹命令不会排队发送':active.has(chat)?'当前对话正在测指纹':chat.gacha?'该对话正在抽卡':chat.queue?.length?'请先处理待发送队列，再测指纹':'';
    if(error)return {handled:true,accepted:false,error};
    return {handled:true,accepted:true,completion:startCurrent(chat)};
  }
  async function run(chat, options = {}) {
    if(sessions.has(chat))throw Error('当前对话正在测指纹');
    const challenges=options.challenges || PROBES;
    if(!Array.isArray(challenges)||challenges.length!==3||challenges.some(p=>!p?.prompt||!Number.isFinite(p.expected_count)))throw Error('指纹题组无效');
    sessions.set(chat,{});armProbe(chat,challenges[0]);
    let state=null;
    try {
      if(Object.prototype.hasOwnProperty.call(options,'libraryState'))state=options.libraryState;else if(typeof PersonalFP!=='undefined')try{state=await PersonalFP.begin(chat,{firstProbeSent:true});}catch{}
      const entry=await runProbes(chat,{...options,libraryState:state,forceThree:options.forceThree||(!chat.gacha&&!!state?.known)});
      if(state)try{await PersonalFP.finish(state,chat,entry);}catch(e){entry.fingerprint.library={message:'本地保存失败：'+describe(e),added:false};}
      check(options.signal);
      if(state){Models.set(chat.sid,entry);Bus.emit("model",chat,entry);}
      return entry;
    }catch(e){if(state)try{await PersonalFP.log({model:state.known?.model||'未知',kind:state.known?'reference-check':'identify-only',message:'测试中止：'+describe(e),added:false},state.owner);}catch{}throw e;}finally{sessions.delete(chat);}
  }
  async function runProbes(chat, { signal, progress = () => {}, libraryState=null, forceThree=false, challenges=PROBES, preferredKeywords=null, blacklist=null } = {}) {
    const sid = chat.sid;
    const before = Models.get(sid);   // 本次测试开始前的识别结果（测试中途会写临时条目，不能拿那个当「之前的结果」）
    const outputs = [], measurements = [], probeDurations = [], thinkTimes = [], answerMsgs = [];
    const dynamic = challenges !== PROBES;
    const prefer = Array.isArray(preferredKeywords);
    let firstPreference=null;
    let result = null, loaded = null, format = null, plan = null, error = '', knownIdentity = '', stage='bank', probeError=false, wrotePartial = false;
    const verifyIdentity = () => {
      if(libraryState)return; // Compare correlated per-turn identities, not partial/stale Models names.
      const m = Models.get(sid);
      if (m?.name && !m.guess && !m.reverseInferred && !m.billingProbe) {
        const name = ProbeLib.baseModelId(m.name);
        if (knownIdentity && name !== knownIdentity) throw Error('探测期间服务端型号改变，不能合并指纹');
        knownIdentity = name;
      }
    };
    try {
      loaded = await abortable(loadBank({sid,context:libraryState?.context||'history',dynamic}), signal);
      for (let i = 0; i < 3; i++) {
        stage='probe';
        check(signal);
        if (chat.sid !== sid) throw Error('对话已改变');
        verifyIdentity();
        if (i) {
          // Verify the previous probe is still the last user message before appending another.
          currentAnswer(chat, challenges[i - 1].prompt);
          if (chat.busy) throw Error('另一轮正在运行，未发送下一条');
          progress(`发送指纹第 ${i + 1}/3 条`);
          check(signal);
          armProbe(chat,challenges[i]);
          await abortable(chat.send(challenges[i].prompt,{fingerprint:true}), signal);
        }
        progress(`等待指纹第 ${i + 1}/${prefer ? (firstPreference?.keyword ? 3 : 1) : 3} 条完整回复`);
        const answer = await waitAnswer(chat, challenges[i], signal);
        if (answer.skipped) return answer.skipped;
        check(signal);
        verifyIdentity();
        outputs.push({ text: answer.text, expected_count: challenges[i].expected_count, challenge_id: challenges[i].id }); answerMsgs.push(answer.message);
        const completedAt=Number.isFinite(chat.endAt)&&chat.endAt>=chat.sentAt ? chat.endAt : now();
        const elapsed=Number.isFinite(chat.sentAt)&&chat.sentAt>0 ? Math.max(0.1,(completedAt-chat.sentAt)/1000) : null;
        probeDurations.push(elapsed);
        { let th = null; try { const e = Fmt.est(chat.fmt, null, false); th = e && Number.isFinite(e.think) ? e.think : null; } catch {} thinkTimes.push(th); }   // 思考时长：服务器接单 → 第一个输出的静默时间
        format = Fmt.guess({ ...(chat.fmt || {}), ids: chat.fmt?.ids || [], done: true });
        if(libraryState)await abortable(PersonalFP.probe(libraryState,chat,challenges[i],answer.message,chat.sentAt),signal);
        check(signal);
        const prepared=ProbeLib.prepareOutputs(outputs);
        if(prepared.usable.length!==outputs.length||prepared.checks.at(-1)?.level!=='ok')throw Error(prepared.checks.at(-1)?.message||'本条未通过指纹门控');
        stage='scoring';
        const isOpenThink = !!(
          (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of?.(chat)?.kind === 'compat-thinking') ||
          (typeof FPLibs !== 'undefined' && FPLibs.thought?.(answerMsgs))
        );
        const isClosedFpId = id => {
          const s = String(id || '').toLowerCase();
          if (/qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|开源|国产|compat/i.test(s)) return false;
          return /gpt-|6-astra|6\.1-sol|6-sol|6-luna|5\.6-|openai|claude|anthropic|opus|sonnet|haiku|fable|gemini|google|barium|argon|grok|x-ai|muse-spark|inkling|solar-pro/i.test(s);
        };
        const inspected = (typeof FPLibs!=='undefined'?await FPLibs.inspect(outputs,loaded,{thought:isOpenThink || FPLibs.thought?.(answerMsgs)}):ProbeLib.inspectAndIdentify(outputs,loaded.bank));
        result = inspected.result;
        if (isOpenThink && result && Array.isArray(result.candidates)) {
          const openCands = result.candidates.filter(c => !isClosedFpId(c.id));
          if (openCands.length) {
            const sumP = openCands.reduce((a, c) => a + (Number(c.probability) || 0), 0) || 1;
            result.candidates = openCands.map(c => ({ ...c, probability: (Number(c.probability) || 0) / sumP }));
            result.nearest = { ...(result.nearest || {}), ...result.candidates[0] };
            if (result.signals) result.signals.relative_probability = result.candidates[0].probability;
          }
        }
        const meta=loaded.bank.models.find(m=>m.id===result.nearest.id);
        if(meta?.personal_only&&(meta.reference_groups<3||meta.context_mismatch)){result.status='close';result.reason=meta.context_mismatch?'personal_context_mismatch':'personal_samples_insufficient';}
        if (inspected.prepared.checks.at(-1)?.level !== 'ok') throw Error(inspected.prepared.checks.at(-1)?.message || '本条未通过指纹门控');
        const measured = reasonScore(chat, challenges[i], format?.fam || result?.nearest?.family);
        measurements.push(measured);
        if (result?.nearest?.id) {
          /* 每测完一条就把阶段结果写进去：标签、标题、右侧识别卡片和指纹溯源都实时跟着变（不用等三条测完）。
             第一条照旧发 model 事件（标题 / 归档那一套）；后面几条只刷新界面，最终结果仍在测完后统一写入。 */
          const existing = Models.get(sid), partialFp = { result, count: outputs.length, reasoning: { ...(measurements[0] || measured) }, partial: true, goal: forceThree ? 3 : (plan?.goal || 3) };
          let tempEntry = null;
          const isApiExisting = existing?.name && !existing.guess && !existing.reverseInferred && !existing.billingProbe;
          const fpPctNow = (result?.signals?.relative_probability ?? result?.nearest?.probability ?? 0) * 100;
          const revPctNow = Number(existing?.reverseMatch || 0);
          const blockedByOpen = isOpenThink && isClosedFpId(result.nearest.id);
          if (!isApiExisting && !blockedByOpen && (fpPctNow >= revPctNow || !existing?.name)) tempEntry = { ...(existing || {}), name: result.nearest.id + (result.status === 'clear' ? '' : '?'), guess: true, pendingConfirm: false, fingerprint: partialFp };
          else tempEntry = { ...existing, fingerprint: partialFp };
          Models.set(sid, tempEntry); wrotePartial = true;
          if (i === 0 && tempEntry.guess) Bus.emit('model', chat, tempEntry); else try { Dock.soon?.(); } catch {}
          if (typeof Titles !== 'undefined') {
            Titles.local(sid);
          }
          chat.emit();
          try { UI.renderTabs?.(); UI.renderListSoon?.(); } catch {}
        }
        if(libraryState){const proof=libraryState.proofs.at(-1);if(proof?.measurement)measurements[measurements.length-1]=proof.measurement;if(libraryState.mixed||libraryState.unsafe)throw Error("本轮接口改派、失败或型号不一致，不能合并参考");}
        check(signal);

        plan = ProbeLib.probePlan(result, loaded.bank, outputs.length);
        const apiForPlan=libraryState?PersonalFP.authority(libraryState):null;
        if(apiForPlan){const access=ProbeLib.modelAccess(apiForPlan.model,loaded.bank),early=access==='open'&&outputs.length===1;plan={access,goal:early?1:3,complete:early||outputs.length===3,early,reason:early?'接口确认开放权重型号，首条结束':'接口闭源或开放性未知，最多三条'};}
        if(forceThree||(!chat.gacha&&apiForPlan))plan={...plan,goal:3,complete:outputs.length===3,early:false};
        progress(`指纹 ${i + 1}/${plan.goal} · ${result.nearest.id}（${result.status}）`);
        /* 归档黑名单：抽卡时最接近的型号命中黑名单关键词、且相对概率 ≥ 95%，这一抽就到此为止（不再补测，哪怕没到 100%），交给归档 */
        const blKw = blacklistMatch({guess:true,fingerprint:{result,apiIdentity:apiForPlan,conflict:!compatibleFamily(result,format)}}, {archiveOn:true,archiveKeywords:blacklist});
        const blP = result?.signals?.relative_probability ?? result?.nearest?.probability ?? 0;
        if(chat.gacha&&blKw){
          plan={...(plan||{}),goal:outputs.length,complete:true,early:true,reason:'命中归档黑名单 '+blKw+(apiForPlan?'（接口确认）':'（'+(blP*100).toFixed(1)+'%）')+'，不再测'};
          progress(`指纹 ${outputs.length}/${outputs.length} · ${result.nearest.id} · ${plan.reason}`);
          break;
        }
        if(prefer){
          if(!firstPreference){const name=result.nearest.id||result.nearest.display_name||'';firstPreference={model:name,keyword:GachaPrompts.match(name,preferredKeywords),keywords:[...preferredKeywords]};}
          plan={...plan,goal:firstPreference.keyword?3:1,complete:outputs.length>=(firstPreference.keyword?3:1),early:!firstPreference.keyword,reason:firstPreference.keyword?'首次命中优选 '+firstPreference.keyword+'，完成三条':'首次未命中优选，仅测试一条'};
          progress(`指纹 ${outputs.length}/${plan.goal} · ${result.nearest.id} · ${plan.reason}`);
          if(plan.complete)break;
        }else if (plan.complete&&(!forceThree||outputs.length===3)) break;
      }
    } catch (e) {
      if (signal?.aborted || e?.name === 'AbortError' || e?.code === 'COMPAT_STOP_FAILED') { if (wrotePartial && before) try { Models.set(sid, before); Dock.soon?.(); } catch {} throw e; }   /* 中途停止：已有的识别结果不被半截结果盖掉 */
      probeError=stage==='probe';
      error = e?.message || String(e);
    }
    check(signal);
    if(libraryState){progress("核对本轮接口身份");await abortable(PersonalFP.finalize(libraryState,chat,{signal}),signal);check(signal);libraryState.proofs.forEach((p,i)=>{if(p?.measurement&&i<measurements.length)measurements[i]=p.measurement;});}
    const apiIdentity=libraryState?PersonalFP.authority(libraryState):null;
    if(libraryState&&libraryState.owner!==PersonalFP.owner())throw Object.assign(Error('账号已变化，测试中止'),{name:'AbortError'});
    const conflict = !compatibleFamily(result, format);
    const accepted = !!result && !error && !conflict;
    // Legacy isolated integrations retain their old cache; the full client enrolls only through verified PersonalFP references.
    if(accepted&&!dynamic&&typeof PersonalFP==='undefined')measurements.forEach((m,i)=>saveKnownCalibration(chat,m,promptKey(PROBES[i].prompt)));
    const measurement = {...(measurements[0] || { score: null, source: 'unavailable' })};
    if(dynamic){const scores=measurements.map(m=>m.score).filter(Number.isFinite);if(scores.length)measurement.score=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10;}
    const durations=probeDurations.map((s,i)=>s ?? measurements[i]?.sec).filter(s=>Number.isFinite(s)&&s>0);
    const thinks=thinkTimes.filter(Number.isFinite),thinkSec=thinks.length?Math.round(thinks.reduce((a,b)=>a+b,0)/thinks.length*10)/10:null;
    const avgProbeSec=durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length*10)/10:null;
    const calibration = dynamic ? {tier:null,reference:'动态英文题未进行档位校准'} : ProbeLib.calibrateReasoning(measurement.score, { family: apiIdentity?.model || ProbeLib.baseModelId(result?.nearest?.id), promptKey: promptKey(PROBES[0].prompt), source: measurement.source }, loaded?.personalCalibration?.length?loaded.personalCalibration:calibrationRows().filter(r=>r.key!==sid&&!String(r.key).startsWith(sid+':')));
    const reasoning = { ...measurement, ...calibration, model:apiIdentity?.model||ProbeLib.baseModelId(result?.nearest?.id), tier: apiIdentity || (accepted && result.status === 'clear') ? calibration.tier : null, confidence:loaded?.personalCalibration?.length?PersonalMath.tierConfidence(measurement.score,calibration):null };
    /* 推理分 = 本对话账本的聚合值（不是这一次的原始值）：测指纹 / 校准 / 鹈鹕交错着测也不会来回变；没思考的一次不会把已有的分清掉 */
    reasoning.score = Strength.settle?.(sid, measurement, [before?.fingerprint?.reasoning?.score, before?.est?.score].find(n => Number.isFinite(n) && n >= 0 && n <= 100)) ?? measurement.score;
    const fingerprint = {
      protocol: dynamic ? GachaPrompts.PROTOCOL : ProbeLib.PROBE_PROTOCOL, avgProbeSec, thinkSec, probeDurations:durations, firstPreference, dynamic, count: outputs.length, result, error, probeError, conflict, plan,
      bankVersion: loaded?.version || '', bankSha256: loaded?.sha || '',
      source: loaded?.source || '', fallback: !!loaded?.fallback, format: format ? { fam: format.fam, why: format.why } : null,
      reasoning, measurements, suffix: accepted ? ProbeLib.confidenceSuffix(result, outputs.length) : '',
      personal:!!loaded?.personal,personalError:loaded?.personalError||'',
      warning: '库内相对权重，不是真实身份概率；三条来自同一上下文；推理分不能证明服务端强度配置。',
    };
    const known = Models.get(sid);
    const isOpenThinkEnd = !!(
      (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of?.(chat)?.kind === 'compat-thinking') ||
      (typeof FPLibs !== 'undefined' && FPLibs.thought?.(answerMsgs))
    );
    const isClosedEnd = id => {
      const s = String(id || '').toLowerCase();
      if (/qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|开源|国产|compat/i.test(s)) return false;
      return /gpt-|6-astra|6\.1-sol|6-sol|6-luna|5\.6-|openai|claude|anthropic|opus|sonnet|haiku|fable|gemini|google|barium|argon|grok|x-ai|muse-spark|inkling|solar-pro/i.test(s);
    };
    const fpBlockedEnd = isOpenThinkEnd && isClosedEnd(result?.nearest?.id);
    const name = accepted ? (fpBlockedEnd ? (known?.name && !isClosedEnd(known.name) ? known.name : '开源模型') : result.nearest.id + (result.status === 'clear' ? '' : '?')) : '未知型号';
    const entry = { name, guess: true, fingerprint, tier: null, provider: '数字指纹识别', est: measurement.source === 'estimated' ? measurement : null, partial: false };
    // Retain independently obtained API identity; attach fingerprint diagnostics for comparison.
    // 这次没能确定型号（门控未过 / 与格式冲突 / 没有结果），而这个对话之前已经测出过型号：保留之前的结果，不拿「未知型号」盖掉
    const keepPrev = !accepted && before?.fingerprint?.result?.nearest?.id && before.fingerprint.suffix && !before.fingerprint.skipped && !/^(未知型号|待定)/.test(before.name || '');
    const isApiKnown = known?.name && !known.guess && !known.reverseInferred && !known.billingProbe;
    const fpConfPct = accepted ? ((result?.signals?.relative_probability ?? result?.nearest?.probability ?? 0) * 100) : 0;
    const revConfPct = Number(known?.reverseMatch || 0);
    const revWins = !isApiKnown && (known?.reverseInferred || known?.billingProbe) && known?.name && !(isOpenThinkEnd && isClosedEnd(known.name)) && (revConfPct > fpConfPct || fpBlockedEnd);
    const final = keepPrev ? before : isApiKnown ? { ...known, fingerprint } : revWins ? { ...known, fingerprint } : (known?.reverseInferred || known?.billingProbe ? { ...known, ...entry, pendingConfirm: false } : entry);
    chat.probeNumbers = outputs.map(o => ({ challenge_id: o.challenge_id, expected_count: o.expected_count, numbers: o.text.length <= 50000 ? ProbeLib.numbers(o.text) : [] }));
    if(libraryState)PersonalFP.applyAuthority(libraryState,final);
    Models.set(sid, final); Bus.emit('model', chat, final); chat.emit();
    progress((keepPrev ? '本次未能确定型号，保留之前的识别结果 · ' : '') + describe(final) + libNote(final) + (error ? ' · ' + error : conflict ? (apiIdentity?' · 指纹与格式提示冲突，以接口识别为准':' · 指纹与接口格式冲突，保留未知') : ''));
    if (typeof Titles !== 'undefined') {
      Titles.touch(sid);
      Titles.kick(true);
    }
    return final;
  }
  function report(chat) {
    const entry = Models.get(chat.sid);
    if (!entry?.fingerprint) throw Error('还没有指纹结果');
    return { schema: 'arena-fingerprint-experiment-v1', exportedAt: new Date().toISOString(),
      groundTruth: entry.guess || entry.fingerprint.apiIdentity===null ? null : entry.name, display: describe(entry),
      fingerprint: entry.fingerprint, samples: chat.probeNumbers || [],
      note: '仅数字样本和统计结果，不含Cookie、请求头、账号或会话ID；本机测试记录成功保存后，原始数字可在指纹库查看。' };
  }
  async function exportReport(chat) {
    try { return await FileExport.text(JSON.stringify(report(chat),null,2),'fingerprint-experiment-'+Date.now()+'.json'); }
    catch (e) { toast(e?.message || '导出失败', 'err'); }
  }
  const active = new WeakMap();
  async function startCurrent(chat) {
    if (active.has(chat)) { if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.owns(chat.sid))FingerprintBatch.stop();else active.get(chat).abort(); return; }
    if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.owns(chat.sid)){toast('这个对话正在批量测指纹','err');return;}
    if (chat.busy || chat.gacha || chat.queue?.length) { toast('请等待当前回复或抽卡结束', 'err'); return; }
    if (typeof PelicanTest !== 'undefined' && PelicanTest.isRunning(chat)) { toast('鹈鹕测试进行中', 'err'); return; }
    // 点一下直接开测：每条对话独立运行（只锁这一条），不再走全局的批量测试，所以不影响新建对话 / 其他对话 / 其他对话的测试
    if (typeof PersonalFP !== 'undefined') {
      try {
        chat.probeProgress = '测指纹：准备中…'; chat.emit();
        const entry = await testConversation(chat, { progress: text => { chat.probeProgress = text; chat.emit(); } });
        toast(describe(entry) + libNote(entry));
      } catch (e) { toast(e?.name === 'AbortError' ? '指纹测试已停止' : (e?.message || '探测失败'), e?.name === 'AbortError' ? undefined : 'err'); }
      return;
    }
    // 没有个人指纹库的精简环境：直接在当前对话里测
    const ctl = new AbortController();
    active.set(chat, ctl); chat.emit();
    try {
      await abortable(chat.send(PROBES[0].prompt,{fingerprint:true}), ctl.signal);
      const entry = await run(chat, { signal: ctl.signal, libraryState: null, progress: text => { chat.probeProgress = text; chat.emit(); } });
      toast(describe(entry) + libNote(entry));
    } catch (e) { toast(e?.message || '探测失败', e?.name === 'AbortError' ? undefined : 'err'); }
    finally { active.delete(chat); chat.probeProgress = ''; chat.emit(); }
  }
  async function testConversation(chat,{signal,progress=()=>{}}={}) {
    if(active.has(chat)||sessions.has(chat)||chat.busy||chat.queue?.length||chat.gacha)throw Error('对话正在运行或队列未清空');
    const ctl=new AbortController(),cancel=()=>ctl.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    active.set(chat,ctl);chat.fpLocked=true;
    try{const libraryState=await PersonalFP.begin(chat);check(ctl.signal);await abortable(chat.send(PROBES[0].prompt,{fingerprint:true}),ctl.signal);return await run(chat,{signal:ctl.signal,progress,libraryState});}
    catch(e){if(e.code==='COMPAT_STOP_FAILED')e.fatal=true;if(chat.busy)try{await chat.stop({strict:true});}catch(stop){throw Object.assign(Error('停止未确认，批量测试已暂停：'+(stop.message||'')),{fatal:true});}throw e;}
    finally{active.delete(chat);chat.fpLocked=false;if(typeof Titles!=='undefined'&&chat.sid&&Titles.prio.has(chat.sid))Titles.kick(true);signal?.removeEventListener('abort',cancel);chat.probeProgress='';chat.emit();}
  }
  return { libNote, testConversation, command, maybeGuardProbe, maybeStopCompat, isClosedSourceStream, finishCompatSkip, waitCompatDecision, report, exportReport, startCurrent, isRunning: chat => active.has(chat), PROBES, promptKey, loadBank, run, textOf, extractAnswer, currentAnswer, reasonScore, compatibleFamily, classify, describe, details };
})();
