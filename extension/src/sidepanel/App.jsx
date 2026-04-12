import { useEffect, useState, useCallback } from 'react';
import FramingBadge from './components/FramingBadge.jsx';
import ReasoningPanel from './components/ReasoningPanel.jsx';
import { getEffectiveCondition } from '../shared/research.js';
import { logEvent, EVENT } from '../shared/events.js';
import { MSG } from '../shared/messages.js';

function EmptyState({ activeUrl }) {
  const onNewsSite = activeUrl && /^https?:\/\//.test(activeUrl);
  return (
    <div className="p-6 text-center text-sm text-gray-500">
      <div className="text-4xl mb-3">📰</div>
      <p className="font-medium text-gray-700 mb-1">
        {onNewsSite ? 'This page has not been analyzed' : 'No article to show'}
      </p>
      <p>
        {onNewsSite
          ? 'EchoBreaker only activates on supported news domains, and only on pages that look like full articles (not homepages or section listings).'
          : 'Visit a news article on a supported site to see its framing and contrasting perspectives.'}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="p-4 space-y-3">
      <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
      <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
      <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
      <div className="h-20 w-full bg-gray-100 rounded animate-pulse" />
      <div className="h-20 w-full bg-gray-100 rounded animate-pulse" />
    </div>
  );
}

function ErrorBanner({ error }) {
  const isNoKey = error.code === 'NO_KEY';
  const isCap = error.code === 'CAP_REACHED';

  return (
    <div className="m-3 p-3 rounded border border-red-200 bg-red-50">
      <div className="text-sm font-medium text-red-800 mb-1">
        {isNoKey ? 'API key required' : isCap ? 'Daily cap reached' : 'Analysis failed'}
      </div>
      <div className="text-xs text-red-700 mb-2">{error.message}</div>
      {(isNoKey || isCap) && (
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="text-xs font-medium text-red-700 underline hover:text-red-900"
          type="button"
        >
          Open settings
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [condition, setCondition] = useState('full');
  const [activeUrl, setActiveUrl] = useState(null);
  const [openedAt] = useState(Date.now());

  // Load condition once
  useEffect(() => {
    getEffectiveCondition().then(setCondition);
  }, []);

  // Log open / close + view duration
  useEffect(() => {
    logEvent(EVENT.SIDEPANEL_OPEN);
    return () => {
      const durationMs = Date.now() - openedAt;
      logEvent(EVENT.SIDEPANEL_CLOSE);
      logEvent(EVENT.SIDEPANEL_VIEW_DURATION, { durationMs });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch analysis for the currently active tab. Called on mount and
  // whenever the active tab changes (or its URL changes). If the URL
  // has never been analyzed, sets analysis to null so the empty state
  // renders; does NOT surface an error.
  const refreshFromActiveTab = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        setActiveUrl(null);
        setAnalysis(null);
        return;
      }
      setActiveUrl(tab.url);

      const res = await chrome.runtime.sendMessage({
        type: MSG.GET_ANALYSIS_FOR_URL,
        data: { url: tab.url },
      });
      if (res?.ok && res.data) {
        setAnalysis(res.data);
        setError(null);
      } else {
        setAnalysis(null);
      }
    } catch (err) {
      // Tab queries can fail on internal pages (chrome://, etc.)
      setAnalysis(null);
    }
  }, []);

  // Initial load + listen for tab activation and URL changes.
  useEffect(() => {
    refreshFromActiveTab();

    // Pre-load analyzing/error state from storage so a page that's
    // mid-analysis renders the loading skeleton immediately.
    chrome.storage.local.get(['latestError', 'analyzing']).then((r) => {
      if (r.latestError) setError(r.latestError);
      if (r.analyzing) setAnalyzing(true);
    });

    const onActivated = () => refreshFromActiveTab();
    const onUpdated = (_tabId, changeInfo, tab) => {
      // Refresh when the active tab's URL changes OR when it finishes
      // loading a new page.
      if (tab?.active && (changeInfo.url || changeInfo.status === 'complete')) {
        refreshFromActiveTab();
      }
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refreshFromActiveTab]);

  // Listen for fresh analyses written by the SW — but only accept them
  // if they match the URL of the currently active tab, so a
  // background tab finishing analysis doesn't yank the side panel
  // out from under the tab the user is actually looking at.
  useEffect(() => {
    const listener = (changes) => {
      if (changes.latestAnalysis) {
        const v = changes.latestAnalysis.newValue;
        if (v && activeUrl && v.url === activeUrl) {
          setAnalysis(v);
          setError(null);
        }
      }
      if (changes.latestError) {
        setError(changes.latestError.newValue);
      }
      if (changes.analyzing) {
        setAnalyzing(!!changes.analyzing.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [activeUrl]);

  if (error) return <ErrorBanner error={error} />;
  if (analyzing && !analysis) return <LoadingState />;
  if (!analysis) return <EmptyState activeUrl={activeUrl} />;

  const a = analysis.analysis;
  const showDetails = condition !== 'control';

  return (
    <div className="p-4 space-y-4 max-w-full">
      {analysis.already_seen && (
        <div className="text-xs text-gray-500 italic">
          Already analyzed — showing cached result.
        </div>
      )}

      <div className="space-y-2">
        <FramingBadge
          framing={a.framing}
          confidence={a.framing_confidence}
          unclear={a.unclear}
        />
        <h2 className="text-sm font-semibold text-gray-900 leading-snug">
          {analysis.title || 'This article'}
        </h2>
        <p className="text-sm text-gray-700 leading-relaxed">{a.summary}</p>
      </div>

      <ReasoningPanel
        reasoning={a.reasoning}
        framingPassages={a.framing_passages}
        agreementRate={a.agreement_rate}
        sampleFramings={a.sample_framings}
        nSamples={a.n_samples}
        unclear={a.unclear}
      />

      {showDetails && (
        <div className="text-xs text-gray-500 border-t border-gray-100 pt-3">
          Bubble score: <strong className="text-gray-700">{Math.round((analysis.bubble_score ?? 0.5) * 100)}</strong>
          {' · '}
          {(a.topics || []).slice(0, 3).join(', ')}
        </div>
      )}

      <p className="text-[10px] text-gray-400 pt-3 border-t border-gray-100 leading-relaxed">
        AI-generated framing labels may be wrong. Treat as a starting point, not ground truth.
      </p>
    </div>
  );
}
