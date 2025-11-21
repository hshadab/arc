// Gateway Compliance Demo Server
// zkML-powered compliance agent for Circle Gateway

const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { ZkmlClient } = require('../../shared/zkml-client/index.cjs');
const { createWallet, getUsdcBalance, signCommitment, ARC_CONFIG } = require('../../shared/arc-utils/index.cjs');

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

console.log('\n=== Gateway Compliance Demo ===');
console.log(`Wallet: ${wallet.address}`);
console.log(`zkML Available: ${zkml.isAvailable()}`);
console.log('================================\n');

// Health check
app.get('/health', async (req, res) => {
  const balance = await getUsdcBalance(wallet.address);
  res.json({
    service: 'Gateway Compliance Demo',
    status: 'operational',
    wallet: wallet.address,
    balance: `${balance} USDC`,
    zkmlAvailable: zkml.isAvailable(),
    network: 'arc-testnet'
  });
});

// POST /compliance/check - Check compliance for a transfer
app.post('/compliance/check', async (req, res) => {
  const { from, to, amount, destinationChain } = req.body;

  if (!from || !to || !amount || !destinationChain) {
    return res.status(400).json({
      error: 'Missing required fields: from, to, amount, destinationChain'
    });
  }

  console.log(`[COMPLIANCE] Checking: ${from} -> ${to}, ${amount} USDC to ${destinationChain}`);

  try {
    // Evaluate compliance using zkML model
    // Map transfer details to compliance features
    const features = {
      budget: 15,                              // Sender's remaining limit
      trust: 7,                                // Recipient trust score (0-7)
      amount: Math.min(parseInt(amount), 15),  // Transaction amount (capped)
      category: destinationChain === 'ethereum' ? 0 : 1, // Chain category
      velocity: 2,                             // Recent transfer frequency
      day: new Date().getDay(),                // Day of week
      time: Math.floor(new Date().getHours() / 6), // Time bucket (0-3)
      risk: 0                                  // Risk flags
    };

    let proof;
    if (zkml.isAvailable()) {
      proof = await zkml.generateProof(features);
    } else {
      // Use mock proof for testing
      proof = zkml.createMockProof(1, 0.85);
      proof.mock = true;
    }

    const approved = proof.decision === 'AUTHORIZED';

    // Sign commitment
    const commitment = {
      proofHash: '0x' + proof.proof_hash.padStart(64, '0'),
      decision: approved ? 1 : 0,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: Date.now()
    };

    const signature = await signCommitment(wallet, commitment);

    console.log(`[COMPLIANCE] Result: ${proof.decision} (${proof.confidence})`);
    console.log(`[COMPLIANCE] Proof hash: ${proof.proof_hash}`);

    res.json({
      approved,
      decision: proof.decision,
      confidence: proof.confidence,
      proofHash: proof.proof_hash,
      signature,
      commitment,
      timing: {
        proveMs: proof.prove_time_ms,
        verifyMs: proof.verify_time_ms
      },
      mock: proof.mock || false
    });
  } catch (error) {
    console.error('[ERROR] Compliance check failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /transfer/execute - Execute compliant transfer via Gateway
app.post('/transfer/execute', async (req, res) => {
  const { complianceProofHash, from, to, amount, destinationChain } = req.body;

  if (!complianceProofHash) {
    return res.status(400).json({
      error: 'Missing compliance proof hash. Run /compliance/check first.'
    });
  }

  console.log(`[TRANSFER] Executing: ${amount} USDC to ${destinationChain}`);
  console.log(`[TRANSFER] Compliance proof: ${complianceProofHash}`);

  // TODO: Integrate with Circle Gateway API
  // This would call the Gateway API to execute the cross-chain transfer
  // See: https://developers.circle.com/gateway

  res.json({
    status: 'pending',
    message: 'Circle Gateway integration pending',
    note: 'Add CIRCLE_API_KEY to .env and implement Gateway API calls',
    transfer: {
      from,
      to,
      amount,
      destinationChain,
      complianceProofHash
    },
    gatewayDocs: 'https://developers.circle.com/gateway'
  });
});

// Start server
const PORT = process.env.PORT || 8617;
app.listen(PORT, () => {
  console.log(`Gateway Compliance Demo running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /health           - Service status`);
  console.log(`  POST /compliance/check - Check transfer compliance`);
  console.log(`  POST /transfer/execute - Execute compliant transfer\n`);
});
