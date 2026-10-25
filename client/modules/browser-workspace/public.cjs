'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const runtimeDeps = path.resolve(__dirname, '../../runtime-resources/node_modules');
if (!(process.env.NODE_PATH || '').split(path.delimiter).includes(runtimeDeps)) {
  process.env.NODE_PATH = [runtimeDeps, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}

const webbar = require('./ui/webbar.js');
const browserPrivacy = require('./domain/browser-privacy.js');
const bookmarkIcon = require('./domain/bookmark-icon.js');
const browserBookmarks = require('./domain/browser-bookmarks.js');
const browserNavigation = require('./domain/browser-navigation.js');
const siteLogins = require('./domain/site-logins.js');
const extensionWorkerReady = require('./domain/extension-worker-ready.js');
const extensionStorage = require('./domain/extension-storage.js');
const extensionStorageNative = require('./domain/extension-storage-native.js');
const extensionTabs = require('./domain/extension-tabs.js');
const browserExtensions = require('./domain/browser-extensions.js');
const extensionCompat = require('./domain/extension-compat.js');
const extensionsWindow = require('./domain/extensions-window.js');

const webbarScriptPath = path.join(__dirname, 'ui/webbar.js');
const rtcLockdownPath = path.join(__dirname, 'ui/rtc-lockdown.js');
const regionEnvironmentsPath = path.join(__dirname, 'ui/region-environments.json');
const extensionStoragePreloadPath = path.join(__dirname, 'domain/extension-storage-preload.js');
const extensionCompatPreloadPath = path.join(__dirname, 'domain/extension-compat-preload.js');
const bookmarksPreloadPath = path.join(__dirname, 'domain/bookmarks-preload.js');
const extensionsPreloadPath = path.join(__dirname, 'domain/extensions-preload.js');
const bookmarksHtmlPath = path.join(__dirname, 'ui/bookmarks.html');
const mainWindowPreloadPath = path.join(__dirname, 'domain/main-window-preload.js');
const extensionPackagedSelfTest = require('./domain/extension-packaged-self-test.js');
const extensionsHtmlPath = path.join(__dirname, 'ui/extensions.html');

function readWebbarScript() {
  return fs.readFileSync(webbarScriptPath, 'utf8');
}

function readRtcLockdownScript() {
  return fs.readFileSync(rtcLockdownPath, 'utf8');
}

function readRegionEnvironments() {
  return JSON.parse(fs.readFileSync(regionEnvironmentsPath, 'utf8'));
}

module.exports = Object.freeze({
  webbar,
  browserPrivacy,
  bookmarkIcon,
  browserBookmarks,
  browserNavigation,
  siteLogins,
  extensionWorkerReady,
  extensionStorage,
  extensionStorageNative,
  extensionTabs,
  browserExtensions,
  extensionCompat,
  extensionsWindow,
  get bookmarksWindow() { return require('./domain/bookmarks-window.js'); },
  webbarScriptPath,
  rtcLockdownPath,
  regionEnvironmentsPath,
  extensionStoragePreloadPath,
  extensionCompatPreloadPath,
  bookmarksPreloadPath,
  extensionsPreloadPath,
  bookmarksHtmlPath,
  extensionsHtmlPath,
  mainWindowPreloadPath,
  extensionPackagedSelfTest,
  readWebbarScript,
  readRtcLockdownScript,
  readRegionEnvironments,
});
