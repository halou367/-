// Electron can leave loadURL's promise pending when its renderer exits mid-navigation.
// Bind the acknowledgement to the renderer/window lifetime so a single-flight retry cannot deadlock.
function loadURLAlive(wc, url, timeout = 45000, { forceReload = false } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false, timer;
    const error = code => Object.assign(Error(code), { code });
    const finish = e => {
      if (settled) return; settled = true; clearTimeout(timer);
      wc.removeListener('render-process-gone', gone); wc.removeListener('destroyed', destroyed);
      wc.removeListener('did-finish-load', loaded);wc.removeListener('did-fail-load', failed);
      if (e) reject(e); else resolve();
    };
    const gone = () => finish(error('ERR_RENDER_PROCESS_GONE'));
    const destroyed = () => finish(error('ERR_WEB_CONTENTS_DESTROYED'));
    const loaded=()=>finish();
    const failed=(_event,code,description,_url,isMain)=>{if(isMain)finish(Object.assign(Error(description||String(code)),{code:description||code,errno:code}));};
    if (wc.isDestroyed()) { destroyed(); return; }
    wc.once('render-process-gone', gone); wc.once('destroyed', destroyed);
    timer = setTimeout(() => {
      finish(error('ERR_NAVIGATION_TIMEOUT'));
      try { if (!wc.isDestroyed()) wc.stop(); } catch {}
    }, timeout);
    timer.unref?.();
    try {
      if(forceReload&&wc.getURL?.()===url&&typeof wc.reloadIgnoringCache==='function'){wc.once('did-finish-load',loaded);wc.on('did-fail-load',failed);wc.reloadIgnoringCache();}
      else Promise.resolve(wc.loadURL(url)).then(() => finish(), finish);
    }
    catch (e) { finish(e); }
  });
}
module.exports = { loadURLAlive };

// Electron may report one failed load both as an event and as a rejected loadURL promise.
// Only one owner may show an offline page / schedule an OAuth retry for that navigation.
function createFailureOwner({ now = Date.now, duplicateMs = 2000 } = {}) {
  let active = null, next = 0, recent = null;
  const aborted = x => [-3, 'ERR_ABORTED', 'ERR_RENDER_PROCESS_GONE', 'ERR_WEB_CONTENTS_DESTROYED'].includes(x?.code);
  const remember = (failure, aliases = []) => { recent = { at: now(), urls: new Set([...aliases, failure.url].filter(Boolean)) }; return failure; };
  return {
    begin(url) { recent = null; active = { id: ++next, target: url, urls: new Set([url]), failure: null, handled: false }; return active.id; },
    redirect(url) { if (active && url) active.urls.add(url); },
    started(url) { if (!active && /^https?:/.test(url || '')) recent = null; },
    event(failure) {
      if (aborted(failure)) return null;
      if (active) {
        if (!failure.url || active.urls.has(failure.url)) active.failure = failure;
        return null; // Stale/in-flight event must not race the promise's failure handler.
      }
      if (recent && now() - recent.at < duplicateMs && recent.urls.has(failure.url)) return null;
      return remember(failure);
    },
    rejected(id, error) {
      if (!active || active.id !== id || active.handled || aborted(error)) return null;
      active.handled = true;
      return remember(active.failure || { url: active.target, code: error?.code || 'CONNECT', desc: String(error?.message || '连接失败').replace(/https?:\/\/[^\s'"<>]+/g, '[链接已隐藏]') }, active.urls);
    },
    end(id) { if (active?.id === id) active = null; },
  };
}
const safeNavigationURL = value => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? u.origin : ''; } catch { return ''; } };
module.exports.createFailureOwner = createFailureOwner;
module.exports.safeNavigationURL = safeNavigationURL;

// Full targets stay in main-process memory; only origins are sent to diagnostics.
function createRetryTarget(home) {
  let target = home;
  return {
    remember(value) { try { const u=new URL(value); if (['https:','http:','chrome-extension:'].includes(u.protocol)) target=u.href; } catch {} },
    get() { return target; },
  };
}
module.exports.createRetryTarget = createRetryTarget;
