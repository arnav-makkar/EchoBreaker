// Service worker — the central dispatch. Listens for:
//   - PAGE_CONTENT from content script -> runs orchestrator
//   - GET_DASHBOARD from popup
//   - CONSOLIDATE_NOW from popup
//   - FEEDBACK from sidepanel
//   - TEST_KEY from options
//   - CLEAR_DATA / EXPORT_DATA from options
//
// Opens the options page on first install if no API key is set.

import {
  orchestrateAnalysis, consolidateNow, getFullAnalysisForUrl,
} from '../shared/orchestrator.js';
import {
  insertFeedback, getSessionStats, getRecentConsolidations,
  clearAllData, exportAll,
} from '../shared/storage.js';
import { getApiKey, getDailyStatus } from '../shared/settings.js';
import { callGemini } from '../shared/gemini.js';
import { ANALYSIS_SCHEMA } from '../shared/schemas.js';
import { RECENT_URL_TTL_MS } from '../shared/constants.js';
import { MSG } from '../shared/messages.js';
import { logEvent, EVENT } from '../shared/events.js';

// ============================================================
// recent-URL memory (rate limit / dedup window)
// ============================================================

async function wasRecent(url) {
  const { recentUrls = {} } = await chrome.storage.local.get('recentUrls');
  const ts = recentUrls[url];
  return ts && (Date.now() - ts) < RECENT_URL_TTL_MS;
}

async function markRecent(url) {
  const { recentUrls = {} } = await chrome.storage.local.get('recentUrls');
  recentUrls[url] = Date.now();
  const keys = Object.keys(recentUrls);
  if (keys.length > 100) {
    keys
      .sort((a, b) => recentUrls[a] - recentUrls[b])
      .slice(0, keys.length - 100)
      .forEach((k) => delete recentUrls[k]);
  }
  await chrome.storage.local.set({ recentUrls });
}

// ============================================================
// badge
// ============================================================

function setBadgeFromScore(score) {
  const badge = Math.round(score * 100).toString();
  const color = score > 0.7 ? '#e53e3e' : score > 0.4 ? '#dd6b20' : '#38a169';
  chrome.action.setBadgeText({ text: badge });
  chrome.action.setBadgeBackgroundColor({ color });
}

function setBadgeError() {
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#888888' });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
}

// ============================================================
// main analyze flow
// ============================================================

async function handlePageContent({ text, url, title }) {
  await logEvent(EVENT.PAGE_VISIT, { url, title });

  if (await wasRecent(url)) return;

  // Signal "analyzing..." to the side panel.
  await chrome.storage.local.set({
    analyzing: true,
    lastAnalyzedUrl: url,
    latestError: null,
  });

  try {
    const result = await orchestrateAnalysis({ text, url, title });
    await chrome.storage.local.set({
      latestAnalysis: result,
      analyzing: false,
      latestError: null,
    });
    await markRecent(url);
    setBadgeFromScore(result.bubble_score);
  } catch (err) {
    console.error('[EchoBreaker] analyze failed:', err);
    await chrome.storage.local.set({
      analyzing: false,
      latestError: {
        message: err.message,
        code: err.code || 'UNKNOWN',
      },
    });
    setBadgeError();
    if (err.code === 'NO_KEY') {
      chrome.runtime.openOptionsPage();
    }
  }
}

// ============================================================
// message routing
// ============================================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case MSG.PAGE_CONTENT: {
          await handlePageContent(msg.data);
          sendResponse({ ok: true });
          break;
        }

        case MSG.GET_DASHBOARD: {
          await logEvent(EVENT.DASHBOARD_VIEW);
          const stats = await getSessionStats();
          const insights = await getRecentConsolidations(3);
          const daily = await getDailyStatus();
          sendResponse({
            ok: true,
            data: {
              bubble_score: stats.bubble_score,
              pages_analyzed: stats.pages_analyzed,
              source_diversity: stats.source_diversity,
              topic_distribution: stats.topic_distribution,
              recent_insights: insights.map((i) => ({
                insight: i.insight,
                recommendations: i.recommendations || [],
                created_at: i.created_at,
              })),
              daily,
            },
          });
          break;
        }

        case MSG.CONSOLIDATE_NOW: {
          const r = await consolidateNow();
          sendResponse({ ok: true, data: r });
          break;
        }

        case MSG.GET_ANALYSIS_FOR_URL: {
          // Used by the side panel when the user switches tabs — looks
          // up the memory for the given URL and returns a cached
          // FullAnalysis, or null if we've never analyzed this URL.
          const fa = await getFullAnalysisForUrl(msg.data?.url || '');
          sendResponse({ ok: true, data: fa });
          break;
        }

        case MSG.FEEDBACK: {
          await insertFeedback(msg.data);
          // Log the action-specific event for research
          const eventMap = {
            thumbs_up:   EVENT.PERSPECTIVE_THUMBS_UP,
            thumbs_down: EVENT.PERSPECTIVE_THUMBS_DOWN,
            click:       EVENT.PERSPECTIVE_CLICK,
            dismiss:     EVENT.PERSPECTIVE_DISMISS,
          };
          if (eventMap[msg.data.action]) {
            await logEvent(eventMap[msg.data.action], {
              url: msg.data.page_url,
              perspective_id: msg.data.perspective_id,
            });
          }
          sendResponse({ ok: true });
          break;
        }

        case MSG.TEST_KEY: {
          try {
            await callGemini({
              prompt:
                'Respond with a JSON object describing a minimal neutral test article: ' +
                'set framing to "center", topics to ["test"], entities to [], importance 0.1.',
              schema: ANALYSIS_SCHEMA,
              apiKey: msg.data.apiKey,
            });
            sendResponse({ ok: true });
          } catch (err) {
            sendResponse({ ok: false, error: err.message });
          }
          break;
        }

        case MSG.CLEAR_DATA: {
          await clearAllData();
          await chrome.storage.local.remove([
            'latestAnalysis', 'lastAnalyzedUrl', 'latestError',
            'analyzing', 'recentUrls',
          ]);
          clearBadge();
          sendResponse({ ok: true });
          break;
        }

        case MSG.EXPORT_DATA: {
          const bundle = await exportAll();
          await logEvent(EVENT.DATA_EXPORT);
          sendResponse({ ok: true, data: bundle });
          break;
        }

        default:
          sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      console.error('[EchoBreaker] message handler error:', err);
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // keep sendResponse channel open
});

// ============================================================
// startup + install + periodic cleanup
// ============================================================

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => {});

chrome.alarms.create('cleanup-recent-urls', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'cleanup-recent-urls') return;
  const { recentUrls = {} } = await chrome.storage.local.get('recentUrls');
  const now = Date.now();
  let changed = false;
  for (const [url, ts] of Object.entries(recentUrls)) {
    if (now - ts > RECENT_URL_TTL_MS) {
      delete recentUrls[url];
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ recentUrls });
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    if (!(await getApiKey())) {
      chrome.runtime.openOptionsPage();
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await logEvent(EVENT.SESSION_START);
});
