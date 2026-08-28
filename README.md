# 🔒 R3nzo — AML Crypto Compliance Agent

**Privacy-preserving wallet risk analysis powered by Terminal 3 TEE**

Built for the [Terminal 3 Enterprise Agent Bounty](https://go.terminal3.io/adk-community)

---

## Problem Statement

Crypto businesses need to comply with AML (Anti-Money Laundering) regulations — but traditional compliance tools expose sensitive data. When an exchange checks a wallet against sanctions lists, that checking logic, the sanctions data, and the risk algorithm all sit in plaintext on a server. Any breach leaks the entire compliance infrastructure.

**Terminal 3's TEE solves this.** R3nzo runs all sensitive compliance logic inside a hardware-secured Trusted Execution Environment — the sanctions matching, risk scoring, and audit trail creation happen inside an enclave that even the server operator can't access.

---

## What R3nzo Does

```
┌──────────────────────────────────────────────────────────┐
│                    USER SUBMITS WALLET                    │
│                 (0xd857...981 or natural language)        │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│              ON-CHAIN DATA (public blockchain)            │
│         Pulls transactions, interactions, patterns       │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│            TERMINAL 3 TEE (private enclave)               │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────┐              │
│  │ Sanctions Check │  │  Risk Scoring    │              │
│  │ (OFAC/EU/UN)    │  │  (weighted formula)│             │
│  └─────────────────┘  └──────────────────┘              │
│                                                          │
│  ┌──────────────────────────────────────────┐           │
│  │        Immutable Audit Trail              │           │
│  └──────────────────────────────────────────┘           │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   VERDICT RETURNED                        │
│                                                          │
│  ✅ APPROVE (score 0-30)   — Low risk, safe to proceed  │
│  ⚠️  REVIEW (score 31-70)  — Medium risk, needs review  │
│  ❌ BLOCK   (score 71-100) — High risk, do not proceed  │
└──────────────────────────────────────────────────────────┘
```

**What stays private (inside TEE):**
- Sanctions list matching logic
- Risk scoring algorithm
- Audit trail records

**What stays public:**
- Wallet address (it's on the blockchain)
- Transaction history (it's on the blockchain)
- The verdict (shared with compliance team)

---

## Why Terminal 3

| Feature | Benefit |
|---------|---------|
| **TEE (Trusted Execution Environment)** | Sensitive checks run in a hardware-secured enclave |
| **DID Integration** | Verifiable identity for enterprises |
| **Immutable Audit Trail** | Tamper-proof compliance records |
| **Privacy** | Agent never sees raw data or matching logic |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Terminal 3 API key ([get one here](https://go.terminal3.io/adk-community))

### Setup

```bash
# Clone the repo
git clone https://github.com/your-username/aml-compliance-agent.git
cd aml-compliance-agent

# Install dependencies
npm install

# Set your Terminal 3 API key
export T3N_API_KEY="your-key-here"

# Start the server
npm start
```

### Verify Connection

```bash
# Health check — should show t3n_connected: true
curl http://localhost:3001/api/health

# Check a sanctioned wallet — should return BLOCK
curl -X POST http://localhost:3001/api/check-wallet \
  -H "Content-Type: application/json" \
  -d '{"wallet": "0xd8579921026d261b853607856136bfc6a8a3b981"}'

# Run the self-testing script
npm test
```

---

## API Endpoints

### POST `/api/check-wallet`

Check a single wallet for AML compliance.

**Request:**
```json
{
  "wallet": "0xd8579921026d261b853607856136bfc6a8a3b981",
  "check_type": "aml",
  "jurisdiction": "US"
}
```

**Response (Blocked):**
```json
{
  "status": "BLOCK",
  "wallet": "0xd8579921026d261b853607856136bfc6a8a3b981",
  "risk_score": 85,
  "flags": ["directly_sanctioned", "mixer_interaction"],
  "audit_id": "t3n-1787910133881-bh3j0tr53",
  "jurisdiction": "GLOBAL",
  "timestamp": "2026-08-28T09:42:13.881Z"
}
```

**Response (Approved):**
```json
{
  "status": "APPROVE",
  "wallet": "0x0000000000000000000000000000000000000001",
  "risk_score": 0,
  "flags": [],
  "audit_id": "t3n-1787910153571-hcim2rzkn",
  "jurisdiction": "GLOBAL",
  "timestamp": "2026-08-28T09:42:33.571Z"
}
```

### POST `/api/check-batch`

Check multiple wallets at once.

**Request:**
```json
{
  "wallets": [
    "0x0000000000000000000000000000000000000001",
    "0xd8579921026d261b853607856136bfc6a8a3b981"
  ]
}
```

**Response:**
```json
{
  "total": 2,
  "approved": 1,
  "review": 0,
  "blocked": 1,
  "results": [...]
}
```

### GET `/api/health`

```json
{
  "status": "ok",
  "service": "AML Compliance Agent",
  "t3n_connected": true,
  "tenant_did": "did:t3n:51792674f39e3f1958ddc7c7c52f51860fa60fa0"
}
```

### GET `/api/audit`

Returns the last 50 compliance checks.

### GET `/api/sanctions`

Returns sanctions list metadata.

---

## Risk Scoring

| Factor | Weight | Source | Verdict |
|--------|--------|--------|---------|
| Sanctioned connections | 40% | OFAC / EU / UN lists | BLOCK if matched |
| Mixer interactions | 25% | On-chain analysis | REVIEW if detected |
| High-risk jurisdiction | 20% | Country code check | REVIEW if flagged |
| Transaction patterns | 15% | Volume analysis | APPROVE if normal |

**Score ranges:**
- 0–30 → APPROVE
- 31–70 → REVIEW
- 71–100 → BLOCK

---

## Web Dashboard

Open `web/pages/index.html` in your browser for a visual interface.

Features:
- 🔍 Wallet address input with real-time results
- 💬 Chat with R3nzo (requires Ollama + Qwen3:8b locally)
- ✅ Color-coded risk visualization
- 📋 Flag details and audit trail

---

## Architecture

```
aml-compliance-agent/
├── api/
│   ├── server.js          # Express API (port 3001)
│   ├── agent.js           # R3nzo AI brain (Ollama + Qwen3)
│   ├── sanctions.js       # OFAC/EU/UN sanctions checking
│   └── onchain.js         # On-chain analysis (Ethers.js)
├── t3n-contracts/
│   └── compliance.js      # T3N SDK integration + TEE logic
├── web/
│   └── pages/
│       └── index.html     # Landing page + demo dashboard
├── quickstart.mjs         # Standalone T3N connection test
├── test.js                # Self-testing script
├── config.json            # Risk thresholds and weights
├── .env                   # API keys (gitignored)
└── package.json
```

---

## Configuration

Edit `config.json` to customize:

```json
{
  "compliance": {
    "risk_thresholds": {
      "approve": 30,
      "review": 70,
      "block": 100
    },
    "weights": {
      "sanctioned": 0.40,
      "mixer": 0.25,
      "jurisdiction": 0.20,
      "patterns": 0.15
    }
  }
}
```

---

## Enterprise Use Cases

1. **Crypto Exchanges** — Verify incoming wallets before processing deposits
2. **DeFi Protocols** — Check addresses before allowing transactions
3. **Payment Processors** — Screen crypto payments for compliance
4. **Banks** — AML compliance for crypto-related accounts

---

## Bug Report

| Bug | Workaround | Status |
|-----|------------|--------|
| WASM loading fails under Next.js/Turbopack | Run API as standalone Express server | Known issue (documented in T3N docs) |
| Ollama chat requires local Qwen3:8b | Install Ollama + pull qwen3:8b model | Expected — cloud LLM alternative planned |
| On-chain data currently simulated | Real Ethers.js integration in progress | TODO |
| T3N handshake can timeout on slow networks | Retry logic built into SDK | Fixed |

---

## Maintenance

| Task | How |
|------|-----|
| Update sanctions list | Edit `mixer_addresses` in `api/sanctions.js` |
| Change risk thresholds | Edit `config.json` |
| Add new risk factors | Add logic in `t3n-contracts/compliance.js` |
| Deploy | `export T3N_API_KEY=... && npm start` |

---

## Handover

To hand over to the Terminal 3 team:

```bash
git clone https://github.com/your-username/aml-compliance-agent.git
cd aml-compliance-agent
npm install
export T3N_API_KEY="your-key"
npm start
# Done — agent is live on port 3001
```

---

## License

MIT

---

*Built for [Terminal 3 Enterprise Agent Bounty](https://go.terminal3.io/adk-community) — August 2026*
