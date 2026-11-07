# R3nzo: AML Compliance Agent

Privacy-preserving AML compliance powered by **Terminal 3 TEE**. Checks Ethereum wallets against real OFAC sanctions data inside a Trusted Execution Environment: only the verdict comes out.

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
| **TEE Contract** | Rust to WASM (182KB) | v0.2.2 built; v0.1.0 registered as ID 786 |
| **TEE KV Store** | 120 OFAC addresses | Stored in TEE-encrypted `ofac` map |
| **REST API** | Express.js | Runs locally; Render service needs redeploy |
| **Web Dashboard** | Vanilla JS | Chat and wallet check |
| **MCP Server** | TypeScript | 5 tools for Claude and Cursor |
| **AI Chat** | OpenRouter Nemotron 120B | R3nzo compliance assistant |

## TEE Integration

### What's real

- **T3N handshake + authentication**: server connects to Terminal 3's TEE node and gets a real DID (`did:t3n:5179...`)
- **Rust WASM contract**: compiled and registered on T3N testnet (contract ID 786)
- **Contract invocation**: server calls `t3n.executeAndDecode()` to run the contract inside the enclave
- **TEE KV storage**: 120 real OFAC sanctioned ETH addresses stored in TEE-encrypted map
- **Current T3N status**: the test account has zero credits, so checks use the JS fallback until credits are topped up. The v0.2.2 contract is built and ready to register.
- **TEE error attestation**: errors originate from inside the enclave (proven: `contract error: sanctions data not found in TEE KV store`)

### How it works

1. Server authenticates with T3N → gets tenant DID
2. On wallet check, server invokes the WASM contract inside the TEE
3. Contract reads OFAC sanctions data from TEE-encrypted KV map
4. Risk scoring runs inside the enclave (weights, thresholds invisible to host)
5. Only the verdict + score + flags come out
6. Falls back to JS compliance engine if TEE invocation fails

### Current limitation

The registered contract is v0.1.0. It reads from `z:<tid>:sanctions`, while the seeded OFAC data is in `z:<tid>:ofac`.

The v0.2.2 source in this repo reads `ofac_eth` from `z:<tid>:ofac` and falls back to chunked keys. It builds cleanly as a 182KB WASM.

Registration is blocked because the T3N test account has zero credits. After topping up, run:

```bash
node t3n-contract/register-v2.mjs
```

## Real data

- **120 OFAC sanctioned ETH addresses**: from US Treasury SDN list
- **Real Ethereum on-chain data**: balance + tx count via public RPC
- **Entity metadata**: Lazarus Group, Tornado Cash, Garantex, Sinbad Mixer, etc.

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

The previous Render service is offline. Deploy a new web service from this repo using the included `render.yaml`:

https://render.com/deploy?repo=https://github.com/maxxexee/aml-compliance-agent

Set `T3N_API_KEY` and `OPENROUTER_API_KEY` when prompted. The app runs with the JS fallback until T3N credits are available.

## Tech stack

- **Terminal 3 SDK**: TEE authentication + contract invocation
- **Rust + WASM**: TEE contract (sanctions matching + risk scoring)
- **Express.js**: API server
- **OpenRouter**: Nemotron 120B for R3nzo chat
- **Ethers.js**: On-chain data via public RPC
