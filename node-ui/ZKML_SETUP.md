# Real JOLT-Atlas zkML Proof Setup

This document explains the real JOLT-Atlas zkML proof generation for the Circle OOAK demo.

## Overview

✅ **Real ML proofs are now enabled by default!**

The demo uses the `simple_text_classification` ONNX model to generate cryptographic proofs that a neural network actually evaluated the transaction. Real JOLT proofs take ~2-3 minutes but provide true zkML guarantees.

For faster testing, you can switch to simulated proofs (~5 seconds) by commenting out the JOLT variables in `.env`.

## Prerequisites

- The JOLT-Atlas binaries and ONNX models are located in the `/zkx402` project on this system
- You'll need to copy them to the `node-ui` directory

## Setup Instructions

### 1. Copy JOLT-Atlas Binaries

```bash
# From the ooak/node-ui directory
cp /home/hshadab/zkx402/zkx402-agent-auth/jolt-atlas-fork/target/release/examples/proof_json_output ./proof_json_output

# Also copy the main JOLT binary (optional)
cp /home/hshadab/zkx402/zkx402-agent-auth/jolt-atlas-fork/target/release/zkml-jolt-core ./zkml-jolt-core
```

### 2. Copy ONNX Model

✅ Already done! The `simple_text_classification.onnx` model is included.

### 3. Configuration (.env)

✅ Real proofs are enabled by default!

```bash
# JOLT-Atlas zkML Configuration (Real proofs enabled by default)
JOLT_PROVER_BIN=/home/hshadab/arc/ooak/node-ui/proof_json_output
JOLT_MODEL_PATH=/home/hshadab/arc/ooak/node-ui/models/simple_text_classification.onnx
OOAK_ONNX_MODEL=/home/hshadab/arc/ooak/node-ui/models/simple_text_classification.onnx
```

**To use simulated proofs** (faster testing), comment out the above lines.

### 4. Restart Services

```bash
# Terminal 1: Restart zkML service
npm run zkml

# Terminal 2: Restart main server
npm start
```

## Verification

Check if JOLT is available:

```bash
curl http://localhost:9300/health
```

You should see:
```json
{
  "joltAvailable": true,
  "onnxModelAvailable": true
}
```

## File Sizes

Note: The binaries are large:
- `proof_json_output`: ~138 MB
- `zkml-jolt-core`: ~145 MB

These files are not committed to git due to GitHub's 100MB file size limit.

## Alternative: Building from Source

If the binaries are not available, you can build them from the zkx402 project:

```bash
cd /home/hshadab/zkx402/zkx402-agent-auth/jolt-atlas-fork
cargo build --release --example proof_json_output
```

The binary will be created at:
```
target/release/examples/proof_json_output
```

## Model Input Requirements

The `simple_text_classification` model expects:
- 5 integer inputs
- Values in range 0-13 (embedding dimension size)
- The service automatically maps decision (0/1) and confidence (0-1) to this range

## Performance

| Proof Type | Generation Time | Trace Length | Verification |
|------------|----------------|--------------|--------------|
| Simulated  | ~3-9 seconds   | N/A          | Hash check   |
| Real JOLT (simple_text_classification) | ~120-180 seconds | 31 operations | Full zkSNARK verification |

**Model Selection**: The demo uses `simple_text_classification.onnx` (meaningful ML model for transaction authorization) by default. This provides cryptographic proof that a real neural network evaluated the transaction, giving the zkML proof semantic meaning rather than just being a computation proof.

**Why Still Slow?**: JOLT proof generation has significant setup overhead (preprocessing, commitment scheme initialization) that dominates the runtime (~70-80% of total time). Even simpler models would only provide ~2x speedup.

Both types require the same x402 payment (0.003 USDC) and produce on-chain commitments.
