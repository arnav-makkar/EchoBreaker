// Circular gauge for the bubble score. 0 = diverse, 100 = one-sided.
//
// Context-aware labels: "Echo chamber" means different things for
// someone reading only Fox News (right echo chamber) vs someone reading
// only Reuters (center-heavy but not ideologically entrenched). The
// label considers WHICH framing dominates, not just whether diversity
// is low.

function getLabel(pct, sourceDiversity) {
  const { left = 0, center = 0, right = 0 } = sourceDiversity || {};
  const total = left + center + right;

  if (total === 0) return { label: 'No data yet', color: '#9ca3af' };

  // Low score = diverse — same label regardless of distribution.
  if (pct <= 0.3) return { label: 'Diverse', color: '#38a169' };

  // Medium score = moderate, with a directional hint.
  if (pct <= 0.6) {
    const hint = getDominant(left, center, right, total);
    return {
      label: hint ? `Moderate — mostly ${hint}` : 'Moderate range',
      color: '#dd6b20',
    };
  }

  // High score = narrow reading. Label depends on which framing dominates.
  const dominant = getDominant(left, center, right, total);

  if (dominant === 'center') {
    // Reading mostly center is narrow but not ideologically entrenched.
    // "Echo chamber" is the wrong word here — the user isn't being
    // radicalized, they're just not seeing the full spectrum.
    return { label: 'Mostly center — try other views', color: '#dd6b20' };
  }
  if (dominant === 'left') {
    return { label: 'Skewing left', color: '#e53e3e' };
  }
  if (dominant === 'right') {
    return { label: 'Skewing right', color: '#3b82f6' };
  }

  return { label: 'Narrow range', color: '#e53e3e' };
}

function getDominant(left, center, right, total) {
  if (total === 0) return null;
  const fl = left / total;
  const fc = center / total;
  const fr = right / total;
  if (fc > 0.6) return 'center';
  if (fl > fr && fl > 0.5) return 'left';
  if (fr > fl && fr > 0.5) return 'right';
  return null;
}

export default function BubbleGauge({ score = 0.5, sourceDiversity }) {
  const pct = Math.max(0, Math.min(1, score));
  const display = Math.round(pct * 100);

  const { label, color } = getLabel(pct, sourceDiversity);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle
            cx="70" cy="70" r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="10"
          />
          <circle
            cx="70" cy="70" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dashoffset 400ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold text-gray-900">{display}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">of 100</div>
        </div>
      </div>
      <div className="mt-2 text-sm font-semibold text-center leading-tight" style={{ color }}>
        {label}
      </div>
    </div>
  );
}
