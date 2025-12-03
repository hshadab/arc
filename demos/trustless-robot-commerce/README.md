# Two-Robot Cross-Chain Commerce

**DeliveryBot (Arc) pays WitnessBot (Base) for collision footage via Circle Gateway.**

This demo implements the [Circle-OpenMind partnership vision](https://www.circle.com/blog/enabling-machine-to-machine-micropayments-with-gateway-and-usdc):
> "Autonomous agents pay one another for data, services, and compute time"

---

## Demo Step-by-Step Breakdown

### What Happens When You Shake

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  STEP 1: COLLISION DETECTION                                                 │
│  ─────────────────────────────────────────────────────────────────────────── │
│  • Phone/laptop accelerometer detects shake (DeviceMotion API)               │
│  • Magnitude > 15 triggers collision event                                   │
│  • Or click "Simulate Collision" button                                      │
│  • Tool: Browser DeviceMotion API                                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  STEP 2: AI DECISION (OpenMind LLM)                                          │
│  ─────────────────────────────────────────────────────────────────────────── │
│  • DeliveryBot asks: "Should I buy footage for $0.02?"                       │
│  • OpenMind LLM analyzes: collision severity, budget, value                  │
│  • Returns: { decision: APPROVE, confidence: 92%, reason: "..." }            │
│  • Tool: OpenMind LLM API (https://portal.openmind.org)                      │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  STEP 3: TRUSTLESS PROOF (zkML / JOLT-Atlas)                                 │
│  ─────────────────────────────────────────────────────────────────────────── │
│  • AI decision fed to ONNX policy model                                      │
│  • JOLT-Atlas generates cryptographic proof                                  │
│  • Proves: decision followed valid policy rules                              │
│  • Anyone can verify on-chain without trusting the AI                        │
│  • Tool: JOLT-Atlas zkML prover (Rust/RISC-V)                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  STEP 4: x402 PAYMENT REQUEST                                                │
│  ─────────────────────────────────────────────────────────────────────────── │
│  • DeliveryBot requests footage from WitnessBot                              │
│  • WitnessBot returns HTTP 402 Payment Required                              │
│  • Headers specify: address, amount ($0.02), chain (Base Sepolia)            │
│  • Tool: x402 Protocol (HTTP 402 standard)                                   │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  STEP 5: CROSS-CHAIN PAYMENT (Circle Gateway)                                │
│  ─────────────────────────────────────────────────────────────────────────── │
│  • DeliveryBot signs EIP-712 burn intent                                     │
│  • Gateway API verifies unified balance                                      │
│  • USDC burned on Arc Testnet                                                │
│  • USDC minted on Base Sepolia to WitnessBot                                 │
│  • Instant (<500ms), no bridging required                                    │
│  • Tool: Circle Gateway (cross-chain USDC)                                   │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  STEP 6: ON-CHAIN VERIFICATION                                               │
│  ─────────────────────────────────────────────────────────────────────────── │
│  • WitnessBot verifies payment on Base Sepolia                               │
│  • Checks tx receipt, confirms USDC received                                 │
│  • No trust required - verified on-chain                                     │
│  • Tool: ethers.js + Base Sepolia RPC                                        │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  STEP 7: FOOTAGE ANALYSIS (OpenMind VILA)                                    │
│  ─────────────────────────────────────────────────────────────────────────── │
│  • WitnessBot analyzes collision footage                                     │
│  • OpenMind VILA (vision model) processes images                             │
│  • Returns: severity, objects identified, frame count                        │
│  • Tool: OpenMind VILA API (vision-language model)                           │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  STEP 8: DATA DELIVERY                                                       │
│  ─────────────────────────────────────────────────────────────────────────── │
│  • WitnessBot returns footage data to DeliveryBot                            │
│  • Transaction recorded in history                                           │
│  • Budget updated ($1.00 → $0.98)                                            │
│  • Full flow complete in ~3-7 seconds                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Tools & Technologies Used

| Tool | Purpose | Provider |
|------|---------|----------|
| **Circle Gateway** | Cross-chain USDC payments (Arc → Base) | [Circle](https://www.circle.com/gateway) |
| **OpenMind LLM** | AI decision making ("should I buy?") | [OpenMind](https://portal.openmind.org) |
| **OpenMind VILA** | Vision analysis of collision footage | [OpenMind](https://portal.openmind.org) |
| **JOLT-Atlas** | zkML proof generation | [JOLT](https://github.com/a]6-labs/jolt) |
| **x402 Protocol** | HTTP 402 Payment Required standard | [x402](https://www.x402.org) |
| **Arc Testnet** | DeliveryBot's chain (USDC native gas) | [Arc](https://arc.network) |
| **Base Sepolia** | WitnessBot's chain | [Base](https://base.org) |
| **DeviceMotion API** | Phone/laptop accelerometer | Browser Standard |
| **ethers.js** | Blockchain interactions | [ethers](https://ethers.org) |
| **Express.js** | Backend server | [Express](https://expressjs.com) |
| **WebSocket** | Real-time UI updates | Browser Standard |

---

## Live Demo Script

### Setup (Before Demo)
```bash
cd demos/trustless-robot-commerce
npm install
npm start
# Open http://localhost:3000
```

### Demo Flow (What to Say)

1. **"This is DeliveryBot, an autonomous delivery robot on Arc blockchain"**
   - Point to the dashboard showing robot status

2. **"DeliveryBot just detected a collision"**
   - Click "Simulate Collision" or shake phone
   - Watch accelerometer values change

3. **"The AI is deciding if witness footage is worth $0.02"**
   - Show OpenMind decision: APPROVE 92%
   - Explain: "No human approval needed"

4. **"Now generating a cryptographic proof of this decision"**
   - Show zkML proof hash
   - Explain: "Anyone can verify this was a valid decision"

5. **"DeliveryBot pays WitnessBot via Circle Gateway"**
   - Show cross-chain transfer: Arc → Base
   - Explain: "Instant, no bridging, different blockchains"

6. **"WitnessBot verified payment on-chain and returned footage"**
   - Show footage analysis results
   - Show budget decreased: $1.00 → $0.98

7. **"This is the future: robots paying robots, trustlessly"**
   - Recap: AI decision → zkML proof → cross-chain payment → data delivery

### Phone Demo Setup (Optional)
```bash
# In a separate terminal:
npx -y localtunnel --port 3000
# Use the https URL on your phone
# Password: your public IP (curl ifconfig.me)
# Shake phone to trigger collision
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     DELIVERYBOT (Buyer)                                 │
│                     Chain: Arc Testnet                                  │
│                                                                         │
│  💥 Collision detected!                                                 │
│       │                                                                 │
│       ▼                                                                 │
│  🧠 OpenMind LLM: "Should I buy footage?" → APPROVE                     │
│       │                                                                 │
│       ▼                                                                 │
│  📡 POST /robots/witness/footage                                        │
│       │                                                                 │
│       ▼                                                                 │
│  🚫 HTTP 402 Payment Required (x402)                                    │
│       │                                                                 │
│       ▼                                                                 │
│  💸 Circle Gateway: Arc USDC → Base USDC                                │
│       │                                                                 │
└───────┼─────────────────────────────────────────────────────────────────┘
        │
        │ Cross-chain payment via Gateway
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     WITNESSBOT (Seller)                                 │
│                     Chain: Base Sepolia                                 │
│                                                                         │
│  📥 Receive payment proof (tx hash)                                     │
│       │                                                                 │
│       ▼                                                                 │
│  🔍 Verify payment ON-CHAIN on Base Sepolia                             │
│       │                                                                 │
│       ▼                                                                 │
│  📹 OpenMind VILA: Analyze collision footage                            │
│       │                                                                 │
│       ▼                                                                 │
│  ✅ Return footage data to DeliveryBot                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Why Two Robots, Two Chains?

This is the **purest demonstration** of Circle Gateway's value:
- **DeliveryBot** has USDC on Arc Testnet
- **WitnessBot** wants USDC on Base Sepolia
- **Gateway** enables instant cross-chain payment without bridging

No human in the loop. No same-chain payments. True cross-chain robot commerce.

## Quick Start

```bash
cd demos/trustless-robot-commerce
npm install
cp .env.example .env
# Edit .env with your keys (see Configuration below)
npm start
# Open http://localhost:3000
```

## Configuration

### Required Keys

```bash
# DeliveryBot's wallet (Arc Testnet)
PRIVATE_KEY=your_deliverybot_private_key

# WitnessBot's wallet (Base Sepolia) - for real payments
WITNESSBOT_PRIVATE_KEY=your_witnessbot_private_key

# OpenMind AI - get at https://portal.openmind.org
OPENMIND_API_KEY=your_openmind_api_key
```

### Enable Real Payments

```bash
USE_REAL_GATEWAY=true
```

Before enabling, ensure DeliveryBot has USDC deposited to Gateway on Arc.

## x402 Protocol

All robot services implement HTTP 402 Payment Required:

```bash
# 1. Request without payment → 402
curl -X POST http://localhost:3000/robots/witness/footage \
  -H "Content-Type: application/json" \
  -d '{"collisionData": {"severity": "moderate"}}'

# Response: 402 Payment Required
# Headers include: X-Payment-Address, X-Payment-Amount, X-Payment-Chain

# 2. Pay via Gateway (Arc → Base)

# 3. Retry with payment proof → 200 + data
curl -X POST http://localhost:3000/robots/witness/footage \
  -H "Content-Type: application/json" \
  -H "X-Payment-Proof: 0x..." \
  -d '{"collisionData": {"severity": "moderate"}}'
```

### x402 Response Headers

| Header | Value |
|--------|-------|
| `X-Payment-Required` | `true` |
| `X-Payment-Address` | WitnessBot's Base Sepolia address |
| `X-Payment-Amount` | `0.02` |
| `X-Payment-Currency` | `USDC` |
| `X-Payment-Chain` | `base-sepolia` |
| `X-Payment-Protocol` | `x402` |

## OpenMind Integration

### DeliveryBot (Decision Making)
Uses OpenMind LLM to decide: "Should I purchase witness footage?"

```javascript
const decision = await openmind.shouldPurchase(collisionData, price, budget);
// Returns: { decision: true/false, confidence: 92, reason: "..." }
```

### WitnessBot (Footage Analysis)
Uses OpenMind VILA to analyze collision footage before returning:

```javascript
const analysis = await openmind.analyzeFootage(footageData);
// Returns: { severity: "moderate", objectsIdentified: [...], ... }
```

## API Endpoints

### x402 Protocol
- `GET /x402/info` - Two-robot architecture documentation
- `GET /x402/demo` - Full payment flow with curl examples

### WitnessBot (Base Sepolia)
- `POST /robots/witness/footage` - Buy collision footage ($0.02 USDC)

### DeliveryBot (Arc Testnet)
- `GET /robot/status` - Robot status, balances, integration status
- `POST /robot/process-sensor` - Process collision (triggers full flow)
- `GET /robot/history` - Transaction history

### Gateway
- `GET /gateway/status` - Gateway configuration and balances
- `POST /gateway/deposit` - Deposit USDC to Gateway
- `POST /gateway/transfer` - Manual cross-chain transfer

## The Full Flow

1. **Collision Detection**: Shake laptop or click "Simulate Collision"
2. **OpenMind Decision**: LLM evaluates if footage is worth $0.02
3. **zkML Proof**: Generate cryptographic proof that decision follows policy
4. **x402 Request**: DeliveryBot requests footage, gets 402
5. **Gateway Payment**: Arc USDC burned, Base USDC minted to WitnessBot
6. **On-Chain Verification**: WitnessBot verifies payment on Base Sepolia
7. **VILA Analysis**: OpenMind analyzes footage
8. **Data Return**: WitnessBot sends footage to DeliveryBot

## zkML Integration

The collision severity assessment is **provably trustless**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TRUSTLESS COLLISION SEVERITY FLOW                │
│                                                                     │
│  1. Sensor data collected from collision                            │
│     → { impact_force: 8, velocity: 4, angle: 0, ... }               │
│                                                                     │
│  2. Collision Severity Model (ONNX) classifies severity             │
│     → Outputs: MINOR / MODERATE / SEVERE / CRITICAL                 │
│                                                                     │
│  3. zkML (JOLT-Atlas) generates cryptographic proof                 │
│     → Proof that severity was computed correctly from sensors       │
│                                                                     │
│  4. Severity determines if footage is worth buying                  │
│     → MINOR: No footage needed ($0.00)                              │
│     → MODERATE: Footage recommended ($0.02)                         │
│     → SEVERE: Footage required ($0.05)                              │
│     → CRITICAL: Footage + report ($0.10)                            │
│                                                                     │
│  5. Anyone can verify the proof on-chain                            │
│     → No need to trust the robot's severity assessment              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Collision Severity Model Inputs

| Feature | Range | Description |
|---------|-------|-------------|
| **impact_force** | 0-15 | Accelerometer magnitude |
| **velocity** | 0-7 | Speed at impact |
| **angle** | 0-7 | Impact angle (0=front, 4=back) |
| **object_type** | 0-7 | Detected object (0=unknown, 2=person) |
| **damage_zone** | 0-7 | Part of robot hit |
| **robot_load** | 0-3 | Cargo value (0=empty, 3=high-value) |
| **time_since_last** | 0-7 | Time since last collision |
| **weather** | 0-3 | Weather conditions |

### Why Both OpenMind and zkML?

| Component | Role | Trust Model |
|-----------|------|-------------|
| **zkML Severity Model** | Collision severity proof | Trustless verification |
| **OpenMind LLM** | Purchase reasoning | Requires API trust |
| **OpenMind VILA** | Footage analysis | Requires API trust |

**zkML** provides cryptographically proven severity assessment from sensor data.
**OpenMind** provides intelligent reasoning and footage analysis.

Together: **Proven Severity + Smart Reasoning = Trustless Robot Commerce**

### Building JOLT-Atlas

To enable real zkML proofs for collision severity:

```bash
cd ../../jolt-atlas
cargo build --release --example collision_severity_json
```

This builds the collision severity prover that takes sensor data and generates cryptographic proofs.

Without JOLT-Atlas built, the demo uses mock proofs (still shows severity assessment, but no real proof).

## Circle-OpenMind Alignment

| Partnership Goal | Implementation |
|-----------------|----------------|
| "Autonomous agents pay one another" | DeliveryBot pays WitnessBot |
| "x402 protocol for micropayments" | HTTP 402 with payment headers |
| "Gateway for cross-chain settlement" | Arc → Base via Gateway |
| "No human in the loop" | OpenMind AI makes decisions |
| "A2A (Agent-to-Agent)" | Direct robot-to-robot transaction |

## Tech Stack

- **Frontend**: Vanilla JS with DeviceMotion API
- **Backend**: Express.js + WebSocket
- **AI**: OpenMind LLM (decisions) + VILA (vision)
- **Payments**: Circle Gateway (real cross-chain USDC)
- **Chains**: Arc Testnet (buyer) + Base Sepolia (seller)

## Real-World Applications

This pattern applies to:
- **Delivery robots** paying security robots for incident footage
- **Autonomous vehicles** purchasing sensor data from nearby vehicles
- **Warehouse bots** paying for real-time hazard information
- **Drones** buying airspace data from other drones
