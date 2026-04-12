import { useEffect, useState } from 'react';
import {
  getApiKey, setApiKey, clearApiKey,
  getDailyCap, setDailyCap, getDailyStatus, resetDailyCount,
} from '../shared/settings.js';
import {
  hasConsented, getParticipantId, getCondition, isResearchMode,
  acceptConsent, withdrawConsent, clearResearchIdentity,
} from '../shared/research.js';
import { MSG } from '../shared/messages.js';
import { logEvent, EVENT } from '../shared/events.js';

function useAsync(loader, deps = []) {
  const [state, setState] = useState({ loading: true, value: null });
  useEffect(() => {
    let cancelled = false;
    loader().then((v) => { if (!cancelled) setState({ loading: false, value: v }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function Section({ title, children }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function ApiKeySection() {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'testing' | 'ok' | {error}

  useEffect(() => {
    getApiKey().then((k) => { if (k) setKey(k); });
  }, []);

  async function save() {
    await setApiKey(key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function test() {
    setTestResult('testing');
    const res = await chrome.runtime.sendMessage({
      type: MSG.TEST_KEY,
      data: { apiKey: key.trim() },
    });
    if (res?.ok) setTestResult('ok');
    else setTestResult({ error: res?.error || 'Unknown error' });
  }

  async function clear() {
    if (!confirm('Remove the saved API key?')) return;
    await clearApiKey();
    setKey('');
  }

  return (
    <Section title="Gemini API Key">
      <p className="text-sm text-gray-600 mb-4">
        Get a free key from{' '}
        <a
          className="text-blue-600 hover:underline"
          href="https://aistudio.google.com/"
          target="_blank"
          rel="noreferrer"
        >
          Google AI Studio
        </a>
        . Your key is stored locally in your browser and sent only to Google's Gemini API — never to us.
      </p>
      <div className="flex gap-2 mb-3">
        <input
          type={show ? 'text' : 'password'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIza..."
          className="flex-1 rounded border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => setShow((s) => !s)}
          className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
          type="button"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <div className="flex gap-2 items-center">
        <button
          onClick={save}
          disabled={!key.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-gray-300"
          type="button"
        >
          Save
        </button>
        <button
          onClick={test}
          disabled={!key.trim() || testResult === 'testing'}
          className="px-4 py-2 border border-blue-600 text-blue-600 text-sm font-medium rounded hover:bg-blue-50 disabled:opacity-50"
          type="button"
        >
          {testResult === 'testing' ? 'Testing…' : 'Test key'}
        </button>
        <button
          onClick={clear}
          className="px-4 py-2 text-sm text-gray-600 hover:text-red-600"
          type="button"
        >
          Remove
        </button>
        {saved && <span className="text-sm text-green-600 ml-2">Saved ✓</span>}
        {testResult === 'ok' && <span className="text-sm text-green-600 ml-2">Key works ✓</span>}
        {testResult && typeof testResult === 'object' && (
          <span className="text-sm text-red-600 ml-2">{testResult.error}</span>
        )}
      </div>
    </Section>
  );
}

function DailyCapSection() {
  const [cap, setCap] = useState(50);
  const [status, setStatus] = useState({ current: 0, cap: 50 });
  const [saved, setSaved] = useState(false);

  async function refresh() {
    const c = await getDailyCap();
    const s = await getDailyStatus();
    setCap(c);
    setStatus(s);
  }

  useEffect(() => { refresh(); }, []);

  async function save() {
    const n = await setDailyCap(cap);
    setCap(n);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await refresh();
  }

  async function reset() {
    await resetDailyCount();
    await refresh();
  }

  return (
    <Section title="Daily Analyze Cap">
      <p className="text-sm text-gray-600 mb-4">
        EchoBreaker will stop analyzing new articles after this many per day to avoid surprise API charges. Resets at midnight local time.
      </p>
      <div className="flex items-center gap-3 mb-3">
        <input
          type="number"
          min="1"
          max="1000"
          value={cap}
          onChange={(e) => setCap(Number(e.target.value))}
          className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={save}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          type="button"
        >
          Save
        </button>
        {saved && <span className="text-sm text-green-600">Saved ✓</span>}
      </div>
      <p className="text-sm text-gray-600">
        Today: <strong>{status.current}</strong> / {status.cap} analyses
        <button
          onClick={reset}
          className="ml-3 text-blue-600 hover:underline"
          type="button"
        >
          Reset counter
        </button>
      </p>
    </Section>
  );
}

function ResearchSection() {
  const [expanded, setExpanded] = useState(false);
  const [enrolled, setEnrolled] = useState(null); // null=unknown, true/false
  const [pid, setPid] = useState(null);
  const [condition, setCondition] = useState(null);
  const [mode, setMode] = useState(false);

  async function refresh() {
    setEnrolled(await hasConsented());
    setPid(await getParticipantId());
    setCondition(await getCondition());
    setMode(await isResearchMode());
  }

  useEffect(() => { refresh(); }, []);

  async function onAccept() {
    const { participantId, condition } = await acceptConsent();
    await logEvent(EVENT.RESEARCH_CONSENT, { participantId, condition });
    await refresh();
  }

  async function onWithdraw() {
    if (!confirm('Stop collecting new research data? Your existing data stays until you click "Delete all data".')) return;
    await withdrawConsent();
    await logEvent(EVENT.RESEARCH_WITHDRAW);
    await refresh();
  }

  async function onClearIdentity() {
    if (!confirm('Fully remove your research identity and condition? You will need to re-enroll if you want to participate again.')) return;
    await clearResearchIdentity();
    await refresh();
  }

  async function onExport() {
    const res = await chrome.runtime.sendMessage({ type: MSG.EXPORT_DATA });
    if (!res?.ok) return alert(`Export failed: ${res?.error || 'unknown'}`);
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `echobreaker_export_${pid || 'anon'}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Section title="Research Participation">
      <p className="text-sm text-gray-600 mb-3">
        EchoBreaker can optionally record anonymized interaction data for a research study on how people engage with contrasting perspectives.
        Participation is off by default. You can stop anytime.
      </p>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="text-sm text-blue-600 hover:underline mb-3"
        type="button"
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="text-sm text-gray-700 space-y-2 bg-gray-50 p-4 rounded border border-gray-200 mb-4">
          <p>
            <strong>What is collected:</strong> timestamps of analyzed news articles on ~20 allowlisted domains, hashed URLs (not the full URL), the framing label EchoBreaker assigned, whether you opened the side panel, and whether you clicked or reacted to perspective cards.
          </p>
          <p>
            <strong>What is NOT collected:</strong> article text after analysis, real names, email addresses, browsing on non-news sites, keyboard or mouse tracking, screen recordings.
          </p>
          <p>
            <strong>Where it goes:</strong> everything stays on your machine until you click "Export research data" and upload the file to the research team. No automatic telemetry.
          </p>
          <p>
            <strong>Your rights:</strong> you can withdraw at any time (stops new collection), delete all your data (erases history), and request deletion of already-exported data up to the analysis freeze date.
          </p>
          <p>
            <strong>Condition assignment:</strong> by accepting, you are randomly assigned (blinded) to one of two versions of EchoBreaker. The assignment is deterministic from a random identifier and cannot be changed after enrollment.
          </p>
        </div>
      )}

      {enrolled === false && (
        <button
          onClick={onAccept}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
          type="button"
        >
          Accept and enroll
        </button>
      )}

      {enrolled === true && (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">
            <div>Status: <strong>{mode ? 'Enrolled — data collection on' : 'Withdrawn — data collection off'}</strong></div>
            <div>Participant ID: <code className="text-xs">{pid}</code></div>
            <div>Condition: <code className="text-xs">Enrolled</code> (blinded)</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onExport}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
              type="button"
            >
              Export research data
            </button>
            {mode && (
              <button
                onClick={onWithdraw}
                className="px-4 py-2 border border-yellow-600 text-yellow-700 text-sm font-medium rounded hover:bg-yellow-50"
                type="button"
              >
                Withdraw
              </button>
            )}
            <button
              onClick={onClearIdentity}
              className="px-4 py-2 border border-red-600 text-red-600 text-sm font-medium rounded hover:bg-red-50"
              type="button"
            >
              Remove research identity
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function DangerSection() {
  const [cleared, setCleared] = useState(false);

  async function onClear() {
    if (!confirm('Delete ALL EchoBreaker data (memories, consolidations, feedback, session, events)? This cannot be undone.')) return;
    const res = await chrome.runtime.sendMessage({ type: MSG.CLEAR_DATA });
    if (res?.ok) {
      setCleared(true);
      setTimeout(() => setCleared(false), 2500);
    }
  }

  return (
    <Section title="Data">
      <p className="text-sm text-gray-600 mb-3">
        All data lives in this browser's IndexedDB. Clearing here is irreversible.
      </p>
      <button
        onClick={onClear}
        className="px-4 py-2 border border-red-600 text-red-600 text-sm font-medium rounded hover:bg-red-50"
        type="button"
      >
        Delete all data
      </button>
      {cleared && <span className="ml-3 text-sm text-green-600">Cleared ✓</span>}
    </Section>
  );
}

function AboutSection() {
  return (
    <Section title="About EchoBreaker">
      <p className="text-sm text-gray-600 leading-relaxed">
        EchoBreaker reads article text on ~20 allowlisted news sites, classifies the framing using Google's Gemini model with your API key, and shows contrasting perspectives from a curated database. All data stays on your machine. The framing classifier is AI-generated and can be wrong — treat the labels as a starting point, not ground truth.
      </p>
    </Section>
  );
}

export default function App() {
  useEffect(() => {
    logEvent(EVENT.SETTINGS_OPEN);
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">EchoBreaker</h1>
        <p className="text-gray-500 mt-1">Settings</p>
      </header>

      <ApiKeySection />
      <DailyCapSection />
      <ResearchSection />
      <DangerSection />
      <AboutSection />

      <footer className="text-xs text-gray-400 text-center mt-8">
        EchoBreaker v0.1.0 · Local-first · BYO Gemini key
      </footer>
    </div>
  );
}
