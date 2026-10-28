'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function hashFileSha256Sync(filePath) {
  let fd = -1;
  try {
    fd = fs.openSync(filePath, 'r');
    const h = crypto.createHash('sha256');
    const buf = Buffer.allocUnsafe(262144);
    let pos = 0;
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (n <= 0) break;
      h.update(n === buf.length ? buf : buf.subarray(0, n));
      pos += n;
    }
    return h.digest('hex').toLowerCase();
  } finally {
    if (fd >= 0) { try { fs.closeSync(fd); } catch {} }
  }
}

function writeUtf16LeVbsSync(vbsPath, lines) {
  const body = Array.isArray(lines) ? lines.join('\r\n') : String(lines || '');
  const content = (body.startsWith('\uFEFF') ? '' : '\uFEFF') + body;
  try {
    fs.writeFileSync(vbsPath, content, 'utf16le');
    return vbsPath;
  } catch {
    const alt = path.join(path.dirname(vbsPath), path.basename(vbsPath, '.vbs') + '-' + process.pid + '.vbs');
    fs.writeFileSync(alt, content, 'utf16le');
    return alt;
  }
}

function isGithubAssetUrl(u) {
  return /^https:\/\/(?:[a-z0-9-]+\.)*(?:githubusercontent\.com|github\.com)\//i.test(String(u || ''));
}

