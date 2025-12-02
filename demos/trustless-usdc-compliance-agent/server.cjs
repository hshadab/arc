// USDC Compliance Agent
// Compliant AI agent for agentic commerce on Arc
// Showcases zkML-proven compliance for autonomous transactions

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { ethers } = require('ethers');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { ZkmlClient } = require('../../shared/zkml-client/index.cjs');
const {
  createWallet,
  createProvider,
  getUsdcBalance,
  transferUsdc,
  signCommitment,
  signControllerCommitment,
  ARC_CONFIG,
  getTxExplorerUrl,
  EIP712_CONTROLLER_COMMITMENT_TYPES,
  createControllerDomain
} = require('../../shared/arc-utils/index.cjs');

// ArcAgentController ABI
const controllerABI = require('./contracts/ArcAgentController.json').abi;

const app = express();
app.use(express.json());

// Serve static files with cache disabled
app.use(express.static('public', {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
}));

// CORS + cache headers for all responses
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

const wallet = createWallet(process.env.PRIVATE_KEY);
const provider = createProvider();

// Circle API configuration
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_API_URL = 'https://api.circle.com/v1/w3s';
const USE_LIVE_COMPLIANCE = CIRCLE_API_KEY && CIRCLE_API_KEY.includes(':');

// ArcAgentController configuration
const CONTROLLER_ADDRESS = process.env.ARC_AGENT_CONTROLLER_ADDRESS;
const USE_CONTROLLER = !!CONTROLLER_ADDRESS;

// Initialize controller contract if configured
let controller = null;
let controllerWallet = null;
if (USE_CONTROLLER) {
  const controllerProvider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL || ARC_CONFIG.rpcUrl);
  controllerWallet = new ethers.Wallet(process.env.PRIVATE_KEY, controllerProvider);
  controller = new ethers.Contract(CONTROLLER_ADDRESS, controllerABI, controllerWallet);
}

// Sign commitment for controller using shared utility
async function signControllerCommitmentLocal(commitment) {
  return signControllerCommitment(controllerWallet, commitment, CONTROLLER_ADDRESS);
}

// Circle Wallet state
let circleWalletId = process.env.CIRCLE_WALLET_ID || null;
let circleWalletAddress = null;

// Settlement history (in-memory for demo)
const settlements = [];

// ============================================
// CIRCLE WALLET INTEGRATION
// ============================================

/**
 * Initialize or get Circle Programmable Wallet for the agent
 */
async function initCircleWallet() {
  if (!CIRCLE_API_KEY) return null;

  // If we have a wallet ID, fetch its address
  if (circleWalletId) {
    try {
      const response = await fetch(`${CIRCLE_API_URL}/wallets/${circleWalletId}`, {
        headers: { 'Authorization': `Bearer ${CIRCLE_API_KEY}` }
      });
      const data = await response.json();
      if (data.data?.wallet) {
        circleWalletAddress = data.data.wallet.address;
        return data.data.wallet;
      }
    } catch (e) {
      console.error('[WALLET] Failed to fetch wallet:', e.message);
    }
  }

  return null;
}

/**
 * Execute transfer via Circle Wallet API
 */
