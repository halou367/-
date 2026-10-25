const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
let embedIcon = () => {}; try { embedIcon = require('./win-pe-icon').embedIcon || embedIcon; } catch {}

const KEEP_LOCALES = new Set(['zh-CN.pak', 'en-US.pak']);
const STRIP_FILES = ['LICENSES.chromium.html', 'LICENSE.electron.txt', 'dxcompiler.dll', 'dxil.dll', 'd3dcompiler_47.dll'];
const STRIP_BIN_FILES = ['geoip.dat', 'geosite.dat', 'wintun.dll', 'VERSION.dll', 'VERSION.pdb', 'VERSION.dll.lib', 'VERSION.dll.exp'];
const KEEP_ASAR_UI = new Set([
  'auth-flow.js', 'net-policy.js', 'mail-token.js', 'route-state.js', 'webbar.js',
  'bookmarks.html', 'bookmarks.css', 'bookmarks.js', 'region-environments.json', 'rtc-lockdown.js', 'captcha-solver.js', 'extensions.html', 'extensions.css', 'extensions.js',
  'shared-fingerprint-schema.js', 'offline.html', 'mgr.html', 'vless.js', 'workspace-path.js',
  'app.css', 'flags.woff2', 'route-policy.js', 'route-host.js', 'offline-context.js',
  'nodes.js', 'iprep.js', 'pool.js', 'node-speed.js', 'node-routes.js', 'offline-modes.js',
  'probe-vendor.js', 'probe-bank-ikale.js', 'habit-builtin-bank.js', 'version.json',
]);
const BROTLI_ASAR_TARGETS = new Set([
  'gen/ui.bundle.js',
  'ui/probe-vendor.js',
  'ui/habit-builtin-bank.js',
  'ui/probe-bank-ikale.js',
  'ui/region-environments.json',
]);

const BRANA_WIN32_NODE_BR = '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';
const WIN_MEM_TRIM_EXE_BR = 'G/8PIB4Hucn0mplQYvng4yQe/r+u6r6fUVlRUWgqCmwrW8zqIbGbMyt4B3MJYGl4Pm3mO+yYe5urYwhQ65HXP2slgp2v9Y3dFIGySN0lQ7z9/+9QOQPkwBIKTsAgZt+/kbFG15oWwYB0be62UkU2FrzW1+eNdYFUuUztMbyeaIu6NDyD2/b6q4IM///PY4AatO8FaJvyRJuHmt72WGx9gxNRrfGsUJUOwr69xW7ef95lOndyprXoAgyug61R8c0xH/8A8LkUzdFMFTnwThdK1EANJRIZIAO4AAlIapcylKH488trNjijCzuDGn7PAABwAFogWUlOXl6ykc8Mx3h68FGGElUkWdofMEOTZmhveY21fI8EqKE2Q8XFDFrgAEhoAwBqWA0A4L4uYCMkDd4ruadCIFGFfucJs5JtEAxLraNHZFOXNw3Lbi6qw6Mvo5jW1zh6dldjXwNFS358laIvqPZ8WuTTqvnxjRQfV+n51LBszB5Lk8OypuuOnPNv9ABiIkm7tpkKYLz2pSpBTE59OcXA6s9PV2MCtOC0edVZM+bOmjt7MTQ4BvYIOs+Dl4JDgs4hB/cH+irk6Nz1M3UiMhRe/+k3E6hVOAI6V7vYBZCIDaPGRzbBX90towk0IqGChBwJ8b9cAoUAVXNNU3Wxg027/Y5+8c7GRUxTmBbjomo78bgQIASGmoCGuzIXuLFcopAMlqBmsznJaxe6bGydFRWEXSHsZ0HdhnEY38Pt6nb1GxqdZpsXA2ZbE7MstleM0qRuxQzNVphhhA3ahKhYImQXAAA8jwwAoRPqbacBsGzQsk3OOP3IUPHiK2P1lstQSJX9+I5jZc52Sc4cxJB2Gm3S4c9yn6WklaSH6qs8Kv3xz+oxJ+VJZK76aRAGQWUrllthnWgyNJXWo3TzBOxDQjJdlomHE7HDqxM4h+E6H1G14QsiD8fikrg5xo1jx2XYiOJkU9hqzzn4t2o17XLSqLUuk63JjTV5iKQKmyUMlrw/tDzSbafwkNM4OqPjBXncQABfTCmDg+O1CVApwft/Xu3eMbtc/bq+vt/S//pY8kfP2ufbRvvzKzORxjaIfFJbpRRZGQc879ZWlVLb0JwVDR+XNxnb1NjQlhNNXE+f5yEHk0PYJY3eXU3xLoZGq74v/cS40xi3dEFaPtOFEhZFHQ3A/mui3g7FdcEn+EWs6w86+L9bWQO9VJKhKLlgLBZxAQAQAoNMmo7QEi7AFdyAW2rYJwFgDX4MAOaSYR5281nHN7c++ezRe+90PHrnznvg6ey3CQAAKwGZe2m2FsJuDHXHcsSj4LsIdMmwC2UEiWOUrCgA3Jc9FYSdlZQV5JJ1vikIsyZ7z3OQOqZJQsjDb4gko6xCqeIlZsm5C74VqsStcJYZs9astSC0YS/PNyEwnHcMT+B0VlBxLOFVnEJZXtWhhgTok4StRM5wrkWFEWXl+koosdWCUGdyWOW4dhcuKIvmyR9nkIp6BjKlgUe7oUVy6SpJWjmvyxnZF9oPfnvy2WVgHIVVMbQ/WstZAsNAeyPYdUi1Z0o6PO8mznLxQ/eyhOlZdqqGIyAqnCoQw+NXsuiPTPLVt8Zh2UZ32jcFG1e0FmUpH6sIHKYpPGGAy9Jto933aDHEwGFNEgBeMDgzEVpyNBU33xkwAFRwp9DDEunVBU+AxOLWiFLxfitQDQk7I6n4gekxvMWfW74TONUCigxknFLTz2wzr0z3U2deMQ23B+xGzplXzP4Dhf55LWnBe/Mg';

