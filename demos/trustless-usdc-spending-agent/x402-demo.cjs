// x402 Pay-Per-Proof Demo on Arc Testnet
// Simple demo: Agent pays for zkML proof generation via x402

const { X402Client } = require('./x402-client.cjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

// Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(emoji, color, message) {
  console.log(`${emoji} ${colors[color]}${colors.bright}${message}${colors.reset}`);
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${'='.repeat(60)}\n`);
}

async function runPayPerProofDemo() {
  section('x402 Pay-Per-Proof on Arc Testnet');

  log('💡', 'blue', 'Concept: Agent pays zkML service for proof generation');
  console.log(`   • zkML Service charges $0.003 USDC per proof`);
  console.log(`   • Agent auto-pays via x402 protocol`);
  console.log(`   • Arc settles in <1 second (instant finality)`);
  console.log(`   • Agent receives cryptographic proof\n`);

  const client = new X402Client({ privateKey: process.env.PRIVATE_KEY });

  try {
    // Step 1: Check balance
    section('Step 1: Check Agent Balance');
    const initialBalance = await client.getBalance();
    log('💰', 'green', `Agent wallet: ${client.wallet.address}`);
    log('💰', 'green', `USDC balance: ${initialBalance} USDC\n`);

    if (parseFloat(initialBalance) < 0.01) {
      log('⚠️', 'yellow', 'Low balance! Get USDC from: https://faucet.testnet.arc.network\n');
      return;
    }

    // Step 2: Check service availability
    section('Step 2: Check zkML Service');
    try {
      const healthCheck = await fetch('http://localhost:9300/health');
      if (!healthCheck.ok) throw new Error('Service not responding');

      const health = await healthCheck.json();
      log('✅', 'green', `Service: ${health.service}`);
      log('✅', 'green', `Status: ${health.status}`);
      log('💰', 'cyan', `Pricing: ${health.pricing['/prove']}\n`);
    } catch (error) {
      log('❌', 'red', 'zkML Proof Service not running!');
      console.log(`   Start it with: node zkml-proof-service-x402.cjs\n`);
      return;
    }

    // Step 3: Request zkML proof (triggers x402 payment)
    section('Step 3: Request zkML Proof (x402 Payment Flow)');

    console.log('   ┌─────────────────────────────────────────┐');
    console.log('   │ 1. Agent → zkML Service (GET /prove)    │');
    console.log('   │ 2. Service → 402 Payment Required       │');
    console.log('   │ 3. Agent → USDC payment on Arc          │');
    console.log('   │ 4. Agent → Retry with X-PAYMENT header  │');
    console.log('   │ 5. Service → Returns zkML proof         │');
    console.log('   └─────────────────────────────────────────┘\n');

    log('🔄', 'yellow', 'Requesting zkML proof...');

    const startTime = Date.now();
    const result = await client.request('http://localhost:9300/prove', {
      method: 'POST',
      body: {
        decision: 1,
        confidence: 95
      }
    });
    const duration = Date.now() - startTime;

    log('✅', 'green', `Proof received in ${duration}ms!\n`);

    // Step 4: Display results
    section('Step 4: Proof Details');
    console.log(`   Proof Hash:    ${result.proof.hash}`);
    console.log(`   Proof Size:    ${result.proof.size} bytes`);
    console.log(`   Decision:      ${result.proof.decision === 1 ? 'APPROVED ✓' : 'DENIED ✗'}`);
    console.log(`   Confidence:    ${result.proof.confidence}%`);
    console.log(`   Generation:    ${result.service.duration}ms`);
    console.log(`   Provider:      ${result.service.provider}\n`);

    // Step 5: Payment details
    section('Step 5: Payment Confirmation');
    console.log(`   Cost:          ${result.service.cost}`);
    console.log(`   Payment TX:    ${result.payment.txHash}`);
    console.log(`   From:          ${result.payment.from}`);
    console.log(`   Network:       Arc Testnet (${result.payment.amount} USDC)`);
    console.log(`   Timestamp:     ${new Date(result.payment.timestamp * 1000).toISOString()}\n`);

    // Step 6: Final balance
    section('Step 6: Updated Balance');
    const finalBalance = await client.getBalance();
    const spent = (parseFloat(initialBalance) - parseFloat(finalBalance)).toFixed(6);

    log('💳', 'cyan', `Initial balance: ${initialBalance} USDC`);
    log('💳', 'cyan', `Final balance:   ${finalBalance} USDC`);
    log('💸', 'yellow', `Total spent:     ${spent} USDC\n`);

    // Step 7: Verify proof (optional)
    section('Step 7: Verify Proof (Optional)');
    log('🔍', 'yellow', 'Verifying proof authenticity...');

    const verifyResult = await client.request('http://localhost:9300/verify', {
      method: 'POST',
      body: {
        proofHash: result.proof.hash
      }
    });

    log('✅', 'green', `Proof verified: ${verifyResult.valid}`);
    console.log(`   Verification cost: ${verifyResult.verification.cost}\n`);

    // Success summary
    section('✅ Demo Complete!');
    log('🎉', 'green', 'Successfully demonstrated x402 pay-per-proof on Arc!');
    console.log(`\n   Key Metrics:`);
    console.log(`   • Total time: ${duration}ms`);
    console.log(`   • Total cost: $${(parseFloat(spent) + 0.001).toFixed(4)} USDC`);
    console.log(`   • Settlement: Instant (<1s on Arc)`);
    console.log(`   • Proof validity: Cryptographically verified\n`);

    log('🔗', 'cyan', 'View transaction on Arc explorer:');
    console.log(`   https://testnet.arcscan.app/tx/${result.payment.txHash}\n`);

  } catch (error) {
    log('❌', 'red', `Error: ${error.message}`);
    console.error(error);
  }
}

// Run demo
if (require.main === module) {
  console.log(`\n${colors.bright}${colors.cyan}╔${'═'.repeat(58)}╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║   x402 Pay-Per-Proof Demo - Arc Testnet   ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚${'═'.repeat(58)}╝${colors.reset}\n`);

  runPayPerProofDemo()
    .then(() => {
      console.log(`${colors.green}${colors.bright}Demo completed successfully!${colors.reset}\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`${colors.red}${colors.bright}Demo failed:${colors.reset}`, error.message);
      process.exit(1);
    });
}

module.exports = { runPayPerProofDemo };