async function circleWalletTransfer(to, amount) {
  if (!CIRCLE_API_KEY || !circleWalletId) {
    return null; // Fall back to EOA
  }

  try {
    const response = await fetch(`${CIRCLE_API_URL}/developer/transactions/transfer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CIRCLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletId: circleWalletId,
        tokenId: process.env.CIRCLE_USDC_TOKEN_ID || 'usdc', // USDC on Arc
        destinationAddress: to,
        amounts: [amount],
        idempotencyKey: crypto.randomUUID()
      })
    });

    const data = await response.json();
    if (data.data?.transaction) {
      return {
        txHash: data.data.transaction.txHash,
        status: data.data.transaction.state,
        source: 'circle-wallet'
      };
    }
  } catch (error) {
    console.error('[WALLET] Circle transfer failed:', error.message);
  }

  return null;
}

// Initialize Circle Wallet on startup
initCircleWallet().then(wallet => {
  if (wallet) {
    console.log(`Circle Wallet: ${wallet.address} (ID: ${circleWalletId})`);
  }
});

console.log('\n=== USDC Compliance Agent ===');
console.log(`Agent Wallet: ${wallet.address}`);
console.log(`Network: Arc Testnet (${ARC_CONFIG.chainId})`);
console.log(`zkML Available: ${zkml.isAvailable()}`);
console.log(`Compliance Mode: ${USE_LIVE_COMPLIANCE ? 'LIVE (Circle API)' : 'MOCK'}`);
console.log(`Transfer Mode: ${USE_CONTROLLER ? `Controller (${CONTROLLER_ADDRESS})` : 'EOA (direct)'}`);
console.log('====================================\n');

// ============================================
// COMPLIANCE SCREENING
// ============================================

/**
 * Screen address using Circle Compliance Engine
 * API Docs: https://developers.circle.com/api-reference/w3s/compliance/screen-address
 */
// Default chain for Circle Compliance Engine (configurable via env)
const COMPLIANCE_CHAIN = process.env.COMPLIANCE_CHAIN || 'ETH-SEPOLIA';

async function screenAddress(address, chain = COMPLIANCE_CHAIN) {
  if (USE_LIVE_COMPLIANCE) {
    try {
      const response = await fetch(`${CIRCLE_API_URL}/compliance/screening/addresses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CIRCLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          address,
          chain,
          idempotencyKey: crypto.randomUUID()
        })
      });

      const data = await response.json();

      // Handle API errors
      if (!response.ok) {
        console.error('[COMPLIANCE] Circle API error:', data.message || response.statusText);
        return mockComplianceScreen(address);
      }

      if (data.data) {
        // Parse risk signals from decision.reasons array
        const reasons = data.data.decision?.reasons || [];

        // Map string risk levels to numeric scores (0-10)
        const riskLevelMap = {
          'LOW': 2,
          'MEDIUM': 5,
          'HIGH': 7,
          'SEVERE': 9,
          'CRITICAL': 10
        };

        let maxRisk = 0;
        let hasSanctions = false;
        let riskCategories = [];

        for (const reason of reasons) {
          // Get numeric risk score from string level
          const riskLevel = riskLevelMap[reason.riskScore?.toUpperCase()] || 5;
          maxRisk = Math.max(maxRisk, riskLevel);

          // Check for sanctions in risk categories
          if (reason.riskCategories?.includes('SANCTIONS')) {
            hasSanctions = true;
          }

          // Collect all risk categories
          if (reason.riskCategories) {
            riskCategories.push(...reason.riskCategories);
          }
        }

        return {
          result: data.data.result, // APPROVED or DENIED
          riskScore: maxRisk,
          sanctions: hasSanctions,
          riskCategories: [...new Set(riskCategories)], // Unique categories
          source: 'circle',
          alertId: data.data.alertId || null
        };
      }
    } catch (error) {
      console.error('[COMPLIANCE] Circle API error:', error.message);
    }
  }

  // Mock compliance screening
  return mockComplianceScreen(address);
}

/**
 * Mock compliance screening for demo
 */
function mockComplianceScreen(address) {
  // Simulate different risk levels based on address (using SHA256 for consistency)
  const hash = crypto.createHash('sha256').update(address).digest('hex');
  const riskValue = parseInt(hash.substring(0, 2), 16);

  // 90% approval rate for demo
  const approved = riskValue < 230;
  const riskScore = Math.floor(riskValue / 25.5); // 0-10 scale
  const hasSanctions = riskValue > 250;

  // Generate mock risk categories based on score
  const riskCategories = [];
  if (hasSanctions) riskCategories.push('SANCTIONS');
  if (riskScore > 5) riskCategories.push('HIGH_RISK_INDUSTRY');
  if (riskScore > 7) riskCategories.push('ILLICIT_BEHAVIOR');

  return {
    result: approved ? 'APPROVED' : 'DENIED',
    riskScore,
    sanctions: hasSanctions,
    riskCategories,
    source: 'mock',
    alertId: null
  };
}

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/health', async (req, res) => {
  let balance = '0';
  try {
    balance = await getUsdcBalance(wallet.address);
  } catch (e) {
    console.error('Balance check failed:', e.message);
  }

  res.json({
    service: 'USDC Compliance Agent',
    status: 'operational',
    agent: {
      eoaWallet: wallet.address,
      circleWallet: circleWalletAddress || null,
      circleWalletId: circleWalletId || null,
      balance: `${balance} USDC`,
      walletMode: circleWalletId ? 'circle' : 'eoa'
    },
    capabilities: {
      zkmlProofs: zkml.isAvailable(),
      complianceMode: USE_LIVE_COMPLIANCE ? 'live' : 'mock',
      circleWallet: !!circleWalletId,
      controller: USE_CONTROLLER ? CONTROLLER_ADDRESS : null,
      transferMode: USE_CONTROLLER ? 'controller' : (circleWalletId ? 'circle' : 'eoa'),
      network: 'arc-testnet'
    },
    stats: {
      totalSettlements: settlements.length,
      approved: settlements.filter(s => s.approved).length,
      denied: settlements.filter(s => !s.approved).length
    }
  });
});

