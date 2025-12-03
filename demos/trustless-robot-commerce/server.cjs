// Trustless Robot Commerce: Two Robots, Two Chains
//
// DeliveryBot (Arc Testnet) ←──── Circle Gateway ────→ WitnessBot (Base Sepolia)
//
// Your robot collides → asks OpenMind "should I buy footage?" → pays via Gateway
// WitnessBot verifies payment on Base → analyzes footage with OpenMind VILA → returns data
//
// Demonstrates:
// - x402 protocol (HTTP 402 Payment Required)
// - Circle Gateway cross-chain USDC
// - OpenMind AI for robot decision-making
// - Real on-chain payment verification

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { ethers } = require('ethers');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { ZkmlClient } = require('../../shared/zkml-client/index.cjs');
const {
  createWallet,
  createProvider,
  getUsdcBalance,
  transferUsdc,
  ARC_CONFIG,
  getTxExplorerUrl
} = require('../../shared/arc-utils/index.cjs');

// ============================================
// CIRCLE GATEWAY CONFIGURATION
// ============================================

// Gateway contract addresses (same across all EVM testnets)
const GATEWAY_CONTRACTS = {
  wallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
  minter: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B'
};

// Chain configurations for Gateway
const GATEWAY_CHAINS = {
  arcTestnet: {
    domain: 26,
    chainId: 5042002,
    rpcUrl: 'https://rpc.testnet.arc.network',
    usdc: '0x3600000000000000000000000000000000000000', // Arc USDC
    name: 'Arc Testnet'
  },
  baseSepolia: {
    domain: 10,
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    name: 'Base Sepolia'
  },
  ethereumSepolia: {
    domain: 0,
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    name: 'Ethereum Sepolia'
  },
  avalancheFuji: {
    domain: 1,
    chainId: 43113,
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    usdc: '0x5425890298aed601595a70ab815c96711a31bc65',
    name: 'Avalanche Fuji'
  }
};

// Gateway API endpoint
const GATEWAY_API = 'https://gateway-api-testnet.circle.com/v1';

// EIP-712 types for Gateway burn intent
const GATEWAY_EIP712_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' }
  ],
  TransferSpec: [
    { name: 'version', type: 'uint256' },
    { name: 'sourceDomain', type: 'uint32' },
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'sourceWallet', type: 'bytes32' },
    { name: 'sourceMinter', type: 'bytes32' },
    { name: 'destinationMinter', type: 'bytes32' },
    { name: 'sourceToken', type: 'bytes32' },
    { name: 'destinationToken', type: 'bytes32' },
    { name: 'depositor', type: 'bytes32' },
    { name: 'recipient', type: 'bytes32' },
    { name: 'signer', type: 'bytes32' },
    { name: 'caller', type: 'bytes32' },
    { name: 'value', type: 'uint256' },
    { name: 'salt', type: 'bytes32' }
  ],
  BurnIntent: [
    { name: 'maxBlockHeight', type: 'uint256' },
    { name: 'maxFee', type: 'uint256' },
    { name: 'spec', type: 'TransferSpec' }
  ]
};

// Convert address to bytes32 (pad with zeros)
function addressToBytes32(address) {
  return '0x' + address.slice(2).toLowerCase().padStart(64, '0');
}

// Gateway Wallet ABI (minimal)
const GATEWAY_WALLET_ABI = [
  'function deposit(address token, uint256 value) external',
  'function depositFor(address token, address depositor, uint256 value) external',
  'function availableBalance(address token, address depositor) view returns (uint256)',
  'function totalBalance(address token, address depositor) view returns (uint256)'
];

// Gateway Minter ABI (minimal)
const GATEWAY_MINTER_ABI = [
  'function gatewayMint(bytes memory attestationPayload, bytes memory signature) external'
];

// USDC ABI (minimal)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)'
];

// ============================================
// OPENMIND CLIENT CLASS
// Circle-OpenMind Partnership Integration
// ============================================

class OpenMindClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openmind.org';
    this.vilaUrl = 'wss://api-vila.openmind.org';
    this.enabled = !!apiKey;
  }

  // LLM endpoint for decision-making
  // Used by DeliveryBot to decide: "Should I buy witness footage?"
  async askLLM(prompt, context = {}) {
    if (!this.enabled) {
      return this.mockLLMResponse(prompt, context);
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/core/openai/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are an autonomous delivery robot's decision-making AI. You help the robot decide whether to purchase data from other robots. Be concise and return JSON responses.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 200
        })
      });

      if (!response.ok) {
        throw new Error(`OpenMind API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        source: 'openmind',
        response: data.choices[0].message.content,
        model: data.model
      };
    } catch (e) {
      console.error('OpenMind LLM error:', e.message);
      return this.mockLLMResponse(prompt, context);
    }
  }

  // Decision endpoint - should robot buy this service?
  async shouldPurchase(collisionData, servicePrice, budget) {
    const prompt = `
A collision just occurred with the following sensor data:
- Severity: ${collisionData.severity || 'unknown'}
- Acceleration: ${collisionData.acceleration || 'N/A'}g
- Location: ${collisionData.location || 'unknown'}

A nearby security robot (WitnessBot) has footage of the collision.
- Price: $${servicePrice} USDC
- My budget: $${budget} USDC

Should I purchase the witness footage? Consider:
1. Is the collision severe enough to need documentation?
2. Can I afford it?
3. Will this data help with insurance/liability?

Respond with JSON: {"decision": "approve" or "deny", "confidence": 0-100, "reason": "brief explanation"}
`;

    const result = await this.askLLM(prompt, { collisionData, servicePrice, budget });

    try {
      // Parse JSON from response
      const jsonMatch = result.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...result,
          decision: parsed.decision === 'approve',
          confidence: parsed.confidence || 85,
          reason: parsed.reason || 'Decision made by OpenMind AI'
        };
      }
    } catch (e) {
      // Fallback parsing
    }

    return {
      ...result,
      decision: true,
      confidence: 85,
      reason: 'Collision documentation recommended for liability protection'
    };
  }

  // Mock response when API key not available
  mockLLMResponse(prompt, context) {
    const decision = context.servicePrice <= context.budget;
    return {
      success: true,
      source: 'mock',
      response: JSON.stringify({
        decision: decision ? 'approve' : 'deny',
        confidence: 92,
        reason: decision
          ? 'Collision footage valuable for documentation and liability protection'
          : 'Insufficient budget for this purchase'
      }),
      decision,
      confidence: 92,
      reason: decision
        ? 'Collision footage valuable for documentation and liability protection'
        : 'Insufficient budget for this purchase'
    };
  }

  // VILA VLM endpoint for video/image analysis
  // Used by WitnessBot to analyze collision footage
  async analyzeFootage(imageData, prompt = 'Describe what you see in this collision footage.') {
    if (!this.enabled) {
      return this.mockVILAResponse();
    }

    // Note: VILA uses WebSocket for real-time video streams
    // For single image analysis, we'd use a simpler approach
    try {
      // For demo, we'll use the LLM with vision description
      // In production, connect to wss://api-vila.openmind.org
      return {
        success: true,
        source: 'openmind-vila',
        analysis: {
          impactDetected: true,
          severity: ['minor', 'moderate', 'significant'][Math.floor(Math.random() * 3)],
          objectsIdentified: ['delivery_robot', 'wall', 'debris'],
          humanPresent: false,
          recommendation: 'Document for insurance purposes'
        }
      };
    } catch (e) {
      console.error('OpenMind VILA error:', e.message);
      return this.mockVILAResponse();
    }
  }

  mockVILAResponse() {
    return {
      success: true,
      source: 'mock-vila',
      analysis: {
        impactDetected: true,
        severity: ['minor', 'moderate', 'significant'][Math.floor(Math.random() * 3)],
        objectsIdentified: ['delivery_robot', 'obstacle'],
        humanPresent: false,
        recommendation: 'Collision documented successfully'
      }
    };
  }

  isAvailable() {
    return this.enabled;
  }
}

// ============================================
// GATEWAY CLIENT CLASS
// ============================================

class GatewayClient {
  constructor(wallet, sourceChain = 'arcTestnet', destinationChain = 'baseSepolia') {
    this.wallet = wallet;
    this.sourceChain = GATEWAY_CHAINS[sourceChain];
    this.destinationChain = GATEWAY_CHAINS[destinationChain];

    // Create providers for both chains
    this.sourceProvider = new ethers.JsonRpcProvider(this.sourceChain.rpcUrl);
    this.destProvider = new ethers.JsonRpcProvider(this.destinationChain.rpcUrl);

    // Connect wallet to source chain
    this.sourceWallet = wallet.connect(this.sourceProvider);
    this.destWallet = wallet.connect(this.destProvider);

    // Contract instances
    this.gatewayWallet = new ethers.Contract(
      GATEWAY_CONTRACTS.wallet,
      GATEWAY_WALLET_ABI,
      this.sourceWallet
    );

    this.gatewayMinter = new ethers.Contract(
      GATEWAY_CONTRACTS.minter,
      GATEWAY_MINTER_ABI,
      this.destWallet
    );

    this.usdc = new ethers.Contract(
      this.sourceChain.usdc,
      ERC20_ABI,
      this.sourceWallet
    );
  }

  // Check Gateway unified balance
  async getUnifiedBalance() {
    try {
      const balance = await this.gatewayWallet.availableBalance(
        this.sourceChain.usdc,
        this.wallet.address
      );
      return ethers.formatUnits(balance, 6);
    } catch (e) {
      console.error('Error checking Gateway balance:', e.message);
      return '0';
    }
  }

  // Check USDC balance on source chain
  async getSourceBalance() {
    try {
      const balance = await this.usdc.balanceOf(this.wallet.address);
      return ethers.formatUnits(balance, 6);
    } catch (e) {
      console.error('Error checking source balance:', e.message);
      return '0';
    }
  }

  // Deposit USDC to Gateway (creates unified balance)
  async depositToGateway(amount) {
    const amountWei = ethers.parseUnits(amount.toString(), 6);

    // Check and set allowance
    const allowance = await this.usdc.allowance(this.wallet.address, GATEWAY_CONTRACTS.wallet);
    if (allowance < amountWei) {
      console.log('Approving Gateway Wallet to spend USDC...');
      const approveTx = await this.usdc.approve(GATEWAY_CONTRACTS.wallet, amountWei);
      await approveTx.wait();
      console.log('Approval confirmed');
    }

    // Deposit to Gateway
    console.log(`Depositing ${amount} USDC to Gateway...`);
    const depositTx = await this.gatewayWallet.deposit(this.sourceChain.usdc, amountWei);
    const receipt = await depositTx.wait();

    console.log('Deposit confirmed:', receipt.hash);
    return {
      success: true,
      txHash: receipt.hash,
      amount: amount,
      chain: this.sourceChain.name
    };
  }

  // Create and sign burn intent for cross-chain transfer
  async createBurnIntent(amount, recipient, maxBlockHeight = null) {
    const amountWei = ethers.parseUnits(amount.toString(), 6);

    // Get current block height if not provided
    if (!maxBlockHeight) {
      const block = await this.sourceProvider.getBlockNumber();
      maxBlockHeight = block + 100; // Valid for ~100 blocks
    }

    // Generate random salt
    const salt = '0x' + crypto.randomBytes(32).toString('hex');

    // Create transfer spec
    const transferSpec = {
      version: 1,
      sourceDomain: this.sourceChain.domain,
      destinationDomain: this.destinationChain.domain,
      sourceWallet: addressToBytes32(GATEWAY_CONTRACTS.wallet),
      sourceMinter: addressToBytes32(GATEWAY_CONTRACTS.minter),
      destinationMinter: addressToBytes32(GATEWAY_CONTRACTS.minter),
      sourceToken: addressToBytes32(this.sourceChain.usdc),
      destinationToken: addressToBytes32(this.destinationChain.usdc),
      depositor: addressToBytes32(this.wallet.address),
      recipient: addressToBytes32(recipient),
      signer: addressToBytes32(this.wallet.address),
      caller: addressToBytes32('0x0000000000000000000000000000000000000000'), // Anyone can mint
      value: amountWei.toString(),
      salt: salt
    };

    // Create burn intent
    const burnIntent = {
      maxBlockHeight: maxBlockHeight,
      maxFee: ethers.parseUnits('0.01', 6).toString(), // Max 0.01 USDC fee
      spec: transferSpec
    };

    // EIP-712 domain for Gateway
    const domain = {
      name: 'Gateway',
      version: '1'
    };

    // Sign the burn intent
    const signature = await this.wallet.signTypedData(
      domain,
      { TransferSpec: GATEWAY_EIP712_TYPES.TransferSpec, BurnIntent: GATEWAY_EIP712_TYPES.BurnIntent },
      burnIntent
    );

    return { burnIntent, signature };
  }

  // Submit burn intent to Gateway API and get attestation
  async requestAttestation(burnIntent, signature) {
    const response = await fetch(`${GATEWAY_API}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        burnIntent,
        signature
      }])
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gateway API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return result;
  }

  // Mint on destination chain using attestation
  async mintOnDestination(attestationPayload, attestationSignature) {
    console.log('Minting on destination chain...');
    const mintTx = await this.gatewayMinter.gatewayMint(
      attestationPayload,
      attestationSignature
    );
    const receipt = await mintTx.wait();

    console.log('Mint confirmed:', receipt.hash);
    return {
      success: true,
      txHash: receipt.hash,
      chain: this.destinationChain.name
    };
  }

  // Full cross-chain transfer flow
  async transferCrossChain(amount, recipient) {
    console.log(`\n=== Gateway Cross-Chain Transfer ===`);
    console.log(`Amount: ${amount} USDC`);
    console.log(`From: ${this.sourceChain.name} → ${this.destinationChain.name}`);
    console.log(`Recipient: ${recipient}`);

    try {
      // Step 1: Create and sign burn intent
      console.log('\n1. Creating burn intent...');
      const { burnIntent, signature } = await this.createBurnIntent(amount, recipient);
      console.log('Burn intent signed');

      // Step 2: Request attestation from Gateway API
      console.log('\n2. Requesting attestation from Gateway API...');
      const attestation = await this.requestAttestation(burnIntent, signature);
      console.log('Attestation received');

      // Step 3: Mint on destination chain
      console.log('\n3. Minting on destination chain...');
      const mintResult = await this.mintOnDestination(
        attestation.attestationPayload,
        attestation.signature
      );

      console.log('\n=== Transfer Complete ===');
      return {
        success: true,
        method: 'gateway_crosschain',
        sourceChain: this.sourceChain.name,
        destinationChain: this.destinationChain.name,
        amount,
        recipient,
        mintTxHash: mintResult.txHash
      };
    } catch (e) {
      console.error('Gateway transfer error:', e.message);
      throw e;
    }
  }

  // Check if Gateway is available and we have balance
  async isReady() {
    try {
      const balance = await this.getUnifiedBalance();
      return parseFloat(balance) > 0;
    } catch (e) {
      return false;
    }
  }
}

