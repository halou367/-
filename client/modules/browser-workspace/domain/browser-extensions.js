'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const extract = require('extract-zip');
const MAX_ARCHIVE = 64 * 1024 * 1024, MAX_EXPANDED = 256 * 1024 * 1024;
function archivePayload(buffer) {
  if (buffer.length > MAX_ARCHIVE) throw Error('扩展安装包超过 64 MiB');
  if (buffer.subarray(0, 4).toString() !== 'Cr24') return buffer;
  if(buffer.length<8)throw Error('CRX 安装包不完整');
  const version = buffer.readUInt32LE(4);
  let offset;
  if (version === 2 && buffer.length >= 16) offset = 16 + buffer.readUInt32LE(8) + buffer.readUInt32LE(12);
  else if (version === 3 && buffer.length >= 12) offset = 12 + buffer.readUInt32LE(8);
  else throw Error('不支持的 CRX 格式');
  if (offset >= buffer.length) throw Error('CRX 安装包不完整');
  // Local packages are explicitly approved by the user; this does not verify a Web Store signature.
  return buffer.subarray(offset);
}
const _manifestCache = new Map();
async function manifest(folder) {
  const file = path.join(folder, 'manifest.json'), st = await fs.stat(file);
  if (!st.isFile() || st.size > 1024 * 1024) throw Error('扩展 manifest.json 无效');
  const sig = `${st.mtimeMs}:${st.size}`, hit = _manifestCache.get(file);
  if (hit && hit.sig === sig) return hit.m;
  const m = JSON.parse(await fs.readFile(file, 'utf8'));
  if (![2, 3].includes(m.manifest_version) || typeof m.name !== 'string' || typeof m.version !== 'string') throw Error('扩展清单缺少有效名称、版本或 manifest_version');
  _manifestCache.set(file, { sig, m });
  if (_manifestCache.size > 128) _manifestCache.delete(_manifestCache.keys().next().value);
  return m;
}
function createExtensions({ root, sessionFor, storage, compat }) {
  const api=ses=>ses.extensions&&typeof ses.extensions.loadExtension==='function'?ses.extensions:ses;
  // One registry; website sessions stay separate while extension local storage is mirrored globally.
  const sessions = new Map(), errors = new Map(), attached = new Set(), iconCache = new Map();
  const directory = id => { if (!/^[\w-]{1,80}$/.test(id)) throw Error('账号标识无效'); return path.join(root, id); };
  const shared = directory('shared');
  let statePromise, queue = Promise.resolve(), mutating = 0;
  const loaded = (id, e) => api(sessions.get(id)).getAllExtensions().find(x => path.resolve(x.path) === path.resolve(e.path));
  async function readRegistry(file) {
    const rows = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(rows) || rows.length > 100 || rows.some(e => !e || !/^[a-f0-9-]{36}$/.test(e.key) || typeof e.path !== 'string' || !path.isAbsolute(e.path))) throw Error('扩展记录无效');
    return rows.map(e => ({key:e.key,path:e.path,enabled:e.enabled===true,owned:e.owned===true,pinned:e.pinned===true}));
  }
  async function persist(s) {
    await fs.mkdir(shared, { recursive:true });
    const file = path.join(shared, 'registry.json'), tmp = file + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(s.entries, null, 2)); await fs.rename(tmp, file);
  }
  function state() {
    if (!statePromise) statePromise = (async () => {
      const s = {entries:[], error:''};
      try {
        try { s.entries = await readRegistry(path.join(shared, 'registry.json')); return s; }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
        // Import all legacy accounts once, including accounts not currently open.
        let dirs = []; try { dirs = await fs.readdir(root, {withFileTypes:true}); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const entries = [];
        for (const dir of dirs.sort((a,b) => a.name.localeCompare(b.name))) {
          if (!dir.isDirectory() || dir.name === 'shared' || !/^[\w-]{1,80}$/.test(dir.name)) continue;
          let rows; try { rows = await readRegistry(path.join(directory(dir.name), 'registry.json')); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
          for (const e of rows) {
            const existing = entries.find(x => path.resolve(x.path) === path.resolve(e.path));
            if (existing) { existing.enabled ||= e.enabled; existing.pinned ||= e.pinned; continue; }
            if (entries.some(x => x.key === e.key)) e.key = crypto.randomUUID();
            entries.push(e);
          }
        }
        if (entries.length > 100) throw Error('旧账号扩展合计超过 100 个，请先整理旧记录');
        s.entries = entries; await persist(s); // Keep legacy files as a backup; the shared registry is authoritative.
      } catch (e) { s.entries = []; s.error = '扩展记录无法读取或迁移：' + e.message; }
      return s;
    })();
    return statePromise;
  }
  async function load(id, e) {
    const ext = await api(sessions.get(id)).loadExtension(e.path, {allowFileAccess:false});
    if (path.resolve(ext.path) !== path.resolve(e.path)) throw Error('相同 ID 的扩展已经安装，请先移除旧版本');
    try { await syncStorage(id,e,ext); } catch(error) { api(sessions.get(id)).removeExtension(ext.id);throw error; }
    return ext;
  }
  async function syncStorage(id,e,ext){if(!storage)return;const m=await manifest(e.path);if(m.permissions?.includes('storage'))await storage.attach(id,sessions.get(id),ext);}
  async function unload(id, e) { const ext = loaded(id,e); if (ext) { await storage?.detach(id,ext.id); compat?.clear(id,ext.id); api(sessions.get(id)).removeExtension(ext.id); } }
  async function attach(id, s) {
    directory(id);
    if (sessions.has(id)) return;
    const ses=sessionFor(id);compat?.prepareSession(id,ses);sessions.set(id,ses);errors.set(id,new Map());
    await Promise.all(s.entries.filter(e => e.enabled).map(async e => {
      try { const ext=loaded(id,e);if(ext)await syncStorage(id,e,ext);else await load(id,e); } catch (error) { errors.get(id).set(e.key,error.message); }
    }));
    attached.add(id);
  }
  function serial(id, fn, isMutation = false) {
    if (isMutation) mutating++;
    const job = queue.catch(() => {}).then(async () => { const s = await state(); await attach(id,s); return fn(s); }).finally(() => { if (isMutation) mutating = Math.max(0, mutating - 1); });
    queue = job; return job;
  }
  async function rows(id, s) {
    const entries = [];
    for (const e of s.entries) {
      let m = {}; try { m = await manifest(e.path); } catch {}
      const ext = loaded(id,e);
      const failures = [...errors.values()].map(x => x.get(e.key)).filter(Boolean);
      entries.push({key:e.key,extensionId:ext?.id||'',action:!!(m.action||m.browser_action||m.page_action),name:ext?.name||m.name||'无法读取的扩展',version:ext?.version||m.version||'',path:e.path,enabled:e.enabled,pinned:!!e.pinned,loaded:!!ext,error:errors.get(id).get(e.key)||(ext&&compat?.error(id,ext.id))||(failures.length?'部分账号加载失败：'+failures[0]:''),storage:ext&&storage&&m.permissions?.includes('storage')?storage.status(id,ext.id):null,popup:!!(m.action?.default_popup||m.browser_action?.default_popup),options:!!(m.options_ui?.page||m.options_page)});
    }
    return {entries,error:s.error};
  }
  const list = id => serial(id, s => rows(id,s));
  const ready = id => (attached.has(id) && !mutating && /^[\w-]{1,80}$/.test(id)) ? Promise.resolve() : serial(id, () => undefined);
  // Roll back every touched session when a load or durable registry write fails.
  async function update(s, e, enabled, next, reload=false) {
    if (s.error) throw Error('请先修复无法读取的扩展记录，未覆盖原文件');
    const before = s.entries, touched = [];
    try {
      for (const id of sessions.keys()) {
        const wasLoaded = !!loaded(id,e); touched.push({id,wasLoaded});
        if (wasLoaded && (!enabled || reload)) await unload(id,e);
        if (enabled && !loaded(id,e)) await load(id,e);
      }
      s.entries = next; await persist(s);
      for (const errs of errors.values()) errs.delete(e.key);
    } catch (error) {
      s.entries = before;
      for (const {id,wasLoaded} of touched.reverse()) {
        try { await unload(id,e); if (wasLoaded) await load(id,e); }
        catch (restore) { errors.get(id).set(e.key,restore.message); }
      }
      throw error;
    }
  }
  async function prepare(id, source, packed) {
    if (!packed) { const folder = await fs.realpath(source); return { path:folder, owned:false, manifest:await manifest(folder) }; }
    const st = await fs.stat(source); if (!st.isFile() || st.size > MAX_ARCHIVE) throw Error('扩展安装包无效或超过 64 MiB');
    directory(id); const base = shared; await fs.mkdir(base, { recursive:true });
    const folder = await fs.mkdtemp(path.join(base, 'package-'));
    try {
      const zip = path.join(folder, '.archive.zip'); await fs.writeFile(zip, archivePayload(await fs.readFile(source)));
      let count = 0, bytes = 0;
      await extract(zip, { dir:folder, onEntry(entry) {
        bytes += entry.uncompressedSize;
        if (++count > 10000 || bytes > MAX_EXPANDED) throw Error('扩展解压大小或文件数量超限');
        if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw Error('扩展安装包不能包含符号链接');
        if (entry.fileName.split(/[\\/]/).includes('..') || path.isAbsolute(entry.fileName) || /^[A-Za-z]:/.test(entry.fileName) || entry.fileName.includes('\\') || entry.fileName === '.archive.zip') throw Error('扩展安装包路径无效');
      } });
      await fs.unlink(zip);
      return { path:folder, owned:true, manifest:await manifest(folder) };
    } catch (e) { await fs.rm(folder, {recursive:true,force:true}); throw e; }
  }
  const cleanup = async (id, item) => {
    directory(id);
    const parent = path.dirname(item.path);
    // Include imported, app-owned legacy package directories, never unpacked sources.
    if (item.owned && path.dirname(parent) === path.resolve(root) && /^[\w-]{1,80}$/.test(path.basename(parent)) && path.basename(item.path).startsWith('package-')) await fs.rm(item.path, {recursive:true,force:true});
  };
  async function install(id, prepared) {
    return serial(id, async s => {
      if (s.error) throw Error('请先修复无法读取的扩展记录，未覆盖原文件');
      if (s.entries.length >= 100) throw Error('所有账号合计最多安装 100 个扩展');
      if (s.entries.some(e => path.resolve(e.path) === path.resolve(prepared.path))) throw Error('此目录已经加载');
      const e = {key:crypto.randomUUID(),path:prepared.path,owned:prepared.owned,enabled:true};
      await update(s,e,true,[...s.entries,e]); return rows(id,s);
    }, true);
  }
  async function change(id, key, action) {
    return serial(id, async s => {
      const e = s.entries.find(x => x.key === key); if (!e) throw Error('扩展已移除');
      if (!['enable','disable','reload','remove'].includes(action)) throw Error('扩展操作无效');
      const enabled = action === 'enable' || action === 'reload';
      const next = action === 'remove' ? s.entries.filter(x => x !== e) : s.entries.map(x => x === e ? {...e,enabled} : x);
      await update(s,e,enabled,next,action==='reload');
      if (action === 'remove') await cleanup(id,e);
      return rows(id,s);
    }, true);
  }
  async function pin(id, key, pinned) {
    return serial(id, async s => {
      if (s.error) throw Error('扩展记录无法读取，未覆盖原文件');
      if (typeof pinned !== 'boolean') throw Error('固定状态无效');
      const e = s.entries.find(x => x.key === key); if (!e) throw Error('扩展已移除');
      const before = s.entries;
      s.entries = before.map(x => x === e ? {...x,pinned} : x);
      try { await persist(s); } catch (error) { s.entries = before; throw error; }
      return rows(id,s);
    }, true);
  }
  async function toolbar(id,tabId) {
    const data = await list(id);
    return {error:data.error,entries:await Promise.all(data.entries.map(async e => {
      let icon = '';
      try {
        const m = await manifest(e.path), icons = m.action?.default_icon || m.browser_action?.default_icon || m.icons;
        const relative = typeof icons === 'string' ? icons : icons && Object.entries(icons).sort((a,b)=>Math.abs(Number(a[0])-32)-Math.abs(Number(b[0])-32))[0]?.[1];
        if (typeof relative === 'string') {
          const base = await fs.realpath(e.path), file = await fs.realpath(path.resolve(base,relative)), rel = path.relative(base,file);
          if (!rel.startsWith('..') && !path.isAbsolute(rel) && /\.(png|jpe?g|webp)$/i.test(file)) {
            const stat = await fs.stat(file);
            if (stat.isFile() && stat.size <= 128*1024) {
              const sig = `${stat.mtimeMs}:${stat.size}`, hit = iconCache.get(file);
              if (hit && hit.sig === sig) icon = hit.icon;
              else {
                icon = 'data:image/'+(/\.png$/i.test(file)?'png':/\.webp$/i.test(file)?'webp':'jpeg')+';base64,'+(await fs.readFile(file)).toString('base64');
                iconCache.set(file, { sig, icon });
                if (iconCache.size > 128) iconCache.delete(iconCache.keys().next().value);
              }
            }
          }
        }
      } catch {}
      let actionState={};try{if(e.extensionId&&compat)actionState=compat.actionState(id,e.extensionId,tabId);}catch{}
      return {key:e.key,extensionId:e.extensionId,name:e.name,enabled:e.enabled,loaded:e.loaded,pinned:e.pinned,popup:actionState.popup===undefined?e.popup:!!actionState.popup,action:e.action,actionEnabled:actionState.enabled!==false,title:actionState.title||e.name,badgeText:actionState.badgeText||'',error:e.error,options:e.options,icon};
    }))};
  }
  async function page(id,key,kind) {
    return serial(id, async s => {
      const e=s.entries.find(x=>x.key===key), ext=e&&loaded(id,e); if(!ext)throw Error('请先启用扩展');
      const m=await manifest(e.path), relative=kind==='popup'?(m.action?.default_popup||m.browser_action?.default_popup):(m.options_ui?.page||m.options_page);
      if(typeof relative!=='string'||!relative)throw Error('扩展未提供此页面');
      const url=new URL(relative, 'chrome-extension://'+ext.id+'/');
      if(url.protocol!=='chrome-extension:'||url.hostname!==ext.id)throw Error('扩展页面地址无效');
      return url.href;
    });
  }
  return {ready,list,toolbar,pin,prepare,install,change,page,cleanup};
}
module.exports={createExtensions,archivePayload,manifest};
