# R3nzo MCP Server

Privacy-preserving AML compliance tools as an MCP server, powered by Terminal 3 TEE.

Connect any AI agent (Claude, Cursor, Codex) to run wallet compliance checks inside a Trusted Execution Environment.

## What It Does

```
You (in Claude/Cursor): "Check if 0xd857... is safe"
    ↓
MCP calls check_wallet tool
    ↓
T3N TEE runs compliance logic (sanctions, risk scoring)
    ↓
Returns: BLOCK (score 85, flagged: directly_sanctioned)
```

## Tools

| Tool | Description |
|------|-------------|
| `check_wallet` | Check a single wallet for AML compliance risk |
| `check_batch` | Check multiple wallets at once (up to 50) |
| `explain_risk` | Get a detailed breakdown of what a risk score means |
| `get_sanctions` | View the sanctions list the engine checks against |
| `get_t3n_status` | Check Terminal 3 TEE connection status |

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Risk Scoring Guide | `r3nzo://risk-scoring-guide` | How scores and weights work |
| Sanctions List | `r3nzo://sanctions-list` | Cached OFAC sanctions data |

## Install

```bash
# Clone the repo
git clone https://github.com/geekman58748/aml-compliance-agent.git
cd aml-compliance-agent/mcp-server

# Install and build
npm install
npm run build
```

## Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Restart Claude Desktop. You'll see a 🔨 icon when tools are available.

## Connect to Cursor

Add to `~/.cursor/mcp.json`:

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

Open `http://localhost:6274` to test tools interactively.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `T3N_API_KEY` | Yes | Terminal 3 API key for TEE attestation |
| `T3N_ENVIRONMENT` | No | `testnet` (default) or `production` |

## How It Works

1. **T3N Handshake** — On startup, connects to Terminal 3 TEE and authenticates
2. **Tool Calls** — AI agent calls `check_wallet` with an address
3. **TEE Processing** — Compliance logic runs inside the trusted execution environment
4. **Result** — Only the verdict (score + flags) comes out — raw data stays in the enclave

## Risk Scoring

| Score | Verdict | Meaning |
|-------|---------|---------|
| 0–30 | ✅ APPROVE | Low risk, proceed |
| 31–70 | ⚠️ REVIEW | Medium risk, needs manual review |
| 71–100 | ❌ BLOCK | High risk, do not proceed |

**Weighted factors:**
- Sanctions matches: 40%
- Mixer interactions: 25%
- High-risk jurisdiction: 20%
- Transaction patterns: 15%

## Built With

- [Terminal 3 T3N SDK](https://docs.terminal3.io) — TEE infrastructure
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — Model Context Protocol
- [Zod](https://zod.dev) — Schema validation

## License

MIT
