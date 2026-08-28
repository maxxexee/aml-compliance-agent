/**
 * Try writers: { all: true } so owner can write
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
  console.log("✅ Authenticated:", tenantDid);

  const nodeUrl = getNodeUrl();
  const tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid }, tenantDid);

  // Create map with writers: { all: true } — everyone (including owner) can write
  console.log("\n🗄️  Creating map with writers: { all: true }...");
  try {
    await tenant.maps.create({
      tail: "sanctions-open",
      visibility: "private",
      writers: { all: {} },
      readers: { only: [CONTRACT_ID] },
    });
    console.log("✅ Map created");
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes("already exists")) {
      console.log("ℹ️  Map already exists");
    } else {
      console.log("❌", msg.substring(0, 300));
      process.exit(1);
    }
  }

  // Try write
  const canonicalMap = `z:${tenantId}:sanctions-open`;
  console.log(`\n📤 Writing to ${canonicalMap}...`);

  try {
    await tenant.executeControl("map-entry-set", {
      map_name: canonicalMap,
      key: "test",
      value: "hello",
    });
    console.log("✅ WRITE SUCCEEDED!");
  } catch (e) {
    console.log("❌", (e.message || String(e)).substring(0, 300));
    process.exit(1);
  }

  // Verify
  const verify = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "test",
  });
  console.log("✅ Verify:", verify?.value);

  // Seed real OFAC data
  console.log("\n📤 Seeding real OFAC data...");
  const raw = await readFile(SANCTIONS_FILE, "utf-8");
  const addresses = JSON.parse(raw);
  const entries = addresses.map(addr => ({
    address: addr.toLowerCase(),
    name: KNOWN_ENTITIES[addr.toLowerCase()]?.name || "OFAC Sanctioned Address",
    source: KNOWN_ENTITIES[addr.toLowerCase()]?.source || "OFAC SDN",
    category: KNOWN_ENTITIES[addr.toLowerCase()]?.category || "sanctioned",
  }));

  await tenant.executeControl("map-entry-set", {
    map_name: canonicalMap,
    key: "ofac_eth",
    value: JSON.stringify(entries),
  });
  console.log(`✅ Seeded ${entries.length} addresses!`);

  // Final verify
  const finalVerify = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "ofac_eth",
  });
  if (finalVerify?.value) {
    const parsed = JSON.parse(Buffer.from(finalVerify.value).toString());
    console.log(`\n🎉 DONE! ${parsed.length} OFAC addresses stored inside TEE enclave.`);
    console.log(`   Map: ${canonicalMap}`);
    console.log(`   Contract 786 can read this data when invoked.`);
  }
}

main().catch(err => {
  console.error("❌ Failed:", err.message || err);
  process.exit(1);
});
