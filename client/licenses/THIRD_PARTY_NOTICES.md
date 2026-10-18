# Third-party notices

## ModelTrace

The fingerprint scoring core, challenge wording, bundled fallback bank, and regression fixture are derived from:

- Project: ModelTrace
- Author: xqy2006
- Source: https://github.com/xqy2006/ModelTrace
- Revision: `d4131b30243dfa05e70180b5eedde742103f1d73`
- License: MIT — see `LICENSE-ModelTrace`

Derived source files `modeltrace-core.js` and `modeltrace-bank.json` are incorporated into generated `client/ui/probe-vendor.js`; the regression fixture is `client/tests/fixtures/gpt-6-astra-three.json`.

## What's My LLM reference-bank update

The separately attributed 21-model seed is the unmodified public JSON from https://whatsmyllm.com/data/bank/v2026.09.5.json (version 2026.09.5, retrieved 2026-10-01). SHA256: `d21c1413eeac2f5238f37bc97df0299591433c14a1bbd5534546e95697fbd11f`. See `client/data/README.md` for provenance and limitations. The engine MIT notice above does not itself assert a separate dataset license for later website data. Runtime downloads are reference data only, not executable code.

Methodology: https://whatsmyllm.com/methodology/ . No captured reply or numeric sequence is included in bank-update requests. WhatsMyLLM does not maintain or endorse this client.


## Region language and timezone defaults

`ui/region-environments.json` uses language/territory data from Babel 2.18.0 / Unicode CLDR and timezone identifiers from IANA tzdata 2026b (`zone.tab`), with country-level defaults. This is not a city-level GeoIP database.

- Babel: https://babel.pocoo.org/ — BSD-3-Clause, see `LICENSE-Babel`.
- Unicode CLDR: https://cldr.unicode.org/ — see `LICENSE-Unicode` (Unicode License V3).
- IANA Time Zone Database: https://www.iana.org/time-zones — public-domain timezone data.
