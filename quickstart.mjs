import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
} from "@terminal3/t3n-sdk";

const T3N_API_KEY = process.env.T3N_API_KEY;

if (!T3N_API_KEY) {
  console.error("❌ T3N_API_KEY not set. Run: export T3N_API_KEY=your-key");
  process.exit(1);
}

async function main() {
  console.log("🔧 Setting environment to testnet...");
  setEnvironment("testnet");

  console.log("📦 Loading WASM component...");
  const wasmComponent = await loadWasmComponent();

  console.log("🔑 Deriving address from API key...");
  const address = eth_get_address(T3N_API_KEY);
  console.log("   Address:", address);

  console.log("🌐 Fetching trusted manifest...");
  const trustAnchor = await fetchTrustedManifest("testnet");

  console.log("🤝 Creating T3N client...");
  const t3n = new T3nClient({
    trustAnchor,
    wasmComponent,
    handlers: {
      EthSign: metamask_sign(address, undefined, T3N_API_KEY),
    },
  });

  console.log("📡 Handshaking with T3N...");
  await t3n.handshake();
  console.log("✅ Handshake complete!");

  console.log("🔐 Authenticating...");
  const did = await t3n.authenticate(createEthAuthInput(address));
  console.log("✅ Authenticated!");
  console.log("");
  console.log("═══════════════════════════════════════");
  console.log("  T3N CONNECTION SUCCESSFUL");
  console.log("═══════════════════════════════════════");
  console.log("  DID:", did.value);
  console.log("  Address:", address);
  console.log("  Environment: testnet");
  console.log("═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("❌ Connection failed:", err.message);
  process.exit(1);
});
