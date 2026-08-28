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

  // Test 1: small string
  console.log("Test 1: small string (12 bytes)");
  try {
    await tenant.executeControl("map-entry-set", { map_name: map, key: "size_test", value: "hello world!" });
    console.log("  ✅ OK");
  } catch (e) { console.log("  ❌", e.message?.substring(0, 100)); }

  // Test 2: medium JSON (10 addresses)
  const raw = await readFile(SANCTIONS_FILE, "utf-8");
  const allAddresses = JSON.parse(raw);
  const small = allAddresses.slice(0, 10).map(a => ({
    address: a.toLowerCase(),
    name: KNOWN_ENTITIES[a.toLowerCase()]?.name || "test",
    source: "OFAC",
    category: "sanctioned"
  }));
  const smallJson = JSON.stringify(small);
  console.log(`Test 2: 10 addresses (${smallJson.length} bytes)`);
  try {
    await tenant.executeControl("map-entry-set", { map_name: map, key: "size_test_10", value: smallJson });
    console.log("  ✅ OK");
  } catch (e) { console.log("  ❌", e.message?.substring(0, 100)); }

  // Test 3: 40 addresses
  const med = allAddresses.slice(0, 40).map(a => ({
    address: a.toLowerCase(),
    name: KNOWN_ENTITIES[a.toLowerCase()]?.name || "test",
    source: "OFAC",
    category: "sanctioned"
  }));
  const medJson = JSON.stringify(med);
  console.log(`Test 3: 40 addresses (${medJson.length} bytes)`);
  try {
    await tenant.executeControl("map-entry-set", { map_name: map, key: "size_test_40", value: medJson });
    console.log("  ✅ OK");
  } catch (e) { console.log("  ❌", e.message?.substring(0, 100)); }

  // Test 4: 60 addresses
  const big = allAddresses.slice(0, 60).map(a => ({
    address: a.toLowerCase(),
    name: KNOWN_ENTITIES[a.toLowerCase()]?.name || "test",
    source: "OFAC",
    category: "sanctioned"
  }));
  const bigJson = JSON.stringify(big);
  console.log(`Test 4: 60 addresses (${bigJson.length} bytes)`);
  try {
    await tenant.executeControl("map-entry-set", { map_name: map, key: "size_test_60", value: bigJson });
    console.log("  ✅ OK");
  } catch (e) { console.log("  ❌", e.message?.substring(0, 100)); }

  // Test 5: all 120 addresses
  const full = allAddresses.map(a => ({
    address: a.toLowerCase(),
    name: KNOWN_ENTITIES[a.toLowerCase()]?.name || "test",
    source: "OFAC",
    category: "sanctioned"
  }));
  const fullJson = JSON.stringify(full);
  console.log(`Test 5: all ${full.length} addresses (${fullJson.length} bytes)`);
  try {
    await tenant.executeControl("map-entry-set", { map_name: map, key: "size_test_all", value: fullJson });
    console.log("  ✅ OK");
  } catch (e) { console.log("  ❌", e.message?.substring(0, 100)); }

  // Test 6: try hex-encoded
  console.log(`Test 6: 120 addresses hex-encoded`);
  const hexValue = Buffer.from(fullJson).toString("hex");
  console.log(`  Hex length: ${hexValue.length} bytes`);
  try {
    await tenant.executeControl("map-entry-set", { map_name: map, key: "size_test_hex", value: hexValue });
    console.log("  ✅ OK");
  } catch (e) { console.log("  ❌", e.message?.substring(0, 100)); }
}

main().catch(e => console.error("❌", e.message));
