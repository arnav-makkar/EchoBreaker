// Bubble score: 1 = total echo chamber, 0 = perfectly balanced across
// {left, center, right}. Based on Shannon entropy of the framing
// distribution, normalized to [0, 1] by dividing by log2(3).
//
// An empty distribution returns 0.5 (neutral starting point) rather than
// 0 or 1, so a fresh install doesn't accidentally render a red badge.

export function computeBubbleScore(sourceDiversity) {
  const counts = Object.values(sourceDiversity || {});
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0.5;

  let entropy = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      entropy -= p * Math.log2(p);
    }
  }

  const maxEntropy = Math.log2(3); // 3 framing categories
  const score = 1 - entropy / maxEntropy;
  // Clamp + round to 3 decimals.
  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}
