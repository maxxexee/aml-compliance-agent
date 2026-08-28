/**
 * Seed OFAC data as individual key-value pairs (one per address)
 * to work around what appears to be a KV value size limit
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
  const map = `z:${tenantId}:ofac`;

  const raw = await readFile(SANCTIONS_FILE, "utf-8");
  const addresses = JSON.parse(raw);
  console.log(`📋 ${addresses.length} OFAC addresses to seed`);

  // Store the address list as individual entries
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i].toLowerCase();
    const entity = KNOWN_ENTITIES[addr];
    const entry = JSON.stringify({
      address: addr,
      name: entity?.name || "OFAC Sanctioned Address",
      source: entity?.source || "OFAC SDN",
      category: entity?.category || "sanctioned",
      index: i + 1,
    });

    try {
      await tenant.executeControl("map-entry-set", {
        map_name: map,
        key: `addr:${addr}`,
        value: entry,
      });
      successCount++;
      if ((i + 1) % 20 === 0) console.log(`   ${i + 1}/${addresses.length} seeded...`);
    } catch (e) {
      failCount++;
      if (failCount <= 3) console.log(`   ⚠️  Failed ${addr}: ${e.message?.substring(0, 100)}`);
    }
  }

  console.log(`\n📊 Results: ${successCount} succeeded, ${failCount} failed`);

  // Also store a metadata entry
  try {
    await tenant.executeControl("map-entry-set", {
      map_name: map,
      key: "metadata",
      value: JSON.stringify({
        source: "OFAC SDN List",
        count: addresses.length,
        seeded: new Date().toISOString(),
        categories: ["sanctioned", "mixer", "hacking", "exchange"],
      }),
    });
    console.log("✅ Metadata stored");
  } catch (e) {
    console.log("⚠️  Metadata:", e.message?.substring(0, 100));
  }

  // Verify a few entries
  console.log("\n🔍 Verifying...");
  for (const testAddr of [
    "0x098b716b8aaf21512996dc57eb0615e2383e2f96",
    "0x0330070fd38ec3bb94f58fa55d40368271e9e54a",
  ]) {
    const verify = await tenant.executeControl("map-entry-get", {
      map_name: map,
      key: `addr:${testAddr.toLowerCase()}`,
    });
    if (verify?.value) {
      const entry = JSON.parse(Buffer.from(verify.value).toString());
      console.log(`✅ ${entry.name} (${entry.address})`);
    } else {
      console.log(`⚠️  ${testAddr}: not found`);
    }
  }

  console.log(`\n🎉 Done! ${successCount} addresses stored in TEE.`);
}

main().catch(e => console.error("❌", e.message));
