/**
 * DesignSprint — スマホフレーム自動スケーリング
 *
 * 中央パネルのサイズに合わせて phone-frame を scale() で縮小。
 * 大きすぎてはみ出さないように。
 */

import { CONFIG } from './config.js';

/**
 * フォンフレームを親コンテナに収まるようスケーリング
 * @param {HTMLElement} phoneFrame - .phone-frame 要素
 * @param {HTMLElement} container - .panel-center 要素
 */
export function adjustPhoneScale(phoneFrame, container) {
  if (!phoneFrame || !container) return;

  const pw = CONFIG.PHONE_WIDTH;
  const ph = CONFIG.PHONE_HEIGHT;

  // コンテナの使える高さ（パディング・ラウンドドット分を考慮）
  const rect = container.getBoundingClientRect();
  const availW = rect.width - 48;   // 左右 24px padding
  const availH = rect.height - 80;  // 上下マージン + ラウンドドット

  const scaleX = availW / pw;
  const scaleY = availH / ph;
  const scale = Math.min(scaleX, scaleY, 1); // 1以上にはしない

  phoneFrame.style.transform = `scale(${scale})`;

  // scale すると実際のレイアウトサイズが変わらないので margin で補正
  const marginH = (ph - ph * scale) / -2;
  const marginW = (pw - pw * scale) / -2;
  phoneFrame.style.margin = `${marginH}px ${marginW}px`;
}

/**
 * ResizeObserver で自動追従
 */
export function setupPhoneScaleObserver(phoneFrame, container) {
  if (!phoneFrame || !container) return;

  // 初回実行
  adjustPhoneScale(phoneFrame, container);

  // リサイズ監視
  const observer = new ResizeObserver(() => {
    adjustPhoneScale(phoneFrame, container);
  });
  observer.observe(container);

  return observer;
}
