/**
 * Seed OFAC data in small chunks that the TEE contract can read.
 * 
 * Strategy: store chunks of 5 addresses each under known keys,
 * plus a metadata entry with chunk count. Contract reads metadata
 * then reads each chunk.
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
const CHUNK_SIZE = 5;

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

  // Split into chunks
  const chunks = [];
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    chunks.push(entries.slice(i, i + CHUNK_SIZE));
  }

  console.log(`📦 Storing as ${chunks.length} chunks of ${CHUNK_SIZE} addresses each`);

  // Seed each chunk
  let success = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunkJson = JSON.stringify(chunks[i]);
    try {
      await tenant.executeControl("map-entry-set", {
        map_name: map,
        key: `chunk_${i}`,
        value: chunkJson,
      });
      success++;
      if ((i + 1) % 10 === 0) console.log(`   ${i + 1}/${chunks.length} chunks...`);
    } catch (e) {
      console.log(`   ⚠️  Chunk ${i} failed: ${e.message?.substring(0, 100)}`);
    }
  }

  // Store metadata
  const metadata = JSON.stringify({
    version: 1,
    source: "OFAC SDN List",
    total_addresses: entries.length,
    total_chunks: chunks.length,
    chunk_size: CHUNK_SIZE,
    loaded_at: new Date().toISOString(),
  });

  try {
    await tenant.executeControl("map-entry-set", {
      map_name: map,
      key: "header",
      value: metadata,
    });
    console.log("✅ Header stored");
  } catch (e) {
    console.log("⚠️  Header:", e.message?.substring(0, 100));
  }

  // Store risk rules
  try {
    await tenant.executeControl("map-entry-set", {
      map_name: map,
      key: "rules",
      value: JSON.stringify({
        sanctioned_weight: 80,
        mixer_weight: 40,
        hacking_weight: 60,
        exchange_weight: 20,
        threshold_block: 70,
        threshold_review: 30,
      }),
    });
    console.log("✅ Rules stored");
  } catch (e) {
    console.log("⚠️  Rules:", e.message?.substring(0, 100));
  }

  console.log(`\n📊 ${success}/${chunks.length} chunks stored successfully`);

  // Verify
  console.log("\n🔍 Verifying...");
  const headerVerify = await tenant.executeControl("map-entry-get", {
    map_name: map,
    key: "header",
  });
  if (headerVerify?.value) {
    const h = JSON.parse(Buffer.from(headerVerify.value).toString());
    console.log(`✅ Header: ${h.total_addresses} addresses, ${h.total_chunks} chunks`);
  }

  // Verify a few chunks
  for (const chunkIdx of [0, 1, Math.floor(chunks.length / 2), chunks.length - 1]) {
    const chunkVerify = await tenant.executeControl("map-entry-get", {
      map_name: map,
      key: `chunk_${chunkIdx}`,
    });
    if (chunkVerify?.value) {
      const c = JSON.parse(Buffer.from(chunkVerify.value).toString());
      console.log(`✅ Chunk ${chunkIdx}: ${c.length} addresses (${c[0]?.name})`);
    } else {
      console.log(`⚠️  Chunk ${chunkIdx}: not found`);
    }
  }

  // Also verify the individual addr: entries from before
  const addrVerify = await tenant.executeControl("map-entry-get", {
    map_name: map,
    key: "addr:0x098b716b8aaf21512996dc57eb0615e2383e2f96",
  });
  if (addrVerify?.value) {
    const a = JSON.parse(Buffer.from(addrVerify.value).toString());
    console.log(`✅ Individual entry: ${a.name}`);
  }

  console.log("\n🎉 TEE loaded with real OFAC data (chunked)!");
}

main().catch(e => console.error("❌", e.message));
