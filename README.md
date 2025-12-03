# Arc zkML Demos

**Trustless AI Agent Commerce on Arc Blockchain**

This repository demonstrates autonomous AI agents executing USDC payments with cryptographic proofs of compliance and decision-making. Built on [Arc Network](https://arc.network) with [NovaNet](https://novanet.xyz) zkML infrastructure.

---

## Three Demos

| Demo | Description | Key Integration | Port |
|------|-------------|-----------------|------|
| [Trustless USDC Spending Agent](demos/trustless-usdc-spending-agent/) | zkML-proven payments with Circle OOAK workflow hooks | x402 + OOAK | 8616 |
| [Trustless USDC Compliance Agent](demos/trustless-usdc-compliance-agent/) | Autonomous agent with dual-sided compliance screening | Circle Compliance Engine | 8619 |
| [Trustless Robot Commerce](demos/trustless-robot-commerce/) | Two-robot cross-chain payments for collision footage | Circle Gateway | 3000 |

---

## Demo 1: Trustless USDC Spending Agent

**AI agent payments with approval workflow hooks**

```
User Request → WalletInstanceAgent → @secure_tool: send_usdc
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
            Approval Hook 1/3     Approval Hook 2/3     Approval Hook 3/3
            ONNX Authorization    zkML Proof (x402)     EIP-712 Commitment
                    │                     │                     │
                    └─────────────────────┼─────────────────────┘
                                          ▼
                              Workflow Manager Decision
                                          ▼
                              USDC Transfer on Arc
```

**Stack**: Circle OOAK, x402 Protocol, JOLT-Atlas zkML, Arc Testnet

**Run**:
```bash
cd demos/trustless-usdc-spending-agent
npm install && npm start
# Open http://localhost:8616
```

---

## Demo 2: Trustless USDC Compliance Agent

**Autonomous agent with regulatory compliance proofs**

```
Settlement Request → Dual-Sided Compliance Screening (Circle API)
                              ▼
              Transform to ONNX Model Features
                              ▼
              zkML Proof Generation (JOLT-Atlas)
                              ▼
              EIP-712 Commitment Signing
                              ▼
              USDC Settlement on Arc
                              ▼
              Immutable Audit Trail
```

**Stack**: Circle Compliance Engine, JOLT-Atlas zkML, Arc Testnet

**Run**:
```bash
cd demos/trustless-usdc-compliance-agent
npm install && npm start
# Open http://localhost:8619
```

---

## Demo 3: Trustless Robot Commerce

**Two robots on different chains paying each other for data**

```
┌─────────────────────────┐              ┌─────────────────────────┐
│     DELIVERYBOT         │              │      WITNESSBOT         │
│     Arc Testnet         │              │      Base Sepolia       │
│                         │              │                         │
│  1. Collision detected  │              │                         │
│  2. OpenMind AI decides │              │                         │
│  3. zkML severity proof │              │                         │
│  4. x402 payment request│─────────────▶│  5. HTTP 402 response   │
│  6. Circle Gateway pay  │─────────────▶│  7. Verify on-chain     │
│  9. Receive footage     │◀─────────────│  8. Analyze + return    │
└─────────────────────────┘              └─────────────────────────┘
```

**Stack**: Circle Gateway, OpenMind LLM/VILA, JOLT-Atlas zkML, x402 Protocol

**Run**:
```bash
cd demos/trustless-robot-commerce
npm install && npm start
# Open http://localhost:3000
```

---

## What Makes These Demos "Trustless"

Traditional AI agents just log their decisions—you have to trust they did what they claim. These demos use **zkML proofs** to cryptographically prove:

1. **The exact model ran**: Not a different model, not manipulated outputs
2. **On the exact inputs**: Compliance screening results actually fed into the decision
3. **Producing the exact output**: The AUTHORIZED/DENIED decision is authentic

This means you can deploy AI agents from untrusted sources and still verify their behavior.

---

## Core Technology

### JOLT-Atlas zkML

Zero-knowledge machine learning framework that generates cryptographic proofs of neural network inference. Located in [`jolt-atlas/`](jolt-atlas/).

```bash
# Build the collision severity prover
cd jolt-atlas
cargo build --release --example collision_severity_json

# Build the authorization model prover
cargo build --release --example authorization
```

### Shared Components

| Component | Location | Purpose |
|-----------|----------|---------|
| zkML Client | `shared/zkml-client/` | Node.js wrapper for JOLT-Atlas binary |
| Arc Utils | `shared/arc-utils/` | Arc blockchain utilities |

---

## What's Real vs Simulated

| Component | Status | Notes |
|-----------|--------|-------|
| zkML Proofs | Real | JOLT-Atlas SNARK prover generates real proofs |
| ONNX Models | Real | 8-input neural networks for authorization/severity |
| Circle Compliance | Real | Live API calls to Circle Compliance Engine |
| Wallet Addresses | Real | Actual Arc Testnet and Base Sepolia addresses |
| Gateway Payments | Simulated | Uses mock for cross-chain transfers |
| OpenMind API | Simulated | Mock responses for AI decisions |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Rust (for building JOLT-Atlas)
- Arc Testnet USDC ([faucet](https://faucet.circle.com))

### 1. Build zkML Prover (Optional)

```bash
cd jolt-atlas
cargo build --release --example collision_severity_json
cargo build --release --example authorization_json
```

Demos work with mock proofs if prover is not built.

### 2. Run a Demo

```bash
# Demo 3: Robot Commerce (recommended to start)
cd demos/trustless-robot-commerce
npm install
npm start
# Open http://localhost:3000 and click "Start Collision Demo"
```

### 3. Get Testnet Funds

1. Go to [faucet.circle.com](https://faucet.circle.com)
2. Select **Arc Testnet**
3. Enter your wallet address
4. Receive 10 USDC (once per hour)

---

## Repository Structure

```
arc/
├── jolt-atlas/                    # JOLT-Atlas zkML prover (Rust)
│   └── examples/
│       ├── authorization/         # Transaction authorization model
│       └── collision_severity_json/ # Collision severity model
├── shared/
│   ├── zkml-client/               # Node.js zkML wrapper
│   └── arc-utils/                 # Blockchain utilities
└── demos/
    ├── trustless-usdc-spending-agent/    # Demo 1: OOAK + x402
    ├── trustless-usdc-compliance-agent/  # Demo 2: Compliance Engine
    └── trustless-robot-commerce/         # Demo 3: Robot Commerce
```

---

## Performance

| Metric | Value |
|--------|-------|
| Proof Generation | ~2.3 seconds |
| Verification | ~350 ms |
| Peak Memory | ~170 MB |
| Model | 8 inputs, binary output |

---

## Integration Partners

| Partner | Integration | Demo |
|---------|-------------|------|
| [Circle](https://circle.com) | OOAK, Compliance Engine, Gateway | All demos |
| [NovaNet](https://novanet.xyz) | zkML proving network | All demos |
| [OpenMind](https://portal.openmind.org) | LLM + VILA AI models | Demo 3 |
| [Coinbase](https://x402.org) | x402 micropayments | Demo 1, 3 |

---

## Resources

- [Arc Network](https://arc.network) - L1 for agentic commerce
- [Arc Docs](https://docs.arc.network) - Technical documentation
- [NovaNet](https://novanet.xyz) - zkML proving network
- [Circle Compliance Engine](https://www.circle.com/wallets/compliance-engine) - AML/CFT screening
- [JOLT-Atlas](https://github.com/ICME-Lab/jolt-atlas) - zkML prover
- [x402 Protocol](https://www.x402.org) - HTTP 402 micropayments

---

## Security

**These are testnet demos only!**

- Never use mainnet private keys
- Smart contracts are unaudited
- Demo code, not production-ready

---

## License

MIT
