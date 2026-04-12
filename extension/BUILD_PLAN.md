# EchoBreaker — Build + Research Plan

> **Artifact goal:** A Chrome extension that detects media framing on news articles, shows contrasting perspectives from a curated article database, tracks a "bubble score" across browsing, and runs on-demand memory consolidation. **No backend server.** The extension calls the Gemini API directly with the user's own key and stores everything locally in IndexedDB. Core build is one day; research instrumentation and evaluation extend over multiple weeks.

> **Research goal:** A mixed-methods Human-AI Interaction paper built on a 2-week field deployment (N≈40, between-subjects control vs. full condition), a human-labeled framing benchmark with inter-rater reliability reported, and 5–8 semi-structured exit interviews. Target venues: CHI (full paper) or IUI (full or short paper) as primary; CSCW or FAccT as alternates.

**Builder (code):** Claude Code (all code, `articles.json`, benchmark harness, IRB drafts, survey instruments, interview protocol, analysis notebooks).
**Manual steps (you):** install Node, `npm install`, paste a Gemini API key into the Options page, load the unpacked extension. Then, for the research phases: obtain IRB approval at your institution, recruit participants, conduct interviews, run the study.
**Runtime:** Chrome (MV3), ES modules, React + Vite, `idb` for IndexedDB, direct REST to `generativelanguage.googleapis.com`.
**No Python in the extension. No FastAPI. No uvicorn. No CORS. No ADK.** A small Node benchmark harness (Phase 6) is the only non-extension code, and only runs offline on labeled data.

> **Why extension-only:** the Python backend only existed to call Gemini from the same process as the SQLite DB. Chrome extensions can do both directly. Gemini's REST API supports `responseMimeType: "application/json"` + `responseSchema`, which eliminates the entire "parse the LLM output, hope it's valid JSON" class of bugs the ADK version would give us. This path is simpler, Chrome-Web-Store-ready, and has zero throwaway code.

---

## Research Framing

### Research questions

- **RQ1 (behavioral).** Over a 2-week field deployment, does the full EchoBreaker intervention (framing labels + contrasting perspectives + bubble score + consolidation insights) change users' source diversity, framing diversity, and cross-aisle exposure rate relative to a control arm that logs the same data without showing perspectives, score, or insights?
- **RQ2 (trust & calibration).** When, and for whom, do users trust AI-generated framing labels? How does trust relate to the model's confidence score, topic familiarity, political orientation, and news knowledge?
- **RQ3 (reflective informatics).** Does surfacing AI-generated "consolidation insights" over browsing history change how users describe and reason about their own reading patterns — independently of whether it changes behavior?
- **RQ4 (design).** Which interface elements (framing badge, per-article contrast cards, aggregated bubble score, reflective insights) drive engagement, which are ignored, and where do the failure modes of LLM-based classification become visible to users?

These are pre-registered before main data collection (Phase 7.5), including the analysis plan.

### Theoretical anchors

The paper grounds in, and where appropriate pushes back on, these literatures:

- **Selective exposure and filter bubbles.** Pariser 2011 (popular framing); Stroud 2010, Garrett 2009 (empirical selective exposure); Bakshy, Messing & Adamic 2015 (evidence that algorithmic filtering is smaller than choice-based filtering — *must cite honestly, not strawman*).
- **Reflective and lived informatics.** Baumer 2015 ("reflective informatics"); Rapp & Tirassa 2017; personal-informatics tradition (Li, Dey & Forlizzi).
- **Inoculation theory and misinformation resilience.** Roozenbeek & van der Linden 2019; Lewandowsky et al. 2020.
- **Accuracy nudges and cognitive reflection.** Pennycook et al. 2020, 2021; Fazio et al.
- **Trust, calibration, and explainable AI.** Bansal et al. 2019; Lai & Tan 2019; Miller 2019; Wang et al. 2019.
- **Value-sensitive design.** Friedman & Hendry 2019.
- **Backfire / belief entrenchment.** Nyhan & Reifler 2010 (the classic); later literature is mixed (Wood & Porter 2019). Cited as a risk our design must take seriously, not assume away.

### Positioning — what's actually new

Prior systems we benchmark against:

| System | What it does | What EchoBreaker does differently |
|---|---|---|
| **AllSides** | Editor-curated source-level bias ratings, topic comparison pages | Per-article LLM classification, not source-level labels |
| **Ground News** | Multi-source comparison, bias ratings, blindspot indicator | Local-first, personalized memory, no central server |
| **The Flip Side** | Daily email newsletter with left/center/right summaries | In-context per-article intervention, not a newsletter |
| **Read Across the Aisle** | iOS app, tracks bias of articles read, color-coded timeline | Active contrasting-perspective injection + memory consolidation |
| **Escape Your Bubble** | Facebook extension, injects cross-partisan content | Operates on article reading, not social feed; transparent about AI role |
| **Gobo (MIT)** | User-controlled algorithmic filter sliders on social feeds | Not a filter; a reflection tool over existing reading |
| **NewsCube** (Park et al. 2009) | Multi-view news aggregator | Per-article in-context rather than separate aggregator |
| **Balancer** (Munson & Resnick 2010) | Tracked and visualized balance of political reading | Adds per-article LLM framing + memory consolidation insight |

**Claimed novel contributions (to be validated, not merely asserted, by the study):**

1. **Per-article LLM framing classification + explanation**, operating on the text the user is actually reading, not source-level labels. This is the right granularity for distinguishing news from opinion within the same outlet, and for handling topic-specific framing.
2. **Cross-session memory consolidation** — explicit always-on memory pattern (Ingest → Consolidate → Query) that reviews aggregated browsing and surfaces reflective insights, not one-shot per-article contrasts.
3. **Local-first, BYO-key architecture** — no data leaves the device; the privacy story is enforced by architecture, not policy. Enables a research deployment where participants hold their own logs until they explicitly export them.

Whether any of these *matter* for user outcomes is itself RQ1–RQ3. Don't overclaim in the introduction.

### Pre-declared limitations (honest, stated in the paper)

These go in the paper's Limitations section and shape the design, not just the discussion:

- **The LLM classifier has documented political asymmetries.** Phase 6 includes an explicit political-bias audit of the classifier before deployment. Results go in the paper whether they're favorable or not.
- **The source-halo bias is mitigated but not eliminated.** The classifier input is now blinded by default (URL and title stripped before sending to Gemini — see `CLASSIFIER_BLINDED` in `src/shared/constants.js`). This removes the most obvious leak. It does not eliminate the effect entirely: article body text extracted by the content script sometimes includes bylines and masthead references that name the outlet, and the model may still pattern-match on those. Phase 6.3.5's source-halo audit measures the residual leak quantitatively (see below).
- **Left / center / right is a contested simplification.** It's US-centric, ignores authoritarian/libertarian and economic/social axes, and handles populism poorly. We use it because it's how the curated article database and the existing literature are organized, not because it's correct. The paper states this explicitly in Related Work, not buried in Limitations.
- **L/C/R is an especially poor fit for Indian political discourse**, which is more naturally organized around BJP/Congress/regional, Hindu-nationalist/secular, and pro-reform/pro-welfare axes. The classifier uses L/C/R for Indian content anyway because (a) it is what the curated DB and prior literature use and (b) multi-taxonomy classification is out of scope for the day-one build. The prompt's framing guide includes an Indian-context paragraph that maps the axes by analogy, but the analogy is imperfect. Indian-outlet entries in the curated DB label themselves on the same axis to keep retrieval consistent.
- **43 allowlisted domains now span US/UK English + Indian English + Indian Hindi.** The Indian additions broaden the study population beyond the WEIRD US pool but introduce new confounds: the classifier may perform worse on Indian political text than on US text (to be measured in Phase 6), and Hindi content has no curated contrasting perspectives yet. Generalization claims are scoped accordingly.
- **The curated `articles.json` is curator-biased.** Who decided which articles are "left" or "right" shapes every contrast the system shows. Phase 1.2 documents the curation protocol; Phase 6 audits the curated DB for balance.
- **N ≈ 40 over 2 weeks is short for habit-change claims.** Behavioral effects detectable at this scale are effect sizes d ≥ ~0.6. Smaller effects are reported but not claimed as significant.
- **The bubble-score gauge is an intervention confound.** A factorial design that separates perspectives, score, and insights would need 4+ conditions and N > 100. We pre-commit to treating the full bundle as one intervention and discussing this as a limitation.
- **Self-selection bias.** People who install an anti-filter-bubble extension are not a random sample of news readers. Prolific or university-recruited samples partially mitigate, but do not eliminate, this.
- **Source-label as ground truth is a fallacy** and we do not use it. Our ground truth (Phase 6.1) is human-coded at the article level with inter-rater reliability reported.
- **The backfire effect is a real risk.** Showing people opposing viewpoints may entrench beliefs rather than moderate them. The study measures for this (attitude-change items in pre/post) and discusses findings regardless of direction.

---

## What the extension does (end-user view)

**Who it's for:** someone who reads news online and wants to see how one-sided their reading is, and what perspectives they're missing.

**What they install:** a Chrome extension. After loading it, nothing visible changes on normal websites — it only activates on ~20 major news domains (NYT, WaPo, Fox, CNN, BBC, Guardian, WSJ, Reuters, AP, etc.).

**First-run:** an Options page opens asking them to paste a free Gemini API key (from [aistudio.google.com](https://aistudio.google.com)). This is stored locally in `chrome.storage.local`, never transmitted except directly to Google's Gemini API.

**While browsing, they see:**

1. **A colored number badge on the extension icon** (0–100) — the "bubble score." Green = diverse reading, red = echo chamber. Updates live.
2. **A side panel** (click the icon) with, per article:
   - A plain-English framing label (left / center / right) with confidence %.
   - A 2-3 sentence summary.
   - 2-3 "contrasting perspective" cards — articles from the curated DB on the same topic but different leaning, each with an explanation of *how* the framing differs. Thumbs-up / thumbs-down on each.
3. **A popup dashboard** with:
   - A circular bubble-score gauge with one-word verdict.
   - A bar chart of their reading diet (left / center / right counts).
   - A list of "consolidation insights" — short AI-generated observations like *"You read 8 climate articles this week, 75% left-leaning. You're missing industry cost analyses."*
   - A "Reflect now" button that generates a fresh insight on demand.

**Privacy story:** every memory is local (IndexedDB). The only network call is the user's own Gemini key → Google. No server, no telemetry, no tracking.

**What it is not:** not a fact-checker, not a recommender, not training data for anything. It classifies framing, not truth.

---

## Architecture

```
Chrome Extension (MV3, all contexts share IndexedDB)
+---------------------------------------------------------+
|                                                         |
|  Content Script (on allowlisted news domains only)      |
|    - DOM extraction -> { text, url, title }             |
|    - sendMessage to SW                                  |
|                                                         |
|  Service Worker (background/service-worker.js)          |
|    - onMessage -> orchestrator.analyze(...)             |
|    - Sets badge from bubble_score                       |
|    - Writes latestAnalysis to chrome.storage.local      |
|    - chrome.alarms cleanup for recent-URL cache         |
|                                                         |
|  Shared modules (src/shared/)                           |
|    storage.js   - IndexedDB wrapper (idb)               |
|    gemini.js    - callGemini(prompt, schema, apiKey)    |
|    agents.js    - analyzeContent, runConsolidation      |
|    retriever.js - findPerspectives (curated DB)         |
|    orchestrator.js - the analyze -> store flow          |
|    settings.js  - apiKey + dailyCap getters/setters     |
|    articles.json - 80-120 curated articles              |
|                                                         |
|  UI contexts                                            |
|    sidepanel/   - React: framing badge + cards          |
|    popup/       - React: gauge + chart + insights       |
|    options/     - React: API key + daily cap settings   |
|                                                         |
+---------------------------------------------------------+
             |                              |
             |  IndexedDB (local)           |  HTTPS fetch (user's key)
             v                              v
   +-----------------------+     +--------------------------------+
   | echobreaker DB        |     | generativelanguage.googleapis  |
   |  memories             |     |   models/gemini-2.0-flash-lite |
   |  consolidations       |     |   :generateContent             |
   |  feedback             |     +--------------------------------+
   |  session (singleton)  |
   +-----------------------+
```

---

## Phase 0 — Setup (20 min)

### 0.1 Repo layout

```
echobreaker/
├── extension/
│   ├── manifest.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── package.json
│   ├── public/
│   │   └── icons/{icon16,icon48,icon128}.png
│   └── src/
│       ├── shared/
│       │   ├── constants.js          # NEWS_ALLOWLIST, DB_NAME, MODEL_NAME
│       │   ├── schemas.js            # Gemini responseSchemas
│       │   ├── settings.js           # apiKey + dailyCap getters/setters
│       │   ├── storage.js            # IndexedDB wrapper
│       │   ├── gemini.js             # callGemini helper
│       │   ├── agents.js             # analyzeContent + runConsolidation
│       │   ├── retriever.js          # findPerspectives
│       │   ├── orchestrator.js       # main analyze flow
│       │   ├── bubble.js             # compute bubble score
│       │   ├── articles.json         # 80-120 curated articles
│       │   ├── messages.js           # typed message constants
│       │   ├── events.js             # [research] event logger (Phase 5)
│       │   └── research.js           # [research] participant ID + condition + consent
│       ├── content/
│       │   └── content.js
│       ├── background/
│       │   └── service-worker.js
│       ├── options/
│       │   ├── index.html
│       │   ├── index.jsx
│       │   └── App.jsx
│       ├── sidepanel/
│       │   ├── index.html
│       │   ├── index.jsx
│       │   ├── App.jsx
│       │   └── components/{FramingBadge,PerspectiveCard,FeedbackButtons}.jsx
│       └── popup/
│           ├── index.html
│           ├── index.jsx
│           ├── App.jsx
│           └── components/{BubbleGauge,DietChart,InsightsList}.jsx
├── README.md
└── .gitignore
```

### 0.2 extension/package.json key deps

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "recharts": "^2.12.0",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@crxjs/vite-plugin": "^2.0.0-beta",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "vitest": "^2.0.0",
    "fake-indexeddb": "^6.0.0"
  }
}
```

`@crxjs/vite-plugin` handles MV3 manifest transformation, service-worker bundling, HMR, and content-script injection. Vite + ES modules means `import` statements work everywhere including the service worker (with `"type": "module"` in the manifest).

### 0.3 No `.env`

There is no `.env`. The Gemini API key is entered by the user in the Options page and stored in `chrome.storage.local`. Developers testing locally do the same — open the Options page, paste your key.

---

## Phase 1 — Curated articles + core libs (2 hours)

### 1.1 `src/shared/constants.js`

```js
export const DB_NAME = 'echobreaker';
export const DB_VERSION = 1;

