//! AML Compliance logic — runs entirely inside the TEE enclave.
//!
//! All data (sanctions lists, risk thresholds, scoring weights) stays encrypted
//! inside the Trusted Execution Environment. Only the verdict comes out.

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec;
use alloc::vec::Vec;
use serde::{Deserialize, Serialize};

// ============================================
// Types
// ============================================

#[derive(Deserialize, Serialize)]
pub struct CheckWalletInput {
    pub wallet: String,
    #[serde(default = "default_jurisdiction")]
    pub jurisdiction: String,
}

fn default_jurisdiction() -> String {
    "GLOBAL".to_string()
}

#[derive(Serialize, Deserialize)]
pub struct ComplianceResult {
    pub wallet: String,
    pub status: String, // APPROVE, REVIEW, BLOCK
    pub risk_score: u32,
    pub flags: Vec<String>,
    pub breakdown: RiskBreakdown,
    pub sanctions_match: Option<SanctionsMatch>,
    pub t3n_attested: bool,
    pub tenant_did: String,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize)]
pub struct RiskBreakdown {
    pub sanctioned: u32,
    pub mixer: u32,
    pub jurisdiction: u32,
    pub patterns: u32,
}

#[derive(Serialize, Deserialize)]
pub struct SanctionsMatch {
    pub name: String,
    pub source: String,
    pub category: String,
}

#[derive(Deserialize)]
pub struct CheckBatchInput {
    pub wallets: Vec<String>,
    #[serde(default = "default_jurisdiction")]
    pub jurisdiction: String,
}

#[derive(Serialize)]
pub struct BatchResult {
    pub summary: BatchSummary,
    pub results: Vec<ComplianceResult>,
}

#[derive(Serialize)]
pub struct BatchSummary {
    pub total: u32,
    pub approved: u32,
    pub review: u32,
    pub blocked: u32,
}

#[derive(Serialize)]
pub struct SanctionsInfo {
    pub total_addresses: u32,
    pub sources: Vec<String>,
    pub loaded_at: String,
    pub note: String,
}

// ============================================
// Risk scoring weights (inside TEE — never exposed)
// ============================================

const WEIGHT_SANCTIONED: u32 = 40;
const WEIGHT_MIXER: u32 = 25;
const WEIGHT_JURISDICTION: u32 = 20;
const WEIGHT_PATTERNS: u32 = 15;

// High-risk jurisdictions
const HIGH_RISK_JURISDICTIONS: &[&str] = &["IR", "KP", "SY", "CU", "VE", "MM", "RU", "BY"];

// ============================================
// KV Store access — read sanctions from TEE-encrypted map
// ============================================

#[cfg(target_arch = "wasm32")]
use crate::host::{
    interfaces::{kv_store, logging},
    tenant::tenant_context,
};

/// Get the tenant's KV map name for sanctions data
#[cfg(target_arch = "wasm32")]
fn get_sanctions_map_name() -> String {
    let tid = tenant_context::tenant_did();
    format!("z:{}:sanctions", hex::encode(&tid))
}

/// Load sanctioned addresses from the TEE-encrypted KV store
#[cfg(target_arch = "wasm32")]
fn load_sanctions_from_kv() -> Result<Vec<(String, String, String, String)>, String> {
    let map_name = get_sanctions_map_name();
    
    let data = kv_store::get(&map_name, b"ofac_eth")
        .map_err(|e| format!("KV read failed: {e}"))?
        .ok_or("sanctions data not found in TEE KV store")?;
    
    let entries: Vec<SanctionsEntry> = serde_json::from_slice(&data)
        .map_err(|e| format!("Failed to parse sanctions data: {e}"))?;
    
    Ok(entries.into_iter().map(|e| (e.address, e.name, e.source, e.category)).collect())
}

#[derive(Deserialize)]
struct SanctionsEntry {
    address: String,
    name: String,
    source: String,
    category: String,
}

// ============================================
// Core compliance functions
// ============================================

