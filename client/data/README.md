# Fingerprint reference data

`fingerprint-bank-v2026.09.5.json` is an unmodified copy of the public reference data served by https://whatsmyllm.com/data/bank/v2026.09.5.json, retrieved on 2026-10-01. Attribution is to the upstream What's My LLM / ModelTrace project; this integration does not claim authorship of the statistical observations or model metadata.

- Version: `2026.09.5`
- Models: 21
- Bytes: 366925
- SHA256: `d21c1413eeac2f5238f37bc97df0299591433c14a1bbd5534546e95697fbd11f`
- Upstream metadata page: https://whatsmyllm.com/
- Engine and original 17-model reference source: https://github.com/xqy2006/ModelTrace (MIT, copyright notice retained in `../licenses/`)

The public website data is separately attributed; the engine's MIT notice is not a claim that every later dataset is independently relicensed by this client. Preserve upstream metadata and notices. Model labels and scores are statistical references, not verified identities or accuracy guarantees.

The build verifies the seed hash before embedding it. Runtime updates use public homepage data attributes only (never execute remote scripts), verify the exact raw JSON hash, and keep the last validated local snapshot on failure. A changed protocol requires an application update.

The two SHA-256-pinned JSON banks are marked `-text` in the root `.gitattributes`. Keep their exact upstream bytes (including the final LF); do not rewrite them with platform line endings or update the pins to match a reformatted copy.
