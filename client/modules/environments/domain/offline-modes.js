// The recovery page mounts the same picker as the live Current IP dialog, with concise auto-mode guidance.
const OfflineModes = {
  async bind({account,hint,retry}) {
    UI.host={account:account()};
    await Promise.all([Nodes.load(),Nodes.loadSubs(),typeof Pool!=='undefined'?Pool.load().catch(()=>{}):null,typeof NodeSpeed!=='undefined'?NodeSpeed.load?.().catch(()=>{}):null]);
    const picker=NodeRoutes.field(account(),{live:true,footer:true,onApplied:updated=>{
      Object.assign(account(),updated);
      try{if(typeof LastGoodRoute!=='undefined')LastGoodRoute.save(account());}catch{}
      hint('✓ 已连上可用线路，正在返回…','ok');
      retry();
    }});
    if(!picker)throw Error('连接选择器不可用，请更新客户端');
    const block=picker.block();
    const autoCard=h('div',{class:'off-auto-card'},
      h('div',{class:'off-auto-info'},
        h('b',{},'全网自动优选（不限节点 / 地区 / IP）'),
        h('small',{},'自动从全部节点与地区中挑选未限流的纯净 IP，节点不通时自动尝试本机代理')
      )
    );
    const seg=block.querySelector('.pseg');
    if(seg&&seg.nextSibling)block.insertBefore(autoCard,seg.nextSibling);
    const editor=document.getElementById('connection-editor');
    editor.replaceChildren(block);editor.hidden=false;
    const leg=document.getElementById('legacy-editor');
    if(leg)leg.hidden=true;
    return {
      picker,
      apply:()=>picker.check(),
      autoPick:async()=>{
        if(picker.busy)return;
        await picker.selectMode('auto');
        return picker.check();
      },
      refresh:async()=>{UI.host=await Host.info();Object.assign(account(),UI.host.account);await picker.refresh();}
    };
  },
};
