# Contributing to R3nzo

Thanks for helping improve R3nzo. This is a testnet prototype, so changes should keep the demo honest about what runs in the TEE and what runs in the fallback.

## Ground rules

- Do not commit API keys, private keys, customer data, or `.env` files.
- Keep new documentation and user-facing copy free of emojis and em dashes.
- Keep commit authorship with the repository owner. Do not add co-author or generated-by trailers.
- Open an issue before a large change so the approach can be discussed.
- Report security problems privately using [SECURITY.md](SECURITY.md), not a public issue.

## Setup

Requirements: Node.js 20 or newer and npm.

```bash
git clone https://github.com/maxxexee/aml-compliance-agent.git
cd aml-compliance-agent
npm ci
cp .env.example .env
# Set T3N_API_KEY and OPENROUTER_API_KEY in .env
npm start
```

Open `http://localhost:3001`.

The TEE path needs T3N credits. Without them, the API uses the JavaScript fallback in `t3n-contracts/compliance.js`. Do not present fallback results as TEE results.

## Checks

Run these before opening a pull request:

```bash
npm test
npm run check
```

Run the endpoint integration checks against a local server:

```bash
npm run test:integration
```

For contract changes, run the tests and build the WASM target:

```bash
cargo test --manifest-path t3n-contract/Cargo.toml
rustup target add wasm32-wasip2
cargo build --manifest-path t3n-contract/Cargo.toml --target wasm32-wasip2 --release
```

## TEE changes

The Rust contract lives in `t3n-contract/`. The source is versioned in `Cargo.toml` and `src/lib.rs`, and the repository checks compare those values with the README.

Registration requires a funded T3N account. The current account has zero credits, so a registration attempt returns `InsufficientCredit`. Do not change the registered version in the README unless the registration succeeds.

The seed script uses the contract ID and tenant configuration. If the tenant changes, update the contract ID and the map ACL before seeding.

## Pull requests

- Keep the change focused and describe the problem it solves.
- Update the README, docs, or screenshots when behavior changes.
- Include the commands you ran and the output that shows the change works.
- Do not include build output, `node_modules`, `.env`, or `target` directories.
- Do not add attribution trailers to commits.

## Commit messages

Use a short imperative subject, for example:

```text
Fix the OFAC map read in the TEE contract
Add the repository check workflow
```

## License

By contributing, you agree that your contribution is licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
