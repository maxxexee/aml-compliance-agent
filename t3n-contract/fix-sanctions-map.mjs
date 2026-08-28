/**
 * Fix the existing 'sanctions' map:
 * 1. Update its ACL so owner can write
 * 2. Seed the OFAC data into it
 * 3. This way v0.1.0 contract can read it
 */

import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  T3nClient, TenantClient, setEnvironment, loadWasmComponent,
  eth_get_address, metamask_sign, createEthAuthInput,
  fetchTrustedManifest, getNodeUrl,
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
  setEnvironment("testnet");
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(T3N_API_KEY);
  const trustAnchor = await fetchTrustedManifest("testnet");
  const t3n = new T3nClient({ trustAnchor, wasmComponent, handlers: { EthSign: metamask_sign(address, undefined, T3N_API_KEY) } });
  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantId = did.value.slice("did:t3n:".length);
  const nodeUrl = getNodeUrl();
  const tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid: did.value }, did.value);
  const sanctionsMap = `z:${tenantId}:sanctions`;
  const ofacMap = `z:${tenantId}:ofac`;

  // Try maps.update on the sanctions map to change writers to "all"
  console.log("🔧 Attempting to update sanctions map ACL...");
  try {
    await tenant.maps.update({
      tail: "sanctions",
      writers: "all",
    });
    console.log("✅ ACL updated!");
  } catch (e) {
    console.log("⚠️  maps.update:", e.message?.substring(0, 200));
  }

  // Try writing to sanctions map now
  console.log("\n📤 Trying to write to sanctions map...");
  try {
    await tenant.executeControl("map-entry-set", {
      map_name: sanctionsMap,
      key: "test",
      value: "hello",
    });
    console.log("✅ Write to sanctions works!");
  } catch (e) {
    console.log("❌ sanctions write:", e.message?.substring(0, 200));
    
    // If that failed, try seeding individual addr: entries (like we did for ofac)
    console.log("\n   Trying individual entries instead...");
  }

  // Load OFAC data and try seeding as individual entries
  const raw = await readFile(SANCTIONS_FILE, "utf-8");
  const addresses = JSON.parse(raw);
  
  const entries = addresses.map(addr => ({
    address: addr.toLowerCase(),
    name: KNOWN_ENTITIES[addr.toLowerCase()]?.name || "OFAC Sanctioned Address",
    source: KNOWN_ENTITIES[addr.toLowerCase()]?.source || "OFAC SDN",
    category: KNOWN_ENTITIES[addr.toLowerCase()]?.category || "sanctioned",
  }));

  // v0.1.0 contract reads: kv_store::get(&map_name, b"ofac_eth") → big blob
  // It expects a single key "ofac_eth" with ALL addresses as JSON array
  // But KV has a size limit. So let's try the individual entries approach.
  // Actually, let's try writing to the sanctions map with individual entries.
  
  // First check if sanctions map accepts individual writes
  let successCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const addr = entries[i].address;
    try {
      await tenant.executeControl("map-entry-set", {
        map_name: sanctionsMap,
        key: `addr:${addr}`,
        value: JSON.stringify(entries[i]),
      });
      successCount++;
      if ((i + 1) % 20 === 0) console.log(`   ${i + 1}/${entries.length}...`);
    } catch (e) {
      if (i < 3) console.log(`   ⚠️  ${addr}: ${e.message?.substring(0, 80)}`);
      break;
    }
  }

  if (successCount > 0) {
    console.log(`✅ ${successCount} entries written to sanctions map`);
  } else {
    console.log("\n❌ Cannot write to sanctions map at all.");
    console.log("   The v0.1.0 contract reads from 'sanctions' map with key 'ofac_eth'.");
    console.log("   We need to either:");
    console.log("   1. Fix the map ACL, or");
    console.log("   2. Register a new contract that reads from 'ofac' map");
    console.log("   The 'ofac' map already has 120 addresses stored.");
  }

  // Also verify what's currently in the sanctions map
  console.log("\n🔍 Checking what's in sanctions map...");
  try {
    const verify = await tenant.executeControl("map-entry-get", {
      map_name: sanctionsMap,
      key: "ofac_eth",
    });
    if (verify?.value) {
      const data = JSON.parse(Buffer.from(verify.value).toString());
      console.log(`   ✅ ofac_eth: ${data.length} addresses`);
    } else {
      console.log("   ⚠️  ofac_eth: not found");
    }
  } catch (e) {
    console.log("   ❌", e.message?.substring(0, 100));
  }
}

main().catch(e => console.error("❌", e.message));
