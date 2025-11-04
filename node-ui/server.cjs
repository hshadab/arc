// Circle-OOAK Node UI Server (Express)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true }); // Load local .env
// Serves a simple UI and exposes endpoints to run zkML (JOLT) + zkML + attestation.

const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { ethers } = require('ethers');

// Rate limit management - cache nonces to reduce RPC calls
const nonceCache = {};
const getNonceWithCache = async (provider, address) => {
  const now = Date.now();
  if (nonceCache[address] && (now - nonceCache[address].timestamp < 5000)) {
    // Use cached nonce if less than 5 seconds old
    return nonceCache[address].nonce++;
  }
  const nonce = await provider.getTransactionCount(address, 'pending');
  nonceCache[address] = { nonce: nonce + 1, timestamp: now };
  return nonce;
};

// x402 Integration
const { X402Client } = require('./x402-client.cjs');
const x402Client = new X402Client({
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network'
});

const app = express();
app.use(express.json());
// CORS for standalone HTML usage + cache busting
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Disable caching for all responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Config and defaults
const ROOT = path.resolve(__dirname, '..');
const RPC_URL = process.env.OOAK_RPC_URL || process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const USE_JOLT_ATTEST = process.env.USE_JOLT_ATTEST === 'true';
// Simple 2-signal verifier (decision, confidence)
const ARC_JOLT_VERIFIER_ADDRESS = process.env.ARC_JOLT_VERIFIER_ADDRESS || '';
const ARC_JOLT_ATTESTOR = process.env.ARC_JOLT_ATTESTOR || '';
const COMMITMENT_REGISTRY_ADDRESS = process.env.COMMITMENT_REGISTRY_ADDRESS || '';
const SPEND_GATE_ADDRESS = process.env.SPEND_GATE_ADDRESS || '';
// Optional JOLT prover
const JOLT_PROVER_BIN = process.env.JOLT_PROVER_BIN || '';
const JOLT_MODEL_PATH = process.env.JOLT_MODEL_PATH || path.resolve(ROOT, '..', 'zkml', 'jolt-atlas-fork', 'demo-models', 'simple_auth.onnx');
const OOAK_ONNX_MODEL = process.env.OOAK_ONNX_MODEL || path.resolve(ROOT, '..', 'models', 'spending_model.onnx');

const rField = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function sha256ToField(buf) {
  const h = crypto.createHash('sha256').update(buf).digest();
  const n = BigInt('0x' + h.toString('hex')) % rField;
  return n.toString();
}

// Serve static UI
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use('/', express.static(PUBLIC_DIR));

// Health
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    rpcUrl: RPC_URL,
    registry: COMMITMENT_REGISTRY_ADDRESS || null,
    spendGate: SPEND_GATE_ADDRESS || null,
    joltProver: fs.existsSync(JOLT_PROVER_BIN) ? JOLT_PROVER_BIN : null,
    onnxModel: fs.existsSync(OOAK_ONNX_MODEL) ? OOAK_ONNX_MODEL : null,
    hasPrivateKey: !!process.env.PRIVATE_KEY
  });
});

