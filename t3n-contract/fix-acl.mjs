/**
 * Fix map ACL and seed sanctions data
 * 
 * The access denied error means the contract isn't on the writers ACL.
 * Fix: use tenant.maps.update to add contract 786 to writers.
 */

import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  TenantClient,
  T3nClient,
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

  setEnvironment("testnet");
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(T3N_API_KEY);
  const t3n = new T3nClient({
    trustAnchor: await fetchTrustedManifest("testnet"),
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, T3N_API_KEY) },
  });

  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;
  console.log("✅ Authenticated:", tenantDid);

  const nodeUrl = getNodeUrl();
  const tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid }, tenantDid);

  // 1. Update map ACL — add contract to writers
  console.log("\n🔧 Updating map ACL to add contract to writers...");
  try {
    await tenant.maps.update({
      tail: "sanctions-v2",
      writers: { only: [CONTRACT_ID] },
      readers: { only: [CONTRACT_ID] },
    });
    console.log("✅ Map ACL updated — contract 786 can now write");
  } catch (e) {
    console.log("⚠️  maps.update:", e.message.substring(0, 200));
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

  // 3. Seed data
  console.log(`📤 Seeding ${entries.length} entries...`);
  const tenantId = tenantDid.slice("did:t3n:".length);
  const canonicalMap = `z:${tenantId}:sanctions-v2`;

  await tenant.executeControl("map-entry-set", {
    map_name: canonicalMap,
    key: "ofac_eth",
    value: JSON.stringify(entries),
  });
  console.log("✅ Sanctions data seeded into TEE!");

  // 4. Verify
  console.log("\n🔍 Verifying...");
  const result = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "ofac_eth",
  });
  if (result?.value) {
    const parsed = JSON.parse(Buffer.from(result.value).toString());
    console.log(`✅ Verified: ${parsed.length} addresses in TEE KV store`);
  }

  console.log("\n🎉 Done! Sanctions data is inside the TEE.");
}

main().catch(err => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