export const MODEL_NAME = 'gemini-2.0-flash-lite';
export const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

// Mirror of manifest content_scripts.matches, used for client-side checks
export const NEWS_ALLOWLIST = [
  'nytimes.com', 'washingtonpost.com', 'foxnews.com', 'cnn.com',
  'bbc.com', 'bbc.co.uk', 'theguardian.com', 'wsj.com',
  'reuters.com', 'apnews.com', 'nbcnews.com', 'cbsnews.com',
  'npr.org', 'politico.com', 'breitbart.com', 'theatlantic.com',
  'economist.com', 'bloomberg.com', 'axios.com', 'vox.com',
];

export const RECENT_URL_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_DAILY_CAP = 50;
export const MAX_CONSOLIDATION_BATCH = 50;
export const MIN_CONSOLIDATION_BATCH = 3;
```

### 1.2 `src/shared/articles.json` (Claude generates this)

80–120 hand-curated items across roughly 15 topics × 3 leanings. Each entry:

```json
{
  "id": "imm-l-01",
  "title": "The Human Cost of Border Enforcement",
  "url": "https://example.com/imm-l-01",
  "source": "The Guardian",
  "framing": "left",
  "topics": ["immigration", "border", "human rights"],
  "entities": ["ICE", "border patrol"],
  "snippet": "A short 1-2 sentence teaser..."
}
```

**Topic buckets to cover** (each with a left/center/right trio at minimum):
immigration, climate/energy, economy/inflation, healthcare, abortion, gun policy, foreign policy (Ukraine, Israel, China), tech regulation, education, policing/criminal justice, taxes, labor/unions, voting rights, trade, AI regulation.

**Source mix:** The Guardian, Vox, The Atlantic, NYT, WaPo (left/center-left); Reuters, AP, BBC, NPR, Axios, Bloomberg (center); WSJ, The Economist (center-right); Fox News, Breitbart, NY Post (right). IDs follow `{topic}-{l|c|r}-{nn}` for readability in the consolidation prompt.

### 1.3 `src/shared/schemas.js`

```js
// Passed to Gemini as responseSchema — it will refuse to return anything
// that doesn't match. This removes the entire "parse the LLM output
// carefully" class of bugs.

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary:            { type: 'string' },
    framing:            { type: 'string', enum: ['left', 'center', 'right'] },
    framing_confidence: { type: 'number' },
    sentiment:          { type: 'number' },
    topics:             { type: 'array', items: { type: 'string' } },
    entities:           { type: 'array', items: { type: 'string' } },
    importance:         { type: 'number' },
  },
  required: [
    'summary', 'framing', 'framing_confidence', 'sentiment',
    'topics', 'entities', 'importance',
  ],
};

export const CONSOLIDATION_SCHEMA = {
  type: 'object',
  properties: {
    connections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from_id: { type: 'number' },
          to_id:   { type: 'number' },
          reason:  { type: 'string' },
        },
        required: ['from_id', 'to_id', 'reason'],
      },
    },
    insight:         { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
  required: ['connections', 'insight', 'recommendations'],
};
```

### 1.4 `src/shared/settings.js`

```js
import { DEFAULT_DAILY_CAP } from './constants.js';

const KEYS = {
  apiKey:      'gemini_api_key',
  dailyCap:    'daily_cap',
  dailyCount:  'daily_count',
  dailyDate:   'daily_date',
};

export async function getApiKey() {
  const { [KEYS.apiKey]: key } = await chrome.storage.local.get(KEYS.apiKey);
  return key || null;
}

export async function setApiKey(key) {
  await chrome.storage.local.set({ [KEYS.apiKey]: key });
}

export async function getDailyCap() {
  const { [KEYS.dailyCap]: cap } = await chrome.storage.local.get(KEYS.dailyCap);
  return cap ?? DEFAULT_DAILY_CAP;
}

export async function setDailyCap(cap) {
  await chrome.storage.local.set({ [KEYS.dailyCap]: cap });
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function checkAndIncrementDailyCount() {
  const { [KEYS.dailyCount]: count = 0, [KEYS.dailyDate]: date = '' } =
    await chrome.storage.local.get([KEYS.dailyCount, KEYS.dailyDate]);
  const cap = await getDailyCap();
  const now = today();
  const current = (date === now) ? count : 0;
  if (current >= cap) {
    return { allowed: false, current, cap };
  }
  await chrome.storage.local.set({
    [KEYS.dailyCount]: current + 1,
    [KEYS.dailyDate]:  now,
  });
  return { allowed: true, current: current + 1, cap };
}

export async function getDailyStatus() {
  const { [KEYS.dailyCount]: count = 0, [KEYS.dailyDate]: date = '' } =
    await chrome.storage.local.get([KEYS.dailyCount, KEYS.dailyDate]);
  const cap = await getDailyCap();
  const current = (date === today()) ? count : 0;
  return { current, cap };
}
```

### 1.5 `src/shared/bubble.js`

```js
export function computeBubbleScore(sourceDiversity) {
  const counts = Object.values(sourceDiversity);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0.5;
  let entropy = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      entropy -= p * Math.log2(p);
    }
  }
  const maxEntropy = Math.log2(3);
  return Math.round((1 - entropy / maxEntropy) * 1000) / 1000;
}
```

**Unit tests (`bubble.test.js`):** balanced 3/3/3 → 0, all-left → 1, empty → 0.5.

### 1.6 `src/shared/storage.js`

```js
import { openDB } from 'idb';
import { DB_NAME, DB_VERSION } from './constants.js';
import { computeBubbleScore } from './bubble.js';

let _dbPromise = null;
function getDb() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const mem = db.createObjectStore('memories', {
          keyPath: 'id', autoIncrement: true,
        });
        mem.createIndex('url', 'url', { unique: true });
        mem.createIndex('consolidated', 'consolidated');

        db.createObjectStore('consolidations', {
          keyPath: 'id', autoIncrement: true,
        });
        db.createObjectStore('feedback', {
          keyPath: 'id', autoIncrement: true,
        });
        db.createObjectStore('session', { keyPath: 'id' });
      },
    });
  }
  return _dbPromise;
}

// ---- memories ----

export async function upsertMemory({ url, title, text, analysis }) {
  const db = await getDb();
  const tx = db.transaction('memories', 'readwrite');
  const store = tx.objectStore('memories');
  const existing = await store.index('url').get(url);
  if (existing) {
    await tx.done;
    return { id: existing.id, alreadyExisted: true, memory: existing };
  }
  const record = {
    url,
    title,
    content: text.slice(0, 2000),
    summary: analysis.summary,
    framing: analysis.framing,
    framing_confidence: analysis.framing_confidence,
    sentiment: analysis.sentiment,
    topics: analysis.topics,
    entities: analysis.entities,
    importance: analysis.importance,
    consolidated: 0,
    created_at: new Date().toISOString(),
  };
  const id = await store.add(record);
  await tx.done;
  return { id, alreadyExisted: false, memory: { id, ...record } };
}

export async function getMemoryByUrl(url) {
  const db = await getDb();
  return db.transaction('memories').store.index('url').get(url);
}

