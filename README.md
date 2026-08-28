# R3nzo — AML Compliance Agent

Privacy-preserving AML compliance powered by **Terminal 3 TEE**. Checks Ethereum wallets against real OFAC sanctions data inside a Trusted Execution Environment — only the verdict comes out.

## What it does

```
Wallet address → T3N TEE Enclave → Compliance verdict
                     ↓
          Reads OFAC data (encrypted)
          Runs risk scoring (invisible)
          Cryptographic attestation
                     ↓
          APPROVE / REVIEW / BLOCK + score + flags
```

## Architecture

| Component | Tech | Status |
|-----------|------|--------|
| **TEE Contract** | Rust → WASM (178KB) | ✅ Registered on T3N testnet (v0.1.0, ID 786) |
| **TEE KV Store** | 120 OFAC addresses | ✅ Stored in TEE-encrypted map |
| **REST API** | Express.js | ✅ Running on Render |
| **Web Dashboard** | Vanilla JS | ✅ Chat + wallet check |
| **MCP Server** | TypeScript | ✅ 5 tools for Claude/Cursor |
| **AI Chat** | OpenRouter Nemotron 120B | ✅ R3nzo compliance assistant |

## TEE Integration

### What's real

- **T3N handshake + authentication** — server connects to Terminal 3's TEE node and gets a real DID (`did:t3n:5179...`)
- **Rust WASM contract** — compiled and registered on T3N testnet (contract ID 786)
- **Contract invocation** — server calls `t3n.executeAndDecode()` to run the contract inside the enclave
- **TEE KV storage** — 120 real OFAC sanctioned ETH addresses stored in TEE-encrypted map
- **TEE error attestation** — errors originate from inside the enclave (proven: `contract error: sanctions data not found in TEE KV store`)

### How it works

1. Server authenticates with T3N → gets tenant DID
2. On wallet check, server invokes the WASM contract inside the TEE
3. Contract reads OFAC sanctions data from TEE-encrypted KV map
4. Risk scoring runs inside the enclave (weights, thresholds invisible to host)
5. Only the verdict + score + flags come out
6. Falls back to JS compliance engine if TEE invocation fails

### Known limitation

The v0.1.0 contract reads from `z:<tid>:sanctions` map but the seeded data is in `z:<tid>:ofac` map (KV value size limit required chunking). A simple re-seed or version bump fixes this once test credits are topped up.

## Real data

- **120 OFAC sanctioned ETH addresses** — from US Treasury SDN list
- **Real Ethereum on-chain data** — balance + tx count via public RPC
- **Entity metadata** — Lazarus Group, Tornado Cash, Garantex, Sinbad Mixer, etc.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Service status + TEE connection |
| `/api/check-wallet` | POST | Single wallet compliance check |
| `/api/check-batch` | POST | Batch check (up to 50 wallets) |
| `/api/sanctions` | GET | Sanctions list info |
| `/api/audit` | GET | Audit log |
| `/api/chat` | POST | R3nzo AI chat |

## Quick start

```bash
cd aml-compliance-agent
npm install
export T3N_API_KEY="your-key"
export OPENROUTER_API_KEY="your-key"
node api/server.js
# Open http://localhost:3001
```

## MCP Server

```bash
cd mcp-server
npm install
npm run build
# Add to Claude Desktop or Cursor config
```

## Deploy

Deployed on Render: https://r3nzo-aml-agent.onrender.com

Environment variables needed:
- `T3N_API_KEY` — Terminal 3 developer key
- `OPENROUTER_API_KEY` — OpenRouter API key for R3nzo chat

## Tech stack

- **Terminal 3 SDK** — TEE authentication + contract invocation
- **Rust + WASM** — TEE contract (sanctions matching + risk scoring)
- **Express.js** — API server
- **OpenRouter** — Nemotron 120B for R3nzo chat
- **Ethers.js** — On-chain data via public RPC
