from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np

# Allow import when run as a script from folder
_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parents[2]
import os as _os
OOAK_ONNX_MODEL = _os.getenv("OOAK_ONNX_MODEL", str((_ROOT / "models/spending_model.onnx").resolve()))


@dataclass
class InferenceResult:
    decision: int  # 1 = APPROVE, 0 = DENY
    confidence: int  # 0-100
    raw_output: Any
    model_path: str


def _maybe_generate_demo_model() -> None:
    model_path = Path(OOAK_ONNX_MODEL)
    if model_path.exists():
        return

    # Generate a spending model if missing
    # Script located at repo-root/models/create_spending_model.py
    script = _ROOT / "models/create_spending_model.py"
    if not script.exists():
        raise FileNotFoundError(f"Missing model generator: {script}. Set OOAK_ONNX_MODEL or provide model.")

    subprocess.run(["python3", str(script)], check=True, cwd=str(_ROOT))
    if not model_path.exists():
        raise RuntimeError("Failed to generate demo ONNX model")


def run_inference(features: Dict[str, Any]) -> InferenceResult:
    """Run real ONNX inference using onnxruntime.

    Expected model: a simple classifier that returns a class/logit. We map it to (decision, confidence).
    If absent, we auto-generate a demo model from jolt-atlas.
    """
    _maybe_generate_demo_model()

    import onnxruntime as ort  # Local import so module loads without hard dep

    model_path = str(OOAK_ONNX_MODEL)
    sess = ort.InferenceSession(model_path)

    # Prepare spending-model features (7):
    # [amount_norm, balance_norm, vendor_trust, velocity_1h_norm, velocity_24h_norm, kyc_ok, aml_ok]
    x = np.array([
        float(features.get("amount_norm", 0.05)),
        float(features.get("balance_norm", 1.0)),
        float(features.get("vendor_trust", 0.8)),
        float(features.get("velocity_1h_norm", 0.1)),
        float(features.get("velocity_24h_norm", 0.2)),
        float(features.get("kyc_ok", 1.0)),
        float(features.get("aml_ok", 1.0)),
    ], dtype=np.float32).reshape(1, -1)

    inputs = {sess.get_inputs()[0].name: x}
    outputs = sess.run(None, inputs)

    y = np.asarray(outputs[0]).flatten()
    score = float(y[0]) if len(y) > 0 else 0.0

    # Map score to decision/confidence for the Groth16 circuit
    decision = 1 if score >= 0.5 else 0
    confidence = int(max(0, min(100, round(abs(score - 0.5) * 200))))

    return InferenceResult(
        decision=decision,
        confidence=confidence,
        raw_output=outputs,
        model_path=model_path,
    )
