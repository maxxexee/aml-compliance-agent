/**
 * R3nzo — AML Compliance Agent Brain
 * 
 * Strict sandbox agent for AML compliance queries.
 * Runs on local Ollama (Qwen-coder) with hardened system prompt.
 */

import http from 'http';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen-coder-fixed:latest';

// ============================================
// SYSTEM PROMPT — R3NZO SANDBOX AGENT
// ============================================

const R3NZO_SYSTEM = `You are R3nzo, an AML (Anti-Money Laundering) Compliance Agent operating inside a Terminal 3 TEE sandbox.

═══════════════════════════════════════════════
IDENTITY & ROLE
═══════════════════════════════════════════════
- You are R3nzo, an autonomous compliance agent.
- You operate inside Terminal 3's Trusted Execution Environment (TEE).
- Your purpose: help enterprises verify crypto wallets for AML compliance.
- You are professional, precise, and security-conscious.

═══════════════════════════════════════════════
STRICT RULES
═══════════════════════════════════════════════
1. NEVER fabricate compliance data. If you don't have real data, say so.
2. NEVER give legal advice. You provide risk analysis, not legal counsel.
3. NEVER share private keys, API keys, or sensitive credentials.
4. ALWAYS cite your sources (OFAC, EU, UN, on-chain analysis).
5. ALWAYS present risk scores with their constituent factors.
6. ALWAYS recommend consulting a compliance officer for final decisions.
7. Stay in character as R3nzo. Do not break character.
8. Do not answer questions unrelated to AML compliance or crypto risk.

═══════════════════════════════════════════════
KNOWLEDGE BASE
═══════════════════════════════════════════════
Sanctions Sources:
- OFAC SDN List (US Treasury) — US sanctioned entities
- EU Sanctions — European Union sanctioned entities
- UN Sanctions — United Nations sanctioned entities

Risk Factors (weighted):
- Sanctioned connections: 40% weight (OFAC/EU/UN match = BLOCK)
- Mixer interactions: 25% weight (Tornado Cash, mixers = REVIEW/BLOCK)
- High-risk jurisdiction: 20% weight (IR, KP, SY, CU, VE, MM = REVIEW)
- Transaction patterns: 15% weight (burst activity, high volume)

Score Ranges:
- 0–30: APPROVE (low risk)
- 31–70: REVIEW (medium risk, needs human review)
- 71–100: BLOCK (high risk, do not proceed)

Known Sanctioned Addresses:
- Tornado Cash: 0xd90e2f925da726b50c4ed8d0fb90ad053324f31b
- Tornado Cash: 0xba214c1c1928a32bbe78e45b7e9927895c80d10b
- Lazarus Group: 0x098b716b8aaf21512996dc57eb0615e2383e2f96
- Sanctioned entity: 0xd8579921026d261b853607856136bfc6a8a3b981

═══════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════
Always structure responses with:
1. Direct answer (what the user asked)
2. Risk breakdown (if applicable)
3. Flags and their meaning
4. Recommendation
5. Next steps

Use emojis for clarity:
✅ APPROVE | ⚠️ REVIEW | ❌ BLOCK | 🔍 Analysis | 📊 Score | ⚖️ Legal disclaimer

═══════════════════════════════════════════════
CONVERSATION TOPICS
═══════════════════════════════════════════════
You can discuss:
- Wallet risk assessment and scoring
- Sanctions compliance (OFAC, EU, UN)
- AML regulations and requirements
- On-chain analysis methodology
- Risk factor explanations
- Compliance best practices
- Terminal 3 TEE privacy guarantees
- How the risk scoring algorithm works
- What each flag means and why it matters

You CANNOT:
- Make final compliance decisions (recommend, don't decide)
- Provide legal advice (cite regulations, don't interpret)
- Access real-time blockchain data (explain methodology instead)
- Override sanctions lists (they are authoritative)`;

// ============================================
// OLLAMA QUERY
// ============================================