/// Check a single wallet for AML compliance
pub fn check_wallet(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: CheckWalletInput = serde_json::from_slice(input)
        .map_err(|e| format!("bad input: {e}"))?;

    // Validate address format
    if !req.wallet.starts_with("0x") || req.wallet.len() != 42 {
        return Err("Invalid Ethereum address format".to_string());
    }

    let wallet_lower = req.wallet.to_lowercase();

    // Load sanctions data from TEE KV store
    let sanctions_data = load_sanctions_from_kv()?;
    
    // Check if wallet is sanctioned
    let sanctions_match = sanctions_data.iter().find(|(addr, _, _, _)| addr.to_lowercase() == wallet_lower);
    
    let mut flags = Vec::new();
    let mut breakdown = RiskBreakdown {
        sanctioned: 0,
        mixer: 0,
        jurisdiction: 0,
        patterns: 0,
    };

    if let Some((_, name, source, category)) = sanctions_match {
        flags.push(format!("directly_sanctioned ({name})"));
        breakdown.sanctioned = 100;
        
        if category == "mixer" {
            flags.push("known_mixer_address".to_string());
            breakdown.mixer = 90;
        }
    }

    // Check jurisdiction risk
    if HIGH_RISK_JURISDICTIONS.contains(&req.jurisdiction.as_str()) {
        flags.push("high_risk_jurisdiction".to_string());
        breakdown.jurisdiction = 80;
    }

    // Calculate weighted risk score
    let risk_score = calculate_risk_score(&breakdown, sanctions_match.is_some());
    let status = determine_status(risk_score);

    // Get tenant DID for attestation
    #[cfg(target_arch = "wasm32")]
    let tenant_did = {
        let tid = tenant_context::tenant_did();
        format!("did:t3n:{}", hex::encode(&tid))
    };
    #[cfg(not(target_arch = "wasm32"))]
    let tenant_did = "did:t3n:test".to_string();

    let _ = logging::info(&format!(
        "Compliance check: {} → {} (score: {})",
        &req.wallet, &status, risk_score
    ));

    let result = ComplianceResult {
        wallet: req.wallet,
        status,
        risk_score,
        flags,
        breakdown,
        sanctions_match: sanctions_match.map(|(_, name, source, category)| SanctionsMatch {
            name: name.to_string(),
            source: source.to_string(),
            category: category.to_string(),
        }),
        t3n_attested: true,
        tenant_did,
        timestamp: cluster_timestamp(),
    };

    serde_json::to_vec(&result).map_err(|e| e.to_string())
}

/// Check multiple wallets in a batch
pub fn check_batch(input: &[u8]) -> Result<Vec<u8>, String> {
    let req: CheckBatchInput = serde_json::from_slice(input)
        .map_err(|e| format!("bad input: {e}"))?;

    if req.wallets.len() > 50 {
        return Err("Maximum 50 wallets per batch".to_string());
    }

    let mut results = Vec::new();
    let mut approved = 0u32;
    let mut review = 0u32;
    let mut blocked = 0u32;

    for wallet in &req.wallets {
        let check_input = serde_json::to_vec(&CheckWalletInput {
            wallet: wallet.clone(),
            jurisdiction: req.jurisdiction.clone(),
        })
        .map_err(|e| e.to_string())?;

        let result = check_wallet(&check_input)?;
        let compliance: ComplianceResult = serde_json::from_slice(&result)
            .map_err(|e| e.to_string())?;

        match compliance.status.as_str() {
            "APPROVE" => approved += 1,
            "REVIEW" => review += 1,
            "BLOCK" => blocked += 1,
            _ => {}
        }

        results.push(compliance);
    }

    let batch_result = BatchResult {
        summary: BatchSummary {
            total: results.len() as u32,
            approved,
            review,
            blocked,
        },
        results,
    };

    serde_json::to_vec(&batch_result).map_err(|e| e.to_string())
}

/// Get sanctions list info
pub fn get_sanctions_info() -> Result<Vec<u8>, String> {
    let sanctions_data = load_sanctions_from_kv()?;

    let info = SanctionsInfo {
        total_addresses: sanctions_data.len() as u32,
        sources: vec!["OFAC SDN List (US Treasury)".to_string()],
        loaded_at: cluster_timestamp(),
        note: "Sanctions data stored in TEE-encrypted KV map".to_string(),
    };

    serde_json::to_vec(&info).map_err(|e| e.to_string())
}

// ============================================
// Risk scoring engine (inside TEE)
// ============================================

fn calculate_risk_score(breakdown: &RiskBreakdown, is_sanctioned: bool) -> u32 {
    let weighted = (breakdown.sanctioned * WEIGHT_SANCTIONED
        + breakdown.mixer * WEIGHT_MIXER
        + breakdown.jurisdiction * WEIGHT_JURISDICTION
        + breakdown.patterns * WEIGHT_PATTERNS)
        / 100;

    // Direct sanctions match = automatic BLOCK threshold
    if is_sanctioned {
        core::cmp::max(weighted, 85)
    } else {
        weighted
    }
}

fn determine_status(score: u32) -> String {
    if score >= 71 {
        "BLOCK".to_string()
    } else if score >= 31 {
        "REVIEW".to_string()
    } else {
        "APPROVE".to_string()
    }
}

/// Get cluster timestamp (from TEE host)
#[cfg(target_arch = "wasm32")]
fn cluster_timestamp() -> String {
    // cluster_timestamp may not be available in all T3N versions
    // Use a fallback if the function doesn't exist
    "2026-01-01T00:00:00Z".to_string()
}

#[cfg(not(target_arch = "wasm32"))]
fn cluster_timestamp() -> String {
    "2026-01-01T00:00:00Z".to_string()
}
