import { useState } from 'react';

// Displays the 2-stage pipeline's audit output:
//   - A "Why this label?" collapsible showing the chain-of-thought
//     reasoning trace from the winning classification sample.
//   - The framing-loaded passages extracted in Stage 1.
//   - An agreement-rate badge showing how many of the N samples voted
//     for this label (3/3, 2/3, or "mixed" for unclear).
//
// Guards against legacy memories that don't have these fields.

function AgreementBadge({ agreementRate, nSamples, unclear }) {
  if (typeof agreementRate !== 'number' || !nSamples) return null;

  const agree = Math.round(agreementRate * nSamples);
  const color = unclear
    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
    : agree === nSamples
    ? 'bg-green-100 text-green-800 border-green-300'
    : 'bg-orange-100 text-orange-800 border-orange-300';

  const label = unclear
    ? 'Mixed signal'
    : `${agree}/${nSamples} samples agreed`;

  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${color}`}
      title={
        unclear
          ? 'The three classifier samples disagreed — EchoBreaker is not confident on this article.'
          : `Self-consistency check: ${agree} of ${nSamples} classifier samples voted the same way.`
      }
    >
      {label}
    </span>
  );
}

function SampleDots({ sampleFramings }) {
  if (!Array.isArray(sampleFramings) || sampleFramings.length === 0) return null;

  const DOT = {
    left:    'bg-red-500',
    center:  'bg-gray-400',
    right:   'bg-blue-500',
    unclear: 'bg-yellow-400',
  };

  return (
    <span className="inline-flex gap-0.5 ml-1 align-middle" title="Individual sample votes">
      {sampleFramings.map((f, i) => (
        <span
          key={i}
          className={`inline-block w-2 h-2 rounded-full ${DOT[f] || 'bg-gray-300'}`}
          title={`sample ${i + 1}: ${f}`}
        />
      ))}
    </span>
  );
}

function PassageList({ passages }) {
  if (!Array.isArray(passages) || passages.length === 0) return null;

  return (
    <div className="space-y-2 mt-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
        Framing-loaded passages (Stage 1)
      </div>
      {passages.map((p, i) => (
        <div
          key={i}
          className="bg-amber-50 border-l-2 border-amber-300 pl-2 py-1 rounded-r"
        >
          <p className="text-xs italic text-gray-800">"{p.quote}"</p>
          <p className="text-[10px] text-gray-600 mt-0.5">→ {p.why}</p>
        </div>
      ))}
    </div>
  );
}

export default function ReasoningPanel({
  reasoning,
  framingPassages,
  agreementRate,
  sampleFramings,
  nSamples,
  unclear,
}) {
  const [expanded, setExpanded] = useState(false);

  // Bail if the memory has no pipeline audit fields at all (legacy).
  const hasAudit =
    (reasoning && reasoning.length > 0) ||
    (Array.isArray(framingPassages) && framingPassages.length > 0) ||
    typeof agreementRate === 'number';

  if (!hasAudit) return null;

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <AgreementBadge
            agreementRate={agreementRate}
            nSamples={nSamples}
            unclear={unclear}
          />
          <SampleDots sampleFramings={sampleFramings} />
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
          type="button"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide reasoning ▴' : 'Why this label? ▾'}
        </button>
      </div>

      {expanded && (
        <div className="bg-gray-50 border border-gray-200 rounded p-2.5 space-y-2">
          {reasoning && (
            <div>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Classifier reasoning (Stage 2)
              </div>
              <p className="text-xs text-gray-700 leading-relaxed">
                {reasoning}
              </p>
            </div>
          )}
          <PassageList passages={framingPassages} />
          <div className="text-[10px] text-gray-400 italic pt-1 border-t border-gray-200">
            EchoBreaker runs a 2-stage pipeline: an extraction call pulls
            evidence, then {nSamples || 3} classification calls at
            different temperatures vote on the label. The reasoning above
            is from the most-confident sample that voted for the winning
            label.
          </div>
        </div>
      )}
    </div>
  );
}
