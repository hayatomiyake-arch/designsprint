/**
 * DesignSprint — デザイン生成モジュール
 *
 * チャレンジ情報 + ユーザー指示からプロンプトを組み立て、
 * AI API でHTML/CSSを生成し、抽出して返す。
 */

import { generateText } from './api-client.js';
import { CONFIG } from './config.js';

// ────────────────────────────────────────
// プロンプトテンプレート（高品質UI生成用）
// ────────────────────────────────────────
const GENERATE_TEMPLATE = `You are a senior mobile UI designer at a top design agency (like Figma, Linear, or Vercel). Generate a pixel-perfect, production-quality mobile app screen in HTML/CSS.

## Challenge

**Title:** {{TITLE}}
**User Scenario:** {{PERSONA}}
**Design Goal:** {{GOAL}}
**Focus Principle:** {{PRINCIPLE}}
**Constraints:**
{{CONSTRAINTS}}

## User's Design Instructions

{{USER_INPUT}}

{{CONTEXT_BLOCK}}

## Technical Requirements

Output a single, complete HTML file from \`<!DOCTYPE html>\` to \`</html>\` with all CSS in a \`<style>\` tag. No external resources.

### Viewport
- Width: 340px. Set \`body { max-width: 340px; margin: 0 auto; min-height: 100vh; }\`
- Font: \`-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', sans-serif\`
- Language: Japanese. Use realistic content — real business names, specific numbers, concrete text. Never use "Lorem ipsum" or placeholder text like "テキスト".

### Visual Quality Standards (CRITICAL — this is what separates good from great)

**Spacing & Layout:**
- Use generous padding: 16-24px horizontal, 12-20px vertical for cards/sections
- Card gaps: 12-16px between cards
- Section gaps: 24-32px between major sections
- Consistent spacing rhythm throughout (e.g., 4px base unit: 4, 8, 12, 16, 24, 32)

**Typography Hierarchy:**
- Page title: 22-28px, font-weight: 800, letter-spacing: -0.5px
- Section heading: 16-18px, font-weight: 700
- Body text: 14-15px, font-weight: 400, line-height: 1.5-1.6
- Caption/meta: 12-13px, color: #6b7280, font-weight: 500
- Never use font-size below 11px

**Color Palette:**
- Pick ONE primary color (e.g., #2563eb blue, #7c3aed purple, #059669 green, #ea580c orange, #e11d48 rose)
- Background: #ffffff or #f9fafb
- Card background: #ffffff with subtle border (#f3f4f6) or shadow
- Text: #111827 (primary), #6b7280 (secondary), #9ca3af (tertiary)
- Use primary color sparingly — CTAs, active states, key indicators only
- Status colors: green #059669, amber #d97706, red #dc2626

**Cards & Surfaces:**
- border-radius: 12-16px for cards, 8-10px for buttons, 20-24px for pills/tags
- Box shadows: \`0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)\` (subtle)
- Or use border: \`1px solid #f3f4f6\` for flat modern look
- NO thick colored borders. Prefer shadow or very subtle border.

**Images & Visuals (NO external images):**
- Use CSS gradients for image placeholders: \`background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)\`
- Use large emoji (28-48px) as visual icons in cards
- Use inline SVG for icons (simple paths, 20-24px)
- Colored circles/pills with emoji for category indicators

**Buttons & Interactive Elements:**
- Primary CTA: background primary color, white text, border-radius: 10-12px, padding: 14px 24px, font-weight: 600
- Secondary: background transparent, border: 1.5px solid #e5e7eb, border-radius: 10px
- Ghost/text button: no background, primary color text
- Add \`transition: all 0.15s ease\` and hover states

**Navigation:**
- Bottom tab bar: 5 items max, 48-56px height, active state uses primary color + fill, inactive #9ca3af
- Top header: 48-56px, flex between logo and action icons

**Tags/Badges:**
- Small pills: padding 4px 10px, border-radius: 20px, font-size: 11-12px, font-weight: 600
- Use subtle background tints (e.g., primary color at 10% opacity) + matching text color

### Design Principles to Apply
- **Proximity**: Group related info tightly, use 24px+ gaps between unrelated groups
- **Alignment**: Invisible grid — all elements share common left edges. Use consistent padding.
- **Repetition**: Cards in a list MUST have identical structure and styling pattern
- **Contrast**: Primary CTA must be visually dominant. Use size, color weight to establish hierarchy.

### What Makes a BAD Design (AVOID these)
- Giant single-color blocks filling the whole header (like a plain green rectangle)
- No visual hierarchy — everything looks the same size/weight
- Placeholder-looking gradient rectangles without purpose
- Cramped spacing or inconsistent gaps
- Using heavy saturated colors everywhere instead of subtle tints
- Missing rounded corners on cards/buttons (looks dated)
- Text directly on colored backgrounds without sufficient contrast

Output ONLY the HTML code. No explanations, no markdown fences.`;

