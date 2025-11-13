# Trustless USDC Agents: Extending Object Oriented Agent Kit with zkML

## Overview

This integration extends Circle's **Object Oriented Agent Kit (OOAK)** with **zkML cryptographic proofs** to enable **trustless autonomous agents** for USDC payments.

**The Trust Model Distinction:**
- **Circle OOAK alone**: Provides secure hooks and structured payment workflows, but requires trusting the agent runtime and OpenAI SDK
- **Circle OOAK + zkML**: Removes trust requirements entirely through cryptographic proofs—agents from untrusted marketplaces can be used safely with mathematical guarantees

This positioning makes OOAK + zkML a **general-purpose trustless agent framework** that can be applied to any agent SDK (not just OpenAI), enabling Circle's core goal: secure, verifiable USDC transfers via autonomous agents.

## What's Proven

- Real ONNX inference using `onnxruntime-node`
- **Mandatory** zkML proof-of-execution via JOLT-Atlas fork (returns proofHash)
- ECDSA attestation of proofHash (service signs)
- **Mandatory** on-chain anchoring via CommitmentRegistry (EIP‑712) with AttestedJoltVerifier support
- OOAK-style approval gate that requires valid attestation/anchoring before executing secure actions

## Architecture

```
User Request
    ↓
ONNX Model Inference (onnxruntime-node)
    ↓
JOLT-Atlas zkML Proof (~600-800ms)
    ↓
ECDSA Attestation (EIP-191)
    ↓
On-Chain Anchoring (EIP-712 CommitmentRegistry)
    ↓
Approval Decision
```

## What's Included

This repository contains:

- **`node-ui/`** - Main demo application (Express server + Web UI)
  - REST API endpoints for zkML proof generation and approval decisions
  - ONNX inference with multiple pre-trained models
  - **Mandatory** JOLT-Atlas integration for proof generation
  - **Mandatory** EIP-712 commitment anchoring to Arc blockchain
  - Web-based UI for testing approvals
  - x402 micropayment protocol support for agent-to-agent payments

- **`ooak/`** - OOAK-specific implementations and utilities

- **`zkml/`** - zkML tooling and utilities

## Prerequisites

- **Node.js**: 18.0.0 or higher
- **npm**: For package management
- Environment variables (see `.env.example`):
  - `PRIVATE_KEY`: Wallet private key (testnet only!)
  - `ARC_RPC_URL`: Arc blockchain RPC endpoint
  - `OOAK_ONNX_MODEL`: Path to ONNX model (optional, defaults provided)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/hshadab/arc.git
cd arc/node-ui
npm install
```

### 2. Configure Environment

```bash
# Copy the example configuration
cp .env.example .env

# Edit .env with your testnet private key
# IMPORTANT: Use testnet keys only! Never use mainnet keys.
nano .env
```

Required variables:
```env
PRIVATE_KEY=0x...                              # Your testnet private key
ARC_RPC_URL=https://rpc.testnet.arc.network   # Arc testnet RPC
```

### 3. Start the Server

```bash
npm start
```

The server will start on `http://localhost:8616`

### 4. Open the UI

Open your browser to: **http://localhost:8616**

The UI provides:
- zkML proof generation interface
- Real-time approval decisions
- ONNX model inference visualization
- Attestation and commitment tracking

## Testing the API

### Approval Endpoint

```bash
curl -X POST http://localhost:8616/api/approve \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "limit": 1000,
    "confidence": 85,
    "timestamp": 1699999999
  }'
```

**Response:**
```json
{
  "decision": 1,
  "confidence": 95,
  "jolt": {
    "proofHashHex": "0x1234...",
    "elapsed": 0.752
  },
  "onchain_verified": true,
  "commit": {
    "stored": true,
    "id": "0xabcd...",
    "blockNumber": 123456,
    "txHash": "0x5678..."
  },
  "x402Payment": null
}
```

## Available ONNX Models

The demo includes several pre-trained ONNX models:

- `network.onnx` - Network decision model
- `addsubmul0.onnx` - Simple arithmetic operations
- `crypto_sentiment.onnx` - Cryptocurrency sentiment analysis
- `sentiment0.onnx` - General sentiment classifier
- `medium_text_classification.onnx` - Text classification
- `sigmoid.onnx` - Sigmoid activation model
- `simple_text_classification.onnx` - Simple text classifier

Models are located in: `node-ui/models/`

## Configuration Options

### Environment Variables

```env
# Blockchain Configuration
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
PRIVATE_KEY=0x...

# OOAK Contracts (Arc Testnet)
COMMITMENT_REGISTRY_ADDRESS=0x8d65d93022EB39c1b66c72A7F55C63c0C28B4E12
SPEND_GATE_ADDRESS=0x3D7Ce2Cc674149d8448B1014f34fc2B3b76e18E7
ARC_STORAGE_ADDRESS=0x3fC2FA74e89445544Adeca563abb918402E5a829
ARC_JOLT_VERIFIER_ADDRESS=0x7c635F575Fde6ccD2E800F1ceAB51daD2d225093

# zkML Configuration (MANDATORY for this demo)
USE_JOLT_ATTEST=true
ATTEST_PROOFS=1
JOLT_ENABLED=true
OOAK_ONNX_MODEL=./models/network.onnx

# UI Configuration
OOAK_UI_PORT=8616
```