// Strip Chromium DevTools frontend bundles (>48 KB) from DataPack v5 resources.pak (11.86 MB -> 1.36 MB)
function slimResourcesPak(pakPath) {
  try {
    if (!pakPath || !fs.existsSync(pakPath)) return false;
    const buf = fs.readFileSync(pakPath);
    if (buf.length < 12) return false;
    const ver = buf.readUInt32LE(0);
    if (ver !== 5) return false;
    const encoding = buf.readUInt32LE(4);
    const resourceCount = buf.readUInt16LE(8);
    const aliasCount = buf.readUInt16LE(10);
    const headerSize = 12 + (resourceCount + 1) * 6 + aliasCount * 4;
    if (buf.length <= headerSize || buf.length < 2 * 1024 * 1024) return false;
    const entries = [];
    for (let i = 0; i < resourceCount; i++) {
      const id = buf.readUInt16LE(12 + i * 6);
      const offset = buf.readUInt32LE(12 + i * 6 + 2);
      const nextOffset = buf.readUInt32LE(12 + (i + 1) * 6 + 2);
      if (offset < headerSize || nextOffset < offset || nextOffset > buf.length) return false;
      const size = nextOffset - offset;
      entries.push({ id, data: size > 24576 ? Buffer.alloc(0) : buf.subarray(offset, nextOffset) });
    }
    const aliases = [];
    const aliasBase = 12 + (resourceCount + 1) * 6;
    for (let i = 0; i < aliasCount; i++) {
      aliases.push({
        id: buf.readUInt16LE(aliasBase + i * 4),
        index: buf.readUInt16LE(aliasBase + i * 4 + 2),
      });
    }
    const totalData = entries.reduce((acc, e) => acc + e.data.length, 0);
    const out = Buffer.allocUnsafe(headerSize + totalData);
    out.writeUInt32LE(ver, 0);
    out.writeUInt32LE(encoding, 4);
    out.writeUInt16LE(resourceCount, 8);
    out.writeUInt16LE(aliasCount, 10);
    let curOffset = headerSize;
    for (let i = 0; i < resourceCount; i++) {
      out.writeUInt16LE(entries[i].id, 12 + i * 6);
      out.writeUInt32LE(curOffset, 12 + i * 6 + 2);
      if (entries[i].data.length > 0) {
        entries[i].data.copy(out, curOffset);
        curOffset += entries[i].data.length;
      }
    }
    out.writeUInt16LE(0, 12 + resourceCount * 6);
    out.writeUInt32LE(curOffset, 12 + resourceCount * 6 + 2);
    for (let i = 0; i < aliasCount; i++) {
      out.writeUInt16LE(aliases[i].id, aliasBase + i * 4);
      out.writeUInt16LE(aliases[i].index, aliasBase + i * 4 + 2);
    }
    fs.writeFileSync(pakPath, out);
    return true;
  } catch {
    return false;
  }
}

