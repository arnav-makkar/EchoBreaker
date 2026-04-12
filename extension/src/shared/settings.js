// User-tunable settings that live in chrome.storage.local.
// This is the only place the Gemini API key is stored.

import { DEFAULT_DAILY_CAP } from './constants.js';

const KEYS = {
  apiKey:     'gemini_api_key',
  dailyCap:   'daily_cap',
  dailyCount: 'daily_count',
  dailyDate:  'daily_date',
};

// ---- api key ----

export async function getApiKey() {
  const { [KEYS.apiKey]: key } = await chrome.storage.local.get(KEYS.apiKey);
  return key || null;
}

export async function setApiKey(key) {
  await chrome.storage.local.set({ [KEYS.apiKey]: key });
}

export async function clearApiKey() {
  await chrome.storage.local.remove(KEYS.apiKey);
}

// ---- daily cap ----

export async function getDailyCap() {
  const { [KEYS.dailyCap]: cap } = await chrome.storage.local.get(KEYS.dailyCap);
  return cap ?? DEFAULT_DAILY_CAP;
}

export async function setDailyCap(cap) {
  const num = Number(cap);
  const base = Number.isFinite(num) ? num : DEFAULT_DAILY_CAP;
  const n = Math.max(1, Math.floor(base));
  await chrome.storage.local.set({ [KEYS.dailyCap]: n });
  return n;
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Atomically check whether another analyze is allowed today, and if so
 * increment the counter. Returns { allowed, current, cap }.
 *
 * The counter auto-resets when the stored date doesn't match today's
 * local date — no cron job needed.
 */
export async function checkAndIncrementDailyCount() {
  const { [KEYS.dailyCount]: count = 0, [KEYS.dailyDate]: date = '' } =
    await chrome.storage.local.get([KEYS.dailyCount, KEYS.dailyDate]);

  const cap = await getDailyCap();
  const now = today();
  const current = (date === now) ? count : 0;

  if (current >= cap) {
    return { allowed: false, current, cap };
  }

  await chrome.storage.local.set({
    [KEYS.dailyCount]: current + 1,
    [KEYS.dailyDate]:  now,
  });
  return { allowed: true, current: current + 1, cap };
}

export async function getDailyStatus() {
  const { [KEYS.dailyCount]: count = 0, [KEYS.dailyDate]: date = '' } =
    await chrome.storage.local.get([KEYS.dailyCount, KEYS.dailyDate]);
  const cap = await getDailyCap();
  const current = (date === today()) ? count : 0;
  return { current, cap };
}

export async function resetDailyCount() {
  await chrome.storage.local.set({
    [KEYS.dailyCount]: 0,
    [KEYS.dailyDate]:  today(),
  });
}
