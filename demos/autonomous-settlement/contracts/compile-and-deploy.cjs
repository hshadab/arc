// Compile and Deploy ArcAgentController to Arc Testnet
// Usage: node contracts/compile-and-deploy.cjs

const solc = require('solc');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
// Arc USDC is at a precompile address
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';

// Import callback for OpenZeppelin
function findImports(importPath) {
  try {
    // Handle OpenZeppelin imports
    if (importPath.startsWith('@openzeppelin/')) {
      const ozPath = path.resolve(__dirname, '..', 'node_modules', importPath);
      return { contents: fs.readFileSync(ozPath, 'utf8') };
    }
    return { error: `File not found: ${importPath}` };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  if (!PRIVATE_KEY) {
    console.error('PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  console.log('\n=== Compiling ArcAgentController ===\n');

  // Read contract source
  const contractPath = path.join(__dirname, 'ArcAgentController.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  // Compile
  const input = {
    language: 'Solidity',
    sources: {
      'ArcAgentController.sol': { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode'] }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  // Check for errors
  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      console.error('Compilation errors:');
      errors.forEach(e => console.error(e.formattedMessage));
      process.exit(1);
    }
    // Show warnings
    output.errors.filter(e => e.severity === 'warning').forEach(w => {
      console.warn('Warning:', w.message);
    });
  }

  const contract = output.contracts['ArcAgentController.sol']['ArcAgentController'];
  const abi = contract.abi;
  const bytecode = contract.evm.bytecode.object;

  console.log('Compilation successful!');
  console.log(`Bytecode size: ${bytecode.length / 2} bytes\n`);

  // Save ABI
  const abiPath = path.join(__dirname, 'ArcAgentController.json');
  fs.writeFileSync(abiPath, JSON.stringify({ abi }, null, 2));
  console.log(`ABI saved to: ${abiPath}\n`);

  // Deploy
  console.log('=== Deploying to Arc Testnet ===\n');

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Deployer: ${wallet.address}`);
  console.log(`USDC Address: ${USDC_ADDRESS}`);

  // Check balance
  const balance = await getUsdcBalance(wallet.address, provider);
  console.log(`USDC Balance: ${balance} USDC\n`);

  // Deploy contract
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  console.log('Deploying contract...');
  const controller = await factory.deploy(
    USDC_ADDRESS,
    'ArcAgentController',
    '1'
  );

  console.log(`Transaction: ${controller.deploymentTransaction().hash}`);
  console.log('Waiting for confirmation...');

  await controller.waitForDeployment();
  const address = await controller.getAddress();

  console.log(`\n✅ Contract deployed at: ${address}\n`);

  // Fund the controller with USDC
  console.log('=== Funding Controller with USDC ===\n');

  const usdcAbi = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)'
  ];
  const usdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, wallet);

  // Deposit 1 USDC into controller
  const depositAmount = ethers.parseUnits('1', 6);

  console.log('Approving USDC...');
  const approveTx = await usdc.approve(address, depositAmount);
  await approveTx.wait();

  console.log('Depositing 1 USDC to controller...');
  const controllerContract = new ethers.Contract(address, abi, wallet);
  const depositTx = await controllerContract.deposit(depositAmount);
  await depositTx.wait();

  const controllerBalance = await controllerContract.balance();
  console.log(`Controller balance: ${ethers.formatUnits(controllerBalance, 6)} USDC\n`);

  console.log('=== Deployment Complete ===\n');
  console.log(`Add to .env:`);
  console.log(`ARC_AGENT_CONTROLLER_ADDRESS=${address}\n`);

  // Update .env automatically
  const envPath = path.resolve(__dirname, '..', '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  if (envContent.includes('ARC_AGENT_CONTROLLER_ADDRESS=')) {
    envContent = envContent.replace(
      /ARC_AGENT_CONTROLLER_ADDRESS=.*/,
      `ARC_AGENT_CONTROLLER_ADDRESS=${address}`
    );
  } else {
    envContent += `\nARC_AGENT_CONTROLLER_ADDRESS=${address}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env updated with controller address');
  console.log('\nRestart the server to use controller mode.');
}

async function getUsdcBalance(address, provider) {
  const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
  const usdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);
  const balance = await usdc.balanceOf(address);
  return ethers.formatUnits(balance, 6);
}

main().catch(error => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
