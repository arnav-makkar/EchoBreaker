# EchoBreaker

An AI-powered filter-bubble detector as a Chrome extension. Reads news articles on ~20 allowlisted sites, classifies their framing (left / center / right) using Google Gemini, and surfaces contrasting perspectives from a curated article database.

**Local-first.** All data lives in your browser's IndexedDB. The only network call is from your machine to Google's Gemini API using your own API key.

**No backend.** Everything — classification, retrieval, storage, consolidation — runs in the extension.

---

## Setup

### 1. Install dependencies

```bash
cd extension
npm install
```

### 2. Generate placeholder icons (first time only)

```bash
npm run icons
```

This produces three blue PNGs in `public/icons/`. Replace with real art before publishing.

### 3. Build the extension

```bash
npm run build
```

Output goes to `extension/dist/`.

For live reload during development:

```bash
npm run dev
```

### 4. Load into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `extension/dist/` directory.

The Options page should auto-open on first install.

### 5. Paste a Gemini API key

In the Options page:

1. Get a free key from [Google AI Studio](https://aistudio.google.com/).
2. Paste it into the **Gemini API Key** field.
3. Click **Test key** — you should see "Key works ✓".
4. Click **Save**.

### 6. Try it on a news article

Visit any article on a supported domain (Reuters, Guardian, Fox News, NYT, Washington Post, BBC, WSJ, AP, NPR, Bloomberg, etc.). Click the EchoBreaker icon in the Chrome toolbar to open the side panel, or click the icon to see the popup dashboard.

The extension badge shows the current bubble score (0–100).

---

## Supported news domains

43 domains across three groups. EchoBreaker does **not** activate on any other site — Gmail, banking, docs, social media, and everything else is ignored.

**US / UK English (20)**
nytimes.com · washingtonpost.com · foxnews.com · cnn.com · bbc.com · bbc.co.uk · theguardian.com · wsj.com · reuters.com · apnews.com · nbcnews.com · cbsnews.com · npr.org · politico.com · breitbart.com · theatlantic.com · economist.com · bloomberg.com · axios.com · vox.com

**India, English (19)**
thehindu.com · indiatimes.com (Times of India + Economic Times) · hindustantimes.com · indianexpress.com · ndtv.com · indiatoday.in · news18.com · republicworld.com · thewire.in · scroll.in · thequint.com · theprint.in · livemint.com · business-standard.com · firstpost.com · opindia.com · swarajyamag.com · deccanherald.com · outlookindia.com

**India, Hindi (4)** — allowlisted for analysis, no curated contrast entries yet
jagran.com · bhaskar.com · amarujala.com · livehindustan.com

If you want to add domains, three places need to stay in sync: `NEWS_ALLOWLIST` in [src/shared/constants.js](src/shared/constants.js), and `host_permissions` + `content_scripts.matches` in [manifest.json](manifest.json).

### On applying left / center / right to Indian news

The L/C/R scheme is US-rooted and is an imperfect fit for Indian political discourse, which is more naturally organized around BJP / Congress / regional, Hindu-nationalist / secular, and pro-reform / pro-welfare axes. The classifier uses L/C/R anyway because (a) it is what the curated DB and prior literature use and (b) multi-taxonomy classification is out of scope for the day-one build. The paper's Limitations section will acknowledge this mismatch as a measured constraint, not a footnote.

### Classifier blinding (`CLASSIFIER_BLINDED`)

Defined in [src/shared/constants.js](src/shared/constants.js). When `true` (default), the framing-analysis prompt sends ONLY the article body to Gemini — no URL, no title, no outlet name. This is a mitigation for the **source-halo effect**: Gemini has trained-in priors on outlet reputation, and feeding it `foxnews.com` or `theguardian.com` lets it shortcut to those priors instead of reading the article.

Set to `false` and rebuild to see the A/B "leaky" mode, which is preserved only so the Phase 6 benchmark harness can measure the blinded-vs-leaky F1 delta on the same ground truth dataset. Do not ship with `false` in production.

Residual leaks not handled by this flag (article bodies sometimes include masthead/byline references to the outlet) are measured separately in the Phase 6 source-halo audit.

---

## Architecture

```
chrome extension (MV3)
├── content script  — runs on allowlisted domains, extracts article text
├── service worker  — orchestrates analyze → retrieve → store → update-stats
├── shared modules  — pure logic, shared across all contexts
│   ├── gemini.js      — direct REST calls to Gemini
│   ├── agents.js      — analyzeContent + runConsolidation
│   ├── retriever.js   — curated-DB perspective retrieval (Jaccard scored)
│   ├── orchestrator.js — the main analyze flow
│   ├── storage.js     — IndexedDB wrapper (memories, consolidations, feedback, session, events)
│   ├── settings.js    — API key + daily cap
│   ├── research.js    — consent / participant ID / condition assignment
│   └── events.js      — research event logger (no-op when research mode off)
├── side panel      — React: framing badge + perspective cards
├── popup           — React: bubble gauge + diet chart + reflect button
└── options         — React: API key + daily cap + research enrollment + data export
```

### Key design decisions

1. **No Python backend.** The extension talks to Gemini directly via `fetch`. No server to host, nothing to install beyond Node for the build.
2. **`responseSchema` enforcement.** Gemini's REST API is configured to refuse any output that doesn't match our schema, so we never write defensive JSON parsing.
3. **Curated perspective DB, not live search.** `src/shared/articles.json` has 90 hand-written articles across 15 topics × 3 framings. Retrieval is keyword-based (Jaccard overlap on topics + entity bonus). Deterministic and cheap.
4. **Local-first.** Everything is IndexedDB + `chrome.storage.local`. No telemetry, no cloud sync.
5. **Research mode is a flag, not a fork.** The same code runs in both research and product mode; event logging is a no-op when `research_mode` is false.

---

## Testing

```bash
npm test
```

Runs the vitest suite covering:

- `bubble.test.js` — Shannon entropy formula on balanced / skewed / empty distributions
- `retriever.test.js` — perspective retrieval returns only contrasting framings, respects k, handles empty topics
- `storage.test.js` — upsert dedup, session stats updates, consolidation flag flipping, clear-all
- `settings.test.js` — daily cap increments and blocks, rollover handling
- `agents.test.js` — mocked Gemini fetch, prompt structure, error paths
- `research.test.js` — consent / withdrawal / condition assignment flow

These are fast and hit no network.

---

## Configuration

All tunable constants are in [src/shared/constants.js](src/shared/constants.js):

- `MODEL_NAME` — Gemini model to use (default `gemini-2.0-flash-lite`)
- `NEWS_ALLOWLIST` — domains the extension activates on
- `RECENT_URL_TTL_MS` — URL dedup window (default 10 min)
- `DEFAULT_DAILY_CAP` — analyses per day before the extension stops (default 50)
- `MAX_CONSOLIDATION_BATCH` — max memories per consolidation call (default 50)
- `MAX_ANALYZE_CHARS` — article text truncation before shipping to Gemini (default 4000)

---

## Research mode

Off by default. Users who want to participate in the research study open the **Options** page, expand **Research Participation**, read the consent form, and click **Accept and enroll**. This:

- Generates a UUID v4 participant ID (local only, not tied to name/email).
- Deterministically assigns a `control` or `full` condition from the hash of the ID (50/50 random).
- Flips on the `research_mode` flag.
- Starts logging events to the `events` IndexedDB store.

URLs logged to `events` are SHA-256 hashed by default. Exported data can be downloaded as a JSON bundle from the Options page — everything stays local until the participant clicks Export.

The `control` condition hides perspective cards, the bubble gauge, the diet chart, consolidation insights, and the "Reflect now" button. Both conditions still run the classifier and log events identically. This is the critical experimental manipulation — see [../BUILD_PLAN.md](../BUILD_PLAN.md) Phase 7 for the full study protocol.

---

## About the `.env` in the parent directory

EchoBreaker v2 does **not** read any `.env` file. The API key is entered directly in the Options page and stored in `chrome.storage.local`. If you have an existing `.env` from an earlier plan, it's safe to ignore — the extension never touches it.

---

## Known limitations

- **The framing classifier has documented political biases.** Gemini (and every foundation model) labels content asymmetrically. Before deploying in the research study, run the political-bias audit in `evaluation/bias_audit.mjs` (Phase 6.4 in the build plan).
- **Left/center/right is a contested simplification.** It's US-centric, ignores the authoritarian/libertarian axis, and doesn't handle populism. We use it because it's how the curated DB and prior literature are organized.
- **20 news domains is a WEIRD sample.** Mostly US, all English-language.
- **URLs in `articles.json` are demonstrative.** They look real but they don't resolve — the curated DB is a fixture, not a live corpus.
- **The `snippet` text in `articles.json` was written by Claude** following framing patterns from real articles. It's meant to illustrate the framing, not quote any specific article.

---

## License

MIT (once published). Currently private.