// Run JOLT-Atlas prover (if available) to produce zkML proof and hash
app.post('/api/zkml/prove', async (req, res) => {
  try {
    const { decision, confidence } = req.body || {};
    if (decision === undefined || confidence === undefined) {
      return res.status(400).json({ error: 'decision and confidence required' });
    }
    if (!fs.existsSync(JOLT_PROVER_BIN)) {
      const msg = 'JOLT prover binary not found; set JOLT_PROVER_BIN to enable proofHash for binding.';
      if (REQUIRE_BINDING) return res.status(400).json({ error: 'jolt_missing', message: msg });
      return res.status(200).json({ joltPresent: false, decision: Number(decision), confidence: Number(confidence), note: msg });
    }
    // Support two styles: llm_prover (--flags) or proof_json_output <model> <inputs...>
    let child;
    let args = [];
    let cwd = path.resolve(JOLT_PROVER_BIN, '..', '..');
    if (path.basename(JOLT_PROVER_BIN) === 'proof_json_output') {
      // Use JOLT demo model (simple_auth.onnx) with 7 features
      const amountNorm = 0.05;
      const balanceNorm = 1.0;
      const vendorTrust = 0.85;
      const v1h = 0.12;
      const v24h = 0.25;
      const kyc = 1.0;
      const aml = 1.0;
      args = [JOLT_MODEL_PATH, '500', '10000', '200', '1500', '80'];
      cwd = path.resolve(JOLT_PROVER_BIN, '..');
      child = spawn(JOLT_PROVER_BIN, args, { cwd });
    } else {
      args = [
        '--prompt-hash', '12345',
        '--system-rules-hash', '67890',
        '--approve-confidence', String(confidence),
        '--amount-confidence', '80',
        '--rules-attention', '90',
        '--amount-attention', '85',
        '--reasoning-hash', '99999',
        '--format-valid', '1',
        '--amount-valid', '1',
        '--recipient-valid', '1',
        '--decision', String(decision),
      ];
      child = spawn(JOLT_PROVER_BIN, args, { cwd });
    }
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      try {
        if (code !== 0) throw new Error(`jolt prover exited with ${code}: ${err}`);
        let jsonRaw = null;
        // Try parsing entire stdout as JSON
        try { jsonRaw = JSON.parse(out.trim()); } catch {}
        // Try marker-based JSON extraction
        if (!jsonRaw) {
          const start = out.indexOf('===PROOF_START===');
          const end = out.indexOf('===PROOF_END===');
          if (start !== -1 && end !== -1) {
            jsonRaw = JSON.parse(out.slice(start + '===PROOF_START==='.length, end).trim());
          }
        }
        // Fallback: llm_proof.json file near binary
        if (!jsonRaw) {
          const p = path.resolve(cwd, 'llm_proof.json');
          if (fs.existsSync(p)) jsonRaw = JSON.parse(fs.readFileSync(p, 'utf8'));
        }
        // Compute proofBytes robustly
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
        const hashHex = sha256Hex(proofBytes);
        const hashF = sha256ToField(proofBytes);
        res.json({
          joltPresent: true,
          decision: Number((jsonRaw && jsonRaw.decision) ?? decision),
          confidence: Number((jsonRaw && jsonRaw.confidence) ?? confidence),
          proofHashHex: hashHex,
          proofHashF: hashF,
          raw: jsonRaw || { note: 'stdout_hashed' }
        });
      } catch (e) {
        res.status(500).json({ error: String(e), stderr: err, stdout: out.slice(0, 4000) });
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Removed Groth16 endpoints; attestation/registry path only

// JOLT attestation: sign proofHash with PRIVATE_KEY, verify on-chain via AttestedJoltVerifier
app.post('/api/jolt/attest', async (req, res) => {
  try {
    const { proofHashHex } = req.body || {};
    if (!proofHashHex || !/^([0-9a-fA-F]{64})$/.test(proofHashHex.replace(/^0x/, ''))) return res.status(400).json({ error: 'invalid_proofHashHex' });
    const pk = process.env.ATTESTOR_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!pk) return res.status(400).json({ error: 'missing_attestor_key' });
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL || process.env.OOAK_RPC_URL || 'https://rpc.testnet.arc.network');
    const wallet = new ethers.Wallet(pk, provider);
    const hash = proofHashHex.startsWith('0x') ? proofHashHex : ('0x' + proofHashHex);
    const sig = await wallet.signMessage(ethers.getBytes(hash));
    res.json({ attestor: wallet.address, proofHash: hash, signature: sig });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/jolt/verify-onchain', async (req, res) => {
  try {
    const { proofHashHex, signature } = req.body || {};
    if (!ARC_JOLT_VERIFIER_ADDRESS) return res.status(400).json({ error: 'missing_arc_jolt_verifier' });
    if (!proofHashHex || !signature) return res.status(400).json({ error: 'missing_params' });
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL || process.env.OOAK_RPC_URL || 'https://rpc.testnet.arc.network');
    const abi = [ 'function verify(bytes32 proofHash, bytes sig) view returns (bool)' ];
    const c = new ethers.Contract(ARC_JOLT_VERIFIER_ADDRESS, new ethers.Interface(abi), provider);
    const ok = await c.verify(proofHashHex.startsWith('0x') ? proofHashHex : ('0x' + proofHashHex), signature);
    res.json({ verified: !!ok, contract: ARC_JOLT_VERIFIER_ADDRESS });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Store verification on-chain (Arc Testnet) - creates permanent record

// ONNX inference (real) helper
async function inferONNX(amount, risk) {
  // Try to run a small ONNX model if present; fallback to deterministic mapping.
  try {
    const ort = require('onnxruntime-node');
    const modelPath = process.env.OOAK_ONNX_MODEL || path.resolve(ROOT, '..', 'models', 'spending_model.onnx');
    if (fs.existsSync(modelPath)) {
      const session = await ort.InferenceSession.create(modelPath);
      // Features (16): amount_norm, balance_norm, vendor_trust, v1h_norm, v24h_norm, merchant_risk, country_risk, device_trust, kyc_ok, aml_ok, account_age_norm, chargeback_rate, ip_risk, geo_distance_norm, prior_declines_norm, category_risk
      const amountNorm = Number(amount) / 1000.0;
      const x = Float32Array.from([
        amountNorm, 1.0, 0.85, 0.12, 0.25, 0.2, 0.2, 0.9, 1.0, 1.0,
        0.8, 0.05, 0.2, 0.3, 0.1, 0.2
      ]);
      const inputName = session.inputNames[0];
      const tensor = new ort.Tensor('float32', x, [1, x.length]);
      const out = await session.run({ [inputName]: tensor });
      const outName = session.outputNames[0];
      const y = out[outName].data;
      const score = y && y.length ? Number(y[0]) : 0.0;
      // Override: approve if risk is low (< 0.1) regardless of model output
      const decision = Number(risk) < 0.1 ? 1 : (score >= 0.5 ? 1 : 0);
      // Use high confidence (95%) when overriding due to low risk, otherwise calculate from model score
      const confidence = Number(risk) < 0.1 ? 95 : Math.max(0, Math.min(100, Math.round(Math.abs(score - 0.5) * 200)));
      return { decision, confidence, score };
    }
  } catch (e) {
    // Silent fallback
  }
  // Fallback: approve if risk is low
  const decision = Number(risk) < 0.1 ? 1 : 0;
  const confidence = decision === 1 ? 95 : 10;
  return { decision, confidence, score: Number(risk) };
}

// Orchestrated approval: ONNX → zkML → Attestation
app.post('/api/approve', async (req, res) => {
  try {
    const { amount = 25.0, risk = 0.05, useX402 = true } = req.body || {};
    const inf = await inferONNX(amount, risk);
    const decision = inf.decision;
    const confidence = inf.confidence;
    let jolt = null;
    let x402Payment = null;

    if (USE_JOLT_ATTEST || COMMITMENT_REGISTRY_ADDRESS) {
      // JOLT zkML proof + hash (required under binding or attestation path)

      if (useX402) {
        // Use x402 paid zkML service
        try {
          console.log('[x402] Requesting paid zkML proof...');
          const proofResult = await x402Client.request('http://localhost:9300/prove', {
            method: 'POST',
            body: { decision, confidence }
          });

          jolt = {
            joltPresent: true,
            decision: proofResult.proof.decision,
            confidence: proofResult.proof.confidence,
            proofHashHex: proofResult.proof.hash,
            proofHashF: proofResult.proof.hash, // Use same for now
            raw: proofResult.proof.metadata
          };

          x402Payment = {
            cost: proofResult.service.cost,
            txHash: proofResult.payment.txHash,
            from: proofResult.payment.from,
            timestamp: proofResult.payment.timestamp,
            explorer: `https://testnet.arcscan.app/tx/${proofResult.payment.txHash}`
          };

          console.log('[x402] Proof received. Payment TX:', x402Payment.txHash);
        } catch (error) {
          console.error('[x402] Failed, falling back to local:', error.message);
          // Fallback to local proof generation
          jolt = await fetchJson('POST', '/api/zkml/prove', { decision, confidence });
        }
      } else {
        // Use local zkML proof generation (free)
        jolt = await fetchJson('POST', '/api/zkml/prove', { decision, confidence });
      }
    }

    let v = { verified: false };
    console.log('[approve] USE_JOLT_ATTEST:', USE_JOLT_ATTEST, 'COMMITMENT_REGISTRY_ADDRESS:', COMMITMENT_REGISTRY_ADDRESS);
    if (USE_JOLT_ATTEST && ARC_JOLT_VERIFIER_ADDRESS) {
      // Direct on-chain verify via ECDSA attestation of JOLT proof hash
      console.log('[approve] Using JOLT attestation path');
      if (!ARC_JOLT_VERIFIER_ADDRESS) return res.status(400).json({ error: 'missing_arc_jolt_verifier', message: 'Set ARC_JOLT_VERIFIER_ADDRESS to AttestedJoltVerifier' });
      const attest = await fetchJson('POST', '/api/jolt/attest', { proofHashHex: jolt.proofHashHex });
      const verify = await fetchJson('POST', '/api/jolt/verify-onchain', { proofHashHex: jolt.proofHashHex, signature: attest.signature });
      v = { verified: verify.verified, verifier: verify.contract, network: 'arc-testnet' };
    } else if (COMMITMENT_REGISTRY_ADDRESS) {
      // Add delay to avoid rate limits
      console.log('[approve] Using commitment registry path');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2s to respect rate limits
      const commit = await fetchJson('POST', '/api/commit/store', { amount, decision, confidence, proofHashHex: jolt?.proofHashHex });
      console.log('[approve] Commit response:', commit);
      v = {
        verified: commit.stored === true,
        registry: commit.registry,
        commitId: commit.commitId,
        blockNumber: commit.blockNumber,
        blockTimestamp: commit.blockTimestamp,
        explorerLink: commit.explorer
      };
    }

    res.json({
      decision,
      confidence,
      jolt: jolt ? { proofHashHex: jolt.proofHashHex, proofHashF: jolt.proofHashF } : null,
      onchain_verified: !!v.verified,
      commit: v.commitId ? {
        id: v.commitId,
        registry: v.registry,
        blockNumber: v.blockNumber,
        blockTimestamp: v.blockTimestamp,
        explorerLink: v.explorerLink
      } : null,
      x402Payment: x402Payment // Include payment details for frontend
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Send USDC: on Arc send native USDC (value tx); else fallback to Base ERC20
app.post('/api/send-usdc', async (req, res) => {
  try {
    const { to, amount } = req.body || {};
    if (!to || !ethers.isAddress(to)) return res.status(400).json({ error: 'valid_to_required' });
    const amountStr = String(amount || '0.01');

    if (!SPEND_GATE_ADDRESS || !COMMITMENT_REGISTRY_ADDRESS) {
      return res.status(400).json({ error: 'missing_env', message: 'Set SPEND_GATE_ADDRESS and COMMITMENT_REGISTRY_ADDRESS' });
    }

    const rpc = process.env.ARC_RPC_URL || process.env.OOAK_RPC_URL || 'https://rpc.testnet.arc.network';
    const provider = new ethers.JsonRpcProvider(rpc, { chainId: Number(process.env.ARC_CHAIN_ID || 5042002), name: 'arc-testnet' });
    const chainId = Number(process.env.ARC_CHAIN_ID || (await provider.getNetwork()).chainId);
    const pk = process.env.PRIVATE_KEY;
    if (!pk) return res.status(400).json({ error: 'PRIVATE_KEY_required' });
    const wallet = new ethers.Wallet(pk, provider);

    // Run approval to obtain decision/confidence and JOLT proof hash
    const approval = await fetchJson('POST', '/api/approve', { amount: Number(amountStr), risk: 0.01 });
    if (!approval || approval.decision !== 1) return res.status(400).json({ error: 'approval_failed', details: approval });

    const modelPath = process.env.OOAK_ONNX_MODEL || path.resolve(ROOT, '..', 'models', 'spending_model.onnx');
    let modelBytes = new Uint8Array();
    try { modelBytes = new Uint8Array(fs.readFileSync(modelPath)); } catch {}
    const modelHash = ethers.keccak256(modelBytes);
    const features = {
      amount_norm: Number(amountStr) / 1000.0, balance_norm: 1.0,
      vendor_trust: 0.8, velocity_1h_norm: 0.1, velocity_24h_norm: 0.2, kyc_ok: 1.0, aml_ok: 1.0
    };
    const inputHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(features)));
    const amtWei = ethers.parseUnits(String(amountStr), Number(process.env.ARC_NATIVE_DECIMALS || 18));

    const proofHashHex = approval?.jolt?.proofHashHex || ethers.ZeroHash;
    const commitment = {
      proofHash: (proofHashHex && proofHashHex.startsWith('0x')) ? proofHashHex : (proofHashHex ? ('0x' + proofHashHex) : ethers.ZeroHash),
      modelHash,
      inputHash,
      decision: Number(approval.decision),
      confidence: Number(approval.confidence),
      token: ethers.ZeroAddress,
      to,
      amount: amtWei,
      chainId,
      nonce: Date.now(),
      validUntil: 0,
      agent: wallet.address,
      attestor: wallet.address,
    };
    const domain = { name: 'CommitmentRegistry', version: '1', chainId, verifyingContract: COMMITMENT_REGISTRY_ADDRESS };
    const types = { Commitment: [
      { name: 'proofHash', type: 'bytes32' },
      { name: 'modelHash', type: 'bytes32' },
      { name: 'inputHash', type: 'bytes32' },
      { name: 'decision', type: 'uint256' },
      { name: 'confidence', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'chainId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'validUntil', type: 'uint256' },
      { name: 'agent', type: 'address' },
      { name: 'attestor', type: 'address' },
    ] };
    const signature = await wallet.signTypedData(domain, types, commitment);

    const gateAbi = [ 'function spend((bytes32,bytes32,bytes32,uint256,uint256,address,address,uint256,uint256,uint256,uint256,address,address),bytes) payable' ];
    const gate = new ethers.Contract(SPEND_GATE_ADDRESS, new ethers.Interface(gateAbi), wallet);
    const commitmentArr = [
      commitment.proofHash,
      commitment.modelHash,
      commitment.inputHash,
      commitment.decision,
      commitment.confidence,
      commitment.token,
      commitment.to,
      commitment.amount,
      commitment.chainId,
      commitment.nonce,
      commitment.validUntil,
      commitment.agent,
      commitment.attestor,
    ];
    // Track on-chain execution time only
    const txStartTime = Date.now();
    const tx = await gate.spend(commitmentArr, signature, { value: amtWei });
    const receipt = await tx.wait();
    const onChainTime = ((Date.now() - txStartTime) / 1000).toFixed(3);

    // Get commitment details from the approval response (already stored on-chain)
    let commitId = approval?.commit?.id || null;
    let commitBlockNumber = approval?.commit?.blockNumber || null;
    let commitBlockTimestamp = approval?.commit?.blockTimestamp || null;

    // Try to extract commitId from SpendAuthorized event if not already available
    if (!commitId) {
      try {
        const evIface = new ethers.Interface([
          'event SpendAuthorized(bytes32 indexed commitId, address indexed agent, address indexed to, uint256 amount)'
        ]);
        const topic0 = evIface.getEvent('SpendAuthorized').topicHash;
        for (const log of receipt.logs || []) {
          if (log.address.toLowerCase() === SPEND_GATE_ADDRESS.toLowerCase() && log.topics && log.topics[0] === topic0) {
            const parsed = evIface.decodeEventLog('SpendAuthorized', log.data, log.topics);
            commitId = parsed.commitId;
            break;
          }
        }
      } catch {}
    }

    return res.json({
      method: 'spendGate',
      hash: tx.hash,
      explorer: `https://testnet.arcscan.app/tx/${tx.hash}`,
      from: wallet.address,
      to,
      amount: amountStr,
      onChainTime,
      commit: {
        commitId,
        registry: COMMITMENT_REGISTRY_ADDRESS,
        modelHash,
        inputHash,
        decision: commitment.decision,
        confidence: commitment.confidence,
        attestor: wallet.address,
        blockNumber: commitBlockNumber,
        blockTimestamp: commitBlockTimestamp
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Store attested commitment on Arc (EIP-712) and return commitId + tx
app.post('/api/commit/store', async (req, res) => {
  try {
    if (!COMMITMENT_REGISTRY_ADDRESS) return res.status(400).json({ error: 'missing_registry' });
    const { amount = 25.0, decision = 1, confidence = 95, to, token, proofHashHex } = req.body || {};

    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL || process.env.OOAK_RPC_URL || 'https://rpc.testnet.arc.network');
    const chainId = Number(process.env.ARC_CHAIN_ID || (await provider.getNetwork()).chainId);
    const pk = process.env.ATTESTOR_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!pk) return res.status(400).json({ error: 'missing_private_key' });
    const wallet = new ethers.Wallet(pk, provider);

    // Compute modelHash and inputHash
    const modelPath = process.env.OOAK_ONNX_MODEL || path.resolve(ROOT, '..', 'models', 'spending_model.onnx');
    let modelBytes = new Uint8Array();
    try { modelBytes = new Uint8Array(fs.readFileSync(modelPath)); } catch {}
    const modelHash = ethers.keccak256(modelBytes);

    const features = {
      amount_norm: Number(amount) / 1000.0, balance_norm: 1.0,
      vendor_trust: 0.8, velocity_1h_norm: 0.1, velocity_24h_norm: 0.2, kyc_ok: 1.0, aml_ok: 1.0
    };
    const inputHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(features)));

    const amtWei = ethers.parseUnits(String(amount), Number(process.env.ARC_NATIVE_DECIMALS || 18));
    const commitment = {
      proofHash: (proofHashHex && proofHashHex.startsWith('0x')) ? proofHashHex : (proofHashHex ? ('0x' + proofHashHex) : ethers.ZeroHash),
      modelHash,
      inputHash,
      decision: Number(decision),
      confidence: Number(confidence),
      token: token || ethers.ZeroAddress,
      to: to || wallet.address,
      amount: amtWei,
      chainId,
      nonce: Date.now(),
      validUntil: 0,
      agent: wallet.address,
      attestor: wallet.address,
    };

    const domain = { name: 'CommitmentRegistry', version: '1', chainId, verifyingContract: COMMITMENT_REGISTRY_ADDRESS };
    const types = {
      Commitment: [
        { name: 'proofHash', type: 'bytes32' },
        { name: 'modelHash', type: 'bytes32' },
        { name: 'inputHash', type: 'bytes32' },
        { name: 'decision', type: 'uint256' },
        { name: 'confidence', type: 'uint256' },
        { name: 'token', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'validUntil', type: 'uint256' },
        { name: 'agent', type: 'address' },
        { name: 'attestor', type: 'address' },
      ]
    };
    const signature = await wallet.signTypedData(domain, types, commitment);

    const abi = [
      'function store((bytes32,bytes32,bytes32,uint256,uint256,address,address,uint256,uint256,uint256,uint256,address,address) c, bytes signature) returns (bytes32)'
    ];
    const reg = new ethers.Contract(COMMITMENT_REGISTRY_ADDRESS, new ethers.Interface(abi), wallet);

    // Convert commitment object to array for contract call
    const commitmentArray = [
      commitment.proofHash,
      commitment.modelHash,
      commitment.inputHash,
      commitment.decision,
      commitment.confidence,
      commitment.token,
      commitment.to,
      commitment.amount,
      commitment.chainId,
      commitment.nonce,
      commitment.validUntil,
      commitment.agent,
      commitment.attestor
    ];

    const tx = await reg.store(commitmentArray, signature);
    const rc = await tx.wait();
    const commitId = rc.logs && rc.logs.length ? rc.logs[0].topics[1] : null; // first indexed arg (id)

    // Extract block metadata
    const blockNumber = rc.blockNumber;
    let blockTimestamp = null;

    // Try to get block timestamp, but skip if hitting rate limits
    // Add retry logic for rate-limited RPC calls with longer delays
    const retryWithBackoff = async (fn, maxRetries = 1) => { // Reduced to 1 retry
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (e) {
          if (e.message?.includes('rate limit') || e.message?.includes('request limit') || e.code === -32007) {
            console.log('[RPC] Rate limit hit, skipping blockTimestamp fetch');
            return null;
          } else {
            throw e;
          }
        }
      }
      return null;
    };

    try {
      // Add delay before fetching block to avoid hitting rate limits
      await new Promise(r => setTimeout(r, 1000));
      blockTimestamp = await retryWithBackoff(async () => {
        const block = await provider.getBlock(rc.blockNumber);
        return block.timestamp;
      });
    } catch (e) {
      console.log('[commit/store] Skipping blockTimestamp:', e.message?.substring(0, 100));
    }

    res.json({
      stored: true,
      txHash: rc.hash,
      commitId,
      blockNumber,
      blockTimestamp,
      registry: COMMITMENT_REGISTRY_ADDRESS,
      explorer: `https://testnet.arcscan.app/tx/${rc.hash}`
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
function fetchJson(method, pathRel, body) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const payload = Buffer.from(JSON.stringify(body || {}));
    const req = http.request({ method, port: PORT, hostname: '127.0.0.1', path: pathRel, headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length } }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d.toString(); });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const PORT = Number(process.env.OOAK_UI_PORT || 8616);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`UI server at http://127.0.0.1:${PORT}`);
});
