/**
 * Terminal 3 Compliance Contract
 * 
 * This runs inside the TEE (Trusted Execution Environment)
 * Handles sanctions checking and risk scoring
 */

let t3n = null;
let tenantDid = null;

/**
 * Initialize Terminal 3 connection
 */
async function initT3N(apiKey) {
  // In production, this would use the real T3N SDK
  // For demo, we simulate the connection
  
  console.log("🔌 Connecting to Terminal 3...");
  console.log("✅ Connected to Terminal 3 (demo mode)");
  
  tenantDid = "did:t3n:" + Math.random().toString(36).substr(2, 9);
  return tenantDid;
}

/**
 * Run compliance check inside TEE
 */
async function runComplianceCheck(wallet, txData) {
  if (!tenantDid) {
    throw new Error("T3N not initialized");
  }
  
  // These operations happen inside the TEE
  const sanctionsResult = await checkSanctionsInTEE(wallet, txData);
  const riskScore = calculateRiskScore(sanctionsResult, txData);
  const auditId = await createAuditTrail(wallet, riskScore, sanctionsResult);
  
  return {
    risk_score: riskScore,
    flags: sanctionsResult.flags,
    audit_id: auditId,
    tenant_did: tenantDid,
  };
}

/**
 * Check wallet against sanctions lists (inside TEE)
 */
async function checkSanctionsInTEE(wallet, txData) {
  const flags = [];
  let sanctioned = false;
  
  // Check if wallet itself is sanctioned or a known mixer
  const walletCheck = checkSanctioned(wallet);
  
  if (walletCheck.sanctioned) {
    flags.push("directly_sanctioned");
    sanctioned = true;
  }
  
  if (walletCheck.mixer) {
    flags.push("known_mixer_address");
  }
  
  // Check if wallet interacted with mixers
  if (txData?.interactions?.some(i => MIXER_ADDRESSES.has(i.toLowerCase()))) {
    flags.push("mixer_interaction");
  }
  
  // Check jurisdiction
  const jurisdictionCheck = checkJurisdiction(txData?.jurisdiction);
  if (jurisdictionCheck.highRisk) {
    flags.push("high_risk_jurisdiction");
  }
  
  // Check transaction patterns
  if (txData?.riskFactors) {
    if (txData.riskFactors.includes("burst_activity")) flags.push("burst_activity");
    if (txData.riskFactors.includes("high_volume")) flags.push("high_volume");
  }
  
  return {
    sanctioned,
    flags,
    matchCount: flags.length,
  };
}

/**
 * Calculate risk score (inside TEE)
 */
function calculateRiskScore(sanctionsResult, txData) {
  let score = 0;
  
  // Directly sanctioned = automatic BLOCK
  if (sanctionsResult.sanctioned) {
    score = 85;
    return score;
  }
  
  // Known mixer address (25% weight)
  if (sanctionsResult.flags.includes("known_mixer_address")) {
    score += 60;
  } else if (sanctionsResult.flags.includes("mixer_interaction")) {
    score += 35;
  }
  
  // High-risk jurisdiction (20% weight)
  if (sanctionsResult.flags.includes("high_risk_jurisdiction")) {
    score += 25;
  }
  
  // Transaction pattern risk (15% weight)
  if (sanctionsResult.flags.includes("burst_activity")) {
    score += 15;
  }
  if (sanctionsResult.flags.includes("high_volume")) {
    score += 10;
  }
  if (sanctionsResult.flags.includes("no_transaction_history")) {
    score += 5;
  }
  
  return Math.min(score, 100);
}

/**
 * Import sanctions data
 */
import { checkSanctioned as checkSanctionedExternal, checkJurisdiction as checkJurisdictionExternal, SANCTIONED_ADDRESSES, MIXER_ADDRESSES } from '../api/sanctions.js';

// Alias for use within TEE
const checkSanctioned = checkSanctionedExternal;
const checkJurisdiction = checkJurisdictionExternal;

/**
 * Create audit trail (inside TEE)
 */
async function createAuditTrail(wallet, riskScore, sanctionsResult) {
  const auditId = `t3n-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`📝 Audit trail created: ${auditId}`);
  console.log(`   Wallet: ${wallet}`);
  console.log(`   Risk Score: ${riskScore}`);
  console.log(`   Flags: ${sanctionsResult.flags.join(", ")}`);
  
  return auditId;
}

/**
 * Get connection status
 */
function getStatus() {
  return {
    connected: !!tenantDid,
    tenant_did: tenantDid,
  };
}

export {
  initT3N,
  runComplianceCheck,
  getStatus
};