function patchExeAsarIntegrity(appOutDir, asarPath) {
  try {
    if (!fs.existsSync(asarPath)) return;
    const asarBuf = fs.readFileSync(asarPath);
    if (asarBuf.length < 16) return;
    const hSize = asarBuf.readUInt32LE(12);
    const headerSlice = asarBuf.subarray(16, 16 + hSize);
    JSON.parse(headerSlice.toString('utf8'));
    const headerSha256 = crypto.createHash('sha256').update(headerSlice).digest('hex');
    const marker = Buffer.from('"alg":"SHA256","value":"', 'utf8');
    for (const f of fs.readdirSync(appOutDir)) {
      if (!f.toLowerCase().endsWith('.exe')) continue;
      const exePath = path.join(appOutDir, f);
      const exeBuf = fs.readFileSync(exePath);
      const idx = exeBuf.indexOf(marker);
      if (idx >= 0) {
        Buffer.from(headerSha256, 'ascii').copy(exeBuf, idx + marker.length);
        fs.writeFileSync(exePath, exeBuf);
      }
    }
  } catch {}
}

// Pure-Node ASAR slimmer + Brotli payload compressor for electron-builder output
function slimAppAsar(appOutDir) {
  try {
    const asarPath = path.join(appOutDir, 'resources', 'app.asar');
    if (!fs.existsSync(asarPath)) return false;
    const rawAsar = fs.readFileSync(asarPath);
    if (rawAsar.length < 16) return false;
    const hSize = rawAsar.readUInt32LE(12);
    const headerJson = rawAsar.subarray(16, 16 + hSize).toString('utf8');
    const tree = JSON.parse(headerJson);
    const dataOffsetBase = 8 + rawAsar.readUInt32LE(4);
    const brHeader = Buffer.from('/*BR*/', 'ascii');

    // If gen/ui.desktop.bundle.js exists in tree, promote it to gen/ui.bundle.js
    if (tree.files?.gen?.files?.['ui.desktop.bundle.js']) {
      tree.files.gen.files['ui.bundle.js'] = tree.files.gen.files['ui.desktop.bundle.js'];
      delete tree.files.gen.files['ui.desktop.bundle.js'];
    }
    delete tree.files?.data;
    delete tree.files?.scripts;
    delete tree.files?.tests;
    delete tree.files?.modules;
    delete tree.files?.platform;
    if (tree.files?.ui?.files) {
      for (const k of Object.keys(tree.files.ui.files)) {
        if (!KEEP_ASAR_UI.has(k)) delete tree.files.ui.files[k];
      }
    }

    const chunks = [];
    let curOffset = 0;
    function rebuildNode(node, relPath) {
      if (!node || typeof node !== 'object') return;
      if (node.files && typeof node.files === 'object') {
        for (const [name, child] of Object.entries(node.files)) {
          const childRel = relPath ? relPath + '/' + name : name;
          if (relPath.startsWith('node_modules')) {
            if (child.files && /^(?:test|tests|__tests__|docs|example|examples|\.github|@types|undici-types)$/i.test(name)) {
              delete node.files[name];
              continue;
            }
            if (!child.files && (/\.(?:d\.ts|map|md|markdown|bak|sqlite3)$/i.test(name) || /^(?:CHANGELOG|HISTORY|README|CONTRIBUTING)/i.test(name))) {
              delete node.files[name];
              continue;
            }
          }
          rebuildNode(child, childRel);
        }
        return;
      }
      if (node.unpacked) return;
      const origOff = Number(node.offset || 0);
      const origSize = Number(node.size || 0);
      let fileBuf = rawAsar.subarray(dataOffsetBase + origOff, dataOffsetBase + origOff + origSize);
      if (relPath === 'ui/app.css') {
        const minCss = fileBuf.toString('utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};,>~])\s*/g, '$1').replace(/:\s+/g, ':').replace(/;}/g, '}');
        fileBuf = Buffer.from(minCss, 'utf8');
      } else if (BROTLI_ASAR_TARGETS.has(relPath) && !(fileBuf.length >= 6 && fileBuf.subarray(0, 6).equals(brHeader))) {
        const comp = zlib.brotliCompressSync(fileBuf, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
        });
        fileBuf = Buffer.concat([brHeader, comp]);
      }
      node.offset = String(curOffset);
      node.size = fileBuf.length;
      const hashHex = crypto.createHash('sha256').update(fileBuf).digest('hex');
      const blockSize = 4 * 1024 * 1024;
      const blocks = [];
      for (let pos = 0; pos < fileBuf.length; pos += blockSize) {
        blocks.push(crypto.createHash('sha256').update(fileBuf.subarray(pos, Math.min(fileBuf.length, pos + blockSize))).digest('hex'));
      }
      if (blocks.length === 0) blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
      node.integrity = { algorithm: 'SHA256', hash: hashHex, blockSize, blocks };
      chunks.push(fileBuf);
      curOffset += fileBuf.length;
    }

    rebuildNode(tree, '');
    const newHeaderBuf = Buffer.from(JSON.stringify(tree), 'utf8');
    const newHeaderLen = newHeaderBuf.length;
    const alignedLen = Math.ceil((newHeaderLen + 4) / 4) * 4;
    const pickleSize = alignedLen + 4;
    const prefix = Buffer.alloc(8 + pickleSize, 0);
    prefix.writeUInt32LE(4, 0);
    prefix.writeUInt32LE(pickleSize, 4);
    prefix.writeUInt32LE(alignedLen, 8);
    prefix.writeUInt32LE(newHeaderLen, 12);
    newHeaderBuf.copy(prefix, 16);
    fs.writeFileSync(asarPath, Buffer.concat([prefix, ...chunks]));
    patchExeAsarIntegrity(appOutDir, asarPath);
    return true;
  } catch {
    return false;
  }
}

