/**
 * DesignSprint — メインアプリケーションコントローラ
 *
 * 画面遷移、チャレンジ管理、AI生成/レビュー/別解の統合
 */

import { CONFIG, LEVELS } from './config.js';
import { CHALLENGES_L1 } from './challenges-data.js';
import * as Storage from './storage.js';
import { setupPhoneScaleObserver } from './phone-scaler.js';
import { generateDesign } from './design-generator.js';
import { reviewDesign } from './design-reviewer.js';
import { generateAlternatives } from './alternative-gen.js';

// ===========================
// State
// ===========================
const state = {
  level: 1,
  currentScreen: 1,
  currentChallenge: null,
  round: 1,
  scores: [],        // [round1Score, round2Score, ...]
  generatedHTML: [],  // 各ラウンドの生成HTML
  reviews: [],        // 各ラウンドのレビュー結果
  userInputs: [],     // 各ラウンドのユーザー入力
  alternatives: null, // 別解データ
  isGenerating: false,
};

// ===========================
// DOM References
// ===========================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===========================
// 画面遷移
// ===========================
function goScreen(n) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  const target = $(`#screen${n}`);
  if (target) {
    target.classList.add('active');
    state.currentScreen = n;
    updateScreenBadge(n);

    // お題選択画面に戻るときはグリッドを更新（完了状態の反映）
    if (n === 1) {
      renderChallengeGrid();
      updateStreakBadge();
    }
  }
}

function updateScreenBadge(n) {
  const badge = $('#screenBadge');
  const names = { 1: 'お題選択', 2: '制作中', 4: '結果' };
  if (badge) badge.textContent = names[n] || '制作中';
}

window.goScreen = goScreen;