## USDC Transfers on Arc

This demo supports two methods for USDC transfers:

### 1. SpendGate (Main Demo Flow)
Uses the OOAK `SpendGate` contract with **native USDC** (Arc's native gas token):

```bash
POST /api/send-usdc
{
  "to": "0x...",
  "amount": "0.01"
}
```

**Flow:**
1. Generates zkML proof via `/api/approve`
2. Creates EIP-712 signed commitment
3. Calls `SpendGate.spend(commitment, signature)` with `{ value: amountInWei }`
4. USDC sent as native value transaction (like ETH on Ethereum)

### 2. x402 Micropayment Protocol
Uses the **USDC precompile contract** at `0x3600000000000000000000000000000000000000`:

```javascript
const client = new X402Client({ rpcUrl, privateKey });
await client.request('http://service.example/api/compute', {
  method: 'POST',
  body: { data: '...' }
});
```

**Flow:**
1. Service returns 402 Payment Required with price
2. Client makes ERC20 `transfer()` call to USDC precompile
3. Client retries request with payment proof header
4. Service validates on-chain transaction and processes request

## Attestation Workflow

The demo enforces **mandatory zkML proofs and on-chain anchoring**:

1. **ONNX Inference**: Run model on input features to get approval decision
2. **zkML Proof Generation** (MANDATORY): Create JOLT-Atlas proof of correct execution (~600-800ms)
3. **ECDSA Attestation**: Sign `proofHash` with EIP-191 (service wallet)
4. **Off-Chain Verification**: Verify signature matches expected attestor
5. **On-Chain Anchoring** (MANDATORY): Anchor commitment via `CommitmentRegistry.store` (EIP-712)
6. **Optional Full Verification**: Verify complete JOLT proof on-chain via `AttestedJoltVerifier`

If steps 2 or 5 fail, the API returns a 500 error. These steps are **not optional** in this demo.

## Project Structure

```
arc/
├── node-ui/              # Main demo application
│   ├── server.cjs        # Express server with mandatory zkML + anchoring
│   ├── zkml-proof-service.cjs  # JOLT-Atlas proof generation
│   ├── x402-*.cjs        # x402 micropayment protocol
│   ├── models/           # Pre-trained ONNX models
│   ├── public/           # Web UI
│   └── contracts/        # Contract ABIs
├── ooak/                 # OOAK implementations and utilities
├── zkml/                 # zkML tooling
├── .env.example          # Configuration template
├── LICENSE               # MIT License
├── SECURITY.md           # Security guidelines
├── CONTRIBUTING.md       # Contribution guide
└── README.md             # This file
```

## Security

⚠️ **IMPORTANT**: Read [SECURITY.md](./SECURITY.md) before using this project.

Key security considerations:
- Use **testnet keys only** for development
- Never commit private keys or API keys
- Smart contracts are **not audited** - prototype only
- Not recommended for production without security audit
- See [SECURITY.md](./SECURITY.md) for full guidelines

## Documentation

- **[SECURITY.md](./SECURITY.md)** - Security guidelines and warnings
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - How to contribute
- **[node-ui/README.md](./node-ui/README.md)** - Detailed node-ui documentation
- **[node-ui/ZKML_SETUP.md](./node-ui/ZKML_SETUP.md)** - zkML setup guide

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

This is a research prototype for demonstrating zkML + OOAK integration. Focus on:
- zkML proof generation improvements
- ONNX model optimizations
- UI/UX enhancements
- Documentation improvements

## Notes

- **zkML proofs are mandatory** - The JOLT-Atlas fork generates proofs for every approval request
- Proof generation typically takes 600-800ms; the `proofHash` is bound into the on-chain commitment
- Contract addresses and RPC endpoints are configured via environment variables
- Native USDC is used for gas and transfers (Arc's native token)
- USDC precompile at `0x3600000000000000000000000000000000000000` enables ERC20 compatibility
- Web UI is served from `node-ui/public/` at `http://localhost:8616`

## Resources

- **Arc Blockchain**: https://arc.network
- **Circle OOAK**: https://www.circle.com/
- **JOLT-Atlas**: https://github.com/ICME-Lab/zkml_jolt
- **ONNX Runtime**: https://onnxruntime.ai

## License

MIT License - See [LICENSE](./LICENSE)

---

**Status**: 🚧 Prototype - Not Production Ready

This is a research prototype demonstrating zkML integration with OOAK. Use testnet only. Not audited for production use.

**Last Updated**: 2025-11-12
