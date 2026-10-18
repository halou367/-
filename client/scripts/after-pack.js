const fs = require('node:fs');
const path = require('node:path');
const { embedIcon } = require('./win-pe-icon');

const KEEP_LOCALES = new Set(['zh-CN.pak', 'zh-TW.pak', 'en-US.pak']);
const STRIP_FILES = ['LICENSES.chromium.html', 'LICENSE.electron.txt', 'dxcompiler.dll', 'dxil.dll'];

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
}

exports.default = async function afterPack(context) {
  slimElectronOutDir(context.appOutDir);
  if (context.electronPlatformName !== 'win32') return;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const icoPath = path.resolve(context.packager.projectDir, 'assets/icon.ico');
  embedIcon(exePath, icoPath);
};