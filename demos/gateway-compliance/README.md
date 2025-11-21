# Gateway Compliance Demo

zkML-powered compliance agent for Circle Gateway cross-chain payments on Arc.

## Overview

This demo shows how to use zkML proofs to authorize a compliance agent that uses [Circle Gateway](https://www.circle.com/gateway) to send cross-chain USDC payments. The agent proves it evaluated compliance rules before authorizing transfers.

## Architecture

```
Compliance Request
    ↓
zkML Compliance Model (ONNX)
    ↓
JOLT-Atlas Proof Generation
    ↓
EIP-712 Attestation
    ↓
Circle Gateway API → Cross-chain Transfer
```

## Features

- **Compliance Model**: ML model evaluates KYC/AML rules
- **zkML Proofs**: Cryptographic proof of compliance check
- **Gateway Integration**: Circle Gateway for cross-chain transfers
- **Audit Trail**: On-chain commitment of all compliance decisions

## Prerequisites

- Node.js 18+
- Arc testnet wallet with USDC
- Circle Gateway API key (get from https://console.circle.com)
- Built jolt-atlas (`cd ../../jolt-atlas && ./build.sh`)

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your keys

# Start server
npm start
```

## Environment Variables

```bash
PRIVATE_KEY=your_arc_testnet_private_key
ARC_RPC_URL=https://rpc.testnet.arc.network
CIRCLE_API_KEY=your_circle_gateway_api_key
JOLT_ATLAS_DIR=../../jolt-atlas
```

## API Endpoints

### POST /compliance/check
Check compliance for a transfer request.

```bash
curl -X POST http://localhost:8617/compliance/check \
  -H "Content-Type: application/json" \
  -d '{
    "from": "0x...",
    "to": "0x...",
    "amount": "100",
    "destinationChain": "ethereum"
  }'
```

### POST /transfer/execute
Execute a compliant cross-chain transfer via Gateway.

```bash
curl -X POST http://localhost:8617/transfer/execute \
  -H "Content-Type: application/json" \
  -d '{
    "complianceProofHash": "0x...",
    "from": "0x...",
    "to": "0x...",
    "amount": "100",
    "destinationChain": "ethereum"
  }'
```

## Compliance Model

The compliance model evaluates:
- **Sender verification**: KYC status, account age
- **Recipient risk**: Sanctions screening, risk score
- **Amount limits**: Daily/monthly limits, transaction size
- **Jurisdiction**: Source/destination chain rules

Output: APPROVED or DENIED with confidence score and zkML proof.

## Circle Gateway Integration

This demo uses Circle Gateway to:
- Bridge USDC from Arc to other chains (Ethereum, Polygon, etc.)
- Execute atomic cross-chain transfers
- Track transfer status and confirmations

See [Gateway documentation](https://developers.circle.com/gateway) for details.
