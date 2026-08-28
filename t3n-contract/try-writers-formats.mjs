/**
 * Try every possible writers format to find the right one
 */

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

  // Try various writers formats
  const formats = [
    { tail: "tw1", desc: 'writers: "all"', opts: { tail: "tw1", visibility: "private", writers: "all", readers: { only: [CONTRACT_ID] } } },
    { tail: "tw2", desc: "writers: {all: null}", opts: { tail: "tw2", visibility: "private", writers: { all: null }, readers: { only: [CONTRACT_ID] } } },
    { tail: "tw3", desc: "writers: {only: []}", opts: { tail: "tw3", visibility: "private", writers: { only: [] }, readers: { only: [CONTRACT_ID] } } },
    { tail: "tw4", desc: "writers: {only: [0]}", opts: { tail: "tw4", visibility: "private", writers: { only: [0] }, readers: { only: [CONTRACT_ID] } } },
    { tail: "tw5", desc: "readers: {all: {}}", opts: { tail: "tw5", visibility: "private", writers: { only: [CONTRACT_ID] }, readers: { all: {} } } },
  ];

  let workingFormat = null;

  for (const fmt of formats) {
    console.log(`\n🧪 ${fmt.desc}`);
    try {
      await tenant.maps.create(fmt.opts);
      console.log("   ✅ Map created");
    } catch (e) {
      const msg = e.message || String(e);
      if (msg.includes("already exists")) {
        console.log("   ℹ️  Already exists");
      } else {
        console.log("   ❌ Create:", msg.substring(0, 200));
        continue;
      }
    }

    // Try writing
    const canonicalMap = `z:${tenantId}:${fmt.tail}`;
    try {
      await tenant.executeControl("map-entry-set", {
        map_name: canonicalMap,
        key: "test",
        value: "hello",
      });
      console.log("   ✅ WRITE WORKS!");
      workingFormat = fmt;
      break;
    } catch (e) {
      console.log("   ❌ Write:", (e.message || String(e)).substring(0, 200));
    }
  }

  if (workingFormat) {
    console.log(`\n🎉 Working format: ${workingFormat.desc}`);
  } else {
    console.log("\n❌ No format worked. Let me try modifying existing map ACL...");
    
    // Try maps.update on existing map with all: {}
    try {
      await tenant.maps.update({
        tail: "sanctions-open",
        writers: { all: {} },
      });
      console.log("   ✅ maps.update worked!");
      
      const canonicalMap = `z:${tenantId}:sanctions-open`;
      await tenant.executeControl("map-entry-set", {
        map_name: canonicalMap,
        key: "test2",
        value: "hello2",
      });
      console.log("   ✅ WRITE AFTER UPDATE WORKS!");
      workingFormat = { tail: "sanctions-open" };
    } catch (e) {
      console.log("   ❌ maps.update:", (e.message || String(e)).substring(0, 300));
    }
  }

  if (!workingFormat) {
    console.log("\n❌ Could not find a working configuration.");
    console.log("   The executeControl method routes writes through the contract identity.");
    console.log("   The contract is not on any map's writers ACL.");
    console.log("   This appears to be a SDK/platform limitation.");
  }
}

main().catch(err => {
  console.error("❌ Failed:", err.message || err);
  process.exit(1);
});
