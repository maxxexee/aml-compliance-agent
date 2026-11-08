import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSanctioned,
  getSanctionsSummary,
  searchSanctions,
  sanctionedAddresses,
} from '../api/sanctions-real.js';

test('loads the 120 OFAC Ethereum addresses', () => {
  assert.equal(sanctionedAddresses.size, 120);
  const summary = getSanctionsSummary();
  assert.equal(summary.total_addresses, 120);
  assert.ok(summary.loaded_at);
  assert.deepEqual(summary.sources, ['OFAC SDN List (US Treasury)']);
  assert.ok(summary.by_type.sanctioned > 0);
});

test('matches a sanctioned address case insensitively', () => {
  const info = checkSanctioned('0x0330070FD38Ec3bB94F58FA55D40368271E9e54A');
  assert.ok(info);
  assert.equal(info.name, 'Sanctioned Entity');
  assert.equal(info.source, 'OFAC');
  assert.equal(info.type, 'sanctioned');
});

test('returns null for clean and missing addresses', () => {
  assert.equal(checkSanctioned('0x1111111111111111111111111111111111111111'), null);
  assert.equal(checkSanctioned(''), null);
  assert.equal(checkSanctioned(undefined), null);
});

test('searches by entity name', () => {
  const results = searchSanctions('tornado');
  assert.ok(results.length > 0);
  assert.ok(results.every((result) => result.name.toLowerCase().includes('tornado')));
});
