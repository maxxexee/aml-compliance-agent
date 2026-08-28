/**
 * AML Compliance Agent - API Server
 * 
 * REST API for wallet compliance checking
 * Uses Terminal 3 TEE for secure processing
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initT3N, runComplianceCheck, getStatus } from '../t3n-contracts/compliance.js';
import { parseUserRequest, explainRiskResult, generateReport, chat, checkOllamaHealth } from './agent.js';
import { checkSanctioned, getSanctionsSummary } from './sanctions-real.js';

// Wrapper for jurisdiction check
function checkJurisdiction(jurisdiction) {
  const highRisk = ['IR', 'KP', 'SY', 'CU', 'VE', 'MM', 'RU', 'BY'];
  return { highRisk: highRisk.includes(jurisdiction) };
}
import { analyzeWallet, quickRiskAssessment } from './onchain-real.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Serve the web dashboard
app.use(express.static(path.join(__dirname, '..', 'web', 'pages')));

const PORT = process.env.PORT || 3001;
const T3N_API_KEY = process.env.T3N_API_KEY;

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  const status = getStatus();
  res.json({
    status: 'ok',
    service: 'AML Compliance Agent',
    t3n_connected: status.connected,
    tenant_did: status.tenant_did,
  });
});

// ============================================
// WALLET COMPLIANCE CHECK
// ============================================

app.post('/api/check-wallet', async (req, res) => {
  try {
    const { wallet, check_type = 'aml', jurisdiction = 'GLOBAL' } = req.body;
    
    // Validate input
    if (!wallet) {
      return res.status(400).json({
        error: 'wallet address is required',
        example: { wallet: '0x1234...abcd', check_type: 'aml' }
      });
    }
    
    // Validate wallet format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return res.status(400).json({
        error: 'Invalid wallet address format',
        expected: '0x followed by 40 hex characters'
      });
    }
    
    console.log(`🔍 Checking wallet: ${wallet}`);
    
    // Get transaction data (simulated for demo)
    const txData = await getTransactionData(wallet);
    
    // Run compliance check in TEE
    const result = await runComplianceCheck(wallet, txData);
    
    // Determine verdict
    let status;
    if (result.risk_score >= 70) {
      status = 'BLOCK';
    } else if (result.risk_score >= 30) {
      status = 'REVIEW';
    } else {
      status = 'APPROVE';
    }
    
    console.log(`✅ Check complete: ${status} (score: ${result.risk_score})`);
    
    // Add to audit log
    addToAuditLog({
      wallet,
      status,
      risk_score: result.risk_score,
      flags: result.flags,
      jurisdiction
    });
    
    res.json({
      status,
      wallet,
      risk_score: result.risk_score,
      flags: result.flags,
      audit_id: result.audit_id,
      jurisdiction,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('❌ Check failed:', error);
    res.status(500).json({
      error: error.message || 'Compliance check failed',
      hint: 'Ensure T3N_API_KEY is set and Terminal 3 is accessible'
    });
  }
});

// ============================================
// BATCH CHECK
// ============================================

app.post('/api/check-batch', async (req, res) => {
  try {
    const { wallets } = req.body;
    
    if (!wallets || !Array.isArray(wallets)) {
      return res.status(400).json({
        error: 'wallets array is required',
        example: { wallets: ['0x1234...', '0xabcd...'] }
      });
    }
    
    console.log(`🔍 Batch checking ${wallets.length} wallets...`);
    
    const results = [];
    for (const wallet of wallets) {
      const txData = await getTransactionData(wallet);
      const result = await runComplianceCheck(wallet, txData);
      
      let status;
      if (result.risk_score >= 70) {
        status = 'BLOCK';
      } else if (result.risk_score >= 30) {
        status = 'REVIEW';
      } else {
        status = 'APPROVE';
      }
      
      results.push({
        wallet,
        status,
        risk_score: result.risk_score,
        flags: result.flags,
      });
    }
    
    console.log(`✅ Batch complete: ${results.length} wallets checked`);
    
    res.json({
      total: results.length,
      approved: results.filter(r => r.status === 'APPROVE').length,
      review: results.filter(r => r.status === 'REVIEW').length,
      blocked: results.filter(r => r.status === 'BLOCK').length,
      results,
    });
    
  } catch (error) {
    console.error('❌ Batch check failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NATURAL LANGUAGE CHAT
// ============================================

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    
    console.log(`💬 Chat: ${message}`);
    
    // Parse user intent
    const parsed = await parseUserRequest(message);
    console.log(`🧠 Intent: ${parsed.intent} (confidence: ${parsed.confidence})`);
    
    // Handle different intents
    let response;
    
    switch (parsed.intent) {
      case 'check_wallet':
        if (parsed.params.wallet) {
          // Check the wallet
          const txData = await getTransactionData(parsed.params.wallet);
          const result = await runComplianceCheck(parsed.params.wallet, txData);
          
          let status;
          if (result.risk_score >= 70) status = 'BLOCK';
          else if (result.risk_score >= 30) status = 'REVIEW';
          else status = 'APPROVE';
          
          const fullResult = { ...result, wallet: parsed.params.wallet, status, jurisdiction: parsed.params.jurisdiction || 'GLOBAL' };
          
          // Generate natural language explanation
          const explanation = await explainRiskResult(fullResult);
          
          response = {
            type: 'wallet_check',
            result: fullResult,
            explanation
          };
        } else {
          response = {
            type: 'error',
            message: 'Please provide a wallet address to check'
          };
        }
        break;
        
      case 'batch_check':
        if (parsed.params.wallets && parsed.params.wallets.length > 0) {
          const results = [];
          for (const wallet of parsed.params.wallets) {
            const txData = await getTransactionData(wallet);
            const result = await runComplianceCheck(wallet, txData);
            let status;
            if (result.risk_score >= 70) status = 'BLOCK';
            else if (result.risk_score >= 30) status = 'REVIEW';
            else status = 'APPROVE';
            results.push({ ...result, wallet, status });
          }
          
          const report = await generateReport(results);
          
          response = {
            type: 'batch_check',
            results,
            report
          };
        } else {
          response = {
            type: 'error',
            message: 'Please provide wallet addresses to check'
          };
        }
        break;
        
      case 'explain_risk':
        const explanation = await chat(`Explain what a risk score of ${parsed.params.score || 'unknown'} means in AML compliance`, {
          t3nConnected: getStatus().connected,
          tenantDid: getStatus().tenant_did
        });
        response = { type: 'explanation', explanation };
        break;
        
      case 'get_audit':
        response = {
          type: 'audit',
          entries: auditLog.slice(-10),
          message: 'Here are your recent compliance checks'
        };
        break;
        
      default:
        // General chat
        const chatResponse = await chat(message, {
          t3nConnected: getStatus().connected,
          tenantDid: getStatus().tenant_did
        });
        response = { type: 'chat', message: chatResponse };
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Chat failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AGENT HEALTH
// ============================================

app.get('/api/agent/health', async (req, res) => {
  const ollamaHealth = await checkOllamaHealth();
  const t3nStatus = getStatus();
  
  res.json({
    agent: 'R3nzo',
    ollama: ollamaHealth,
    t3n: t3nStatus,
    status: ollamaHealth.status === 'ok' && t3nStatus.connected ? 'ready' : 'partial'
  });
});

// ============================================
// SANCTIONS LIST
// ============================================

app.get('/api/sanctions', (req, res) => {
  const summary = getSanctionsSummary();
  res.json(summary);
});

// ============================================
// AUDIT LOG
// ============================================

const auditLog = [];

app.get('/api/audit', (req, res) => {
  res.json({
    total: auditLog.length,
    entries: auditLog.slice(-50) // Last 50 entries
  });
});

// Add to audit log after each check
function addToAuditLog(entry) {
  auditLog.push({
    ...entry,
    timestamp: new Date().toISOString()
  });
  // Keep only last 1000 entries
  if (auditLog.length > 1000) {
    auditLog.splice(0, auditLog.length - 1000);
  }
}

// ============================================
// HELPERS
// ============================================

async function getTransactionData(wallet) {
  console.log(`🔍 Fetching on-chain data for: ${wallet}`);
  
  // Get real on-chain analysis from Ethereum RPC
  const analysis = await analyzeWallet(wallet);
  
  // Check sanctions against real OFAC list
  const sanctionsCheck = checkSanctioned(wallet);
  
  // Combine into format compliance engine expects
  return {
    wallet,
    balance: analysis?.on_chain?.balance_ether || 0,
    volume: 0,
    interactions: [],
    jurisdiction: 'GLOBAL',
    first_seen: '2024-01-01',
    last_activity: new Date().toISOString(),
    sanctions: sanctionsCheck ? { sanctioned: true, entity: sanctionsCheck } : { sanctioned: false },
    jurisdictionRisk: { highRisk: false },
    patterns: {
      totalVolume: 0,
      riskFactors: analysis?.flags || [],
      patterns_found: analysis?.on_chain?.patterns_found || [],
    },
    transactionCount: analysis?.on_chain?.transaction_count || 0,
    riskFactors: analysis?.flags || [],
    on_chain_data: analysis?.on_chain,
  };
}

// ============================================
// START SERVER
// ============================================

async function start() {
  // Initialize Terminal 3
  if (T3N_API_KEY) {
    try {
      await initT3N(T3N_API_KEY);
    } catch (error) {
      console.warn('⚠️  T3N initialization failed:', error.message);
      console.warn('   Running in demo mode without TEE');
    }
  } else {
    console.warn('⚠️  No T3N_API_KEY set. Running in demo mode.');
  }
  
  app.listen(PORT, () => {
    console.log(`
🚀 AML Compliance Agent API running on port ${PORT}

📡 API Endpoints:
   POST /api/check-wallet  - Check single wallet
   POST /api/check-batch   - Check multiple wallets
   GET  /api/sanctions     - Get sanctions list info
   GET  /api/audit         - Get audit log
   GET  /api/health        - Health check

💡 Quick Test:
   curl http://localhost:${PORT}/api/health
   curl -X POST http://localhost:${PORT}/api/check-wallet \\
     -H "Content-Type: application/json" \\
     -d '{"wallet": "0x1234567890abcdef1234567890abcdef12345678"}'
`);
  });
}

start().catch(console.error);
