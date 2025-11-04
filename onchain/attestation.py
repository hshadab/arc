from __future__ import annotations

import os
from typing import Optional

from web3 import Web3
from eth_account.messages import encode_defunct


ATTESTED_JOLT_ABI = [
    {
        "type": "function",
        "name": "verify",
        "stateMutability": "view",
        "inputs": [
            {"name": "proofHash", "type": "bytes32"},
            {"name": "signature", "type": "bytes"},
        ],
        "outputs": [{"name": "", "type": "bool"}],
    }
]


def _hex_to_bytes32(h: str) -> bytes:
    h = h.lower()
    if h.startswith("0x"):
        h = h[2:]
    return bytes.fromhex(h.zfill(64))


def verify_attestation(proof_hash_hex: str, signature: Optional[str]) -> bool:
    """Verify an attested JOLT proof hash.

    Priority:
    1) If ARC_JOLT_VERIFIER_ADDRESS is set and signature is provided, call on-chain verify().
    2) Else if ARC_JOLT_ATTESTOR is set and signature is provided, verify ECDSA locally.
    3) Else basic sanity check on proofHash format.
    """
    proof_hash_hex = proof_hash_hex.lower()
    if proof_hash_hex.startswith("0x"):
        ph_no0x = proof_hash_hex[2:]
    else:
        ph_no0x = proof_hash_hex

    basic = len(ph_no0x) == 64

    verifier_addr = os.getenv("ARC_JOLT_VERIFIER_ADDRESS")
    rpc_url = os.getenv("ARC_RPC_URL") or "https://rpc.testnet.arc.network"
    attestor_addr = (os.getenv("ARC_JOLT_ATTESTOR") or "").lower()

    # Try on-chain check first
    if verifier_addr and signature:
        try:
            w3 = Web3(Web3.HTTPProvider(rpc_url))
            contract = w3.eth.contract(address=Web3.to_checksum_address(verifier_addr), abi=ATTESTED_JOLT_ABI)
            ok = contract.functions.verify(bytes.fromhex(ph_no0x), bytes.fromhex(signature.replace("0x", ""))).call()
            return bool(ok)
        except Exception:
            pass

    # Fallback to local ECDSA check
    if signature and attestor_addr:
        try:
            msg = encode_defunct(primitive=_hex_to_bytes32(ph_no0x))
            recovered = Web3.to_checksum_address(Web3().eth.account.recover_message(msg, signature=signature))
            return recovered.lower() == attestor_addr
        except Exception:
            return False

    # Basic shape only
    return basic
