# T3N contract scripts

This directory contains the Rust WASM compliance contract and the scripts used to register it and seed its encrypted KV map.

The contract source is in `src/lib.rs` and `src/compliance.rs`. The version is kept in sync between `Cargo.toml` and `CONTRACT_VERSION` in `src/lib.rs`. The repository check fails if those values diverge or if the README does not mention the current version.

## Canonical flow

| Script | Purpose | Status |
| --- | --- | --- |
| `register-v2.mjs` | Registers version 0.2.2 from the release WASM | Current registration path; blocked by zero credits |
| `final-seed.mjs` | Creates the `ofac` map and writes the `ofac_eth` key | Current seed path; uses contract ID 786 |
| `register.mjs` | Registers the original version 0.1.0 | Historical reference |
| `seed-real.mjs` | Earlier seed path for the first tenant | Historical reference |

The current flow is:

```bash
rustup target add wasm32-wasip2
cargo build --target wasm32-wasip2 --release
node register-v2.mjs
node final-seed.mjs
```

Run the commands from this directory. The scripts load `.env` from the repository root.

## KV layout

The v0.2.2 contract reads the sanctions JSON from:

```text
map: z:<tenant>:ofac
key: ofac_eth
```

The v0.1.0 contract reads from `z:<tenant>:sanctions`. That mismatch is why the v0.2.2 contract exists.

`final-seed.mjs` creates the `ofac` map with writers set to `all` and writes the 120 addresses from `../data/ofac_eth.json` to `ofac_eth`. It currently uses contract ID 786. If the tenant or contract changes, update the ID and the map ACL before seeding.

## Historical scripts

These files are kept for reference. They are one-off diagnostics from the first tenant and are not part of the current registration or seed flow.

| Script | Earlier purpose |
| --- | --- |
| `fix-acl.mjs` | Adjust map access for the first tenant |
| `fix-sanctions-map.mjs` | Repair the earlier sanctions map |
| `seed-chunks.mjs` | Write the sanctions data in chunks |
| `seed-maps.mjs` | Probe map creation paths |
| `seed-per-address.mjs` | Write one key per address |
| `seed-small.mjs` | Test a small payload |
| `seed-tee.mjs` | Early TEE seed attempt |
| `test-maps.mjs` | Read back map contents |
| `test-size.mjs` | Probe payload size limits |
| `try-all-writers.mjs` | Test writer settings |
| `try-maps.mjs` | Test map names |
| `try-writers-formats.mjs` | Test serialization formats |

Do not add new one-off scripts for a fresh tenant. Extend the canonical flow or add a documented command instead.

## Current blocker

The T3N test account has zero credits. Registration returns:

```text
InsufficientCredit (account=51792674f39e3f1958ddc7c7c52f51860fa60fa0, required=10000000000, available=0)
```

Until the account is funded, the registered version remains 0.1.0 and the API uses the JavaScript fallback in `../t3n-contracts/compliance.js`.

## Secrets

The scripts read `T3N_API_KEY` from the repository root `.env`. Do not commit `.env`, API keys, or seed output. The repository check rejects a tracked `.env` file.