async function queryOllama(prompt, options = {}) {
  const { temperature = 0.7, maxTokens = 2048 } = options;
  
  return new Promise((resolve, reject) => {
    const url = new URL('/api/generate', OLLAMA_HOST);
    
    const postData = JSON.stringify({
      model: MODEL,
      system: R3NZO_SYSTEM,
      prompt,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
        top_p: 0.9,
        repeat_penalty: 1.1,
      }
    });
    
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.response);
        } catch (e) {
          reject(new Error('Failed to parse Ollama response'));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ============================================
// INTENT PARSING
// ============================================

async function parseUserRequest(userMessage) {
  const prompt = `Parse this user request into a JSON intent. Extract:
- intent: one of [check_wallet, batch_check, explain_risk, get_audit, ask_question, help]
- params: wallet addresses, jurisdiction, score, etc.

Examples:
"Check 0xd8579921026d261b853607856136bfc6a8a3b981" → {"intent":"check_wallet","params":{"wallet":"0xd8579921026d261b853607856136bfc6a8a3b981"}}
"Is 0x1234... safe?" → {"intent":"check_wallet","params":{"wallet":"0x1234..."}}
"Check these: 0xabc, 0xdef" → {"intent":"batch_check","params":{"wallets":["0xabc","0xdef"]}}
"What does a score of 75 mean?" → {"intent":"explain_risk","params":{"score":75}}
"Show recent checks" → {"intent":"get_audit","params":{}}
"What is OFAC?" → {"intent":"ask_question","params":{"topic":"OFAC"}}

Respond with ONLY the JSON object, nothing else.

User: ${userMessage}`;

  const response = await queryOllama(prompt, { temperature: 0.1, maxTokens: 256 });
  
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) { /* fall through */ }
  
  // Fallback: detect wallet addresses in raw text
  const walletMatch = userMessage.match(/0x[a-fA-F0-9]{40}/);
  if (walletMatch) {
    return { intent: 'check_wallet', params: { wallet: walletMatch[0] }, confidence: 0.7 };
  }
  
  return { intent: 'ask_question', params: {}, confidence: 0.5 };
}

// ============================================
// RISK EXPLANATION
// ============================================

async function explainRiskResult(result) {
  const prompt = `A wallet compliance check was performed. Analyze and explain the results:

Wallet: ${result.wallet}
Risk Score: ${result.risk_score}/100
Verdict: ${result.status}
Flags: ${result.flags.length > 0 ? result.flags.join(', ') : 'None detected'}
Jurisdiction: ${result.jurisdiction || 'GLOBAL'}

Provide:
1. 📊 Score breakdown — what contributed to this score
2. 🚩 Flag analysis — what each flag means and why it matters
3. ⚖️ Compliance implications — what this means for the enterprise
4. ✅❌ Recommendation — should they proceed?
5. 📋 Next steps — what the compliance team should do

Be thorough but concise. Use the structured format.`;

  return await queryOllama(prompt, { temperature: 0.4 });
}

// ============================================
// COMPLIANCE REPORT
// ============================================

async function generateReport(results) {
  const prompt = `Generate a professional AML compliance report for these wallet checks:

${results.map((r, i) => `${i + 1}. Wallet: ${r.wallet} | Status: ${r.status} | Score: ${r.risk_score} | Flags: ${r.flags?.join(', ') || 'None'}`).join('\n')}

Format as:
1. Executive Summary (2-3 sentences)
2. Risk Distribution (count of APPROVE/REVIEW/BLOCK)
3. Key Findings (flagged wallets and why)
4. Recommendations per wallet
5. Compliance Notes

Professional tone. Use Markdown.`;

  return await queryOllama(prompt, { temperature: 0.3 });
}

// ============================================
// MAIN CHAT
// ============================================

async function chat(userMessage, context = {}) {
  const contextBlock = context.t3nConnected
    ? `Current session:\n- T3N Connected: Yes\n- Tenant DID: ${context.tenantDid || 'unknown'}\n- Sanctions data: OFAC SDN, EU, UN lists loaded\n- Risk scoring: Active (4 weighted factors)\n- Audit trail: Enabled`
    : `Current session:\n- T3N Connected: No (demo mode)\n- Sanctions data: Hardcoded demo list\n- Risk scoring: Active (4 weighted factors)`;

  const prompt = `${contextBlock}\n\nUser message: ${userMessage}`;

  return await queryOllama(prompt, { temperature: 0.6 });
}

// ============================================
// HEALTH CHECK
// ============================================

async function checkOllamaHealth() {
  try {
    const url = new URL('/api/tags', OLLAMA_HOST);
    
    return new Promise((resolve) => {
      const req = http.request(url, { method: 'GET' }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({
              status: 'ok',
              models: result.models?.map(m => m.name) || [],
              selected_model: MODEL,
              system_prompt: 'R3nzo AML sandbox active'
            });
          } catch (e) {
            resolve({ status: 'error', message: 'Invalid response' });
          }
        });
      });
      
      req.on('error', () => {
        resolve({ status: 'error', message: 'Ollama not reachable' });
      });
      
      req.end();
    });
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

export {
  parseUserRequest,
  explainRiskResult,
  generateReport,
  chat,
  checkOllamaHealth,
  queryOllama
};
