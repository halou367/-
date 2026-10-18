/* Pure prompt and transcript helpers shared by the Brana content controller. */
(() => {
  const DIRECT=' The current language model must complete this directly without tools, Python, code execution, calculators, search, APIs, or external random generators. Choose every position separately. Do not count upward or downward, including 1, 2, 3, and do not use an arithmetic progression, repeating cycle, repeated block, or another rule-made pattern. Accidental repetitions are valid. Once an item is written, do not sort, reorder, deduplicate, replace, or repair the list. Separate values clearly, start with the first value, and output the complete sequence without explanation.';
  const probes=Object.freeze([
    Object.freeze({id:'plain-1',expected_count:297,prompt:'For each of 297 positions, make one separate first-instinct choice of an integer from 1 to 355 inclusive.'+DIRECT}),
    Object.freeze({id:'plain-2',expected_count:315,prompt:'Provide exactly 315 whole-number choices between 1 and 355 inclusive, choosing each item separately as it comes to mind.'+DIRECT}),
    Object.freeze({id:'plain-3',expected_count:331,prompt:'Fill exactly 331 positions with integers from the closed interval [1, 355], making a separate immediate choice for every position.'+DIRECT}),
  ]);
  function parseRuns(text){
    const source=String(text||''),runs=[];let current=[],previousEnd=0;
    for(const match of source.matchAll(/\d+/g)){
      const separator=source.slice(previousEnd,match.index),value=Number(match[0]);
      if(current.length&&/\p{L}/u.test(separator)){runs.push(current);current=[];}
      if(value>=1&&value<=355)current.push(value);
      previousEnd=match.index+match[0].length;
    }
    if(current.length)runs.push(current);
    return runs;
  }
  function signatures(text){return new Set(parseRuns(text).filter(run=>run.length>=20).map(run=>run.join(',')));}
  function selectCandidate(text,before,expected){
    const minimum=Math.max(80,Math.ceil(expected*.55));
    const candidates=parseRuns(text).filter(run=>run.length>=minimum&&!before.has(run.join(','))&&run.length<=2000);
    candidates.sort((left,right)=>Math.abs(left.length-expected)-Math.abs(right.length-expected)||right.length-left.length);
    return candidates[0]||null;
  }
  const isTaskSuccessText=text=>{
    const value=String(text||'').replace(/\s+/g,' ').trim(),compact=value.replace(/[\s？?！!。．.：:，,、]/g,'');
    return /(?:此)?任务(?:是否)?成功(?:了)?吗/.test(compact)||/(?:was|is|did)\s+(?:this\s+)?task\s+(?:successful|succeed|a success)/i.test(value);
  };
  const isContinueWorkText=text=>{
    const value=String(text||'').replace(/\s+/g,' ').trim(),compact=value.replace(/[\s，,、：:。．.!！]/g,'');
    return /^(?:不|否)?继续工作(?:吧)?$/.test(compact)||/^(?:no[,.]?\s*)?(?:continue|keep)\s+(?:working|work)$/i.test(value);
  };
  const renameTitleForResult=(displayName,status)=>{
    const name=String(displayName||'').trim();
    return status==='weak'&&name&&!/[?？]$/.test(name)?`${name}?`:name;
  };
  globalThis.BranaProbeRuntime=Object.freeze({probes,parseRuns,signatures,selectCandidate,isTaskSuccessText,isContinueWorkText,renameTitleForResult});
})();