// GET /balance/:address - Get USDC balance for any address
app.get('/balance/:address', async (req, res) => {
  const { address } = req.params;

  // Validate address format
  if (!address || !ethers.isAddress(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address format' });
  }

  try {
    const balance = await getUsdcBalance(address);
    res.json({ address, balance: parseFloat(balance) });
  } catch (e) {
    console.error(`Balance check failed for ${address}:`, e.message);
    res.status(500).json({ address, balance: 0, error: e.message });
  }
});

// POST /screen - Screen an address
app.post('/screen', async (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ error: 'address required' });
  }

  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address format' });
  }

  console.log(`[SCREEN] Checking address: ${address}`);

  const screening = await screenAddress(address);

  console.log(`[SCREEN] Result: ${screening.result} (risk: ${screening.riskScore})`);

  res.json({
    address,
    result: screening.result,
    riskScore: screening.riskScore,
    sanctions: screening.sanctions,
    riskCategories: screening.riskCategories || [],
    source: screening.source,
    alertId: screening.alertId || null,
    timestamp: Date.now()
  });
});

// POST /settle - Execute compliant settlement (legacy non-streaming)
app.post('/settle', async (req, res) => {
  const { to, amount, reference, memo } = req.body;

  if (!to || !amount) {
    return res.status(400).json({ error: 'to and amount required' });
  }

  if (!ethers.isAddress(to)) {
    return res.status(400).json({ error: 'Invalid recipient address format' });
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'Invalid amount: must be a positive number' });
  }

  if (amountNum > 1000000) {
    return res.status(400).json({ error: 'Amount exceeds maximum allowed (1,000,000 USDC)' });
  }

  // Redirect to streaming endpoint internally
  req.query.stream = 'false';
  return handleSettle(req, res, null);
});

