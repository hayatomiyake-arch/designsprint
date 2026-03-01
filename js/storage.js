/**
 * DesignSprint — localStorage 管理
 */

import { CONFIG } from './config.js';

/**
 * API設定
 */
export function getMode() {
  return localStorage.getItem(CONFIG.LS_MODE) || 'free';
}

export function getApiKey() {
  return localStorage.getItem(CONFIG.LS_API_KEY) || '';
}

export function getProvider() {
  return localStorage.getItem(CONFIG.LS_PROVIDER) || 'gemini';
}

export function setProvider(provider) {
  localStorage.setItem(CONFIG.LS_PROVIDER, provider);
}

export function setApiKey(key) {
  localStorage.setItem(CONFIG.LS_API_KEY, key);
}

export function setMode(mode) {
  localStorage.setItem(CONFIG.LS_MODE, mode);
}

/**
 * 日次チャレンジカウント
 */
export function getDailyCount() {
  const savedDate = localStorage.getItem(CONFIG.LS_DAILY_DATE);
  const today = new Date().toISOString().slice(0, 10);

  if (savedDate !== today) {
    // 日付が変わったらリセット
    localStorage.setItem(CONFIG.LS_DAILY_DATE, today);
    localStorage.setItem(CONFIG.LS_DAILY_COUNT, '0');
    return 0;
  }

  return parseInt(localStorage.getItem(CONFIG.LS_DAILY_COUNT) || '0', 10);
}

export function incrementDailyCount() {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(CONFIG.LS_DAILY_DATE, today);
  const current = getDailyCount();
  localStorage.setItem(CONFIG.LS_DAILY_COUNT, String(current + 1));
}

export function canStartChallenge() {
  const mode = getMode();
  if (mode === 'byok') return true;
  return getDailyCount() < CONFIG.FREE_DAILY_CHALLENGES;
}

/**
 * 進捗管理
 */
export function getProgress() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.LS_PROGRESS) || '{}');
  } catch {
    return {};
  }
}

export function saveProgress(progress) {
  localStorage.setItem(CONFIG.LS_PROGRESS, JSON.stringify(progress));
}

/**
 * チャレンジ結果を保存
 * @param {number} level
 * @param {string} challengeId
 * @param {object} result - { score, rounds, ... }
 */
export function saveChallengeResult(level, challengeId, result) {
  const progress = getProgress();
  const key = `l${level}`;
  if (!progress[key]) progress[key] = {};
  progress[key][challengeId] = {
    ...result,
    completedAt: new Date().toISOString(),
  };
  saveProgress(progress);
}

export function getChallengeResult(level, challengeId) {
  const progress = getProgress();
  const key = `l${level}`;
  return progress[key]?.[challengeId] || null;
}

export function getCompletedCount(level) {
  const progress = getProgress();
  const key = `l${level}`;
  return Object.keys(progress[key] || {}).length;
}

/**
 * 連続日数（ストリーク）
 */
export function getStreak() {
  return parseInt(localStorage.getItem(CONFIG.LS_STREAK) || '0', 10);
}

export function updateStreak() {
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = localStorage.getItem(CONFIG.LS_STREAK_DATE);

  if (lastDate === today) return; // 今日はもう更新済み

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (lastDate === yesterdayStr) {
    // 連続
    const streak = getStreak() + 1;
    localStorage.setItem(CONFIG.LS_STREAK, String(streak));
  } else {
    // リセット
    localStorage.setItem(CONFIG.LS_STREAK, '1');
  }

  localStorage.setItem(CONFIG.LS_STREAK_DATE, today);
}

/**
 * セッションデータ（現在のチャレンジの状態）
 */
const SESSION_KEY = 'ds_session';

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSession(data) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
