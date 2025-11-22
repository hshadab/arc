// x402 Payment Middleware for Arc Blockchain
// Implements HTTP 402 Payment Required protocol for micro-payments

const { ethers } = require('ethers');
const crypto = require('crypto');

/**
 * x402 Middleware for Express
 * Usage: app.use('/paid-endpoint', x402Middleware({ amount: '0.001', asset: 'USDC' }))
 */
class X402Middleware {
  constructor(config) {
    this.config = {
      rpcUrl: config.rpcUrl || process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
      chainId: config.chainId || 5042002,
      payTo: config.payTo || process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY).address : null,
      usdcAddress: config.usdcAddress || '0x3600000000000000000000000000000000000000', // Arc native USDC
      facilitatorUrl: config.facilitatorUrl || null, // Optional x402 facilitator
      ...config
    };

    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    this.erc20Abi = [
      'function balanceOf(address) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)'
    ];
  }

  /**
   * Create payment requirement response (402)
   */
  createPaymentRequired(req, amount, resource) {
    const paymentRequirement = {
      x402Version: 1,
      accepts: [{
        scheme: 'exact', // Exact payment amount required
        network: `arc-testnet:${this.config.chainId}`,
        maxAmountRequired: ethers.parseUnits(amount, 6).toString(), // USDC has 6 decimals
        resource: resource || req.path,
        payTo: this.config.payTo,
        asset: this.config.usdcAddress, // USDC contract
        description: `Payment for ${resource || req.path}`,
        metadata: {
          timestamp: Date.now(),
          requestId: crypto.randomBytes(16).toString('hex')
        }
      }],
      error: 'Payment required to access this resource'
    };

    return paymentRequirement;
  }

  /**
   * Parse X-PAYMENT header
   */
  parsePaymentHeader(header) {
    try {
      const decoded = Buffer.from(header, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (e) {
      throw new Error('Invalid X-PAYMENT header format');
    }
  }

  /**
   * Verify payment authenticity (on-chain or via facilitator)
   */
  async verifyPayment(payment, requiredAmount) {
    // Payment structure from x402 spec
    const { x402Version, scheme, network, payload } = payment;

    // Validate basic fields
    if (x402Version !== 1) {
      throw new Error('Unsupported x402 version');
    }

    if (scheme !== 'exact') {
      throw new Error('Only "exact" scheme supported currently');
    }

    // Verify network matches
    if (!network.startsWith(`arc-testnet:${this.config.chainId}`)) {
      throw new Error('Network mismatch');
    }

    // If facilitator is configured, use it
    if (this.config.facilitatorUrl) {
      return await this.verifyViaFacilitator(payment, requiredAmount);
    }

    // Otherwise, verify on-chain directly
    return await this.verifyOnChain(payload, requiredAmount);
  }

  /**
   * Verify payment via facilitator service
   */
  async verifyViaFacilitator(payment, requiredAmount) {
    const response = await fetch(`${this.config.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment,
        payTo: this.config.payTo,
        asset: this.config.usdcAddress,
        requiredAmount: ethers.parseUnits(requiredAmount, 6).toString()
      })
    });

    const result = await response.json();
    if (!result.valid) {
      throw new Error(result.error || 'Payment verification failed');
    }

    return result;
  }

  /**
   * Verify payment on-chain (check transaction or balance)
   */
  async verifyOnChain(payload, requiredAmount) {
    // Payload for "exact" scheme should contain:
    // - txHash: transaction hash of the payment
    // - from: payer address
    // - signature: optional signature for pre-authorization

    const { txHash, from, signature } = payload;

    if (txHash) {
      // Verify existing transaction
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 1) {
        throw new Error('Transaction not found or failed');
      }

      // Get transaction details to verify payment
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) {
        throw new Error('Transaction not found');
      }

      // For direct transfers, decode tx.data
      // For Arc native USDC, check if it's to the right address
      const to = tx.to.toLowerCase();
      const expectedTo = this.config.usdcAddress.toLowerCase();

      // Parse amount from transaction value (Arc USDC transfers)
      let value;
      if (to === expectedTo || to === this.config.payTo.toLowerCase()) {
        // Try to decode ERC20 transfer call
        const usdc = new ethers.Contract(this.config.usdcAddress, this.erc20Abi, this.provider);
        try {
          const decoded = usdc.interface.parseTransaction({ data: tx.data, value: tx.value });
          if (decoded && decoded.name === 'transfer') {
            value = decoded.args[1]; // amount is second arg
            // Verify recipient from decoded args
            if (decoded.args[0].toLowerCase() !== this.config.payTo.toLowerCase()) {
              throw new Error('Payment sent to wrong address');
            }
          }
        } catch (e) {
          // If decode fails, try getting from logs
          const transferLog = receipt.logs.find(log =>
            log.address.toLowerCase() === this.config.usdcAddress.toLowerCase()
          );
          if (transferLog && transferLog.topics.length >= 3) {
            // topics[0] = Transfer event signature
            // topics[1] = from address
            // topics[2] = to address
            // data = amount
            const toAddr = '0x' + transferLog.topics[2].slice(26);
            value = ethers.toBigInt(transferLog.data);
            if (toAddr.toLowerCase() !== this.config.payTo.toLowerCase()) {
              throw new Error('Payment sent to wrong address');
            }
          } else {
            throw new Error('Could not verify USDC transfer');
          }
        }
      } else {
        throw new Error('Transaction not sent to USDC contract or service address');
      }

      const to_final = this.config.payTo; // Already verified above

      // Verify amount
      const required = ethers.parseUnits(requiredAmount, 6);
      if (value < required) {
        throw new Error(`Insufficient payment: ${ethers.formatUnits(value, 6)} < ${requiredAmount}`);
      }

      const block = await this.provider.getBlock(receipt.blockNumber);

      return {
        valid: true,
        txHash,
        from: tx.from,
        amount: ethers.formatUnits(value, 6),
        timestamp: block.timestamp
      };
    }

    if (signature) {
      // Verify signature-based pre-authorization
      // (Future implementation for off-chain payment commitments)
      throw new Error('Signature-based payments not yet implemented');
    }

    throw new Error('Payment must include txHash or signature');
  }

  /**
   * Create payment response header
   */
  createPaymentResponse(verificationResult) {
    const response = {
      x402Version: 1,
      settlement: {
        network: `arc-testnet:${this.config.chainId}`,
        txHash: verificationResult.txHash,
        timestamp: verificationResult.timestamp || Date.now(),
        amount: verificationResult.amount,
        asset: this.config.usdcAddress
      }
    };

    return Buffer.from(JSON.stringify(response)).toString('base64');
  }

  /**
   * Express middleware factory
   */
  middleware(options = {}) {
    const amount = options.amount || '0.001'; // Default $0.001
    const resource = options.resource || null;

    return async (req, res, next) => {
      // Check if payment header exists
      const paymentHeader = req.headers['x-payment'];

      if (!paymentHeader) {
        // No payment provided, return 402
        const paymentRequired = this.createPaymentRequired(req, amount, resource);

        return res.status(402)
          .set('X-PAYMENT-REQUIRED', Buffer.from(JSON.stringify(paymentRequired)).toString('base64'))
          .json(paymentRequired);
      }

      try {
        // Parse and verify payment
        const payment = this.parsePaymentHeader(paymentHeader);
        const verification = await this.verifyPayment(payment, amount);

        // Attach payment info to request
        req.payment = verification;

        // Add payment response header
        const responseHeader = this.createPaymentResponse(verification);
        res.set('X-PAYMENT-RESPONSE', responseHeader);

        // Continue to route handler
        next();
      } catch (error) {
        console.error('Payment verification failed:', error.message);

        // Return 402 with error
        const paymentRequired = this.createPaymentRequired(req, amount, resource);
        paymentRequired.error = `Payment verification failed: ${error.message}`;

        return res.status(402)
          .set('X-PAYMENT-REQUIRED', Buffer.from(JSON.stringify(paymentRequired)).toString('base64'))
          .json(paymentRequired);
      }
    };
  }
}

// Helper function for easy setup
function createX402Middleware(config) {
  return new X402Middleware(config);
}

module.exports = { X402Middleware, createX402Middleware };
