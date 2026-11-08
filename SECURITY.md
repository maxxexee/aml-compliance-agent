# Security policy

R3nzo is a testnet prototype. It is not audited and is not ready for production or customer data.

## Supported versions

Only the `main` branch is supported. There are no maintained release branches.

## Reporting a vulnerability

Use GitHub private vulnerability reporting:

https://github.com/maxxexee/aml-compliance-agent/security/advisories/new

Do not open a public issue for a security problem. Do not include API keys, private keys, customer data, or full wallet histories in a report. Use a minimal reproduction and redact sensitive values.

## Scope

In scope:

- The Express API in `api/`
- The Rust WASM contract in `t3n-contract/`
- The MCP server in `mcp-server/`
- The dashboard in `web/pages/`
- Secrets exposure in the repository or build output

Out of scope:

- The T3N testnet being unavailable or out of credits
- The offline Render service
- Known limitations already listed in the README, including the missing API authentication on the demo service
- Reports that require a compromised host, browser, or T3N account

## Response

This is a small project. Reports are handled on a best effort basis. There is no service level agreement.

If the report is valid, the fix and disclosure timing will be coordinated with the reporter.