export async function getAllMemories(limit = 50) {
  const db = await getDb();
  const all = await db.getAll('memories');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

export async function getUnconsolidatedMemories(limit = 50) {
  const db = await getDb();
  const all = await db.getAll('memories');
  return all.filter(m => !m.consolidated).slice(0, limit);
}

export async function markConsolidated(memoryIds) {
  const db = await getDb();
  const tx = db.transaction('memories', 'readwrite');
  for (const id of memoryIds) {
    const row = await tx.store.get(id);
    if (row) {
      row.consolidated = 1;
      await tx.store.put(row);
    }
  }
  await tx.done;
}

// ---- consolidations ----

export async function insertConsolidation({ memory_ids, connections, insight, recommendations }) {
  const db = await getDb();
  return db.add('consolidations', {
    memory_ids, connections, insight, recommendations,
    created_at: new Date().toISOString(),
  });
}

export async function getRecentConsolidations(limit = 3) {
  const db = await getDb();
  const all = await db.getAll('consolidations');
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

// ---- feedback ----

export async function insertFeedback({ page_url, perspective_id, action }) {
  const db = await getDb();
  return db.add('feedback', {
    page_url, perspective_id, action,
    created_at: new Date().toISOString(),
  });
}

// ---- session (singleton, id=1) ----

async function getOrInitSession() {
  const db = await getDb();
  let row = await db.get('session', 1);
  if (!row) {
    row = {
      id: 1,
      bubble_score: 0.5,
      pages_analyzed: 0,
      source_diversity: { left: 0, center: 0, right: 0 },
      topic_distribution: {},
      updated_at: new Date().toISOString(),
    };
    await db.put('session', row);
  }
  return row;
}

export async function getSessionStats() {
  return getOrInitSession();
}

export async function recordPageSeen(framing, topics) {
  const db = await getDb();
  const tx = db.transaction('session', 'readwrite');
  const row = (await tx.store.get(1)) || {
    id: 1,
    bubble_score: 0.5,
    pages_analyzed: 0,
    source_diversity: { left: 0, center: 0, right: 0 },
    topic_distribution: {},
  };
  row.pages_analyzed += 1;
  row.source_diversity[framing] = (row.source_diversity[framing] ?? 0) + 1;
  for (const t of topics) {
    row.topic_distribution[t] = (row.topic_distribution[t] ?? 0) + 1;
  }
  row.bubble_score = computeBubbleScore(row.source_diversity);
  row.updated_at = new Date().toISOString();
  await tx.store.put(row);
  await tx.done;
  return row.bubble_score;
}

export async function clearAllData() {
  const db = await getDb();
  for (const store of ['memories', 'consolidations', 'feedback', 'session']) {
    await db.clear(store);
  }
}
```

### 1.7 `src/shared/gemini.js`

```js
import { GEMINI_ENDPOINT } from './constants.js';

export class GeminiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function callGemini({ prompt, schema, apiKey }) {
  if (!apiKey) throw new GeminiError('No API key configured');

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GeminiError(`Gemini HTTP ${res.status}`, { status: res.status, body });
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new GeminiError('Empty Gemini response', { body: JSON.stringify(data) });
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new GeminiError(`Gemini returned invalid JSON: ${text.slice(0, 200)}`);
  }
}
```

### 1.8 `src/shared/agents.js`

```js
import { callGemini } from './gemini.js';
import { ANALYSIS_SCHEMA, CONSOLIDATION_SCHEMA } from './schemas.js';

const ANALYZER_PROMPT = (title, url, text) => `
You are a media bias analyst. Analyze the given article text and return
a JSON object matching the provided schema.

Framing guide:
- "left": emphasizes social justice, government intervention, systemic
  inequality, environmental regulation, progressive social policies.
- "right": emphasizes individual liberty, free market, traditional values,
  national security, limited government.
- "center": balanced coverage, presents multiple viewpoints, factual without
  strong editorial lean.

Examples:

1. "The administration's sweeping new climate rules are a long-overdue
   reckoning with decades of corporate pollution..." -> framing: left,
   confidence ~0.9, sentiment ~0.3.

2. "New EPA rules will cost American businesses billions and threaten
   energy independence while doing little on global emissions..." ->
   framing: right, confidence ~0.88, sentiment ~-0.4.

3. "The EPA announced new emissions standards Tuesday. Supporters say
   the rules will cut carbon output 30% by 2030; industry groups warn
   of compliance costs..." -> framing: center, confidence ~0.85.

Now analyze:

Title: ${title}
URL: ${url}

Text:
${text}
`.trim();

export async function analyzeContent({ text, url, title }, apiKey) {
  const truncated = text.slice(0, 4000);
  return callGemini({
    prompt: ANALYZER_PROMPT(title, url, truncated),
    schema: ANALYSIS_SCHEMA,
    apiKey,
  });
}

const CONSOLIDATE_PROMPT = (memoryText) => `
You are a memory consolidation system. You receive a batch of recent
browsing memories (each with framing analysis). Your job:

1. Find CONNECTIONS between memories (same topic / opposing framing /
   related entities). Reference the numeric IDs from the input.
2. Generate one actionable INSIGHT about the user's information diet,
   noting specific topics and source leanings.
3. Produce 2-4 concrete RECOMMENDATIONS.

Memories:
${memoryText}
`.trim();

export async function runConsolidation(memories, apiKey) {
  const memoryText = memories.map(m =>
    `[#${m.id}] ${m.created_at} | ${m.title} | framing: ${m.framing} | ` +
    `topics: ${(m.topics || []).join(', ')} | summary: ${m.summary}`
  ).join('\n');
  return callGemini({
    prompt: CONSOLIDATE_PROMPT(memoryText),
    schema: CONSOLIDATION_SCHEMA,
    apiKey,
  });
}
```

### 1.9 `src/shared/retriever.js`

Pure function over `articles.json`. No API calls.

```js
import articles from './articles.json';

export function findPerspectives(analysis, k = 3) {
  const contrastMap = {
    left:   ['right', 'center'],
    right:  ['left',  'center'],
    center: ['left',  'right'],
  };
  const targets = new Set(contrastMap[analysis.framing]);

  const inputTopics   = new Set(analysis.topics.map(t => t.toLowerCase()));
  const inputEntities = new Set(analysis.entities.map(e => e.toLowerCase()));

  const scored = [];
  for (const a of articles) {
    if (!targets.has(a.framing)) continue;
    const aTopics   = new Set((a.topics || []).map(t => t.toLowerCase()));
    const aEntities = new Set((a.entities || []).map(e => e.toLowerCase()));
    const union = new Set([...inputTopics, ...aTopics]);
    const inter = new Set([...inputTopics].filter(t => aTopics.has(t)));
    const topicJaccard = union.size === 0 ? 0 : inter.size / union.size;
    const entityBonus  = 0.1 * [...inputEntities].filter(e => aEntities.has(e)).length;
    const score = topicJaccard + entityBonus;
    if (score > 0) {
      scored.push({
        score,
        perspective: {
          id: a.id,
          title: a.title,
          url: a.url,
          source: a.source,
          framing: a.framing,
          framing_diff: explainDiff(analysis.framing, a.framing, a.topics),
          relevance: Math.round(score * 1000) / 1000,
        },
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, k).map(x => x.perspective);
}

function explainDiff(original, other, topics) {
  const topic = topics?.[0] || 'this issue';
  return `Where the original frames this as ${original}-leaning, this piece reads as ${other}, emphasizing ${topic} from the opposite angle.`;
}
```

> The templated `framing_diff` is good enough for v1. If you want LLM-rewritten diffs later, add a stretch feature that batches them into a single Gemini call.

### 1.10 `src/shared/orchestrator.js`

```js
import { analyzeContent, runConsolidation } from './agents.js';
import { findPerspectives } from './retriever.js';
import {
  upsertMemory, getMemoryByUrl, recordPageSeen, getSessionStats,
  getUnconsolidatedMemories, insertConsolidation, markConsolidated,
} from './storage.js';
import { getApiKey, checkAndIncrementDailyCount } from './settings.js';
import { MAX_CONSOLIDATION_BATCH, MIN_CONSOLIDATION_BATCH } from './constants.js';

export class OrchestratorError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export async function orchestrateAnalysis({ text, url, title }) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new OrchestratorError('No API key set', 'NO_KEY');

  // URL dedup — never double-analyze
  const existing = await getMemoryByUrl(url);
  if (existing) {
    const stats = await getSessionStats();
    const analysis = pickAnalysis(existing);
    return {
      memory_id: existing.id,
      analysis,
      perspectives: findPerspectives(analysis),
      bubble_score: stats.bubble_score,
      already_seen: true,
    };
  }

  // Daily cap
  const cap = await checkAndIncrementDailyCount();
  if (!cap.allowed) {
    throw new OrchestratorError(
      `Daily analyze cap reached (${cap.current}/${cap.cap})`, 'CAP_REACHED',
    );
  }

  const analysis = await analyzeContent({ text, url, title }, apiKey);
  const perspectives = findPerspectives(analysis);
  const { id: memory_id } = await upsertMemory({ url, title, text, analysis });
  const bubble_score = await recordPageSeen(analysis.framing, analysis.topics);

  return { memory_id, analysis, perspectives, bubble_score, already_seen: false };
}

export async function consolidateNow() {
  const apiKey = await getApiKey();
  if (!apiKey) throw new OrchestratorError('No API key set', 'NO_KEY');

  const memories = await getUnconsolidatedMemories(MAX_CONSOLIDATION_BATCH);
  if (memories.length < MIN_CONSOLIDATION_BATCH) {
    return { skipped: true, reason: `Need at least ${MIN_CONSOLIDATION_BATCH} memories` };
  }
  const result = await runConsolidation(memories, apiKey);
  const id = await insertConsolidation({
    memory_ids: memories.map(m => m.id),
    connections: result.connections,
    insight: result.insight,
    recommendations: result.recommendations,
  });
  await markConsolidated(memories.map(m => m.id));
  return { skipped: false, id, insight: result.insight };
}

function pickAnalysis(memory) {
  return {
    summary: memory.summary,
    framing: memory.framing,
    framing_confidence: memory.framing_confidence,
    sentiment: memory.sentiment,
    topics: memory.topics,
    entities: memory.entities,
    importance: memory.importance,
  };
}
```

### 1.11 `src/shared/messages.js`

```js
export const MSG = {
  PAGE_CONTENT:    'PAGE_CONTENT',      // content -> SW
  GET_DASHBOARD:   'GET_DASHBOARD',     // popup -> SW
  CONSOLIDATE_NOW: 'CONSOLIDATE_NOW',   // popup -> SW
  FEEDBACK:        'FEEDBACK',          // sidepanel -> SW
  TEST_KEY:        'TEST_KEY',          // options -> SW
};
```

### 1.12 Tests for shared libs (`*.test.js` via vitest)

Use `fake-indexeddb` so tests run in Node.

- `bubble.test.js` — the three boundary cases.
- `retriever.test.js` — given a left analysis, returned perspectives are all right/center; empty topics → empty list; at most k results.
- `storage.test.js` — upsert twice on same URL returns `alreadyExisted: true` the second time; `recordPageSeen` increments the right counters and persists.
- `settings.test.js` — daily count resets across dates; cap blocks at exactly `cap`.
- `agents.test.js` — mock `fetch`; assert that `callGemini` sends the right body and parses the right path; assert `analyzeContent` and `runConsolidation` forward the schema correctly.

**No live Gemini call in unit tests.** The one live smoke test happens in Phase 4 via the browser.

---

## Phase 2 — Extension shell (1.5 hours)

### 2.1 `extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "EchoBreaker",
  "version": "0.1.0",
  "description": "AI-powered filter bubble detector. Detects media framing on news articles and shows contrasting perspectives.",
  "permissions": ["activeTab", "sidePanel", "storage", "tabs", "alarms"],
  "host_permissions": [
    "https://generativelanguage.googleapis.com/*",
    "*://*.nytimes.com/*", "*://*.washingtonpost.com/*",
    "*://*.foxnews.com/*", "*://*.cnn.com/*",
    "*://*.bbc.com/*", "*://*.bbc.co.uk/*",
    "*://*.theguardian.com/*", "*://*.wsj.com/*",
    "*://*.reuters.com/*", "*://*.apnews.com/*",
    "*://*.nbcnews.com/*", "*://*.cbsnews.com/*",
    "*://*.npr.org/*", "*://*.politico.com/*",
    "*://*.breitbart.com/*", "*://*.theatlantic.com/*",
    "*://*.economist.com/*", "*://*.bloomberg.com/*",
    "*://*.axios.com/*", "*://*.vox.com/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "*://*.nytimes.com/*", "*://*.washingtonpost.com/*",
        "*://*.foxnews.com/*", "*://*.cnn.com/*",
        "*://*.bbc.com/*", "*://*.bbc.co.uk/*",
        "*://*.theguardian.com/*", "*://*.wsj.com/*",
        "*://*.reuters.com/*", "*://*.apnews.com/*",
        "*://*.nbcnews.com/*", "*://*.cbsnews.com/*",
        "*://*.npr.org/*", "*://*.politico.com/*",
        "*://*.breitbart.com/*", "*://*.theatlantic.com/*",
        "*://*.economist.com/*", "*://*.bloomberg.com/*",
        "*://*.axios.com/*", "*://*.vox.com/*"
      ],
      "js": ["src/content/content.js"],
      "run_at": "document_idle"
    }
  ],
  "side_panel":   { "default_path": "src/sidepanel/index.html" },
  "options_page": "src/options/index.html",
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16":  "public/icons/icon16.png",
      "48":  "public/icons/icon48.png",
      "128": "public/icons/icon128.png"
    }
  },
  "icons": {
    "16":  "public/icons/icon16.png",
    "48":  "public/icons/icon48.png",
    "128": "public/icons/icon128.png"
  }
}
```

Key points:

- `"type": "module"` on the service worker — so it can `import` from `shared/`.
- `generativelanguage.googleapis.com` in `host_permissions` — otherwise `fetch` from the SW is blocked.
- Same allowlist in `host_permissions` and `content_scripts.matches`.
- `options_page` opens on first run.

### 2.2 `src/content/content.js`

```js
function extract() {
  const selectors = ['article', '[role="main"]', '.article-body',
                     '.story-body', '.post-content', 'main'];
  let el = null;
  for (const s of selectors) { el = document.querySelector(s); if (el) break; }
  if (!el) el = document.body;

  const skip = new Set(['SCRIPT','STYLE','NAV','FOOTER','HEADER','ASIDE']);
  const walk = (n) => {
    if (!n || skip.has(n.tagName)) return '';
    if (n.nodeType === Node.TEXT_NODE) return n.textContent.trim();
    return Array.from(n.childNodes).map(walk).filter(Boolean).join(' ');
  };

  const text = walk(el);
  if (text.length < 400) return;

  chrome.runtime.sendMessage({
    type: 'PAGE_CONTENT',
    data: { text: text.slice(0, 5000), title: document.title, url: location.href },
  });
}