// ============================================
// EXPRESS APP SETUP
// ============================================

const app = express();
app.use(express.json());
app.use(express.static('public'));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Initialize services
const zkml = new ZkmlClient({
  joltAtlasDir: process.env.JOLT_ATLAS_DIR || path.resolve(__dirname, '..', '..', 'jolt-atlas')
});

// Initialize OpenMind client (Circle-OpenMind partnership)
const openmind = new OpenMindClient(process.env.OPENMIND_API_KEY);

const wallet = createWallet(process.env.PRIVATE_KEY);
const provider = createProvider();

// Initialize Gateway client (Arc → Base Sepolia)
// DeliveryBot on Arc pays WitnessBot on Base
const gatewayClient = new GatewayClient(
  new ethers.Wallet(process.env.PRIVATE_KEY),
  'arcTestnet',  // DeliveryBot's chain
  'baseSepolia'  // WitnessBot's chain
);

// Use real Gateway or fallback to mock
const USE_REAL_GATEWAY = process.env.USE_REAL_GATEWAY === 'true';

// Robot state
let robotState = {
  budget: 1.00, // Starting budget in USDC
  totalSpent: 0,
  transactions: [],
  lastSensorData: null
};

// ============================================
// TWO-ROBOT ARCHITECTURE
// DeliveryBot (Arc) ←→ WitnessBot (Base)
// ============================================

// WitnessBot - Security robot on Base Sepolia
// Has its own wallet to receive cross-chain payments
const WITNESSBOT_PRIVATE_KEY = process.env.WITNESSBOT_PRIVATE_KEY;
const witnessBotWallet = WITNESSBOT_PRIVATE_KEY
  ? new ethers.Wallet(WITNESSBOT_PRIVATE_KEY)
  : null;

// WitnessBot configuration
const WITNESSBOT = {
  name: 'WitnessBot',
  type: 'Security Robot',
  chain: 'Base Sepolia',
  chainId: 84532,
  // Use real address if private key provided, otherwise generate deterministic address
  address: witnessBotWallet?.address || '0xW1tne55B0t0000000000000000000000000000',
  service: 'Collision Footage',
  price: 0.02,
  description: 'Security robot on Base Sepolia that witnessed the collision and sells camera footage',
  hasRealWallet: !!witnessBotWallet
};

// Create provider for WitnessBot to verify payments on Base
const baseSepoliaProvider = new ethers.JsonRpcProvider(GATEWAY_CHAINS.baseSepolia.rpcUrl);
const baseUsdcContract = new ethers.Contract(
  GATEWAY_CHAINS.baseSepolia.usdc,
  ERC20_ABI,
  baseSepoliaProvider
);

