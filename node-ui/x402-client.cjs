// x402 Client Helper for AI Agents
// Makes it easy for agents to pay for services

const { ethers } = require('ethers');

class X402Client {
  constructor(config) {
    this.config = {
      rpcUrl: config.rpcUrl || process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
      privateKey: config.privateKey || process.env.PRIVATE_KEY,
      usdcAddress: config.usdcAddress || '0x3600000000000000000000000000000000000000',
      chainId: config.chainId || 5042002,
      ...config
    };

    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    this.wallet = new ethers.Wallet(this.config.privateKey, this.provider);

    this.erc20Abi = [
      'function balanceOf(address) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)'
    ];

    this.usdc = new ethers.Contract(this.config.usdcAddress, this.erc20Abi, this.wallet);
  }

  /**
   * Make a paid request to an x402-protected endpoint
   */
  async request(url, options = {}) {
    const method = options.method || 'POST';
    const body = options.body || null;

    console.log(`[x402] Requesting ${method} ${url}`);

    // Step 1: Make initial request (will return 402)
    const initialResponse = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    // If not 402, return response
    if (initialResponse.status !== 402) {
      return await initialResponse.json();
    }

    // Step 2: Parse payment requirements
    console.log('[x402] Payment required (402 response)');
    const paymentRequired = await initialResponse.json();
    const paymentReq = paymentRequired.accepts[0]; // Take first payment option

    console.log(`[x402] Price: ${ethers.formatUnits(paymentReq.maxAmountRequired, 6)} USDC`);
    console.log(`[x402] Pay to: ${paymentReq.payTo}`);

    // Step 3: Make payment on-chain
    const txHash = await this.makePayment(
      paymentReq.payTo,
      paymentReq.maxAmountRequired
    );

    console.log(`[x402] Payment sent: ${txHash}`);

    // Step 4: Wait for confirmation
    await this.provider.waitForTransaction(txHash, 1);
    console.log(`[x402] Payment confirmed`);

    // Step 5: Create payment proof
    const paymentProof = {
      x402Version: 1,
      scheme: 'exact',
      network: `arc-testnet:${this.config.chainId}`,
      payload: {
        txHash,
        from: this.wallet.address,
        timestamp: Date.now()
      }
    };

    // Step 6: Retry request with payment header
    const paidResponse = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': Buffer.from(JSON.stringify(paymentProof)).toString('base64'),
        ...(options.headers || {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const result = await paidResponse.json();

    // Parse payment response header
    const paymentResponseHeader = paidResponse.headers.get('X-PAYMENT-RESPONSE');
    if (paymentResponseHeader) {
      const paymentResponse = JSON.parse(
        Buffer.from(paymentResponseHeader, 'base64').toString('utf-8')
      );
      result._payment = paymentResponse;
    }

    console.log(`[x402] Request successful (${paidResponse.status})`);

    return result;
  }

  /**
   * Make USDC payment on Arc
   */
  async makePayment(to, amountWei) {
    const tx = await this.usdc.transfer(to, amountWei);
    return tx.hash;
  }

  /**
   * Check USDC balance
   */
  async getBalance() {
    const balance = await this.usdc.balanceOf(this.wallet.address);
    return ethers.formatUnits(balance, 6);
  }

  /**
   * Batch requests (experimental)
   */
  async batchRequest(requests) {
    const results = [];

    for (const req of requests) {
      try {
        const result = await this.request(req.url, req.options);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Auto-approve USDC spending for a service
   * (Allows service to pull payments without per-tx approval)
   */
  async approveService(serviceAddress, amount) {
    const amountWei = ethers.parseUnits(amount, 6);
    const tx = await this.usdc.approve(serviceAddress, amountWei);
    await tx.wait();
    console.log(`[x402] Approved ${amount} USDC for ${serviceAddress}`);
  }

  /**
   * Get payment history (simplified)
   */
  async getPaymentHistory(limit = 10) {
    const filter = this.usdc.filters.Transfer(this.wallet.address, null);
    const events = await this.usdc.queryFilter(filter, -10000, 'latest');

    return events.slice(-limit).map(event => ({
      to: event.args.to,
      amount: ethers.formatUnits(event.args.value, 6),
      txHash: event.transactionHash,
      blockNumber: event.blockNumber
    }));
  }
}

// Example usage
async function exampleUsage() {
  const client = new X402Client({
    privateKey: process.env.PRIVATE_KEY
  });

  console.log('\n=== x402 Client Example ===\n');

  // Check balance
  const balance = await client.getBalance();
  console.log(`Balance: ${balance} USDC\n`);

  // Make paid request to zkML proof service
  try {
    const result = await client.request('http://localhost:9300/prove', {
      method: 'POST',
      body: {
        decision: 1,
        confidence: 95
      }
    });

    console.log('\nProof generated:', result.proof);
    console.log('Cost:', result.service.cost);
    console.log('Payment:', result.payment);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

module.exports = { X402Client };

// Run example if executed directly
if (require.main === module) {
  const path = require('path');
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
  exampleUsage().catch(console.error);
}
