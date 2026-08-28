/**
 * Quick test: write to the tw1 map that worked before
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

async function main() {
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
  const nodeUrl = getNodeUrl();
  const tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid }, tenantDid);

  // Test 1: write to tw1 (worked before)
  console.log("🧪 Testing tw1 map...");
  try {
    await tenant.executeControl("map-entry-set", {
      map_name: `z:${tenantId}:tw1`,
      key: "test2",
      value: "hello2",
    });
    console.log("✅ tw1 write works");
  } catch (e) {
    console.log("❌ tw1:", e.message?.substring(0, 200));
  }

  // Test 2: write to ofac
  console.log("🧪 Testing ofac map...");
  try {
    await tenant.executeControl("map-entry-set", {
      map_name: `z:${tenantId}:ofac`,
      key: "test",
      value: "hello",
    });
    console.log("✅ ofac write works");
  } catch (e) {
    console.log("❌ ofac:", e.message?.substring(0, 200));
  }

  // Test 3: try sanctions-open
  console.log("🧪 Testing sanctions-open map...");
  try {
    await tenant.executeControl("map-entry-set", {
      map_name: `z:${tenantId}:sanctions-open`,
      key: "test",
      value: "hello",
    });
    console.log("✅ sanctions-open write works");
  } catch (e) {
    console.log("❌ sanctions-open:", e.message?.substring(0, 200));
  }
}

main().catch(err => console.error("❌", err.message));