if (document.readyState === 'complete') extract();
else window.addEventListener('load', extract);
```

### 2.3 `src/background/service-worker.js`

```js
import { orchestrateAnalysis, consolidateNow } from '../shared/orchestrator.js';
import { insertFeedback, getSessionStats, getRecentConsolidations } from '../shared/storage.js';
import { getApiKey, getDailyStatus } from '../shared/settings.js';
import { callGemini } from '../shared/gemini.js';
import { ANALYSIS_SCHEMA } from '../shared/schemas.js';
import { RECENT_URL_TTL_MS } from '../shared/constants.js';
import { MSG } from '../shared/messages.js';

// ---- recent URL memory (prevents rapid re-analysis) ----

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
    keys.sort((a, b) => recentUrls[a] - recentUrls[b])
        .slice(0, keys.length - 100)
        .forEach(k => delete recentUrls[k]);
  }
  await chrome.storage.local.set({ recentUrls });
}

// ---- badge ----

function setBadge(score) {
  const badge = Math.round(score * 100).toString();
  const color = score > 0.7 ? '#e53e3e' : score > 0.4 ? '#dd6b20' : '#38a169';
  chrome.action.setBadgeText({ text: badge });
  chrome.action.setBadgeBackgroundColor({ color });
}
function setBadgeError() {
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#888' });
}

// ---- main analyze flow ----

async function handlePageContent({ text, url, title }) {
  if (await wasRecent(url)) return;
  try {
    const result = await orchestrateAnalysis({ text, url, title });
    await chrome.storage.local.set({
      latestAnalysis: result,
      lastAnalyzedUrl: url,
      latestError: null,
    });
    await markRecent(url);
    setBadge(result.bubble_score);
  } catch (err) {
    console.error('[EchoBreaker] analyze failed:', err);
    await chrome.storage.local.set({
      latestError: { message: err.message, code: err.code || 'UNKNOWN' },
    });
    setBadgeError();
    if (err.code === 'NO_KEY') chrome.runtime.openOptionsPage();
  }
}

// ---- message routing ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === MSG.PAGE_CONTENT) {
        await handlePageContent(msg.data);
        sendResponse({ ok: true });
      } else if (msg.type === MSG.GET_DASHBOARD) {
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
            recent_insights: insights.map(i => i.insight),
            daily,
          },
        });
      } else if (msg.type === MSG.CONSOLIDATE_NOW) {
        const r = await consolidateNow();
        sendResponse({ ok: true, data: r });
      } else if (msg.type === MSG.FEEDBACK) {
        await insertFeedback(msg.data);
        sendResponse({ ok: true });
      } else if (msg.type === MSG.TEST_KEY) {
        try {
          await callGemini({
            prompt: 'Return a minimal valid object matching the schema: summary="ok", framing="center", framing_confidence=1, sentiment=0, topics=["test"], entities=[], importance=0.1',
            schema: ANALYSIS_SCHEMA,
            apiKey: msg.data.apiKey,
          });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // keep channel open for async sendResponse
});

// ---- periodic cleanup + install ----

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
chrome.alarms.create('cleanup-recent-urls', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'cleanup-recent-urls') return;
  const { recentUrls = {} } = await chrome.storage.local.get('recentUrls');
  const now = Date.now();
  for (const [url, ts] of Object.entries(recentUrls)) {
    if (now - ts > RECENT_URL_TTL_MS) delete recentUrls[url];
  }
  await chrome.storage.local.set({ recentUrls });
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install' && !(await getApiKey())) {
    chrome.runtime.openOptionsPage();
  }
});
```

---

## Phase 3 — UI (2 hours)

### 3.1 Options page (`src/options/App.jsx`)

Fields:

1. **Gemini API key** — password input, "Show"/"Hide" toggle, "Test key" button (sends `MSG.TEST_KEY` to SW, shows "OK" or error).
2. **Daily analyze cap** — number input, default 50. Today's count and reset time shown.
3. **Clear all data** — button with a confirm dialog, calls `clearAllData()` from `storage.js`.
4. **About / Privacy** — one short paragraph: *"EchoBreaker stores all data locally in your browser's IndexedDB. The only network call made by this extension is to Google's Gemini API using your own API key. No data is sent anywhere else."*

On mount: load current settings. On change: save via `settings.js` + direct `chrome.storage.local`.

### 3.2 Side panel (`src/sidepanel/App.jsx`)

Subscribes to `chrome.storage.onChanged.latestAnalysis` and renders:

- **`FramingBadge`** — colored pill + confidence%.
- Summary paragraph.
- Mini bubble-score indicator.
- **`PerspectiveCard`** × up to 3 — source, framing, `framing_diff`, "Open" link, thumbs-up/down that send `MSG.FEEDBACK`.
- If `latestError` is set → red error banner with message + (if code `NO_KEY`) "Set API key" button that calls `chrome.runtime.openOptionsPage()`.
- If `latestAnalysis.already_seen === true` → small "already analyzed" note above the cards.
- Permanent small disclaimer in the footer: *"AI-generated. May be wrong."*

```jsx
// condensed App.jsx
import { useEffect, useState } from 'react';
import FramingBadge from './components/FramingBadge';
import PerspectiveCard from './components/PerspectiveCard';

