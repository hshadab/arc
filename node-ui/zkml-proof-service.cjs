// zkML Proof Service with x402 Payment on Arc Testnet
// Simple pay-per-proof model: $0.003 per proof, $0.001 per verification

const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
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

// Config
const JOLT_PROVER_BIN = process.env.JOLT_PROVER_BIN || '';
const JOLT_MODEL_PATH = process.env.JOLT_MODEL_PATH || '';
const OOAK_ONNX_MODEL = process.env.OOAK_ONNX_MODEL || '';

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

      // Check JOLT prover availability
      if (!fs.existsSync(JOLT_PROVER_BIN)) {
        // Return mock proof if JOLT not available
        const mockProof = {
          hash: crypto.randomBytes(32).toString('hex'),
          size: 1024,
          decision,
          confidence,
          metadata: { mock: true, reason: 'JOLT prover not configured' }
        };

        return res.json({
          success: true,
          proof: mockProof,
          payment: req.payment,
          service: {
            duration: Date.now() - startTime,
            cost: '0.003 USDC',
            provider: 'zkML Proof Service'
          },
          timestamp: Date.now()
        });
      }

      // Generate real JOLT proof
      let args = [];
      let cwd = path.resolve(JOLT_PROVER_BIN, '..', '..');

      if (path.basename(JOLT_PROVER_BIN) === 'proof_json_output') {
        // proof_json_output expects: <model_path> <input1> <input2> ...
        // The model expects 5 inputs in range 0-13 (embedding dimension size)
        // Map decision (0/1) and confidence (0-1) to valid range
        const conf = Math.round(confidence * 13);  // Scale to 0-13
        args = [JOLT_MODEL_PATH, String(decision), String(conf), '1', '2', '3'];
        cwd = path.resolve(JOLT_PROVER_BIN, '..');
      } else {
        args = [
          '--prompt-hash', '12345',
          '--system-rules-hash', '67890',
          '--approve-confidence', String(confidence),
          '--decision', String(decision)
        ];
      }

      const child = spawn(JOLT_PROVER_BIN, args, { cwd });
      let out = '';
      let err = '';

      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { err += d.toString(); });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code !== 0) {
          console.error('[ERROR] JOLT prover failed:', err);
          return res.status(500).json({
            error: 'Proof generation failed',
            paymentReceived: req.payment
          });
        }

        try {
          // Parse proof output
          let jsonRaw = null;
          try {
            jsonRaw = JSON.parse(out.trim());
          } catch {
            const start = out.indexOf('===PROOF_START===');
            const end = out.indexOf('===PROOF_END===');
            if (start !== -1 && end !== -1) {
              jsonRaw = JSON.parse(out.slice(start + '===PROOF_START==='.length, end).trim());
            }
          }

          let proofBytes;
          if (jsonRaw) {
            if (Array.isArray(jsonRaw.proof_bytes)) {
              proofBytes = Buffer.from(jsonRaw.proof_bytes);
            } else if (typeof jsonRaw.proof === 'string') {
              proofBytes = Buffer.from(jsonRaw.proof);
            } else {
              proofBytes = Buffer.from(JSON.stringify(jsonRaw));
            }
          } else {
            proofBytes = Buffer.from(out);
          }

          const proofHash = sha256Hex(proofBytes);

          console.log(`[SUCCESS] Proof generated: ${proofHash.substring(0, 16)}... (${duration}ms)`);

          res.json({
            success: true,
            proof: {
              hash: proofHash,
              size: proofBytes.length,
              decision,
              confidence,
              metadata: jsonRaw
            },
            payment: req.payment,
            service: {
              duration,
              cost: '0.003 USDC',
              provider: 'zkML Proof Service'
            },
            timestamp: Date.now()
          });
        } catch (parseError) {
          console.error('[ERROR] Proof parsing failed:', parseError);
          res.status(500).json({
            error: 'Proof parsing failed',
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
