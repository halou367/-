# Third-party notices

## ModelTrace

The fingerprint scoring core, challenge wording, bundled fallback bank, and regression fixture are derived from:

- Project: ModelTrace
- Author: xqy2006
- Source: https://github.com/xqy2006/ModelTrace
- Revision: `d4131b30243dfa05e70180b5eedde742103f1d73`
- License: MIT — see `LICENSE-ModelTrace`

Included files:

- `modeltrace-core.js`
- `modeltrace-bank.json`
- `tests/fixtures/gpt-6-astra-three.json`

## WhatsMyLLM methodology and optional data

The input gates and open-set thresholds implement the public methodology described at:

- https://whatsmyllm.com/methodology/

At runtime the extension first attempts a read-only download of:

- `https://whatsmyllm.com/data/bank/v2026.09.5.json`
- Required SHA-256: `d21c1413eeac2f5238f37bc97df0299591433c14a1bbd5534546e95697fbd11f`

That data file is not bundled. It is validated as JSON and never executed. No captured reply or numeric sequence is included in the request. If unavailable, the bundled MIT-licensed ModelTrace bank is used.

WhatsMyLLM does not maintain or endorse this extension.
