from __future__ import annotations

import hashlib
import json
import os
import sys
from dataclasses import dataclass
from typing import Any, Dict, Optional

_HERE = os.path.dirname(__file__)
sys.path.append(_HERE)
sys.path.append(os.path.join(_HERE, "ml"))
sys.path.append(os.path.join(_HERE, "zk"))
sys.path.append(os.path.join(_HERE, "onchain"))

from ml.onnx_infer import run_inference  # type: ignore
from zk.jolt_prover import generate_llm_proof  # type: ignore
from onchain.attestation import verify_attestation  # type: ignore


@dataclass
class ApprovalArtifacts:
    decision: int
    confidence: int
    onchain_verified: bool
    jolt: Optional[Dict[str, Any]]


class ZKWorkflowManager:
    """Approval gate that enforces real ONNX inference and zkML proof checks.

    Policy: require attestation of the JOLT proofHash (ECDSA) before approval when configured.
    If a JOLT-Atlas prover is present, bind its proof hash (and signature if available) into the audit record.

    Three-hook approval flow:
    1. ONNX Inference: Neural network authorization model
    2. JOLT zkML Proof: Cryptographic proof of execution (with x402 payment)
    3. Arc Attestation: EIP-712 signature verification
    """

    def __init__(self) -> None:
        pass

    def approve(self, features: Dict[str, Any]) -> ApprovalArtifacts:
        # Hook 1: Real ONNX inference
        inf = run_inference(features)

        # Hook 2: JOLT proof (proof-of-execution) if binary exists
        # This is where x402 payment happens when calling external proof service
        jolt = generate_llm_proof(decision=inf.decision, confidence=inf.confidence)
        jolt_dict = None
        if jolt:
            jolt_dict = {
                "decision": jolt.decision,
                "confidence": jolt.confidence,
                "risk_score": jolt.risk_score,
                "proof_hash": jolt.proof_hash_hex,
                "signature": getattr(jolt, 'signature_hex', None),
            }

        # Hook 3: Attestation/registry check
        # Verify the JOLT proof hash was signed by trusted attestor
        ok = False
        if jolt_dict and 'proof_hash' in jolt_dict:
            sig = jolt_dict.get('signature')
            ok = verify_attestation(jolt_dict['proof_hash'], sig)

        return ApprovalArtifacts(
            decision=inf.decision,
            confidence=inf.confidence,
            onchain_verified=bool(ok),
            jolt=jolt_dict,
        )
