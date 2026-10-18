// Persistent data-only fingerprint cache. Never executes remote scripts.
const ProbeBankCache = (() => {
  const ORIGIN = 'https://whatsmyllm.com';
  const KEY = 'fingerprint:bank:v1', TTL = 6 * 3600e3, RETRY = 30 * 60e3;   // 省流量：以前每 5 分钟下载一次指纹站首页（~63 KB），出错后 30 秒就重试
  const PIN = { version: '2026.09.5', url: ORIGIN + '/data/bank/v2026.09.5.json', sha: 'd21c1413eeac2f5238f37bc97df0299591433c14a1bbd5534546e95697fbd11f' };
  let current, initializing, updating, checked = -Infinity, lastError = '';
  const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
  function validDescriptor(d) {
    return !!d && /^\d{4}\.\d{1,2}\.\d+$/.test(d.version || '') && /^[a-f0-9]{64}$/.test(d.sha || '') && d.url === ORIGIN + '/data/bank/v' + d.version + '.json';
  }
  const compare = (a,b) => { const x=a.split('.').map(Number), y=b.split('.').map(Number); for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0; };
  const decode = s => s.replace(/&quot;/g,'"').replace(/&#(?:39|x27);/gi,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  function descriptor(html) {
    if (html.length > 500000) throw Error('指纹源页面过大');
    const body=/<body\b([^>]*)>/i.exec(html)?.[1] || '';
    const attr=name => new RegExp('\\b'+name+'=["\']([^"\']+)["\']','i').exec(body)?.[1];
    const d={ version:attr('data-bank-version'), sha:attr('data-bank-sha256'), url:ORIGIN+(attr('data-bank')||'') };
    if (!validDescriptor(d)) throw Error('最新指纹库元数据无效');
    const prompts=[...html.matchAll(/<pre\b[^>]*class=["'][^"']*\bprompt\b[^"']*["'][^>]*>([\s\S]*?)<\/pre>/gi)].map(m=>decode(m[1].replace(/<[^>]*>/g,'' )).trim());
    if (!ProbeLib.PROBES.every(p=>prompts.includes(p.prompt))) throw Error('远端探针协议改变，保留当前兼容库');
    return d;
  }
  async function validateRecord(r) {
    if (!validDescriptor(r) || r.protocol !== ProbeLib.PROBE_PROTOCOL || typeof r.text !== 'string' || r.text.length > 1500000 || await digest(r.text)!==r.sha) throw Error('本地指纹缓存损坏');
    const bank=ProbeLib.validateBank(JSON.parse(r.text));
    return { bank, source:'WhatsMyLLM v'+r.version+' · 本地缓存', fallback:false, version:r.version, sha:r.sha, url:r.url, cachedAt:r.at, persistent:true };
  }
  async function init() {
    if (!initializing) initializing=(async()=>{
      const cached=Store.get(KEY,null);
      if(cached)try { const r=await validateRecord(cached); if(compare(r.version,PIN.version)>=0){current=r;return current;} } catch { lastError='本地缓存校验失败，使用随包库'; }
      current={ bank:ProbeLib.seedBank || ProbeLib.bank, source:'WhatsMyLLM v'+PIN.version+' · 随包21型号', fallback:false, version:PIN.version, sha:PIN.sha, url:PIN.url, persistent:false };
      return current;
    })();
    return initializing;
  }
  async function download(url, type, max) {
    // The upstream HTML metadata does not enable CORS. Use the existing native host bridge, not a proxy service.
    if (typeof Host !== 'undefined' && Host.fetchText) {
      const r = await Host.fetchText(url, { publicData: true });
      if (r?.error || typeof r?.text !== 'string' || r.text.length > max || (r.contentType && !r.contentType.includes(type))) throw Error(r?.error || '指纹更新数据无效');
      return r.text;
    }
    const r=await rawFetch(url,{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!r.ok || !(r.headers.get('content-type')||'').includes(type))throw Error('指纹更新网络不可用');
    // Cap while reading, not just after allocating an arbitrary response.
    if (r.body?.getReader) {
      const reader=r.body.getReader(), decoder=new TextDecoder();let text='',size=0;
      try { for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max*4)throw Error('指纹更新数据过大');text+=decoder.decode(part.value,{stream:true});if(text.length>max)throw Error('指纹更新数据过大');}text+=decoder.decode();return text; }
      catch(e){await reader.cancel().catch(()=>{});throw e;}
      finally{reader.releaseLock();}
    }
    const text=await r.text();if(text.length>max)throw Error('指纹更新数据过大');return text;
  }
  async function refresh(force=false) {
    await init();
    if(updating)return updating;
    if(!force && now()-checked<(lastError?RETRY:TTL))return current;
    checked=now();
    updating=(async()=>{
      try {
        const d=descriptor(await download(ORIGIN+'/','text/html',500000));
        if(compare(d.version,current.version)<0)throw Error('远端版本回退，保留较新的本地库');
        if(d.version===current.version && d.sha!==current.sha)throw Error('同版本摘要改变，保留已验证副本');
        if(d.version===current.version && d.sha===current.sha && current.persistent){lastError='';return current;}
        const text=await download(d.url,'json',1500000);
        const row={...d,text,at:Date.now(),protocol:ProbeLib.PROBE_PROTOCOL};
        const validated=await validateRecord(row); // The old record is untouched on any failure.
        Store.set(KEY,row);
        const readback=Store.get(KEY,null), persistent=readback?.sha===row.sha && readback?.text===text;
        current={...validated,persistent,source:'WhatsMyLLM v'+d.version+(persistent?' · 本地缓存':' · 内存（本地写入失败）')};
        lastError=persistent?'':'本地存储空间不足，重启后使用随包库';
      } catch(e){lastError=e?.message||'更新失败，保留本地指纹库';}
      finally{updating=null;}
      return current;
    })();
    return updating;
  }
  async function load({force=false}={}) {
    await init();
    if(force)return refresh(true);
    void refresh(); // Return a stable snapshot immediately; this run never changes banks mid-way.
    return current;
  }
  function status(){return {version:current?.version || PIN.version,source:current?.source || '随包21型号',models:current?.bank.models.length || 21,updating:!!updating,error:lastError};}
  return {load,refresh,status,descriptor,validateRecord,KEY,PIN};
})();
