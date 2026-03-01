/**
 * DesignSprint — AI API クライアント
 *
 * ルーティング:
 *   1. Worker経由（本番デフォルト）— ユーザーはAPIキー不要
 *   2. BYOK Groq — 無料・高速・確実に動く（ローカルテスト推奨）
 *   3. BYOK Gemini — Google AI Studio キー
 *
 * すべて REST API 直接呼び出し。SDK 依存ゼロ。
 */

import { CONFIG } from './config.js';
import * as Storage from './storage.js';

/**
 * AI にテキスト生成リクエストを送る
 * @param {string} prompt - プロンプト文字列
 * @param {object} options
 * @param {number} [options.maxTokens] - 最大出力トークン数
 * @param {number} [options.temperature] - 温度 (0-2)
 * @returns {Promise<{text: string, remaining?: number}>}
 */
export async function generateText(prompt, options = {}) {
  const mode = Storage.getMode();
  const apiKey = Storage.getApiKey();
  const provider = Storage.getProvider();

  const maxTokens = options.maxTokens || 8192;
  const temperature = options.temperature ?? 0.8;

  // ルート1: BYOK モード
  if (mode === 'byok' && apiKey) {
    if (provider === 'groq') {
      const text = await callGroqDirect(prompt, { maxTokens, temperature, apiKey });
      return { text };
    }
    // Gemini
    const text = await callGeminiDirect(prompt, {
      model: CONFIG.GEMINI_MODEL, maxTokens, temperature, apiKey,
    });
    return { text };
  }

  // ルート2: Worker proxy 経由（本番 — APIキー不要、内部でGroq使用）
  if (CONFIG.WORKER_URL) {
    return callWorkerProxy(prompt, { maxTokens, temperature });
  }

  // ルート3: Worker 未設定 + キーあり（フォールバック）
  if (apiKey) {
    if (provider === 'groq') {
      const text = await callGroqDirect(prompt, { maxTokens, temperature, apiKey });
      return { text };
    }
    const text = await callGeminiDirect(prompt, {
      model: CONFIG.GEMINI_MODEL, maxTokens, temperature, apiKey,
    });
    return { text };
  }

  throw new Error(
    'AIに接続できません。\n' +
    'ページ下部の「上級者向け」からAPIキーを設定してください。'
  );
}

// ===========================
// Groq REST API（OpenAI互換）
// ===========================
async function callGroqDirect(prompt, { maxTokens, temperature, apiKey }) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const body = {
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Groq API Error: ${res.status}`;
    console.error('[Groq API Error]', res.status, JSON.stringify(err));
    throw new Error(msg);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('AIからの応答が空でした。');
  return text;
}

// ===========================
// Gemini REST API（BYOK 直接呼び出し）
// ===========================
async function callGeminiDirect(prompt, { model, maxTokens, temperature, apiKey }) {
  const url = `${CONFIG.GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Gemini API Error: ${res.status}`;
    console.error('[Gemini API Error]', res.status, JSON.stringify(err));

    if (res.status === 429) {
      throw new Error(
        'Gemini API クォータエラー: ' + msg +
        '\n\n→ Groq（無料）に切り替えると即動作します。' +
        '\n　トップページの設定から切り替えてください。'
      );
    }
    throw new Error(msg);
  }

  const data = await res.json();
  return extractGeminiText(data);
}

// ===========================
// Cloudflare Worker proxy（本番 Free モード — Worker内部でGroq呼出）
// ===========================
async function callWorkerProxy(prompt, { maxTokens, temperature }) {
  const res = await fetch(CONFIG.WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, maxTokens, temperature }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        data?.error || '本日のフリー枠を使い切りました。明日またお試しください！'
      );
    }
    if (res.status === 503) {
      throw new Error(
        data?.error || 'AIサーバーが混雑しています。しばらく待ってからお試しください。'
      );
    }
    throw new Error(data?.error || `Worker Error: ${res.status}`);
  }

  return {
    text: data.text || '',
    remaining: data.remaining,
    limit: data.limit,
  };
}

// ===========================
// レスポンス解析
// ===========================
function extractGeminiText(data) {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    throw new Error('AIからの応答が空でした。もう一度お試しください。');
  }
  if (candidate.finishReason === 'SAFETY') {
    throw new Error('安全性フィルターにブロックされました。指示を変えてもう一度お試しください。');
  }
  const parts = candidate.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error('AIからの応答が空でした。');
  }
  return parts.map(p => p.text || '').join('');
}

// ===========================
// APIキーテスト
// ===========================

/**
 * APIキーの有効性を簡易テスト
 * @param {string} apiKey
 * @param {string} provider - 'gemini' | 'groq'
 * @returns {Promise<boolean>}
 */
export async function testApiKey(apiKey, provider = 'gemini') {
  try {
    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Hi. Reply "OK".' }],
          max_tokens: 8,
        }),
      });
      return res.ok;
    }

    // Gemini
    const url = `${CONFIG.GEMINI_BASE_URL}/${CONFIG.GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with just "OK".' }] }],
        generationConfig: { maxOutputTokens: 16 },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