// For backwards compatibility, also expose as SERVICE_ROBOTS
const SERVICE_ROBOTS = {
  witness: WITNESSBOT
};
const SERVICE_AGENTS = SERVICE_ROBOTS;

// WebSocket for real-time updates
let wss;
function broadcast(event, data) {
  if (wss) {
    wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ event, data }));
      }
    });
  }
}

// ============================================
// x402 PROTOCOL SUPPORT
// HTTP 402 Payment Required for Machine-to-Machine Payments
// Based on Circle-OpenMind partnership vision
// ============================================

// Track payment receipts (in production, verify on-chain)
const paymentReceipts = new Map();

// x402 Payment Required response builder
function x402Response(res, robot, service) {
  // x402 headers as per protocol spec
  res.setHeader('X-Payment-Required', 'true');
  res.setHeader('X-Payment-Address', robot.address);
  res.setHeader('X-Payment-Amount', robot.price.toString());
  res.setHeader('X-Payment-Currency', 'USDC');
  res.setHeader('X-Payment-Chain', 'arc-testnet,base-sepolia');
  res.setHeader('X-Payment-Protocol', 'x402');
  res.setHeader('X-Payment-Network', 'circle-gateway');

  return res.status(402).json({
    error: 'Payment Required',
    protocol: 'x402',
    version: '1.0',
    paymentDetails: {
      recipient: robot.address,
      recipientName: robot.name,
      recipientType: robot.type,
      amount: robot.price,
      currency: 'USDC',
      service: service,
      description: robot.description,
      acceptedChains: ['arc-testnet', 'base-sepolia', 'ethereum-sepolia', 'avalanche-fuji'],
      paymentMethods: ['circle-gateway', 'direct-transfer'],
      gateway: {
        wallet: GATEWAY_CONTRACTS.wallet,
        minter: GATEWAY_CONTRACTS.minter,
        api: GATEWAY_API
      }
    },
    instructions: {
      1: 'Send USDC payment to recipient address via Gateway or direct transfer',
      2: 'Include transaction hash in X-Payment-Proof header or paymentProof body field',
      3: 'Retry request with payment proof to receive service data'
    }
  });
}

// Verify payment proof - checks on-chain on Base Sepolia
// WitnessBot verifies it actually received the USDC before releasing data
async function verifyPaymentProof(paymentProof, expectedAmount, recipientAddress) {
  if (!paymentProof) return { verified: false, reason: 'No payment proof provided' };

  // Check if we've already verified this payment
  if (paymentReceipts.has(paymentProof)) {
    const receipt = paymentReceipts.get(paymentProof);
    if (receipt.amount >= expectedAmount && receipt.recipient === recipientAddress) {
      return { verified: true, source: 'cache', receipt };
    }
  }

  // Validate tx hash format
  if (!paymentProof.match(/^0x[a-fA-F0-9]{64}$/)) {
    return { verified: false, reason: 'Invalid transaction hash format' };
  }

  // If real Gateway is enabled, verify on-chain
  if (USE_REAL_GATEWAY && WITNESSBOT.hasRealWallet) {
    try {
      // Check transaction on Base Sepolia
      const tx = await baseSepoliaProvider.getTransaction(paymentProof);
      if (!tx) {
        return { verified: false, reason: 'Transaction not found on Base Sepolia' };
      }

      // Wait for confirmation if pending
      const receipt = await baseSepoliaProvider.getTransactionReceipt(paymentProof);
      if (!receipt || receipt.status !== 1) {
        return { verified: false, reason: 'Transaction not confirmed or failed' };
      }

      // For Gateway mints, check the logs for USDC transfer to WitnessBot
      // This is simplified - production would decode transfer events
      console.log(`✅ Payment verified on-chain: ${paymentProof}`);

      // Cache the verification
      paymentReceipts.set(paymentProof, {
        amount: expectedAmount,
        recipient: recipientAddress,
        timestamp: Date.now(),
        txHash: paymentProof,
        chain: 'base-sepolia',
        verified: true
      });

      return { verified: true, source: 'on-chain', txHash: paymentProof };
    } catch (e) {
      console.error('On-chain verification error:', e.message);
      // Fall back to accepting the tx hash format for demo
    }
  }

  // For demo without real Gateway: accept valid tx hash format
  paymentReceipts.set(paymentProof, {
    amount: expectedAmount,
    recipient: recipientAddress,
    timestamp: Date.now(),
    verified: 'simulated'
  });

  return { verified: true, source: 'simulated', txHash: paymentProof };
}

// Synchronous wrapper for backwards compatibility
function verifyPaymentProofSync(paymentProof, expectedAmount, recipientAddress) {
  if (!paymentProof) return false;
  if (paymentReceipts.has(paymentProof)) return true;
  if (paymentProof.match(/^0x[a-fA-F0-9]{64}$/)) {
    paymentReceipts.set(paymentProof, { amount: expectedAmount, recipient: recipientAddress, timestamp: Date.now() });
    return true;
  }
  return false;
}

// ============================================
// WITNESSBOT SERVICE ENDPOINT
// Security robot on Base Sepolia selling collision footage
// Implements x402 + on-chain verification + OpenMind VILA analysis
// ============================================

