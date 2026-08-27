# 🔒 AML Compliance Agent

**Privacy-preserving wallet risk analysis powered by Terminal 3 TEE**

Built for the Terminal 3 Enterprise Agent Bounty

---

## What This Does

An AML (Anti-Money Laundering) compliance agent that verifies wallet addresses against sanctions lists and on-chain risk data — without exposing sensitive data.

### How It Works

```
[User enters wallet] → [On-chain data pulled] → [TEE processes] → [Verdict returned]
                                              ↓
                                    Agent NEVER sees:
                                    - Private keys
                                    - Sanctions matching logic
                                    - Risk scoring algorithm
```

---

## Why Terminal 3?

| Feature | Benefit |
|---------|---------|
| **TEE (Trusted Execution Environment)** | Sensitive checks run in secure enclave |
| **DID Integration** | Verifiable identity for enterprises |
| **Audit Trail** | Immutable compliance records |
| **Privacy** | Agent never sees raw data |

---

## Quick Start

### 1. Get Terminal 3 API Key

Go to https://go.terminal3.io/adk-community and sign up.

### 2. Install & Run

```bash
# Clone the repo
git clone https://github.com/your-username/aml-compliance-agent.git
cd aml-compliance-agent

# Install dependencies
npm install

# Set API key
export T3N_API_KEY="your-key-here"

# Start the server
npm start
```

### 3. Test It

```bash
# Run tests
npm test

# Or test manually
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/check-wallet \
  -H "Content-Type: application/json" \
  -d '{"wallet": "0x1234567890abcdef1234567890abcdef12345678"}'
```

---

## API Endpoints

### POST /api/check-wallet

Check a single wallet for AML compliance.

**Request:**
```json
{
  "wallet": "0x1234...abcd",
  "check_type": "aml",
  "jurisdiction": "US"
}
```

**Response (Safe):**
```json
{
  "status": "APPROVE",
  "wallet": "0x1234...abcd",
  "risk_score": 12,
  "flags": [],
  "audit_id": "t3n-abc-123",
  "timestamp": "2026-08-27T10:00:00Z"
}
```

**Response (High Risk):**
```json
{
  "status": "BLOCK",
  "wallet": "0xdead...beef",
  "risk_score": 87,
  "flags": ["directly_sanctioned", "mixer_interaction"],
  "audit_id": "t3n-def-456",
  "timestamp": "2026-08-27T10:00:00Z"
}
```

### POST /api/check-batch

Check multiple wallets at once.

### GET /api/sanctions

Get sanctions list information.

### GET /api/audit

Get audit trail history.

### GET /api/health

Health check.

---

## Web Dashboard

Open `web/pages/index.html` in your browser for a visual interface.

Features:
- ✅ Wallet address input
- ✅ Real-time risk scoring
- ✅ Color-coded results
- ✅ Flag details
- ✅ Audit trail display

---

## Risk Scoring

| Score | Verdict | Meaning |
|-------|---------|---------|
| 0-30 | APPROVE | Low risk, safe to proceed |
| 31-70 | REVIEW | Medium risk, needs manual review |
| 71-100 | BLOCK | High risk, do not proceed |

### Factors Checked

| Factor | Weight | Source |
|--------|--------|--------|
| Sanctioned connections | 40% | OFAC/EU/UN lists |
| Mixer interactions | 25% | On-chain analysis |
| High-risk jurisdiction | 20% | Country data |
| Transaction patterns | 15% | Volume analysis |

---

## Project Structure

```
aml-compliance-agent/
├── api/
│   └── server.js          # Express API server
├── t3n-contracts/
│   └── compliance.ts      # TEE compliance logic
├── web/
│   └── pages/
│       └── index.html     # Web dashboard
├── config.json            # Configuration
├── test.js                # Test script
├── README.md              # This file
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
    }
  }
}
```

---

## Enterprise Use Cases

1. **Crypto Exchanges** — Verify incoming wallets before listing
2. **DeFi Protocols** — Check addresses before allowing transactions
3. **Payment Processors** — Screen crypto payments
4. **Banks** — Compliance for crypto-related accounts

---

## Maintenance

This agent is designed for easy maintenance:

| Task | How |
|------|-----|
| Update sanctions list | Edit `mixer_addresses` in config.json |
| Change risk thresholds | Edit `risk_thresholds` in config.json |
| Add new checks | Add logic in `t3n-contracts/compliance.ts` |
| Deploy | `npm start` |

---

## Handover

To hand over to Terminal 3 team:

1. Clone repo
2. `npm install`
3. Set `T3N_API_KEY`
4. `npm start`
5. Done!

---

## Bugs & Issues

Document any bugs encountered during development:

| Bug | Workaround | Status |
|-----|------------|--------|
| WASM loading in Next.js | Run API separately | Open |
| T3N handshake timeout | Retry 3 times | Fixed |

---

## License

MIT

---

*Built for Terminal 3 Enterprise Agent Bounty*