function buildUpdateDownloadPlan({ urls = [], hasSysProxy = false, defaultFetch = null, directFetch = null, acctFetchers = [] } = {}) {
  const cleanUrls = [...new Set(urls.map(String).filter(u => /^https?:\/\//i.test(u)))];
  const ghUrls = cleanUrls.filter(isGithubAssetUrl);
  const relayUrls = cleanUrls.filter(u => !isGithubAssetUrl(u));
  const sysOrder = ghUrls.length && relayUrls.length ? [...ghUrls, ...relayUrls] : cleanUrls;
  const plan = [];
  const push = (urlList, fn, label) => {
    if (typeof fn !== 'function') return;
    for (const u of urlList) plan.push({ url: u, fetch: fn, label });
  };
  if (hasSysProxy) {
    push(sysOrder, defaultFetch, 'sys-proxy');
    push(relayUrls, directFetch, 'direct-relay');
    for (let i = 0; i < acctFetchers.length; i++) push(sysOrder, acctFetchers[i], 'acct-' + (i + 1));
    push(ghUrls, directFetch, 'direct-gh');
  } else {
    push(relayUrls, directFetch, 'direct-relay');
    push(relayUrls, defaultFetch, 'default-relay');
    for (let i = 0; i < acctFetchers.length; i++) push(sysOrder, acctFetchers[i], 'acct-' + (i + 1));
    push(ghUrls, directFetch, 'direct-gh');
    push(ghUrls, defaultFetch, 'default-gh');
  }
  return plan;
}

function parseContentRangeStart(hdr) {
  const m = /^bytes\s+(\d+)-(\d+|\*)\/(\d+|\*)/i.exec(String(hdr || '').trim());
  if (!m) return null;
  return { start: Number(m[1]), total: m[3] === '*' ? 0 : Number(m[3]) };
}

async function downloadToPartWithRangeResume({
  plan,
  partFile,
  expectedSize = 0,
  expectedSha256 = '',
  verifyInstaller = null,
  userAgent = 'BranaAi',
  connectTimeoutMs = 12000,
  stallTimeoutMs = 20000,
  maxRangeRetriesPerStep = 2,
  onProgress = () => {},
  onPhase = () => {},
  onLog = () => {},
}) {
  const wantSha = String(expectedSha256 || '').trim().toLowerCase();
  let lastErr = '';
  let clobberResetDone = false;

  const verifyPartComplete = () => {
    if (!fs.existsSync(partFile)) return { ok: false, err: '临时文件不存在' };
    const st = fs.statSync(partFile);
    if (expectedSize > 0 && st.size !== expectedSize) {
      return { ok: false, err: '文件大小不对（' + st.size + ' / ' + expectedSize + '）', incomplete: st.size < expectedSize, oversize: st.size > expectedSize };
    }
    onPhase('verify');
    if (wantSha) {
      const gotSha = hashFileSha256Sync(partFile);
      if (gotSha !== wantSha) return { ok: false, err: 'sha256 校验失败', corrupt: true };
    }
    if (typeof verifyInstaller === 'function') {
      const chk = verifyInstaller(partFile);
      if (chk && !chk.ok) return { ok: false, err: 'NSIS 完整性校验失败：' + (chk.err || '未知错误'), corrupt: true };
    }
    return { ok: true, size: st.size };
  };

  if (fs.existsSync(partFile)) {
    try {
      const st0 = fs.statSync(partFile);
      if (expectedSize > 0 && st0.size > expectedSize) {
        try { fs.unlinkSync(partFile); } catch {}
      } else if (expectedSize > 0 && st0.size === expectedSize) {
        const pre = verifyPartComplete();
        if (pre.ok) {
          onProgress({ got: pre.size, total: pre.size, speed: 0 });
          return { ok: true, size: pre.size, route: 'cached-part' };
        }
        try { fs.unlinkSync(partFile); } catch {}
      }
    } catch {}
  }

  const runFullPlanPass = async () => {
    for (const step of plan) {
      let attempt = 0;
      while (attempt <= maxRangeRetriesPerStep) {
        attempt++;
        let resumeFrom = 0;
        try {
          if (fs.existsSync(partFile)) {
            const st = fs.statSync(partFile);
            if (expectedSize > 0 && st.size > expectedSize) {
              try { fs.unlinkSync(partFile); } catch {}
              resumeFrom = 0;
            } else if (expectedSize > 0 && st.size === expectedSize) {
              const chkDone = verifyPartComplete();
              if (chkDone.ok) return { ok: true, size: chkDone.size, route: step.label };
              try { fs.unlinkSync(partFile); } catch {}
              resumeFrom = 0;
              if (!clobberResetDone) { clobberResetDone = true; return { retryFreshPass: true, err: chkDone.err }; }
            } else {
              resumeFrom = st.size;
            }
          }
        } catch { resumeFrom = 0; }

        const ctl = new AbortController();
        let timer = null;
        let timedOutStage = '';
        const armTimer = (ms, stage) => {
          clearTimeout(timer);
          timer = setTimeout(() => { timedOutStage = stage; ctl.abort(); }, ms);
        };
        let out = null;
        const startGot = resumeFrom;
        let curGot = resumeFrom;
        let usedRange = false;

        try {
          onPhase('down');
          if (resumeFrom > 0) onProgress({ got: resumeFrom, total: expectedSize || 0, speed: 0 });
          const headers = { 'User-Agent': userAgent };
          if (resumeFrom > 0) headers.Range = 'bytes=' + resumeFrom + '-';

          armTimer(connectTimeoutMs, 'connect');
          const r = await step.fetch(step.url, {
            signal: ctl.signal,
            cache: 'no-store',
            credentials: 'omit',
            headers,
          });

          if (r.status === 416 && resumeFrom > 0) {
            clearTimeout(timer);
            try { await r.body?.cancel?.(); } catch {}
            try { fs.unlinkSync(partFile); } catch {}
            onLog('Range 416 reset on ' + step.label);
            continue;
          }
          if (!r.ok || !r.body) {
            clearTimeout(timer);
            throw new Error('HTTP ' + r.status);
          }

          let writeFlags = 'w';
          let totalBytes = expectedSize;
          if (resumeFrom > 0 && r.status === 206) {
            const cr = parseContentRangeStart(r.headers?.get?.('content-range'));
            if (cr && cr.start === resumeFrom) {
              writeFlags = 'a';
              usedRange = true;
              if (!totalBytes && cr.total > 0) totalBytes = cr.total;
            } else {
              clearTimeout(timer);
              try { await r.body?.cancel?.(); } catch {}
              try { fs.unlinkSync(partFile); } catch {}
              continue;
            }
          } else {
            curGot = 0;
            writeFlags = 'w';
            const cl = +(r.headers?.get?.('content-length') || 0);
            if (!totalBytes && cl > 0) totalBytes = cl;
          }

          onProgress({ got: curGot, total: totalBytes || 0, speed: 0 });
          out = fs.createWriteStream(partFile, { flags: writeFlags });
          const rd = r.body.getReader();
          let speedAt = Date.now(), speedBytes = 0, curSpeed = 0;

          for (;;) {
            armTimer(stallTimeoutMs, 'stall');
            const { done, value } = await rd.read();
            if (done) break;
            if (!value || !value.byteLength) continue;
            const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            curGot += chunk.length;
            speedBytes += chunk.length;
            const nowMs = Date.now(), dt = nowMs - speedAt;
            if (dt >= 300) {
              const inst = Math.round(speedBytes * 1000 / dt);
              curSpeed = curSpeed ? Math.round(curSpeed * 0.65 + inst * 0.35) : inst;
              speedAt = nowMs;
              speedBytes = 0;
            }
            onProgress({ got: curGot, total: totalBytes || curGot, speed: curSpeed });
            if (!out.write(chunk)) await new Promise(res => out.once('drain', res));
          }

          clearTimeout(timer);
          await new Promise((res, rej) => out.end(err2 => err2 ? rej(err2) : res()));
          out = null;

          const v = verifyPartComplete();
          if (v.ok) {
            onProgress({ got: v.size, total: v.size, speed: 0 });
            onLog('下载校验通过 via ' + step.label + (usedRange ? ' (断点续传)' : ''));
            return { ok: true, size: v.size, route: step.label, resumed: usedRange };
          }
          if (v.corrupt) {
            try { fs.unlinkSync(partFile); } catch {}
            lastErr = v.err;
            onLog('校验未通过并已重置临时文件 (' + step.label + '): ' + v.err);
            if ((usedRange || startGot > 0) && !clobberResetDone) {
              clobberResetDone = true;
              return { retryFreshPass: true, err: v.err };
            }
            break;
          }
          lastErr = v.err;
          if (curGot > startGot && attempt <= maxRangeRetriesPerStep) continue;
          break;
        } catch (x) {
          clearTimeout(timer);
          if (out) {
            await new Promise(res => { try { out.end(() => res()); } catch { try { out.destroy(); } catch {} res(); } });
            out = null;
          }
          const msg = x?.name === 'AbortError'
            ? (timedOutStage === 'connect' ? '连接下载源超时' : '下载流中断超时，正在尝试续传')
            : String(x?.message || x);
          lastErr = msg;
          onPhase('down');
          onProgress({ got: curGot, total: expectedSize || 0, speed: 0 });
          onLog('下载通道中断 (' + step.label + ' #' + attempt + ', got=' + curGot + '): ' + msg);
          if (curGot > startGot && attempt <= maxRangeRetriesPerStep) continue;
          break;
        }
      }
    }
    return { ok: false, err: lastErr || '下载失败' };
  };

  let res = await runFullPlanPass();
  if (res && res.retryFreshPass) {
    res = await runFullPlanPass();
  }
  return res;
}

module.exports = {
  hashFileSha256Sync,
  writeUtf16LeVbsSync,
  isGithubAssetUrl,
  buildUpdateDownloadPlan,
  parseContentRangeStart,
  downloadToPartWithRangeResume,
};
