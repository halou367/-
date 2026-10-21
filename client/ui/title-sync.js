// Cloud titles contain authenticated ciphertext only. Decoded metadata is presentation, not API identity.
const TitleSync = (() => {
  const cache = new Map(), texts = new Map(), failures = new Map(), conflicts = new Map();
  let timer = 0, hydrating = false, hydration = null, lastError = '', confirmed = 0;
  const numeric = value => Number.isFinite(value) && value >= 0 ? value : null;
  function validate(value) {
    if (!Array.isArray(value) || value.length !== 10 || ![1,2].includes(value[0])) throw Error('名称信息版本或结构不兼容');
    const [,model,confidence,score,average,time,note,tier,source,revision] = value;
    if (typeof model !== 'string' || model.length > 160 || typeof note !== 'string' || note.length > 200 || typeof tier !== 'string' || tier.length > 30 || !['fingerprint','api','local'].includes(source) || !Number.isFinite(time) || time < 0 || !Number.isFinite(revision) || revision < 0 || [confidence,score,average].some(n => n !== null && (!Number.isFinite(n) || n < 0)) || (confidence !== null && confidence > 1)) throw Error('名称信息字段不合法，未采用');
    return {version:value[0],model,confidence,score,average,time,note,tier,source,revision,fav:!!value.fav,v4:!!value.v4};
  }
  const pack = m => [2,m.model,m.confidence,m.score,m.average,m.time,'',m.tier,m.source,m.revision];
  // Same normalisation as the v3 wire format, so an uploaded title never looks permanently "dirty".
  // v4 (Qx) also carries note + favourite; v3 signatures stay unchanged so existing titles are not re-uploaded.
  const extSig = m => m?.v4 ? JSON.stringify([String(m.note||''),!!m.fav]) : '';
  const baseSig = m => signature({...m,v4:false});
  const signature = m => { let base; try { const c=TitleCompact.canonical3(pack(m)); c[9]=0; base=JSON.stringify(c); } catch { base=signature2(m); } const x=extSig(m); return x ? base+'|'+x : base; };
  const signature2 = m => JSON.stringify(pack({...m,model:String(m.model).trim().toLowerCase(),
    confidence:m.confidence==null?null:Number((m.confidence*100).toFixed(1))/100,
    score:m.score==null?null:Number(m.score.toFixed(1)),average:m.average==null?null:Number(m.average.toFixed(1)),
    tier:TitleCompact.tiers.includes(String(m.tier||'').toLowerCase())?String(m.tier||'').toLowerCase():'',revision:0}));
  const modelLabel = m => m ? ConversationLabels.unified(m) : '';
  const modelStamp = mi => JSON.stringify([mi?.name,mi?.at,mi?.guess,mi?.pendingConfirm,mi?.routed,mi?.userCorrected,mi?.reverseInferred,mi?.habitInferred,mi?.billingProbe,mi?.reverseMatch,mi?.confidence,mi?.revPct,mi?.match,mi?.reverseScore,mi?.habitScore,mi?.reverseEffort,mi?.reverseVer,mi?.tier,mi?.est?.score,mi?.fingerprint?.skipped,mi?.fingerprint?.stopConfirmed,mi?.fingerprint?.result?.nearest?.id,mi?.fingerprint?.result?.signals?.relative_probability,mi?.fingerprint?.reasoning?.score,mi?.fingerprint?.avgProbeSec]);
  const hasReidentifiedModel = mi => Boolean(mi && mi.name && !mi.pendingConfirm && !/^(未识别|未知型号|待定)$/.test(String(mi.name).trim()) && (mi.userCorrected || mi.reverseInferred || mi.habitInferred || mi.billingProbe));
  const canonLower = s => String(typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(s) : (s || '')).replace(/[?？]+$/, '').trim().toLowerCase();
  const label = m => modelLabel(m) + '/' + noteFmt(m.time) + (m.note ? '/' + m.note : '');
  function restored(sid) {
    const mi = typeof Models !== 'undefined' ? Models.get(sid) : null;
    const reid = hasReidentifiedModel(mi);
    const x = cache.get(sid);
    if (x?.generation === TitleCipher.generation) {
      if (reid && x.meta && canonLower(x.meta.model) !== canonLower(mi.name)) {
        const reidSc = ConversationLabels.sane(numeric(mi.reverseScore ?? mi.habitScore ?? mi.est?.score));
        return { ...x.meta, model: (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(mi.name) : mi.name), confidence: null, score: reidSc ?? x.meta.score ?? null };
      }
      return x.meta;
    }
    if (typeof TitleCipher !== 'undefined' && typeof TitleCipher.decodeGoldPrefix === 'function') {
      const e = typeof History !== 'undefined' ? History.byId?.(sid) : null;
      const rawTitle = e?.title || (typeof Notes !== 'undefined' ? Notes.all?.[sid]?.c : '') || '';
      const gp = rawTitle ? TitleCipher.decodeGoldPrefix(rawTitle) : null;
      if (gp) {
        if (gp.fav && typeof Fav !== 'undefined' && !Fav.has(sid) && !(Fav.unfavAt && Fav.unfavAt[sid])) Fav.setQuiet(sid, true);
        if (gp.gold && typeof Gold !== 'undefined' && Gold.noteRestoredChat) Gold.noteRestoredChat(sid, gp);
        if (gp.model) {
          const effModel = reid ? (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(mi.name) : mi.name) : gp.model;
          const effScore = (reid && canonLower(gp.model) !== canonLower(mi.name))
            ? (ConversationLabels.sane(numeric(mi.reverseScore ?? mi.habitScore ?? mi.est?.score)) ?? null)
            : (gp.score ?? null);
          return { version: 2, model: effModel, confidence: null, score: effScore, average: null, time: Number(Notes.all?.[sid]?.t) || now(), note: String(Notes.all?.[sid]?.n || ''), tier: '', source: 'fingerprint', revision: 0, fav: !!gp.fav, gold: !!gp.gold, v4: false, fromPrefix: true };
        }
      }
    }
    return null;
  }
  function selectiveEnabled() {
    return typeof Fav !== 'undefined' || typeof Gold !== 'undefined';
  }
  function shouldGoldPrefix(sid) {
    if (!sid || !selectiveEnabled() || typeof TitleCipher === 'undefined' || typeof TitleCipher.encodeGoldPrefix !== 'function') return false;
    const e = typeof History !== 'undefined' ? History.byId?.(sid) : null;
    if (!e || e._local || e._pending) return false;
    if (TitleCipher.isEncoded(e.title)) return false;
    const wantFav = typeof Fav !== 'undefined' && Fav.has(sid);
    const wantGold = wantFav || (typeof Gold !== 'undefined' && typeof Gold.isChatGold === 'function' && Gold.isChatGold(sid, e.title));
    const gp = TitleCipher.decodeGoldPrefix(e.title);
    if (wantFav || wantGold) {
      const m = build0(sid);
      let model = m && m.model && m.model !== '未识别' ? String(m.model).toLowerCase() : (gp?.model || '');
      const score = m?.score ?? gp?.score ?? null;
      const scNorm = score != null && Number.isFinite(score) ? Math.round(score * 10) / 10 : null;
      const gpScNorm = gp?.score != null && Number.isFinite(gp.score) ? Math.round(gp.score * 10) / 10 : null;
      if (gp && gp.fav === wantFav && gp.gold === wantGold && (gp.model || '') === (model || '') && gpScNorm === scNorm) return false;
      return true;
    }
    return !!gp;
  }
  function goldPrefixSignature(sid, meta) {
    const e = typeof History !== 'undefined' ? History.byId?.(sid) : null;
    const raw = String(e?.title || '');
    const gp = typeof TitleCipher !== 'undefined' && TitleCipher.decodeGoldPrefix ? TitleCipher.decodeGoldPrefix(raw) : null;
    const clean = (typeof TitleCipher !== 'undefined' && TitleCipher.stripGoldPrefix ? TitleCipher.stripGoldPrefix(raw) : raw).trim() || '新对话';
    const wantFav = typeof Fav !== 'undefined' && Fav.has(sid);
    const wantGold = wantFav || (typeof Gold !== 'undefined' && typeof Gold.isChatGold === 'function' && Gold.isChatGold(sid, raw));
    if (!wantFav && !wantGold) return 'gp-strip:' + clean;
    const m = meta || build(sid);
    const model = (m?.model && m.model !== '未识别') ? String(m.model).toLowerCase() : (gp?.model || '');
    const score = m?.score ?? gp?.score ?? null;
    const scNorm = score != null && Number.isFinite(score) ? Math.round(score * 10) / 10 : '';
    return 'gp:' + Number(wantFav) + ':' + Number(wantGold) + ':' + model + ':' + scNorm + ':' + clean;
  }
  // 备注 / 收藏：有任一项，或云端已经是 v4，就写 v4（这样「清空备注 / 取消收藏」也能同步出去）
  function build(sid) {
    const m=build0(sid);if(!m)return m;
    const note=String(Notes.all[sid]?.n||''),fav=typeof Fav!=='undefined'&&Fav.has(sid),prior=restored(sid);
    return {...m,note,fav,v4:!!(note||fav||prior?.v4)};
  }
  function build0(sid) {
    const mi = Models.get(sid), prior = restored(sid);
    const hasReidMi = hasReidentifiedModel(mi);
    if (hasReidMi && (mi.pendingConfirm || mi.guess)) {
      mi.pendingConfirm = false;
      mi.guess = false;
    }
    const n = Notes.all[sid] || (mi && !mi.pendingConfirm && (!mi.guess || hasReidMi) && mi.name ? Notes.rec(sid) : null);
    if (!n) return null;
    if(n.modelData && n.modelData.model && !/^(未识别|未知型号|待定)$/.test(String(n.modelData.model).trim()) && n.modelStamp===modelStamp(mi) && (!hasReidMi || canonLower(n.modelData.model)===canonLower(mi.name)))return {...n.modelData,time:Number(n.t)||n.modelData.time,note:String(n.n||''),revision:Number(n.modifiedAt)||n.modelData.revision};
    const entry=History.byId(sid), raw=entry?.localTitle || (!TitleCipher.isEncoded(entry?.title) ? entry?.title : '') || '';
    const fp = mi?.fingerprint, parsed = ConversationLabels.parse(noteBase(raw));
    const measured=fp?ConversationLabels.fingerprintData(mi):null;
    // Format-based vendor guesses ("xxx（推测）") or pendingConfirm are never synced or shown as a model name.
    const apiName=mi&&(!mi.guess||hasReidMi)&&!mi.pendingConfirm?(typeof Strength!=='undefined'&&Strength.canon?Strength.canon(mi.name):mi.name):'';
    const preferredModel=hasReidMi?(apiName||measured?.model):(measured?.model||apiName);
    let model=mi?.pendingConfirm?'未识别':(String(preferredModel || prior?.model || (/推测/.test(parsed.name||'')?'':parsed.name) || '未识别').replace(/[（(]推测[）)]/g,'').trim()||'未识别');
    if(/^未知型号\??$/.test(model))model='未识别';   // 中文占位名没法编码进标题，统一成「未识别」
    if(fp?.skipped && !hasReidMi)return {...measured,time:Number(n.t)||now(),note:String(n.n||''),tier:'',source:'fingerprint',revision:Number(n.modifiedAt)||now()};
    const samePrior=canonLower(prior?.model)===canonLower(model), sameParsed=canonLower(parsed.name)===canonLower(model);
    const rawConfidence = (hasReidMi && (!fp?.result?.nearest?.id || canonLower(fp.result.nearest.id)!==canonLower(model))) ? null : measured?.confidence;
    const confidence = fp ? numeric(rawConfidence) : ((samePrior && !hasReidMi ? prior?.confidence : null) ?? (sameParsed && !hasReidMi && parsed.confidence != null ? +parsed.confidence / 100 : null));
    const sane = n => ConversationLabels.sane(numeric(n));
    const score = (mi?.routed ? sane(mi?.reverseScore) : null) ?? (hasReidMi ? sane(mi?.reverseScore ?? mi?.habitScore) : null) ?? sane(fp?.reasoning?.score) ?? sane(mi?.reverseScore ?? mi?.habitScore) ?? sane(mi?.est?.score) ?? (samePrior?sane(prior?.score):null) ?? (sameParsed?sane(parsed.score):null);
    const average = numeric(fp?.avgProbeSec) ?? (samePrior?prior?.average:null) ?? (sameParsed?numeric(parsed.average):null);
    return {model,confidence:confidence !== null ? Math.min(1,confidence) : null,score,average,
      time:Number(n.t)||prior?.time||now(),note:String(n.n||''),tier:String((mi?.routed && mi?.reverseEffort) || mi?.tier || fp?.reasoning?.tier || (samePrior?prior?.tier:'') || ''),source:fp&&!hasReidMi?'fingerprint':mi&&(!mi.guess||hasReidMi)?'api':(samePrior?prior?.source:'')||'local',revision:Number(n.modifiedAt)||now()};
  }
  function displayText(text) {
    const s = String(text || '');
    if (typeof TitleCipher !== 'undefined' && TitleCipher.isGoldPrefixed?.(s)) return TitleCipher.stripGoldPrefix(s);
    return texts.get(s) || '';
  }
  function canWrite(sid) {
    if (!TitleCipher.unlocked || hydrating || conflicts.has(sid)) return false;
    const title = History.byId(sid)?.title || '';
    return !TitleCipher.isEncoded(title) || (cache.get(sid)?.title === title && cache.get(sid)?.generation === TitleCipher.generation);
  }
  function apply(sid, title, meta) {
    const n = Notes.all[sid] || {};
    if(meta.version===1&&meta.note)n.legacyNote=meta.note;
    // v4：云端的备注 / 收藏是权威值；v3 及更早没有这两项，保留本机的
    const note=meta.v4?meta.note:Object.prototype.hasOwnProperty.call(n,'n')?n.n:(meta.version===1?meta.note:'');
    if(meta.v4&&typeof Fav!=='undefined')Fav.setQuiet(sid,meta.fav);
    const mi = typeof Models !== 'undefined' ? Models.get(sid) : null;
    const reid = hasReidentifiedModel(mi);
    Object.assign(n,{n:note,t:meta.time,c:title,syncedData:signature(meta),modifiedAt:meta.revision,dirty:false,f:0,nx:0});
    if (reid && canonLower(meta.model) !== canonLower(mi.name)) {
      const reidMeta = {
        ...meta,
        model: typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(mi.name) : mi.name,
        confidence: null,
        score: ConversationLabels.sane(numeric(mi.reverseScore ?? mi.habitScore ?? mi.est?.score)) ?? null,
        note: n.n,
      };
      n.modelData = reidMeta;
      n.modelStamp = modelStamp(mi);
      delete n.e; Notes.all[sid] = n;
      const entry = History.byId(sid); if (entry) entry.localTitle = label(reidMeta);
      return;
    }
    n.modelData={...meta,note:n.n};n.modelStamp=modelStamp(mi);
    delete n.e; Notes.all[sid]=n;
    const entry=History.byId(sid); if(entry)entry.localTitle=label({...meta,note:n.n});
  }
  function ingestPrefixes(entries = History.items) {
    if (typeof TitleCipher === 'undefined' || typeof TitleCipher.decodeGoldPrefix !== 'function') return false;
    let changed = false;
    for (const e of entries || []) {
      if (!e?.id || !e?.title) continue;
      const gp = TitleCipher.decodeGoldPrefix(e.title);
      if (!gp) continue;
      if (gp.fav && typeof Fav !== 'undefined' && !Fav.has(e.id) && !(Fav.unfavAt && Fav.unfavAt[e.id])) {
        Fav.setQuiet(e.id, true);
        changed = true;
      }
      if (gp.gold && typeof Gold !== 'undefined' && Gold.noteRestoredChat && !(Gold.unmarkAt && Gold.unmarkAt[e.id])) {
        const had = Gold.restoredChats?.has?.(e.id);
        Gold.noteRestoredChat(e.id, gp);
        if (!had) changed = true;
      }
      if (gp.model && !/^(未识别|未知型号|待定)$/.test(String(gp.model).trim()) && typeof Models !== 'undefined') {
        const cur = Models.get(e.id);
        if (!cur || cur.pendingConfirm || !cur.name || /^(未识别|未知型号|待定)$/.test(String(cur.name).trim())) {
          const canon = (typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(gp.model) : gp.model;
          Models.set(e.id, {
            ...(cur || {}),
            name: canon,
            reverseScore: cur?.reverseScore ?? gp.score ?? undefined,
            habitScore: cur?.habitScore ?? gp.score ?? undefined,
            est: cur?.est || (gp.score != null ? { score: gp.score, source: 'prefix' } : undefined),
            fromTitle: !cur?.habitInferred && !cur?.reverseInferred && !cur?.billingProbe && !cur?.userCorrected,
            sure: true,
            guess: false,
            pendingConfirm: false,
          });
          changed = true;
        }
      }
    }
    return changed;
  }
  async function ingest(entries = History.items) {
    const pfxChanged = ingestPrefixes(entries);
    if (!TitleCipher.unlocked) {
      if (pfxChanged) { UI.renderListSoon?.(); UI.renderTabs?.(); }
      return;
    }
    if (hydrating) { await hydration; return ingest(entries); }
    let finish; hydration = new Promise(resolve => { finish=resolve; });
    hydrating = true; const generation=TitleCipher.generation;
    try {
      for (const e of entries) {
        if (generation!==TitleCipher.generation) return;
        const title=e.title;
        if (!TitleCipher.isEncoded(title)) continue;
        const old=cache.get(e.id);
        if (old?.title===title && old.generation===generation) {
          if(!Notes.all[e.id]?.dirty) {
            const mi = typeof Models !== 'undefined' ? Models.get(e.id) : null;
            const reid = hasReidentifiedModel(mi);
            const effMeta = (reid && canonLower(old.meta?.model) !== canonLower(mi.name))
              ? { ...old.meta, model: typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(mi.name) : mi.name, confidence: null, score: ConversationLabels.sane(numeric(mi.reverseScore ?? mi.habitScore ?? mi.est?.score)) ?? null }
              : old.meta;
            e.localTitle=label({...effMeta,note:Notes.all[e.id]?.n??(old.meta.version===1?old.meta.note:'')});
          }
          continue;
        }
        if(failures.get(e.id)?.title===title && failures.get(e.id)?.generation===generation)continue;
        try {
          const meta=validate(await TitleCipher.decrypt(e.id,title));
          if(generation!==TitleCipher.generation)return;
          if(e.title!==title || (History.byId(e.id) && History.byId(e.id).title!==title)){queue();continue;}
          cache.set(e.id,{title:title,meta,generation});texts.set(title,label(meta));failures.delete(e.id);
          const n=Notes.all[e.id];
          // 本机记录是解码之前建的空壳（模型事件 / 发送消息先到、云端标题还没解出来）：从没见过云端、备注 / 收藏都是空的，
          // 空值不是「清空备注」的编辑，不能和云端的备注 / 收藏冲突、更不能把它们传成空——先采用云端的这两项
          if(n&&meta.v4&&!n.syncedData&&!String(n.n||'')&&(meta.note||meta.fav)){
            if(meta.note)n.n=meta.note;
            if(meta.time)n.t=meta.time;
            if(meta.fav&&typeof Fav!=='undefined'&&!Fav.has(e.id))Fav.setQuiet(e.id,true);
          }
          const local=n?build(e.id):null;
          // v3 及更早的云端标题不含备注 / 收藏：只比较型号数据，本机未上传的备注不算冲突（随后以 v4 上传）
          const differs=local&&(meta.v4?signature(local)!==signature(meta):baseSig(local)!==baseSig(meta));
          // 本机从未见过云端标题、只在本机写了备注 / 收藏：采用云端型号数据，保留本机备注并继续上传（不是冲突）
          if(n?.dirty && local && !meta.v4 && !n.c && !n.syncedData && signature(local)!==signature(meta)){apply(e.id,title,meta);dirty(e.id);continue;}
          if(n?.dirty && differs && n.c!==title){conflicts.set(e.id,{title:title,meta});continue;}
          if(!n?.dirty || (local&&signature(local)===signature(meta)))apply(e.id,title,meta);
        } catch(error){if(generation!==TitleCipher.generation)return;failures.set(e.id,{title:title,generation,error:describe(error)});}
      }
      Notes.save(); UI.renderListSoon?.(); UI.renderTabs?.();
    } finally { hydrating=false; finish(); }
  }
  function queue() { clearTimeout(timer);timer=setTimeout(()=>void ingest(),100); }
  function dirty(sid) { const n=Notes.all[sid];if(n){n.dirty=true;n.modifiedAt=now();delete n.e;if(n.lastStatus!==429)n.nx=0;} }   // never reset a 429 cooldown
  async function wireTitle(sid, opt = {}) {
    if (opt?.prefixMode) {
      const e = History.byId(sid), raw = String(e?.title || Chats.get(sid)?.title || '');
      const gp = TitleCipher.decodeGoldPrefix(raw);
      const clean = TitleCipher.stripGoldPrefix(raw).trim() || '新对话';
      const wantFav = typeof Fav !== 'undefined' && Fav.has(sid);
      const wantGold = wantFav || (typeof Gold !== 'undefined' && typeof Gold.isChatGold === 'function' && Gold.isChatGold(sid, raw));
      const local = build(sid) || { version: 2, model: gp?.model || '未识别', confidence: null, score: gp?.score ?? null, average: null, time: now(), note: Notes.get(sid) || '', tier: '', source: 'local', revision: now(), fav: wantFav, v4: false };
      const sig = goldPrefixSignature(sid, local);
      if (!wantFav && !wantGold) {
        return { title: clean, meta: local, signature: sig, generation: TitleCipher.generation, modelStamp: modelStamp(Models.get(sid)), prefixMode: true };
      }
      const model = (local.model && local.model !== '未识别') ? local.model : (gp?.model || '');
      const score = local.score ?? gp?.score ?? null;
      const title = TitleCipher.encodeGoldPrefix(sid, { fav: wantFav, gold: wantGold, model, score }, clean);
      return { title, meta: local, signature: sig, generation: TitleCipher.generation, modelStamp: modelStamp(Models.get(sid)), prefixMode: true };
    }
    if(!canWrite(sid))throw Error('名称同步未解锁、云端口令不匹配或存在冲突；未发送明文');
    const old=restored(sid);
    if(old?.version===1&&old.note&&Notes.save()===false)throw Error('旧版云端备注尚未写入本机，已暂停迁移，保留原密文');
    const local=build(sid);if(!local)throw Error('没有可同步的对话信息');
    validate(pack(local));
    if(local.v4&&!TitleCompact.noteFits(local.note))throw Error('备注超过同步上限（最多 '+TitleCompact.NOTE_CHARS+' 个汉字），请缩短备注');
    const meta={...validate(TitleCompact.canonical3(pack(local))),note:local.v4?local.note:'',fav:!!local.fav,v4:!!local.v4};
    const title=await TitleCipher.encrypt(sid,pack(meta),local.v4?{note:local.note,fav:!!local.fav,v4:true}:null);
    return {title,meta,signature:signature(meta),generation:TitleCipher.generation,modelStamp:modelStamp(Models.get(sid))};
  }
  function remember(sid, packet) {
    if (packet.prefixMode) {
      const n = Notes.all[sid];
      if (n) {
        n.c = packet.title;
        n.syncedData = packet.signature;
        n.f = 0; n.nx = 0; delete n.e;
        if (goldPrefixSignature(sid, build(sid)) === packet.signature) {
          n.dirty = false;
          n.modelData = { ...packet.meta, note: n.n };
          n.modelStamp = packet.modelStamp ?? modelStamp(Models.get(sid));
        }
      }
      const e = History.byId(sid);
      if (e) e.localTitle = Titles.want(sid) || TitleCipher.stripGoldPrefix(packet.title);
      lastError = ''; confirmed++;
      return;
    }
    if(packet.generation!==TitleCipher.generation)return;
    cache.set(sid,{title:packet.title,meta:packet.meta,generation:packet.generation});texts.set(packet.title,label(packet.meta));failures.delete(sid);
    const n=Notes.all[sid];if(n){n.c=packet.title;n.syncedData=packet.signature;n.f=0;n.nx=0;delete n.e;
      // An edit may occur while encryption / PATCH is in flight. Do not clear that edit.
      if(signature(build(sid))===packet.signature){n.dirty=false;n.modelData={...packet.meta,note:n.n};n.modelStamp=packet.modelStamp??modelStamp(Models.get(sid));}
    }
    const e=History.byId(sid);if(e)e.localTitle=Titles.want(sid)||label(packet.meta);
    lastError='';confirmed++;
  }
  function lock() {TitleCipher.lock();cache.clear();texts.clear();failures.clear();conflicts.clear();lastError='';}
  function resolve(sid,useCloud) {
    const conflict=conflicts.get(sid);if(!conflict)return;
    if(useCloud)apply(sid,conflict.title,conflict.meta);
    else {const n=Notes.rec(sid);n.c=conflict.title;dirty(sid);}
    conflicts.delete(sid);Notes.save();Titles.local(sid);Titles.kick();
  }
  async function unlock(phrase, {automatic=false} = {}) {
    TitleCipher.unlock(phrase);const generation=TitleCipher.generation;cache.clear();texts.clear();failures.clear();conflicts.clear();lastError='';
    await ingest();
    if(generation!==TitleCipher.generation)throw Error('口令已改变，本次解锁取消');
    if(!automatic && failures.size && !cache.size){const error='已有云端加密标题均无法解锁，请核对口令；没有覆盖任何云端数据';lock();throw Error(error);}
    Titles.kick();return {decoded:cache.size,failed:failures.size,conflicts:conflicts.size};
  }
  function recoverLocal() {
    for(const [sid,mi] of Object.entries(Models.all||{})) {
      const e=History.byId(sid),n=Notes.all[sid];
      if(!e || !mi?.fingerprint || (mi.fingerprint.error&&!mi.fingerprint.skipped) || TitleCipher.isEncoded(e.title) || n?.syncedData || n?.dirty)continue;
      Titles.capture(sid);
    }
  }
  function upgradePending(){
    for(const n of Object.values(Notes.all))if(n.dirty&&n.compactVersion!==2){
      n.compactVersion=2;
      // Retry the old 400/100-character failures, but never clear rate-limit cooldowns.
      if(n.lastStatus===400){delete n.e;n.nx=0;n.f=0;n.lastStatus=0;}
    }
    Notes.save();
  }
  async function start() {upgradePending();const result=await unlock(TitleCipher.DEFAULT_PASSPHRASE,{automatic:true});recoverLocal();return result;}
  const pending = () => Object.entries(Notes.all).filter(([id, n]) => n?.dirty && (!History.full || !History.items?.length || History.byId(id))).length;
  async function syncNow() {
    if(typeof SessionGate!=='undefined'&&(!UI.authed||!UI.me))throw Error('请先完成登录核对，再同步名称');
    if(!TitleCipher.unlocked)throw Error('请先解锁名称同步口令');
    await ingest();
    for(const n of Object.values(Notes.all))if(n.dirty&&n.lastStatus!==429){delete n.e;n.nx=0;}
    await Titles.tick(true);return status();
  }
  const status = () => (lastError || (!TitleCipher.unlocked ? '已锁定：本地信息保留，暂不上传' : `已解锁 · ${cache.size} 条已解码${failures.size?' · '+failures.size+' 条需原口令/检查密文':''}${conflicts.size?' · '+conflicts.size+' 条冲突待处理':''}`))+' · '+pending()+' 条待同步'+(confirmed?' · '+confirmed+' 条上传已回读确认':'');
  function open() {
    return Dialog.open((box,done)=>{
      const info=h('div',{class:'dlg-h',role:'status'},status()), conflictBox=h('div',{});
      const renderConflicts=()=>{conflictBox.replaceChildren();for(const [sid,c] of conflicts){conflictBox.append(h('div',{class:'dlg-row',style:'flex-wrap:wrap'},h('span',{},c.meta.model+' · '+sid.slice(0,8)),h('button',{class:'btn ghost sm',onclick:()=>{resolve(sid,true);renderConflicts();info.textContent=status();}},'使用云端'),h('button',{class:'btn ghost sm',onclick:()=>{resolve(sid,false);renderConflicts();info.textContent=status();}},'保留本地并同步')));}};
      const pass=h('input',{class:'dlg-in',type:'password',autocomplete:'off',value:TitleCipher.DEFAULT_PASSPHRASE,placeholder:'解锁口令（7–512 个字符）',maxlength:512});
      const submit=h('button',{class:'btn',onclick:async()=>{
        submit.disabled=true;
        try{const result=await unlock(pass.value);pass.value='';info.textContent=status();renderConflicts();toast('已恢复 '+result.decoded+' 条名称；新识别结果进入加密同步队列');}
        catch(error){info.textContent=describe(error);}finally{submit.disabled=false;}
      }},'解锁并恢复');
      const sync=h('button',{class:'btn ghost',onclick:async()=>{sync.disabled=true;try{info.textContent=await syncNow();renderConflicts();}catch(e){info.textContent=describe(e);}finally{sync.disabled=false;}}},'立即同步 / 重试');
      box.append(h('div',{class:'dlg-t'},'名称加密同步'),h('div',{class:'dlg-h'},'新标题固定 100 字符：口令加密后编码为 14 组六字母；内置型号编号；未收录的型号直接加密原名（最多 27 个字符），不归到其他型号；无外部存储。同步型号、匹配权重、分数、平均耗时和毫秒时间，数值按界面一位小数；备注只留本机。每次启动默认口令 755287249（公开值，不保证私密）；自定义口令仅本次有效。旧密文仍可用原口令解码，旧备注先保存在本机；新格式不上传备注。两端均需新版。'),info,pass);
      box.append(conflictBox);renderConflicts();
      box.append(h('div',{class:'dlg-row',style:'flex-wrap:wrap'},h('button',{class:'btn ghost',onclick:()=>{pass.value=TitleCipher.DEFAULT_PASSPHRASE;}},'填入默认口令'),h('button',{class:'btn ghost',onclick:()=>{lock();renderConflicts();info.textContent=status();}},'锁定'),sync,h('button',{class:'btn ghost',onclick:()=>done()},'关闭'),submit));
    });
  }
  function row(cls='set') {return h('div',{class:cls},h('span',{},h('b',{},'名称同步口令'),h('small',{},'固定 100 字符 · 备注 / 收藏加密同步 · '+status())),h('button',{class:'btn ghost sm',onclick:()=>open()},'设置 / 解锁'));}
  // 一次性：把以前只存在本机的备注 / 收藏排进加密同步队列（之后随 Qx 标题跨端同步）
  function migrateExt(){
    if(Store.get('notesync4',0)||!History.items.length||!TitleCipher.unlocked)return;
    Store.set('notesync4',now());
    for(const [sid,n] of Object.entries(Notes.all))if(n?.n&&History.byId(sid))dirty(sid);
    if(typeof Fav!=='undefined')for(const sid of Object.keys(Fav.all))if(History.byId(sid)){Notes.rec(sid);dirty(sid);}
    Notes.save();Titles.kick();
  }
  Bus.on('history',()=>{queue();recoverLocal();migrateExt();});
  return {start,syncNow,recoverLocal,pending,build,modelLabel,label,signature,goldPrefixSignature,selectiveEnabled,shouldGoldPrefix,pack,validate,restored,displayText,canWrite,ingest,queue,dirty,wireTitle,remember,unlock,lock,open,row,status,resolve,get busy(){return hydrating;},get conflicts(){return conflicts.size;},error(message){lastError=String(message||'');}};
})();
