/**
 * Register v0.2.1 of the TEE contract with correct name
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
  getContractVersion,
} from "@terminal3/t3n-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const T3N_API_KEY = process.env.T3N_API_KEY;
const WASM_PATH = path.join(__dirname, "target", "wasm32-wasip2", "release", "z_aml_compliance.wasm");

async function main() {
  setEnvironment("testnet");
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(T3N_API_KEY);
  const trustAnchor = await fetchTrustedManifest("testnet");
  const t3n = new T3nClient({ trustAnchor, wasmComponent, handlers: { EthSign: metamask_sign(address, undefined, T3N_API_KEY) } });
  await t3n.handshake();
  const did = await t3n.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;
  const tenantId = tenantDid.slice("did:t3n:".length);
  const nodeUrl = getNodeUrl();
  const tenant = new TenantClient({ t3n, baseUrl: nodeUrl, tenantDid }, tenantDid);

  const { readFile } = await import("fs/promises");
  const wasmBytes = await readFile(WASM_PATH);
  console.log(`📦 WASM: ${(wasmBytes.length / 1024).toFixed(1)}KB`);

  // Check what versions exist
  const contractId = `z:${tenantId}:aml-compliance`;
  console.log(`\n🔍 Checking existing contract: ${contractId}`);
  try {
    const version = await getContractVersion(nodeUrl, contractId);
    console.log(`   Current version: ${version}`);
  } catch (e) {
    console.log(`   Not found: ${e.message?.substring(0, 100)}`);
  }

  // Register v0.2.1 — must be higher than 0.2.0
  console.log("\n🚀 Registering v0.2.1...");
  try {
    const result = await tenant.contracts.register({
      name: "aml-compliance",
      version: "0.2.1",
      description: "AML compliance — reads OFAC data from TEE KV map 'ofac'",
      wasm: wasmBytes,
      entrypoint: "aml-compliance:main",
    });
    console.log("✅ Registered!", JSON.stringify(result));
  } catch (e) {
    console.log("❌", e.message?.substring(0, 300));
  }

  // Verify the new version is accessible
  console.log("\n🔍 Verifying new version...");
  try {
    const version = await getContractVersion(nodeUrl, contractId);
    console.log(`✅ Contract version: ${version}`);
  } catch (e) {
    console.log("⚠️  ", e.message?.substring(0, 100));
  }
}

main().catch(e => console.error("❌", e.message));
