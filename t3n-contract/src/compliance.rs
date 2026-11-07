//! AML Compliance logic: runs entirely inside the TEE enclave.
//!
//! All data (sanctions lists, risk thresholds, scoring weights) stays encrypted
//! inside the Trusted Execution Environment. Only the verdict comes out.
//!
//! Sanctions data is read from the tenant's z:<tid>:ofac KV map. The primary
//! key is ofac_eth, which holds the full sanctions array. If that key is
//! absent, the contract falls back to chunked layouts (header plus c0, c1, ...
//! or chunk_0, chunk_1, ...).

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
// KV Store access — read sanctions from TEE-encrypted map
// ============================================

#[cfg(target_arch = "wasm32")]
use crate::host::{
    interfaces::{kv_store, logging},
    tenant::tenant_context,
};

#[derive(Deserialize)]
struct SanctionsEntry {
    address: String,
    name: String,
    source: String,
    category: String,
}

/// Get the tenant's KV map name for sanctions data
#[cfg(target_arch = "wasm32")]
fn get_sanctions_map_name() -> String {
    let tid = tenant_context::tenant_did();
    format!("z:{}:ofac", hex::encode(&tid))
}

/// Load sanctioned addresses from the TEE-encrypted KV store.
/// Reads the full array from the "ofac_eth" key.
#[cfg(target_arch = "wasm32")]
fn load_sanctions_from_kv() -> Result<Vec<SanctionsEntry>, String> {
    let map_name = get_sanctions_map_name();

    // Try reading the full list from "ofac_eth" key (seeded by seed scripts)
    if let Ok(Some(data)) = kv_store::get(&map_name, b"ofac_eth") {
        let entries: Vec<SanctionsEntry> = serde_json::from_slice(&data)
            .map_err(|e| format!("Failed to parse ofac_eth: {e}"))?;
        return Ok(entries);
    }

    // Fallback: try chunked format (header + c0, c1, ...)
    // This handles data seeded with seed-chunks.mjs
    if let Ok(Some(header_data)) = kv_store::get(&map_name, b"header") {
        #[derive(Deserialize)]
        struct HeaderEntry {
            total_chunks: u32,
        }

        let header: HeaderEntry = serde_json::from_slice(&header_data)
            .map_err(|e| format!("Failed to parse header: {e}"))?;

        let mut all_entries = Vec::new();
        for i in 0..header.total_chunks {
            let key = format!("c{}", i);
            if let Ok(Some(chunk_data)) = kv_store::get(&map_name, key.as_bytes()) {
                if let Ok(chunk) = serde_json::from_slice::<Vec<SanctionsEntry>>(&chunk_data) {
                    all_entries.extend(chunk);
                }
            }
        }
        if !all_entries.is_empty() {
            return Ok(all_entries);
        }
    }

    // Fallback: try chunk_0, chunk_1, ... format (from seed-chunks.mjs)
    let mut all_entries = Vec::new();
    for i in 0..100 {
        let key = format!("chunk_{}", i);
        if let Ok(Some(chunk_data)) = kv_store::get(&map_name, key.as_bytes()) {
            if let Ok(chunk) = serde_json::from_slice::<Vec<SanctionsEntry>>(&chunk_data) {
                all_entries.extend(chunk);
            } else {
                break;
            }
        } else {
            break;
        }
    }
    if !all_entries.is_empty() {
        return Ok(all_entries);
    }

    Err("sanctions data not found in TEE KV store".to_string())
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
    let sanctions_match = sanctions_data.iter().find(|entry| entry.address.to_lowercase() == wallet_lower);

    let mut flags = Vec::new();
    let mut breakdown = RiskBreakdown {
        sanctioned: 0,
        mixer: 0,
        jurisdiction: 0,
        patterns: 0,
    };

    if let Some(entry) = sanctions_match {
        flags.push(format!("directly_sanctioned ({})", entry.name));
        breakdown.sanctioned = 100;

        if entry.category == "mixer" {
            flags.push("known_mixer_address".to_string());
            breakdown.mixer = 90;
        }
    }

    // Check jurisdiction risk
    let high_risk = ["IR", "KP", "SY", "CU", "VE", "MM", "RU", "BY"];
    if high_risk.contains(&req.jurisdiction.as_str()) {
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

    #[cfg(target_arch = "wasm32")]
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
        sanctions_match: sanctions_match.map(|entry| SanctionsMatch {
            name: entry.name.clone(),
            source: entry.source.clone(),
            category: entry.category.clone(),
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
        note: "Sanctions data stored in TEE-encrypted KV map (ofac_eth with chunked fallback)".to_string(),
    };

    serde_json::to_vec(&info).map_err(|e| e.to_string())
}

// ============================================
// Risk scoring engine (inside TEE)
// ============================================

fn calculate_risk_score(breakdown: &RiskBreakdown, is_sanctioned: bool) -> u32 {
    const W_SANCTIONED: u32 = 40;
    const W_MIXER: u32 = 25;
    const W_JURISDICTION: u32 = 20;
    const W_PATTERNS: u32 = 15;

    let weighted = (breakdown.sanctioned * W_SANCTIONED
        + breakdown.mixer * W_MIXER
        + breakdown.jurisdiction * W_JURISDICTION
        + breakdown.patterns * W_PATTERNS)
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

#[cfg(target_arch = "wasm32")]
fn cluster_timestamp() -> String {
    "2026-01-01T00:00:00Z".to_string()
}

#[cfg(not(target_arch = "wasm32"))]
fn cluster_timestamp() -> String {
    "2026-01-01T00:00:00Z".to_string()
}
