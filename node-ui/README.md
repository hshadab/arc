# Circle OOAK + NovaNet zkML on Arc

**Trustless USDC Agents with Cryptographic Proofs**

A demonstration of Circle's Object-Oriented Agent Kit (OOAK) enhanced with NovaNet zkML proofs and x402 micropayments on Arc blockchain.

## 🎯 What This Demo Does

Demonstrates a complete trustless agent workflow where AI agents can execute USDC payments with cryptographic guarantees:

1. **User Request** - Initiates a transaction intent
2. **WalletInstanceAgent** - Processes request with x402 payment capability
3. **@secure_tool: send_usdc** - Protected tool with 3-stage approval workflow:
   - **Approval Hook 1/3**: ONNX neural network authorization model
   - **Approval Hook 2/3**: NovaNet zkML proof generation (paid via x402)
   - **Approval Hook 3/3**: Cryptographic commitment attestation on Arc
4. **Workflow Manager** - Evaluates approval results and authorizes execution
5. **Tool Execution** - USDC transfer on Arc testnet

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Arc testnet USDC tokens
- Private key with testnet funds

### Installation

```bash
# Clone repository
git clone https://github.com/hshadab/arc.git
cd arc/ooak/node-ui

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your private key
```

### Running the Demo

**Terminal 1: zkML Proof Service**
```bash
npm run zkml
# → http://localhost:9300
```

**Terminal 2: Main Server**
```bash
npm start
# → http://localhost:8616
```

**Browser**
```
Open: http://localhost:8616
Click: "▶ Initiate User Request"
Watch: Real-time workflow visualization with payment tracking

⏱️  Note: Real zkML proofs take ~3-9 seconds
    See ONNX_MODEL_COMPATIBILITY.md for model details
```

## 🏗️ Architecture

### Workflow Flow
```
User Request
    ↓
WalletInstanceAgent (0x1f40...0CC6)
    ↓
@secure_tool: send_usdc
    │
    ├─ Approval Hook 1/3: ONNX Authorization (~5ms)
    │
    ├─ Approval Hook 2/3: NovaNet zkML Proof (~3-9s, paid via x402)
    │   └─ Cost: 0.003 USDC via HTTP 402 Payment Required
    │
    └─ Approval Hook 3/3: Commitment on Arc (~2-3s)
        └─ EIP-712 signed commitment to CommitmentRegistry
    ↓
Workflow Manager (Final Decision)
    ↓
Tool Execution: send_usdc(wfid=approved)
    └─ USDC transfer + commitment anchoring via SpendGate
```

### Key Components

**Circle OOAK**
- `WalletInstanceAgent`: Agent with encapsulated wallet state
- `@secure_tool`: Decorator adding approval hooks to payment functions
- `WorkflowManager`: Final authorization decision maker

**NovaNet zkML**
- JOLT-Atlas proof generation for ONNX inference (addsubmul0 model, 200 bytes)
- Cryptographic guarantee that AI model actually executed
- **Real zkML proofs enabled by default** (~3-9 seconds per proof)
- Fast-mode extraction skips verification to save time

**x402 Micropayments**
- Coinbase's HTTP 402 Payment Required protocol
- Automatic USDC payment for zkML proof service
- 0.003 USDC per proof on Arc testnet

**Arc Blockchain**
- **CommitmentRegistry**: `0x8d65d93022EB39c1b66c72A7F55C63c0C28B4E12`
- **SpendGate**: `0x3D7Ce2Cc674149d8448B1014f34fc2B3b76e18E7`
- USDC as native gas token (no ETH needed)

## 📂 Project Structure

```
node-ui/
├── server.cjs              # Main Express server (ONNX, blockchain, APIs)
├── zkml-proof-service.cjs  # HTTP 402 zkML proof service
├── x402-client.cjs         # x402 payment client
├── x402-middleware.cjs     # x402 server middleware
├── x402-demo.cjs           # Standalone x402 demo
├── public/
│   ├── index.html          # Main UI with workflow visualization
│   └── x402-ui-patch.js    # Payment tracker UI components
├── contracts/              # Smart contract artifacts
├── .env.example            # Environment template
└── package.json            # Dependencies
```

## 🎨 UI Features

