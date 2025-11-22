// Shared Arc Network Utilities
// Common blockchain functions for all demos

const { ethers } = require('ethers');

// Arc Testnet Configuration
const ARC_CONFIG = {
  chainId: 5042002,
  rpcUrl: 'https://rpc.testnet.arc.network',
  usdcAddress: '0x3600000000000000000000000000000000000000',
  explorerUrl: 'https://testnet.arcscan.app'
};

// Known contract addresses on Arc Testnet
const CONTRACTS = {
  commitmentRegistry: '0x8d65d93022EB39c1b66c72A7F55C63c0C28B4E12',
  spendGate: '0x3D7Ce2Cc674149d8448B1014f34fc2B3b76e18E7',
  arcStorage: '0x3fC2FA74e89445544Adeca563abb918402E5a829',
  attestedJoltVerifier: '0x7c635F575Fde6ccD2E800F1ceAB51daD2d225093'
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

/**
 * Sign EIP-712 typed data for commitment
 */
async function signCommitment(wallet, commitment) {
  const domain = {
    name: 'ArcCommitment',
    version: '1',
    chainId: ARC_CONFIG.chainId,
    verifyingContract: CONTRACTS.commitmentRegistry
  };

  const types = {
    Commitment: [
      { name: 'proofHash', type: 'bytes32' },
      { name: 'decision', type: 'uint8' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'nonce', type: 'uint256' }
    ]
  };

  return wallet.signTypedData(domain, types, commitment);
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
  ARC_CONFIG,
  CONTRACTS,
  createProvider,
  createWallet,
  getUsdcBalance,
  transferUsdc,
  signCommitment,
  getTxExplorerUrl,
  getAddressExplorerUrl
};
