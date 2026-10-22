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

  let _activeMenuPop = null;
  let _activeMenuBtn = null;
  let _menuGlobalBound = false;

  function closeMenu() {
    try {
      if (_activeMenuPop) {
        _activeMenuPop.remove();
        _activeMenuPop = null;
      }
      if (_activeMenuBtn) {
        _activeMenuBtn.classList.remove('is-open');
        _activeMenuBtn = null;
      }
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.pel-test-pop').forEach(el => {
          try { el.remove(); } catch {}
        });
        document.querySelectorAll('.pel-test-btn.is-open,.pelbtn.is-open').forEach(el => {
          el.classList.remove('is-open');
        });
      }
    } catch {}
  }

  function ensureMenuBindings() {
    if (_menuGlobalBound || typeof document === 'undefined') return;
    _menuGlobalBound = true;
    document.addEventListener('pointerdown', e => {
      if (!_activeMenuPop) return;
      const t = e.target;
      if (t && (_activeMenuPop.contains(t) || (_activeMenuBtn && _activeMenuBtn.contains(t)))) return;
      closeMenu();
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _activeMenuPop) {
        e.stopPropagation();
        closeMenu();
      }
    }, true);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        if (_activeMenuPop) closeMenu();
      }, { passive: true });
    }
  }

  async function runQuickTest(kind = 'pelican', opts = {}) {
    closeMenu();
    const tab = opts.tab || (typeof Tabs !== 'undefined' ? Tabs.cur : null);
    const chat = opts.chat || (tab?.sid && typeof Chats !== 'undefined' ? Chats.get(tab.sid) : null);
    const curMode = opts.mode || (chat?.isEvaluation ? (chat.evalMode || 'battle') : (typeof ModeState !== 'undefined' && ModeState.getMode ? ModeState.getMode() : 'agent'));

    if (chat && isRunning(chat)) {
      await start(chat);
      return null;
    }
    if (chat && chat.busy) {
      if (chat.isEvaluation && typeof chat.stop === 'function') {
        await chat.stop();
        return null;
      }
      if (typeof toast === 'function') toast('请等待当前回复或任务结束', 'err');
      return null;
    }

    const normKind = String(kind || 'pelican').toLowerCase();
    if ((normKind === 'pelican' || normKind === 'svg') && chat && chat.sid && !chat.isEvaluation) {
      return start(chat);
    }

    let prompt = '';
    if (normKind === 'pelican' || normKind === 'svg') {
      prompt = (typeof GachaPrompts !== 'undefined' && typeof GachaPrompts.svg === 'function')
        ? GachaPrompts.svg()
        : 'Create a new standalone HTML file. Use inline SVG to show a 2D animation of a pelican pedaling a bicycle forward. Keep the scene clean and the movement smooth. Output the completed file directly; do not run tests or checks.';
    } else if (normKind === 'habit' || normKind === 'micro' || normKind === 'probe') {
      prompt = (typeof GachaPrompts !== 'undefined' && typeof GachaPrompts.habit === 'function')
        ? GachaPrompts.habit()
        : '请在工作区创建并保存一个自包含的单文件 `.html` 卡片，内联一个极简 2D 动态 SVG 状态徽章，全文控制在 35～45 行以内，随后用中文分 2～3 条加粗要点总结你的设计与动效实现。';
    } else {
      const ta = (typeof UI !== 'undefined' && UI.els?.composer?.querySelector?.('textarea'))
        || (typeof document !== 'undefined' ? document.querySelector?.('#view .composer textarea') : null);
      const typed = String(ta?.value || '').trim();
      if (typed) {
        prompt = typed;
      } else if (typeof GachaPrompts !== 'undefined' && typeof GachaPrompts.autoqaOne === 'function') {
        prompt = GachaPrompts.autoqaOne(1);
      } else {
        prompt = '请无需调用任何工具，直接用中文分 2 条简短加粗要点说明如果为卡片组件增加深色模式，你会如何调整配色与对比度（80 字以内）？';
      }
    }

    if (typeof UI !== 'undefined' && typeof UI.sendQuickTestPrompt === 'function') {
      return UI.sendQuickTestPrompt(prompt, { tab, chat, kind: normKind, mode: curMode });
    }
    if (chat && chat.sid && typeof chat.send === 'function') {
      if (normKind === 'habit' || normKind === 'micro' || normKind === 'probe') chat._isMicroProbe = true;
      if (normKind === 'pelican' || normKind === 'svg') chat._isPelicanTest = true;
      await chat.send(prompt, []);
      return { ok: true, kind: normKind, prompt, chat };
    }
    if (typeof createChat === 'function') {
      const created = await createChat(prompt, {
        ...(curMode === 'battle' || curMode === 'direct' ? { evalMode: curMode } : {}),
      });
      if (created) {
        if (normKind === 'habit' || normKind === 'micro' || normKind === 'probe') created._isMicroProbe = true;
        if (normKind === 'pelican' || normKind === 'svg') created._isPelicanTest = true;
      }
      return { ok: true, kind: normKind, prompt, chat: created };
    }
    return null;
  }

  function openMenu(anchorBtn, opts = {}) {
    const chat = opts.chat || (opts.tab?.sid && typeof Chats !== 'undefined' ? Chats.get(opts.tab.sid) : null);
    if (chat && (isRunning(chat) || (chat.isEvaluation && chat.busy))) {
      void runQuickTest('pelican', opts);
      return null;
    }
    if (_activeMenuBtn === anchorBtn && _activeMenuPop) {
      closeMenu();
      return null;
    }
    closeMenu();
    try { if (typeof ModeSwitcher !== 'undefined' && ModeSwitcher.closeAllPops) ModeSwitcher.closeAllPops(); } catch {}
    ensureMenuBindings();

    const makeIcon = name => {
      try {
        if (typeof icon === 'function') return icon(name);
      } catch {}
      const span = document.createElement('span');
      span.textContent = name === 'pelican' ? '🦩' : name === 'fingerprint' ? '🧬' : '⚡';
      return span;
    };

    const items = [
      {
        kind: 'pelican',
        title: '鹈鹕测试',
        sub: '发送英文 2D 鹈鹕骑车动态 SVG 标准题，测试动画与思考强度',
        ico: 'pelican',
      },
      {
        kind: 'habit',
        title: '微缩探针测试',
        sub: '发送 35～45 行 HTML+SVG 微缩徽章探针，单轮点亮 20 维习惯特征',
        ico: 'fingerprint',
      },
      {
        kind: 'text',
        title: '快速发送文字进行测试',
        sub: '无需工具调用，快速发送短文字测试题对比响应速度与行文习惯',
        ico: 'send',
      },
    ];

    const pop = document.createElement('div');
    pop.className = 'mode-pop pel-test-pop menu';
    pop.setAttribute('data-ks', '');
    pop.setAttribute('role', 'menu');
    pop.setAttribute('aria-label', '快速测试菜单');
    pop.onclick = e => e.stopPropagation();

    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mode-pop-item pel-test-item';
      btn.setAttribute('data-test-kind', item.kind);
      btn.onclick = e => {
        e.stopPropagation();
        void runQuickTest(item.kind, opts);
      };
      const icoWrap = document.createElement('span');
      icoWrap.className = 'mode-pop-ico';
      icoWrap.appendChild(makeIcon(item.ico));

      const txtWrap = document.createElement('span');
      txtWrap.className = 'mode-pop-txt';
      const titleEl = document.createElement('span');
      titleEl.className = 'mode-pop-title';
      titleEl.textContent = item.title;
      const subEl = document.createElement('span');
      subEl.className = 'mode-pop-sub';
      subEl.textContent = item.sub;
      txtWrap.appendChild(titleEl);
      txtWrap.appendChild(subEl);

      btn.appendChild(icoWrap);
      btn.appendChild(txtWrap);
      pop.appendChild(btn);
    }

    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(pop);
    }
    if (anchorBtn?.classList) anchorBtn.classList.add('is-open');
    _activeMenuPop = pop;
    _activeMenuBtn = anchorBtn;

    try {
      if (anchorBtn && typeof anchorBtn.getBoundingClientRect === 'function') {
        const rect = anchorBtn.getBoundingClientRect();
        const vw = (typeof window !== 'undefined' && window.innerWidth) || 1024;
        const vh = (typeof window !== 'undefined' && window.innerHeight) || 768;
        const popRect = pop.getBoundingClientRect?.() || { width: 280, height: 180 };
        const pw = popRect.width || 280;
        const ph = popRect.height || 180;
        let left = Math.round(rect.right - pw);
        if (left + pw > vw - 10) left = Math.max(10, vw - pw - 10);
        if (left < 10) left = 10;
        let top = Math.round(rect.bottom + 8);
        if (top + ph > vh - 10 && rect.top - ph - 8 >= 10) {
          top = Math.round(rect.top - ph - 8);
        }
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
      }
    } catch {}
    return pop;
  }

  return { start, isRunning, result, of: result, all, merge, drop, openMenu, closeMenu, runQuickTest };
})();
