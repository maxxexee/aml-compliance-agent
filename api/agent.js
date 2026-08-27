/**
 * R3nzo Agent Brain - Qwen via Ollama
 * 
 * Handles natural language understanding and orchestration
 * Connects to local Ollama instance running Qwen model
 */

import http from 'http';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';

/**
 * Send prompt to Ollama and get response
 */
async function queryOllama(prompt, options = {}) {
  const { temperature = 0.7, maxTokens = 1024 } = options;
  
  return new Promise((resolve, reject) => {
    const url = new URL('/api/generate', OLLAMA_HOST);
    
    const postData = JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
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

/**
 * Parse user request and extract intent + parameters
 */
async function parseUserRequest(userMessage) {
  const systemPrompt = `You are R3nzo, an AML compliance agent. Parse the user's request and extract:
1. Intent: check_wallet, batch_check, explain_risk, get_audit, help
2. Parameters: wallet addresses, jurisdiction, etc.

Respond in JSON format:
{
  "intent": "check_wallet",
  "params": {
    "wallet": "0x...",
    "jurisdiction": "US"
  },
  "confidence": 0.95
}

Examples:
- "Check if 0x1234... is safe" → {"intent": "check_wallet", "params": {"wallet": "0x1234..."}}
- "Check these wallets: 0xabc, 0xdef" → {"intent": "batch_check", "params": {"wallets": ["0xabc", "0xdef"]}}
- "What does a risk score of 75 mean?" → {"intent": "explain_risk", "params": {"score": 75}}
- "Show me recent checks" → {"intent": "get_audit"}

User message: ${userMessage}`;

  const response = await queryOllama(systemPrompt, { temperature: 0.3 });
  
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // If parsing fails, return default
  }
  
  return {
    intent: 'help',
    params: {},
    confidence: 0.5
  };
}

/**
 * Generate natural language explanation of risk assessment
 */
async function explainRiskResult(result) {
  const prompt = `You are R3nzo, an AML compliance agent. Explain this risk assessment in plain English:

Wallet: ${result.wallet}
Risk Score: ${result.risk_score}/100
Status: ${result.status}
Flags: ${result.flags.join(', ') || 'None'}
Jurisdiction: ${result.jurisdiction}

Provide:
1. A clear summary (1-2 sentences)
2. What the flags mean
3. Recommendation for the compliance team
4. Any next steps

Keep it professional but friendly. Use emojis for visual clarity.`;

  return await queryOllama(prompt, { temperature: 0.5 });
}

/**
 * Generate compliance report
 */
async function generateReport(results) {
  const prompt = `You are R3nzo, an AML compliance agent. Generate a compliance report for these wallet checks:

${results.map((r, i) => `
${i + 1}. Wallet: ${r.wallet}
   Status: ${r.status}
   Risk Score: ${r.risk_score}
   Flags: ${r.flags.join(', ') || 'None'}
`).join('\n')}

Create a professional report with:
1. Executive summary
2. Risk distribution (how many APPROVE/REVIEW/BLOCK)
3. Key findings
4. Recommendations
5. Compliance notes

Format in Markdown.`;

  return await queryOllama(prompt, { temperature: 0.4 });
}

/**
 * Chat with R3nzo
 */
async function chat(userMessage, context = {}) {
  const systemPrompt = `You are R3nzo, an AML compliance agent built on Terminal 3 TEE.

Your capabilities:
- Check wallet addresses for sanctions and risk
- Explain risk scores and compliance requirements
- Generate compliance reports
- Answer questions about AML regulations

Current context:
- Connected to Terminal 3 TEE: ${context.t3nConnected ? 'Yes' : 'No'}
- Tenant DID: ${context.tenantDid || 'Not connected'}

User message: ${userMessage}

Respond as R3nzo. Be helpful, professional, and use emojis for visual clarity. Keep responses concise but informative.`;

  return await queryOllama(systemPrompt, { temperature: 0.7 });
}

/**
 * Check if Ollama is running
 */
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
              selected_model: MODEL
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
