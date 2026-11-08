# R3nzo MCP server

Privacy-preserving AML compliance tools as an MCP server, powered by Terminal 3 TEE.

Connect any AI agent (Claude, Cursor, Codex) to run wallet compliance checks inside a Trusted Execution Environment.

## What it does

```text
You (in Claude or Cursor): "Check if 0x0330... is safe"
    |
MCP calls the check_wallet tool
    |
T3N TEE runs compliance logic (sanctions, risk scoring)
    |
Returns: BLOCK (score 85, flagged: directly_sanctioned)
```

## Tools

| Tool | Description |
| --- | --- |
| `check_wallet` | Check a single wallet for AML compliance risk |
| `check_batch` | Check multiple wallets at once, up to 50 |
| `explain_risk` | Get a detailed breakdown of what a risk score means |
| `get_sanctions` | View the sanctions list the engine checks against |
| `get_t3n_status` | Check Terminal 3 TEE connection status |

## Resources

| Resource | URI | Description |
| --- | --- | --- |
| Risk Scoring Guide | `r3nzo://risk-scoring-guide` | How scores and weights work |
| Sanctions List | `r3nzo://sanctions-list` | Cached OFAC sanctions data |

## Install

```bash
git clone https://github.com/maxxexee/aml-compliance-agent.git
cd aml-compliance-agent/mcp-server
npm ci
npm run build
```

## Connect to Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "r3nzo-compliance": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/build/index.js"],
      "env": {
        "T3N_API_KEY": "your-t3n-api-key"
      }
    }
  }
}
```

Restart Claude Desktop. The R3nzo tools appear in the tools menu.

## Connect to Cursor

Add this to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "r3nzo-compliance": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/build/index.js"],
      "env": {
        "T3N_API_KEY": "your-t3n-api-key"
      }
    }
  }
}
```

## Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

Open `http://localhost:6274` to test the tools interactively.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `T3N_API_KEY` | Yes | Terminal 3 API key for TEE attestation |
| `T3N_ENVIRONMENT` | No | `testnet` (default) or `production` |

## How it works

1. The server connects to Terminal 3 and authenticates on startup.
2. An AI agent calls `check_wallet` or `check_batch` with public addresses.
3. Compliance logic runs inside the trusted execution environment.
4. Only the verdict, score, and flags leave the enclave.

The current T3N test account has zero credits. The MCP server is ready, but the hosted API uses the JavaScript fallback until credits are available.

## Risk scoring

| Score | Verdict | Meaning |
| --- | --- | --- |
| 0 to 30 | APPROVE | Low risk, proceed |
| 31 to 70 | REVIEW | Medium risk, needs manual review |
| 71 to 100 | BLOCK | High risk, do not proceed |

Weighted factors:

- Sanctions matches: 40%
- Mixer interactions: 25%
- High-risk jurisdiction: 20%
- Transaction patterns: 15%

## Built with

- [Terminal 3 T3N SDK](https://docs.terminal3.io) for TEE infrastructure
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) for the Model Context Protocol
- [Zod](https://zod.dev) for schema validation

## License

Apache License 2.0. See [LICENSE](../LICENSE) and [NOTICE](../NOTICE).
