/**
 * Real OFAC Sanctions Data Loader
 * 
 * Loads actual sanctioned Ethereum addresses from the OFAC SDN list.
 * Sources: 
 *   - OFAC SDN List (US Treasury)
 *   - 0xB10C/ofac-sanctioned-digital-currency-addresses (auto-updated)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// ============================================
// Known entity mappings (address → entity info)
// These are the major sanctioned entities with crypto addresses
// ============================================
const KNOWN_ENTITIES = {
  // Tornado Cash
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b": { name: "Tornado Cash", type: "mixer", source: "OFAC", country: "NL" },
  "0xba214c1c1928a32bbe78e45b7e9927895c80d10b": { name: "Tornado Cash", type: "mixer", source: "OFAC", country: "NL" },
  "0x7f367f4b1cd24b271246e8608ff55a06e09abb28": { name: "Tornado Cash", type: "mixer", source: "OFAC", country: "NL" },
  "0xa0e1c163964207453df4edbe296659196d7823c8": { name: "Sinbad Mixer", type: "mixer", source: "OFAC", country: "ME" },
  "0x8589427373d6d87e9e77432797806d944876d931": { name: "Sinbad Mixer", type: "mixer", source: "OFAC", country: "ME" },

  // Lazarus Group (DPRK)
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96": { name: "Lazarus Group", type: "hacking", source: "OFAC", country: "KP" },
  "0xf4b74a37ad3a2b498ee2bcb0d55c6c1889935e19": { name: "Lazarus Group", type: "hacking", source: "OFAC", country: "KP" },
  "0x5a3378a4d5d3268b077380b63855ba4f8b1beac3": { name: "Lazarus Group", type: "hacking", source: "OFAC", country: "KP" },

  // Garantex (Russian exchange)
  "0xa0e1c163964207453df4edbe296659196d7823c8": { name: "Garantex", type: "exchange", source: "OFAC", country: "RU" },

  // Samtatom/BUSD mixer
  "0x038989cbb1710c72b9920dc4fa529158f463e72c": { name: "Tornado Cash", type: "mixer", source: "OFAC", country: "NL" },

  // Blrypto/Fraud
  "0x0330070FD38Ec3bB94F58FA55D40368271E9e54A": { name: "Sanctioned Entity", type: "sanctioned", source: "OFAC", country: "UNKNOWN" },

  // Additional known sanctioned
  "0xd8579921026d261b853607856136bfc6a8a3b981": { name: "Sanctioned Entity", type: "sanctioned", source: "OFAC", country: "UNKNOWN" },
};

// ============================================
// Sanctions Database
// ============================================
let sanctionedAddresses = new Map(); // address (lowercase) → entity info
let loadTime = null;
let addressCount = 0;

/**
 * Load sanctioned addresses from the OFAC ETH list
 */
function loadSanctionsData() {
  const ethFile = path.join(DATA_DIR, 'ofac_eth.txt');
  
  if (!fs.existsSync(ethFile)) {
    console.error("⚠️  OFAC sanctions data not found at:", ethFile);
    console.error("   Download from: https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses");
    return false;
  }

  try {
    const content = fs.readFileSync(ethFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    sanctionedAddresses.clear();
    
    for (const line of lines) {
      const addr = line.trim().toLowerCase();
      if (!addr.startsWith('0x') || addr.length !== 42) continue;
      
      // Check if we have entity info for this address
      const known = KNOWN_ENTITIES[addr] || KNOWN_ENTITIES[line.trim()];
      
      sanctionedAddresses.set(addr, known || {
        name: "OFAC Sanctioned Address",
        type: "sanctioned",
        source: "OFAC SDN List",
        country: "UNKNOWN",
      });
    }

    addressCount = sanctionedAddresses.size;
    loadTime = new Date().toISOString();
    
    console.error(`✅ Loaded ${addressCount} sanctioned ETH addresses from OFAC SDN list`);
    console.error(`   Last updated: ${loadTime}`);
    
    return true;
  } catch (err) {
    console.error(`❌ Failed to load sanctions data: ${err.message}`);
    return false;
  }
}

/**
 * Check if an address is sanctioned
 * @param {string} address - Ethereum address to check
 * @returns {object|null} Entity info if sanctioned, null otherwise
 */
function checkSanctioned(address) {
  if (!address) return null;
  const normalized = address.toLowerCase();
  return sanctionedAddresses.get(normalized) || null;
}

/**
 * Get sanctions summary
 */
function getSanctionsSummary() {
  const byType = {};
  const byCountry = {};
  
  for (const [, info] of sanctionedAddresses) {
    byType[info.type] = (byType[info.type] || 0) + 1;
    byCountry[info.country] = (byCountry[info.country] || 0) + 1;
  }

  return {
    total_addresses: addressCount,
    loaded_at: loadTime,
    by_type: byType,
    by_country: byCountry,
    sources: ["OFAC SDN List (US Treasury)"],
    update_url: "https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses",
  };
}

/**
 * Search sanctions by name (fuzzy)
 */
function searchSanctions(query) {
  const q = query.toLowerCase();
  const results = [];
  
  for (const [address, info] of sanctionedAddresses) {
    if (info.name.toLowerCase().includes(q) || 
        info.type.toLowerCase().includes(q) ||
        info.country.toLowerCase().includes(q)) {
      results.push({ address, ...info });
    }
  }
  
  return results;
}

// Load on import
loadSanctionsData();

export {
  checkSanctioned,
  getSanctionsSummary,
  searchSanctions,
  loadSanctionsData,
  sanctionedAddresses,
};
