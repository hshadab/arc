from __future__ import annotations

import os
import sys
import pprint

# Allow running as a script: python Circle-OOAK/demo.py
if __name__ == "__main__":
    sys.path.append(os.path.dirname(__file__))
from workflow import ZKWorkflowManager  # type: ignore


def main() -> None:
    features = {
        "amount_norm": 0.2,  # normalized amount ∈ [0,1]
        "risk_score": 0.1,   # risk ∈ [0,1]
        "op_code": 1.0,
        "bias": 1.0,
    }

    mgr = ZKWorkflowManager()
    result = mgr.approve(features)

    print("\n=== Circle-OOAK ZK Approval Result ===")
    print(f"Decision: {'APPROVE' if result.decision == 1 else 'DENY'}")
    print(f"Confidence: {result.confidence}%")
    print(f"Attestation verified: {result.onchain_verified}")
    if result.jolt:
        print(f"JOLT proof hash: {result.jolt['proof_hash']}")
        if result.jolt.get('signature'):
            print(f"JOLT signature: {result.jolt['signature'][:20]}...")

    print("\nFull approval artifacts:")
    pp = pprint.PrettyPrinter(indent=2, width=100)
    pp.pprint({"decision": result.decision, "confidence": result.confidence, "jolt": result.jolt})


if __name__ == "__main__":
    main()
