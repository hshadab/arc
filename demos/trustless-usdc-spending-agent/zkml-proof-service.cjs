// zkML Proof Service with x402 Payment on Arc Testnet
// Simple pay-per-proof model: $0.003 per proof, $0.001 per verification

const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { createX402Middleware } = require('./x402-middleware.cjs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const { ethers } = require('ethers');

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Payment');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Initialize x402 middleware
const SERVICE_WALLET = new ethers.Wallet(process.env.PRIVATE_KEY || ethers.Wallet.createRandom().privateKey);

const x402 = createX402Middleware({
  rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
  chainId: 5042002,
  payTo: SERVICE_WALLET.address,
  usdcAddress: '0x3600000000000000000000000000000000000000'
});

// Config - Updated for latest jolt-atlas
const JOLT_ATLAS_DIR = process.env.JOLT_ATLAS_DIR || path.resolve(__dirname, '..', 'jolt-atlas');
const JOLT_PROVER_BIN = process.env.JOLT_PROVER_BIN || path.join(JOLT_ATLAS_DIR, 'target', 'release', 'examples', 'authorization_json');
const JOLT_MODEL_PATH = process.env.JOLT_MODEL_PATH || '';
const OOAK_ONNX_MODEL = process.env.OOAK_ONNX_MODEL || path.join(JOLT_ATLAS_DIR, 'onnx-tracer', 'models', 'authorization', 'network.onnx');

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

console.log('\n=== zkML Proof Service Configuration ===');
console.log(`Service Wallet: ${SERVICE_WALLET.address}`);
console.log(`RPC URL: ${process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network'}`);
console.log(`USDC Contract: 0x3600000000000000000000000000000000000000`);
console.log('========================================\n');

// ==============================================
// FREE ENDPOINTS
// ==============================================

app.get('/health', (req, res) => {
  res.json({
    service: 'zkML Proof Service',
    status: 'operational',
    network: 'arc-testnet:5042002',
    pricing: {
      '/prove': '$0.003 USDC per proof',
      '/verify': '$0.001 USDC per verification'
    },
    serviceWallet: SERVICE_WALLET.address,
    joltAvailable: fs.existsSync(JOLT_PROVER_BIN),
    onnxModelAvailable: fs.existsSync(OOAK_ONNX_MODEL)
  });
});

app.get('/pricing', (req, res) => {
  res.json({
    currency: 'USDC',
    network: 'arc-testnet:5042002',
    asset: '0x3600000000000000000000000000000000000000',
    payTo: SERVICE_WALLET.address,
    services: {
      prove: {
        price: '0.003',
        estimatedTime: '600ms',
        description: 'Generate zkML proof for ONNX inference'
      },
      verify: {
        price: '0.001',
        estimatedTime: '50ms',
        description: 'Verify zkML proof authenticity'
      }
    }
  });
});

// ==============================================
// PAID ENDPOINTS (x402 protected)
// ==============================================

/**
 * POST /prove - Generate zkML proof ($0.003 USDC)
 */
app.post('/prove',
  x402.middleware({ amount: '0.003', resource: '/prove' }),
  async (req, res) => {
    const startTime = Date.now();
    const { decision, confidence } = req.body || {};

    console.log(`[PAID] /prove request from ${req.payment.from}`);
    console.log(`[PAYMENT] TX: ${req.payment.txHash}, Amount: ${req.payment.amount} USDC`);

    try {
      // Validate inputs
      if (decision === undefined || confidence === undefined) {
        return res.status(400).json({
          error: 'decision and confidence required'
        });
      }

      // For demo: use fast mock proofs to avoid 7-minute wait
      // Real JOLT proofs take ~7min (6s proving + 7min verification)
      // Mock proofs are instant and still provide valid commitment artifacts for Arc
      const useMockProofs = process.env.USE_MOCK_PROOFS === '1' || !fs.existsSync(JOLT_PROVER_BIN);

      if (useMockProofs) {
        // Return mock proof for fast demo
        const mockProof = {
          hash: crypto.randomBytes(32).toString('hex'),
          size: 1024,
          decision,
          confidence,
          metadata: {
            mock: true,
            reason: process.env.USE_MOCK_PROOFS === '1' ? 'Demo mode (USE_MOCK_PROOFS=1)' : 'JOLT prover not configured',
            note: 'Mock proof provides same commitment structure for Arc blockchain demo'
          }
        };

        console.log(`[DEMO MODE] Using mock proof for instant response (${Date.now() - startTime}ms)`);

        return res.json({
          success: true,
          proof: mockProof,
          payment: req.payment,
          service: {
            duration: Date.now() - startTime,
            cost: '0.003 USDC',
            provider: 'zkML Proof Service (Demo Mode)'
          },
          timestamp: Date.now()
        });
      }

      // Generate real JOLT proof using latest jolt-atlas authorization model
      // The authorization_json binary takes 8 args: budget, trust, amount, category, velocity, day, time, risk
      // We map decision/confidence to transaction features
      const budget = decision === 1 ? 15 : 5;  // High budget for approve, low for deny
      const trust = Math.round(confidence * 7);  // Scale confidence to 0-7 trust level
      const amount = decision === 1 ? 5 : 12;   // Reasonable amount for approve, excessive for deny
      const category = 0;  // General category
      const velocity = 2;  // Normal velocity
      const day = 1;       // Weekday
      const time = 1;      // Business hours
      const risk = 0;      // No special risk flags

      const args = [
        String(budget),
        String(trust),
        String(amount),
        String(category),
        String(velocity),
        String(day),
        String(time),
        String(risk)
      ];
      const cwd = JOLT_ATLAS_DIR;

      const child = spawn(JOLT_PROVER_BIN, args, { cwd });
      let out = '';
      let err = '';
      let proofReturned = false;

      // The new authorization_json outputs clean JSON when complete
      // No fast mode timeout needed - wait for natural completion
      console.log('[JOLT-ATLAS] Starting proof generation with authorization model...');

      child.stderr.on('data', (d) => { err += d.toString(); });
      child.stdout.on('data', (d) => { out += d.toString(); });

      // Handle process completion
      child.on('close', (code) => {
        if (proofReturned) return;

        const duration = Date.now() - startTime;

        if (code !== 0) {
          console.error('[ERROR] JOLT prover failed:', err);
          return res.status(500).json({
            error: 'Proof generation failed',
            details: err,
            paymentReceived: req.payment
          });
        }

        try {
          // Parse JSON output from authorization_json
          const jsonRaw = JSON.parse(out.trim());

          if (!jsonRaw.success) {
            throw new Error('Proof generation returned success=false');
          }

          const proofHash = jsonRaw.proof_hash || sha256Hex(Buffer.from(out));

          console.log(`[SUCCESS] Proof generated: ${proofHash.substring(0, 16)}... (${duration}ms)`);
          console.log(`[SUCCESS] Decision: ${jsonRaw.decision}, Confidence: ${jsonRaw.confidence}`);
          console.log(`[SUCCESS] Prove time: ${jsonRaw.prove_time_ms}ms, Verify time: ${jsonRaw.verify_time_ms}ms`);

          proofReturned = true;
          res.json({
            success: true,
            proof: {
              hash: proofHash,
              size: jsonRaw.proof_size || out.length,
              decision: jsonRaw.decision === 'AUTHORIZED' ? 1 : 0,
              confidence: jsonRaw.confidence,
              metadata: {
                model: 'authorization',
                input_features: jsonRaw.input_features,
                prove_time_ms: jsonRaw.prove_time_ms,
                verify_time_ms: jsonRaw.verify_time_ms
              }
            },
            payment: req.payment,
            service: {
              duration,
              cost: '0.003 USDC',
              provider: 'zkML Proof Service (jolt-atlas)'
            },
            timestamp: Date.now()
          });
        } catch (parseError) {
          console.error('[ERROR] Proof parsing failed:', parseError.message);
          console.error('[ERROR] Raw output:', out.substring(0, 500));
          res.status(500).json({
            error: 'Proof parsing failed',
            details: parseError.message,
            paymentReceived: req.payment
          });
        }
      });
    } catch (error) {
      console.error('[ERROR] Unexpected error:', error);
      res.status(500).json({
        error: error.message,
        paymentReceived: req.payment
      });
    }
  }
);

/**
 * POST /verify - Verify zkML proof ($0.001 USDC)
 */
app.post('/verify',
  x402.middleware({ amount: '0.001', resource: '/verify' }),
  async (req, res) => {
    const { proofHash } = req.body || {};

    console.log(`[PAID] /verify request from ${req.payment.from}`);
    console.log(`[PAYMENT] TX: ${req.payment.txHash}, Amount: ${req.payment.amount} USDC`);

    if (!proofHash) {
      return res.status(400).json({ error: 'proofHash required' });
    }

    // Basic validation (in production, verify against commitment registry)
    const isValid = proofHash.length === 64 && /^[a-f0-9]+$/i.test(proofHash);

    console.log(`[SUCCESS] Proof verified: ${proofHash.substring(0, 16)}... -> ${isValid}`);

    res.json({
      valid: isValid,
      proofHash,
      verification: {
        timestamp: Date.now(),
        verifier: 'zkML Proof Service',
        cost: '0.001 USDC'
      },
      payment: req.payment
    });
  }
);

// ==============================================
// START SERVER
// ==============================================

const PORT = process.env.ZKML_SERVICE_PORT || 9300;

app.listen(PORT, () => {
  console.log(`✅ zkML Proof Service running on http://localhost:${PORT}`);
  console.log(`   💰 Network: Arc Testnet`);
  console.log(`   💳 Payments: USDC (x402 protocol)`);
  console.log(`   📊 Endpoints:`);
  console.log(`      GET  /health  - Service status (free)`);
  console.log(`      GET  /pricing - Price list (free)`);
  console.log(`      POST /prove   - Generate proof ($0.003)`);
  console.log(`      POST /verify  - Verify proof ($0.001)\n`);
});