// ===========================
// チャレンジグリッド描画
// ===========================
function renderChallengeGrid() {
  const grid = $('#challengeGrid');
  if (!grid) return;

  const challenges = getChallengesForLevel(state.level);
  const completedCount = Storage.getCompletedCount(state.level);

  grid.innerHTML = challenges.map((ch, i) => {
    const result = Storage.getChallengeResult(state.level, ch.id);
    const isCompleted = !!result;

    if (isCompleted) {
      return `
        <div class="challenge-card completed" onclick="selectChallenge('${ch.id}')">
          <div class="challenge-number">Challenge ${String(i + 1).padStart(2, '0')}</div>
          <div class="challenge-name">${ch.title}</div>
          <div class="challenge-done">✅ 完了 — ${result.score}点</div>
        </div>`;
    }

    return `
      <div class="challenge-card new" onclick="selectChallenge('${ch.id}')">
        <div class="challenge-number" style="color:var(--accent)">Challenge ${String(i + 1).padStart(2, '0')}</div>
        <div class="challenge-name">${ch.title}</div>
        <div class="challenge-desc">${truncate(ch.persona, 60)}</div>
        <div class="challenge-tags">
          ${ch.tags.map(t => `<span class="challenge-tag">${t}</span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function getChallengesForLevel(level) {
  switch (level) {
    case 1: return CHALLENGES_L1;
    default: return CHALLENGES_L1;
  }
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// ===========================
// チャレンジ選択 → ワークスペースへ
// ===========================
function selectChallenge(challengeId) {
  if (!Storage.canStartChallenge()) {
    alert('今日のフリー枠（2チャレンジ）を使い切りました。\n明日また挑戦するか、設定から自分のAPIキーを登録してください。');
    return;
  }

  const challenges = getChallengesForLevel(state.level);
  const ch = challenges.find(c => c.id === challengeId);
  if (!ch) return;

  state.currentChallenge = ch;
  state.round = 1;
  state.scores = [];
  state.generatedHTML = [];
  state.reviews = [];
  state.userInputs = [];
  state.alternatives = null;
  state.isGenerating = false;

  renderBrief(ch);
  resetWorkspace();
  goScreen(2);
}

window.selectChallenge = selectChallenge;

// ===========================
// ブリーフ描画
// ===========================
function renderBrief(ch) {
  const briefEl = $('#briefContent');
  const constraintsEl = $('#constraintsList');

  if (briefEl) {
    briefEl.innerHTML = `
      <h3>🎯 ${escapeHTML(ch.title)}</h3>
      <p>${escapeHTML(ch.persona)}</p>
      <div style="margin-top:12px;padding:10px 14px;background:var(--accent-bg);border-radius:8px;font-size:12px;line-height:1.7">
        <strong style="color:var(--accent)">設計ゴール:</strong> ${escapeHTML(ch.goal)}
      </div>
      <div style="margin-top:8px">
        <span class="badge badge-purple" style="font-size:11px">📐 ${escapeHTML(ch.principle)}</span>
      </div>
    `;
  }

  if (constraintsEl) {
    constraintsEl.innerHTML = ch.constraints
      .map(c => `<div class="constraint-item">${escapeHTML(c)}</div>`)
      .join('');
  }

  // ヒントセクション
  const hintSection = $('#challengeHints');
  if (hintSection && ch.hints) {
    hintSection.innerHTML = `
      <h4>💡 設計のヒント</h4>
      <ul style="margin:0;padding-left:16px">
        ${ch.hints.map(h => `<li style="font-size:12px;line-height:1.7;color:var(--text);margin-bottom:4px">${escapeHTML(h)}</li>`).join('')}
      </ul>
    `;
    hintSection.style.display = '';
  }
}

// ===========================
// ワークスペースリセット
// ===========================
function resetWorkspace() {
  $('#emptyPreview')?.classList.remove('hidden');
  $('#phoneContainer')?.classList.add('hidden');
  $('#loadingOverlay')?.classList.add('hidden');

  $('#emptyReview')?.classList.remove('hidden');
  $('#reviewContent')?.classList.add('hidden');

  const textarea = $('#designInput');
  if (textarea) {
    textarea.value = '';
    textarea.placeholder = 'デザインの指示を入力してください...\n例: 「カード型レイアウトで、写真を大きく見せて、評価と距離を近くに配置」';
  }

  updateRoundDots();

  const improveBtn = $('#improveBtn');
  const submitBtn = $('#submitBtn');
  if (improveBtn) improveBtn.style.display = 'none';
  if (submitBtn) submitBtn.style.display = 'none';

  const genBtn = $('#generateBtn');
  if (genBtn) {
    genBtn.disabled = false;
    genBtn.textContent = '🎨 デザインを生成';
  }
}

// ===========================
// ラウンドドット更新
// ===========================
function updateRoundDots() {
  const dots = $$('#roundDots .round-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i < state.round);
  });

  const nextRound = $('#nextRound');
  if (nextRound) nextRound.textContent = Math.min(state.round + 1, CONFIG.MAX_ROUNDS);
}

// ===========================
// 生成ハンドラ（AI接続済み）
// ===========================
async function handleGenerate() {
  const input = $('#designInput')?.value?.trim();
  if (!input) {
    alert('デザイン指示を入力してください');
    return;
  }

  if (state.isGenerating) return;
  state.isGenerating = true;

  const genBtn = $('#generateBtn');
  if (genBtn) genBtn.disabled = true;

  try {
    // ===== Step 1: デザイン生成 =====
    showLoading('AIがデザインを生成中... ✨');

    const context = {};
    if (state.round > 1) {
      context.previousHTML = state.generatedHTML[state.generatedHTML.length - 1];
      context.previousReview = state.reviews[state.reviews.length - 1];
    }

    const html = await generateDesign(state.currentChallenge, input, context);

    state.generatedHTML.push(html);
    state.userInputs.push(input);

    showPreview(html);

    // ===== Step 2: レビュー =====
    updateLoadingText('デザインをレビュー中... 🔍');

    const review = await reviewDesign(
      state.currentChallenge,
      input,
      html,
      state.round
    );

    state.reviews.push(review);
    state.scores.push(review.score);

    showReview(review);

    hideLoading();

    // ===== Step 3: ラウンド管理 =====
    updateRoundDots();

    if (state.round >= CONFIG.MAX_ROUNDS) {
      // 最終ラウンド → 提出ボタンのみ
      const improveBtn = $('#improveBtn');
      const submitBtn = $('#submitBtn');
      if (improveBtn) improveBtn.style.display = 'none';
      if (submitBtn) submitBtn.style.display = '';
    } else {
      // 途中ラウンド → 改善ボタン+提出ボタン
      const improveBtn = $('#improveBtn');
      const submitBtn = $('#submitBtn');
      if (improveBtn) improveBtn.style.display = '';
      if (submitBtn) submitBtn.style.display = '';
    }

  } catch (err) {
    hideLoading();
    console.error('Generate/Review error:', err);
    showError(err.message || 'エラーが発生しました。もう一度お試しください。');
    if (genBtn) genBtn.disabled = false;
  } finally {
    state.isGenerating = false;
  }
}

window.handleGenerate = handleGenerate;

// ===========================
// 改善ハンドラ
// ===========================
function handleImprove() {
  state.round++;
  updateRoundDots();

  const textarea = $('#designInput');
  if (textarea) {
    textarea.placeholder = `Round ${state.round}: 前回のレビューを踏まえて改善指示を入力...\n例: 「余白をもう少し広げて、CTAボタンの色を変えて目立たせて」`;
    textarea.value = '';
    textarea.focus();
  }

  const genBtn = $('#generateBtn');
  if (genBtn) {
    genBtn.disabled = false;
    genBtn.textContent = `🎨 Round ${state.round} デザインを生成`;
  }

  // 改善・提出ボタンを非表示
  const impBtn = $('#improveBtn');
  const subBtn = $('#submitBtn');
  if (impBtn) impBtn.style.display = 'none';
  if (subBtn) subBtn.style.display = 'none';

  // レビューを待ち状態に
  $('#reviewContent')?.classList.add('hidden');
  $('#emptyReview')?.classList.remove('hidden');
  const emptyReview = $('#emptyReview');
  if (emptyReview) {
    emptyReview.innerHTML = `
      <div class="empty-review-icon">✍️</div>
      <div class="empty-review-text">改善指示を入力して<br>再度生成してください</div>
    `;
  }
}

window.handleImprove = handleImprove;

// ===========================
// 提出ハンドラ
// ===========================
async function handleSubmit() {
  if (state.isGenerating) return;
  state.isGenerating = true;

  try {
    Storage.incrementDailyCount();
    Storage.updateStreak();
    updateStreakBadge();

    // 結果保存
    const finalScore = state.scores[state.scores.length - 1];
    Storage.saveChallengeResult(state.level, state.currentChallenge.id, {
      score: finalScore,
      scores: [...state.scores],
      rounds: state.round,
    });

    // ===== 別解生成 =====
    showLoading('別アプローチを生成中... 💡');

    try {
      const submittedHTML = state.generatedHTML[state.generatedHTML.length - 1];
      state.alternatives = await generateAlternatives(state.currentChallenge, submittedHTML);
    } catch (altErr) {
      console.warn('Alternative generation failed:', altErr);
      state.alternatives = null;
    }

    hideLoading();

    // 結果画面描画
    renderResultScreen();
    goScreen(4);

  } catch (err) {
    hideLoading();
    console.error('Submit error:', err);
    showError(err.message || '提出中にエラーが発生しました。');
  } finally {
    state.isGenerating = false;
  }
}

window.handleSubmit = handleSubmit;

// ===========================
// プレビュー表示
// ===========================
function showPreview(html) {
  $('#emptyPreview')?.classList.add('hidden');
  const container = $('#phoneContainer');
  container?.classList.remove('hidden');

  const iframe = $('#previewIframe');
  if (iframe) {
    iframe.srcdoc = html;
  }

  const phoneFrame = $('#phoneFrame');
  const panelCenter = $('.panel-center');
  if (phoneFrame && panelCenter) {
    setupPhoneScaleObserver(phoneFrame, panelCenter);
  }
}

// ===========================
// レビュー表示
// ===========================
function showReview(review) {
  $('#emptyReview')?.classList.add('hidden');
  $('#reviewContent')?.classList.remove('hidden');

  // スコア
  const scoreEl = $('#scoreValue');
  if (scoreEl) {
    scoreEl.textContent = review.score;
    scoreEl.style.color = review.score >= 80
      ? 'var(--success)'
      : review.score >= 60
        ? 'var(--accent)'
        : 'var(--warn)';
  }

  // スコアバー
  const segments = $$('#scoreBar .score-segment');
  const filled = Math.round(review.score / 20);
  segments.forEach((seg, i) => {
    seg.classList.toggle('filled', i < filled);
  });

  // Good Points
  const goodEl = $('#goodPoints');
  if (goodEl) {
    goodEl.innerHTML = '<h4>✅ Good Points</h4>' +
      review.good.map(g =>
        `<div class="review-item">
          <div class="review-badge good">✓</div>
          <div>${escapeHTML(g)}</div>
        </div>`
      ).join('');
  }

  // Dev Points
  const devEl = $('#devPoints');
  if (devEl) {
    devEl.innerHTML = '<h4>🔧 Development Points</h4>' +
      review.dev.map(d =>
        `<div class="review-item">
          <div class="review-badge dev">!</div>
          <div>${escapeHTML(d)}</div>
        </div>`
      ).join('');
  }

  // ヒント
  const hintText = $('#hintText');
  if (hintText) hintText.textContent = review.hint;
}

// ===========================
// 結果画面描画
// ===========================
function renderResultScreen() {
  const finalScore = state.scores[state.scores.length - 1];

  // ヘッダー
  if (finalScore >= 80) {
    setTextContent('#resultIcon', '🎉');
    setTextContent('#resultTitle', '素晴らしい！');
  } else if (finalScore >= 60) {
    setTextContent('#resultIcon', '👏');
    setTextContent('#resultTitle', 'チャレンジ完了！');
  } else {
    setTextContent('#resultIcon', '💪');
    setTextContent('#resultTitle', 'ナイストライ！');
  }
  setTextContent('#resultSub', `${state.round}ラウンドの改善を経て提出しました`);

  // スコア推移（アニメーション付き）
  const growthEl = $('#growthBars');
  if (growthEl) {
    growthEl.innerHTML = state.scores.map((s, i) => {
      const color = s >= 80 ? 'var(--success)' : s >= 60 ? 'var(--accent)' : 'var(--warn)';
      return `
        <div class="growth-bar">
          <div class="growth-label">Round ${i + 1}</div>
          <div class="growth-track">
            <div class="growth-fill" data-width="${s}" style="width:0%;background:${color}"></div>
          </div>
          <div class="growth-val">${s}</div>
        </div>`;
    }).join('');

    // 遅延アニメーション
    requestAnimationFrame(() => {
      setTimeout(() => {
        growthEl.querySelectorAll('.growth-fill').forEach(bar => {
          bar.style.width = bar.dataset.width + '%';
        });
      }, 100);
    });
  }

  // 学びまとめ
  const lastReview = state.reviews[state.reviews.length - 1];
  const takeawayList = $('#takeawayList');
  if (takeawayList && lastReview?.takeaways) {
    takeawayList.innerHTML = lastReview.takeaways
      .map(t => `<li>${escapeHTML(t)}</li>`)
      .join('');
  }

  renderAlternativesGrid();
  renderComparisonTable();
}

/**
 * 別解グリッド描画
 */
function renderAlternativesGrid() {
  const altGrid = $('#altGrid');
  if (!altGrid) return;

  const submittedHTML = state.generatedHTML[state.generatedHTML.length - 1];
  const alt = state.alternatives;

  const mineCard = `
    <div class="alt-card mine">
      <div class="alt-label alt-label-mine">🙋 あなたの提出</div>
      <div class="mini-phone">
        <div class="mini-phone-notch"></div>
        <div class="mini-phone-body">
          <iframe class="mini-preview-iframe" sandbox="allow-scripts" srcdoc="${escapeAttr(submittedHTML)}"></iframe>
        </div>
      </div>
      <div class="alt-rationale"><strong>スコア:</strong> ${state.scores[state.scores.length - 1]}点（${state.round}ラウンド）</div>
    </div>`;

  const altACard = alt?.altA?.html
    ? `
    <div class="alt-card alt-a">
      <div class="alt-label alt-label-a">💡 ${escapeHTML(alt.altA.label)}</div>
      <div class="mini-phone">
        <div class="mini-phone-notch"></div>
        <div class="mini-phone-body">
          <iframe class="mini-preview-iframe" sandbox="allow-scripts" srcdoc="${escapeAttr(alt.altA.html)}"></iframe>
        </div>
      </div>
      <div class="alt-rationale"><strong>設計意図:</strong> ${escapeHTML(alt.altA.rationale)}</div>
      ${alt.altA.strengths.map(s => `
        <div class="alt-point">
          <div class="alt-point-dot" style="background:var(--purple)"></div>
          <span>${escapeHTML(s)}</span>
        </div>`).join('')}
    </div>`
    : `
    <div class="alt-card alt-a">
      <div class="alt-label alt-label-a">💡 別解 A</div>
      <div class="mini-phone">
        <div class="mini-phone-notch"></div>
        <div class="mini-phone-body" style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:12px">生成できませんでした</div>
      </div>
    </div>`;

  const altBCard = alt?.altB?.html
    ? `
    <div class="alt-card alt-b">
      <div class="alt-label alt-label-b">💡 ${escapeHTML(alt.altB.label)}</div>
      <div class="mini-phone">
        <div class="mini-phone-notch"></div>
        <div class="mini-phone-body">
          <iframe class="mini-preview-iframe" sandbox="allow-scripts" srcdoc="${escapeAttr(alt.altB.html)}"></iframe>
        </div>
      </div>
      <div class="alt-rationale"><strong>設計意図:</strong> ${escapeHTML(alt.altB.rationale)}</div>
      ${alt.altB.strengths.map(s => `
        <div class="alt-point">
          <div class="alt-point-dot" style="background:var(--orange)"></div>
          <span>${escapeHTML(s)}</span>
        </div>`).join('')}
    </div>`
    : `
    <div class="alt-card alt-b">
      <div class="alt-label alt-label-b">💡 別解 B</div>
      <div class="mini-phone">
        <div class="mini-phone-notch"></div>
        <div class="mini-phone-body" style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:12px">生成できませんでした</div>
      </div>
    </div>`;

  altGrid.innerHTML = mineCard + altACard + altBCard;
}

/**
 * 比較テーブル描画
 */
function renderComparisonTable() {
  const table = $('#compareTable');
  if (!table) return;

  const alt = state.alternatives;

  if (alt?.comparison && alt.comparison.length > 0) {
    table.innerHTML = `
      <thead>
        <tr>
          <th>観点</th>
          <th class="compare-mine">あなた</th>
          <th class="compare-a">別解 A</th>
          <th class="compare-b">別解 B</th>
        </tr>
      </thead>
      <tbody>
        ${alt.comparison.map(row => `
          <tr>
            <td>${escapeHTML(row.aspect)}</td>
            <td>${escapeHTML(row.mine)}</td>
            <td>${escapeHTML(row.altA)}</td>
            <td>${escapeHTML(row.altB)}</td>
          </tr>
        `).join('')}
      </tbody>`;
  } else {
    table.innerHTML = `
      <thead>
        <tr>
          <th>観点</th>
          <th class="compare-mine">あなた</th>
          <th class="compare-a">別解 A</th>
          <th class="compare-b">別解 B</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="4" style="text-align:center;color:var(--sub);padding:20px">比較データを取得できませんでした</td></tr>
      </tbody>`;
  }
}

// ===========================
// ローディング表示
// ===========================
function showLoading(text) {
  const overlay = $('#loadingOverlay');
  const loadingText = $('#loadingText');
  if (overlay) overlay.classList.remove('hidden');
  if (loadingText) loadingText.textContent = text;

  const genBtn = $('#generateBtn');
  if (genBtn) genBtn.disabled = true;
}

function updateLoadingText(text) {
  const loadingText = $('#loadingText');
  if (loadingText) loadingText.textContent = text;
}

function hideLoading() {
  const overlay = $('#loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function showError(message) {
  $('#emptyReview')?.classList.remove('hidden');
  $('#reviewContent')?.classList.add('hidden');

  const emptyReview = $('#emptyReview');
  if (emptyReview) {
    emptyReview.innerHTML = `
      <div class="empty-review-icon">⚠️</div>
      <div class="empty-review-text" style="color:var(--red)">
        ${escapeHTML(message).replace(/\n/g, '<br>')}
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--sub)">
        入力を変えてもう一度お試しください
      </div>
    `;
  }
}

// ===========================
// ユーティリティ
// ===========================
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setTextContent(sel, text) {
  const el = $(sel);
  if (el) el.textContent = text;
}

function updateStreakBadge() {
  const streak = Storage.getStreak();
  setTextContent('#streakBadge', `🔥 ${streak}日`);
}

// ===========================
// 初期化
// ===========================
function init() {
  const params = new URLSearchParams(window.location.search);
  state.level = parseInt(params.get('level') || '1', 10);

  const levelInfo = LEVELS[state.level];
  if (levelInfo) {
    setTextContent('#levelBadge', levelInfo.badge);
    setTextContent('#levelNum', state.level);
    setTextContent('#levelDesc', levelInfo.desc);
  }

  const streak = Storage.getStreak();
  setTextContent('#streakBadge', `🔥 ${streak}日`);

  const mode = Storage.getMode();
  const modeLabel = mode === 'byok' ? '🔑 BYOK' : '🆓 Free';
  const modeBadge = $('#modeBadge');
  if (modeBadge) modeBadge.textContent = modeLabel;

  // 次のチャレンジボタン
  const nextBtn = $('#nextChallengeBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const challenges = getChallengesForLevel(state.level);
      const completedCount = Storage.getCompletedCount(state.level);

      // 次の未完了チャレンジがあれば直接スタート
      if (completedCount < challenges.length) {
        const nextChallenge = challenges[completedCount];
        selectChallenge(nextChallenge.id);
      } else {
        // 全完了 → お題一覧に戻る
        goScreen(1);
      }
    });
  }

  renderChallengeGrid();
  goScreen(1);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