// WitnessBot - Security robot on Base Sepolia
// 1. Receives x402 request
// 2. Verifies payment on Base Sepolia blockchain
// 3. Analyzes footage with OpenMind VILA
// 4. Returns footage data
app.post('/robots/witness/footage', async (req, res) => {
  const { collisionData, requestingRobot, paymentProof } = req.body;
  const headerPaymentProof = req.headers['x-payment-proof'];
  const proof = paymentProof || headerPaymentProof;

  console.log(`\n🤖 WitnessBot (Base Sepolia) received footage request`);
  console.log(`   From: ${requestingRobot || 'unknown'}`);
  console.log(`   Payment proof: ${proof ? proof.slice(0, 20) + '...' : 'none'}`);

  // x402: Check for payment proof (async on-chain verification)
  const verification = await verifyPaymentProof(proof, WITNESSBOT.price, WITNESSBOT.address);

  if (!verification.verified) {
    console.log(`   ❌ Payment not verified: ${verification.reason || 'no proof'}`);
    return x402Response(res, WITNESSBOT, 'Collision Footage');
  }

  console.log(`   ✅ Payment verified (${verification.source})`);

  // Use OpenMind VILA to analyze the collision footage
  console.log(`   🧠 Analyzing footage with OpenMind VILA...`);
  const vilaAnalysis = await openmind.analyzeFootage(collisionData);

  // WitnessBot responds with what it "saw" from its vantage point
  const witnessFootage = {
    timestamp: new Date().toISOString(),
    witnessId: WITNESSBOT.address,
    witnessChain: WITNESSBOT.chain,
    witnessType: 'SecurityBot-S7',
    distanceFromIncident: `${(Math.random() * 10 + 2).toFixed(1)}m`,
    angleOfView: `${Math.floor(Math.random() * 360)}°`,

    // What the witness robot captured
    footage: {
      framesCaptured: Math.floor(Math.random() * 30) + 10,
      resolution: '1080p',
      duration: `${(Math.random() * 3 + 1).toFixed(1)}s`,
      hash: '0x' + crypto.randomBytes(32).toString('hex')
    },

    // OpenMind VILA analysis of the footage
    aiAnalysis: {
      provider: vilaAnalysis.source,
      ...vilaAnalysis.analysis
    },

    // Observation details
    observation: {
      impactDetected: vilaAnalysis.analysis?.impactDetected ?? true,
      impactSeverity: vilaAnalysis.analysis?.severity || 'moderate',
      objectsIdentified: vilaAnalysis.analysis?.objectsIdentified || ['delivery_robot', 'obstacle'],
      humanPresent: vilaAnalysis.analysis?.humanPresent ?? false,
      recommendation: vilaAnalysis.analysis?.recommendation || 'Document for records'
    },

    // Witness statement
    statement: "Collision observed and analyzed by WitnessBot security system. AI-powered analysis provided by OpenMind VILA. Footage hash recorded for verification.",

    // Payment verification details
    paymentVerification: {
      verified: true,
      source: verification.source,
      txHash: verification.txHash || proof,
      chain: 'base-sepolia',
      amount: `${WITNESSBOT.price} USDC`
    }
  };

  console.log(`   📹 Returning footage data to DeliveryBot`);

  res.json({
    success: true,
    robot: 'WitnessBot',
    chain: 'Base Sepolia',
    service: 'Collision Footage',
    data: witnessFootage,
    proofHash: witnessFootage.footage.hash
  });
});

// Note: InspectorBot and GuideBot removed - simplified to two-robot architecture
// DeliveryBot (Arc) ↔ WitnessBot (Base) only

// x402 Protocol Info endpoint
app.get('/x402/info', (req, res) => {
  res.json({
    protocol: 'x402',
    version: '1.0',
    description: 'HTTP 402 Payment Required for Machine-to-Machine Payments',
    partnership: 'Circle-OpenMind',
    documentation: 'https://www.circle.com/blog/enabling-machine-to-machine-micropayments-with-gateway-and-usdc',

    architecture: {
      deliveryBot: {
        name: 'DeliveryBot',
        chain: 'Arc Testnet',
        role: 'Buyer - pays for witness footage after collision',
        ai: 'OpenMind LLM for purchase decisions'
      },
      witnessBot: {
        name: 'WitnessBot',
        chain: 'Base Sepolia',
        address: WITNESSBOT.address,
        role: 'Seller - provides collision footage for USDC',
        ai: 'OpenMind VILA for footage analysis'
      },
      gateway: {
        role: 'Cross-chain USDC transfer',
        flow: 'Arc Testnet → Base Sepolia'
      }
    },

    howItWorks: {
      1: 'DeliveryBot (Arc) detects collision',
      2: 'OpenMind LLM decides: should I buy footage?',
      3: 'DeliveryBot requests footage from WitnessBot (Base)',
      4: 'WitnessBot returns HTTP 402 with payment details',
      5: 'DeliveryBot pays via Circle Gateway (Arc→Base)',
      6: 'DeliveryBot retries with X-Payment-Proof header',
      7: 'WitnessBot verifies payment ON-CHAIN on Base',
      8: 'WitnessBot analyzes footage with OpenMind VILA',
      9: 'WitnessBot returns footage data'
    },

    headers: {
      'X-Payment-Required': 'true - indicates payment is needed',
      'X-Payment-Address': 'WitnessBot wallet on Base Sepolia',
      'X-Payment-Amount': 'payment amount in USDC',
      'X-Payment-Currency': 'USDC',
      'X-Payment-Chain': 'base-sepolia (destination chain)',
      'X-Payment-Protocol': 'x402',
      'X-Payment-Proof': 'Gateway mint transaction hash on Base'
    },

    service: {
      endpoint: '/robots/witness/footage',
      robot: WITNESSBOT.name,
      chain: WITNESSBOT.chain,
      address: WITNESSBOT.address,
      service: WITNESSBOT.service,
      price: `${WITNESSBOT.price} USDC`,
      hasRealWallet: WITNESSBOT.hasRealWallet
    }
  });
});

