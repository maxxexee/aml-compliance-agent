/**
 * Terminal 3 Compliance Contract
 * 
 * Real T3N SDK integration for TEE-backed compliance.
 * Tries to invoke the WASM contract inside the TEE.
 * Falls back to JS implementation if TEE invocation fails.
 */

import {
  T3nClient,
  TenantClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
  getNodeUrl,
  getContractVersion,
} from "@terminal3/t3n-sdk";

let t3n = null;
let tenant = null;
let tenantDid = null;
let tenantId = null;
let contractId = null;
let contractVersion = null;
let useTeeFallback = false;

const CONTRACT_NAME = "aml-compliance";

/**
 * Initialize Terminal 3 connection — real SDK handshake + auth
 */
async function initT3N(apiKey) {
  console.log("🔌 Connecting to Terminal 3...");
  
  setEnvironment("testnet");
  
  console.log("📦 Loading WASM component...");
  const wasmComponent = await loadWasmComponent();
  
  const address = eth_get_address(apiKey);
  console.log("🔑 Derived address:", address);
  
  console.log("🌐 Fetching trusted manifest...");
  const trustAnchor = await fetchTrustedManifest("testnet");
  
  console.log("🤝 Creating T3N client...");
  t3n = new T3nClient({
    trustAnchor,
    wasmComponent,
    handlers: {
      EthSign: metamask_sign(address, undefined, apiKey),
    },
  });
  
  console.log("📡 Handshaking with T3N node...");
  await t3n.handshake();
  console.log("✅ Handshake complete!");
  
  console.log("🔐 Authenticating...");
  const did = await t3n.authenticate(createEthAuthInput(address));
  tenantDid = did.value;
  tenantId = tenantDid.slice("did:t3n:".length);
  
  // Create TenantClient for contract operations
  const nodeUrl = getNodeUrl();
  tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid }, tenantDid);
  
  // Try to find the contract
  contractId = `z:${tenantId}:${CONTRACT_NAME}`;
  console.log("📋 Contract ID:", contractId);
  
  try {
    contractVersion = await getContractVersion(getNodeUrl(), contractId);
    console.log("✅ Contract found, version:", contractVersion);
  } catch (e) {
    console.log("⚠️  Could not get contract version:", e.message?.substring(0, 100));
    console.log("   Will use JS fallback for compliance checks");
    useTeeFallback = true;
  }
  
  console.log("✅ Connected to Terminal 3!");
  console.log("   DID:", tenantDid);
  console.log("   TEE mode:", useTeeFallback ? "JS fallback" : "Contract invocation");
  
  return tenantDid;
}

/**
 * Run compliance check — tries TEE contract first, falls back to JS
 */
