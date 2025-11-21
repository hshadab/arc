// Shared zkML Client for jolt-atlas
// Used by all demos to generate and verify proofs

const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class ZkmlClient {
  constructor(options = {}) {
    this.joltAtlasDir = options.joltAtlasDir || path.resolve(__dirname, '..', '..', 'jolt-atlas');
    this.proverBin = options.proverBin || path.join(this.joltAtlasDir, 'target', 'release', 'examples', 'authorization_json');
  }

  isAvailable() {
    return fs.existsSync(this.proverBin);
  }

  /**
   * Generate a zkML proof for transaction authorization
   * @param {Object} features - Transaction features
   * @returns {Promise<Object>} Proof result with hash, timing, etc.
   */
  async generateProof(features) {
    const {
      budget = 10,
      trust = 5,
      amount = 5,
      category = 0,
      velocity = 2,
      day = 1,
      time = 1,
      risk = 0
    } = features;

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

    return new Promise((resolve, reject) => {
      const child = spawn(this.proverBin, args, { cwd: this.joltAtlasDir });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Proof generation failed: ${stderr}`));
          return;
        }

        try {
          // Find the JSON line in output (binary outputs status lines like "k: 0" mixed with JSON)
          const lines = stdout.trim().split('\n');
          let jsonLine = null;

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{') && trimmed.includes('"success"')) {
              jsonLine = trimmed;
              break;
            }
          }

          if (!jsonLine) {
            // Try parsing the last line as fallback
            jsonLine = lines[lines.length - 1].trim();
          }

          const result = JSON.parse(jsonLine);
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse proof output: ${err.message}\nOutput: ${stdout}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to start prover: ${err.message}`));
      });
    });
  }

  /**
   * Generate proof from decision/confidence (simplified API)
   */
  async generateProofFromDecision(decision, confidence) {
    // Map decision/confidence to transaction features
    const features = {
      budget: decision === 1 ? 15 : 5,
      trust: Math.round(confidence * 7),
      amount: decision === 1 ? 5 : 12,
      category: 0,
      velocity: 2,
      day: 1,
      time: 1,
      risk: 0
    };

    return this.generateProof(features);
  }

  /**
   * Create a mock proof for testing
   */
  createMockProof(decision, confidence) {
    return {
      success: true,
      decision: decision === 1 ? 'AUTHORIZED' : 'DENIED',
      confidence: confidence * 100,
      proof_hash: crypto.randomBytes(16).toString('hex'),
      proof_size: 96,
      prove_time_ms: 0,
      verify_time_ms: 0,
      mock: true,
      input_features: {
        budget: decision === 1 ? 15 : 5,
        trust: Math.round(confidence * 7),
        amount: decision === 1 ? 5 : 12,
        category: 0,
        velocity: 2,
        day: 1,
        time: 1,
        risk: 0
      }
    };
  }
}

module.exports = { ZkmlClient };