export default function App() {
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    chrome.storage.local.get(['latestAnalysis', 'latestError']).then(r => {
      if (r.latestAnalysis) setAnalysis(r.latestAnalysis);
      if (r.latestError)    setError(r.latestError);
    });
    const listener = (changes) => {
      if (changes.latestAnalysis) setAnalysis(changes.latestAnalysis.newValue);
      if (changes.latestError)    setError(changes.latestError.newValue);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  if (error) return <ErrorBanner error={error} />;
  if (!analysis) return <EmptyState />;

  return (
    <div className="p-4 space-y-4">
      {analysis.already_seen && (
        <div className="text-xs text-gray-500">Already analyzed — showing cached result.</div>
      )}
      <FramingBadge framing={analysis.analysis.framing}
                    confidence={analysis.analysis.framing_confidence} />
      <p className="text-sm">{analysis.analysis.summary}</p>
      <div className="text-xs text-gray-500">
        Bubble score: {Math.round(analysis.bubble_score * 100)}
      </div>
      {analysis.perspectives.map(p => (
        <PerspectiveCard key={p.id} perspective={p} />
      ))}
      <p className="text-[10px] text-gray-400 pt-2 border-t">
        AI-generated framing labels may be wrong. Treat as a starting point, not ground truth.
      </p>
    </div>
  );
}
```

### 3.3 Popup (`src/popup/App.jsx`)

On mount: `chrome.runtime.sendMessage({ type: MSG.GET_DASHBOARD })`, render:

- **`BubbleGauge`** — SVG circle with `stroke-dasharray`, label "Diverse" / "Moderate bubble" / "Echo chamber" based on score.
- **`DietChart`** — Recharts `BarChart` over `source_diversity`.
- **`InsightsList`** — up to 3 most recent `insight` strings.
- **"Reflect now" button** — sends `MSG.CONSOLIDATE_NOW`, shows spinner, then refetches dashboard.
- **Daily cap indicator** — `${daily.current}/${daily.cap} analyses today`.
- **"Open settings" link** → `chrome.runtime.openOptionsPage()`.

---

## Phase 4 — Smoke test + polish (45 min)

### 4.1 Boot order

```bash
cd extension
npm install
npm run build           # or `npm run dev` for HMR
# chrome://extensions -> Developer mode on -> Load unpacked -> pick extension/dist
# Options page auto-opens on first install -> paste Gemini API key -> Test key -> Save
```

### 4.2 End-to-end walk-through

Do this in a fresh Chrome profile so the install flow runs clean:

1. Load unpacked → Options page auto-opens → paste key → click "Test key" → expect "OK".
2. Visit a left-leaning article (e.g. a Guardian opinion piece on immigration).
3. Open side panel → expect red "left" badge, a summary, 2–3 contrasting cards with non-empty `framing_diff`.
4. Open popup → bubble gauge ≈ 1.0 (single data point), diet chart has one bar.
5. Visit a right-leaning article (e.g. Fox News on the same topic).
6. Open side panel → blue "right" badge, cards should point to left/center contrasts.
7. Visit a center article (Reuters/AP).
8. Popup → bubble score should drop toward 0 as diversity grows; diet chart has three bars.
9. Click "Reflect now" → insight appears within a few seconds.
10. Revisit the first article → side panel shows "Already analyzed" banner, no duplicate memory.
11. Open Chrome DevTools → Application → IndexedDB → `echobreaker` → verify `memories`, `consolidations` populated. `feedback` populated after clicking a thumbs button.
12. In Options page, click "Clear all data" → confirm the dashboard resets.

If all twelve pass, the demo works.

### 4.3 Polish (only what's visible)

- Loading skeleton in the side panel while `latestAnalysis` is null but an analyze is in flight (SW can set `analyzing: true` in `chrome.storage.local`).
- Badge shows `!` and gray on any error from `handlePageContent`.
- "No API key" error in side panel has a direct "Open settings" button.
- Daily cap reached → side panel shows "Daily cap reached (50/50)" with a "Raise cap" link to Options.

---

## Phase 5 — Research Instrumentation (Day 1 afternoon)

Everything in Phases 1–4 gives you a working product. Phase 5 makes it a research instrument. It is built **on Day 1**, alongside the core product, so there is no "later port." A research mode is a flag, not a fork.

### 5.1 Event logging — new IndexedDB store

Add a fifth object store to `storage.js` upgrade callback:

```js
const events = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
events.createIndex('session_id', 'session_id');
events.createIndex('event_type', 'event_type');
events.createIndex('timestamp',  'timestamp');
```

### 5.2 `src/shared/events.js`

```js
import { openDb } from './storage.js';
import { isResearchMode, getParticipantId, getCondition, getSessionId } from './research.js';

/**
 * Event types that may be logged. Keep this list exhaustive so the paper's
 * "what we measured" section can be copy-pasted from this file.
 */
export const EVENT = {
  PAGE_VISIT:              'page_visit',              // content script saw a page (pre-analyze)
  ANALYZE_START:           'analyze_start',
  ANALYZE_COMPLETE:        'analyze_complete',
  ANALYZE_ERROR:           'analyze_error',
  ANALYZE_DEDUPED:         'analyze_deduped',         // already_seen path
  ANALYZE_CAPPED:          'analyze_capped',          // daily cap hit
  SIDEPANEL_OPEN:          'sidepanel_open',
  SIDEPANEL_CLOSE:         'sidepanel_close',
  SIDEPANEL_VIEW_DURATION: 'sidepanel_view_duration', // emitted on close with ms
  PERSPECTIVE_IMPRESSION:  'perspective_impression',  // card rendered on screen
  PERSPECTIVE_CLICK:       'perspective_click',       // "Open" clicked
  PERSPECTIVE_THUMBS_UP:   'perspective_thumbs_up',
  PERSPECTIVE_THUMBS_DOWN: 'perspective_thumbs_down',
  PERSPECTIVE_DISMISS:     'perspective_dismiss',
  CONSOLIDATION_TRIGGER:   'consolidation_trigger',   // "Reflect now" clicked
  CONSOLIDATION_COMPLETE:  'consolidation_complete',
  DASHBOARD_VIEW:          'dashboard_view',          // popup opened
  SETTINGS_OPEN:           'settings_open',
  RESEARCH_CONSENT:        'research_consent',
  RESEARCH_WITHDRAW:       'research_withdraw',
  DATA_EXPORT:             'data_export',
  SESSION_START:           'session_start',           // browser start with extension
};

async function hashUrl(url) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Log an event. No-op if research mode is off. URLs are SHA-256-hashed
 * and truncated to 16 hex chars unless `keepUrl: true` is set (only used
 * for consented full-URL studies).
 */
export async function logEvent(eventType, context = {}) {
  if (!(await isResearchMode())) return;

  const record = {
    session_id:     await getSessionId(),
    participant_id: await getParticipantId(),
    condition:      await getCondition(),
    timestamp:      new Date().toISOString(),
    event_type:     eventType,
    context: {
      ...context,
      ...(context.url && !context.keepUrl
        ? { url_hash: await hashUrl(context.url), url: undefined }
        : {}),
    },
  };

  const db = await openDb();
  await db.add('events', record);
}
```

**Where events fire:**

| Event | Call site |
|---|---|
| `PAGE_VISIT` | `content.js` before `sendMessage` |
| `ANALYZE_*` | `orchestrator.js :: orchestrateAnalysis` — start, complete/error/deduped/capped branches |
| `SIDEPANEL_OPEN/CLOSE/VIEW_DURATION` | `sidepanel/App.jsx` via `visibilitychange` |
| `PERSPECTIVE_IMPRESSION` | `PerspectiveCard.jsx` on mount |
| `PERSPECTIVE_CLICK/THUMBS_*/DISMISS` | button handlers in `PerspectiveCard.jsx` |
| `CONSOLIDATION_*` | `orchestrator.js :: consolidateNow` |
| `DASHBOARD_VIEW` | `popup/App.jsx` on mount |
| `SETTINGS_OPEN` | `options/App.jsx` on mount |
| `SESSION_START` | `service-worker.js :: onStartup` |
| `RESEARCH_*`, `DATA_EXPORT` | `options/App.jsx` handlers |

### 5.3 `src/shared/research.js`

Participant ID, condition assignment, consent gate, research-mode flag. Stored in `chrome.storage.local` so it survives SW restarts.

```js
const K = {
  consented:    'research_consented',         // boolean
  participant:  'research_participant_id',    // UUID v4
  condition:    'research_condition',         // 'control' | 'full'
  sessionId:    'research_session_id',        // per-browser-session
  researchMode: 'research_mode',              // boolean — master switch
};

export async function isResearchMode() {
  const { [K.researchMode]: v = false } = await chrome.storage.local.get(K.researchMode);
  return !!v;
}

export async function getParticipantId() {
  const { [K.participant]: id = null } = await chrome.storage.local.get(K.participant);
  return id;
}

export async function getCondition() {
  const { [K.condition]: c = null } = await chrome.storage.local.get(K.condition);
  return c; // 'control' | 'full' | null
}

export async function getSessionId() {
  const { [K.sessionId]: id } = await chrome.storage.local.get(K.sessionId);
  if (id) return id;
  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({ [K.sessionId]: fresh });
  return fresh;
}

export async function hasConsented() {
  const { [K.consented]: v = false } = await chrome.storage.local.get(K.consented);
  return !!v;
}

/**
 * Consent handler. Called from the Options page when the user accepts
 * the IRB-approved consent form. Generates a participant ID, assigns
 * a condition deterministically from the ID's SHA-256 hash (first byte
 * mod 2 -> 0: control, 1: full), and flips research mode on.
 */
export async function acceptConsent() {
  const id = crypto.randomUUID();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  const condition = ((new Uint8Array(buf))[0] % 2 === 0) ? 'control' : 'full';
  await chrome.storage.local.set({
    [K.consented]:    true,
    [K.participant]:  id,
    [K.condition]:    condition,
    [K.researchMode]: true,
  });
  return { id, condition };
}

export async function withdrawConsent() {
  // Keep participant_id and condition on record, but stop logging.
  // Withdrawal means "stop collecting new data," not "erase history."
  // A separate "Clear my data" button handles erasure per IRB.
  await chrome.storage.local.set({ [K.researchMode]: false });
}
```

### 5.4 Condition behavior — what the `control` arm actually hides

Research mode only matters for logging. **Condition** determines what the UI shows. This is the critical piece for the control/full comparison:

| UI element | `control` | `full` |
|---|---|---|
| Framing badge (per article) | ✅ shown | ✅ shown |
| Article summary | ✅ shown | ✅ shown |
| Perspective cards (2-3 contrasting) | ❌ **hidden** | ✅ shown |
| Bubble-score badge on extension icon | ❌ hidden (always grey "·") | ✅ colored number |
| Popup dashboard — bubble gauge | ❌ hidden | ✅ shown |
| Popup dashboard — diet chart | ❌ hidden | ✅ shown |
| Popup dashboard — consolidation insights | ❌ hidden | ✅ shown |
| "Reflect now" button | ❌ hidden | ✅ shown |
| Daily analyze cap counter | ✅ shown | ✅ shown |

The control arm still runs the classifier (it still sees the framing label), still logs everything, and still stores memories in IndexedDB. The only difference is what's *rendered*. This isolates the intervention from the analysis — both arms get the same "you're reading a left-leaning article" info; only the full arm gets the perspectives + score + reflection pathway.

Implementation: every UI component reads `condition` on mount and short-circuits with `null` for the hidden elements. One helper:

```js
// src/shared/research.js
export function useCondition() {
  const [cond, setCond] = React.useState(null);
  React.useEffect(() => {
    chrome.storage.local.get('research_condition')
      .then(r => setCond(r.research_condition ?? 'full'));
    // Default to 'full' so non-research installs see the full product.
  }, []);
  return cond;
}
```

### 5.5 Options page — research section

Collapsed by default. Expanding reveals:

1. **Consent text** (IRB-approved, ~400 words plain English — drafted in Phase 7.4).
2. **"Accept and enroll"** button → calls `acceptConsent()`, shows assigned condition label in non-blinded studies or "Enrolled" in blinded ones. For EchoBreaker we are **blinded**: participants never see their condition, so the label always says "Enrolled — thank you."
3. **Participant ID** displayed in monospace for cross-reference with survey responses.
4. **Withdraw from research** button → calls `withdrawConsent()`, shows a confirmation.
5. **Export research data** button → produces a JSON bundle for upload to the research team.
6. **Delete all research data** button → wipes `events`, `memories`, `consolidations`, `feedback` from IndexedDB and resets session.

### 5.6 Export format — `echobreaker_export_{participant_id}_{YYYYMMDD}.json`

```json
{
  "schema_version": 1,
  "participant_id": "uuid",
  "condition": "full",
  "export_timestamp": "2026-...",
  "session": { "bubble_score": ..., "pages_analyzed": ..., ... },
  "memories":       [ /* all rows from memories store */ ],
  "consolidations": [ /* all rows from consolidations store */ ],
  "feedback":       [ /* all rows from feedback store */ ],
  "events":         [ /* all rows from events store */ ]
}
```

URLs in the export are already hashed unless the consent form explicitly opts into full-URL logging.

### 5.7 Tests

- `events.test.js` — logging is a no-op when research mode is off.
- `events.test.js` — logged events carry the right `participant_id`, `condition`, and `session_id`.
- `research.test.js` — `acceptConsent` produces a stable condition for a given ID (deterministic from hash).
- `research.test.js` — `withdrawConsent` stops subsequent events from persisting.
- `storage.test.js` — `exportAll()` returns a valid shape that round-trips through `JSON.parse`.

---

## Phase 6 — Evaluation Infrastructure (Week 1 after Day 1)

Technical evaluation of the classifier, retriever, and political-bias characteristics. **Not part of the extension.** Lives in a sibling `evaluation/` directory. Runs in Node, reuses `src/shared/gemini.js` and `src/shared/agents.js` via ESM imports.

### 6.1 Ground truth dataset — `evaluation/ground_truth.csv`

**Methodology (goes verbatim into the paper):**

- **Size:** 150 articles. 50 per framing (left / center / right).
- **Selection:** stratified sampling across ≥12 topic buckets (immigration, climate, economy, healthcare, abortion, gun policy, foreign policy, tech regulation, education, policing, taxes, labor). Within each topic, articles are drawn from a mix of opinion and news.
- **Sourcing:** articles are collected from public-facing pages of the 20 allowlisted news domains. URL, title, and full text are stored. Only publicly accessible (non-paywalled or archive-accessible) articles are included.
- **Coders:** 2 independent coders trained in a 45-min calibration session using a shared rubric. Both are graduate students in political science, communication, or journalism; neither is on the paper's author list.
- **Rubric:** a 1-page written framing rubric (drafted in Phase 7.4) that operationalizes left / center / right in terms of *what the article emphasizes*, not what source it comes from.
- **Coding procedure:**
  1. Each coder labels all 150 articles independently (label + 1-5 confidence).
  2. Cohen's κ is computed on the 150 first-pass labels. **Target κ ≥ 0.6** (substantial agreement). If < 0.6, the rubric is revised and both coders re-code.
  3. Disagreements are flagged and resolved in a 30-min meeting with a third coder as tie-breaker.
  4. The final label is the consensus value.
  5. Articles where consensus cannot be reached are dropped from the benchmark (reported as a count).
- **Holdout discipline:** ground truth articles are **never** used as few-shot examples in any prompt. This is enforced by stamping each ground truth row with a `benchmark_only: true` flag and asserting in the prompt-generation code that no `benchmark_only` row appears in few-shot slots.

**Schema:**

```csv
id, url, title, text, source, allsides_source_rating, coder1_label, coder1_confidence, coder2_label, coder2_confidence, final_label, disagreement_resolved_by, notes, benchmark_only
```

### 6.2 Benchmark script — `evaluation/benchmark.mjs`

```js
#!/usr/bin/env node
// Runs the EchoBreaker classifier against ground_truth.csv and reports
// per-class precision/recall/F1, confusion matrix, agreement with human
// labels, and latency distribution.

import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { analyzeContent } from '../extension/src/shared/agents.js';

const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) throw new Error('Set GOOGLE_API_KEY in env');

const ROWS = parse(fs.readFileSync('evaluation/ground_truth.csv'), { columns: true });

const results = [];
for (const row of ROWS) {
  const t0 = Date.now();
  try {
    const a = await analyzeContent(
      { text: row.text, url: row.url, title: row.title }, API_KEY
    );
    results.push({
      id: row.id,
      truth: row.final_label,
      predicted: a.framing,
      confidence: a.framing_confidence,
      latency_ms: Date.now() - t0,
      error: null,
    });
  } catch (err) {
    results.push({ id: row.id, truth: row.final_label, predicted: null,
                   confidence: null, latency_ms: Date.now() - t0, error: err.message });
  }
}

// per-class precision/recall/F1, macro-F1, confusion matrix, mean+p95 latency
const report = computeClassificationReport(results);
const runId = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync('evaluation/results', { recursive: true });
fs.writeFileSync(`evaluation/results/run-${runId}.json`,
                 JSON.stringify({ config: { model: 'gemini-...' }, results, report }, null, 2));
console.log(report);
```

`computeClassificationReport` is a ~40-line function that produces a scikit-learn-style classification report (per-class precision/recall/F1/support + macro and weighted averages). Written by Claude as part of this phase.

### 6.3 Ablations — configurations to run

All ablations are specified as JSON config files and swept by a harness around `benchmark.mjs`:

| Ablation | Variants | Why |
|---|---|---|
| **Prompt variant** | (a) baseline instruction only, (b) instruction + 3 few-shot, (c) instruction + CoT "think step by step", (d) instruction + CoT + few-shot | Isolates the contribution of each prompting technique |
| **Context length** | truncate to 2000 / 4000 / 8000 chars | Tests sensitivity to how much article is fed in |
| **Temperature** | 0.0 / 0.2 / 0.5 | Checks output stability |
| **Model tier** | Flash-Lite / Flash / Pro | Cost-quality trade-off (Pro is a stretch — expensive) |
| **Forced-choice vs. abstain** | schema with/without an `"abstain"` option | Does letting the model punt improve quality on ambiguous cases? |

For each configuration, we report macro-F1 and 95% bootstrap CI (1000 resamples) so the paper can make statistical claims about prompt-variant differences rather than just point estimates.

### 6.3.5 Source-halo audit — blinded vs leaky prompt

Separate from the general ablations because it targets a specific, measurable validity threat flagged in the Pre-declared Limitations: the classifier may be shortcutting from domain name to framing label without reading the article.

**Method:** run `benchmark.mjs` twice on the **same ground-truth dataset**:

1. `CLASSIFIER_BLINDED=true` (production default) — prompt contains only the article body. The outgoing request has no URL, no title, no outlet name.
2. `CLASSIFIER_BLINDED=false` — prompt contains title and URL alongside the body. Everything else identical.

The two prompt templates share the same framing guide + few-shot examples (enforced by extraction into a `FRAMING_GUIDE` and `FEW_SHOT_EXAMPLES` constant in `src/shared/agents.js`), so the only difference between the two runs is whether the source is visible.

**Reported measurements:**
- Macro-F1 delta between the two modes.
- Per-class precision/recall/F1 delta.
- A breakdown by **outlet** of how many articles flipped framing labels between the two modes. A large flip rate for well-known outlets (Fox News, Guardian, Breitbart) is the smoking gun for source halo.
- A breakdown by **ground-truth label**: are certain framings more susceptible to halo shortcutting than others?

**Interpretation rules (pre-registered, to avoid post-hoc rationalization):**
- If `F1_leaky - F1_blinded` > 0.10 macro-F1, we conclude the prior plan's apparent classification accuracy was substantially an artifact of source shortcutting. The paper leads with the blinded number.
- If the delta is < 0.03, the classifier is reading the article in both modes and the blinding is a belt-and-braces precaution rather than a real mitigation. The paper still reports blinded numbers as the primary result but cites the small delta as evidence of construct validity.
- If `F1_blinded > F1_leaky` (unlikely but possible — the leaky prompt might distract the model), we report that finding as-is.

**Residual leak measurement:** the source halo CAN still leak through article body text (masthead strings, bylines, "published on X" footers). We measure this by taking the 30 most confident correct-classification examples from the blinded run, running regex on their body text for any of the 43 allowlisted outlet names, and reporting the hit rate. A high rate means the body-text leak is non-trivial and the Phase 7 deployment should add per-outlet text scrubbing.

### 6.4 Political bias audit — `evaluation/bias_audit.mjs`

Separate from the F1 benchmark. Answers: **is the classifier itself asymmetrically biased in how it labels content?** This is a necessary check before deploying the classifier in a study whose RQ2 asks about user trust in labels.

**Test set:** 40 short passages generated to be structurally symmetric across the political axis. Example pair:

```
L: "Climate action requires bold government investment to protect
    vulnerable communities from fossil-fuel-driven harm."

