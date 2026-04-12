import { useEffect, useState } from 'react';
import { MSG } from '../../shared/messages.js';
import { logEvent, EVENT } from '../../shared/events.js';

const FRAMING_COLORS = {
  left:   'text-red-700 bg-red-50 border-red-200',
  center: 'text-gray-700 bg-gray-50 border-gray-200',
  right:  'text-blue-700 bg-blue-50 border-blue-200',
};

const FRAMING_LABELS = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
};

export default function PerspectiveCard({ perspective, pageUrl }) {
  const [voted, setVoted] = useState(null); // 'up' | 'down' | null

  useEffect(() => {
    logEvent(EVENT.PERSPECTIVE_IMPRESSION, {
      perspective_id: perspective.id,
      source: perspective.source,
      framing: perspective.framing,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspective.id]);

  async function sendFeedback(action) {
    try {
      await chrome.runtime.sendMessage({
        type: MSG.FEEDBACK,
        data: {
          page_url: pageUrl,
          perspective_id: perspective.id,
          action,
        },
      });
    } catch (err) {
      console.warn('Feedback send failed:', err);
    }
  }

  function onThumbsUp() {
    setVoted('up');
    sendFeedback('thumbs_up');
  }

  function onThumbsDown() {
    setVoted('down');
    sendFeedback('thumbs_down');
  }

  function onOpen() {
    sendFeedback('click');
  }

  const framingClass = FRAMING_COLORS[perspective.framing] || FRAMING_COLORS.center;
  const framingLabel = FRAMING_LABELS[perspective.framing] || 'Center';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="text-xs text-gray-500 font-medium">{perspective.source}</div>
          <a
            href={perspective.url}
            target="_blank"
            rel="noreferrer"
            onClick={onOpen}
            className="text-sm font-semibold text-gray-900 hover:text-blue-600 leading-snug block"
          >
            {perspective.title}
          </a>
        </div>
        <span className={`ml-2 shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border ${framingClass}`}>
          {framingLabel}
        </span>
      </div>
      <p className="text-xs text-gray-600 italic leading-relaxed mb-2">
        "{perspective.framing_diff}"
      </p>
      {perspective.snippet && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">
          {perspective.snippet}
        </p>
      )}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={onThumbsUp}
          disabled={voted}
          className={`text-xs px-2 py-1 rounded border ${
            voted === 'up'
              ? 'bg-green-100 border-green-300 text-green-700'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          } disabled:opacity-60`}
          type="button"
          aria-label="Thumbs up"
        >
          👍 Useful
        </button>
        <button
          onClick={onThumbsDown}
          disabled={voted}
          className={`text-xs px-2 py-1 rounded border ${
            voted === 'down'
              ? 'bg-red-100 border-red-300 text-red-700'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          } disabled:opacity-60`}
          type="button"
          aria-label="Thumbs down"
        >
          👎 Not helpful
        </button>
        <a
          href={perspective.url}
          target="_blank"
          rel="noreferrer"
          onClick={onOpen}
          className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 ml-auto"
        >
          Open ↗
        </a>
      </div>
    </div>
  );
}