async function runComplianceCheck(wallet, txData) {
  if (!tenantDid) {
    throw new Error("T3N not initialized");
  }
  
  // Try TEE contract invocation first
  if (!useTeeFallback && t3n && contractId && contractVersion) {
    try {
      console.log(`⚡ Invoking TEE contract for ${wallet}...`);
      
      const teeResult = await t3n.executeAndDecode({
        contract_id: contractId,
        contract_version: contractVersion,
        function_name: "check-wallet",
        input: {
          wallet,
          jurisdiction: txData?.jurisdiction || "GLOBAL",
        },
      });
      
      console.log("✅ TEE contract returned:", teeResult.status, `(score: ${teeResult.risk_score})`);
      
      return {
        ...teeResult,
        source: "tee_contract",
        audit_id: `t3n-tee-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };
    } catch (e) {
      console.log("⚠️  TEE invocation failed:", e.message?.substring(0, 150));
      console.log("   Falling back to JS compliance engine");
      useTeeFallback = true;
    }
  }
  
  // JS fallback — compliance logic runs server-side
  console.log(`🔍 Running JS compliance check for ${wallet}...`);
  
  const sanctionsResult = checkSanctionsInTEE(wallet, txData);
  const riskScore = calculateRiskScore(sanctionsResult, txData);
  const auditId = `t3n-js-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`📝 JS result: ${riskScore >= 71 ? "BLOCK" : riskScore >= 31 ? "REVIEW" : "APPROVE"} (score: ${riskScore})`);
  
  return {
    wallet,
    status: riskScore >= 71 ? "BLOCK" : riskScore >= 31 ? "REVIEW" : "APPROVE",
    risk_score: riskScore,
    flags: sanctionsResult.flags,
    breakdown: {
      sanctioned: sanctionsResult.sanctioned ? 100 : 0,
      mixer: sanctionsResult.flags.includes("known_mixer_address") ? 90 : sanctionsResult.flags.includes("mixer_interaction") ? 50 : 0,
      jurisdiction: sanctionsResult.flags.includes("high_risk_jurisdiction") ? 80 : 0,
      patterns: 0,
    },
    sanctions_match: sanctionsResult.entity ? {
      name: sanctionsResult.entity.name || "Sanctioned",
      source: sanctionsResult.entity.source || "OFAC",
      category: sanctionsResult.entity.category || "sanctioned",
    } : null,
    t3n_attested: !!tenantDid,
    tenant_did: tenantDid,
    timestamp: new Date().toISOString(),
    source: "js_fallback",
    audit_id: auditId,
  };
}

/**
 * Check wallet against sanctions lists (JS fallback)
 */
function checkSanctionsInTEE(wallet, txData) {
  const walletCheck = checkSanctioned(wallet);
  const flags = [];
  
  if (walletCheck.sanctioned) {
    flags.push("directly_sanctioned");
  }
  
  if (walletCheck.mixer) {
    flags.push("known_mixer_address");
  }
  
  if (txData?.interactions?.some(i => MIXER_ADDRESSES.has(i?.toLowerCase()))) {
    flags.push("mixer_interaction");
  }
  
  const jurisdictionCheck = checkJurisdiction(txData?.jurisdiction);
  if (jurisdictionCheck.highRisk) {
    flags.push("high_risk_jurisdiction");
  }
  
  if (txData?.riskFactors) {
    if (txData.riskFactors.includes("burst_activity")) flags.push("burst_activity");
    if (txData.riskFactors.includes("high_volume")) flags.push("high_volume");
  }
  
  return {
    sanctioned: walletCheck.sanctioned,
    flags,
    matchCount: flags.length,
    entity: walletCheck.entity,
  };
}

/**
 * Calculate risk score (JS fallback)
 */
function calculateRiskScore(sanctionsResult, txData) {
  let score = 0;
  
  if (sanctionsResult.sanctioned) {
    return 85;
  }
  
  if (sanctionsResult.flags.includes("known_mixer_address")) {
    score += 60;
  } else if (sanctionsResult.flags.includes("mixer_interaction")) {
    score += 35;
  }
  
  if (sanctionsResult.flags.includes("high_risk_jurisdiction")) {
    score += 25;
  }
  
  if (sanctionsResult.flags.includes("burst_activity")) {
    score += 15;
  }
  if (sanctionsResult.flags.includes("high_volume")) {
    score += 10;
  }
  
  return Math.min(score, 100);
}

/**
 * Import real sanctions data
 */
import { checkSanctioned as checkSanctionedReal } from '../api/sanctions-real.js';

function checkSanctioned(address) {
  const result = checkSanctionedReal(address);
  return {
    sanctioned: !!result,
    mixer: result?.type === 'mixer',
    entity: result,
  };
}

function checkJurisdiction(jurisdiction) {
  const highRisk = ['IR', 'KP', 'SY', 'CU', 'VE', 'MM', 'RU', 'BY'];
  return { highRisk: highRisk.includes(jurisdiction) };
}

const MIXER_ADDRESSES = new Set([
  "0x7f367fc41522ce07553e823bf3be79a889debe1b",
  "0x8589427373d6d87e9e77432797806d944876d931",
]);

/**
 * Get connection status
 */
function getStatus() {
  return {
    connected: !!tenantDid,
    tenant_did: tenantDid,
    tee_mode: useTeeFallback ? "js_fallback" : "tee_contract",
    contract_id: contractId,
  };
}

export {
  initT3N,
  runComplianceCheck,
  getStatus
};
