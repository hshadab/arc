// Shared Arc Network Utilities
// Common blockchain functions for all demos

const { ethers } = require('ethers');

// Arc Testnet Configuration (can be overridden via environment variables)
const ARC_CONFIG = {
  chainId: parseInt(process.env.ARC_CHAIN_ID || '5042002', 10),
  rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
  usdcAddress: process.env.ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
  explorerUrl: process.env.ARC_EXPLORER_URL || 'https://testnet.arcscan.app'
};

// Known contract addresses on Arc Testnet (can be overridden via environment variables)
const CONTRACTS = {
  commitmentRegistry: process.env.COMMITMENT_REGISTRY_ADDRESS || '0x8d65d93022EB39c1b66c72A7F55C63c0C28B4E12',
  spendGate: process.env.SPEND_GATE_ADDRESS || '0x3D7Ce2Cc674149d8448B1014f34fc2B3b76e18E7',
  arcStorage: process.env.ARC_STORAGE_ADDRESS || '0x3fC2FA74e89445544Adeca563abb918402E5a829',
  attestedJoltVerifier: process.env.ATTESTED_JOLT_VERIFIER_ADDRESS || '0x7c635F575Fde6ccD2E800F1ceAB51daD2d225093'
};

/**
 * Create a provider for Arc Testnet
 */
function createProvider(rpcUrl = ARC_CONFIG.rpcUrl) {
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Create a wallet connected to Arc Testnet
 */
function createWallet(privateKey, provider = null) {
  if (!provider) {
    provider = createProvider();
  }
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Get USDC balance on Arc
 */
async function getUsdcBalance(address, provider = null) {
  if (!provider) {
    provider = createProvider();
  }

  const usdc = new ethers.Contract(
    ARC_CONFIG.usdcAddress,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );

  const balance = await usdc.balanceOf(address);
  return ethers.formatUnits(balance, 6); // USDC has 6 decimals
}

/**
 * Transfer USDC on Arc
 */
async function transferUsdc(wallet, to, amount) {
  const usdc = new ethers.Contract(
    ARC_CONFIG.usdcAddress,
    ['function transfer(address, uint256) returns (bool)'],
    wallet
  );

  const amountWei = ethers.parseUnits(amount.toString(), 6);
  const tx = await usdc.transfer(to, amountWei);
  return tx.wait();
}

// ============================================
// EIP-712 TYPE DEFINITIONS
// ============================================

/**
 * Simple commitment type (used by ArcCommitment domain)
 * Note: Uses uint8 for decision field
 */
const EIP712_SIMPLE_COMMITMENT_TYPES = {
  Commitment: [
    { name: 'proofHash', type: 'bytes32' },
    { name: 'decision', type: 'uint8' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }
  ]
};

/**
 * Controller commitment type (used by ArcAgentController domain)
 * Note: Uses uint256 for decision field
 */
const EIP712_CONTROLLER_COMMITMENT_TYPES = {
  Commitment: [
    { name: 'proofHash', type: 'bytes32' },
    { name: 'decision', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }
  ]
};

/**
 * Full registry commitment type (used by CommitmentRegistry domain)
 */
const EIP712_REGISTRY_COMMITMENT_TYPES = {
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
    { name: 'attestor', type: 'address' }
  ]
};

/**
 * Create EIP-712 domain for simple Arc commitment
 */
function createSimpleCommitmentDomain(verifyingContract = CONTRACTS.commitmentRegistry) {
  return {
    name: 'ArcCommitment',
    version: '1',
    chainId: ARC_CONFIG.chainId,
    verifyingContract
  };
}

/**
 * Create EIP-712 domain for ArcAgentController
 */
function createControllerDomain(verifyingContract) {
  return {
    name: 'ArcAgentController',
    version: '1',
    chainId: ARC_CONFIG.chainId,
    verifyingContract
  };
}

/**
 * Create EIP-712 domain for CommitmentRegistry
 */
function createRegistryDomain(verifyingContract = CONTRACTS.commitmentRegistry) {
  return {
    name: 'CommitmentRegistry',
    version: '1',
    chainId: ARC_CONFIG.chainId,
    verifyingContract
  };
}

/**
 * Sign EIP-712 typed data for simple commitment
 */
async function signCommitment(wallet, commitment) {
  const domain = createSimpleCommitmentDomain();
  return wallet.signTypedData(domain, EIP712_SIMPLE_COMMITMENT_TYPES, commitment);
}

/**
 * Sign EIP-712 typed data for controller commitment
 */
async function signControllerCommitment(wallet, commitment, controllerAddress) {
  const domain = createControllerDomain(controllerAddress);
  return wallet.signTypedData(domain, EIP712_CONTROLLER_COMMITMENT_TYPES, commitment);
}

/**
 * Sign EIP-712 typed data for registry commitment
 */
async function signRegistryCommitment(wallet, commitment, registryAddress = CONTRACTS.commitmentRegistry) {
  const domain = createRegistryDomain(registryAddress);
  return wallet.signTypedData(domain, EIP712_REGISTRY_COMMITMENT_TYPES, commitment);
}

/**
 * Get transaction explorer URL
 */
function getTxExplorerUrl(txHash) {
  return `${ARC_CONFIG.explorerUrl}/tx/${txHash}`;
}

/**
 * Get address explorer URL
 */
function getAddressExplorerUrl(address) {
  return `${ARC_CONFIG.explorerUrl}/address/${address}`;
}

module.exports = {
  // Configuration
  ARC_CONFIG,
  CONTRACTS,

  // Provider/Wallet
  createProvider,
  createWallet,

  // USDC operations
  getUsdcBalance,
  transferUsdc,

  // EIP-712 types and domains
  EIP712_SIMPLE_COMMITMENT_TYPES,
  EIP712_CONTROLLER_COMMITMENT_TYPES,
  EIP712_REGISTRY_COMMITMENT_TYPES,
  createSimpleCommitmentDomain,
  createControllerDomain,
  createRegistryDomain,

  // Signing functions
  signCommitment,
  signControllerCommitment,
  signRegistryCommitment,

  // Explorer URLs
  getTxExplorerUrl,
  getAddressExplorerUrl
};