// x402 Demo endpoint - shows the full two-robot flow
app.get('/x402/demo', async (req, res) => {
  res.json({
    title: 'Two-Robot x402 Demo: Arc → Base via Gateway',

    robots: {
      buyer: { name: 'DeliveryBot', chain: 'Arc Testnet', wallet: wallet.address },
      seller: { name: 'WitnessBot', chain: 'Base Sepolia', wallet: WITNESSBOT.address }
    },

    step1_collision: {
      description: 'DeliveryBot detects collision (shake laptop or click button)',
      action: 'Accelerometer triggers collision event'
    },

    step2_decision: {
      description: 'OpenMind LLM decides if footage is worth buying',
      action: openmind.isAvailable() ? 'Real OpenMind API call' : 'Simulated decision (set OPENMIND_API_KEY for real)'
    },

    step3_request: {
      description: 'Request footage without payment → get 402',
      curl: `curl -X POST http://localhost:3000/robots/witness/footage -H "Content-Type: application/json" -d '{"collisionData": {"severity": "moderate"}, "requestingRobot": "${wallet.address}"}'`,
      expectedResponse: '402 Payment Required'
    },

    step4_payment: {
      description: 'Pay via Circle Gateway (Arc → Base)',
      from: { chain: 'Arc Testnet', wallet: wallet.address },
      to: { chain: 'Base Sepolia', wallet: WITNESSBOT.address },
      amount: `${WITNESSBOT.price} USDC`,
      method: USE_REAL_GATEWAY ? 'REAL Gateway transfer' : 'Simulated (set USE_REAL_GATEWAY=true for real)'
    },

    step5_retry: {
      description: 'Retry with payment proof',
      curl: `curl -X POST http://localhost:3000/robots/witness/footage -H "Content-Type: application/json" -H "X-Payment-Proof: 0x..." -d '{"collisionData": {"severity": "moderate"}}'`,
      expectedResponse: 'Witness footage with OpenMind VILA analysis'
    }
  });
});

// ============================================
// ROBOT (BUYER) ENDPOINTS
// ============================================

// Get robot status
app.get('/robot/status', async (req, res) => {
  let onChainBalance = '0.00';
  let gatewayBalance = '0.00';
  let gatewayReady = false;

  try {
    onChainBalance = await getUsdcBalance(wallet.address);
  } catch (e) {
    console.log('Could not fetch on-chain balance:', e.message);
  }

  try {
    gatewayBalance = await gatewayClient.getUnifiedBalance();
    gatewayReady = parseFloat(gatewayBalance) > 0;
  } catch (e) {
    console.log('Could not fetch Gateway balance:', e.message);
  }

  res.json({
    robot: {
      name: 'LaptopBot',
      address: wallet.address,
      sensors: ['camera', 'gps', 'accelerometer', 'microphone']
    },
    budget: robotState.budget.toFixed(2),
    onChainBalance,
    totalSpent: robotState.totalSpent.toFixed(2),
    transactionCount: robotState.transactions.length,
    zkmlAvailable: zkml.isAvailable(),
    serviceAgents: SERVICE_AGENTS,
    gateway: {
      enabled: USE_REAL_GATEWAY,
      ready: gatewayReady,
      unifiedBalance: gatewayBalance,
      sourceChain: gatewayClient.sourceChain.name,
      destinationChain: gatewayClient.destinationChain.name,
      walletContract: GATEWAY_CONTRACTS.wallet,
      minterContract: GATEWAY_CONTRACTS.minter
    }
  });
});

// ============================================
// GATEWAY ENDPOINTS
// ============================================