- **Real-time workflow visualization** - Watch each step execute with glowing animations
- **Payment cost tracker** - See total x402 costs in real-time (top right)
- **Transaction links** - Direct links to Arc explorer for all on-chain operations
- **Key-value formatted results** - Clean display of ONNX outputs, proofs, and commitments
- **Inline blockchain links** - Clickable links for attestation and USDC transactions

## ⚙️ Environment Variables

See `.env.example` for template. Required variables:

```bash
PRIVATE_KEY=              # Wallet private key (no 0x prefix)
ARC_RPC_URL=              # Arc testnet RPC endpoint
ARC_CHAIN_ID=             # Arc testnet chain ID (5042002)
COMMITMENT_REGISTRY_ADDRESS=   # CommitmentRegistry contract
SPEND_GATE_ADDRESS=       # SpendGate contract

# Optional: Enable real JOLT-Atlas zkML proofs (takes 2-3 min/proof)
# JOLT_PROVER_BIN=        # Path to proof_json_output binary
# JOLT_MODEL_PATH=        # Path to ONNX model
# OOAK_ONNX_MODEL=        # Path to ONNX model for availability check
```

## 📊 Performance

| Component | Time | Cost |
|-----------|------|------|
| ONNX Inference | ~5ms | Free |
| **zkML Proof Generation (fast mode)** | **~3-9s** | **0.003 USDC** |
| Commitment on Arc | ~2-3s | ~$0.001 gas |
| USDC Transfer | <1s | ~$0.001 gas |
| **Total Workflow** | **~10-15s** | **~0.004 USDC** |

**Note**: Uses `addsubmul0.onnx` (200 bytes, 14 operations) with JOLT-Atlas fast mode. Proof extraction happens at ~8 seconds, skipping the 7-minute verification step. The system architecture supports larger models (see `ONNX_MODEL_COMPATIBILITY.md`), but current JOLT binary has limited opcode support.

## 🔗 Links

- **Circle OOAK**: https://www.circle.com/blog/ooak-object-oriented-agent-kit
- **NovaNet**: https://www.novanet.xyz/
- **JOLT-Atlas zkML**: https://github.com/ICME-Lab/jolt-atlas
- **x402 Protocol**: https://github.com/coinbase/x402
- **Arc Testnet Explorer**: https://testnet.arcscan.app

### Deployed Contracts
- **CommitmentRegistry**: https://testnet.arcscan.app/address/0x8d65d93022EB39c1b66c72A7F55C63c0C28B4E12
- **SpendGate**: https://testnet.arcscan.app/address/0x3D7Ce2Cc674149d8448B1014f34fc2B3b76e18E7

## 🔒 Security Notes

**⚠️ This is a testnet demonstration**

For production use:
- Never commit `.env` files with private keys
- Use proper key management (HSM, KMS, etc.)
- Implement rate limiting and input validation
- Audit all smart contracts
- Use production Arc network and Circle APIs

## 📚 Additional Documentation

- `ONNX_MODEL_COMPATIBILITY.md` - **NEW**: Comprehensive model testing results and JOLT binary limitations
- `FAST_MODE_IMPLEMENTATION.md` - Fast-mode proof extraction implementation
- `ZKML_SETUP.md` - How to enable real JOLT-Atlas zkML proofs
- `X402_README.md` - x402 protocol details
- `X402_INTEGRATION_COMPLETE.md` - Integration notes and implementation guide

## 🐛 Troubleshooting

**Cost tracker not showing**
- Check browser console for `[x402-ui] Ready` message
- Ensure `x402-ui-patch.js` is loaded

**Payment fails**
- Verify wallet has sufficient USDC on Arc testnet
- Check RPC rate limits (wait 30s between calls)
- Ensure private key is correct in `.env`

**zkML service not responding**
- Verify zkML service is running: `http://localhost:9300/health`
- Check that port 9300 is not blocked
- Restart service: `npm run zkml`

## 📝 License

MIT

## 🙏 Acknowledgments

- **Circle** - OOAK framework and Arc blockchain
- **NovaNet** - zkML infrastructure
- **Coinbase** - x402 micropayment protocol
- **ICME Lab** - JOLT-Atlas zkML implementation
