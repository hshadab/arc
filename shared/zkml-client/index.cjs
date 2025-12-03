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
    // New collision severity prover
    this.collisionProverBin = path.join(this.joltAtlasDir, 'target', 'release', 'examples', 'collision_severity_json');
  }

  isAvailable() {
    return fs.existsSync(this.proverBin);
  }

  isCollisionProverAvailable() {
    return fs.existsSync(this.collisionProverBin);
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
   * @param {number} decision - 0 (deny) or 1 (approve)
   * @param {number} confidence - Value between 0 and 1
   */
  async generateProofFromDecision(decision, confidence) {
    // Validate inputs
    if (decision !== 0 && decision !== 1) {
      throw new Error('decision must be 0 or 1');
    }
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new Error('confidence must be a number between 0 and 1');
    }

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

  /**
   * Generate a zkML proof for collision severity assessment
   * Uses sensor data from robot collision to prove severity classification
   * @param {Object} sensorData - Collision sensor data
   * @returns {Promise<Object>} Proof result with severity, price, timing, etc.
   */
  async generateCollisionSeverityProof(sensorData) {
    const {
      impact_force = 8,     // 0-15: accelerometer magnitude
      velocity = 4,         // 0-7: speed at impact
      angle = 0,            // 0-7: impact angle
      object_type = 0,      // 0-7: detected object type
      damage_zone = 0,      // 0-7: which part of robot hit
      robot_load = 1,       // 0-3: cargo value
      time_since_last = 5,  // 0-7: time since last collision
      weather = 0           // 0-3: weather conditions
    } = sensorData;

    const args = [
      String(Math.min(15, Math.max(0, Math.round(impact_force)))),
      String(Math.min(7, Math.max(0, Math.round(velocity)))),
      String(Math.min(7, Math.max(0, Math.round(angle)))),
      String(Math.min(7, Math.max(0, Math.round(object_type)))),
      String(Math.min(7, Math.max(0, Math.round(damage_zone)))),
      String(Math.min(3, Math.max(0, Math.round(robot_load)))),
      String(Math.min(7, Math.max(0, Math.round(time_since_last)))),
      String(Math.min(3, Math.max(0, Math.round(weather))))
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(this.collisionProverBin, args, { cwd: this.joltAtlasDir });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Collision severity proof generation failed: ${stderr}`));
          return;
        }

        try {
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
            jsonLine = lines[lines.length - 1].trim();
          }

          const result = JSON.parse(jsonLine);
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse collision severity proof output: ${err.message}\nOutput: ${stdout}`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to start collision severity prover: ${err.message}`));
      });
    });
  }

  /**
   * Generate collision severity proof from accelerometer data
   * Maps raw sensor readings to the model input format
   * @param {Object} accelerometer - { x, y, z } accelerometer values
   * @param {Object} context - Additional context (velocity, weather, etc.)
   */
  async generateCollisionProofFromSensor(accelerometer, context = {}) {
    // Calculate magnitude from accelerometer data
    const magnitude = Math.sqrt(
      Math.pow(accelerometer.x || 0, 2) +
      Math.pow(accelerometer.y || 0, 2) +
      Math.pow(accelerometer.z || 0, 2)
    );

    // Map magnitude (0-40+) to impact_force (0-15)
    const impact_force = Math.min(15, Math.round(magnitude / 2.5));

    // Estimate angle from x/y values (0=front, 2=right, 4=back, 6=left)
    const angleRad = Math.atan2(accelerometer.y || 0, accelerometer.x || 0);
    const angle = Math.round(((angleRad + Math.PI) / (2 * Math.PI)) * 8) % 8;

    const sensorData = {
      impact_force,
      velocity: context.velocity || 4,  // Default moderate speed
      angle,
      object_type: context.object_type || 0,  // Unknown by default
      damage_zone: context.damage_zone || 0,  // Front by default
      robot_load: context.robot_load || 1,    // Low-value cargo
      time_since_last: context.time_since_last || 7,  // Long time ago
      weather: context.weather || 0  // Clear weather
    };

    return this.generateCollisionSeverityProof(sensorData);
  }

  /**
   * Create a mock collision severity proof for testing
   */
  createMockCollisionProof(accelerometer, context = {}) {
    const magnitude = Math.sqrt(
      Math.pow(accelerometer.x || 0, 2) +
      Math.pow(accelerometer.y || 0, 2) +
      Math.pow(accelerometer.z || 0, 2)
    );

    // Determine severity based on magnitude
    let severity, severity_code, price;
    if (magnitude < 8) {
      severity = 'MINOR'; severity_code = 0; price = 0.00;
    } else if (magnitude < 15) {
      severity = 'MODERATE'; severity_code = 1; price = 0.02;
    } else if (magnitude < 25) {
      severity = 'SEVERE'; severity_code = 2; price = 0.05;
    } else {
      severity = 'CRITICAL'; severity_code = 3; price = 0.10;
    }

    return {
      success: true,
      severity,
      severity_code,
      confidence: 85 + Math.random() * 10,
      recommended_price_usd: price,
      proof_hash: crypto.randomBytes(16).toString('hex'),
      proof_size: 96,
      prove_time_ms: 0,
      verify_time_ms: 0,
      mock: true,
      sensor_data: {
        impact_force: Math.min(15, Math.round(magnitude / 2.5)),
        velocity: context.velocity || 4,
        angle: 0,
        object_type: context.object_type || 0,
        damage_zone: context.damage_zone || 0,
        robot_load: context.robot_load || 1,
        time_since_last: context.time_since_last || 7,
        weather: context.weather || 0
      }
    };
  }
}

module.exports = { ZkmlClient };