R: "Climate policy requires careful deference to markets to protect
    vulnerable communities from regulation-driven harm."
```

40 such pairs covering all ~12 topic buckets, matched for length and structure, drafted by Claude, reviewed by the research team.

**Measurements:**

1. For each pair, does the classifier label them symmetrically? A perfectly unbiased classifier labels L as "left" and R as "right" with similar confidence. Asymmetries — for example, L labeled "center" at 80% but R labeled "right" at 60% — indicate that the classifier has a different threshold for detecting one side than the other.
2. **Mean confidence difference** between L-labeled-left and R-labeled-right.
3. **Fraction of pairs where one side "escapes" classification** (labeled center when its match is labeled as a clear framing).

Results go directly into the paper's Technical Evaluation section with honest framing regardless of which direction the bias runs.

### 6.5 Retriever relevance evaluation

`findPerspectives` is not an LLM, but it's still being evaluated for research:

- Construct 30 input analyses (hand-written) spanning the topic buckets.
- For each, record the top-3 perspectives returned by `findPerspectives`.
- Two coders independently rate each returned perspective as **relevant / marginal / irrelevant** on the topic dimension.
- Report **precision@3** with 95% CI.

If precision@3 < 0.7, the `articles.json` DB is too narrow or the Jaccard scoring is inadequate, and we either (a) expand the curated DB or (b) introduce simple embedding-based retrieval (stretch #7 in the main plan, promoted to core if this threshold isn't met).

### 6.6 Latency profile

Collected during the F1 benchmark run. Report mean, median, p95, p99 latency for `analyzeContent` across 150 articles. Include in the paper's System Design section as "time-to-analysis" — a UX-relevant number.

---

## Phase 7 — Study Protocol

### 7.1 Design

**Mixed-methods field deployment.**

- **Between-subjects factor:** condition — `control` vs `full`, assigned at consent via deterministic hash of participant ID (50/50 random).
- **Within-subjects factor:** time — pre-deployment survey, mid-deployment survey (end of week 1), post-deployment survey (end of week 2).
- **Qualitative component:** 5–8 semi-structured exit interviews (30 min each), purposively sampled for condition × political-orientation coverage.
- **Deployment duration:** 14 days.

### 7.2 Participants

- **Target N:** 40 (20 per condition). Allowing ~20% attrition → 32 complete cases expected.
- **Power analysis:** For a between-groups difference on the primary behavioral outcome (framing-diversity delta) with α = .05, one-tailed (directional hypothesis), power = .80, expected effect size Cohen's *d* = 0.7 (medium-large), required N per group ≈ 26. We target 20 to be realistic about recruitment; **the paper pre-commits to reporting effect sizes and 95% CIs regardless of p-values**, following APA and CHI open-science guidelines.
- **Inclusion criteria:**
  - Uses Chrome as primary browser
  - Reads news online ≥3 times per week (self-report screening)
  - 18+
  - English-proficient
  - Willing to install a browser extension and submit exported logs
- **Exclusion criteria:**
  - Current employee of a news organization (professional framing detection isn't the population of interest)
  - Journalism or political science graduate student (expert users — separate study)
  - Uses more than 2 browsers daily (extension won't capture a representative slice)
- **Recruitment channels:** university mailing lists, student research participation pools, Prolific (at ~$15–20/hr rate).
- **Compensation:** $25 base for completing the 2-week deployment + all three surveys + data export. $15 bonus for the 30-min exit interview.

### 7.3 Procedure

| Day | Participant does |
|---|---|
| 0 | Reads consent form in the Options page. If accepted, clicks "Enroll" → participant ID generated, condition assigned, research mode on. Fills pre-survey (Qualtrics link shown in Options). |
| 1–7 | Free browsing. No imposed tasks. Extension logs events passively. |
| 7 | Mid-survey (Qualtrics, 3 min). Served via an in-extension notification or email reminder. |
| 8–14 | Free browsing continues. |
| 14 | Post-survey (Qualtrics, 20 min). |
| 14 | Participant clicks "Export research data" in Options → uploads JSON to a Qualtrics file-upload question OR emails to research team. |
| 14+ | Purposively sampled 5–8 participants invited to 30-min exit interview via Zoom. |

### 7.4 Measures

#### 7.4.1 Pre-survey (Qualtrics, ~15 min)

- **Demographics:** age, gender, country, highest education, first language.
- **Political orientation:** 7-point single-item ("extremely liberal" → "extremely conservative") + 5-item Wilson-Patterson abbreviated scale.
- **Media habits:** frequency of news reading, list of 5 most-visited outlets, self-reported source diversity (5-point Likert).
- **Need for Cognition** — NFC-18 (Cacioppo et al. 1984, 18 items).
- **Trust in mainstream media** — 4-item validated scale (Tsfati & Cappella 2003).
- **Trust in AI** — 4-item custom scale drafted from Lai & Tan 2019.
- **Media literacy** — abbreviated Austin et al. scale (8 items).
- **News knowledge quiz** — 6 factual items about current events (attention check + construct).

#### 7.4.2 Mid-survey (Qualtrics, ~3 min)

- Days since install (carryover check)
- 1-item engagement: "How often have you used EchoBreaker's side panel this week?" (1–5)
- Friction check: "Have you seen any errors or confusing behavior?" (free text)
- 1-item awareness: "Has this week's experience changed how aware you are of the political framing of news you read?" (1–5)

#### 7.4.3 Post-survey (Qualtrics, ~20 min)

- **System Usability Scale (SUS)** — 10 items, Brooke 1996.
- **Perceived helpfulness of each feature** — 4 items (1–5): framing badge, contrast cards, bubble score, consolidation insights. Control-arm respondents rate only the features they saw.
- **Trust in framing labels** — 4-item custom scale.
- **Self-reported behavior change** — 4 items (1–5).
- **Repeat measures from pre-survey** for paired comparison: Trust in mainstream media, Trust in AI, perceived source diversity.
- **Feature use recall** — which features used, frequency.
- **Open feedback** — 3 free-text prompts.
- **Willingness to continue / recommend** (1–5).

#### 7.4.4 Behavioral measures (from exported `events.json`)

All computed from the event log, not self-report:

- **Source diversity index** — Shannon entropy of visited domains (top-level hash) on news-allowlisted sites.
- **Framing diversity index** — Shannon entropy of `{left, center, right}` labels assigned to visited articles by the classifier.
- **Cross-aisle exposure rate** — fraction of analyzed articles whose framing opposes the participant's self-reported political orientation.
- **Perspective engagement rate** — `perspective_click` count / `perspective_impression` count (full condition only).
- **Side panel open rate** — `sidepanel_open` count / `analyze_complete` count.
- **Mean side-panel view duration** — from `sidepanel_view_duration` events.
- **Consolidation trigger count per week** (full only).
- **Daily reading volume** — `analyze_complete` count per day.
- **Week-over-week delta** in each of the above (week 2 − week 1). This is the primary behavioral outcome for RQ1.

### 7.5 Analysis plan — pre-registered on OSF before data collection opens

**Primary hypotheses:**

- **H1.** Full-condition participants show greater week-over-week increase in framing-diversity index than control-condition participants. *Test: independent-samples t-test on delta scores; Mann-Whitney U as non-parametric sensitivity.*
- **H2.** Full-condition participants show greater week-over-week increase in cross-aisle exposure rate than control. *Test: same.*
- **H3.** Within the full condition, perspective engagement rate positively correlates with SUS and feature-helpfulness ratings. *Test: Spearman correlation.*
- **H4.** Trust in framing labels is negatively correlated with distance between participant's political orientation and article's labeled framing. *Test: linear mixed-effects model with participant as random intercept.*

**Always reported regardless of significance:**

- Cohen's *d* with 95% CI for between-group comparisons.
- Cohen's *f²* or η² for regression/mixed models.
- Bootstrapped 95% CIs for all point estimates.
- Full distributions, not just means.

**Qualitative analysis:**

- **Thematic analysis** (Braun & Clarke 2006) of interview transcripts and open survey responses.
- **Two independent coders**, inductive coding first then axial coding.
- **Cohen's κ** for coder agreement on the final code set (target ≥ 0.7 for substantial).
- **Member checking:** findings summary sent to 3 participants for validation before final write-up.

### 7.6 IRB materials — all drafted by Claude, submitted by you

- [ ] **Study protocol** (10 pages): background, RQs, design, procedure, measures, analysis plan, data handling, risk assessment.
- [ ] **Informed consent form** (plain language, 8th-grade reading level, ~400 words).
- [ ] **Recruitment materials**: flyer, email template, Prolific listing copy.
- [ ] **Pre-survey, mid-survey, post-survey instruments** (Qualtrics-ready).
- [ ] **Interview protocol** (semi-structured question list).
- [ ] **Data management plan**: what is collected, where it is stored, for how long, who has access, how it is destroyed.
- [ ] **Privacy impact assessment**.
- [ ] **Debriefing script**: reveals the existence of the control condition and the classifier's known limitations.
- [ ] **Compensation plan**.

### 7.7 Interview protocol (semi-structured, 30 min)

1. **Warm-up (5 min)** — how much news do you read in a typical week? where?
2. **Walkthrough (7 min)** — open the extension. Show me how you normally use it. (Contextual inquiry.)
3. **Surprise moments (5 min)** — "Tell me about a time EchoBreaker showed you something you found surprising or useful." Probe: why was it surprising?
4. **Failure moments (5 min)** — "Tell me about a time it got something wrong." Probe: how did you know? what did you do?
5. **Behavior change (5 min)** — "Did you change what you read, how you read, or when? Why or why not?" Probe for specific articles.
6. **Friction & ignore (3 min)** — "What did you find annoying or ignore entirely?"
7. **Close:** "If you could change one thing, what would it be?" + debrief reveal.

---

## Phase 8 — Paper

### 8.1 Target venue choice

- **Primary: CHI (full paper).** Deadline is typically September for the following April conference. Fits the mixed-methods system-paper tradition. Requires strong user study.
- **Secondary: IUI (full or short paper).** Deadline typically October. More technically oriented, slightly smaller study acceptable for a short paper.
- **Alternate: CSCW.** If the qualitative findings end up being the stronger story.
- **Alternate: FAccT.** If the political-bias audit results are the stronger story and the paper reframes around classifier fairness.

Decide after Phase 7 findings are in, based on which story lands harder.

### 8.2 Paper structure (CHI full-paper template, ~10 pages + references)

| Section | Budget | Content |
|---|---|---|
| Abstract | 150 words | Problem, system, study N, top 2 findings, implications |
| 1. Introduction | 1 page | Filter bubble as motivation (+ honest pushback), gap in existing tools, contribution statement (3 bullets matching RQs), roadmap |
| 2. Related Work | 1.5 pages | (a) Selective exposure & filter bubbles, (b) Reflective informatics & personal informatics, (c) Prior news-diversity tools with the comparison table from this plan, (d) Always-on memory agents |
| 3. System Design | 2 pages | Architecture, three-agent pattern with provenance citation to Google's always-on-memory-agent reference, design rationale for each UI element, local-first privacy architecture |
| 4. Technical Evaluation | 1 page | Ground truth methodology (with κ), classification F1 + confusion matrix, ablations, political bias audit, retriever precision@3, latency profile |
| 5. User Study Method | 1.5 pages | Design, participants, procedure, measures, analysis plan (note pre-registration) |
| 6. Findings | 2 pages | Quantitative: behavioral + survey (H1–H4 with effect sizes). Qualitative: themes from interviews with representative quotes |
| 7. Discussion | 1 page | Implications for reflective informatics / AI-assisted sensemaking, design recommendations, stated limitations, ethical tensions (nudging vs. autonomy) |
| 8. Conclusion & Future Work | 0.5 page | Summary, what's next |
| References | — | ≥ 40 references expected for a full CHI paper |
| Appendix | — | Full rubric, full surveys, full interview protocol, full prompt templates |

### 8.3 Writing plan

- **Week 10 (after data analysis):** outline + methods section (reusable from Phase 7 docs).
- **Week 11:** system design + technical evaluation sections.
- **Week 12:** findings + discussion.
- **Week 13:** related work + introduction + abstract (last, as tradition recommends).
- **Week 14:** internal review, revisions, final edits.
- **Week 15:** submit.

### 8.4 Artifacts to publish alongside the paper

- **Code:** the extension repository on GitHub under MIT or Apache 2.0.
- **Dataset:** the human-labeled ground truth dataset with κ (subject to source-copyright constraints; may have to release hashes + coder labels rather than full text).
- **Pre-registration:** OSF link.
- **Analysis scripts:** Jupyter or Observable notebooks that reproduce every figure and table from the exported study data.
- **Supplementary:** full surveys, full interview protocol, full prompts, full ablation configs.

---

## Demo Script (5 minutes)

1. Fresh-install the unpacked extension. Options page opens. Paste API key, test, save.
2. Open popup: empty state, score 0.5, "No pages analyzed yet."
3. Open a left-leaning immigration piece (Guardian). Side panel: red "left" badge with ~85% confidence, summary, 2 contrasting cards (e.g. WSJ center-right, Fox News right) each with a plain-English framing diff.
4. Open a right-leaning piece on the same topic. Side panel: blue "right" badge, contrasting cards from Guardian + Reuters.
5. Open a center piece from Reuters. Gray "center" badge.
6. Open popup: bubble gauge has moved off 0.5, diet chart shows 3 bars, daily counter shows 3/50.
7. Click "Reflect now". Within a few seconds: *"You've read 3 articles on immigration policy across the political spectrum. Your framing diversity is balanced, but you're missing economic-impact analyses and non-US perspectives."*
8. Open a previously-visited article. Side panel shows "Already analyzed — showing cached result." No new memory.
9. Click a thumbs-up on a perspective card. Open DevTools → IndexedDB → `feedback` store → new row.
10. In Options, "Clear all data" → refresh popup → back to empty state.

---

## Build Order (Claude Code)

Everything below is Claude's work unless marked **(manual — you)**. Top-to-bottom.

1. `src/shared/articles.json` — Claude generates 80–120 curated entries, **first**, because the retriever tests depend on it.
2. `src/shared/constants.js`, `schemas.js`, `messages.js`.
3. `src/shared/bubble.js` + `bubble.test.js`.
4. `src/shared/settings.js` + `settings.test.js` (fake `chrome.storage.local`).
5. `src/shared/storage.js` + `storage.test.js` (fake-indexeddb).
6. `src/shared/gemini.js` + `agents.js` + `agents.test.js` (mock fetch).
7. `src/shared/retriever.js` + `retriever.test.js`.
8. `src/shared/orchestrator.js` + `orchestrator.test.js` (wiring test with mocks).
9. `manifest.json`, `vite.config.js`, `package.json`, `tailwind.config.js`.
10. `src/content/content.js`, `src/background/service-worker.js`.
11. `src/options/` (API key UI + test button).
12. `src/sidepanel/` (React + components).
13. `src/popup/` (React + components + Recharts).
14. **(manual — you)** `npm install` + `npm run build`, load unpacked, open Options, paste + test Gemini API key.
15. **(manual — you)** Run the Phase 4.2 walk-through. Report any failure; Claude fixes.
16. Polish (Phase 4.3) + README. Only after walk-through is green.

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Gemini API rate limits | Low | Flash-Lite is generous; daily cap (default 50) + 10-min URL dedup |
| User pastes invalid API key | Medium | "Test key" button in Options before saving; clear error if Gemini returns 400 |
| MV3 service worker goes idle mid-fetch | Medium | Promise-based messaging; the in-flight fetch keeps the SW alive; no long-lived timers |
| `responseSchema` silently truncates output | Low | Phase 4.2 smoke test would catch empty arrays; raw Gemini response logged on parse failure |
| Framing classifier wrong on a demo article | Medium | Pre-test demo articles in Phase 4.2; permanent "AI-generated" disclaimer |
| IndexedDB quota exceeded | Very low | `memories.content` truncated to 2000 chars; typical usage <1 MB |
| Extension can't reach Gemini | Low | `host_permissions` explicitly includes `generativelanguage.googleapis.com` |
| Curated DB too narrow for demo article | Medium | Cover ~15 topics × 3 leanings; pick demo articles whose topics are in-scope |
| User's Gemini key leaks in logs | Medium | Never log the key; only `storage.local`, never `storage.sync` |

### Research-specific risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| IRB approval takes longer than expected | High | Submit by end of Week 1; have parallel tracks (instrumentation + ground truth) so approval delay doesn't block everything; allow 4+ weeks buffer |
| Inter-rater reliability on ground truth is too low (κ < 0.6) | Medium | Rubric revision + re-code cycle built into Phase 6.1; if second pass still < 0.6, report honestly and discuss in Limitations as a finding about framing-label ambiguity |
| Classifier political bias audit returns damning results | Medium | Publish anyway. This is a finding, not a failure. The RQ2 trust-calibration story becomes stronger, not weaker, if users can detect the bias |
| Participant recruitment underfills | Medium | Use Prolific as a backup channel; report final N with honest sensitivity analysis; never p-hack by collecting until significance |
| Attrition > 30% by day 14 | Medium | Mid-survey serves as a retention check; send reminder emails at day 3, 7, 14; pay full compensation to completers only |
| Participants never use the extension after install | Medium | Minimum-activity threshold in analysis (≥10 analyze events over 14 days); exclude below-threshold cases and report count |
| Backfire effect: full condition shows *worse* diversity than control | Not a risk, it's a finding | Report honestly. Discuss Nyhan & Reifler vs. Wood & Porter literature |
| Exit interview participants self-select for strong opinions | Medium | Purposive sampling across condition × political orientation cells; report the sampling strategy transparently |
| Study discovers no significant effect | Medium–High | Effect sizes + CIs are reported regardless; a null result on behavior with a positive result on self-reported reflection is still a contribution; pre-registration prevents HARKing |
| Participants share API keys → data contamination | Low | Each participant gets their own key from AI Studio; consent form explicitly asks them not to share |

---

## Realistic Multi-Phase Timeline

The one-day build in Phases 0–4 is the artifact. The paper requires ~15 weeks from that day. Dates below are relative weeks from the day the build starts, not calendar weeks — compress or stretch as your IRB cycle and recruitment realities require.

| Week | Phase | Work | Who |
|---|---|---|---|
| **Day 1** | 0–5 | Build v2 core extension + research instrumentation (events, research.js, consent flow, data export). Smoke-test with Gemini key. | Claude |
| **Week 1** | 6 (start) + 7.4 drafts | Build benchmark script. Claude drafts IRB materials, consent form, survey instruments, interview protocol, DMP. You recruit 2 ground-truth coders and schedule a calibration session. | Claude + You |
| **Week 2** | 6.1 | Ground truth coding (150 articles). Compute κ. Iterate rubric if < 0.6. Run first F1 benchmark. Iterate analyzer prompt if macro-F1 < 0.7. Start bias audit design. | You (coding) + Claude (benchmark code) |
| **Week 3** | 6.2–6.5 + 7.6 | Run ablations. Run political bias audit. Run retriever relevance evaluation. Finalize IRB materials. **Submit IRB application.** | Claude + You |
| **Week 4** | IRB review | Address reviewer questions. In parallel: internal pilot with 3 team members as participants (dogfooding, not study data). Fix pilot-surfaced bugs. | You (IRB correspondence) + Claude (bug fixes) |
| **Week 5** | IRB revision + Phase 7.2 prep | Resubmit if needed. Draft recruitment materials. Create Qualtrics projects for pre/mid/post surveys. Test data export → Qualtrics pipeline end-to-end. | You (recruitment setup) + Claude (Qualtrics schemas) |
| **Week 6** | 7.5 pre-reg + recruit | **Pre-register hypotheses and analysis plan on OSF.** Open recruitment. Begin onboarding first cohort. Consent + pre-survey + install. | You |
| **Weeks 7–8** | 7.3 Wave 1 deployment | Wave 1 (≈half of N) runs their 2-week deployment. Mid-survey at day 7. Post-survey + data export at day 14. Begin exit interviews. | Participants |
| **Weeks 8–9** | 7.3 Wave 2 deployment | Wave 2 runs deployment. Completes by end of Week 9. | Participants |
| **Week 10** | Data analysis | Run pre-registered quantitative analyses. Begin qualitative coding of interviews with 2 coders. | Claude (quant) + You (qual coding lead) |
| **Week 11** | Qual analysis + draft Methods | Complete thematic analysis, report κ for coder agreement. Member checking with 3 participants. Claude drafts Methods + System Design sections from Phase 3 and Phase 7 docs. | Claude + You |
| **Week 12** | Findings + Discussion | Draft findings and discussion sections. Run any follow-up sensitivity analyses requested during writing. | Claude + You |
| **Week 13** | Related work + Intro + Abstract | Draft related work against the comparison table. Draft intro and abstract last. | Claude + You |
| **Week 14** | Internal review | Send to trusted readers outside the author list for critical feedback. Revise. | You |
| **Week 15** | Submit | Final formatting, supplementary materials, OSF links, GitHub release. **Submit.** | You |

**Parallelism notes:**

- IRB review (Weeks 3–5) is a blocking wait — use the time productively for ground truth coding, ablations, and bug fixes.
- The benchmark (Week 2) must complete before you decide whether the analyzer prompt is publication-grade. If macro-F1 < 0.7 after Week 2, prompt iteration bumps everything downstream by at least a week.
- Exit interviews can start as soon as Wave 1 participants finish (Week 8), not serialized with Wave 2.
- Writing (Weeks 10–14) overlaps with late data analysis; that's normal and fine.

**Compression options** if the timeline is too long:

- Drop Wave 2 and run all N in a single wave → saves ~1 week but requires all participants to consent in the same week.
- Use Prolific exclusively → faster recruitment than university channels but narrower demographic.
- Cut interview count from 8 to 5 → saves a few days; still valid for a thematic analysis.
- Submit to IUI short paper instead of CHI full → smaller evaluation burden, shorter page limit.

**Compression options that will compromise rigor and should not be taken:**

- Skipping the pre-registration (Week 6).
- Skipping the ground truth κ check (Week 2).
- Skipping the political bias audit (Week 3).
- Cutting the deployment below 2 weeks per participant.
- Cutting N below 30.
- Using source-level AllSides ratings as "ground truth" instead of human coders.

---

## Ethics, Privacy & IRB

This section replaces the previous one-sentence handling of ethics. It is designed to be cut-and-pasted (with light edits) into the IRB protocol and the paper's Ethics section.

### Data collected

- **Browsing events** on the 20 allowlisted news domains only. URLs are SHA-256-hashed and truncated to 16 hex chars unless the participant explicitly opts into full-URL logging for a separate analysis.
- **Classifier outputs** (framing, confidence, topics, entities, summary) derived from article text.
- **Interaction events** (side panel opens, perspective clicks, thumbs up/down, consolidation triggers, dashboard views).
- **Pre/mid/post survey responses** via Qualtrics (Qualtrics-hosted, institutional license).
- **Exit interview recordings and transcripts** (Zoom, consented).
- **Participant ID** (UUID v4, not linked to name or email outside the Qualtrics-internal mapping held by the research team).

### Data *not* collected

- No article text after analysis (only the summary).
- No screen recordings.
- No keyboard or mouse tracking.
- No page content from non-allowlisted sites.
- No cross-device tracking.
- No integration with Google Analytics or other third-party telemetry.
- No real names, emails, or phone numbers in the extension's event log. Those live only in the research team's separate participant-ID-to-contact mapping, destroyed at the end of the study per the DMP.

### Consent

- **Opt-in.** Research mode is OFF by default. The extension works as a product for non-research installs.
- **Informed.** Consent form (plain language, 8th-grade reading level) covers: what is collected, how it is stored, who has access, how long it is kept, how to withdraw, right to delete, compensation.
- **Specific.** Separate consent for data collection vs. audio recording of interviews.
- **Withdrawal.** The Options page has a one-click "Withdraw from research" button. Withdrawal stops new data collection immediately. Participants can additionally request deletion of already-collected data up until the point of pre-registered analysis freeze (declared in the DMP).

### Storage & retention

- **During deployment:** all data is local to the participant's browser (IndexedDB + `chrome.storage.local`). Nothing is transmitted except the participant-initiated export at day 14.
- **After export:** JSON files are stored on institutional storage (university-managed encrypted drive), access-limited to the author list.
- **Retention:** 5 years after publication per standard HCI practice, then destroyed. Participants are informed of this in the consent form.
- **Sharing:** aggregated results in the paper and supplementary. Raw data is not shared publicly to protect reading-history privacy.

### Risk assessment

- **Exposure to content that contradicts beliefs:** minimal risk. Participants are choosing to install a filter-bubble-detection tool; by design it shows them contrasting viewpoints. The consent form states this explicitly.
- **Exposure to algorithmically biased labels:** documented risk. The classifier may asymmetrically label content. This is audited in Phase 6.4 and reported in the paper; participants are informed during debrief.
- **Privacy:** mitigated by local-first storage, URL hashing, opt-in consent, and the participant controlling when/whether to export.
- **Emotional discomfort from reading opposing views:** low but real. Participants can close the side panel, disable perspective cards in settings, or withdraw at any time. The consent form and debrief script acknowledge this.
- **Coercion via compensation:** $25 for 2 weeks of passive extension use is not high enough to be coercive per typical HCI rates. Compensation is explicitly not contingent on what participants read, only on completing the surveys and export.

### Debriefing

- Reveals: (1) the existence of the control condition, (2) the classifier's known limitations from the bias audit, (3) the nature of the research questions. Administered after the post-survey is submitted so it does not contaminate responses.

### What requires institutional action (you, not Claude)

- Submit the IRB application at your institution.
- Complete human subjects training if not current (CITI Program, typically 2 hours online).
- Secure institutional approval for compensation structure.
- Arrange institutional storage for exported data.
- Have the PI (likely your advisor) co-sign the protocol.

---

## Related Work Anchors (for the paper's RW section)

**News-diversity tools:**

- AllSides — editor-curated source ratings, topic comparisons. [Citation needed]
- Ground News — multi-source comparison, bias ratings. [Citation needed]
- The Flip Side — daily cross-partisan newsletter. [Citation needed]
- Read Across the Aisle (Nikolov et al.) — iOS app tracking article bias.
- Escape Your Bubble — Facebook cross-partisan content injection.
- Gobo (Bhargava et al., MIT Media Lab) — user-controlled algorithmic filters.
- NewsCube (Park et al. 2009) — multi-view news aggregator.
- Balancer (Munson & Resnick 2010) — political reading balance tracker.
- ConsiderIt (Kriplean et al. 2012) — structured pro/con reflection for civic deliberation.
- Reflect (Baumer et al.) — reflective informatics framework applied to social media.

**Selective exposure & filter bubbles:**

- Pariser, E. (2011). *The Filter Bubble*.
- Stroud, N. J. (2010). Polarization and partisan selective exposure.
- Garrett, R. K. (2009). Echo chambers online?
- Bakshy, Messing, & Adamic (2015). Exposure to ideologically diverse news and opinion on Facebook. *Science*.
- Flaxman, Goel, & Rao (2016). Filter bubbles, echo chambers, and online news consumption.

**Reflective informatics & personal informatics:**

- Baumer, E. P. S. (2015). Reflective informatics: conceptual dimensions for designing technologies of reflection.
- Rapp, A., & Tirassa, M. (2017). Know thyself: a theory of the self for personal informatics.
- Li, I., Dey, A., & Forlizzi, J. (2010). A stage-based model of personal informatics systems.

**Inoculation & misinformation:**

- Roozenbeek, J., & van der Linden, S. (2019). Fake news game confers psychological resistance.
- Lewandowsky, S., Ecker, U., & Cook, J. (2017). Beyond misinformation.
- Pennycook, G., & Rand, D. G. (2021). The psychology of fake news.

**Trust & explainable AI in decision support:**

- Bansal, G., et al. (2019). Beyond accuracy: the role of mental models in human-AI team performance.
- Lai, V., & Tan, C. (2019). On human predictions with explanations and predictions of machine learning models.
- Miller, T. (2019). Explanation in artificial intelligence: insights from the social sciences.
- Wang, D., et al. (2019). Designing theory-driven user-centric explainable AI.

**Backfire & belief entrenchment (critical to cite honestly):**

- Nyhan, B., & Reifler, J. (2010). When corrections fail.
- Wood, T., & Porter, E. (2019). The elusive backfire effect.
- Guess, A., & Coppock, A. (2020). Does counter-attitudinal information cause backlash?

**Always-on memory agents:**

- GoogleCloudPlatform/generative-ai — `gemini/agents/always-on-memory-agent` reference implementation (the pattern EchoBreaker implements).
- LangChain / LlamaIndex agent memory abstractions (for comparison).

**Value-sensitive design & ethics:**

- Friedman, B., & Hendry, D. G. (2019). *Value Sensitive Design*.
- Shneiderman, B. (2020). Human-centered AI.

---

## Stretch Goals (only if Phase 1–4 finish with time to spare)

1. **LLM-written `framing_diff`** — batch the top-k perspective diffs into a single Gemini call for richer explanations.
2. **Query agent + "Ask a question" box** in the popup — "What am I missing on climate?" → Gemini call with memories + consolidations as context.
3. **Daily bubble-score snapshot** → a 7-day trend line in the popup. Requires a new `daily_stats` object store.
4. **Auto-consolidation** via `chrome.alarms` every 6 hours, not just manual.
5. **Export / import memories** as JSON (good for research and for switching machines).
6. **Per-domain reading breakdown** in the popup ("You read: 40% NYT, 25% WaPo, 15% WSJ, ...").

---

## Chrome Web Store Path (when you're ready to publish, "later")

The code we're building today is already store-ready. What's left is non-code work:

- [ ] $5 one-time Chrome Web Store developer registration.
- [ ] Privacy policy page (GitHub Pages markdown is fine). Must disclose: (1) the extension reads article text on allowlisted news domains, (2) article text is sent to Google's Gemini API using the user's own key, (3) derived data (summaries, framing labels) is stored locally in IndexedDB, (4) nothing is transmitted anywhere else, (5) data is deletable via the Options page.
- [ ] Store listing assets: 128×128 icon, at least one 1280×800 screenshot, 440×280 promo tile, 4–5 screenshots of the side panel and popup in action.
- [ ] Single-purpose description: *"Detects media framing on news articles and shows contrasting perspectives."*
- [ ] Justification text for broad host permissions: *"The extension reads article text on news domains to analyze framing. No other domains are accessed."*
- [ ] "Uses remote code: No" — we don't load any external scripts.
- [ ] "Handles user data: Yes" — declare the categories above.
- [ ] Test on a clean Chrome profile.
- [ ] Submit. First review often bounces on privacy policy wording; plan for 1–2 revisions.

---

## "Done" Checklists

### Artifact (Day 1)

- [ ] `articles.json` has ≥80 entries across ≥12 topics × 3 framings.
- [ ] `bubble.test.js`, `retriever.test.js`, `storage.test.js`, `settings.test.js`, `agents.test.js` all pass.
- [ ] Options page accepts an API key and the "Test key" button succeeds.
- [ ] Content script fires only on allowlisted domains, sends text to SW.
- [ ] SW's `handlePageContent` runs the orchestrator end-to-end against real Gemini.
- [ ] Side panel renders framing badge + perspective cards from `chrome.storage.local`.
- [ ] Popup renders bubble gauge + diet chart + insights via `MSG.GET_DASHBOARD`.
- [ ] Thumbs-up / thumbs-down writes a row to the `feedback` store.
- [ ] "Reflect now" produces a non-empty insight and marks memories consolidated.
- [ ] Revisiting a URL within 10 minutes does not re-analyze.
- [ ] Daily cap blocks further analyses at the configured limit.
- [ ] "Clear all data" in Options wipes IndexedDB and resets the session.
- [ ] Demo script runs end-to-end without errors in a fresh Chrome profile.

### Research Instrumentation (Day 1 afternoon)

- [ ] `events` object store created in IndexedDB with proper indexes.
- [ ] `events.js` logs all event types defined in the `EVENT` constant.
- [ ] `logEvent` is a no-op when `research_mode` is false (verified by test).
- [ ] URLs in logged events are SHA-256-hashed by default.
- [ ] `research.js` consent flow: accept → participant_id, condition assigned deterministically, research mode enabled.
- [ ] Options page exposes consent form, withdraw button, export button, delete-all button.
- [ ] Control condition hides perspective cards, bubble gauge, diet chart, consolidation insights, "Reflect now" button.
- [ ] Full condition shows everything.
- [ ] Both conditions still run `analyzeContent` and log all events.
- [ ] `exportAll()` produces a valid JSON bundle that round-trips through `JSON.parse`.

### Evaluation Infrastructure (Weeks 1–3)

- [ ] `evaluation/ground_truth.csv` contains ≥100 final-label articles balanced across framings.
- [ ] Cohen's κ computed on coder1 vs coder2; value reported; ≥ 0.6 achieved.
- [ ] `evaluation/benchmark.mjs` runs against ground truth and outputs a `run-{timestamp}.json` with per-class P/R/F1 + confusion matrix + latency.
- [ ] Macro-F1 ≥ 0.7 on best prompt variant (or honestly reported as the finding).
- [ ] Ablation sweep across prompt variants, context length, temperature completed; results in `evaluation/results/`.
- [ ] `evaluation/bias_audit.mjs` run; asymmetry metric reported regardless of direction.
- [ ] Retriever precision@3 evaluation with 2 coders; result reported with 95% CI.
- [ ] Latency distribution (mean, p95, p99) recorded for the paper's System Design section.

### Study Readiness (Weeks 1–6)

- [ ] IRB protocol drafted by Claude, reviewed by PI.
- [ ] Informed consent form drafted (plain language, 8th-grade reading level).
- [ ] Pre-survey, mid-survey, post-survey instruments finalized and loaded into Qualtrics.
- [ ] Interview protocol finalized.
- [ ] Data management plan drafted.
- [ ] Debriefing script drafted.
- [ ] Recruitment materials ready (flyer, email template, Prolific listing).
- [ ] IRB application submitted and approved.
- [ ] Pre-registration filed on OSF (hypotheses, analysis plan, exclusion criteria).
- [ ] Internal pilot with 3 dogfooders completed and bugs fixed.

### Study Conduct (Weeks 6–9)

- [ ] Target N ≥ 40 (or final N reported honestly with rationale).
- [ ] 50/50 assignment to control/full via deterministic hash verified.
- [ ] Pre-survey completion rate ≥ 90%.
- [ ] Mid-survey completion rate ≥ 80%.
- [ ] Post-survey + data export completion rate ≥ 75%.
- [ ] 5–8 exit interviews completed and transcribed.
- [ ] Attrition and exclusion counts reported transparently.

### Analysis & Paper (Weeks 10–15)

- [ ] H1–H4 tested per pre-registered analysis plan; effect sizes and 95% CIs reported.
- [ ] Thematic analysis of interviews completed with 2 independent coders; κ reported.
- [ ] Member checking with 3 participants completed.
- [ ] Quantitative findings cross-checked against qualitative themes.
- [ ] Paper draft: all 8 sections + appendices + references ≥ 40.
- [ ] Supplementary materials: full rubric, full surveys, full prompts, full ablation configs.
- [ ] Analysis notebooks reproduce every figure and table from exported study data.
- [ ] Artifact repository released on GitHub with license.
- [ ] OSF pre-registration linked from paper.
- [ ] Internal review by ≥ 2 readers outside author list completed.
- [ ] Paper submitted.
