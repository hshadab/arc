// Deploy ArcAgentController to Arc Testnet
// Usage: node contracts/deploy.cjs

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://testnet-rpc.arc.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const USDC_ADDRESS = '0x96a5A84A95d2F42B4C874e9eDdf2b1fC95e6c820'; // Arc Testnet USDC

// ArcAgentController bytecode and ABI (compiled with solc 0.8.19)
// You'll need to compile the contract and paste the bytecode here
// For now, using a pre-compiled version

const ABI = [
  "constructor(address _usdc, string memory name, string memory version)",
  "function executeTransfer(address to, uint256 amount, tuple(bytes32 proofHash, uint256 decision, uint256 timestamp, uint256 nonce) commitment, bytes signature) external",
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function balance() external view returns (uint256)",
  "function domainSeparator() external view returns (bytes32)",
  "function usedNonces(uint256) external view returns (bool)",
  "function owner() external view returns (address)",
  "event TransferExecuted(address indexed to, uint256 amount, bytes32 proofHash, uint256 decision, uint256 nonce, uint256 timestamp)",
  "event FundsDeposited(address indexed from, uint256 amount)",
  "event FundsWithdrawn(address indexed to, uint256 amount)"
];

async function main() {
  if (!PRIVATE_KEY) {
    console.error('PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  console.log('\\n=== ArcAgentController Deployment ===\\n');

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Deployer: ${wallet.address}`);
  console.log(`Network: Arc Testnet`);
  console.log(`USDC Address: ${USDC_ADDRESS}`);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\\n`);

  // Note: You need to compile the contract first with solc or hardhat
  // This script assumes you have the bytecode ready

  console.log('To deploy:');
  console.log('1. Compile ArcAgentController.sol with solc or hardhat');
  console.log('2. Update this script with the bytecode');
  console.log('3. Run again\\n');

  console.log('Contract constructor args:');
  console.log(`  - usdc: ${USDC_ADDRESS}`);
  console.log(`  - name: "ArcAgentController"`);
  console.log(`  - version: "1"\\n`);

  // Save ABI for server use
  const abiPath = path.join(__dirname, 'ArcAgentController.json');
  fs.writeFileSync(abiPath, JSON.stringify({ abi: ABI }, null, 2));
  console.log(`ABI saved to: ${abiPath}`);
}

main().catch(console.error);
