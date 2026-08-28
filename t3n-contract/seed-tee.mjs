/**
 * Seed sanctions data into TEE KV maps (with dotenv support)
 * 
 * Combined script: creates map + seeds OFAC data in one run.
 * Contract 786 must already be registered.
 */

import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
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
} from "@terminal3/t3n-sdk";

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const T3N_API_KEY = process.env.T3N_API_KEY;
const CONTRACT_ID = 786;
const SANCTIONS_FILE = path.join(__dirname, "..", "data", "ofac_eth.json");

const KNOWN_ENTITIES = {
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96": { name: "Lazarus Group", source: "OFAC", category: "hacking" },
  "0x7f367fc41522ce07553e823bf3be79a889debe1b": { name: "Tornado Cash", source: "OFAC", category: "mixer" },
  "0x8589427373d6d87e9e77432797806d944876d931": { name: "Sinbad Mixer", source: "OFAC", category: "mixer" },
  "0xa0e1c163964207453df4edbe296659196d7823c8": { name: "Garantex Exchange", source: "OFAC", category: "exchange" },
  "0xd8579921026d261b853607856136bfc6a8a3b981": { name: "Sanctioned Entity", source: "OFAC", category: "sanctioned" },
};

async function main() {
  if (!T3N_API_KEY) { console.error("❌ T3N_API_KEY required"); process.exit(1); }

  console.log("🔌 Connecting to Terminal 3...");
  setEnvironment("testnet");

  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(T3N_API_KEY);
  const trustAnchor = await fetchTrustedManifest("testnet");

  const t3n = new T3nClient({
    trustAnchor,
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, T3N_API_KEY) },
  });

  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;
  console.log("✅ Authenticated:", tenantDid);

  const nodeUrl = getNodeUrl();
  const tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid }, tenantDid);
  
  const tenantId = tenantDid.slice("did:t3n:".length);
  console.log("   Tenant ID:", tenantId);

  // 1. Create map (idempotent — safe to re-run)
  console.log("\n🗄️  Creating sanctions map...");
  try {
    await tenant.maps.create({
      tail: "sanctions",
      visibility: "private",
      writers: { only: [CONTRACT_ID] },
      readers: { only: [CONTRACT_ID] },
    });
    console.log("✅ Map created: z:" + tenantId + ":sanctions");
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes("already exists") || msg.includes("MapAlreadyExists")) {
      console.log("ℹ️  Map already exists — continuing");
    } else {
      console.log("⚠️  Map create:", msg.substring(0, 300));
    }
  }

  // 2. Load OFAC data
  console.log("\n📋 Loading OFAC sanctions...");
  const raw = await readFile(SANCTIONS_FILE, "utf-8");
  const addresses = JSON.parse(raw);
  console.log(`   ${addresses.length} addresses found`);

  // Build entries with entity info
  const entries = addresses.map(addr => ({
    address: addr.toLowerCase(),
    name: KNOWN_ENTITIES[addr.toLowerCase()]?.name || "OFAC Sanctioned Address",
    source: KNOWN_ENTITIES[addr.toLowerCase()]?.source || "OFAC SDN",
    category: KNOWN_ENTITIES[addr.toLowerCase()]?.category || "sanctioned",
  }));

  // 3. Seed data via executeControl (owner can always write to own maps)
  const canonicalMap = `z:${tenantId}:sanctions`;
  console.log(`\n📤 Seeding ${entries.length} entries into ${canonicalMap}...`);

  await tenant.executeControl("map-entry-set", {
    map_name: canonicalMap,
    key: "ofac_eth",
    value: JSON.stringify(entries),
  });
  console.log("✅ Sanctions data seeded into TEE!");

  // 4. Also seed a small rules config
  await tenant.executeControl("map-entry-set", {
    map_name: canonicalMap,
    key: "risk_rules",
    value: JSON.stringify({
      sanctioned_weight: 80,
      mixer_weight: 40,
      hacking_weight: 60,
      exchange_weight: 20,
      threshold_block: 70,
      threshold_review: 30,
    }),
  });
  console.log("✅ Risk rules seeded into TEE!");

  // 5. Verify reads
  console.log("\n🔍 Verifying TEE data...");
  const verifyResult = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "ofac_eth",
  });

  if (verifyResult?.value) {
    const parsed = JSON.parse(Buffer.from(verifyResult.value).toString());
    console.log(`✅ Verified: ${parsed.length} addresses readable from TEE`);
    console.log(`   First 3: ${parsed.slice(0, 3).map(e => e.address).join(", ")}`);
  } else {
    console.log("⚠️  Could not verify — value returned:", verifyResult);
  }

  const rulesResult = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "risk_rules",
  });
  if (rulesResult?.value) {
    const rules = JSON.parse(Buffer.from(rulesResult.value).toString());
    console.log(`✅ Risk rules: block≥${rules.threshold_block}, review≥${rules.threshold_review}`);
  }

  console.log("\n🎉 All done! Sanctions data is inside the TEE enclave.");
  console.log("   Contract 786 can read this data when invoked.");
}

main().catch(err => {
  console.error("❌ Failed:", err.message || err);
  process.exit(1);
});
