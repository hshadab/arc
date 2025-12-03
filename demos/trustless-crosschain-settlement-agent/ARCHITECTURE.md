# Trustless Cross-Chain Settlement Agent - Architecture

## Plain English

**What it does:** An AI agent that lives on Arc, holds your USDC treasury on Arc, and when you need to pay someone on another chain, it picks the optimal destination chain and uses Circle Gateway to settle the payment - then proves the routing decision was correct.

**Example:**
```
You: "Pay Alice $5,000"

Agent checks:
- Alice accepts payments on: Arbitrum, Base, Polygon
- Gas costs right now: Arbitrum (cheap), Base (medium), Polygon (expensive)
- Alice's recent activity: Mostly on Arbitrum
- Amount size: Medium (standard routing)

Agent decides: "Settle on Arbitrum"
Agent proves: "Given gas=$0.08, recipient_pref=Arbitrum, amount=medium → Arbitrum is optimal (94% confidence)"
Agent executes: Gateway mints $5k USDC on Arbitrum → Alice receives funds
Agent records: Proof hash stored on Arc for audit trail
```

**Why this matters:**
- Treasury stays on Arc (your home base)
- Every payment decision is provably optimal
- Auditors/board can verify the agent followed policy
- No manual gas price checking or chain selection

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ARC NETWORK (Home Base)                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     TREASURY AGENT                                   │   │
│  │                                                                      │   │
│  │  Wallet: 0x742d...3a8f                                              │   │
│  │  Balance: $50,000 USDC                                              │   │
│  │  Policy: COST_MINIMIZE                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                    Payment Request: "Pay Alice $5,000"                      │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    STEP 1: GATHER INPUTS                            │   │
│  │                                                                      │   │
│  │  • Recipient chains: [Arbitrum, Base, Polygon]                      │   │
│  │  • Gas prices: { arb: 0.08, base: 0.12, polygon: 0.45 }            │   │
│  │  • Recipient preference: Arbitrum (most active)                     │   │
│  │  • Amount: $5,000 (MEDIUM bucket)                                   │   │
│  │  • Urgency: NORMAL                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    STEP 2: zkML CHAIN SELECTION                      │   │
│  │                                                                      │   │
│  │  ONNX Model: settlement_router.onnx                                 │   │
│  │                                                                      │   │
│  │  Inputs → [amount=1, chain_count=3, gas_arb=0, gas_base=1,         │   │
│  │            gas_poly=2, pref=0, urgency=0, policy=0]                 │   │
│  │                                                                      │   │
│  │  Output → ARBITRUM (index 0) with 94% confidence                    │   │
│  │                                                                      │   │
│  │  JOLT-Atlas generates cryptographic proof                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    STEP 3: RECORD COMMITMENT ON ARC                  │   │
│  │                                                                      │   │
│  │  EIP-712 Signed Commitment:                                         │   │
│  │  {                                                                   │   │
│  │    recipient: "alice.eth",                                          │   │
│  │    amount: 5000,                                                    │   │
│  │    destChain: "arbitrum",                                           │   │
│  │    proofHash: "0x7a8f...3c2d",                                      │   │
│  │    confidence: 94                                                   │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Stored on Arc → Immutable audit trail                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CIRCLE GATEWAY                                       │
│                                                                             │
│  POST /v1/gateway/mint                                                      │
│  {                                                                          │
│    "destChain": "arbitrum",                                                │
│    "amount": "5000",                                                       │
│    "recipient": "0xAlice..."                                               │
│  }                                                                          │
│                                                                             │
│  → Instantly mints 5,000 USDC on Arbitrum                                  │
│  → Alice receives funds in seconds                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ONNX Model Design

### Model: `settlement_router.onnx`

**Purpose:** Given payment details and chain conditions, select the optimal settlement chain.

**Input Features (8 integers, 0-15 range):**

| # | Feature | Encoding | Description |
|---|---------|----------|-------------|
| 0 | `amount_bucket` | 0=<1k, 1=1k-10k, 2=10k-100k, 3=>100k | Payment size tier |
| 1 | `num_chains` | 1-5 | How many chains recipient accepts |
| 2 | `gas_chain_0` | 0=LOW, 1=MED, 2=HIGH | Gas tier for chain option 0 |
| 3 | `gas_chain_1` | 0=LOW, 1=MED, 2=HIGH | Gas tier for chain option 1 |
| 4 | `gas_chain_2` | 0=LOW, 1=MED, 2=HIGH | Gas tier for chain option 2 |
| 5 | `recipient_pref` | 0-4 | Recipient's preferred chain index |
| 6 | `urgency` | 0=NORMAL, 1=URGENT | Time sensitivity |
| 7 | `policy` | 0=COST_MIN, 1=SPEED_MAX, 2=BALANCED | Treasury policy |

**Output (5-class classification):**

| Output | Chain |
|--------|-------|
| 0 | Arbitrum |
| 1 | Base |
| 2 | Polygon |
| 3 | Optimism |
| 4 | Ethereum Mainnet |

**Decision Logic (what the model learns):**

```python
# Simplified rules encoded in the neural network:

if urgency == URGENT:
    return recipient_preferred_chain  # Speed matters most

if policy == COST_MIN:
    return chain_with_lowest_gas  # Cheapest option

if policy == BALANCED:
    # Weight gas cost vs recipient preference
    if gas_diff > threshold:
        return cheapest_chain
    else:
        return recipient_preferred_chain

return recipient_preferred_chain  # Default to recipient preference
```

### Model Architecture

```
Input Layer (8 neurons)
       │
Dense Layer (16 neurons, ReLU)
       │
Dense Layer (8 neurons, ReLU)
       │
Output Layer (5 neurons, Softmax)
       │
Argmax → Chain Index (0-4)
```

---

## File Structure

```
demos/trustless-crosschain-settlement-agent/
├── ARCHITECTURE.md           # This file
├── README.md                  # User documentation
├── .env.example               # Environment template
├── package.json               # Dependencies
├── server.cjs                 # Main Express server
├── gateway-client.cjs         # Circle Gateway API wrapper
├── recipient-registry.cjs     # Mock recipient preferences
├── contracts/
│   └── SettlementCommitment.json
└── public/
    └── index.html             # Demo UI
```

---

## Server Endpoints

```javascript
// GET /status
// Agent status and treasury balance
{
  "agent": "0x742d...3a8f",
  "treasury": {
    "chain": "arc",
    "balance": "50000.00"
  },
  "supportedChains": ["arbitrum", "base", "polygon", "optimism", "ethereum"],
  "policy": "COST_MINIMIZE",
  "gatewayConnected": true
}

// GET /gas-prices
// Current gas conditions across chains
{
  "arbitrum": { "gwei": 0.08, "tier": "LOW", "estimatedCost": "$0.12" },
  "base": { "gwei": 0.12, "tier": "MEDIUM", "estimatedCost": "$0.18" },
  "polygon": { "gwei": 45, "tier": "HIGH", "estimatedCost": "$0.45" },
  "optimism": { "gwei": 0.09, "tier": "LOW", "estimatedCost": "$0.14" },
  "ethereum": { "gwei": 25, "tier": "HIGH", "estimatedCost": "$2.50" }
}

// GET /recipient/:address
// Recipient's accepted chains and preferences
{
  "address": "0xAlice...",
  "acceptedChains": ["arbitrum", "base", "polygon"],
  "preferredChain": "arbitrum",
  "recentActivity": { "arbitrum": 12, "base": 3, "polygon": 1 }
}

// POST /analyze
// Analyze a payment and get routing recommendation
{
  "recipient": "0xAlice...",
  "amount": "5000",
  "urgency": "normal"
}
// Response:
{
  "recommendation": "arbitrum",
  "confidence": 94,
  "proof": {
    "hash": "0x7a8f...3c2d",
    "proveTimeMs": 1180,
    "verifyTimeMs": 420
  },
  "factors": [
    "Arbitrum gas is LOW ($0.12)",
    "Recipient prefers Arbitrum",
    "Policy: COST_MINIMIZE satisfied"
  ],
  "alternatives": [
    { "chain": "base", "score": 78, "reason": "Higher gas ($0.18)" },
    { "chain": "polygon", "score": 45, "reason": "High gas ($0.45)" }
  ]
}

// POST /settle
// Execute the settlement with proof
{
  "recipient": "0xAlice...",
  "amount": "5000",
  "destChain": "arbitrum",
  "proofHash": "0x7a8f...3c2d"
}
// Response:
{
  "success": true,
  "settlement": {
    "gatewayTxHash": "0x1234...5678",
    "destChain": "arbitrum",
    "amount": "5000",
    "recipient": "0xAlice...",
    "gasCost": "$0.12"
  },
  "arcCommitment": {
    "txHash": "0xabcd...ef01",
    "proofHash": "0x7a8f...3c2d"
  }
}

// GET /history
// Recent settlements with proofs
[
  {
    "id": "settle_001",
    "timestamp": "2024-12-02T10:30:00Z",
    "recipient": "0xAlice...",
    "amount": "5000",
    "destChain": "arbitrum",
    "proofHash": "0x7a8f...3c2d",
    "gatewayTxHash": "0x1234...5678",
    "arcTxHash": "0xabcd...ef01",
    "gasCost": "$0.12"
  }
]
```

---

## UI Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TRUSTLESS CROSS-CHAIN SETTLEMENT                                  [LIVE]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────┐  ┌───────────────────────────────────┐  │
│  │  ARC TREASURY                 │  │  GAS CONDITIONS                   │  │
│  │                               │  │                                   │  │
│  │  $50,000.00 USDC              │  │  Arbitrum   ●  $0.12  LOW        │  │
│  │                               │  │  Base       ●  $0.18  MED        │  │
│  │  Agent: 0x742d...3a8f         │  │  Polygon    ●  $0.45  HIGH       │  │
│  │  Policy: Cost Minimize        │  │  Optimism   ●  $0.14  LOW        │  │
│  │                               │  │  Ethereum   ●  $2.50  HIGH       │  │
│  └───────────────────────────────┘  └───────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  NEW SETTLEMENT                                                      │   │
│  │                                                                      │   │
│  │  Recipient: [0xAlice...                                    ] [Lookup]│   │
│  │                                                                      │   │
│  │  Accepted chains: ✓ Arbitrum  ✓ Base  ✓ Polygon                     │   │
│  │  Preferred: Arbitrum (12 recent txs)                                │   │
│  │                                                                      │   │
│  │  Amount: [$5,000        ] USDC                                      │   │
│  │                                                                      │   │
│  │  Urgency:  (•) Normal  ( ) Urgent                                   │   │
│  │                                                                      │   │
│  │                              [Analyze Route]                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  zkML ROUTING ANALYSIS                              Confidence: 94%  │   │
│  │                                                                      │   │
│  │  Recommended Chain: ARBITRUM                                        │   │
│  │                                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
│  │  │ Encode   │→ │ Inference│→ │ Sumcheck │→ │ Verify   │            │   │
│  │  │ Inputs   │  │ Forward  │  │ Prove    │  │ Proof    │            │   │
│  │  │   ✓      │  │   ✓      │  │   ✓      │  │   ✓      │            │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │   │
│  │                                                                      │   │
│  │  Decision Factors:                                                  │   │
│  │  • Gas cost: $0.12 (lowest available)                              │   │
│  │  • Recipient preference: Arbitrum                                   │   │
│  │  • Policy satisfied: COST_MINIMIZE                                  │   │
│  │                                                                      │   │
│  │  Alternatives:                                                      │   │
│  │  • Base (78%) - Higher gas at $0.18                                │   │
│  │  • Polygon (45%) - Gas spike at $0.45                              │   │
│  │                                                                      │   │
│  │  Proof: 0x7a8f...3c2d                                    [Copy]     │   │
│  │                                                                      │   │
│  │                           [Execute Settlement]                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  EXECUTION                                                          │   │
│  │                                                                      │   │
│  │  1          2              3              4                         │   │
│  │  ○──────────○──────────────○──────────────●                         │   │
│  │  Sign       Record on      Gateway        Complete                  │   │
│  │  Commitment Arc            Mint                                     │   │
│  │  0.08s      0.25s          0.42s          ✓                         │   │
│  │                                                                      │   │
│  │  ✓ Settlement complete!                                             │   │
│  │                                                                      │   │
│  │  Arc Commitment:  0xabcd...ef01           [View on Arcscan]         │   │
│  │  Gateway Mint:    0x1234...5678           [View on Arbiscan]        │   │
│  │  Gas Cost:        $0.12                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

```bash
# Arc Network (Home Base)
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
PRIVATE_KEY=0x...

# Circle Gateway
CIRCLE_GATEWAY_API_KEY=your_gateway_key
CIRCLE_GATEWAY_URL=https://api.circle.com/v1/gateway

# JOLT-Atlas (zkML Prover)
JOLT_ATLAS_DIR=/path/to/jolt-atlas

# Treasury Policy
DEFAULT_POLICY=cost_min  # cost_min | speed_max | balanced
```

---

## Implementation Phases

### Phase 1: Core Logic
- [ ] Create directory structure
- [ ] Implement gateway-client.cjs (mock Gateway API)
- [ ] Create recipient-registry.cjs (mock recipient data)
- [ ] Build server.cjs with /analyze and /settle endpoints
- [ ] Add settlement_router model to jolt-atlas

### Phase 2: UI
- [ ] Port UI patterns from compliance agent
- [ ] Add gas price display panel
- [ ] Implement recipient lookup
- [ ] Build routing analysis visualization

### Phase 3: Integration
- [ ] Connect real Circle Gateway API
- [ ] Implement Arc commitment recording
- [ ] Add settlement history

### Phase 4: Polish
- [ ] Real-time gas price updates
- [ ] Batch settlement support
- [ ] Policy configuration UI

---

## Why This Demo Works for Arc

| Aspect | How It Showcases Arc |
|--------|---------------------|
| **Treasury Home** | All funds live on Arc, proving it's a reliable L2 |
| **Decision Hub** | All routing logic + proofs execute on Arc |
| **Audit Trail** | Every settlement commitment stored on Arc |
| **Gateway Integration** | Arc → any chain via Circle Gateway |
| **zkML Native** | JOLT-Atlas proofs are Arc's differentiator |

**Key Message:** "Arc is where your treasury lives. Gateway is how you reach everywhere else. zkML proves you're doing it right."
