/**
 * DesignSprint — 定数・設定
 *
 * アーキテクチャ:
 *   デフォルト → Worker proxy 経由（Groq API、ユーザーはキー不要）
 *   BYOK     → Groq or Gemini の自前キーで無制限利用
 *
 * Worker デプロイ後:
 *   WORKER_URL に Worker の URL を設定すると Free モードが有効化
 */

export const CONFIG = {
  // ===========================
  // Cloudflare Worker URL
  // ===========================
  // デプロイ後に設定 → Free モードが有効化
  // 例: 'https://designsprint-proxy.YOUR_SUBDOMAIN.workers.dev'
  // 空文字 → BYOK のみ動作（ローカル開発用）
  WORKER_URL: 'https://designsprint-proxy.hayato-miyake.workers.dev',

  // ===========================
  // Gemini API（BYOK用）
  // ===========================
  GEMINI_MODEL: 'gemini-2.0-flash',
  GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models',

  // ===========================
  // Groq（Worker & BYOK 共通）
  // ===========================
  GROQ_MODEL: 'llama-3.3-70b-versatile',

  // ===========================
  // 制限
  // ===========================
  FREE_DAILY_CHALLENGES: 5,  // Worker 経由: 1日5チャレンジ（35 APIコール）
  MAX_ROUNDS: 3,

  // ===========================
  // フォンサイズ
  // ===========================
  PHONE_WIDTH: 340,
  PHONE_HEIGHT: 640,

  // ===========================
  // localStorage キー
  // ===========================
  LS_MODE: 'ds_mode',            // 'free' | 'byok'
  LS_API_KEY: 'ds_api_key',      // BYOK API キー
  LS_PROVIDER: 'ds_provider',    // 'groq' | 'gemini'
  LS_PROGRESS: 'ds_progress',
  LS_DAILY_COUNT: 'ds_daily_count',
  LS_DAILY_DATE: 'ds_daily_date',
  LS_STREAK: 'ds_streak',
  LS_STREAK_DATE: 'ds_streak_date',
};

// レベル情報
export const LEVELS = {
  1: {
    name: 'デザイン4原則',
    badge: 'Level 1',
    desc: 'デザイン4原則を意識した単一画面の設計に挑戦しましょう',
    phoneType: 'mobile',
  },
  2: {
    name: 'LP設計',
    badge: 'Level 2',
    desc: '営業トークを画面に変換。ストーリーフローと説得構造で設計',
    phoneType: 'browser',
  },
  3: {
    name: 'マルチスクリーンUI/UX',
    badge: 'Level 3',
    desc: '5画面のインタラクティブプロトタイプを設計しよう',
    phoneType: 'mobile-multi',
  },
};
