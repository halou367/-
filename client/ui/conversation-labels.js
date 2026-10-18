// Presentation only. Parsed historical labels never become authoritative model identity.
const ConversationLabels = (() => {
  const num = '(\\d+(?:\\.\\d+)?)';
  // 推理分是 0–100 的饱和分；超出范围的一定是旧版的强度分 / 旧公式遗留值（如 6878），不能再当推理分用
  const sane = n => Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  function parse(value) {
    const r = parse0(value); if (r && r.score != null) r.score = sane(r.score); return r;
  }
  function parse0(value) {
    let text = String(value || '').trim();
    const duration=/-(\d+(?:\.\d+)?)s$/.exec(text);
    if(duration){text=text.slice(0,duration.index);return {...parse0(text),average:+duration[1]};}
    const measuredTier=/^(.+?)\((\d+(?:\.\d+)?)%\) (none|minimal|low|medium|high|xhigh|max)≈(?:\((\d+(?:\.\d+)?)%\))?(?:-(\d+(?:\.\d+)?)分)?$/.exec(text);
    if(measuredTier)return {name:measuredTier[1],confidence:measuredTier[2],tier:measuredTier[3],tierConfidence:measuredTier[4]||null,score:measuredTier[5]?+measuredTier[5]:null,historical:true};
    const old = /\s*·\s*(?=匹配置信度|估算推理分|推理分|强度未校准)/.exec(text);
    if (old) {
      const tail = text.slice(old.index), conf = /匹配置信度\s*(\d+(?:\.\d+)?)%/.exec(tail), score = /(?:估算)?推理分\s*(\d+(?:\.\d+)?)/.exec(tail);
      return { name: text.slice(0,old.index).trim(), confidence: conf?.[1] ?? null, score: score ? +score[1] : null, historical: true };
    }
    const m = new RegExp('^(.+?)(?:\\('+num+'%\\))?(?:-'+num+'分)?$').exec(text);
    return { name: m?.[1] || text, confidence: m?.[2] ?? null, score: m?.[3] != null ? +m[3] : null, historical: !!(m?.[2] || m?.[3]) };
  }
  const format = p => p.name + (p.confidence != null ? '('+p.confidence+'%)' : '') +(p.tier?' '+p.tier+'≈'+(p.tierConfidence?'('+p.tierConfidence+'%)':''):'') + (Number.isFinite(p.score) ? '-'+p.score+'分' : '');
  const finite = n => Number.isFinite(n) && n >= 0 ? n : null;
  function fingerprintData(entry) {
    const fp=entry?.fingerprint, name=/^未知型号\??$/.test(String(entry?.name||''))?'未识别':String(entry?.name||'未识别');
    if(!fp)return {model:name,confidence:null,score:null,average:null};
    if(fp.skipped){
      const reason=['compat-thinking','visible-thinking'].includes(fp.skipped)?'因思考跳过':(typeof ProbeOutputGuard!=='undefined'?ProbeOutputGuard.LABELS[fp.skipped]:'')||'输出异常';
      return {model:name+' · '+reason+(fp.stopConfirmed===false?'（停止未确认）':''),confidence:null,score:null,average:null};
    }
    let confidence=finite(fp.result?.signals?.relative_probability);
    if(confidence===null){const m=/匹配置信度\s*(\d+(?:\.\d+)?)%/.exec(fp.suffix||'');if(m)confidence=+m[1]/100;}
    const canon=x=>String(typeof Strength!=='undefined'?Strength.canon(x):x).toLowerCase().replace(/\?$/,'');
    // A candidate's probability is not the confidence of a DIFFERENT API model.
    if(fp.apiIdentity && fp.result?.nearest?.id && canon(name)!==canon(fp.result.nearest.id))confidence=null;
    const sc = (entry?.routed && sane(entry?.reverseScore) != null) ? sane(entry.reverseScore) : (sane(fp.reasoning?.score) ?? sane(entry?.reverseScore));
    return {model:name,confidence:confidence===null?null:Math.min(1,confidence),score:sc,average:finite(fp.avgProbeSec)};
  }
  const unified = m => m.model+(m.confidence!==null&&m.confidence!==undefined?'('+ +(m.confidence*100).toFixed(1)+'%)':'')+(sane(m.score)!==null?'-'+ +m.score.toFixed(1)+'分':''); // 对话时长不再写进名称（并入推理分，鼠标悬停才看）
  const fingerprintLabel = entry => unified(fingerprintData(entry));
  function label(entry, title) {
    if (entry?.fingerprint) return fingerprintLabel(entry);
    const p = parse(title), name = entry?.name || p.name;
    if (entry?.name && Strength.canon(name).toLowerCase() !== Strength.canon(p.name).toLowerCase()) return name;
    return format({...p,name,score:sane(entry?.reverseScore) ?? sane(entry?.est?.score) ?? p.score});   // 只做过鹈鹕测试（没有指纹）时，名字里也带鹈鹕测出来的推理分
  }
  function score(entry, title) {
    if (entry?.routed) {
      const r = sane(entry?.reverseScore);
      if (r != null) return r;
    }
    if (entry?.fingerprint) {
      const n = entry.fingerprint.reasoning?.score;
      const fpS = !entry.fingerprint.skipped ? sane(n) : null;
      if (fpS != null || !entry?.reverseScore) return fpS;
    }
    const rs = sane(entry?.reverseScore); if (rs != null) return rs;
    const es = sane(entry?.est?.score); if (es != null) return es;
    const p = parse(title);
    if (entry?.name && Strength.canon(entry.name).toLowerCase() !== Strength.canon(p.name).toLowerCase()) return null;
    return sane(p.score);
  }
  return {parse,sane,format,label,score,fingerprintData,fingerprintLabel,unified};
})();
