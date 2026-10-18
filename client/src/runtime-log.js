// Bounded, local-only diagnostics. Deliberately exclude URLs, messages, stacks, account IDs and content.
const fs = require('fs'), path = require('path');
function createRuntimeLog(directory, base = {}) {
  const file = path.join(directory, 'runtime.jsonl');
  const safe = value => String(value ?? '').replace(/[^a-zA-Z0-9_. -]/g, '').slice(0, 96);
  const allowed = new Set(['version','platform','arch','os','reason','exitCode','window','kind','code','attempt']);
  return function record(event, fields = {}) {
    try {
      const row = { at: new Date().toISOString(), event: safe(event) };
      for (const [k,v] of Object.entries({...base,...fields})) if (allowed.has(k)) row[k] = typeof v === 'number' && Number.isFinite(v) ? v : safe(v);
      fs.mkdirSync(directory, { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) { fs.rmSync(file + '.1', { force: true }); fs.renameSync(file, file + '.1'); }
      fs.appendFileSync(file, JSON.stringify(row) + '\n', { mode: 0o600 });
    } catch { /* Diagnostics must never turn an I/O failure into an application failure. */ }
  };
}
module.exports = { createRuntimeLog };