function slimElectronOutDir(appOutDir) {
  if (!appOutDir || !fs.existsSync(appOutDir)) return;
  const localesDir = path.join(appOutDir, 'locales');
  if (fs.existsSync(localesDir)) {
    for (const f of fs.readdirSync(localesDir)) {
      if (f.endsWith('.pak') && !KEEP_LOCALES.has(f)) {
        try { fs.unlinkSync(path.join(localesDir, f)); } catch {}
      }
    }
  }
  for (const name of STRIP_FILES) {
    const p = path.join(appOutDir, name);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
  const binDir = path.join(appOutDir, 'resources', 'bin');
  try {
    fs.mkdirSync(binDir, { recursive: true });
    const win32NodePath = path.join(binDir, 'brana-win32.node');
    if (!fs.existsSync(win32NodePath)) {
      fs.writeFileSync(win32NodePath, zlib.brotliDecompressSync(Buffer.from(BRANA_WIN32_NODE_BR, 'base64')));
    }
    const trimExePath = path.join(binDir, 'win-mem-trim.exe');
    if (!fs.existsSync(trimExePath)) {
      fs.writeFileSync(trimExePath, zlib.brotliDecompressSync(Buffer.from(WIN_MEM_TRIM_EXE_BR, 'base64')));
    }
  } catch {}
  if (fs.existsSync(binDir)) {
    for (const name of STRIP_BIN_FILES) {
      const p = path.join(binDir, name);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }
  const unpackedGen = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'gen');
  if (fs.existsSync(unpackedGen)) {
    try { fs.rmSync(unpackedGen, { recursive: true, force: true }); } catch {}
  }
  slimResourcesPak(path.join(appOutDir, 'resources.pak'));
  slimResourcesPak(path.join(appOutDir, 'resources', 'resources.pak'));
  slimAppAsar(appOutDir);
}

exports.default = async function afterPack(context) {
  slimElectronOutDir(context.appOutDir);
  if (context.electronPlatformName !== 'win32') return;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const icoPath = path.resolve(context.packager.projectDir, 'assets/icon.ico');
  embedIcon(exePath, icoPath);
  patchExeAsarIntegrity(context.appOutDir, path.join(context.appOutDir, 'resources', 'app.asar'));
};
exports.slimElectronOutDir = slimElectronOutDir;
exports.slimResourcesPak = slimResourcesPak;
exports.slimAppAsar = slimAppAsar;
