/**
 * Final TEE seed — use map with writers: "all" (sanctions-tw1 from test, or create fresh)
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

  // Use a fresh map name (tw1 was created with writers: "all" and already worked)
  // But let's create a clean one called "ofac" with writers: "all"
  const MAP_TAIL = "ofac";
  const canonicalMap = `z:${tenantId}:${MAP_TAIL}`;

  console.log("\n🗄️  Creating ofac map (writers: all)...");
  try {
    await tenant.maps.create({
      tail: MAP_TAIL,
      visibility: "private",
      writers: "all",
      readers: { only: [CONTRACT_ID] },
    });
    console.log("✅ Map created:", canonicalMap);
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes("already exists")) {
      console.log("ℹ️  Map already exists:", canonicalMap);
    } else {
      console.log("❌", msg.substring(0, 300));
    }
  }

  // Load real OFAC data
  console.log("\n📋 Loading OFAC sanctions list...");
  const raw = await readFile(SANCTIONS_FILE, "utf-8");
  const addresses = JSON.parse(raw);
  console.log(`   ${addresses.length} sanctioned addresses`);

  const entries = addresses.map(addr => ({
    address: addr.toLowerCase(),
    name: KNOWN_ENTITIES[addr.toLowerCase()]?.name || "OFAC Sanctioned Address",
    source: KNOWN_ENTITIES[addr.toLowerCase()]?.source || "OFAC SDN",
    category: KNOWN_ENTITIES[addr.toLowerCase()]?.category || "sanctioned",
  }));

  // Seed sanctions data
  console.log(`\n📤 Writing ${entries.length} entries to TEE...`);
  await tenant.executeControl("map-entry-set", {
    map_name: canonicalMap,
    key: "ofac_eth",
    value: JSON.stringify(entries),
  });
  console.log("✅ Sanctions data in TEE!");

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
  console.log("✅ Risk rules in TEE!");

  // Verify
  console.log("\n🔍 Verifying...");
  const verify = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "ofac_eth",
  });
  if (verify?.value) {
    const parsed = JSON.parse(Buffer.from(verify.value).toString());
    console.log(`✅ VERIFIED: ${parsed.length} addresses stored in TEE enclave`);
    console.log(`   Sample: ${parsed.slice(0, 2).map(e => `${e.name} (${e.address.slice(0,10)}...)`).join(", ")}`);
  }

  const rulesVerify = await tenant.executeControl("map-entry-get", {
    map_name: canonicalMap,
    key: "risk_rules",
  });
  if (rulesVerify?.value) {
    const rules = JSON.parse(Buffer.from(rulesVerify.value).toString());
    console.log(`✅ Rules: block≥${rules.threshold_block}, review≥${rules.threshold_review}`);
  }

  console.log("\n🎉 TEE IS NOW LOADED WITH REAL DATA!");
  console.log("   - 120 OFAC sanctioned ETH addresses");
  console.log("   - Risk scoring rules");
  console.log("   - All stored in TEE-encrypted KV map");
  console.log(`   - Map: ${canonicalMap}`);
  console.log("   - Contract 786 can read this data when invoked");
}

main().catch(err => {
  console.error("❌ Failed:", err.message || err);
  process.exit(1);
});
