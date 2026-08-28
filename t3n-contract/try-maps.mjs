/**
 * Fix: Create map without writers restriction so owner can seed data
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
  const tenantId = tenantDid.slice("did:t3n:".length);
  console.log("✅ Authenticated:", tenantDid);

  const nodeUrl = getNodeUrl();
  const tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid }, tenantDid);

  // Try different map configurations to find one where owner can write
  const attempts = [
    // Attempt 1: no writers field at all
    { tail: "sanctions-a", desc: "no writers field", createOpts: { tail: "sanctions-a", visibility: "private", readers: { only: [CONTRACT_ID] } } },
    // Attempt 2: writers as "all" / empty
    { tail: "sanctions-b", desc: "writers: {any:true}", createOpts: { tail: "sanctions-b", visibility: "private", writers: { any: true }, readers: { only: [CONTRACT_ID] } } },
    // Attempt 3: writers with empty array (not "only")
    { tail: "sanctions-c", desc: "writers: {} (default)", createOpts: { tail: "sanctions-c", visibility: "private", writers: {}, readers: { only: [CONTRACT_ID] } } },
  ];

  let workingTail = null;

  for (const attempt of attempts) {
    console.log(`\n🧪 Attempt: ${attempt.desc}`);
    
    // Create map
    try {
      await tenant.maps.create(attempt.createOpts);
      console.log(`   ✅ Map created: z:${tenantId}:${attempt.tail}`);
    } catch (e) {
      const msg = e.message || String(e);
      if (msg.includes("already exists") || msg.includes("MapAlreadyExists")) {
        console.log(`   ℹ️  Map ${attempt.tail} already exists`);
      } else {
        console.log(`   ❌ Create failed: ${msg.substring(0, 200)}`);
        continue;
      }
    }

    // Try to write
    const canonicalMap = `z:${tenantId}:${attempt.tail}`;
    try {
      await tenant.executeControl("map-entry-set", {
        map_name: canonicalMap,
        key: "ofac_eth",
        value: JSON.stringify([{ address: "test", name: "test" }]),
      });
      console.log(`   ✅ WRITE SUCCEEDED! This config works.`);
      workingTail = attempt.tail;
      break;
    } catch (e) {
      console.log(`   ❌ Write failed: ${(e.message || String(e)).substring(0, 200)}`);
    }
  }

  if (!workingTail) {
    console.log("\n❌ None of the map configurations allowed owner write.");
    console.log("   The SDK's executeControl routes through contract context.");
    console.log("   This is a Terminal 3 SDK limitation.");
    process.exit(1);
  }

  // Now seed the real data
  console.log(`\n📤 Seeding real OFAC data into z:${tenantId}:${workingTail}...`);
  const raw = await readFile(SANCTIONS_FILE, "utf-8");
  const addresses = JSON.parse(raw);
  const entries = addresses.map(addr => ({
    address: addr.toLowerCase(),
    name: KNOWN_ENTITIES[addr.toLowerCase()]?.name || "OFAC Sanctioned Address",
    source: KNOWN_ENTITIES[addr.toLowerCase()]?.source || "OFAC SDN",
    category: KNOWN_ENTITIES[addr.toLowerCase()]?.category || "sanctioned",
  }));

  await tenant.executeControl("map-entry-set", {
    map_name: `z:${tenantId}:${workingTail}`,
    key: "ofac_eth",
    value: JSON.stringify(entries),
  });
  console.log(`✅ Seeded ${entries.length} OFAC addresses into TEE!`);

  // Verify
  const verify = await tenant.executeControl("map-entry-get", {
    map_name: `z:${tenantId}:${workingTail}`,
    key: "ofac_eth",
  });
  if (verify?.value) {
    const parsed = JSON.parse(Buffer.from(verify.value).toString());
    console.log(`✅ Verified: ${parsed.length} addresses readable from TEE`);
  }

  console.log("\n🎉 Done!");
}

main().catch(err => {
  console.error("❌ Failed:", err.message || err);
  process.exit(1);
});
