/**
 * Seed OFAC data in small chunks of 2 addresses each
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
const CHUNK_SIZE = 2;

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
  console.log(`📋 ${addresses.length} OFAC addresses`);

  const entries = addresses.map(addr => ({
    address: addr.toLowerCase(),
    name: KNOWN_ENTITIES[addr.toLowerCase()]?.name || "OFAC Sanctioned Address",
    source: KNOWN_ENTITIES[addr.toLowerCase()]?.source || "OFAC SDN",
    category: KNOWN_ENTITIES[addr.toLowerCase()]?.category || "sanctioned",
  }));

  const chunks = [];
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    chunks.push(entries.slice(i, i + CHUNK_SIZE));
  }

  console.log(`📦 ${chunks.length} chunks of ${CHUNK_SIZE} addresses`);

  // First, delete old chunk keys (by overwriting with empty)
  // Actually, we can't delete. Let's use new key names: c0, c1, ...

  let success = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunkJson = JSON.stringify(chunks[i]);
    try {
      await tenant.executeControl("map-entry-set", {
        map_name: map,
        key: `c${i}`,
        value: chunkJson,
      });
      success++;
      if ((i + 1) % 15 === 0) console.log(`   ${i + 1}/${chunks.length} chunks (${success} ok)...`);
    } catch (e) {
      console.log(`   ⚠️  c${i} (${chunkJson.length}b) failed: ${e.message?.substring(0, 80)}`);
      // If 2 is too big, try 1
    }
  }

  // Update header with new key scheme
  const metadata = JSON.stringify({
    version: 2,
    source: "OFAC SDN List",
    total_addresses: entries.length,
    total_chunks: chunks.length,
    chunk_size: CHUNK_SIZE,
    key_prefix: "c",
    loaded_at: new Date().toISOString(),
  });

  await tenant.executeControl("map-entry-set", {
    map_name: map,
    key: "header",
    value: metadata,
  });

  console.log(`\n📊 ${success}/${chunks.length} chunks stored`);

  // Verify
  const headerVerify = await tenant.executeControl("map-entry-get", {
    map_name: map,
    key: "header",
  });
  if (headerVerify?.value) {
    const h = JSON.parse(Buffer.from(headerVerify.value).toString());
    console.log(`✅ Header: ${h.total_addresses} addresses, ${h.total_chunks} chunks (v${h.version})`);
  }

  // Verify a few chunks
  for (const idx of [0, Math.floor(chunks.length / 2), chunks.length - 1]) {
    const v = await tenant.executeControl("map-entry-get", {
      map_name: map,
      key: `c${idx}`,
    });
    if (v?.value) {
      const c = JSON.parse(Buffer.from(v.value).toString());
      console.log(`✅ c${idx}: ${c.length} addresses`);
    } else {
      console.log(`⚠️  c${idx}: missing`);
    }
  }

  console.log("\n🎉 Done!");
}

main().catch(e => console.error("❌", e.message));
