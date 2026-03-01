/**
 * DesignSprint — 別解（オルタナティブ）生成モジュール
 *
 * 提出されたデザインに対して、異なるアプローチの別解を2つ生成。
 * 結果画面で比較表示する。
 */

import { generateText } from './api-client.js';
import { CONFIG } from './config.js';

const ALT_TEMPLATE = `あなたはシニアUIデザイナーです。同じお題に対して、提出されたデザインとは異なるアプローチで2つの別解を提案してください。

## お題情報

**タイトル:** {{TITLE}}
**ユーザーシナリオ:** {{PERSONA}}
**設計ゴール:** {{GOAL}}
**フォーカス原則:** {{PRINCIPLE}}

## 提出されたデザイン（HTML）

\`\`\`html
{{SUBMITTED_HTML}}
\`\`\`

## 指示

同じお題・同じ制約に対して、**まったく異なるレイアウト戦略** で2つの別解を生成。
- 別解 A: 別のレイアウトアプローチ（例: カード型→リスト型）
- 別解 B: 別のUXアプローチ（例: 検索優先→レコメンド優先）
- 各別解のHTMLは340px幅、日本語、外部リソース不使用、完全なHTML

以下のJSON形式のみを出力。説明文やマークダウンは不要。

{
  "altA": {
    "label": "短いラベル",
    "rationale": "設計意図（2-3文）",
    "strengths": ["強み1", "強み2"],
    "html": "<!DOCTYPE html>...完全HTML..."
  },
  "altB": {
    "label": "短いラベル",
    "rationale": "設計意図（2-3文）",
    "strengths": ["強み1", "強み2"],
    "html": "<!DOCTYPE html>...完全HTML..."
  },
  "comparison": [
    {"aspect": "比較観点", "mine": "提出の特徴", "altA": "A の特徴", "altB": "B の特徴"},
    {"aspect": "比較観点", "mine": "提出の特徴", "altA": "A の特徴", "altB": "B の特徴"},
    {"aspect": "比較観点", "mine": "提出の強み", "altA": "A の強み", "altB": "B の強み"}
  ]
}

JSONのみ出力。バッククォートで囲まない。`;

/**
 * 別解を生成
 * @param {object} challenge - チャレンジデータ
 * @param {string} submittedHTML - 提出されたHTML
 * @returns {Promise<object>} { altA, altB, comparison }
 */
export async function generateAlternatives(challenge, submittedHTML) {
  const prompt = buildAltPrompt(challenge, submittedHTML);

  const result = await generateText(prompt, {
    maxTokens: 12288,
    temperature: 0.9, // 創造性高め
  });

  return parseAltJSON(result.text);
}

/**
 * プロンプト組み立て
 */
function buildAltPrompt(challenge, submittedHTML) {
  // HTMLが長い場合はトリム
  const trimmedHTML = submittedHTML.length > 5000
    ? submittedHTML.slice(0, 5000) + '\n<!-- ... 省略 ... -->'
    : submittedHTML;

  let prompt = ALT_TEMPLATE;
  prompt = prompt.replace('{{TITLE}}', challenge.title);
  prompt = prompt.replace('{{PERSONA}}', challenge.persona);
  prompt = prompt.replace('{{GOAL}}', challenge.goal);
  prompt = prompt.replace('{{PRINCIPLE}}', challenge.principle);
  prompt = prompt.replace('{{SUBMITTED_HTML}}', trimmedHTML);

  return prompt;
}

/**
 * 別解JSONを解析
 */
function parseAltJSON(raw) {
  // ```json ... ``` ブロックを抽出
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : raw;

  // JSON部分を抽出
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('Alt JSON parse failed. Raw:', raw.slice(0, 500));
    return fallbackAlternatives();
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return validateAlternatives(parsed);
  } catch (e) {
    console.warn('Alt JSON parse error:', e.message);
    return fallbackAlternatives();
  }
}

/**
 * バリデーション・正規化
 */
function validateAlternatives(data) {
  const validateAlt = (alt, fallbackLabel) => ({
    label: alt?.label || fallbackLabel,
    rationale: alt?.rationale || '別のアプローチで設計しました',
    strengths: Array.isArray(alt?.strengths) ? alt.strengths : ['異なる視点での設計'],
    html: alt?.html || '',
  });

  return {
    altA: validateAlt(data.altA, '別解 A'),
    altB: validateAlt(data.altB, '別解 B'),
    comparison: Array.isArray(data.comparison) ? data.comparison.slice(0, 5) : [
      { aspect: 'レイアウト', mine: '-', altA: '-', altB: '-' },
      { aspect: '情報優先度', mine: '-', altA: '-', altB: '-' },
      { aspect: '強み', mine: '-', altA: '-', altB: '-' },
    ],
  };
}

/**
 * フォールバック
 */
function fallbackAlternatives() {
  return {
    altA: {
      label: '別解 A',
      rationale: '別解の生成に失敗しました。もう一度お試しください。',
      strengths: ['—'],
      html: '',
    },
    altB: {
      label: '別解 B',
      rationale: '別解の生成に失敗しました。',
      strengths: ['—'],
      html: '',
    },
    comparison: [
      { aspect: 'レイアウト', mine: '-', altA: '-', altB: '-' },
      { aspect: '情報優先度', mine: '-', altA: '-', altB: '-' },
      { aspect: '強み', mine: '-', altA: '-', altB: '-' },
    ],
  };
}
