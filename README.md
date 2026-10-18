# Brana Workspace Client

Cross-platform desktop (Electron) and mobile (Android WebView) workspace client with isolated session partitions, local sandboxed artifact preview, and automated network route failover.

## Repository Structure

```text
client/                  Desktop (Electron) & Android (WebView) application
  ui/                    Shared frontend UI modules and state controllers
  src/                   Electron main process, preload bridge, and bundler
  android/               Android native host (Java, androidx.webkit)
  scripts/               Build, bundle, and verification scripts
  tests/                 Unit and integration test suites
packages/
  core-metrics/          Statistical sequence evaluation & reference dataset module
update-worker/           Cloudflare Worker for release artifact distribution
```

## Development & Verification

```bash
npm test --prefix client
npm test --prefix packages/core-metrics
node client/scripts/build-probe.js
node client/scripts/bundle.js
```
