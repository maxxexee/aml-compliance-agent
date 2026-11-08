/**
 * R3nzo endpoint integration checks.
 *
 * Start the API first, then run: npm run test:integration
 * Set API_URL to target another port, for example API_URL=http://localhost:3011.
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
let failures = 0;

const testCases = [
  {
    name: 'Clean wallet, low risk',
    wallet: '0x0000000000000000000000000000000000000001',
    expected: 'APPROVE',
  },
  {
    name: 'Unknown wallet, low risk',
    wallet: '0x1234567890abcdef1234567890abcdef12345678',
    expected: 'APPROVE',
  },
  {
    name: 'Sanctioned wallet, high risk',
    wallet: '0x0330070FD38Ec3bB94F58FA55D40368271E9e54A',
    expected: 'BLOCK',
  },
];

async function getJson(path) {
  const response = await fetch(`${API_URL}${path}`);
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function runTests() {
  console.log('R3nzo integration checks');
  console.log(`API: ${API_URL}\n`);

  console.log('1. Health check');
  try {
    const data = await getJson('/api/health');
    if (data.status !== 'ok') throw new Error(`unexpected status ${data.status}`);
    console.log(`PASS health: ${data.status}`);
    console.log(`     T3N connected: ${data.t3n_connected}`);
  } catch (error) {
    console.log(`FAIL health: ${error.message}`);
    console.log('     Start the API with: npm start');
    process.exitCode = 1;
    return;
  }

  console.log('\n2. Wallet checks');
  for (const test of testCases) {
    try {
      const response = await fetch(`${API_URL}/api/check-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: test.wallet }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const passed = data.status === test.expected;
      console.log(`${passed ? 'PASS' : 'FAIL'} ${test.name}`);
      console.log(`     wallet: ${test.wallet.slice(0, 10)}...`);
      console.log(`     result: ${data.status} (score ${data.risk_score})`);
      console.log(`     expected: ${test.expected}`);
      if (Array.isArray(data.flags) && data.flags.length > 0) {
        console.log(`     flags: ${data.flags.join(', ')}`);
      }
      if (!passed) failures += 1;
    } catch (error) {
      console.log(`FAIL ${test.name}: ${error.message}`);
      failures += 1;
    }
  }

  console.log('\n3. Sanctions list');
  try {
    const data = await getJson('/api/sanctions');
    const sources = Array.isArray(data.sources) ? data.sources.join(', ') : 'unknown';
    console.log(`PASS sources: ${sources}`);
    console.log(`     total entries: ${data.total_entries ?? data.total_addresses ?? 'unknown'}`);
  } catch (error) {
    console.log(`FAIL sanctions list: ${error.message}`);
    failures += 1;
  }

  console.log('\n4. Audit log');
  try {
    const data = await getJson('/api/audit');
    console.log(`PASS audit entries: ${data.total ?? 'unknown'}`);
  } catch (error) {
    console.log(`FAIL audit log: ${error.message}`);
    failures += 1;
  }

  console.log('');
  if (failures === 0) {
    console.log('All integration checks passed');
  } else {
    console.log(`${failures} integration check(s) failed`);
    process.exitCode = 1;
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
