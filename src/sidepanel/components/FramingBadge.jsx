const LABELS = {
  left:    { label: 'Left-leaning',  bg: 'bg-red-100',    fg: 'text-red-700',    border: 'border-red-300' },
  center:  { label: 'Center',        bg: 'bg-gray-100',   fg: 'text-gray-700',   border: 'border-gray-300' },
  right:   { label: 'Right-leaning', bg: 'bg-blue-100',   fg: 'text-blue-700',   border: 'border-blue-300' },
  unclear: { label: 'Mixed signal',  bg: 'bg-yellow-100', fg: 'text-yellow-800', border: 'border-yellow-300' },
};

export default function FramingBadge({ framing, confidence, unclear }) {
  // If the pipeline aggregated to "unclear", render the yellow
  // mixed-signal pill regardless of what framing key was provided.
  const key = unclear ? 'unclear' : framing;
  const cfg = LABELS[key] || LABELS.center;
  const pct = Math.round((confidence ?? 0) * 100);

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${cfg.bg} ${cfg.fg} ${cfg.border}`}>
      <span className="text-sm font-semibold">{cfg.label}</span>
      {!unclear && (
        <span className="text-xs opacity-75">{pct}% confidence</span>
      )}
    </div>
  );
}
