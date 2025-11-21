# Arc zkML Demos

Collection of demos showcasing **zkML (zero-knowledge machine learning)** proofs for trustless AI agents on [Arc Network](https://www.arc.network).

## Overview

These demos use [JOLT-Atlas](https://github.com/ICME-Lab/jolt-atlas) to generate cryptographic proofs that ML models executed correctly, enabling trustless autonomous agents for Circle products on Arc.

## Demos

| Demo | Description | Circle Product | Port |
|------|-------------|----------------|------|
| [OOAK Agents](demos/ooak-agents/) | Trustless USDC payment agents | Object Oriented Agent Kit | 8616 |
| [Gateway Compliance](demos/gateway-compliance/) | Compliance agent for cross-chain transfers | [Gateway](https://www.circle.com/gateway) | 8617 |
| [Programmable Wallets](demos/programmable-wallets/) | Authorized wallet operations | [Wallets](https://developers.circle.com/wallets) | 8618 |
| [Autonomous Settlement](demos/autonomous-settlement/) | **Compliant AI agent for agentic commerce** | [Compliance Engine](https://www.circle.com/wallets/compliance-engine) | 8619 |

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
    ├── ooak-agents/         # OOAK demo
    ├── gateway-compliance/  # Gateway demo
    └── programmable-wallets/ # Wallets demo
```

## Quick Start

### Prerequisites

- **Node.js**: 18.0.0 or higher
- **Rust/Cargo**: For building jolt-atlas (install from https://rustup.rs/)
- **System dependencies**: `sudo apt-get install pkg-config libssl-dev`

### 1. Build zkML Prover

```bash
cd jolt-atlas
./build.sh
```

### 2. Run a Demo

```bash
# OOAK Agents (original demo)
cd demos/ooak-agents
npm install
cp .env.example .env
# Edit .env with your private key
npm start
# Open http://localhost:8616

# Gateway Compliance
cd demos/gateway-compliance
npm install
cp .env.example .env
npm start
# Open http://localhost:8617

# Programmable Wallets
cd demos/programmable-wallets
npm install
cp .env.example .env
npm start
# Open http://localhost:8618
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
- Every payment decision is cryptographically verified
- See [OOAK documentation](https://developers.circle.com)

### Gateway
- Cross-chain USDC transfers with compliance proofs
- Agent proves it evaluated KYC/AML rules before transfer
- See [Gateway documentation](https://www.circle.com/gateway)

### Programmable Wallets
- Wallet operations authorized by zkML proofs
- Multi-approval workflows with cryptographic attestation
- See [Wallets documentation](https://developers.circle.com/wallets)

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
