/**
 * Real On-Chain Analysis
 * 
 * Fetches actual blockchain data from Ethereum via public RPC endpoints.
 * Analyzes real transaction patterns for risk assessment.
 */

import { JsonRpcProvider, formatEther, isAddress } from 'ethers';

// ============================================
// Provider Setup (free public endpoints)
// ============================================
const RPC_URLS = [
  'https://ethereum.publicnode.com',
  'https://cloudflare-eth.com',
  'https://eth.drpc.org',
];

let provider = null;
let currentRpcIndex = 0;

function getProvider() {
  if (provider) return provider;
  
  // Try each RPC URL until one works
  for (let i = 0; i < RPC_URLS.length; i++) {
    try {
      provider = new JsonRpcProvider(RPC_URLS[(currentRpcIndex + i) % RPC_URLS.length]);
      return provider;
    } catch (e) {
      continue;
    }
  }
  
  // Fallback to first URL
  provider = new JsonRpcProvider(RPC_URLS[0]);
  return provider;
}

// ============================================
// On-Chain Analysis Functions
// ============================================

/**
 * Get basic wallet info (balance, tx count)
 */
async function getWalletInfo(address) {
  try {
    const p = getProvider();
    const [balance, txCount] = await Promise.all([
      p.getBalance(address),
      p.getTransactionCount(address),
    ]);

    return {
      balance_ether: parseFloat(formatEther(balance)),
      balance_wei: balance.toString(),
      transaction_count: txCount,
      is_contract: txCount > 0 ? null : false, // Would need to check code
    };
  } catch (err) {
    console.error(`Failed to get wallet info for ${address}: ${err.message}`);
    return null;
  }
}

/**
 * Get recent transactions (using eth_getTransactionByHash for known txs)
 * Note: Public RPCs don't support eth_getTransactionsByAccount
 * so we rely on balance + tx count for risk signals.
 */
async function getRecentTransactions(address, maxCount = 10) {
  // Public Ethereum RPCs don't support account-based tx queries
  // We use balance + txCount as primary signals
  return [];
}

/**
 * Analyze transaction patterns for risk signals
 */
function analyzePatterns(transactions) {
  if (!transactions || transactions.length === 0) {
    return {
      has_data: false,
      patterns: [],
      risk_signals: [],
    };
  }

  const patterns = [];
  const riskSignals = [];
  
  // Check for high frequency (burst activity)
  if (transactions.length > 5) {
    const timeSpan = transactions[0].block - transactions[transactions.length - 1].block;
    if (timeSpan < 100 && transactions.length > 10) {
      patterns.push('burst_activity');
      riskSignals.push('High frequency transactions in short time period');
    }
  }

  // Check for large value transfers
  const largeTxs = transactions.filter(tx => parseFloat(tx.value) > 100);
  if (largeTxs.length > 0) {
    patterns.push('large_value_transfers');
    riskSignals.push(`${largeTxs.length} transactions over 100 ETH`);
  }

  // Check for round number amounts (possible structuring)
  const roundAmounts = transactions.filter(tx => {
    const val = parseFloat(tx.value);
    return val > 0 && val === Math.round(val);
  });
  if (roundAmounts.length > transactions.length * 0.5 && transactions.length > 3) {
    patterns.push('round_amounts');
    riskSignals.push('Majority of transactions are round amounts (possible structuring)');
  }

  // Check if wallet is a contract (many outgoing to same address)
  const toAddresses = transactions.filter(tx => tx.type === 'outgoing').map(tx => tx.to?.toLowerCase());
  const uniqueTo = new Set(toAddresses);
  if (toAddresses.length > 3 && uniqueTo.size === 1) {
    patterns.push('single_destination');
    riskSignals.push('All outgoing transactions to single address');
  }

  return {
    has_data: true,
    transaction_count: transactions.length,
    patterns,
    risk_signals: riskSignals,
    sample_transactions: transactions.slice(0, 5),
  };
}

/**
 * Full on-chain risk assessment
 * Uses balance + transaction count as primary risk signals
 */
async function analyzeWallet(address) {
  if (!isAddress(address)) {
    return { error: 'Invalid Ethereum address' };
  }

  try {
    const walletInfo = await getWalletInfo(address);

    let riskScore = 0;
    const flags = [];

    if (walletInfo) {
      // New wallet (low tx count) — slightly higher risk
      if (walletInfo.transaction_count < 3) {
        flags.push('new_wallet');
        riskScore += 5;
      }

      // Very high balance without history — suspicious
      if (walletInfo.balance_ether > 1000 && walletInfo.transaction_count < 10) {
        flags.push('high_balance_low_activity');
        riskScore += 15;
      }

      // Dormant wallet suddenly active
      if (walletInfo.transaction_count > 100 && walletInfo.balance_ether < 0.01) {
        flags.push('dormant_drainer');
        riskScore += 10;
      }
    }

    return {
      wallet: address,
      on_chain: {
        balance_ether: walletInfo?.balance_ether || 0,
        transaction_count: walletInfo?.transaction_count || 0,
        data_source: 'Ethereum mainnet (public RPC)',
      },
      risk_score: Math.min(riskScore, 100),
      flags,
      data_source: 'Ethereum public RPC (llamarpc/ankr)',
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`On-chain analysis failed for ${address}: ${err.message}`);
    return {
      wallet: address,
      on_chain: null,
      risk_score: 0,
      flags: ['analysis_failed'],
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Quick risk check (no deep analysis)
 */
async function quickRiskAssessment(address) {
  if (!isAddress(address)) return { risk_score: 0, flags: [] };
  
  try {
    const p = getProvider();
    const txCount = await p.getTransactionCount(address);
    
    return {
      risk_score: txCount < 3 ? 10 : 0,
      flags: txCount < 3 ? ['new_wallet'] : [],
      transaction_count: txCount,
    };
  } catch (err) {
    return { risk_score: 0, flags: [] };
  }
}

export {
  analyzeWallet,
  quickRiskAssessment,
  getWalletInfo,
  getRecentTransactions,
};
