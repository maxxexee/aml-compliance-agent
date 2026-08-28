/**
 * Seed sanctions data into TEE KV maps
 * 
 * Run after register.mjs (contract must already be registered).
 * Creates the sanctions map and writes OFAC data into it.
 */

import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const T3N_API_KEY = process.env.T3N_API_KEY;
const ENVIRONMENT = process.env.T3N_ENVIRONMENT || "testnet";
const CONTRACT_TAIL = "aml-compliance";
const SANCTIONS_FILE = path.join(__dirname, "..", "data", "ofac_eth.json");

// Known entity mappings
const KNOWN_ENTITIES = {
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96": { name: "Lazarus Group", source: "OFAC", category: "hacking" },
  "0x7f367fc41522ce07553e823bf3be79a889debe1b": { name: "Tornado Cash", source: "OFAC", category: "mixer" },
  "0x8589427373d6d87e9e77432797806d944876d931": { name: "Sinbad Mixer", source: "OFAC", category: "mixer" },
  "0xa0e1c163964207453df4edbe296659196d7823c8": { name: "Garantex Exchange", source: "OFAC", category: "exchange" },
  "0xd8579921026d261b853607856136bfc6a8a3b981": { name: "Sanctioned Entity", source: "OFAC", category: "sanctioned" },
};

async function main() {
  if (!T3N_API_KEY) {
    console.error("❌ T3N_API_KEY required");
    process.exit(1);
  }

  console.log("🔌 Connecting to Terminal 3...");
  setEnvironment(ENVIRONMENT);

  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(T3N_API_KEY);
  const trustAnchor = await fetchTrustedManifest(ENVIRONMENT);

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

  // 1. Create sanctions map — tenant can write directly, contract can read
  console.log("\n🗄️  Creating sanctions map...");
  try {
    await tenant.maps.create({
      tail: "sanctions-v2",
      visibility: "private",
      writers: { only: [] },
      readers: { only: [786] },
    });
    console.log("✅ Map created: sanctions-v2");
  } catch (e) {
    console.log(`ℹ️  ${e.message}`);
  }

  // 2. Load OFAC data
  console.log("\n📋 Loading OFAC sanctions...");
  const raw = await readFile(SANCTIONS_FILE, "utf-8");
  const addresses = JSON.parse(raw);

  const entries = addresses.map(addr => ({
    address: addr.toLowerCase(),
    name: KNOWN_ENTITIES[addr.toLowerCase()]?.name || "OFAC Sanctioned Address",
    source: KNOWN_ENTITIES[addr.toLowerCase()]?.source || "OFAC SDN",
    category: KNOWN_ENTITIES[addr.toLowerCase()]?.category || "sanctioned",
  }));

  // 3. Seed data via executeControl
  console.log(`📤 Seeding ${entries.length} entries into TEE...`);
  const tenantId = tenantDid.slice("did:t3n:".length);
  const canonicalMap = `z:${tenantId}:sanctions-v2`;
  console.log(`   Map: ${canonicalMap}`);

  await tenant.executeControl("map-entry-set", {
    map_name: canonicalMap,
    key: "ofac_eth",
    value: JSON.stringify(entries),
  });
  console.log("✅ Sanctions data seeded!");

  // 4. Verify
  console.log("\n🔍 Verifying...");
  const result = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "ofac_eth",
  });
  if (result?.value) {
    const parsed = JSON.parse(Buffer.from(result.value).toString());
    console.log(`✅ Verified: ${parsed.length} addresses in TEE`);
  }

  console.log("\n🎉 Done! Sanctions data is now inside the TEE.");
}

main().catch(err => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
