# Real JOLT-Atlas zkML Proof Setup

This document explains how to enable real JOLT-Atlas zkML proof generation for the Circle OOAK demo.

## Overview

By default, the demo uses simulated zkML proofs for fast demonstration purposes (~3-9 seconds). Real JOLT proofs provide cryptographic guarantees but take 2-3 minutes to generate.

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

```bash
# Create models directory
mkdir -p models

# Copy the simple text classification model
cp /home/hshadab/zkx402/zkx402-agent-auth/jolt-atlas-fork/onnx-tracer/models/simple_text_classification/network.onnx ./models/network.onnx
```

### 3. Enable in .env

Edit your `.env` file and uncomment the JOLT configuration:

```bash
# JOLT-Atlas zkML Configuration (Optional - commented out for demo speed)
# Uncomment to enable real JOLT proofs (takes 2-3 minutes per proof)
JOLT_PROVER_BIN=/home/hshadab/arc/ooak/node-ui/proof_json_output
JOLT_MODEL_PATH=/home/hshadab/arc/ooak/node-ui/models/network.onnx
OOAK_ONNX_MODEL=/home/hshadab/arc/ooak/node-ui/models/network.onnx
```

Or use absolute paths specific to your system.

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

| Proof Type | Generation Time | Verification |
|------------|----------------|--------------|
| Simulated  | ~3-9 seconds   | Hash check   |
| Real JOLT  | 2-3 minutes    | Full zkSNARK verification |

Both types require the same x402 payment (0.003 USDC) and produce on-chain commitments.
