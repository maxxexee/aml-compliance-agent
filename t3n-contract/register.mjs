/**
 * Register AML Compliance TEE Contract with Terminal 3
 * 
 * This script:
 * 1. Connects to T3N and authenticates
 * 2. Creates a TenantClient
 * 3. Registers the WASM contract
 * 4. Creates the sanctions KV map
 * 5. Seeds it with OFAC data
 * 
 * Run: node register.mjs
 */

import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  T3nClient,
  TenantClient,
  setEnvironment,
  getNodeUrl as getNodeUrlFn,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
} from "@terminal3/t3n-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// Config
// ============================================
const T3N_API_KEY = process.env.T3N_API_KEY;
const ENVIRONMENT = process.env.T3N_ENVIRONMENT || "testnet";
const WASM_PATH = path.join(__dirname, "target", "wasm32-wasip2", "release", "z_aml_compliance.wasm");
const CONTRACT_TAIL = "aml-compliance";
const CONTRACT_VERSION = "0.1.0";
const SANCTIONS_FILE = path.join(__dirname, "..", "data", "ofac_eth.json");

// ============================================
// Known entity mappings
// ============================================
const KNOWN_ENTITIES = {
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96": { name: "Lazarus Group", source: "OFAC", category: "hacking" },
  "0x7f367fc41522ce07553e823bf3be79a889debe1b": { name: "Tornado Cash", source: "OFAC", category: "mixer" },
  "0x8589427373d6d87e9e77432797806d944876d931": { name: "Sinbad Mixer", source: "OFAC", category: "mixer" },
  "0xa0e1c163964207453df4edbe296659196d7823c8": { name: "Garantex Exchange", source: "OFAC", category: "exchange" },
  "0xd8579921026d261b853607856136bfc6a8a3b981": { name: "Sanctioned Entity", source: "OFAC", category: "sanctioned" },
};

// ============================================
// Main
// ============================================
async function main() {
  if (!T3N_API_KEY) {
    console.error("❌ T3N_API_KEY required. Export it first:");
    console.error("   export T3N_API_KEY='your-key'");
    process.exit(1);
  }

  console.log("🔌 Connecting to Terminal 3...");
  setEnvironment(ENVIRONMENT);

  // 1. Load WASM component
  console.log("📦 Loading SDK WASM component...");
  const wasmComponent = await loadWasmComponent();

  // 2. Derive address and create client
  const address = eth_get_address(T3N_API_KEY);
  console.log("🔑 Derived address:", address);

  console.log("🌐 Fetching trusted manifest...");
  const trustAnchor = await fetchTrustedManifest(ENVIRONMENT);

  console.log("🤝 Creating T3N client...");
  const t3n = new T3nClient({
    trustAnchor,
    wasmComponent,
    handlers: {
      EthSign: metamask_sign(address, undefined, T3N_API_KEY),
    },
  });

  // 3. Handshake + authenticate
  console.log("📡 Handshaking...");
  await t3n.handshake();
  console.log("✅ Handshake complete!");

  console.log("🔐 Authenticating...");
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;
  console.log("✅ Authenticated! DID:", tenantDid);

  // 4. Create TenantClient
  console.log("🏗️  Creating TenantClient...");
  const nodeUrl = getNodeUrlFn();
  console.log("   Node URL:", nodeUrl);
  const tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid }, tenantDid);
  const me = await tenant.tenant.me();
  console.log("✅ Tenant confirmed:", JSON.stringify(me));

  // 5. Register the WASM contract
  console.log("📄 Reading WASM file...");
  const wasmBytes = await readFile(WASM_PATH);
  console.log(`   WASM size: ${(wasmBytes.length / 1024).toFixed(1)} KB`);

  console.log("📝 Registering contract...");
  const regResult = await tenant.contracts.register({
    tail: CONTRACT_TAIL,
    version: CONTRACT_VERSION,
    wasm: wasmBytes,
  });
  const contractId = regResult.contract_id;
  console.log(`✅ Contract registered! ID: ${contractId}`);

  // 6. Create sanctions KV map
  const tenantId = tenantDid.slice("did:t3n:".length);
  const sanctionsMapName = `z:${tenantId}:sanctions`;

  console.log("🗄️  Creating sanctions KV map...");
  try {
    await tenant.maps.create(sanctionsMapName);
    console.log(`✅ Map created: ${sanctionsMapName}`);
  } catch (e) {
    console.log(`ℹ️  Map may already exist: ${e.message}`);
  }

  // 7. Load and seed sanctions data
  console.log("📋 Loading OFAC sanctions data...");
  let addresses;
  try {
    const raw = await readFile(SANCTIONS_FILE, "utf-8");
    addresses = JSON.parse(raw);
  } catch (e) {
    console.error(`❌ Failed to load sanctions file: ${e.message}`);
    console.error("   Make sure data/ofac_eth.json exists");
    process.exit(1);
  }

  // Build enriched entries with entity info
  const entries = addresses.map(addr => ({
    address: addr.toLowerCase(),
    name: KNOWN_ENTITIES[addr.toLowerCase()]?.name || "OFAC Sanctioned Address",
    source: KNOWN_ENTITIES[addr.toLowerCase()]?.source || "OFAC SDN",
    category: KNOWN_ENTITIES[addr.toLowerCase()]?.category || "sanctioned",
  }));

  console.log(`📤 Seeding ${entries.length} sanctions entries into TEE...`);
  const entriesJson = JSON.stringify(entries);
  await tenant.maps.set(sanctionsMapName, "ofac_eth", Buffer.from(entriesJson));
  console.log("✅ Sanctions data seeded into TEE KV store!");

  // 8. Verify
  console.log("\n🔍 Verifying...");
  const verifyData = await tenant.maps.get(sanctionsMapName, "ofac_eth");
  if (verifyData) {
    const parsed = JSON.parse(Buffer.from(verifyData).toString());
    console.log(`✅ Verified: ${parsed.length} addresses in TEE KV store`);
  }

  console.log("\n🎉 Setup complete!");
  console.log("═══════════════════════════════════════════");
  console.log("Contract ID:", contractId);
  console.log("Tenant DID:", tenantDid);
  console.log("Sanctions Map:", sanctionsMapName);
  console.log("Sanctions Entries:", entries.length);
  console.log("═══════════════════════════════════════════");
  console.log("\nSave these values — you'll need them to invoke the contract.");
}

main().catch(err => {
  console.error("❌ Registration failed:", err);
  process.exit(1);
});
