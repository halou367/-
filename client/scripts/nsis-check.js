// NSIS 安装包完整性校验（与安装器启动时的 CRC 检查同一算法）
// 用法：node nsis-check.js a.exe [b.exe ...]；任何一个不通过就退出码 1
const fs = require('fs');
const T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c; }
const crc32 = (buf, s, e) => { let c = -1; for (let i = s; i < e; i++) c = T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function check(file) {
  let fd = -1;
  try {
    const st = fs.statSync(file);
    fd = fs.openSync(file, 'r');
    const headLen = Math.min(st.size, 524288);
    const head = Buffer.allocUnsafe(headLen);
    fs.readSync(fd, head, 0, headLen, 0);
    for (let off = 0; off + 28 <= headLen; off += 512) {
      if (head.readUInt32LE(off + 4) !== 0xDEADBEEF || head.toString('latin1', off + 8, off + 20) !== 'NullsoftInst') continue;
      const flags = head.readUInt32LE(off), total = head.readUInt32LE(off + 24), end = off + total;
      if (flags & 4) return { ok: true, note: 'NO_CRC 标志，未校验', size: st.size };
      if (end > st.size) return { ok: false, note: `文件被截断：需要 ${end} 字节，实际 ${st.size}` };
      // 与 NSIS 一致（build.cpp 写入 / exehead/fileform.c loadHeaders 校验）：跳过开头 512 字节 PE 头，一直算到末尾 4 字节 CRC 之前
      const crcBuf = Buffer.allocUnsafe(4);
      fs.readSync(fd, crcBuf, 0, 4, end - 4);
      const want = crcBuf.readUInt32LE(0);
      let c = -1;
      const chunk = Buffer.allocUnsafe(Math.min(1048576, Math.max(4096, end - 4 - 512)));
      let pos = 512;
      while (pos < end - 4) {
        const toRead = Math.min(chunk.length, end - 4 - pos);
        const bytesRead = fs.readSync(fd, chunk, 0, toRead, pos);
        if (bytesRead <= 0) break;
        for (let i = 0; i < bytesRead; i++) c = T[(c ^ chunk[i]) & 255] ^ (c >>> 8);
        pos += bytesRead;
      }
      const got = (c ^ -1) >>> 0;
      return { ok: want === got, note: want === got ? 'CRC 一致' : `CRC 不一致：记录 ${want.toString(16)}，实际 ${got.toString(16)}`, size: st.size, extra: st.size - end };
    }
    return { ok: false, note: '找不到 NSIS 头' };
  } catch (err) {
    return { ok: false, note: String(err?.message || err) };
  } finally {
    if (fd >= 0) { try { fs.closeSync(fd); } catch {} }
  }
}
module.exports = { check, crc32 };
if (require.main === module) {
  let bad = 0;
  for (const f of process.argv.slice(2)) { const r = check(f); if (!r.ok) bad++; console.log((r.ok ? 'OK  ' : 'BAD ') + f + ' — ' + r.note + (r.size ? ' · ' + r.size + ' 字节' : '') + (r.extra ? ' · 末尾附加 ' + r.extra + ' 字节' : '')); }
  process.exit(bad ? 1 : 0);
}