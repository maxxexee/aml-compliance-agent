//! z-aml-compliance v0.1.0 — AML compliance checking inside Terminal 3 TEE.
//!
//! This contract runs inside the Trusted Execution Environment:
//!   - check-wallet:  sanctions matching + risk scoring for a single wallet
//!   - check-batch:   batch compliance checking
//!   - get-sanctions-info: summary of loaded sanctions data
//!
//! Sanctions data is stored in the z:<tid>:sanctions KV map (encrypted at rest).
//! All compliance logic runs inside the enclave — raw data never leaves.
//!
//! # Host-capability requirements
//!
//! ```json
//! {
//!   "host_capabilities": ["kv_store", "logging", "tenant_context"]
//! }
//! ```
//!
//! # Setup
//!
//! Before first use, the tenant SDK must create the sanctions KV map:
//! ```text
//! // Via the tenant SDK (before contract first use):
//! z_sdk.kv("sanctions").set("ofac_eth", <sanctions JSON bytes>)
//! ```
#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

pub const CONTRACT_VERSION: &str = "0.1.0";

wit_bindgen::generate!({
    world: "aml-compliance",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

mod compliance;

struct Component;

// ============================================
// Contract exports — dispatch to compliance module
// ============================================

#[cfg(target_arch = "wasm32")]
impl exports::z::aml_compliance::contracts::Guest for Component {
    fn check_wallet(
        req: exports::z::aml_compliance::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("check-wallet: missing input")?;
        compliance::check_wallet(&input)
    }

    fn check_batch(
        req: exports::z::aml_compliance::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("check-batch: missing input")?;
        compliance::check_batch(&input)
    }

    fn get_sanctions_info(
        req: exports::z::aml_compliance::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let _input = req.input.unwrap_or_default();
        compliance::get_sanctions_info()
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);
