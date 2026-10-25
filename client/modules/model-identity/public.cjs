'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const preimage = require('./domain/preimage.js');
const pricing = require('./domain/pricing.js');
const family = require('./domain/family.js');
const confidence = require('./domain/confidence.js');
const catalogSync = require('./domain/catalog-sync.js');
const cscore = require('./domain/cscore.js');
const catalogPath = path.join(__dirname, 'data/catalog.json');

function readCatalogJson() {
  return fs.readFileSync(catalogPath, 'utf8');
}

function readCatalog() {
  return JSON.parse(readCatalogJson());
}

let cachedAstats = null;
function loadAstats() {
  if (cachedAstats) return cachedAstats;
  const ctx = vm.createContext({
    Bus: { on() {}, emit() {} },
    Store: { get: () => ({}), set() {} },
    ICON: {},
    UI: {},
    Models: { all: {}, get: () => null },
    History: { items: [], fullLoading: false },
    now: Date.now,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    Map,
    Set,
    RegExp,
    Error,
    Boolean,
    Promise,
    JSON,
    setTimeout,
    clearTimeout,
  });
  const code = fs.readFileSync(path.join(__dirname, 'domain/astats.js'), 'utf8');
  vm.runInContext(code + '\n;globalThis.__AcctStats = AcctStats;', ctx, { filename: 'astats.js' });
  cachedAstats = ctx.__AcctStats;
  return cachedAstats;
}

module.exports = Object.freeze({
  preimage,
  pricing,
  family,
  confidence,
  catalogSync,
  cscore,
  get astats() { return loadAstats(); },
  catalogPath,
  readCatalogJson,
  readCatalog,
});
