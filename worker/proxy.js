/**
 * DesignSprint — Cloudflare Worker API Proxy
 *
 * セキュリティ:
 *   - APIキーはWorker環境変数に格納（ブラウザに露出しない）
 *   - CORS: 許可オリジンのみ
 *   - IPハッシュ化レート制限（KV）
 *   - プロンプト長制限
 *
 * 環境変数（secrets）:
 *   GROQ_API_KEY — Groq API キー
 *
 * 環境変数（vars）:
 *   ALLOWED_ORIGINS — カンマ区切りの許可オリジン
 *
 * KV Namespace:
 *   RATE_LIMIT — レート制限カウンター
 */

// ── 定数 ──────────────────────────────────
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const DAILY_LIMIT = 35;          // 5チャレンジ × 7コール
const MAX_PROMPT_LENGTH = 20000; // 文字

// ── メインハンドラ ────────────────────────
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = isAllowedOrigin(origin, env);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return allowed
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : new Response(null, { status: 403 });
    }

    // POST のみ
    if (request.method !== 'POST') {
      return error('Method not allowed', 405, origin);
    }

    // オリジンチェック（本番はブロック）
    if (!allowed) {
      return error('Origin not allowed', 403, origin);
    }

    try {
      const body = await request.json();
      const { prompt, maxTokens = 4096, temperature = 0.7 } = body;

      // ── 入力バリデーション ──
      if (!prompt || typeof prompt !== 'string' || prompt.length < 10) {
        return error('Invalid prompt', 400, origin);
      }
      if (prompt.length > MAX_PROMPT_LENGTH) {
        return error('Prompt too long', 400, origin);
      }

      // ── レート制限 ──
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const ipHash = fnv1a(ip);
      const rl = await rateCheck(env, ipHash);

      if (!rl.ok) {
        return json({
          error: '本日のフリー枠を使い切りました。明日またお試しください！',
          remaining: 0, limit: DAILY_LIMIT,
        }, 429, origin);
      }

      // ── APIキー確認 ──
      if (!env.GROQ_API_KEY) {
        console.error('GROQ_API_KEY not configured');
        return error('Server config error', 500, origin);
      }

      // ── Groq API 呼び出し ──
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: Math.min(maxTokens, 8192),
          temperature: clamp(temperature, 0, 2),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `API Error: ${res.status}`;
        console.error(`[Groq] ${res.status}: ${msg}`);

        if (res.status === 429) {
          return json({
            error: 'AIサーバーが混雑しています。しばらくお待ちください。',
          }, 503, origin);
        }
        return error(msg, res.status, origin);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';

      if (!text) {
        return error('Empty response from AI', 502, origin);
      }

      // ── 成功 → カウント更新 ──
      await rateIncrement(env, ipHash);
      const remaining = DAILY_LIMIT - (rl.count + 1);

      return json({ text, remaining: Math.max(0, remaining), limit: DAILY_LIMIT }, 200, origin);

    } catch (err) {
      console.error(`[Error] ${err.message}`);
      return error('Internal server error', 500, origin);
    }
  },
};

// ── CORS ──────────────────────────────────
function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  // 環境変数から許可リストを取得
  const list = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  // ローカル開発は常に許可
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }
  return list.includes(origin);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ── レスポンスヘルパー ────────────────────
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function error(msg, status, origin) {
  return json({ error: msg }, status, origin);
}

function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

// ── レート制限（KV） ─────────────────────
async function rateCheck(env, ipHash) {
  if (!env.RATE_LIMIT) return { ok: true, count: 0 };
  const key = `rl:${today()}:${ipHash}`;
  try {
    const count = parseInt(await env.RATE_LIMIT.get(key) || '0', 10);
    return { ok: count < DAILY_LIMIT, count };
  } catch {
    return { ok: true, count: 0 }; // KV障害時はパス
  }
}

async function rateIncrement(env, ipHash) {
  if (!env.RATE_LIMIT) return;
  const key = `rl:${today()}:${ipHash}`;
  try {
    const count = parseInt(await env.RATE_LIMIT.get(key) || '0', 10);
    await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 172800 }); // 48h自動削除
  } catch { /* KVエラーは無視 — 可用性優先 */ }
}

function today() { return new Date().toISOString().slice(0, 10); }

// ── IPハッシュ（FNV-1a 32bit — 生IP非保存） ──
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
