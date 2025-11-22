# USDC Compliance Agent

> **Agentic Commerce on Arc** — An autonomous AI agent that **owns a wallet** and executes compliant USDC settlements with cryptographic proof of regulatory compliance.

Built for Arc's vision of autonomous agents "programmatically sending, exchanging, and settling value globally in real-time."

## Deployed on Arc Testnet

| Component | Address | Explorer |
|-----------|---------|----------|
| **ArcAgentController** | `0x9f172d57F4cC8Ec6b4cf6Cf1875777b1594934D3` | [View](https://testnet.arcscan.io/address/0x9f172d57F4cC8Ec6b4cf6Cf1875777b1594934D3) |
| **Agent EOA** | `0x596C59B67fF13E336aC031fD5268322dA72443be` | [View](https://testnet.arcscan.io/address/0x596C59B67fF13E336aC031fD5268322dA72443be) |
| **Example TX** | `0x180dfcbd...` | [View](https://testnet.arcscan.io/tx/0x180dfcbd083e9269458a9cb8a7f34bbc0dfa5f2b1ecb698a50cead1ac89911fc) |

### Agent Wallet Ownership

The agent **owns and controls** its wallet, making autonomous spending decisions. Every transaction is preceded by:
1. **Dual-sided compliance screening** - Both sender (agent) and recipient checked via Circle Compliance Engine
2. **zkML proof generation** - Cryptographic attestation that compliance was evaluated
3. **Immutable audit trail** - Proof hash + signature stored for regulators

This enables true autonomous agents that institutions can trust.

---

## What This Demonstrates

**The Problem**: Institutions want to deploy autonomous agents for payments, but can't without compliance guarantees.

**The Solution**: This agent generates **zkML proofs** that cryptographically prove compliance was evaluated before every settlement—creating an immutable audit trail that satisfies regulators.

### Integration Stack

| Component | Provider | Purpose |
|-----------|----------|---------|
| Compliance Screening | [Circle Compliance Engine](https://www.circle.com/wallets/compliance-engine) | AML/CFT checks, sanctions screening |
| zkML Proofs | [NovaNet](https://novanet.xyz) / JOLT-Atlas | Cryptographic proof of compliance |
| Trustless Controller | ArcAgentController | On-chain proof verification before transfers |
| Settlement Layer | [Arc Network](https://arc.network) | Sub-second finality, USDC-native |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Arc testnet USDC ([faucet](https://faucet.circle.com))
- Built jolt-atlas prover

### Step 1: Install Dependencies

```bash
cd demos/usdc-compliance-agent
npm install
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Required: Arc testnet wallet
PRIVATE_KEY=your_private_key_without_0x

# Optional: Circle integration (enables live compliance + managed wallets)
CIRCLE_API_KEY=TEST_API_KEY:key_id:key_secret
CIRCLE_WALLET_ID=your-circle-wallet-id
```

### Step 3: Start the Agent

```bash
npm start
```

Output:
```
=== USDC Compliance Agent ===
Agent Wallet: 0x596C59B67fF13E336aC031fD5268322dA72443be
Network: Arc Testnet (5042002)
zkML Available: true
Compliance Mode: MOCK
====================================

USDC Compliance Agent running on http://localhost:8619
```

### Step 4: Execute a Settlement

```bash
curl -X POST http://localhost:8619/settle \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91",
    "amount": "0.1",
    "reference": "INV-2024-001"
  }'
```

**Response:**
```json
{
  "id": "SET-1700000000000",
  "approved": true,
  "screening": {
    "result": "APPROVED",
    "riskScore": 3,
    "source": "mock",
    "sender": { "result": "APPROVED", "riskScore": 3 },
    "recipient": { "result": "APPROVED", "riskScore": 3 }
  },
  "proof": {
    "hash": "3ff6295a3cdf1efc1bbaecf67b715a52",
    "decision": "AUTHORIZED",
    "confidence": 77,
    "proveTimeMs": 2172,
    "verifyTimeMs": 364
  },
  "txHash": "0xd6905fc7c877006952073f3a282e33bea45a35948893fe1dc3880675645f9bcd",
  "explorerUrl": "https://testnet.arcscan.io/tx/0xd6905fc7...",
  "travelRuleRequired": false
}
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                  Settlement Request                      │
│         POST /settle { to, amount, reference }          │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│      Steps 1-2: Dual-Sided Compliance Screening          │
│                                                         │
│   Circle Compliance Engine API                          │
│   • Screen SENDER (agent's wallet)                      │
│   • Screen RECIPIENT address                            │
│   • Check sanctions lists for both                      │
│   • Calculate risk scores                               │
│                                                         │
│   Output: APPROVED/DENIED + risk levels for both        │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│           Step 4: zkML Proof Generation                  │
│                                                         │
│   JOLT-Atlas Prover (~2.3 seconds)                      │
│   • Prove compliance model executed correctly           │
│   • Cryptographic attestation of decision               │
│   • Verifiable by anyone                                │
│                                                         │
│   Output: proof_hash + decision + confidence            │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│           Step 5: Commitment Signing                     │
│                                                         │
│   EIP-712 Typed Data Signature                          │
│   • Sign proof hash + decision + timestamp              │
│   • Creates verifiable commitment                       │
│                                                         │
│   Output: signature (for on-chain anchoring)            │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│           Step 6: Settlement Execution                   │
│                                                         │
│   Agent Wallet (EOA with private key)                   │
│   • Execute USDC transfer on Arc                        │
│   • Sub-second finality                                 │
│   • Transaction includes proof reference                │
│                                                         │
│   Output: txHash + explorerUrl                          │
└────────────────────────┬────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Immutable Audit Trail                       │
│                                                         │
│   Every settlement recorded with:                       │
│   • Compliance screening result                         │
│   • zkML proof hash                                     │
│   • Signed commitment                                   │
│   • On-chain transaction                                │
└─────────────────────────────────────────────────────────┘
```

---

## API Reference

### `GET /health`

Agent status and statistics.

```bash
curl http://localhost:8619/health
```

```json
{
  "service": "USDC Compliance Agent",
  "status": "operational",
  "agent": {
    "eoaWallet": "0x596C59B67fF13E336aC031fD5268322dA72443be",
    "circleWallet": null,
    "balance": "100.00 USDC",
    "walletMode": "eoa"
  },
  "capabilities": {
    "zkmlProofs": true,
    "complianceMode": "mock",
    "circleWallet": false
  },
  "stats": {
    "totalSettlements": 5,
    "approved": 4,
    "denied": 1
  }
}
```

### `POST /screen`

Screen an address for compliance.

```bash
curl -X POST http://localhost:8619/screen \
  -H "Content-Type: application/json" \
  -d '{"address": "0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91"}'
```

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91",
  "result": "APPROVED",
  "riskScore": 3,
  "sanctions": false,
  "source": "mock"
}
```

### `POST /settle`

Execute a compliant settlement.

```bash
curl -X POST http://localhost:8619/settle \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91",
    "amount": "0.1",
    "reference": "VENDOR-PAY-001",
    "memo": "Q4 services"
  }'
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | address | Yes | Recipient address |
| `amount` | string | Yes | USDC amount |
| `reference` | string | No | Payment reference |
| `memo` | string | No | Internal memo |

### `GET /settlements`

List settlement history.

```bash
curl http://localhost:8619/settlements
```

---

## Configuration Modes

### Mode 1: Demo (Default)

Works immediately with mock data.

```bash
PRIVATE_KEY=your_key
```

- Mock compliance screening (90% approval rate)
- EOA wallet transfers
- Real zkML proofs

### Mode 2: Live Compliance

Add Circle API key for real compliance screening.

```bash
PRIVATE_KEY=your_key
CIRCLE_API_KEY=TEST_API_KEY:xxx:xxx
```

- Real Circle Compliance Engine
- Actual sanctions screening
- Production risk scores

### Mode 3: Full Circle Integration

Add Circle API for live compliance screening.

```bash
PRIVATE_KEY=your_key
CIRCLE_API_KEY=TEST_API_KEY:xxx:xxx
```

- Agent owns wallet via private key (true ownership)
- Real Circle Compliance Engine screening
- Production-grade AML/CFT checks

### Mode 4: Trustless Controller (Recommended)

Deploy ArcAgentController for on-chain proof enforcement.

```bash
PRIVATE_KEY=your_key
CIRCLE_API_KEY=TEST_API_KEY:xxx:xxx
ARC_AGENT_CONTROLLER_ADDRESS=0x9f172d57F4cC8Ec6b4cf6Cf1875777b1594934D3
```

- **On-chain enforcement**: Controller verifies EIP-712 signatures before releasing USDC
- **Proof-gated transfers**: Funds can't move without valid zkML proof
- **Immutable audit trail**: Every transfer emits `TransferExecuted` event with proofHash
- **Replay protection**: Nonces prevent signature reuse

To deploy your own controller:
```bash
node contracts/compile-and-deploy.cjs
```

---

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Compliance Screen | <100ms | Circle API or mock |
| zkML Proof Generation | ~2.3s | JOLT-Atlas prover |
| Proof Verification | ~350ms | Cryptographic verification |
| Arc Settlement | <1s | Sub-second finality |
| **Total E2E** | **~3-4s** | Full compliant settlement |

**Resource Usage:**
- Peak Memory: ~170 MB
- CPU: Multi-threaded (6 cores)

---

## Why This Matters

### For Arc

**Agentic Commerce**: Demonstrates Arc's core vision—autonomous agents transacting with real money, in real-time, with institutional-grade compliance.

**Institutional Adoption**: Shows how BlackRock, HSBC, Visa can deploy AI agents with regulatory confidence.

**Sub-second Finality**: Leverages Arc's deterministic finality for real-time settlement.

### For Circle

**Compliance Engine**: Real-world use case for automated AML/CFT screening.

**Programmable Wallets**: Shows developer-controlled wallets for agent operations.

**Integrated Stack**: Compliance + Wallets + Settlement in one seamless flow.

### For Institutions

**Audit Trail**: Every decision has cryptographic proof, not just logs.

**Regulatory Confidence**: zkML proofs satisfy compliance requirements.

**Automation**: Deploy agents without compromising on compliance.

---

## Use Cases

| Use Case | Description |
|----------|-------------|
| **Treasury Operations** | Automated disbursements with compliance proofs |
| **Vendor Payments** | AP automation with sanctions screening |
| **Payroll** | Compliant salary payments |
| **Cross-border Settlement** | International transfers with Travel Rule support |
| **DeFi Operations** | Autonomous position management |

---

## Getting Circle API Keys

1. Go to [console.circle.com](https://console.circle.com)
2. Create account or sign in
3. Navigate to **Developer** → **API Keys**
4. Create key for **Web3 Services**
5. Copy full key (format: `TEST_API_KEY:xxx:xxx`)

For Programmable Wallets:
1. Navigate to **Wallets** in console
2. Create a developer-controlled wallet
3. Copy the Wallet ID

---

## Testnet Funding

Get USDC for your agent:

1. Go to [faucet.circle.com](https://faucet.circle.com)
2. Select **Arc Testnet**
3. Enter agent address
4. Receive 10 USDC (once per hour)

---

## Security Notes

⚠️ **Testnet Only** — Never use mainnet private keys

⚠️ **Unaudited** — Demo code, not production-ready

⚠️ **Key Security** — Store private keys securely

---

## Architecture

```
demos/usdc-compliance-agent/   # USDC Compliance Agent
├── server.cjs                 # Main agent server
├── contracts/
│   ├── ArcAgentController.sol # Trustless controller contract
│   ├── ArcAgentController.json # Compiled ABI
│   └── compile-and-deploy.cjs # Deployment script
├── package.json
├── .env                       # Configuration
└── README.md

Shared dependencies:
├── shared/zkml-client/        # JOLT-Atlas client
├── shared/arc-utils/          # Arc blockchain utils
└── jolt-atlas/                # zkML prover (172MB binary)
```

---

## Next Steps

1. **Get Circle API keys** for live compliance
2. **Create Circle Wallet** for managed transfers
3. **Fund agent** with testnet USDC
4. **Integrate** with your settlement workflows
5. **Scale** with additional agent instances

---

## Resources

- [Arc Network](https://arc.network) — L1 for agentic commerce
- [Arc Docs](https://docs.arc.network) — Technical documentation
- [NovaNet](https://novanet.xyz) — zkML proving network
- [Circle Compliance Engine](https://www.circle.com/wallets/compliance-engine) — AML/CFT screening
- [JOLT-Atlas](https://github.com/ICME-Lab/jolt-atlas) — zkML prover

---

## License

MIT