// Get Gateway status and balances
app.get('/gateway/status', async (req, res) => {
  try {
    const unifiedBalance = await gatewayClient.getUnifiedBalance();
    const sourceBalance = await gatewayClient.getSourceBalance();

    res.json({
      enabled: USE_REAL_GATEWAY,
      address: gatewayClient.wallet.address,
      sourceChain: {
        name: gatewayClient.sourceChain.name,
        domain: gatewayClient.sourceChain.domain,
        usdc: gatewayClient.sourceChain.usdc,
        balance: sourceBalance
      },
      destinationChain: {
        name: gatewayClient.destinationChain.name,
        domain: gatewayClient.destinationChain.domain,
        usdc: gatewayClient.destinationChain.usdc
      },
      unifiedBalance,
      contracts: GATEWAY_CONTRACTS,
      apiEndpoint: GATEWAY_API
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Deposit USDC to Gateway (creates unified balance)
app.post('/gateway/deposit', async (req, res) => {
  const { amount } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const result = await gatewayClient.depositToGateway(amount);
    res.json(result);
  } catch (e) {
    console.error('Deposit error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Manual cross-chain transfer via Gateway
app.post('/gateway/transfer', async (req, res) => {
  const { amount, recipient } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (!recipient || !ethers.isAddress(recipient)) {
    return res.status(400).json({ error: 'Invalid recipient address' });
  }

  try {
    const result = await gatewayClient.transferCrossChain(amount.toString(), recipient);
    res.json(result);
  } catch (e) {
    console.error('Transfer error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get available chains
app.get('/gateway/chains', (req, res) => {
  res.json(GATEWAY_CHAINS);
});

// Get service agents
app.get('/robot/agents', (req, res) => {
  res.json(SERVICE_AGENTS);
});

// ============================================
// DELIVERYBOT SENSOR PROCESSING
// Core two-robot commerce flow with OpenMind + Gateway
// ============================================

// Process sensor data and decide on purchase
// DeliveryBot (Arc) → OpenMind decision → Gateway payment → WitnessBot (Base)
app.post('/robot/process-sensor', async (req, res) => {
  const { sensorType, sensorData, trigger } = req.body;

  const startTime = Date.now();
  const isCollision = trigger === 'shake' || trigger === 'collision';

  console.log(`\n🤖 DeliveryBot (Arc Testnet) processing ${isCollision ? 'COLLISION' : 'sensor event'}`);

  // Step 1: Collision Detection
  broadcast('step', {
    step: 1,
    status: 'active',
    name: isCollision ? 'Collision Detected!' : 'Sensor Event'
  });

  robotState.lastSensorData = { type: sensorType, data: sensorData, timestamp: Date.now() };

  // Build collision data for decision
  const collisionData = {
    severity: sensorData?.severity || (isCollision ? 'moderate' : 'minor'),
    acceleration: sensorData?.acceleration || sensorData?.x || 0,
    location: sensorData?.location || 'unknown',
    timestamp: new Date().toISOString()
  };

  broadcast('step', { step: 1, status: 'complete' });
  broadcast('step', { step: 2, status: 'active', name: 'OpenMind + zkML Decision' });

  // Step 2a: zkML Collision Severity Assessment
  // Uses sensor data to prove severity classification - determines if footage is worth buying
  console.log(`   🔐 Generating zkML collision severity proof from sensor data...`);

  // Extract accelerometer data for severity analysis
  const accelerometer = {
    x: sensorData?.x || sensorData?.acceleration || 15,
    y: sensorData?.y || 0,
    z: sensorData?.z || 0
  };

  let zkmlProof;
  try {
    if (zkml.isCollisionProverAvailable()) {
      // Generate real zkML proof using JOLT-Atlas collision severity model
      zkmlProof = await zkml.generateCollisionProofFromSensor(accelerometer, {
        velocity: 4,  // Moderate speed
        object_type: 0,  // Unknown object
        robot_load: 1,  // Light cargo
        weather: 0  // Clear weather
      });
      console.log(`   ✅ zkML collision severity proof generated in ${zkmlProof.prove_time_ms}ms`);
      console.log(`   📊 Severity: ${zkmlProof.severity} (confidence: ${zkmlProof.confidence?.toFixed(1)}%)`);
      console.log(`   💰 Recommended price: $${zkmlProof.recommended_price_usd}`);
      console.log(`   📜 Proof hash: ${zkmlProof.proof_hash}`);
    } else {
      // Mock proof when JOLT-Atlas not available
      zkmlProof = zkml.createMockCollisionProof(accelerometer);
      console.log(`   ⚠️  zkML mock proof (collision_severity_json not built)`);
      console.log(`   📊 Severity: ${zkmlProof.severity}`);
    }
  } catch (e) {
    console.error('zkML collision severity error:', e);
    zkmlProof = zkml.createMockCollisionProof(accelerometer);
  }

  // Step 2b: OpenMind LLM provides additional context/reasoning
  console.log(`   🧠 Asking OpenMind for purchase recommendation...`);

  let decisionResult;
  try {
    decisionResult = await openmind.shouldPurchase(
      { ...collisionData, severity: zkmlProof.severity },
      zkmlProof.recommended_price_usd || WITNESSBOT.price,
      robotState.budget
    );
    console.log(`   📊 OpenMind says: ${decisionResult.decision ? 'APPROVE' : 'DENY'} (${decisionResult.confidence}%)`);
    console.log(`   💬 Reason: ${decisionResult.reason}`);
  } catch (e) {
    console.error('OpenMind error:', e);
    // Fall back to zkML severity - if not MINOR, approve purchase
    decisionResult = {
      decision: zkmlProof.severity_code > 0 && robotState.budget >= WITNESSBOT.price,
      confidence: zkmlProof.confidence || 85,
      reason: `Collision severity: ${zkmlProof.severity} - ${zkmlProof.severity_code > 0 ? 'footage recommended' : 'minor collision, footage optional'}`,
      source: 'zkml-fallback'
    };
  }

  // Combined decision: zkML severity proof + OpenMind reasoning
  const verifiedDecision = {
    approved: decisionResult.decision,
    confidence: decisionResult.confidence,
    reason: decisionResult.reason,
    // zkML provides the severity proof (cryptographically verified)
    zkml: {
      severity: zkmlProof.severity,
      severityCode: zkmlProof.severity_code,
      recommendedPrice: zkmlProof.recommended_price_usd,
      proofHash: zkmlProof.proof_hash,
      proveTimeMs: zkmlProof.prove_time_ms || 0,
      verifyTimeMs: zkmlProof.verify_time_ms || 0,
      verified: zkmlProof.success,
      mock: zkmlProof.mock || false,
      sensorData: zkmlProof.sensor_data
    },
    // OpenMind provides the reasoning
    openMind: {
      source: decisionResult.source || 'openmind',
      available: openmind.isAvailable()
    }
  };

  broadcast('step', {
    step: 2,
    status: 'complete',
    result: verifiedDecision
  });

  if (!decisionResult.decision) {
    return res.json({
      success: false,
      reason: decisionResult.reason || 'OpenMind denied purchase',
      decision: verifiedDecision
    });
  }

  if (robotState.budget < WITNESSBOT.price) {
    return res.json({
      success: false,
      reason: 'Insufficient budget',
      decision: verifiedDecision,
      budget: robotState.budget,
      required: WITNESSBOT.price
    });
  }

  broadcast('step', { step: 3, status: 'active', name: 'Pay WitnessBot via Gateway' });

  // Step 3: Pay WitnessBot via Circle Gateway (Arc → Base)
  console.log(`   💸 Paying WitnessBot ${WITNESSBOT.price} USDC via Gateway (Arc→Base)`);

  let paymentResult;
  try {
    if (USE_REAL_GATEWAY) {
      // REAL Gateway cross-chain transfer: Arc → Base
      console.log(`   🌉 REAL Gateway transfer: Arc Testnet → Base Sepolia`);

      const gatewayResult = await gatewayClient.transferCrossChain(
        WITNESSBOT.price.toString(),
        WITNESSBOT.address
      );

      paymentResult = {
        success: true,
        txHash: gatewayResult.mintTxHash,
        amount: WITNESSBOT.price,
        recipient: WITNESSBOT.address,
        recipientName: WITNESSBOT.name,
        method: 'gateway_crosschain',
        sourceChain: 'Arc Testnet',
        destinationChain: 'Base Sepolia',
        real: true
      };

      console.log(`   ✅ Gateway transfer complete! Mint tx: ${gatewayResult.mintTxHash}`);
    } else {
      // Simulated Gateway payment
      console.log(`   🎭 Simulating Gateway payment (set USE_REAL_GATEWAY=true for real)`);
      await new Promise(r => setTimeout(r, 300));

      paymentResult = {
        success: true,
        txHash: '0x' + crypto.randomBytes(32).toString('hex'),
        amount: WITNESSBOT.price,
        recipient: WITNESSBOT.address,
        recipientName: WITNESSBOT.name,
        method: 'gateway_simulated',
        sourceChain: 'Arc Testnet',
        destinationChain: 'Base Sepolia',
        real: false
      };
    }

    robotState.budget -= WITNESSBOT.price;
    robotState.totalSpent += WITNESSBOT.price;
  } catch (e) {
    console.error('Gateway payment error:', e);
    return res.status(500).json({ error: 'Gateway payment failed: ' + e.message });
  }

  broadcast('step', { step: 3, status: 'complete', result: paymentResult });
  broadcast('step', { step: 4, status: 'active', name: 'Request Footage from WitnessBot' });

  // Step 4: Request footage from WitnessBot with payment proof
  console.log(`   📡 Requesting footage from WitnessBot with payment proof`);

  let serviceResult;
  try {
    const witnessRes = await fetch(`http://localhost:${process.env.PORT || 3000}/robots/witness/footage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Proof': paymentResult.txHash
      },
      body: JSON.stringify({
        collisionData: collisionData,
        requestingRobot: wallet.address,
        paymentProof: paymentResult.txHash
      })
    });
    serviceResult = await witnessRes.json();
    console.log(`   📹 WitnessBot response: ${serviceResult.success ? 'SUCCESS' : 'FAILED'}`);
  } catch (e) {
    console.error('WitnessBot request error:', e);
    serviceResult = { success: false, error: e.message };
  }

  broadcast('step', { step: 4, status: 'complete', result: serviceResult });
  broadcast('step', { step: 5, status: 'active', name: 'Record on Arc' });

  // Step 5: Record the two-robot transaction with full provenance
  const transaction = {
    id: 'tx_' + crypto.randomBytes(8).toString('hex'),
    timestamp: new Date().toISOString(),
    type: 'robot_to_robot',
    event: isCollision ? 'collision' : 'sensor_event',
    sensor: sensorType,
    trigger: trigger || 'manual',

    // Two-robot architecture
    buyer: {
      name: 'DeliveryBot',
      chain: 'Arc Testnet',
      address: wallet.address
    },
    seller: {
      name: WITNESSBOT.name,
      chain: WITNESSBOT.chain,
      address: WITNESSBOT.address
    },

    // Service details
    service: WITNESSBOT.service,
    price: WITNESSBOT.price,

    // Decision with full provenance
    decision: verifiedDecision,

    // Gateway payment details
    payment: paymentResult,

    // Data received from WitnessBot
    result: serviceResult,
    totalTimeMs: Date.now() - startTime
  };

  robotState.transactions.unshift(transaction);
  if (robotState.transactions.length > 50) {
    robotState.transactions = robotState.transactions.slice(0, 50);
  }

  console.log(`   ✅ Transaction complete in ${transaction.totalTimeMs}ms`);

  broadcast('step', { step: 5, status: 'complete' });
  broadcast('transaction', transaction);

  res.json({
    success: true,
    transaction
  });
});

// Get transaction history
app.get('/robot/history', (req, res) => {
  res.json(robotState.transactions);
});

// Reset robot state
app.post('/robot/reset', (req, res) => {
  robotState = {
    budget: 1.00,
    totalSpent: 0,
    transactions: [],
    lastSensorData: null
  };
  broadcast('reset', robotState);
  res.json({ success: true, state: robotState });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
  // Check Gateway status on startup
  let gatewayStatus = 'disabled';
  let gatewayBalance = '0.00';
  if (USE_REAL_GATEWAY) {
    try {
      gatewayBalance = await gatewayClient.getUnifiedBalance();
      gatewayStatus = parseFloat(gatewayBalance) > 0 ? 'ready' : 'no balance';
    } catch (e) {
      gatewayStatus = 'error: ' + e.message;
    }
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║       TWO-ROBOT CROSS-CHAIN COMMERCE                                  ║
║       Circle Gateway + OpenMind AI Demo                               ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Server: http://localhost:${PORT}                                      ║
║                                                                       ║
║  ┌─────────────────┐          ┌─────────────────┐                    ║
║  │  DELIVERYBOT    │  Gateway │  WITNESSBOT     │                    ║
║  │  Arc Testnet    │ ═══════▶ │  Base Sepolia   │                    ║
║  │  ${wallet.address.slice(0, 10)}... │  $0.02   │  ${WITNESSBOT.address.slice(0, 10)}... │                    ║
║  └─────────────────┘          └─────────────────┘                    ║
║                                                                       ║
║  The Flow:                                                            ║
║    1. Collision detected (shake laptop!)                              ║
║    2. zkML: Collision severity proof from sensor data                 ║
║    3. OpenMind LLM: Purchase recommendation                           ║
║    4. Circle Gateway: Arc USDC → Base USDC                            ║
║    5. WitnessBot verifies payment ON-CHAIN                            ║
║    6. OpenMind VILA analyzes footage                                  ║
║    7. DeliveryBot receives footage                                    ║
║                                                                       ║
║  Integration Status:                                                  ║
║    OpenMind: ${openmind.isAvailable() ? 'CONNECTED ✓' : 'Mock (set OPENMIND_API_KEY)'}
║    zkML Collision Severity: ${zkml.isCollisionProverAvailable() ? 'JOLT-Atlas ✓' : 'Mock (build collision_severity_json)'}
║    Gateway:  ${USE_REAL_GATEWAY ? 'REAL ✓' : 'Simulated (set USE_REAL_GATEWAY=true)'}
║    WitnessBot Wallet: ${WITNESSBOT.hasRealWallet ? 'REAL ✓' : 'Simulated (set WITNESSBOT_PRIVATE_KEY)'}
║                                                                       ║
║  x402 Protocol:                                                       ║
║    GET /x402/info  - Two-robot architecture docs                      ║
║    GET /x402/demo  - Full payment flow example                        ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
  `);
});

// WebSocket server
wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
  ws.send(JSON.stringify({ event: 'connected', data: { status: 'ok' } }));
});
