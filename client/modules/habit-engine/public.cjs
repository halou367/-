'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sharedFingerprintSchema = require('./domain/shared-fingerprint-schema.js');
const PersonalFingerprintMath = require('./domain/personal-fingerprint-math.js');
const { FingerprintStore } = require('./domain/fingerprint-store.js');
const habitBuiltinBank = require('./domain/habit-builtin-bank.js');
const fingerprintReview = require('./domain/fingerprint-review.js');

function loadUiSlice(relFile, exportExpr) {
  const fullPath = path.join(__dirname, relFile);
  const code = fs.readFileSync(fullPath, 'utf8');
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
     fetch: typeof fetch === 'function' ? fetch : undefined,
     crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    DataView,
    BigInt,
    URL,
    URLSearchParams,
    Blob,
     structuredClone: typeof structuredClone === 'function' ? structuredClone : (x => JSON.parse(JSON.stringify(x))),
    SharedFingerprintSchema: sharedFingerprintSchema,
    PersonalFingerprintMath,
    BUILTIN_HABIT_BANK: habitBuiltinBank,
    FingerprintReview: fingerprintReview,
    ICON: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    indexedDB: null,
    location: { origin: 'https://arena.ai', hostname: 'arena.ai', pathname: '/', search: '', hash: '', protocol: 'https:' },
    document: {
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, append() {} }),
      createElementNS: () => ({ setAttribute() {}, appendChild() {} }),
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      body: { appendChild() {}, append() {}, classList: { add() {}, remove() {}, contains: () => false } },
      documentElement: { style: { setProperty() {} } },
    },
    navigator: { userAgent: 'Mozilla/5.0', clipboard: { writeText: async () => {} } },
    Bus: { on() {}, off() {}, emit() {} },
    Store: { get: (_k, d) => d, set() {}, del() {} },
    Prefs: {},
    Host: {},
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;globalThis.__exported = (' + exportExpr + ');', sandbox, { filename: fullPath });
  return sandbox.__exported;
}

const cache = Object.create(null);
function lazy(key, relFile, exportExpr) {
  if (!(key in cache)) cache[key] = loadUiSlice(relFile, exportExpr);
  return cache[key];
}

const chatHabitFingerprintPath = path.join(__dirname, 'domain/chat-habit-fingerprint.js');
const seedBankPath = path.join(__dirname, 'data/fingerprint-bank-v2026.09.5.json');

module.exports = Object.freeze({
  sharedFingerprintSchema,
  PersonalFingerprintMath,
  personalFingerprintMath: PersonalFingerprintMath,
  FingerprintStore,
  fingerprintStore: FingerprintStore,
  habitBuiltinBank,
  fingerprintReview,
  get probeOutputGuard() { return lazy('probeOutputGuard', 'domain/probe-output-guard.js', 'ProbeOutputGuard'); },
  get probeArchive() { return lazy('probeArchive', 'domain/probe-archive.js', 'ProbeArchive'); },
  get probeBankCache() { return lazy('probeBankCache', 'domain/probe-bank-cache.js', 'ProbeBankCache'); },
  get sharedFingerprint() { return lazy('sharedFingerprint', 'domain/shared-fingerprint.js', 'SharedFP'); },
  get revolver() { return lazy('revolver', 'domain/revolver.js', 'Revolver'); },
  get fingerprintBatch() { return lazy('fingerprintBatch', 'domain/fingerprint-batch.js', 'FingerprintBatch'); },
  chatHabitFingerprintPath,
  seedBankPath,
  readSeedBankJson() {
    return fs.readFileSync(seedBankPath, 'utf8');
  },
  readSeedBank() {
    return JSON.parse(fs.readFileSync(seedBankPath, 'utf8'));
  },
});
