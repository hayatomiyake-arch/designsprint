/**
 * DesignSprint — デザインレビューモジュール
 *
 * 生成されたHTMLをGemini APIでレビューし、
 * スコア・Good/Dev Points・ヒントをJSON形式で返す。
 */

import { generateText } from './api-client.js';
import { CONFIG } from './config.js';

const REVIEW_TEMPLATE = `あなたはUI/UXデザインの専門レビュアーです。受講者がAI生成で作成した画面のHTMLコードをレビューし、デザイン4原則の観点から評価してください。

## お題情報

**タイトル:** {{TITLE}}
**ユーザーシナリオ:** {{PERSONA}}
**設計ゴール:** {{GOAL}}
**フォーカス原則:** {{PRINCIPLE}}
**制約条件:**
{{CONSTRAINTS}}

## ユーザーの設計指示

{{USER_INPUT}}

## レビュー対象のHTMLコード

\`\`\`html
{{GENERATED_HTML}}
\`\`\`

## ラウンド情報

現在 Round {{ROUND}} / {{MAX_ROUNDS}}

## 評価基準

### UIデザイナー視点
- **近接**: 関連情報が適切にグルーピングされているか
- **整列**: 要素がグリッド線に沿っているか
- **反復**: 同種要素のスタイルが一貫しているか
- **コントラスト**: 重要要素が視覚的に際立っているか

### UXデザイナー視点
- ユーザーの目的達成できる情報設計か
- 認知負荷は適切か
- 操作導線が明確か

## 出力形式

以下のJSON形式のみを出力してください。説明文やマークダウンは不要です。

{
  "score": 72,
  "verdict": "Improve",
  "good": ["具体的な良い点1", "具体的な良い点2", "具体的な良い点3"],
  "dev": ["具体的な改善点1", "具体的な改善点2"],
  "hint": "次のラウンドで何を改善すべきかの具体的アドバイス",
  "takeaways": ["デザインの汎用的な学び1", "学び2", "学び3"]
}

## 採点ガイドライン

- 85-100: プロ級。good 3-4、dev 0-1。verdict: "Pass"
- 70-84: 基本OK、改善余地あり。good 2-3、dev 1-2。verdict: "Improve"
- 50-69: ムラあり。good 1-2、dev 2-3。verdict: "Improve"
- Round 1で80点以上はまれ。改善が見られたら加点。
- JSONのみ出力。バッククォートで囲まない。`;

/**
 * デザインをレビュー
 * @param {object} challenge - チャレンジデータ
 * @param {string} userInput - ユーザーの設計指示
 * @param {string} generatedHTML - 生成されたHTML
 * @param {number} round - 現在のラウンド (1-3)
 * @returns {Promise<object>} レビュー結果 { score, verdict, good[], dev[], hint, takeaways[] }
 */
export async function reviewDesign(challenge, userInput, generatedHTML, round) {
  const prompt = buildReviewPrompt(challenge, userInput, generatedHTML, round);

  const result = await generateText(prompt, {
    maxTokens: 2048,
    temperature: 0.3, // レビューは一貫性重視で低め
  });

  return parseReviewJSON(result.text);
}

/**
 * レビュープロンプト組み立て
 */
function buildReviewPrompt(challenge, userInput, generatedHTML, round) {
  let prompt = REVIEW_TEMPLATE;

  prompt = prompt.replace('{{TITLE}}', challenge.title);
  prompt = prompt.replace('{{PERSONA}}', challenge.persona);
  prompt = prompt.replace('{{GOAL}}', challenge.goal);
  prompt = prompt.replace('{{PRINCIPLE}}', challenge.principle);
  prompt = prompt.replace('{{CONSTRAINTS}}', challenge.constraints.join('\n'));
  prompt = prompt.replace('{{USER_INPUT}}', userInput);
  prompt = prompt.replace('{{GENERATED_HTML}}', generatedHTML);
  prompt = prompt.replace('{{ROUND}}', String(round));
  prompt = prompt.replace('{{MAX_ROUNDS}}', String(CONFIG.MAX_ROUNDS));

  return prompt;
}

/**
 * レビューJSONを解析
 * Gemini は JSON の前後に余分なテキストを付けることがあるので堅牢に対処
 */
function parseReviewJSON(raw) {
  // ```json ... ``` ブロックを抽出
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : raw;

  // JSON部分を抽出（最初の { から最後の } まで）
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('Review JSON parse failed. Raw:', raw);
    return fallbackReview();
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return validateReview(parsed);
  } catch (e) {
    console.warn('Review JSON parse error:', e.message, 'Raw:', raw);
    return fallbackReview();
  }
}

/**
 * レビュー結果のバリデーション・正規化
 */
function validateReview(data) {
  return {
    score: clamp(typeof data.score === 'number' ? data.score : 60, 0, 100),
    verdict: ['Pass', 'Improve', 'Retry'].includes(data.verdict) ? data.verdict : 'Improve',
    good: Array.isArray(data.good) ? data.good.slice(0, 5) : ['良い点の解析に失敗しました'],
    dev: Array.isArray(data.dev) ? data.dev.slice(0, 4) : [],
    hint: typeof data.hint === 'string' ? data.hint : '改善のヒントを取得できませんでした',
    takeaways: Array.isArray(data.takeaways) ? data.takeaways.slice(0, 4) : [
      'デザイン4原則を意識した画面設計を実践',
      '情報のグルーピングと視覚的階層の重要性',
      'ユーザー視点での情報設計',
    ],
  };
}

/**
 * JSON解析失敗時のフォールバック
 */
function fallbackReview() {
  return {
    score: 60,
    verdict: 'Improve',
    good: ['デザインの全体的な構成は適切です'],
    dev: ['レビューの詳細な解析に失敗しました。もう一度お試しください'],
    hint: '改善指示を具体的に入力して再度生成してみてください',
    takeaways: [
      'デザイン4原則を意識した画面設計',
      '情報のグルーピングと視覚的階層',
      'ユーザー視点での情報設計',
    ],
  };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
