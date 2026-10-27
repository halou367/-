// Native automatic human verification solver (reCAPTCHA Enterprise/v2 & Cloudflare Turnstile)
(function () {
  try {
    if (window.__AF_CAPTCHA_SOLVER_ACTIVE) return;
    if (window.__fixture || window.__routeFixture) return;
    window.__AF_CAPTCHA_SOLVER_ACTIVE = true;
    window.__mcpCaptchaSolverV19Loaded = true;
    try {
      if (document.documentElement) document.documentElement.dataset.branaCaptchaSolver = '1';
    } catch {}

    const WIT_KEYS = ['JVHWCNWJLWLGN6MFALYLHAPKUFHMNTAC'];
    const href = String(location.href || '');
    const isInvisibleAnchor = /[?&]size=invisible\b/i.test(href);
    const isAnchor = !isInvisibleAnchor && /google\.com\/recaptcha\/(?:api2|enterprise)\/anchor|recaptcha\.net\/recaptcha\/(?:api2|enterprise)\/anchor/i.test(href);
    const isBframe = /google\.com\/recaptcha\/(?:api2|enterprise)\/bframe|recaptcha\.net\/recaptcha\/(?:api2|enterprise)\/bframe/i.test(href);
    const isTurnstile = /challenges\.cloudflare\.com/i.test(href);
    const isTop = (window === window.top);

    try {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      document.hasFocus = () => true;
      window.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
    } catch {}

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    function isVisible(el) {
      if (!el || !el.isConnected) return false;
      const st = window.getComputedStyle(el);
      if (!st || st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    }

    function humanClick(el, directFocusClick = false) {
      if (!el) return false;
      try {
        const rect = el.getBoundingClientRect();
        const clientX = Math.round(rect.left + (rect.width ? rect.width * (0.35 + Math.random() * 0.3) : 10));
        const clientY = Math.round(rect.top + (rect.height ? rect.height * (0.35 + Math.random() * 0.3) : 10));
        const opts = { view: window, bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: 1 };
        if (typeof PointerEvent === 'function') {
          for (const pt of ['pointerover', 'pointerenter', 'pointermove', 'pointerdown']) {
            try { el.dispatchEvent(new PointerEvent(pt, { ...opts, pointerId: 1, pointerType: 'mouse', isPrimary: true })); } catch {}
          }
        }
        for (const t of ['mouseover', 'mouseenter', 'mousemove', 'mousedown']) {
          el.dispatchEvent(new MouseEvent(t, opts));
        }
        try { el.focus?.(); } catch {}
        if (typeof PointerEvent === 'function') {
          try { el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 })); } catch {}
        }
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        if (directFocusClick) {
          el.click();
        } else {
          el.dispatchEvent(new MouseEvent('click', opts));
          try { el.click(); } catch {}
        }
        return true;
      } catch {
        try { el.click(); return true; } catch { return false; }
      }
    }

    async function humanTypeClosureSafe(inputEl, text) {
      if (!inputEl) return false;
      const clean = String(text || '').trim();
      if (!clean) return false;
      try {
        inputEl.disabled = false;
        inputEl.removeAttribute('disabled');
        inputEl.classList.remove('label-input-label-disabled', 'label-input-label');
      } catch {}
      try { inputEl.focus(); } catch {}
      try { inputEl.dispatchEvent(new FocusEvent('focus', { bubbles: true })); } catch {}
      const proto = window.HTMLInputElement ? window.HTMLInputElement.prototype : null;
      const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
      const setVal = v => {
        if (setter) setter.call(inputEl, v);
        else inputEl.value = v;
      };
      setVal('');
      try { inputEl.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      let cur = '';
      for (const ch of clean) {
        cur += ch;
        const code = ch.toUpperCase().charCodeAt(0);
        const kOpts = { key: ch, code: 'Key' + ch.toUpperCase(), keyCode: code, which: code, bubbles: true, cancelable: true };
        try { inputEl.dispatchEvent(new KeyboardEvent('keydown', kOpts)); } catch {}
        try { inputEl.dispatchEvent(new KeyboardEvent('keypress', kOpts)); } catch {}
        setVal(cur);
        try { inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' })); } catch {
          try { inputEl.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
        }
        try { inputEl.dispatchEvent(new KeyboardEvent('keyup', kOpts)); } catch {}
        await sleep(rand(6, 15));
      }
      try { inputEl.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
      return true;
    }

    async function solveViaAndroidBridge(audioUrl) {
      const A = window.BranaAndroid;
      if (!A || typeof A.solveCaptchaAudioStart !== 'function' || typeof A.probeGet !== 'function') return null;
      try {
        const id = A.solveCaptchaAudioStart(String(audioUrl || ''));
        if (!id) return null;
        for (let i = 0; i < 160; i++) {
          await sleep(i < 10 ? 45 : 75);
          const raw = A.probeGet(id);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.ok && parsed.text) return parsed;
            return parsed || { ok: false, error: 'Android bridge returned empty' };
          }
        }
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
      return { ok: false, error: 'Android bridge timeout' };
    }

    function cleanLegacyOverlays() {
      try {
        for (const id of ['__mcp_buster_overlay', '__mcp_user_action_banner', '__mcp_top_captcha_banner']) {
          const el = document.getElementById(id);
          if (el) el.remove();
        }
      } catch {}
    }

    function reportStatus(text, state = 'running', autoHideMs = 0) {
      try {
        window.top.postMessage({
          __af_captcha_status: true,
          text: String(text || ''),
          state,
          isError: state === 'error',
          autoHideMs: +autoHideMs || 0,
        }, '*');
      } catch {}
    }

    if (isTop) {
      let hideTimer = 0;
      const ensureStyle = () => {
        if (document.getElementById('brana-cap-style')) return;
        const st = document.createElement('style');
        st.id = 'brana-cap-style';
        st.textContent = `
          @keyframes branaCapSpin { to { transform: rotate(360deg); } }
          #af-captcha-banner {
            position: fixed; top: 44px; right: 16px; z-index: 2147483646;
            display: none; align-items: center; gap: 8px;
            padding: 7px 13px; border-radius: 10px;
            background: var(--bg-elev, rgba(28, 30, 36, 0.94));
            color: var(--fg, #eceef4);
            border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
            font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
            pointer-events: none; transition: opacity 0.2s ease, transform 0.2s ease;
            backdrop-filter: blur(8px);
          }
          #af-captcha-banner .bc-dot {
            width: 11px; height: 11px; flex: 0 0 11px; border-radius: 50%;
            border: 1.8px solid currentColor; border-right-color: transparent;
            animation: branaCapSpin 0.75s linear infinite; opacity: 0.85;
          }
          #af-captcha-banner[data-state="done"] .bc-dot {
            border: 0; background: #22c55e; animation: none; width: 7px; height: 7px; flex-basis: 7px;
          }
          #af-captcha-banner[data-state="error"] .bc-dot {
            border: 0; background: #ef4444; animation: none; width: 7px; height: 7px; flex-basis: 7px;
          }
        `;
        (document.head || document.documentElement).appendChild(st);
      };

      const updateTopUi = (text, state = 'running', autoHideMs = 0) => {
        cleanLegacyOverlays();
        const hasModal = Boolean(document.querySelector('.rc-modal'));
        try {
          const rcWhy = document.querySelector('.rc-modal .rc-why');
          if (rcWhy && text) rcWhy.textContent = text;
          const rcSt = document.querySelector('.rc-modal .rc-st');
          if (rcSt) {
            rcSt.textContent = text;
            rcSt.style.color = state === 'error' ? 'var(--danger, #f87171)' : state === 'done' ? '#22c55e' : 'var(--muted, #94a3b8)';
          }
          const rcBarSpan = document.querySelector('.rc-bar span');
          if (rcBarSpan && text) rcBarSpan.textContent = text;
        } catch {}
        try {
          if (!document.body) return;
          ensureStyle();
          let banner = document.getElementById('af-captcha-banner');
          if (hasModal) {
            if (banner) banner.style.display = 'none';
            return;
          }
          if (!banner) {
            banner = document.createElement('div');
            banner.id = 'af-captcha-banner';
            banner.setAttribute('data-anc-boot', '1');
            banner.innerHTML = '<i class="bc-dot"></i><span class="bc-txt"></span>';
            document.body.appendChild(banner);
          }
          banner.dataset.state = state;
          const txtEl = banner.querySelector('.bc-txt');
          if (txtEl) txtEl.textContent = text;
          banner.style.display = 'inline-flex';
          banner.style.opacity = '1';
          clearTimeout(hideTimer);
          const delay = autoHideMs > 0 ? autoHideMs : (state === 'done' ? 1800 : state === 'error' ? 4500 : 9000);
          hideTimer = setTimeout(() => {
            try {
              banner.style.opacity = '0';
              setTimeout(() => { if (banner.style.opacity === '0') banner.style.display = 'none'; }, 220);
            } catch {}
          }, delay);
        } catch {}
      };

      window.addEventListener('message', async e => {
        const d = e?.data;
        if (!d || typeof d !== 'object') return;
        if (d.__af_captcha_status && typeof d.text === 'string') {
          updateTopUi(d.text, d.state || (d.isError ? 'error' : 'running'), d.autoHideMs || 0);
          return;
        }
        if (d.__mcp === true && d.type === 'mcp-captcha-status') {
          cleanLegacyOverlays();
          const st = d.status === 'submitted' ? 'done' : d.status === 'expired' ? 'error' : 'running';
          const msg = d.status === 'submitted' ? '人机验证已完成' : '人机验证进行中…';
          updateTopUi(msg, st, st === 'done' ? 1800 : 0);
          return;
        }
        if (d.__af_captcha_rpc === 'AF_SOLVE_AUDIO_CAPTCHA' && d.reqId && d.audioUrl) {
          let res = { ok: false, error: 'Host unavailable' };
          try {
            if (window.BranaHost && typeof window.BranaHost.solveCaptchaAudio === 'function') {
              res = await window.BranaHost.solveCaptchaAudio(d.audioUrl);
            } else {
              const aRes = await solveViaAndroidBridge(d.audioUrl);
              if (aRes) res = aRes;
            }
          } catch (err) {
            res = { ok: false, error: String(err?.message || err) };
          }
          try {
            e.source?.postMessage({ __af_captcha_res: 'AF_SOLVE_AUDIO_CAPTCHA', reqId: d.reqId, response: res }, '*');
          } catch {}
        }
      });

      setInterval(() => {
        cleanLegacyOverlays();
        try {
          if (window.turnstile && typeof window.turnstile.getResponse === 'function') {
            const resp = window.turnstile.getResponse();
            if (!resp) {
              const container = document.querySelector('.cf-turnstile, [data-sitekey]');
              if (container) {
                try { window.turnstile.execute(container); } catch {}
              }
            }
          }
        } catch {}
        try {
          const frames = document.querySelectorAll('iframe[src*="recaptcha"][src*="bframe"]');
          for (const f of frames) {
            const r = f.getBoundingClientRect();
            if (r.width >= 60 && r.height >= 60 && r.top > -120 && r.left > -120) {
              const st = window.getComputedStyle(f);
              if (st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.1) {
                f.contentWindow?.postMessage({ __af_bframe_vis: true, __mcp: true, type: 'mcp-bframe-visibility', visible: true, gachaRunning: true }, '*');
              }
            }
          }
        } catch {}
      }, 280);
    }

    if (isAnchor) {
      let clicked = false;
      let clickAt = 0;
      let solvedReported = false;
      const tickAnchor = () => {
        if (window.innerWidth < 24 || window.innerHeight < 16) return;
        const anchor = document.querySelector('#recaptcha-anchor');
        if (!anchor) return;
        const checked = anchor.getAttribute('aria-checked') === 'true' || anchor.classList.contains('recaptcha-checkbox-checked');
        if (checked) {
          if (!solvedReported) {
            solvedReported = true;
            reportStatus('人机验证已完成', 'done', 1800);
          }
          return;
        }
        const isLoading = anchor.classList.contains('recaptcha-checkbox-loading');
        if (!isLoading && (!clicked || Date.now() - clickAt > 2800)) {
          const border = document.querySelector('.recaptcha-checkbox-border') || anchor;
          if (!isVisible(border)) return;
          clicked = true;
          clickAt = Date.now();
          reportStatus('人机验证进行中…', 'running');
          setTimeout(() => {
            if (anchor.getAttribute('aria-checked') === 'true') return;
            humanClick(border, false);
          }, rand(35, 80));
        }
      };
      setInterval(tickAnchor, 160);
      setTimeout(tickAnchor, 40);
      try {
        const mo = new MutationObserver(() => tickAnchor());
        mo.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-checked', 'style'] });
      } catch {}
    }

    if (isBframe) {
      let parentConfirmedVisUntil = 0;
      const pendingRpc = new Map();
      window.addEventListener('message', e => {
        const d = e?.data;
        if (!d || typeof d !== 'object') return;
        if (d.__af_bframe_vis || (d.__mcp && d.type === 'mcp-bframe-visibility' && d.visible)) {
          parentConfirmedVisUntil = Date.now() + 2500;
        }
        if (d.__af_captcha_res === 'AF_SOLVE_AUDIO_CAPTCHA' && d.reqId && pendingRpc.has(d.reqId)) {
          const resolve = pendingRpc.get(d.reqId);
          pendingRpc.delete(d.reqId);
          resolve(d.response);
        }
      });

      const transcribeDirectInFrame = async audioUrl => {
        try {
          const audioResp = await fetch(audioUrl, { credentials: 'omit', cache: 'no-store' });
          if (!audioResp.ok) return { ok: false, error: 'HTTP ' + audioResp.status };
          const buf = await audioResp.arrayBuffer();
          for (const token of WIT_KEYS) {
            const witResp = await fetch('https://api.wit.ai/speech?v=20220622', {
              method: 'POST',
              headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'audio/mpeg3',
              },
              body: buf,
            });
            if (witResp.ok) {
              const raw = await witResp.text();
              const matches = [...raw.matchAll(/"_?text"\s*:\s*"([^"]*)"/g)].map(m => m[1].trim()).filter(Boolean);
              const best = matches.length ? matches[matches.length - 1] : '';
              const cleaned = best.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
              if (cleaned) return { ok: true, text: cleaned };
            }
          }
        } catch (err) {
          return { ok: false, error: String(err?.message || err) };
        }
        return { ok: false, error: '未识别出语音内容' };
      };

      const askTopSolveAudio = async audioUrl => {
        const directBridge = await solveViaAndroidBridge(audioUrl);
        if (directBridge && directBridge.ok && directBridge.text) return directBridge;
        const hostRes = await new Promise(resolve => {
          const reqId = 'af_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
          const tm = setTimeout(() => {
            if (pendingRpc.has(reqId)) {
              pendingRpc.delete(reqId);
              resolve({ ok: false, error: 'timeout' });
            }
          }, 9500);
          pendingRpc.set(reqId, res => { clearTimeout(tm); resolve(res); });
          try {
            window.top.postMessage({ __af_captcha_rpc: 'AF_SOLVE_AUDIO_CAPTCHA', reqId, audioUrl }, '*');
          } catch (err) {
            clearTimeout(tm);
            pendingRpc.delete(reqId);
            resolve({ ok: false, error: String(err?.message || err) });
          }
        });
        if (hostRes && hostRes.ok && hostRes.text) return hostRes;
        return transcribeDirectInFrame(audioUrl);
      };

      const updateBframeBar = (text, state = 'running') => {
        cleanLegacyOverlays();
        try {
          let bar = document.getElementById('brana-bframe-status');
          if (!bar) {
            bar = document.createElement('div');
            bar.id = 'brana-bframe-status';
            bar.style.cssText = 'position:fixed;top:3px;left:6px;right:6px;z-index:2147483647;display:flex;align-items:center;gap:6px;padding:3px 9px;border-radius:6px;font:500 11px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:rgba(28,30,36,0.92);color:#eceef4;border:1px solid rgba(255,255,255,0.14);box-shadow:0 2px 8px rgba(0,0,0,0.18);pointer-events:none;';
            const dot = document.createElement('i');
            dot.id = 'brana-bframe-dot';
            dot.style.cssText = 'width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:#3b82f6;';
            const sp = document.createElement('span');
            sp.id = 'brana-bframe-txt';
            sp.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
            bar.appendChild(dot);
            bar.appendChild(sp);
            document.documentElement.appendChild(bar);
          }
          const txtEl = document.getElementById('brana-bframe-txt');
          const dotEl = document.getElementById('brana-bframe-dot');
          if (txtEl) txtEl.textContent = text;
          if (dotEl) dotEl.style.background = state === 'error' ? '#ef4444' : state === 'done' ? '#22c55e' : '#3b82f6';
        } catch {}
      };

      let solving = false;
      let lastAudioUrl = '';
      let lastAudioBtnClickAt = 0;
      let lastReloadClickAt = 0;
      let disabledStuckSince = 0;
      let attempts = 0;

      const isChallengeReady = () => {
        if (window.innerWidth < 60 || window.innerHeight < 60) return false;
        if (Date.now() < parentConfirmedVisUntil) return true;
        const activeChallengeEl = document.querySelector('#rc-imageselect, .rc-imageselect-payload, #audio-response, .rc-audiochallenge-play-button, .rc-doscaptcha-header-text, #recaptcha-audio-button');
        return isVisible(activeChallengeEl);
      };

      const stepBframe = async () => {
        cleanLegacyOverlays();
        if (solving) return;
        if (!isChallengeReady()) return;

        const errEl = document.querySelector('.rc-doscaptcha-header-text, .rc-doscaptcha-body-text');
        if (errEl && isVisible(errEl) && /Try again later|automated queries|稍后再试|自动查询/i.test(errEl.textContent || '')) {
          const imgBtn = document.querySelector('#recaptcha-image-button');
          if (imgBtn && isVisible(imgBtn)) humanClick(imgBtn, true);
          updateBframeBar('语音通道受限，已切回图形验证', 'error');
          reportStatus('语音通道受限，请点选图形或点「换线路」', 'error', 6000);
          return;
        }

        const audioBtn = document.querySelector('#recaptcha-audio-button');
        const audioInput = document.querySelector('#audio-response');
        const verifyBtn = document.querySelector('#recaptcha-verify-button');
        const reloadBtn = document.querySelector('#recaptcha-reload-button');

        if (audioInput && verifyBtn && reloadBtn && audioInput.disabled && verifyBtn.disabled && reloadBtn.disabled) {
          if (!disabledStuckSince) disabledStuckSince = Date.now();
          else if (Date.now() - disabledStuckSince > 2200) {
            disabledStuckSince = 0;
            updateBframeBar('验证已过期，正在自动重置…', 'running');
            reportStatus('验证已过期，正在自动重置…', 'running');
            try { window.top.postMessage({ __af_captcha_expired: true, __mcp: true, type: 'mcp-captcha-status', status: 'expired' }, '*'); } catch {}
          }
          return;
        } else {
          disabledStuckSince = 0;
        }

        solving = true;
        try {
          if (audioBtn && isVisible(audioBtn) && (!audioInput || !isVisible(audioInput))) {
            if (Date.now() - lastAudioBtnClickAt >= 1500) {
              lastAudioBtnClickAt = Date.now();
              updateBframeBar('人机验证进行中 · 正在切换语音验证…', 'running');
              reportStatus('人机验证进行中 · 正在切换语音验证…', 'running');
              await sleep(rand(40, 90));
              humanClick(audioBtn, true);
            }
            return;
          }

          const audioSrcEl = document.querySelector('#audio-source');
          const dlLink = document.querySelector('.rc-audiochallenge-tdownload-link');
          const src = (audioSrcEl && audioSrcEl.src) || (dlLink && dlLink.href) || '';
          if (!src || !audioInput || !isVisible(audioInput)) return;

          if (src === lastAudioUrl) {
            const multiErr = document.querySelector('.rc-audiochallenge-error-message');
            if (multiErr && isVisible(multiErr) && (multiErr.textContent || '').trim() && reloadBtn && isVisible(reloadBtn) && Date.now() - lastReloadClickAt >= 1800) {
              lastReloadClickAt = Date.now();
              updateBframeBar('人机验证进行中 · 正在刷新语音…', 'running');
              await sleep(rand(80, 160));
              humanClick(reloadBtn, true);
            }
            return;
          }

          lastAudioUrl = src;
          attempts++;
          updateBframeBar('人机验证进行中 · 正在识别语音…', 'running');
          reportStatus('人机验证进行中 · 正在识别语音…', 'running');

          const solvePromise = askTopSolveAudio(src);
          try {
            const playBtn = document.querySelector('.rc-audiochallenge-play-button button, button[aria-labelledby*="audio-instructions"]');
            if (playBtn && isVisible(playBtn)) humanClick(playBtn, true);
            if (audioSrcEl) {
              audioSrcEl.volume = 0.01;
              for (const evName of ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'play', 'playing', 'timeupdate', 'ended']) {
                audioSrcEl.dispatchEvent(new Event(evName));
              }
            }
          } catch {}

          const res = await solvePromise;
          if (res && res.ok && res.text) {
            updateBframeBar('人机验证进行中 · 正在提交验证…', 'running');
            reportStatus('人机验证进行中 · 正在提交验证…', 'running');
            await humanTypeClosureSafe(audioInput, res.text);
            await sleep(rand(45, 95));
            if (verifyBtn && isVisible(verifyBtn)) {
              verifyBtn.disabled = false;
              verifyBtn.removeAttribute('disabled');
              verifyBtn.classList.remove('rc-button-default-disabled');
              humanClick(verifyBtn, true);
              updateBframeBar('验证已提交，正在确认…', 'done');
              reportStatus('人机验证已完成', 'done', 2200);
            }
          } else {
            updateBframeBar('人机验证进行中 · 正在重试语音识别…', 'running');
            reportStatus('人机验证进行中 · 正在重试语音识别…', 'running');
            if (reloadBtn && isVisible(reloadBtn) && Date.now() - lastReloadClickAt >= 1800) {
              lastReloadClickAt = Date.now();
              reloadBtn.disabled = false;
              reloadBtn.classList.remove('rc-button-disabled');
              await sleep(rand(100, 220));
              humanClick(reloadBtn, true);
            }
          }
        } finally {
          solving = false;
        }
      };

      setInterval(stepBframe, 180);
      setTimeout(stepBframe, 50);
      try {
        const mo = new MutationObserver(() => stepBframe());
        mo.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'class', 'style', 'disabled'] });
      } catch {}
    }

    if (isTurnstile) {
      let lastCfClickAt = 0;
      const tickTurnstile = () => {
        if (Date.now() - lastCfClickAt < 2200) return;
        const box = document.querySelector('input[type="checkbox"], .cb-lb input, .ctp-checkbox-label input, label.cb-lb, .ctp-checkbox-label, #challenge-stage input, .cb-i');
        if (box && isVisible(box) && !box.checked) {
          lastCfClickAt = Date.now();
          reportStatus('人机验证进行中…', 'running');
          setTimeout(() => {
            humanClick(box, false);
          }, rand(45, 95));
        }
      };
      setInterval(tickTurnstile, 180);
      setTimeout(tickTurnstile, 50);
      try {
        const mo = new MutationObserver(() => tickTurnstile());
        mo.observe(document.documentElement || document, { childList: true, subtree: true });
      } catch {}
    }
  } catch {}
})();
