# JOLT-Atlas zkML Proof Setup

This document explains how to set up and use the latest JOLT-Atlas zkML proof system for the Trustless USDC Agents demo.

## Overview

The demo uses the **authorization model** from [ICME-Lab/jolt-atlas](https://github.com/ICME-Lab/jolt-atlas) to generate cryptographic proofs that a neural network evaluated transaction authorization decisions.

**Key Features:**
- Real zkSNARK proofs (~20-30 seconds)
- Transaction authorization model with 8 input features
- Binary output: AUTHORIZED or DENIED with confidence score

## Prerequisites

- **Rust** (install from https://rustup.rs/)
- **Cargo** (comes with Rust)
- ~6GB RAM for proof generation
- **System dependencies** (Ubuntu/Debian):
  ```bash
  sudo apt-get install pkg-config libssl-dev
  ```
- **System dependencies** (Fedora/RHEL):
  ```bash
  sudo dnf install pkg-config openssl-devel
  ```

## Setup Instructions

### 1. Build JOLT-Atlas

```bash
cd /home/hshadab/arc/jolt-atlas
./build.sh
```

Or manually:
```bash
cd /home/hshadab/arc/jolt-atlas
cargo build --release --example authorization_json
```

### 2. Configuration (.env)

Copy and configure the environment file:

```bash
cd /home/hshadab/arc/node-ui
cp .env.example .env
# Edit .env with your private key
```

The default configuration points to the built binary:
```bash
JOLT_ATLAS_DIR=/home/hshadab/arc/jolt-atlas
JOLT_PROVER_BIN=/home/hshadab/arc/jolt-atlas/target/release/examples/authorization_json
OOAK_ONNX_MODEL=/home/hshadab/arc/jolt-atlas/onnx-tracer/models/authorization/network.onnx
```

### 3. Start Services

```bash
# Terminal 1: Start zkML proof service
npm run zkml

# Terminal 2: Start main UI server
npm start
```

## Verification

Check if JOLT is available:

```bash
curl http://localhost:9300/health
```

Expected response:
```json
{
  "joltAvailable": true,
  "onnxModelAvailable": true
}
```

## Authorization Model

The authorization model evaluates transactions based on 8 features:

| Feature | Range | Description |
|---------|-------|-------------|
| budget | 0-15 | Available spending budget |
| trust | 0-7 | Merchant trust score |
| amount | 0-15 | Transaction amount |
| category | 0-3 | Merchant category |
| velocity | 0-7 | Recent transaction frequency |
| day | 0-7 | Day of week |
| time | 0-3 | Time of day (0=morning, 3=night) |
| risk | 0+ | Risk flags |

**Example scenarios:**
- High trust (7), sufficient budget (15), reasonable amount (8) → AUTHORIZED
- Low trust (1), high amount (12) → DENIED
- High velocity (7) → DENIED (suspicious activity)

## Performance

| Metric | Value |
|--------|-------|
| Proof Generation | ~20-30 seconds |
| Verification | ~100-200ms |
| Memory Usage | ~5-6 GB peak |

## Testing the Model

Run the standalone authorization example:
```bash
cd /home/hshadab/arc/jolt-atlas
cargo run --release --example authorization
```

Generate a proof with JSON output:
```bash
./target/release/examples/authorization_json 15 7 8 0 2 1 1 0
```

## Mock Proofs (Faster Testing)

For faster development, enable mock proofs by setting:
```bash
USE_MOCK_PROOFS=1
```

Mock proofs are instant but don't provide real cryptographic guarantees.

## Troubleshooting

### Build Errors
- Ensure Rust nightly toolchain: `rustup default nightly`
- Update Rust: `rustup update`

### Memory Issues
- Proof generation requires ~6GB RAM
- Close other applications if needed

### Model Not Found
- Verify paths in `.env` are correct
- Models are in `jolt-atlas/onnx-tracer/models/authorization/`
