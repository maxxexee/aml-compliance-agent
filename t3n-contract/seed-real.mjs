/**
 * Seed real OFAC data into TEE — using the ofac map that we confirmed works
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const T3N_API_KEY = process.env.T3N_API_KEY;
const SANCTIONS_FILE = path.join(__dirname, "..", "data", "ofac_eth.json");

const KNOWN_ENTITIES = {
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96": { name: "Lazarus Group", source: "OFAC", category: "hacking" },
  "0x7f367fc41522ce07553e823bf3be79a889debe1b": { name: "Tornado Cash", source: "OFAC", category: "mixer" },
  "0x8589427373d6d87e9e77432797806d944876d931": { name: "Sinbad Mixer", source: "OFAC", category: "mixer" },
  "0xa0e1c163964207453df4edbe296659196d7823c8": { name: "Garantex Exchange", source: "OFAC", category: "exchange" },
  "0xd8579921026d261b853607856136bfc6a8a3b981": { name: "Sanctioned Entity", source: "OFAC", category: "sanctioned" },
};

async function main() {
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
  const tenantId = tenantDid.slice("did:t3n:".length);
  const nodeUrl = getNodeUrl();
  const tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid }, tenantDid);

  const canonicalMap = `z:${tenantId}:ofac`;

  // Load OFAC data
  console.log("📋 Loading OFAC sanctions...");
  const raw = await readFile(SANCTIONS_FILE, "utf-8");
  const addresses = JSON.parse(raw);
  console.log(`   ${addresses.length} addresses`);

  const entries = addresses.map(addr => ({
    address: addr.toLowerCase(),
    name: KNOWN_ENTITIES[addr.toLowerCase()]?.name || "OFAC Sanctioned Address",
    source: KNOWN_ENTITIES[addr.toLowerCase()]?.source || "OFAC SDN",
    category: KNOWN_ENTITIES[addr.toLowerCase()]?.category || "sanctioned",
  }));

  // Try seeding in smaller batches to avoid any size issues
  const BATCH_SIZE = 40;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`📤 Seeding batch ${batchNum} (${batch.length} entries)...`);
    
    await tenant.executeControl("map-entry-set", {
      map_name: canonicalMap,
      key: `ofac_batch_${batchNum}`,
      value: JSON.stringify(batch),
    });
    console.log(`   ✅ Batch ${batchNum} written`);
  }

  // Also store the full list as a single entry (for contract to read easily)
  console.log(`📤 Seeding full list as single entry...`);
  await tenant.executeControl("map-entry-set", {
    map_name: canonicalMap,
    key: "ofac_eth",
    value: JSON.stringify(entries),
  });
  console.log("   ✅ Full list written");

  // Seed risk rules
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
  console.log("✅ Risk rules written");

  // Verify
  console.log("\n🔍 Verifying...");
  const verify = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "ofac_eth",
  });
  if (verify?.value) {
    const parsed = JSON.parse(Buffer.from(verify.value).toString());
    console.log(`✅ VERIFIED: ${parsed.length} addresses in TEE`);
    console.log(`   Sample: ${parsed.slice(0, 3).map(e => `${e.name} (${e.address.slice(0,10)}...)`).join(", ")}`);
  }

  const rules = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "risk_rules",
  });
  if (rules?.value) {
    const r = JSON.parse(Buffer.from(rules.value).toString());
    console.log(`✅ Rules: block≥${r.threshold_block}, review≥${r.threshold_review}`);
  }

  console.log("\n🎉 TEE LOADED WITH REAL DATA!");
}

main().catch(err => {
  console.error("❌", err.message || err);
  process.exit(1);
});