// GET /settle-stream - SSE endpoint for real-time settlement progress
app.get('/settle-stream', async (req, res) => {
  const { to, amount, reference, memo } = req.query;

  if (!to || !amount) {
    return res.status(400).json({ error: 'to and amount required' });
  }

  if (!ethers.isAddress(to)) {
    return res.status(400).json({ error: 'Invalid recipient address format' });
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0 || amountNum > 1000000) {
    return res.status(400).json({ error: 'Invalid amount: must be positive and <= 1,000,000 USDC' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Helper to send SSE events
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  req.body = { to, amount, reference, memo };
  return handleSettle(req, res, sendEvent);
});

// Shared settlement logic
async function handleSettle(req, res, sendEvent) {
  const { to, amount, reference, memo } = req.body;
  const isStreaming = !!sendEvent;

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    if (isStreaming) {
      sendEvent('error', { error: 'invalid amount' });
      res.end();
    } else {
      res.status(400).json({ error: 'invalid amount' });
    }
    return;
  }

  console.log(`\n[SETTLE] Processing: ${amount} USDC to ${to}`);
  console.log(`[SETTLE] Reference: ${reference || 'none'}`);

  const settlementId = `SET-${Date.now()}`;
  const startTime = Date.now();

  // Helper to emit step progress
  const emitStep = (step, status, data = {}) => {
    if (isStreaming) {
      sendEvent('step', { step, status, ...data, elapsed: Date.now() - startTime });
    }
  };

  try {
    // Step 1: Screen sender
    emitStep(1, 'active');
    console.log('[STEP 1] Screening sender (agent wallet)...');
    const senderScreening = await screenAddress(wallet.address);
    emitStep(1, 'complete', { result: senderScreening });

    // Step 2: Screen recipient
    emitStep(2, 'active');
    console.log('[STEP 2] Screening recipient...');
    const recipientScreening = await screenAddress(to);
    emitStep(2, 'complete', { result: recipientScreening });

    // Combine screening results
    const screening = {
      result: (senderScreening.result === 'APPROVED' && recipientScreening.result === 'APPROVED') ? 'APPROVED' : 'DENIED',
      riskScore: Math.max(senderScreening.riskScore, recipientScreening.riskScore),
      source: senderScreening.source,
      sender: senderScreening,
      recipient: recipientScreening
    };

    console.log(`[SCREEN] Sender: ${senderScreening.result} (risk: ${senderScreening.riskScore})`);
    console.log(`[SCREEN] Recipient: ${recipientScreening.result} (risk: ${recipientScreening.riskScore})`);

    // Step 3: Build compliance features
    emitStep(3, 'active');
    const travelRuleRequired = amountNum >= 3000;
    if (travelRuleRequired) {
      console.log('[STEP 3] Travel Rule applies (amount >= $3000)');
    }

    const complianceFeatures = {
      budget: screening.result === 'APPROVED' ? 15 : 5,
      trust: screening.result === 'APPROVED' ? 7 : 0,
      amount: screening.result === 'APPROVED' ? 5 : 12,
      category: 0,
      velocity: 2,
      day: 1,
      time: 1,
      risk: screening.riskScore > 7 ? 1 : 0
    };
    emitStep(3, 'complete', { features: Object.keys(complianceFeatures).length });

    // Step 4: Generate zkML proof
    emitStep(4, 'active');
    console.log('[STEP 4] Generating zkML compliance proof...');
    let proof;
    if (zkml.isAvailable()) {
      proof = await zkml.generateProof(complianceFeatures);
    } else {
      proof = zkml.createMockProof(
        screening.result === 'APPROVED' ? 1 : 0,
        screening.result === 'APPROVED' ? 0.95 : 0.1
      );
      proof.mock = true;
    }
    emitStep(4, 'complete', {
      proof: {
        hash: proof.proof_hash,
        decision: proof.decision,
        confidence: proof.confidence,
        proveTimeMs: proof.prove_time_ms,
        verifyTimeMs: proof.verify_time_ms
      }
    });

    const approved = proof.decision === 'AUTHORIZED' && screening.result === 'APPROVED';

    // Step 5: Sign commitment
    emitStep(5, 'active');
    console.log('[STEP 5] Signing commitment...');
    const commitment = {
      proofHash: '0x' + proof.proof_hash.padStart(64, '0'),
      decision: approved ? 1 : 0,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: Date.now()
    };
    const signature = USE_CONTROLLER
      ? await signControllerCommitmentLocal(commitment)
      : await signCommitment(wallet, commitment);
    emitStep(5, 'complete', { commitment });

    // Step 6: Execute transfer if approved
    emitStep(6, 'active');
    let txHash = null;
    let explorerUrl = null;
    let gasUsed = null;
    let effectiveGasPrice = null;

    if (approved) {
      console.log('[STEP 6] Executing settlement on Arc...');

      if (USE_CONTROLLER && controller) {
        try {
          const amountWei = ethers.parseUnits(amount.toString(), 6);
          const normalizedTo = ethers.getAddress(to);

          const tx = await controller.executeTransfer(
            normalizedTo,
            amountWei,
            {
              proofHash: commitment.proofHash,
              decision: commitment.decision,
              timestamp: commitment.timestamp,
              nonce: commitment.nonce
            },
            signature
          );

          const receipt = await tx.wait();
          txHash = receipt.hash;
          gasUsed = receipt.gasUsed ? Number(receipt.gasUsed) : null;
          effectiveGasPrice = receipt.effectiveGasPrice ? Number(receipt.effectiveGasPrice) : null;
          explorerUrl = getTxExplorerUrl(txHash);
          console.log(`[SUCCESS] Controller TX: ${txHash} (gas: ${gasUsed}, price: ${effectiveGasPrice})`);
        } catch (txError) {
          console.error('[ERROR] Controller transfer failed:', txError.message);
          console.log('[FALLBACK] Attempting direct EOA transfer...');
          // Fallback to EOA transfer if controller fails
          try {
            const receipt = await transferUsdc(wallet, to, amount);
            txHash = receipt.hash;
            gasUsed = receipt.gasUsed ? Number(receipt.gasUsed) : null;
            effectiveGasPrice = receipt.effectiveGasPrice ? Number(receipt.effectiveGasPrice) : null;
            explorerUrl = getTxExplorerUrl(txHash);
            console.log(`[SUCCESS] Fallback EOA TX: ${txHash}`);
          } catch (fallbackError) {
            console.error('[ERROR] Fallback transfer also failed:', fallbackError.message);
          }
        }
      } else if (circleWalletId) {
        const circleResult = await circleWalletTransfer(to, amount);
        if (circleResult) {
          txHash = circleResult.txHash;
          explorerUrl = getTxExplorerUrl(txHash);
          console.log(`[SUCCESS] Circle Wallet TX: ${txHash}`);
        }
      } else {
        try {
          const receipt = await transferUsdc(wallet, to, amount);
          txHash = receipt.hash;
          gasUsed = receipt.gasUsed ? Number(receipt.gasUsed) : null;
          effectiveGasPrice = receipt.effectiveGasPrice ? Number(receipt.effectiveGasPrice) : null;
          explorerUrl = getTxExplorerUrl(txHash);
          console.log(`[SUCCESS] EOA TX: ${txHash} (gas: ${gasUsed}, price: ${effectiveGasPrice})`);
        } catch (txError) {
          console.error('[ERROR] Transfer failed:', txError.message);
        }
      }
    } else {
      console.log('[DENIED] Settlement blocked by compliance');
    }
    emitStep(6, 'complete', { txHash, explorerUrl, gasUsed, effectiveGasPrice });

    const duration = Date.now() - startTime;

    // Record settlement
    const settlement = {
      id: settlementId,
      to,
      amount,
      reference,
      memo,
      approved,
      screening: {
        result: screening.result,
        riskScore: screening.riskScore,
        sanctions: screening.sender?.sanctions || screening.recipient?.sanctions || false,
        riskCategories: [...new Set([
          ...(senderScreening.riskCategories || []),
          ...(recipientScreening.riskCategories || [])
        ])],
        source: screening.source,
        sender: senderScreening,
        recipient: recipientScreening
      },
      proof: {
        hash: proof.proof_hash,
        decision: proof.decision,
        confidence: proof.confidence,
        proveTimeMs: proof.prove_time_ms,
        verifyTimeMs: proof.verify_time_ms,
        mock: proof.mock || false
      },
      commitment,
      signature,
      txHash,
      explorerUrl,
      gasUsed,
      effectiveGasPrice,
      travelRuleRequired,
      duration,
      timestamp: Date.now()
    };

    settlements.push(settlement);

    console.log(`[COMPLETE] Settlement ${settlementId} in ${duration}ms\n`);

    if (isStreaming) {
      sendEvent('complete', settlement);
      res.end();
    } else {
      res.json(settlement);
    }

  } catch (error) {
    console.error('[ERROR] Settlement failed:', error);
    if (isStreaming) {
      sendEvent('error', { error: error.message, settlementId });
      res.end();
    } else {
      res.status(500).json({ error: error.message, settlementId });
    }
  }
}

// GET /settlements - List settlement history
app.get('/settlements', (req, res) => {
  res.json({
    count: settlements.length,
    settlements: settlements.slice(-50).reverse() // Last 50, newest first
  });
});

// GET /settlement/:id - Get specific settlement
app.get('/settlement/:id', (req, res) => {
  const settlement = settlements.find(s => s.id === req.params.id);
  if (!settlement) {
    return res.status(404).json({ error: 'Settlement not found' });
  }
  res.json(settlement);
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 8619;

app.listen(PORT, () => {
  console.log(`USDC Compliance Agent running on http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health        - Agent status and stats`);
  console.log(`  POST /screen        - Screen an address`);
  console.log(`  POST /settle        - Execute compliant settlement`);
  console.log(`  GET  /settlements   - List settlement history`);
  console.log(`\nExample:`);
  console.log(`  curl -X POST http://localhost:${PORT}/settle \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"to":"0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91","amount":"0.1","reference":"INV-001"}'\n`);
});
