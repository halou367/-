// Resource guard for exact numeric probes only. Never trims an invalid reply into a scored sample.
const ProbeOutputGuard = (() => {
  const TIMEOUT_MS = 180000, MAX_CHARS = 6000;
  const LABELS = Object.freeze({
    'visible-thinking':'可见思考', 'probe-too-many':'数字超量', 'probe-too-long':'回复超长',
    'probe-repeat':'循环输出', 'probe-timeout':'单条超时', 'probe-multiple':'多段回复异常'
  });
  function inspect(text, expected, streaming=false, maxExtra=null) {
    text=String(text||'');
    if(text.length>MAX_CHARS)return {reason:'probe-too-long',detail:'本条回复超过 '+MAX_CHARS+' 字符，已停止，不截取评分'};
    const tokens=text.match(/\d+/g)||[];
    // A digit run at the end of a live delta may not have finished yet.
    if(streaming&&/\d$/.test(text))tokens.pop();
    const limit=Number.isInteger(maxExtra)&&maxExtra>=0 ? expected+maxExtra : Math.ceil(expected*1.2);
    if(tokens.length>limit)return {reason:'probe-too-many',detail:'本条要求 '+expected+' 个数字，已超过保护上限 '+limit+' 个，不截取评分',observed:tokens.length,limit};
    const nums=tokens.map(Number),n=nums.length;
    for(let period=1;period<=64&&period*3<=n;period++){
      const size=Math.max(period*3,Math.ceil(24/period)*period);if(size>n)continue;
      let same=true;for(let i=n-size;i<n-period;i++){if(nums[i]!==nums[i+period]){same=false;break;}}
      if(same)return {reason:'probe-repeat',detail:'检测到长度 '+period+' 的数字块连续循环（至少 '+size+' 个数字），不作为有效指纹',period,observed:n};
    }
    return null;
  }
  return {inspect,TIMEOUT_MS,MAX_CHARS,LABELS};
})();
