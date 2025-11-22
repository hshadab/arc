# Arc zkML Demos

Collection of demos showcasing **zkML (zero-knowledge machine learning)** proofs for trustless AI agents on [Arc Network](https://www.arc.network).

## Overview

These demos use [JOLT-Atlas](https://github.com/ICME-Lab/jolt-atlas) to generate cryptographic proofs that ML models executed correctly, enabling trustless autonomous agents for Circle products on Arc.

## Demos

| Demo | What it Does | Circle Products | Port |
|------|-------------|----------------|------|
| [**Trustless USDC Spending Agent**](demos/trustless-usdc-spending-agent/) | zkML-proven USDC payments with [x402](https://www.x402.org/) micropayments | [OOAK](https://github.com/circlefin/circle-ooak) | 8616 |
| [**Trustless USDC Compliance Agent**](demos/trustless-usdc-compliance-agent/) | Agent owns wallet, dual-sided compliance screening before every settlement | [Compliance Engine](https://www.circle.com/wallets/compliance-engine) | 8619 |

### What These Demos Show

- **Trustless Spending**: Agent decisions are cryptographically proven (not just logged)
- **Compliance**: AML/CFT screening on both sender and recipient via Circle Compliance Engine
- **Wallet Ownership**: Agent owns wallet via private key - true ownership, no custodian

## Architecture

All demos share the same core architecture:

```
User/Agent Request
    ↓
ONNX Model Inference
    ↓
JOLT-Atlas zkML Proof (~2-3s)
    ↓
EIP-712 Attestation
    ↓
On-Chain Commitment (Arc)
    ↓
Circle Product API
```

## Repository Structure

```
arc/
├── jolt-atlas/              # Shared zkML prover (from ICME-Lab)
│   ├── examples/            # Rust examples
│   ├── onnx-tracer/         # ONNX models
│   └── zkml-jolt-core/      # Core SNARK prover
│
├── shared/                  # Common utilities
│   ├── zkml-client/         # Node.js client for jolt-atlas
│   └── arc-utils/           # Arc blockchain utilities
│
└── demos/
    ├── trustless-usdc-spending-agent/ # Trustless USDC Spending Agent (port 8616)
    └── trustless-usdc-compliance-agent/         # Trustless USDC Compliance Agent (port 8619)
```

## Quick Start

### Prerequisites

- **Node.js**: 18.0.0 or higher
- **Rust/Cargo**: For building jolt-atlas (install from https://rustup.rs/)
- **System dependencies**: `sudo apt-get install pkg-config libssl-dev`

### 1. Build zkML Prover

```bash
cd jolt-atlas
cargo build --release --example authorization_json
```

This builds the ~172MB prover binary at `target/release/examples/authorization_json`.

### 2. Run a Demo

```bash
# Trustless USDC Spending Agent
cd demos/trustless-usdc-spending-agent
npm install
cp .env.example .env
# Edit .env with your private key
npm start
# Open http://localhost:8616

# Trustless USDC Compliance Agent (recommended)
cd demos/trustless-usdc-compliance-agent
npm install
cp .env.example .env
# Edit .env with your private key
npm start
# API at http://localhost:8619
```

### 3. Get Testnet Funds

1. Go to https://faucet.circle.com/
2. Select **Arc Testnet**
3. Enter your wallet address
4. Receive 10 USDC (request once per hour)

## Performance

| Metric | Value |
|--------|-------|
| Proof Generation | ~2.3 seconds |
| Verification | ~350 ms |
| Peak Memory | ~170 MB |
| Model | Authorization (64 inputs, binary output) |

## What's Proven

Each demo generates zkML proofs that cryptographically attest:

- **Model executed correctly**: The exact ONNX model ran on the exact inputs
- **Output is authentic**: The decision came from the model, not fabricated
- **On-chain commitment**: Proof hash anchored to Arc blockchain

This enables trustless agents from untrusted sources to be used safely.

## Circle Product Integration

### OOAK (Object Oriented Agent Kit)
- Extends Circle's agent framework with zkML proofs
- Integrates [x402](https://www.x402.org/) for HTTP 402 micropayments
- Every payment decision is cryptographically verified
- See [OOAK repository](https://github.com/circlefin/circle-ooak)

### Compliance Engine
- Dual-sided compliance screening (sender + recipient)
- AML/CFT checks, sanctions screening, risk scoring
- zkML proofs attest compliance was evaluated before every transaction
- Creates immutable audit trail for regulators
- See [Compliance Engine documentation](https://www.circle.com/wallets/compliance-engine)

## Development

### Adding a New Demo

1. Create directory in `demos/`
2. Use shared utilities from `shared/`
3. Follow existing demo patterns
4. Add to this README

### Shared Utilities

```javascript
// zkML client
const { ZkmlClient } = require('../../shared/zkml-client/index.cjs');
const zkml = new ZkmlClient();
const proof = await zkml.generateProof({ budget: 15, trust: 7, ... });

// Arc utilities
const { createWallet, getUsdcBalance } = require('../../shared/arc-utils/index.cjs');
const wallet = createWallet(privateKey);
const balance = await getUsdcBalance(address);
```

## Security

**These are testnet demos only!**

- Never use mainnet private keys
- Smart contracts are unaudited
- See [SECURITY.md](SECURITY.md) for details

## Resources

- [Arc Network](https://www.arc.network)
- [Arc Docs](https://docs.arc.network)
- [Circle Developer](https://developers.circle.com)
- [JOLT-Atlas](https://github.com/ICME-Lab/jolt-atlas)
- [ICME Labs](https://blog.icme.io/)

## License

MIT
