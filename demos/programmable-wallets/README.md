# Programmable Wallets Demo

zkML-authorized agent for Circle Programmable Wallets on Arc.

## Overview

This demo shows how to use zkML proofs to authorize an agent that manages [Circle Programmable Wallets](https://developers.circle.com/wallets). The agent proves it evaluated authorization rules before executing wallet operations.

## Architecture

```
Wallet Operation Request
    ↓
zkML Authorization Model (ONNX)
    ↓
JOLT-Atlas Proof Generation
    ↓
EIP-712 Attestation
    ↓
Circle Wallets API → Execute Operation
```

## Features

- **Authorization Model**: ML model evaluates wallet operation rules
- **zkML Proofs**: Cryptographic proof of authorization check
- **Wallet Operations**: Create, transfer, sign via Circle API
- **Multi-sig Support**: zkML as additional authorization layer

## Prerequisites

- Node.js 18+
- Arc testnet wallet with USDC
- Circle API key (get from https://console.circle.com)
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
CIRCLE_API_KEY=your_circle_api_key
ENTITY_SECRET=your_circle_entity_secret
JOLT_ATLAS_DIR=../../jolt-atlas
```

## API Endpoints

### POST /wallet/create
Create a new programmable wallet with zkML authorization.

```bash
curl -X POST http://localhost:8618/wallet/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Agent Wallet 1",
    "description": "Authorized trading agent"
  }'
```

### POST /wallet/transfer
Execute an authorized transfer from a programmable wallet.

```bash
curl -X POST http://localhost:8618/wallet/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "wallet-id",
    "to": "0x...",
    "amount": "10",
    "token": "USDC"
  }'
```

### POST /wallet/authorize
Get zkML authorization proof for a wallet operation.

```bash
curl -X POST http://localhost:8618/wallet/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "wallet-id",
    "operation": "transfer",
    "amount": "10"
  }'
```

## Authorization Model

The authorization model evaluates:
- **Operation type**: Transfer, sign, create
- **Amount limits**: Per-operation and daily limits
- **Wallet balance**: Sufficient funds check
- **Rate limiting**: Operations per time window
- **Risk scoring**: Destination address risk

Output: AUTHORIZED or DENIED with confidence score and zkML proof.

## Circle Wallets Integration

This demo uses Circle Programmable Wallets to:
- Create developer-controlled wallets
- Execute transfers with authorization
- Sign messages and transactions
- Manage wallet lifecycle

See [Wallets documentation](https://developers.circle.com/wallets) for details.

## Use Cases

1. **Trading Bots**: Authorize trades with provable risk checks
2. **Treasury Management**: Multi-approval with zkML proofs
3. **DeFi Agents**: Authorized interaction with protocols
4. **Payment Automation**: Scheduled payments with compliance