/**
 * デザインを生成
 * @param {object} challenge - チャレンジデータ
 * @param {string} userInput - ユーザーの設計指示
 * @param {object} [context] - 改善ラウンド時のコンテキスト
 * @param {string} [context.previousHTML] - 前回の生成HTML
 * @param {object} [context.previousReview] - 前回のレビュー結果
 * @returns {Promise<string>} 生成されたHTML
 */
export async function generateDesign(challenge, userInput, context = {}) {
  const prompt = buildPrompt(challenge, userInput, context);

  const result = await generateText(prompt, {
    maxTokens: 8192,
    temperature: 0.7,  // やや低めで安定した品質
  });

  return extractHTML(result.text);
}

/**
 * プロンプトを組み立て
 */
function buildPrompt(challenge, userInput, context) {
  let prompt = GENERATE_TEMPLATE;

  // 基本情報の埋め込み
  prompt = prompt.replace('{{TITLE}}', challenge.title);
  prompt = prompt.replace('{{PERSONA}}', challenge.persona);
  prompt = prompt.replace('{{GOAL}}', challenge.goal);
  prompt = prompt.replace('{{PRINCIPLE}}', challenge.principle);
  prompt = prompt.replace('{{CONSTRAINTS}}', challenge.constraints.join('\n'));
  prompt = prompt.replace('{{USER_INPUT}}', userInput);

  // 改善ラウンドのコンテキスト
  let contextBlock = '';
  if (context.previousReview) {
    contextBlock += `## Previous Review Feedback

**Score:** ${context.previousReview.score}/100
**Strengths:** ${context.previousReview.good.join(' / ')}
**Issues:** ${context.previousReview.dev.join(' / ')}
**Hint:** ${context.previousReview.hint}

`;
  }
  if (context.previousHTML) {
    // HTMLが長すぎる場合はトリム
    const trimmed = context.previousHTML.length > 4000
      ? context.previousHTML.slice(0, 4000) + '\n<!-- ... truncated ... -->'
      : context.previousHTML;
    contextBlock += `## Previous HTML (improve upon this — don't rewrite from scratch)

\`\`\`html
${trimmed}
\`\`\`

**Instruction:** Refine the HTML above based on the review feedback and user's improvement notes. Make targeted improvements, not a complete redesign.`;
  }

  prompt = prompt.replace('{{CONTEXT_BLOCK}}', contextBlock);

  return prompt;
}

/**
 * 生成テキストからHTMLを抽出
 * - ```html...``` ブロック内のHTMLを優先
 * - なければ <!DOCTYPE html> 〜 </html> を抽出
 * - それもなければ全文をHTMLとして返す
 */
function extractHTML(raw) {
  // マークダウンコードブロック内のHTML
  const codeBlockMatch = raw.match(/```html\s*\n?([\s\S]*?)```/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // <!DOCTYPE html> ... </html>
  const doctypeMatch = raw.match(/(<!DOCTYPE html[\s\S]*?<\/html>)/i);
  if (doctypeMatch) {
    return doctypeMatch[1].trim();
  }

  // <html> ... </html>
  const htmlMatch = raw.match(/(<html[\s\S]*?<\/html>)/i);
  if (htmlMatch) {
    return htmlMatch[1].trim();
  }

  // フォールバック: 全文
  return raw.trim();
}
