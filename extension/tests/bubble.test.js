import { describe, it, expect } from 'vitest';
import { computeBubbleScore } from '../src/shared/bubble.js';

describe('computeBubbleScore', () => {
  it('returns 0.5 for empty distribution', () => {
    expect(computeBubbleScore({})).toBe(0.5);
    expect(computeBubbleScore({ left: 0, center: 0, right: 0 })).toBe(0.5);
  });

  it('returns ~0 for perfectly balanced 3-way split', () => {
    const score = computeBubbleScore({ left: 3, center: 3, right: 3 });
    expect(score).toBeCloseTo(0, 2);
  });

  it('returns 1 when all reading is one framing', () => {
    expect(computeBubbleScore({ left: 10, center: 0, right: 0 })).toBe(1);
    expect(computeBubbleScore({ left: 0, center: 5, right: 0 })).toBe(1);
  });

  it('returns intermediate value for skewed distributions', () => {
    const score = computeBubbleScore({ left: 8, center: 1, right: 1 });
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.8);
  });

  it('is monotonic: more imbalance -> higher score', () => {
    const balanced  = computeBubbleScore({ left: 5, center: 5, right: 5 });
    const slight    = computeBubbleScore({ left: 6, center: 5, right: 4 });
    const lopsided  = computeBubbleScore({ left: 10, center: 3, right: 2 });
    const extreme   = computeBubbleScore({ left: 15, center: 0, right: 0 });

    expect(slight).toBeGreaterThanOrEqual(balanced);
    expect(lopsided).toBeGreaterThan(slight);
    expect(extreme).toBeGreaterThan(lopsided);
  });
});
