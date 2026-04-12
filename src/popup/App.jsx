import { useEffect, useState } from 'react';
import BubbleGauge from './components/BubbleGauge.jsx';
import DietChart from './components/DietChart.jsx';
import InsightsList from './components/InsightsList.jsx';
import { MSG } from '../shared/messages.js';
import { getEffectiveCondition } from '../shared/research.js';

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reflecting, setReflecting] = useState(false);
  const [condition, setCondition] = useState('full');
  const [reflectMsg, setReflectMsg] = useState(null);

  async function loadDashboard() {
    const res = await chrome.runtime.sendMessage({ type: MSG.GET_DASHBOARD });
    if (res?.ok) setDashboard(res.data);
    setLoading(false);
  }

  useEffect(() => {
    getEffectiveCondition().then(setCondition);
    loadDashboard();
  }, []);

  async function onReflect() {
    setReflecting(true);
    setReflectMsg(null);
    const res = await chrome.runtime.sendMessage({ type: MSG.CONSOLIDATE_NOW });
    setReflecting(false);
    if (!res?.ok) {
      setReflectMsg({ error: res?.error || 'Reflection failed' });
      return;
    }
    if (res.data?.skipped) {
      setReflectMsg({ info: res.data.reason });
    }
    await loadDashboard();
  }

  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  async function openSidePanel() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId != null) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close();
      }
    } catch (err) {
      console.warn('Could not open side panel:', err);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">Loading…</div>
    );
  }

  const showFullUi = condition !== 'control';

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900">EchoBreaker</h1>
          <p className="text-[10px] text-gray-500">
            {dashboard?.pages_analyzed || 0} pages analyzed · {dashboard?.daily?.current || 0}/{dashboard?.daily?.cap || 50} today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openSidePanel}
            className="text-xs text-blue-600 hover:text-blue-800"
            type="button"
            aria-label="Open side panel"
          >
            ◨ Panel
          </button>
          <button
            onClick={openSettings}
            className="text-xs text-gray-500 hover:text-gray-900"
            type="button"
            aria-label="Open settings"
          >
            ⚙ Settings
          </button>
        </div>
      </header>

      {showFullUi ? (
        <>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <BubbleGauge
              score={dashboard?.bubble_score ?? 0.5}
              sourceDiversity={dashboard?.source_diversity}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <DietChart sourceDiversity={dashboard?.source_diversity || {}} />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
            <InsightsList insights={dashboard?.recent_insights || []} />
            <button
              onClick={onReflect}
              disabled={reflecting}
              className="w-full mt-2 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:bg-gray-300"
              type="button"
            >
              {reflecting ? 'Reflecting…' : 'Reflect now'}
            </button>
            {reflectMsg?.info && <p className="text-[10px] text-gray-500 mt-1">{reflectMsg.info}</p>}
            {reflectMsg?.error && <p className="text-[10px] text-red-600 mt-1">{reflectMsg.error}</p>}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-sm text-gray-700 font-medium">
            {dashboard?.pages_analyzed || 0} articles analyzed
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {dashboard?.daily?.current || 0}/{dashboard?.daily?.cap || 50} today
          </p>
          <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
            You are in the research control condition. The dashboard is intentionally minimal.
          </p>
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center">
        AI-generated labels may be wrong.
      </p>
    </div>
  );
}
