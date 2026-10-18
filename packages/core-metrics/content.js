/* Brana Model Probe standalone controller and HUD. No dependency on Brana Trace Inspector. */
(() => {
  const {probes,signatures,selectCandidate,isTaskSuccessText,isContinueWorkText,renameTitleForResult}=globalThis.BranaProbeRuntime;
  const records=new Map();
  const HOST_ID='brana-model-probe-standalone';
  let host=null,root=null,collapsed=false;
  let runOneButton,runAllButton,stopButton,clearButton,progressNode,resultNode,resultModel,resultBadge,resultMetrics,resultBank,compactText;
  let running=false,cancelled=false,sent=false,targetSession=null,phase='idle',progress='点击即发送真实探针，不再弹出确认';
  const visible=element=>{
    if(!element?.isConnected||!element.getClientRects().length)return false;
    if(['dialog','alertdialog','menu'].includes(element.getAttribute('role'))&&element.getAttribute('data-state')==='closed')return false;
    if(typeof getComputedStyle==='function'){const style=getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden')return false;}
    return true;
  };
  const session=()=>location.pathname.match(/^\/agent\/([a-zA-Z0-9-]{1,128})\/?$/)?.[1]||null;
  const agentPage=()=>location.origin==='https://arena.ai'&&/^\/agent(?:\/|$)/.test(location.pathname);
  const editors=()=>[...document.querySelectorAll('[contenteditable="true"]')].filter(visible);
  const editorText=element=>(element?.innerText??element?.textContent??'').trim();
  const modeReady=()=>[...document.querySelectorAll('button[role="combobox"]')].filter(visible).some(element=>element.textContent.trim().startsWith('Agent'));
  const generating=()=>[...document.querySelectorAll('button[aria-label]')].some(element=>visible(element)&&/stop|cancel/i.test(element.getAttribute('aria-label')||''))||[...document.querySelectorAll('[data-streaming="true"],[aria-busy="true"]')].some(visible);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const fatal=message=>Object.assign(Error(message),{fatal:true});

  function transcriptText(){
    const logs=[...document.querySelectorAll('[role="log"]')].filter(visible);
    if(logs.length)return logs.sort((left,right)=>(right.innerText||'').length-(left.innerText||'').length)[0].innerText||'';
    const main=[...document.querySelectorAll('main')].filter(visible).sort((left,right)=>(right.innerText||'').length-(left.innerText||'').length)[0];
    return main?.innerText||'';
  }
  function currentRecord(){const id=session();return id?records.get(id)||null:null;}
  function publicStatus(){
    const id=session(),record=id?records.get(id)||null:null;
    if(!running&&record)return {running:false,phase:record.phase||'done',progress:record.progress||progress,sessionId:id,samples:record.samples.length,continueClicks:record.continueClicks||0,result:record.result||null,check:record.lastCheck||null};
    return {running,phase,progress,sessionId:targetSession||id,samples:record?.samples.length||0,continueClicks:record?.continueClicks||0,result:record?.result||null,check:record?.lastCheck||null};
  }
  function publish(nextPhase,text,record=null){phase=nextPhase;progress=text;if(record){record.phase=nextPhase;record.progress=text;}paint();}
  function guard(expectedSession=null){
    if(cancelled)throw fatal('已停止；已经发送的消息不会撤回');
    if(!agentPage())throw fatal('已离开 Brana Agent 页面，探测停止');
    if(expectedSession&&session()!==expectedSession)throw fatal('已切换到其他聊天，探测停止');
  }
  function ensureReady(expectedSession=null){
    guard(expectedSession);
    if(generating())throw fatal('当前回复仍在生成，请等待结束后再探测');
    if(!modeReady())throw fatal('未确认 Agent Mode，请先切换到 Agent Mode');
    if(editors().some(element=>editorText(element)))throw fatal('输入框有未发送草稿；为避免覆盖，未发送探针');
  }
  function writeEditor(editor,text){
    editor.focus();const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(editor);selection.removeAllRanges();selection.addRange(range);
    if(editorText(editor)&&!document.execCommand('delete',false))throw Error('无法清空输入框；未发送');
    if(!document.execCommand('insertText',false,text))throw Error('无法写入探针；未发送');
  }
  async function waitFor(check,message,timeout=30000,expectedSession=null){
    const end=Date.now()+timeout;
    while(Date.now()<end){guard(expectedSession);const value=await check();if(value)return value;await sleep(250);}
    throw Error(message);
  }
  async function waitForReply(before,expected,expectedSession,record,round){
    const started=Date.now();let lastSignature='',changedAt=Date.now(),candidate=null,continued=false,continuedAt=0,promptSeenAt=0;
    while(Date.now()-started<600000){
      guard(expectedSession);const busy=generating();
      const next=selectCandidate(transcriptText(),before,expected),signature=next?.join(',')||'';
      if(signature!==lastSignature){lastSignature=signature;changedAt=Date.now();candidate=next;}
      const ui=taskSuccessUi();
      if(!continued&&ui){continued=await clickContinueWork(expectedSession,record,round);continuedAt=Date.now();}
      if(!continued&&taskSuccessPromptVisible()&&!promptSeenAt)promptSeenAt=Date.now();
      const stable=Date.now()-changedAt;
      if(continued&&!candidate&&Date.now()-continuedAt>=3000)throw Error('已点击“继续工作”，但本轮回复中没有可用的数字序列');
      if(!continued&&promptSeenAt&&Date.now()-promptSeenAt>=6000)throw Error('已看到“任务成功”提示，但没有找到可点击的“继续工作”控件；已停止后续探针');
      if(candidate&&!busy){
        const nearComplete=candidate.length>=Math.ceil(expected*.9);
        if(continued&&((nearComplete&&stable>=500)||stable>=2000))return candidate;
        if(!continued&&stable>=12000)return candidate;
      }
      await sleep(350);
    }
    throw Error('等待数字回复超时（10 分钟）；未确认完成的序列不会计分，也不会自动重发');
  }
  function controlLabels(element){return [element?.getAttribute?.('aria-label'),element?.getAttribute?.('title'),element?.value,element?.innerText,element?.textContent].map(value=>String(value||'').replace(/\s+/g,' ').trim()).filter(Boolean);}
  function taskSuccessPromptVisible(){return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"],[role="heading"],h1,h2,h3,h4,p')].some(element=>visible(element)&&isTaskSuccessText(`${element.getAttribute?.('aria-label')||''} ${element.textContent||''}`));}
  function taskSuccessUi(){
    const controls=[...document.querySelectorAll('button,[role="button"],[data-slot="button"],[tabindex]:not([tabindex="-1"]),input[type="button"],input[type="submit"]')].filter(element=>visible(element)&&!element.disabled&&element.getAttribute('aria-disabled')!=='true'&&controlLabels(element).some(isContinueWorkText));
    const unique=controls.filter((element,index)=>!controls.some((other,otherIndex)=>otherIndex!==index&&element.contains(other)));
    const contextual=unique.map(control=>{
      let container=control;
      for(let depth=0;container&&container!==document.body&&depth<14;depth++,container=container.parentElement){
        const label=`${container.getAttribute?.('aria-label')||''} ${container.textContent||''}`;
        if(isTaskSuccessText(label))return {control,container};
      }
      return null;
    }).filter(Boolean);
    const matches=contextual.length?contextual:(taskSuccessPromptVisible()?unique.map(control=>({control,container:control.parentElement})):[]);
    if(matches.length>1)return {ambiguous:true,matches};
    return matches[0]||null;
  }
  async function clickContinueWork(expectedSession,record,round){
    const ui=taskSuccessUi();
    if(!ui)return false;
    if(ui.ambiguous)throw fatal('页面上有多个“继续工作”控件，已停止自动操作');
    publish('continuing',`第 ${round}/3 条回复结束，正在点击“继续工作”…`,record);
    guard(expectedSession);ui.control.click();
    await waitFor(()=>!taskSuccessUi(),'点击“继续工作”后提示仍未关闭，已停止后续探针',10000,expectedSession);
    record.continueClicks=(record.continueClicks||0)+1;
    return true;
  }
  function newRecord(){return {samples:[],result:null,checks:[],lastCheck:null,continueClicks:0,renameTitle:'',renameError:'',phase:'idle',progress:''};}
  async function score(record){
    const outputs=record.samples.map((sample,index)=>({text:sample.text,expected_count:probes[index].expected_count,challenge_id:probes[index].id}));
    const response=await chrome.runtime.sendMessage({type:'AMP_SCORE',outputs,pageUrl:location.href});
    if(response?.error)throw Error(response.error);
    record.checks=response?.checks||[];record.lastCheck=record.checks.at(-1)||null;record.result=response?.result||null;
    return record.result;
  }
  async function sendOne(record,probeIndex,expectedSession){
    const probe=probes[probeIndex];ensureReady(expectedSession);
    const editor=editors()[0];if(!editor)throw fatal('未找到 Agent 输入框；未发送探针');
    const before=signatures(transcriptText());writeEditor(editor,probe.prompt);
    const send=await waitFor(()=>[...document.querySelectorAll('button[aria-label="Send message"]')].find(button=>visible(button)&&!button.disabled),'发送按钮不可用；未发送',30000,expectedSession);
    guard(expectedSession);if(editorText(editor)!==probe.prompt)throw fatal('输入内容已变化；未发送探针');
    sent=true;publish('sent',`第 ${probeIndex+1}/3 条已发送，等待模型回复…`,record);send.click();
    let active=expectedSession;
    if(!active){
      try{active=await waitFor(()=>session(),'发送后未确认新会话；不会重发',30000,null);}
      catch(error){throw error?.fatal?error:fatal(error?.message||'发送后未确认新会话；不会重发');}
      targetSession=active;record=records.get(active)||record||newRecord();records.set(active,record);
    }
    guard(active);
    const values=await waitForReply(before,probe.expected_count,active,record,probeIndex+1);
    record.samples.push({text:values.join(','),captured_count:values.length});
    publish('scoring',`第 ${probeIndex+1}/3 条捕获 ${values.length} 个数字，正在本机评分…`,record);
    const result=await score(record);
    if(result){
      const verdict={clear:'清晰匹配',close:'同族近似',weak:'弱匹配'}[result.status]||result.status;
      publish('scored',`${verdict}：${result.nearest.display_name} · 已用 ${result.used_outputs}/${record.samples.length} 条有效回复`,record);
    }else publish('scored',record.lastCheck?.message||'本条回复未通过计分门控',record);
    sent=false;return {record,sessionId:active};
  }
  async function run(toThree=false){
    if(running)return publicStatus();
    cancelled=false;guard();let active=session(),record=active?records.get(active)||newRecord():newRecord();
    if(active&&!records.has(active))records.set(active,record);
    if(record.samples.length>=3){publish('done','当前聊天已完成三条；清除结果或新建聊天后可重新探测',record);return publicStatus();}
    const goal=toThree?(record.samples.length===1&&record.result?.plan?.early?1:3):record.samples.length+1;
    running=true;cancelled=false;sent=false;targetSession=active;
    publish('checking',toThree?`将从第 ${record.samples.length+1} 条连续探测到第 3 条`:`准备第 ${record.samples.length+1}/3 条探针`,record);
    try{
      while(record.samples.length<goal){
        const step=await sendOne(record,record.samples.length,active);record=step.record;active=step.sessionId;targetSession=active;
        if(record.lastCheck?.level!=='ok')throw Error(record.lastCheck?.message||'本条未通过门控，已停止后续探针');
        if(toThree&&record.result?.plan?.early)break;
        if(record.samples.length<goal){publish('waiting',`第 ${record.samples.length}/3 条完成，准备下一条…`,record);await sleep(1200);}
      }
      const label=record.result?.nearest?.display_name||'暂无可靠候选';
      const verdict=record.result?({clear:'清晰匹配',close:'同族近似',weak:'弱匹配'}[record.result.status]||record.result.status):'未通过门控';
      let renameNote='';
      if(record.result&&active){
        const conversationTitle=record.result.title||renameTitleForResult(label,record.result.status);
        record.renameError='';publish('renaming',`探测完成，正在把当前会话重命名为 ${conversationTitle}…`,record);
        try{
          const renamed=await globalThis.BranaProbeRename.rename({sessionId:active,title:conversationTitle,isCurrent:()=>!cancelled&&session()===active});
          record.renameTitle=renamed.title;renameNote=renamed.unchanged?' · 会话名称已是该模型标识':` · 已重命名为 ${renamed.title}`;
        }catch(error){record.renameError=error?.message||'自动重命名失败';renameNote=` · 重命名失败：${record.renameError}`;}
      }
      publish('done',`${verdict}：${label} · 已捕获 ${record.samples.length}/3 条 · 已点“继续工作” ${record.continueClicks||0}/${record.samples.length}${renameNote}`,record);
    }catch(error){publish(cancelled?'stopped':'error',error?.message||'自动探测失败',record);}
    finally{running=false;sent=false;targetSession=null;paint();}
    return publicStatus();
  }
  function stop(){if(running){cancelled=true;publish('stopping','正在停止；不会再发送下一条');}return publicStatus();}
  function clearCurrent(){if(running)return publicStatus();const id=session();if(id)records.delete(id);phase='idle';progress='当前聊天的内存结果已清除；点击即可重新发送第 1 条';paint();return publicStatus();}

  function el(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
  function createHud(){
    document.getElementById(HOST_ID)?.remove();host=el('div');host.id=HOST_ID;host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647';root=host.attachShadow({mode:'closed'});
    const style=el('style');style.textContent=`:host{all:initial}.box{box-sizing:border-box;width:330px;max-width:calc(100vw - 24px);border:1px solid #3d5e51;border-radius:14px;background:#101a20;color:#e7f1ed;box-shadow:0 16px 50px #0008;font:12px/1.5 system-ui,sans-serif;overflow:hidden}.box *{box-sizing:border-box}[hidden]{display:none!important}.head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid #2a3d40;background:#142329}.mark{display:grid;place-items:center;width:23px;height:23px;border:1px solid #56816d;border-radius:7px;background:#224639;color:#bdf0d4;font:700 12px ui-monospace,monospace}.title{flex:1}.title b,.title small{display:block}.title b{font-size:11px}.title small{font-size:8px;color:#84a39c;letter-spacing:.8px}.collapse{width:25px;height:25px;padding:0}.body{padding:11px}.warning{margin:0 0 9px;padding:7px 8px;border-left:2px solid #b48645;background:#251f15;color:#d9c18e;font-size:9px}.controls{display:grid;grid-template-columns:1fr 1fr;gap:6px}.minor{display:flex;gap:6px;margin-top:6px}.minor button{flex:1}button{border:1px solid #466257;border-radius:7px;padding:7px 8px;background:#172823;color:#cfe9dc;font:10px system-ui,sans-serif;cursor:pointer}button:hover:not(:disabled){filter:brightness(1.15)}button:disabled{opacity:.4;cursor:default}.primary{background:#286149;border-color:#559174;color:#f0fff7;font-weight:650}.all{background:#23453a}.stop{color:#efb1ab;border-color:#744b49}.progress{min-height:31px;margin:8px 1px 0;color:#9eb7b0;font-size:9px;line-height:1.55;overflow-wrap:anywhere}.result{margin-top:8px;padding:9px;border:1px solid #416a56;border-radius:9px;background:#173127}.result-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.model{font:650 14px/1.3 ui-monospace,Consolas,monospace;color:#b8efd2;overflow-wrap:anywhere}.badge{white-space:nowrap;border:1px solid #55816b;border-radius:999px;padding:2px 6px;color:#bfead5;font-size:8px}.result[data-level=close]{border-color:#735f39;background:#2a2418}.result[data-level=close] .model{color:#ecd49a}.result[data-level=weak]{border-color:#704946;background:#2d2021}.result[data-level=weak] .model{color:#e9b0aa}.metrics{margin-top:6px;color:#9fb8b1;font:9px/1.55 ui-monospace,Consolas,monospace}.bank{margin-top:4px;color:#748f89;font-size:8px}.compact{display:flex;align-items:center;gap:7px;padding:8px 10px}.compact-text{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#b8e9d1;font:600 11px system-ui}.expand{width:24px;height:24px;padding:0}`;
    const box=el('section','box'),head=el('header','head'),mark=el('span','mark','M'),title=el('div','title');title.append(el('b','','Brana Model Probe'),el('small','','STANDALONE · v1.2.0-beta.1'));const collapse=el('button','collapse','—');collapse.title='收起';collapse.addEventListener('click',()=>{collapsed=true;paint();});head.append(mark,title,collapse);
    const body=el('div','body'),warning=el('p','warning','点击即发送真实消息；每轮自动点“继续工作”，得到结果后自动把当前会话重命名为模型名。'),controls=el('div','controls');runOneButton=el('button','primary','发送第 1 条');runAllButton=el('button','all','自动探测 1–3 条');controls.append(runOneButton,runAllButton);const minor=el('div','minor');stopButton=el('button','stop','停止');clearButton=el('button','','清除结果');minor.append(stopButton,clearButton);progressNode=el('p','progress');progressNode.setAttribute('role','status');
    resultNode=el('section','result');const resultTop=el('div','result-top');resultModel=el('div','model');resultBadge=el('span','badge');resultTop.append(resultModel,resultBadge);resultMetrics=el('div','metrics');resultBank=el('div','bank');resultNode.append(resultTop,resultMetrics,resultBank);body.append(warning,controls,minor,progressNode,resultNode);
    const compact=el('div','compact');compactText=el('div','compact-text','模型探测');const expand=el('button','expand','↗');expand.title='展开';expand.addEventListener('click',()=>{collapsed=false;paint();});compact.append(mark.cloneNode(true),compactText,expand);
    runOneButton.addEventListener('click',()=>void run(false));runAllButton.addEventListener('click',()=>void run(true));stopButton.addEventListener('click',stop);clearButton.addEventListener('click',clearCurrent);
    box.append(head,body,compact);root.append(style,box);document.documentElement.append(host);paint();
  }
  function paint(){
    if(!agentPage()){if(host)host.hidden=true;return;}if(!host?.isConnected)createHud();host.hidden=false;
    const body=root.querySelector('.body'),head=root.querySelector('.head'),compact=root.querySelector('.compact');body.hidden=collapsed;head.hidden=collapsed;compact.hidden=!collapsed;
    const state=publicStatus(),samples=state.samples||0;runOneButton.disabled=state.running||samples>=3;runAllButton.disabled=state.running||samples>=3;stopButton.disabled=!state.running;clearButton.disabled=state.running||(!samples&&!state.result);
    runOneButton.textContent=state.running?'运行中…':samples>=3?'已完成 3 条':`发送第 ${samples+1} 条`;runAllButton.textContent=state.running?'连续探测中…':'自动探测 1–3 条';progressNode.textContent=state.progress||progress;
    if(state.result){resultNode.hidden=false;resultNode.dataset.level=state.result.status;resultModel.textContent=state.result.nearest.display_name+(state.result.suffix||'');resultBadge.textContent={clear:'清晰匹配',close:'同族近似',weak:'弱匹配'}[state.result.status]||state.result.status;resultMetrics.textContent=`拟合 ${Number(state.result.signals.fit).toFixed(3)} · 分离 ${Number(state.result.signals.separation).toFixed(3)} · 家族 ${(Number(state.result.signals.family_probability)*100).toFixed(1)}% · 有效 ${state.result.used_outputs}/${samples}`;resultBank.textContent=`${state.result.bank_source} · ${state.result.bank_models} 个候选`;compactText.textContent=`${resultBadge.textContent} · ${state.result.nearest.display_name}`;}
    else{resultNode.hidden=true;compactText.textContent=state.running?'自动探测中…':samples?`已捕获 ${samples}/3 条`:'模型探测';}
  }

  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message?.type==='AMP_STATUS'){reply(publicStatus());return;}
    if(message?.type==='AMP_RUN_ONE'){void run(false);reply(publicStatus());return;}
    if(message?.type==='AMP_RUN_THREE'){void run(true);reply(publicStatus());return;}
    if(message?.type==='AMP_STOP'){reply(stop());return;}
    if(message?.type==='AMP_CLEAR'){reply(clearCurrent());}
  });
  window.addEventListener('pagehide',()=>{cancelled=true;});
  window.addEventListener('popstate',paint);window.navigation?.addEventListener('navigatesuccess',paint);
  new MutationObserver(()=>{if(host&&!host.isConnected)createHud();}).observe(document,{childList:true,subtree:true});
  createHud();setInterval(()=>{if(agentPage())paint();},1000);
})();
