// 鹈鹕测试：在「当前这条对话」里发 1 条英文鹈鹕骑车 SVG 标准题，量思考时长 → 推理分（没思考不计分）。
// 和测指纹一样每条对话独立运行：测的时候可以新建对话、在别的对话里聊天，只锁正在测的这一条。
// 第一段正文一出现时如果已经看到真实的思考（思考块 / 静默 ≥ 5 秒）就停止生成，不浪费额度；思考时长 = 服务器接单 → 第一个输出之间的静默时间。
// 没看到思考（agent 模型直接写文件）就让回复写完，用「总耗时 − 出字时间」估算（标「估算」）。分数记进这条对话的推理分账本（Strength.settle）。
const PelicanTest = (() => {
  const active = new WeakMap(), KEY = 'pelican';
  const all = () => { const d = Store.get(KEY, {}); return d && typeof d === 'object' ? d : {}; };
  const result = sid => all()[sid] || null;
  const isRunning = chat => active.has(chat);
  function drop(sids) { const d = all(); let n = 0; for (const k of sids) if (k in d) { delete d[k]; n++; } if (n) Store.set(KEY, d); return n; }
  function remember(sid, row) {
    const d = all(); delete d[sid]; d[sid] = row; const ks = Object.keys(d);
    if (ks.length > 1500) for (const k of ks.slice(0, ks.length - 1500)) delete d[k];
    Store.set(KEY, d);
    try { if (typeof Host !== 'undefined' && Host.shared) void Promise.resolve(Host.shared('pelican', { [sid]: row })).catch(() => {}); } catch {}
    try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(sid); } catch {}
  }
  function merge(incoming) {
    if (!incoming || typeof incoming !== 'object') return 0;
    const d = all(); let n = 0;
    for (const [sid, r] of Object.entries(incoming)) {
      if (!sid || !r || typeof r !== 'object') continue;
      const cur = d[sid];
      const nextName = (r.name && r.name !== '未识别') ? r.name : (cur?.name || r.name || '');
      const nextScore = r.score ?? cur?.score ?? null;
      const nextThink = r.think ?? cur?.think ?? 0;
      const nextAt = Math.max(Number(r.at) || 0, Number(cur?.at) || 0);
      if (!cur || cur.name !== nextName || cur.score !== nextScore || cur.think !== nextThink) {
        d[sid] = { ...(cur || {}), ...r, name: nextName, score: nextScore, think: nextThink, at: nextAt || now() };
        n++;
      }
    }
    if (n > 0) Store.set(KEY, d);
    return n;
  }
  const aborted = () => Object.assign(Error('已取消'), { name: 'AbortError' });
  async function start(chat) {
    if (active.has(chat)) { active.get(chat).abort(); return; }
    if (!chat?.sid) { toast('请先打开需要测试的对话', 'err'); return; }
    if (chat.busy || chat.gacha || chat.queue?.length || chat.fpLocked || (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning(chat))) { toast('请等待当前回复或任务结束', 'err'); return; }
    const ctl = new AbortController(), sid = chat.sid; active.set(chat, ctl);
    const say = t => { chat.probeProgress = t; try { chat.emit(); } catch {} };
    say('鹈鹕测试：发送中…');
    try {
      const before = chat.fmt;
      await chat.send(GachaPrompts.svg());
      say('鹈鹕测试：等待思考结束…');
      /* 第一段输出出现 = 思考结束。已经看到真实的思考（思考块 / 静默 ≥ THINK_MIN 秒）就像以前一样立刻停止，省额度；
         没看到（agent 模型常常直接调用写文件工具，静默只有一两秒）就让这一轮跑完，再用回复时间和内容估算 */
      let waited = false;
      for (let i = 0; ; i++) {
        if (ctl.signal.aborted) throw aborted();
        const f = chat.fmt;
        if (f && f !== before && (f.tN > 0 || f.tools > 0 || f.done)) {
          if (!f.done && chat.busy && !waited) { const e0 = Fmt.est({ ...f, tEnd: f.tEnd || now() }, null, true); if (f.rChars > 0 || (e0 && e0.think >= Strength.THINK_MIN)) break; waited = true; say('鹈鹕测试：没有看到思考，等回复写完后按时间和内容估算…'); }
          if (f.done || !chat.busy) break;
        }
        if (!chat.busy && i > 12) break;
        if (i > 2400) throw Error('等待超过 10 分钟，已停止');
        await sleep(250);
      }
      const f = chat.fmt;
      const est = f && f !== before ? Fmt.est(f, null, true) : null;
      if (!est) throw Error('没有拿到回复，无法计算（可能被验证码或限流拦截）');
      /* 可见内容按约 100 token/秒出字：总耗时扣掉出字时间 = 隐藏的思考时间（只有在没看到真实思考时才用，来源标「估算」） */
      const write = Math.max(0, (f.vis || 0) - (f.rChars || 0) / 3), real = f.rChars > 0 || est.think >= Strength.THINK_MIN;
      const x = { think: est.think, rs: f.rChars / 3, rChars: f.rChars, out: est.out, sec: est.sec, derive: real || !f.done ? 0 : write, live: real };
      const own = Strength.scoreOf(x), mi = Models.get(sid), name = mi && !mi.guess && mi.name ? Strength.canon(mi.name) : '';
      const score = Strength.settle(sid, { ...x, score: own, source: real ? 'pelican' : 'pelican-estimated' }, Strength.priorOf(sid));
      remember(sid, { at: now(), score, think: est.think, thought: own != null, estimated: own != null && !real, name });
      if (score != null && mi) {
        const nx = { ...mi, est: { ...est, score, std: true } };
        if (mi.fingerprint && !mi.fingerprint.skipped) nx.fingerprint = { ...mi.fingerprint, reasoning: { ...mi.fingerprint.reasoning, score } };
        Models.set(sid, nx); try { Bus.emit('model', chat, Models.get(sid)); } catch {}
      }
      if (own != null && real && name) { try { Strength.addSample(name, { k: sid + ':pelican:' + now(), at: now(), out: est.out, rs: Math.round(f.rChars / 3), sec: est.sec, think: est.think, std: true }); } catch {} }
      toast('鹈鹕测试' + (name ? ' · ' + name : '') + ' · 思考 ' + est.think + ' 秒' + (own != null ? ' · 本次' + (real ? '' : '估算 ') + Strength.fmtScore(own) + (score !== own ? ' → 推理分（多次测量取中位数）' + Strength.fmtScore(score) : ' · 推理分 ' + Strength.fmtScore(score)) : score != null ? ' · 本次未思考，推理分仍为 ' + Strength.fmtScore(score) : ' · 未思考，不计分（静默不足 ' + Strength.THINK_MIN + ' 秒、没有思考内容，回复时间也估不出思考）'));
      /* 推理分已经记下了；回复还没写完就等它写完，把写出来的页面自动存成测试图（以前提前停掉，页面写不出来，图就缺了） */
      let shot = null;
      try {
        if (chat.busy) {
          say('鹈鹕测试：推理分已记录，等页面写完自动存图…');
          for (let i = 0; chat.busy && i < 2400; i++) { if (ctl.signal.aborted) { try { await chat.stop(); } catch {} break; } await sleep(250); }
        }
        if (!chat.busy && !ctl.signal.aborted) {
          say('鹈鹕测试：正在核对型号与保存测试图…'); await sleep(350);
          if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.refresh === 'function') {
            try {
              await Promise.race([BillingProbe.refresh(chat, { force: true }), sleep(2600)]);
              if (typeof BillingProbe.applyReverseIdentity === 'function') BillingProbe.applyReverseIdentity(chat, { interactive: false });
            } catch {}
          }
          const latestMi = Models.get(sid);
          const latestName = latestMi && !latestMi.guess && latestMi.name ? Strength.canon(latestMi.name) : name;
          if (latestName && latestName !== name) {
            remember(sid, { at: now(), score, think: est.think, thought: own != null, estimated: own != null && !real, name: latestName });
          }
          shot = await PelicanShots.auto(sid, chat);
          if (shot?.rec) { try { Dock.render(); } catch {} toast('鹈鹕测试图已自动保存 · ' + shot.rec.model + '（模型信息 · 概览 · 鹈鹕测试图）'); }
          else if (shot?.none) toast('鹈鹕测试：' + shot.none);
        } else if (chat.busy) { try { await chat.stop(); } catch {} }
      } catch (e) { toast('测试图保存失败：' + describe(e), 'err'); }
      return { score, think: est.think, name, shot: !!shot?.rec };
    } catch (e) {
      if (chat.busy) try { await chat.stop(); } catch {}
      toast(e?.name === 'AbortError' ? '鹈鹕测试已停止' : '鹈鹕测试失败：' + describe(e), e?.name === 'AbortError' ? undefined : 'err');
      return null;
    } finally { active.delete(chat); chat.probeProgress = ''; try { chat.emit(); } catch {} }
  }
  return { start, isRunning, result, of: result, all, merge, drop };
})();
