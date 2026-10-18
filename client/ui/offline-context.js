// Local recovery-page context for the shared connection picker. No account API bootstrap.
globalThis.__BRANA_OFFLINE__=true;
const _BH = window.BranaHost, _BA = window.BranaAndroid;
const _aCall = (fn, arg) => {
  if (!_BA || typeof _BA[fn] !== 'function') return Promise.resolve(null);
  try {
    const r = arg === undefined ? _BA[fn]() : _BA[fn](typeof arg === 'string' ? arg : JSON.stringify(arg));
    return Promise.resolve(r ? JSON.parse(r) : null);
  } catch (e) { return Promise.reject(e); }
};
const Host = _BH ? {
  ..._BH,
  platform: 'desktop',
  shared: (k, v) => typeof _BH.shared === 'function' ? _BH.shared(k, v) : (v === undefined ? _BH.sharedGet?.(k) : _BH.sharedSet?.(k, v)),
} : (_BA ? {
  platform: 'android',
  info: () => _aCall('info'),
  listAccounts: () => _aCall('listAccounts'),
  saveAccount: a => _aCall('saveAccount', a),
  openAccount: id => _aCall('openAccount', String(id || '')),
  back: mode => _aCall('back', mode ? String(mode) : undefined),
  testIp: t => _aCall('testIp', t),
  probe: o => _aCall('probe', o),
  speedTest: o => _aCall('speedTest', o),
  fetchText: u => _aCall('fetchText', String(u || '')),
  shared: (k, v) => v === undefined ? _aCall('sharedGet', String(k)) : _aCall('sharedSet', JSON.stringify({ k, v })),
} : {});
const UI={host:null};
const now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const describe=e=>String(e?.message||e||'未知错误'),cleanErr=describe;
const DEFAULT_PROXY='http://127.0.0.1:7890';
const isDirectP=p=>/^(direct|直连|none|off)$/i.test(String(p||'').trim());
const isVless=p=>/^vless:\/\/[^@\s]+@[^\s]+$/i.test(String(p||'').trim());
const maskProxy=p=>String(p||DEFAULT_PROXY).replace(/\/\/[^@/]*@/,'//***@');
const flagOf=cc=>/^[a-z]{2}$/i.test(cc||'')?String.fromCodePoint(...String(cc).toUpperCase().split('').map(c=>127397+c.charCodeAt(0))):'';
const ccF=cc=>[flagOf(cc),cc].filter(Boolean).join(' ');
const Bus=(()=>{const m=new Map();return {on(k,fn){if(!m.has(k))m.set(k,new Set());m.get(k).add(fn);return ()=>m.get(k)?.delete(fn);},emit(k,...args){for(const fn of m.get(k)||[])fn(...args);}};})();
const Store={get(k,fallback=null){try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}},del(k){try{localStorage.removeItem(k);}catch{}}};
const LastGoodRoute={
  save(a){if(!a?.id||(!a.proxy&&!a.proxyIp))return;Store.set('lastGoodRoute:'+a.id,{id:a.id,proxy:a.proxy||'',proxyIp:a.proxyIp||'',nodeId:a.nodeId||'',region:a.region||'',at:Date.now()});},
  get(id){return id?Store.get('lastGoodRoute:'+id,null):null;},
};
const _ICONS={
  bolt:'<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>',
  refresh:'<path d="M21 12a9 9 0 0 0-15.5-6.3L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.3L21 16"/><path d="M16 16h5v5"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  chev:'<path d="m6 9 6 6 6-6"/>',
  chevr:'<path d="m9 18 6-6-6-6"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  book:'<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
};
const icon=(n,cls='')=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','2');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('class',('ico '+(cls||'')).trim());s.style.cssText='width:14px;height:14px;vertical-align:-2px;flex-shrink:0';s.innerHTML=_ICONS[n]||_ICONS.bolt;return s;};
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='class')e.className=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='style'&&typeof v==='object')Object.assign(e.style,v);else e.setAttribute(k,v===true?'':v);}for(const c of kids.flat())if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(String(c)));return e;};
const toast=(text,kind)=>{const e=document.getElementById('hint');if(e){e.textContent=text;e.className='hint '+(kind==='err'?'bad':kind==='ok'?'ok':'');}};
const Dialog={
  ask:({title,value='',hint='',placeholder='',ok='确定',max=4000})=>new Promise(resolve=>{
    const input=h('input',{value,placeholder,maxlength:max}),back=h('div',{class:'modal-back'});
    const close=v=>{back.remove();resolve(v);};
    const submit=h('button',{type:'button',class:'btn pri',onclick:()=>close(input.value)},ok);
    const cancel=h('button',{type:'button',class:'btn ghost',onclick:()=>close(null)},'取消');
    back.append(h('div',{class:'modal',role:'dialog','aria-modal':'true','aria-label':title},h('div',{class:'modal-h'},title),h('div',{class:'modal-b'},h('p',{},hint),input),h('div',{class:'modal-f'},cancel,submit)));
    back.addEventListener('keydown',e=>{if(e.key==='Escape')close(null);if(e.key==='Enter')close(input.value);});document.body.append(back);input.focus();
  }),
  confirm:({title,text='',ok='确定',cancel='取消'})=>new Promise(resolve=>{
    const back=h('div',{class:'modal-back'}),close=v=>{back.remove();resolve(v);};
    back.append(h('div',{class:'modal',role:'alertdialog','aria-modal':'true'},h('div',{class:'modal-h'},title),h('div',{class:'modal-b'},h('p',{},text)),h('div',{class:'modal-f'},h('button',{type:'button',class:'btn ghost',onclick:()=>close(false)},cancel),h('button',{type:'button',class:'btn pri',onclick:()=>close(true)},ok))));
    document.body.append(back);
  })
};
const theme=matchMedia('(prefers-color-scheme: dark)');
const paintTheme=()=>document.documentElement.dataset.theme=theme.matches?'dark':'light';paintTheme();theme.addEventListener('change',paintTheme);