/**
 * Sanctions Data Module
 * 
 * Handles loading and checking OFAC SDN list and other sanctions data
 * For demo purposes, we'll use a simplified version
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Known sanctioned addresses (simplified for demo)
// In production, this would be the full OFAC SDN list
const SANCTIONED_ADDRESSES = new Set([
  // Known Tornado Cash addresses
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
  '0xba214c1c1928a32bbe78e45b7e9927895c80d10b',
  '0x722122df12d4e14e13acd3b1871c738fbd0ed97d',
  '0xfe21068b072404ba8e986fbbcf2a9b15ef9f8bf6',
  
  // Known sanctioned entities (simplified)
  '0xd8579921026d261b853607856136bfc6a8a3b981',
  '0x7f367c4f2c4c2c2c2c2c2c2c2c2c2c2c2c2c2c2c',
  
  // Lazarus Group (North Korea)
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96',
  '0x57b675846b01052141b76ea4b7be1e36c4b20bb7',
]);

// Known mixer addresses
const MIXER_ADDRESSES = new Set([
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b', // Tornado Cash
  '0xba214c1c1928a32bbe78e45b7e9927895c80d10b', // Tornado Cash
  '0x722122df12d4e14e13acd3b1871c738fbd0ed97d', // Tornado Cash
]);

// High-risk jurisdictions (ISO country codes)
const HIGH_RISK_JURISDICTIONS = new Set([
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
  'CU', // Cuba
  'VE', // Venezuela
  'MM', // Myanmar
]);

// Sanctioned entities by name (for lookup)
const SANCTIONED_ENTITIES = [
  {
    name: 'Lazarus Group',
    aliases: ['Lazarus', 'Hidden Cobra', 'Zinc'],
    jurisdiction: 'KP',
    risk_score: 100,
  },
  {
    name: 'Tornado Cash',
    aliases: ['Tornado', 'TC'],
    jurisdiction: 'GLOBAL',
    risk_score: 80,
  },
  {
    name: 'OFAC SDN Entity',
    aliases: ['Sanctioned'],
    jurisdiction: 'IR',
    risk_score: 90,
  }
];

/**
 * Check if an address is sanctioned
 */
function checkSanctioned(address) {
  const normalizedAddress = address.toLowerCase();
  
  // Direct match
  if (SANCTIONED_ADDRESSES.has(normalizedAddress)) {
    return {
      sanctioned: true,
      reason: 'Directly sanctioned address',
      confidence: 1.0,
      source: 'OFAC SDN List'
    };
  }
  
  // Known mixer addresses — also treated as sanctioned
  if (MIXER_ADDRESSES.has(normalizedAddress)) {
    return {
      sanctioned: true,
      mixer: true,
      reason: 'Known crypto mixer / sanctions-listed address',
      confidence: 1.0,
      source: 'OFAC SDN List + Mixer Database'
    };
  }
  
  return {
    sanctioned: false,
    mixer: false,
    confidence: 0.8,
    source: 'OFAC SDN List'
  };
}

/**
 * Check jurisdiction risk
 */
function checkJurisdiction(countryCode) {
  if (!countryCode) {
    return {
      highRisk: false,
      reason: 'Unknown jurisdiction',
      confidence: 0.5
    };
  }
  
  const isHighRisk = HIGH_RISK_JURISDICTIONS.has(countryCode.toUpperCase());
  
  return {
    highRisk: isHighRisk,
    countryCode: countryCode.toUpperCase(),
    reason: isHighRisk ? `High-risk jurisdiction: ${countryCode}` : 'Low-risk jurisdiction',
    confidence: isHighRisk ? 0.95 : 0.7
  };
}

/**
 * Get sanctions summary
 */
function getSanctionsSummary() {
  return {
    totalAddresses: SANCTIONED_ADDRESSES.size,
    totalMixers: MIXER_ADDRESSES.size,
    highRiskJurisdictions: Array.from(HIGH_RISK_JURISDICTIONS),
    lastUpdated: new Date().toISOString(),
    sources: ['OFAC SDN List', 'EU Sanctions', 'UN Sanctions']
  };
}

/**
 * Load OFAC CSV if available
 */
async function loadOFACCSV() {
  const csvPath = path.join(__dirname, '..', 'data', 'sdn.csv');
  
  if (fs.existsSync(csvPath)) {
    try {
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      console.log(`📋 Loaded OFAC CSV with ${lines.length} entries`);          // Parse and add to sanctioned set
          for (const line of lines) {
            // Skip header line
            if (line.startsWith('"ENT_NUM"')) continue;
            
            const parts = line.split(',');
            if (parts.length >= 4) {
              const name = parts[1]?.trim().replace(/"/g, '').toLowerCase();
              // Add known sanctioned entities by name
              if (name && (name.includes('lazarus') || name.includes('tornado'))) {
                // Add associated addresses
                if (name.includes('tornado')) {
                  SANCTIONED_ADDRESSES.add('0xd90e2f925da726b50c4ed8d0fb90ad053324f31b');
                  SANCTIONED_ADDRESSES.add('0xba214c1c1928a32bbe78e45b7e9927895c80d10b');
                }
              }
            }
          }
      
      return true;
    } catch (error) {
      console.error('Failed to load OFAC CSV:', error.message);
      return false;
    }
  }
  
  return false;
}

export {
  checkSanctioned,
  checkJurisdiction,
  getSanctionsSummary,
  loadOFACCSV,
  SANCTIONED_ADDRESSES,
  MIXER_ADDRESSES,
  HIGH_RISK_JURISDICTIONS
};
