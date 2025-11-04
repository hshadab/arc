Trustless USDC Agents: Extending Object Oriented Agent Kit with zkML

## Overview

This integration extends Circle's **Object Oriented Agent Kit (OOAK)** with **zkML cryptographic proofs** to enable **trustless autonomous agents** for USDC payments.

**The Trust Model Distinction:**
- **Circle OOAK alone**: Provides secure hooks and structured payment workflows, but requires trusting the agent runtime and OpenAI SDK
- **Circle OOAK + zkML**: Removes trust requirements entirely through cryptographic proofs—agents from untrusted marketplaces can be used safely with mathematical guarantees

This positioning makes OOAK + zkML a **general-purpose trustless agent framework** that can be applied to any agent SDK (not just OpenAI), enabling Circle's core goal: secure, verifiable USDC transfers via autonomous agents.

**What's Proven:**
- Real ONNX inference using `onnxruntime`
- zkML proof-of-execution via JOLT-Atlas fork (returns proofHash)
- ECDSA attestation of proofHash (service signs)
- On-chain anchoring via CommitmentRegistry (EIP‑712) and optional AttestedJoltVerifier verify
- OOAK-style approval gate that requires valid attestation/anchoring before executing secure actions

## What's Included

- `ml/onnx_infer.py`: Loads a pinned ONNX model and runs inference. If the demo model is missing, it auto-generates a tiny classifier.
- `zk/jolt_prover.py`: Wraps JOLT-Atlas binaries to produce a proof object and a `proof_hash` commitment.
- `onchain/attestation.py`: Verifies ECDSA attestation of JOLT proof hash (3-tier verification).
- `workflow.py`: An OOAK-style `ZKWorkflowManager` that enforces proof-gated approvals.
- `demo.py`: End-to-end demonstration: ONNX → JOLT proof → attestation → approval.
- `secure_tooling.py`: Minimal `@secure_tool`-style decorator that enforces the ZK gate.
- `example_payment_agent.py`: A payment tool (`send_usdc`) gated by the ZK approval pipeline.
- `node-ui/` (Express): UI + REST API with ONNX inference, zkML (JOLT) + attestation + registry anchoring, and `send-usdc`.

## Prerequisites

- Python 3.10+
- Node.js 18+
- Environment variables (or defaults):
  - `OOAK_ONNX_MODEL`: defaults to a demo ONNX model
  - `OOAK_RPC_URL`: JSON-RPC endpoint (default: Arc testnet)

## Quickstart

### 1) Install Dependencies

```bash
pip install onnxruntime web3
```

### 2) Run the Demo

```bash
python demo.py
```

### 3) Run the Secure-Tool Payments Example

```bash
python example_payment_agent.py
```

### 4) Launch the Node UI

```bash
npm run demo:ooak:ui
```

Open http://localhost:8616

- Approval runs ONNX → zkML (JOLT) → attestation/anchoring on Arc
- Results show the JOLT proofHash, attestation, and commitment tx link

### 5) Real Mode (Optional)

- **ONNX**: Ensure a model exists at the configured path, and keep `onnxruntime-node` installed.
- **JOLT zkML**: Set `JOLT_PROVER_BIN` to your JOLT-Atlas binary path (build via `cargo build --release`).
- **Attestation verify**: Set `ARC_JOLT_VERIFIER_ADDRESS` to on-chain ECDSA verifier and `ARC_JOLT_ATTESTOR` to expected signer.
- **Send USDC**:
  - Path A (Circle DCW API): export `CIRCLE_API_KEY` and optional wallet vars, then POST `/api/send-usdc`.
  - Path B (private key on Arc): export `PRIVATE_KEY`, optional `ARC_RPC_URL`, `USDC_ADDRESS`. The server signs and sends ERC‑20 `transfer`.

This will:
- Ensure the ONNX model exists (generate if needed).
- Run real ONNX inference to produce a decision + confidence.
- Generate a zkML proof, compute `proofHash`, sign it, and anchor a commitment on Arc.

## Notes

- The JOLT-Atlas binary can be used when present; its output is hashed and bound (proofHash) into the audit record. The active path uses ECDSA attestation + CommitmentRegistry anchoring.
- Contract address and RPC can be set via env vars. Defaults point to public endpoints and a demo address used in this repo's JS backends.
- The UI's hero and diagram sections embed imagery from Circle's blog post for visual parity.
- The Node API enables CORS so you can use the single‑file UI at `ooak-ui.html` with `API Base URL` set to your server.

## Attested Variant (Default)

- Sign `proofHash` (EIP‑191) with the prover/service wallet
- Verify signature off-chain and (optionally) on-chain via `AttestedJoltVerifier`
- Anchor commitment via `CommitmentRegistry.store` (EIP‑712 typed data)
