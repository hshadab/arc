// Programmable Wallets Demo Server
// zkML-authorized agent for Circle Wallets

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

// In-memory wallet store (demo only)
const wallets = new Map();

console.log('\n=== Programmable Wallets Demo ===');
console.log(`Controller: ${wallet.address}`);
console.log(`zkML Available: ${zkml.isAvailable()}`);
console.log('==================================\n');

// Health check
app.get('/health', async (req, res) => {
  const balance = await getUsdcBalance(wallet.address);
  res.json({
    service: 'Programmable Wallets Demo',
    status: 'operational',
    controller: wallet.address,
    balance: `${balance} USDC`,
    zkmlAvailable: zkml.isAvailable(),
    walletsManaged: wallets.size,
    network: 'arc-testnet'
  });
});

// POST /wallet/authorize - Get zkML authorization for operation
app.post('/wallet/authorize', async (req, res) => {
  const { walletId, operation, amount, to } = req.body;

  if (!operation) {
    return res.status(400).json({
      error: 'Missing required field: operation'
    });
  }

  console.log(`[AUTHORIZE] ${operation} for wallet ${walletId || 'new'}`);

  try {
    // Map operation to authorization features
    const operationTypes = { create: 0, transfer: 1, sign: 2 };
    const features = {
      budget: 15,                                    // Controller's budget
      trust: 7,                                      // Wallet trust level
      amount: Math.min(parseInt(amount) || 0, 15),   // Operation amount
      category: operationTypes[operation] || 0,      // Operation type
      velocity: 2,                                   // Recent operations
      day: new Date().getDay(),
      time: Math.floor(new Date().getHours() / 6),
      risk: 0
    };

    let proof;
    if (zkml.isAvailable()) {
      proof = await zkml.generateProof(features);
    } else {
      proof = zkml.createMockProof(1, 0.9);
      proof.mock = true;
    }

    const authorized = proof.decision === 'AUTHORIZED';

    // Sign commitment
    const commitment = {
      proofHash: '0x' + proof.proof_hash.padStart(64, '0'),
      decision: authorized ? 1 : 0,
      timestamp: Math.floor(Date.now() / 1000),
      nonce: Date.now()
    };

    const signature = await signCommitment(wallet, commitment);

    console.log(`[AUTHORIZE] Result: ${proof.decision} (${proof.confidence})`);

    res.json({
      authorized,
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
    console.error('[ERROR] Authorization failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /wallet/create - Create a new programmable wallet
app.post('/wallet/create', async (req, res) => {
  const { name, description } = req.body;

  console.log(`[CREATE] Creating wallet: ${name}`);

  try {
    // First get authorization
    const authResponse = await fetch(`http://localhost:${PORT}/wallet/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'create' })
    });
    const auth = await authResponse.json();

    if (!auth.authorized) {
      return res.status(403).json({
        error: 'Wallet creation not authorized',
        proof: auth
      });
    }

    // TODO: Call Circle Wallets API to create wallet
    // This would use the Circle API to create an actual programmable wallet
    // See: https://developers.circle.com/wallets

    // Demo: create local wallet representation
    const walletId = `wallet-${Date.now()}`;
    const newWallet = {
      id: walletId,
      name: name || 'Unnamed Wallet',
      description: description || '',
      address: '0x' + require('crypto').randomBytes(20).toString('hex'),
      createdAt: new Date().toISOString(),
      authorizationProof: auth.proofHash
    };

    wallets.set(walletId, newWallet);

    console.log(`[CREATE] Wallet created: ${walletId}`);

    res.json({
      success: true,
      wallet: newWallet,
      authorization: auth,
      note: 'Demo wallet created. Add CIRCLE_API_KEY to create real Circle wallet.'
    });
  } catch (error) {
    console.error('[ERROR] Wallet creation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /wallet/transfer - Execute authorized transfer
app.post('/wallet/transfer', async (req, res) => {
  const { walletId, to, amount, token } = req.body;

  if (!walletId || !to || !amount) {
    return res.status(400).json({
      error: 'Missing required fields: walletId, to, amount'
    });
  }

  console.log(`[TRANSFER] ${amount} ${token || 'USDC'} from ${walletId} to ${to}`);

  try {
    // Get authorization
    const authResponse = await fetch(`http://localhost:${PORT}/wallet/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, operation: 'transfer', amount, to })
    });
    const auth = await authResponse.json();

    if (!auth.authorized) {
      return res.status(403).json({
        error: 'Transfer not authorized',
        proof: auth
      });
    }

    // TODO: Call Circle Wallets API to execute transfer
    // See: https://developers.circle.com/wallets

    console.log(`[TRANSFER] Authorized with proof: ${auth.proofHash}`);

    res.json({
      status: 'pending',
      message: 'Circle Wallets integration pending',
      transfer: {
        walletId,
        to,
        amount,
        token: token || 'USDC'
      },
      authorization: auth,
      note: 'Add CIRCLE_API_KEY and ENTITY_SECRET to execute real transfers',
      walletsDocs: 'https://developers.circle.com/wallets'
    });
  } catch (error) {
    console.error('[ERROR] Transfer failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /wallets - List managed wallets
app.get('/wallets', (req, res) => {
  res.json({
    count: wallets.size,
    wallets: Array.from(wallets.values())
  });
});

// Start server
const PORT = process.env.PORT || 8618;
app.listen(PORT, () => {
  console.log(`Programmable Wallets Demo running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /health           - Service status`);
  console.log(`  GET  /wallets          - List managed wallets`);
  console.log(`  POST /wallet/authorize - Get zkML authorization`);
  console.log(`  POST /wallet/create    - Create new wallet`);
  console.log(`  POST /wallet/transfer  - Execute transfer\n`);
});
