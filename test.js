/**
 * AML Compliance Agent - Test Script
 * 
 * Run: npx tsx test.js
 * 
 * Tests all API endpoints
 */

const API_URL = 'http://localhost:3001';

const testCases = [
  {
    name: "Clean wallet (low risk)",
    wallet: "0x0000000000000000000000000000000000000001",
    expected: "APPROVE"
  },
  {
    name: "Unknown wallet (medium risk)",
    wallet: "0x1234567890abcdef1234567890abcdef12345678",
    expected: "REVIEW"
  },
  {
    name: "Sanctioned wallet (high risk)",
    wallet: "0xd8579921026d261b853607856136bfc6a8a3b981",
    expected: "BLOCK"
  }
];

async function runTests() {
  console.log("🧪 Running AML Compliance Agent Tests\n");
  
  // Test 1: Health check
  console.log("1️⃣  Health Check...");
  try {
    const health = await fetch(`${API_URL}/api/health`);
    const data = await health.json();
    console.log(`   ✅ Status: ${data.status}`);
    console.log(`   🔗 T3N Connected: ${data.t3n_connected}`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    console.log("   💡 Make sure server is running: npm start");
    return;
  }
  
  // Test 2: Wallet checks
  console.log("\n2️⃣  Wallet Compliance Checks...");
  
  for (const test of testCases) {
    try {
      const response = await fetch(`${API_URL}/api/check-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: test.wallet })
      });
      
      const data = await response.json();
      const passed = data.status === test.expected;
      
      console.log(`   ${passed ? '✅' : '❌'} ${test.name}`);
      console.log(`      Wallet: ${test.wallet.slice(0, 10)}...`);
      console.log(`      Result: ${data.status} (score: ${data.risk_score})`);
      console.log(`      Expected: ${test.expected}`);
      
      if (data.flags.length > 0) {
        console.log(`      Flags: ${data.flags.join(', ')}`);
      }
      
    } catch (error) {
      console.log(`   ❌ ${test.name}: ${error.message}`);
    }
  }
  
  // Test 3: Sanctions list
  console.log("\n3️⃣  Sanctions List...");
  try {
    const sanctions = await fetch(`${API_URL}/api/sanctions`);
    const data = await sanctions.json();
    console.log(`   ✅ Sources: ${data.sources.join(', ')}`);
    console.log(`   📊 Total entries: ${data.total_entries}`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
  }
  
  // Test 4: Audit log
  console.log("\n4️⃣  Audit Log...");
  try {
    const audit = await fetch(`${API_URL}/api/audit`);
    const data = await audit.json();
    console.log(`   ✅ Total entries: ${data.total}`);
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
  }
  
  console.log("\n✅ Tests complete!");
}

// Run tests
runTests().catch(console.error);
