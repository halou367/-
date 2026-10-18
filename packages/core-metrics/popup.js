const $=id=>document.getElementById(id);
let tabId=null,available=false,timer=null;

function agentUrl(value){try{const url=new URL(value);return url.origin==='https://arena.ai'&&/^\/agent(?:\/|$)/.test(url.pathname);}catch{return false;}}
function render(state){
  if(!state)return;const samples=Number(state.samples)||0;
  $('progress').textContent=state.progress||'等待操作';
  $('run-one').disabled=!available||state.running||samples>=3;
  $('run-three').disabled=!available||state.running||samples>=3;
  $('stop').disabled=!state.running;
  $('clear').disabled=state.running||(!samples&&!state.result);
  $('run-one').textContent=state.running?'运行中…':samples>=3?'已完成 3 条':`发送第 ${samples+1} 条`;
  if(state.result){
    const result=state.result;$('result').hidden=false;$('result').dataset.level=result.status;$('model').textContent=result.nearest.display_name+(result.suffix||'');
    $('badge').textContent={clear:'清晰匹配',close:'同族近似',weak:'弱匹配'}[result.status]||result.status;
    $('metrics').textContent=`拟合 ${Number(result.signals.fit).toFixed(3)} · 分离 ${Number(result.signals.separation).toFixed(3)} · 家族 ${(Number(result.signals.family_probability)*100).toFixed(1)}% · 有效 ${result.used_outputs}/${samples}`;
    $('bank').textContent=`${result.bank_source} · ${result.bank_models} 个候选`;
  }else $('result').hidden=true;
}
async function message(type){
  if(!available||!Number.isInteger(tabId))return;
  try{const state=await chrome.tabs.sendMessage(tabId,{type});render(state);}
  catch{available=false;$('unavailable').hidden=false;$('controls').hidden=true;}
}
$('run-one').addEventListener('click',()=>void message('AMP_RUN_ONE'));
$('run-three').addEventListener('click',()=>void message('AMP_RUN_THREE'));
$('stop').addEventListener('click',()=>void message('AMP_STOP'));
$('clear').addEventListener('click',()=>void message('AMP_CLEAR'));

try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id??null;available=Number.isInteger(tabId)&&agentUrl(tab?.url);
  $('unavailable').hidden=available;$('controls').hidden=!available;
  if(available){await message('AMP_STATUS');timer=setInterval(()=>void message('AMP_STATUS'),1000);}
}catch{$('unavailable').hidden=false;$('controls').hidden=true;}
window.addEventListener('unload',()=>clearInterval(timer));
