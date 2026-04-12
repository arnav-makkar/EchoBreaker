export default function InsightsList({ insights = [] }) {
  if (!insights.length) {
    return (
      <div className="text-xs text-gray-500 text-center py-2 italic">
        No reflections yet. Read a few articles and hit "Reflect now".
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Reflections
      </h3>
      {insights.map((ins, i) => (
        <div key={i} className="bg-blue-50 border border-blue-100 rounded p-2 text-xs text-gray-700 leading-relaxed">
          {ins.insight}
          {ins.recommendations && ins.recommendations.length > 0 && (
            <ul className="mt-1.5 pl-4 list-disc text-gray-600 space-y-0.5">
              {ins.recommendations.slice(0, 3).map((r, j) => (
                <li key={j}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
