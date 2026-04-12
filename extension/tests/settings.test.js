import { describe, it, expect, beforeEach } from 'vitest';
import {
  getApiKey, setApiKey, clearApiKey,
  getDailyCap, setDailyCap,
  checkAndIncrementDailyCount, getDailyStatus, resetDailyCount,
} from '../src/shared/settings.js';

describe('api key', () => {
  it('round-trips through chrome.storage.local', async () => {
    expect(await getApiKey()).toBe(null);
    await setApiKey('AIzaTESTKEY');
    expect(await getApiKey()).toBe('AIzaTESTKEY');
    await clearApiKey();
    expect(await getApiKey()).toBe(null);
  });
});

describe('daily cap', () => {
  beforeEach(async () => {
    await resetDailyCount();
    await setDailyCap(3);
  });

  it('allows up to the cap then blocks', async () => {
    const cap = await getDailyCap();
    expect(cap).toBe(3);

    const r1 = await checkAndIncrementDailyCount();
    expect(r1.allowed).toBe(true);
    expect(r1.current).toBe(1);

    const r2 = await checkAndIncrementDailyCount();
    expect(r2.allowed).toBe(true);
    expect(r2.current).toBe(2);

    const r3 = await checkAndIncrementDailyCount();
    expect(r3.allowed).toBe(true);
    expect(r3.current).toBe(3);

    const r4 = await checkAndIncrementDailyCount();
    expect(r4.allowed).toBe(false);
    expect(r4.current).toBe(3);
  });

  it('getDailyStatus returns current count after increments', async () => {
    await checkAndIncrementDailyCount();
    await checkAndIncrementDailyCount();
    const status = await getDailyStatus();
    expect(status.current).toBe(2);
    expect(status.cap).toBe(3);
  });

  it('setDailyCap floors fractions and enforces minimum of 1', async () => {
    expect(await setDailyCap(5.7)).toBe(5);
    expect(await setDailyCap(0)).toBe(1);
    expect(await setDailyCap(-10)).toBe(1);
  });
});
