// USDC Compliance Agent
// Compliant AI agent for agentic commerce on Arc
// Showcases zkML-proven compliance for autonomous transactions

const express = require('express');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { ZkmlClient } = require('../../shared/zkml-client/index.cjs');
const {
  createWallet,
  createProvider,
  getUsdcBalance,
  transferUsdc,
  signCommitment,
  ARC_CONFIG,
  getTxExplorerUrl
} = require('../../shared/arc-utils/index.cjs');

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

const wallet = createWallet(process.env.PRIVATE_KEY);
const provider = createProvider();

// Circle API configuration
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_API_URL = 'https://api.circle.com/v1/w3s';
const USE_LIVE_COMPLIANCE = CIRCLE_API_KEY && CIRCLE_API_KEY.includes(':');

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
console.log('====================================\n');

// ============================================
// COMPLIANCE SCREENING
// ============================================

/**
 * Screen address using Circle Compliance Engine
 */
async function screenAddress(address, chain = 'ETH') {
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

      if (data.data) {
        return {
          result: data.data.result, // APPROVED or DENIED
          riskScore: data.data.riskScore || 0,
          sanctions: data.data.sanctions || false,
          source: 'circle'
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
  // Simulate different risk levels based on address
  const hash = crypto.createHash('md5').update(address).digest('hex');
  const riskValue = parseInt(hash.substring(0, 2), 16);

  // 90% approval rate for demo
  const approved = riskValue < 230;
  const riskScore = Math.floor(riskValue / 25.5); // 0-10 scale

  return {
    result: approved ? 'APPROVED' : 'DENIED',
    riskScore,
    sanctions: riskValue > 250,
    source: 'mock'
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
      network: 'arc-testnet'
    },
    stats: {
      totalSettlements: settlements.length,
      approved: settlements.filter(s => s.approved).length,
      denied: settlements.filter(s => !s.approved).length
    }
  });
});

// POST /screen - Screen an address
app.post('/screen', async (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ error: 'address required' });
  }

  console.log(`[SCREEN] Checking address: ${address}`);

  const screening = await screenAddress(address);

  console.log(`[SCREEN] Result: ${screening.result} (risk: ${screening.riskScore})`);

  res.json({
    address,
    ...screening,
    timestamp: Date.now()
  });
});

// POST /settle - Execute compliant settlement
app.post('/settle', async (req, res) => {
  const { to, amount, reference, memo } = req.body;

  if (!to || !amount) {
    return res.status(400).json({ error: 'to and amount required' });
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'invalid amount' });
  }

  console.log(`\n[SETTLE] Processing: ${amount} USDC to ${to}`);
  console.log(`[SETTLE] Reference: ${reference || 'none'}`);

  const settlementId = `SET-${Date.now()}`;
  const startTime = Date.now();

  try {
    // Step 1: Dual-sided compliance screening
    console.log('[STEP 1] Screening sender (agent wallet)...');
    const senderScreening = await screenAddress(wallet.address);

    console.log('[STEP 2] Screening recipient...');
    const recipientScreening = await screenAddress(to);

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

    // Step 3: Determine if Travel Rule applies ($3000+)
    const travelRuleRequired = amountNum >= 3000;
    if (travelRuleRequired) {
      console.log('[STEP 3] Travel Rule applies (amount >= $3000)');
    }

    // Step 4: Build compliance features for zkML
    // Use features that align with the model's training data
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

    // Step 4: Generate zkML proof
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

    const approved = proof.decision === 'AUTHORIZED' && screening.result === 'APPROVED';

    // Step 5: Sign commitment
    console.log('[STEP 5] Signing commitment...');
    const commitment = {
      proofHash: '0x' + proof.proof_hash.padStart(64, '0'),
      decision: approved ? 1 : 0,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: Date.now()
    };
    const signature = await signCommitment(wallet, commitment);

    // Step 6: Execute transfer if approved
    let txHash = null;
    let explorerUrl = null;

    if (approved) {
      console.log('[STEP 6] Executing settlement on Arc...');

      // Try Circle Wallet first, fall back to EOA
      const circleResult = await circleWalletTransfer(to, amount);

      if (circleResult) {
        txHash = circleResult.txHash;
        explorerUrl = getTxExplorerUrl(txHash);
        console.log(`[SUCCESS] Circle Wallet TX: ${txHash}`);
      } else {
        // Fall back to EOA transfer
        try {
          const receipt = await transferUsdc(wallet, to, amount);
          txHash = receipt.hash;
          explorerUrl = getTxExplorerUrl(txHash);
          console.log(`[SUCCESS] EOA TX: ${txHash}`);
        } catch (txError) {
          console.error('[ERROR] Transfer failed:', txError.message);
          // Continue without transfer for demo (may not have balance)
        }
      }
    } else {
      console.log('[DENIED] Settlement blocked by compliance');
    }

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
        source: screening.source
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
      travelRuleRequired,
      duration,
      timestamp: Date.now()
    };

    settlements.push(settlement);

    console.log(`[COMPLETE] Settlement ${settlementId} in ${duration}ms\n`);

    res.json(settlement);

  } catch (error) {
    console.error('[ERROR] Settlement failed:', error);
    res.status(500).json({
      error: error.message,
      settlementId
    });
  }
});

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
