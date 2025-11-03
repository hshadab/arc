from __future__ import annotations

import os
from typing import List

from web3 import Web3

OOAK_RPC_URL = os.getenv("OOAK_RPC_URL", os.getenv("ARC_RPC_URL", "https://rpc.testnet.arc.network"))
OOAK_VERIFIER_ADDRESS = os.getenv("OOAK_VERIFIER_ADDRESS", os.getenv("ARC_VERIFIER_ADDRESS", ""))


ABI_VERIFY_SIMPLE = [
    {
        "inputs": [
            {"internalType": "uint256[2]", "name": "_pA", "type": "uint256[2]"},
            {"internalType": "uint256[2][2]", "name": "_pB", "type": "uint256[2][2]"},
            {"internalType": "uint256[2]", "name": "_pC", "type": "uint256[2]"},
            {"internalType": "uint256[2]", "name": "_pubSignals", "type": "uint256[2]"},
        ],
        "name": "verifyProof",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    }
]


def verify_on_chain(a: List[int], b: List[List[int]], c: List[int], pub: List[int]) -> bool:
    w3 = Web3(Web3.HTTPProvider(OOAK_RPC_URL))
    contract = w3.eth.contract(address=Web3.to_checksum_address(OOAK_VERIFIER_ADDRESS), abi=ABI_VERIFY_SIMPLE)
    # view call — no gas
    return contract.functions.verifyProof(a, b, c, pub).call()
