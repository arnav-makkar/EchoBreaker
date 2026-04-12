// Central constants for EchoBreaker. Anything that might change between
// environments (model name, endpoints, allowlists) lives here so call
// sites can't drift out of sync.

export const DB_NAME = 'echobreaker';
export const DB_VERSION = 1;

// Gemini Flash-Lite — cheap and fast, enough for framing classification.
// As of early 2026:
//   - gemini-2.0-flash-lite is retired for new API keys
//   - gemini-2.5-flash-lite is the current stable Flash-Lite (DEFAULT)
//   - gemini-3.1-flash-lite-preview exists but can be deprecated at any
//     time, so we do NOT ship it as the default — preview models are
//     fine for development but break study reproducibility if Google
//     pulls them mid-deployment.
//
// To experiment with the preview model, edit this constant to
// 'gemini-3.1-flash-lite-preview' and rebuild. Record the exact model
// ID used for every benchmark run in evaluation/results/ regardless.
export const MODEL_NAME = 'gemini-2.5-flash-lite';
export const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

// --- Classifier blinding ---
//
// When true, the framing-analysis prompt omits the article's URL and
// title before sending to Gemini. This mitigates the SOURCE-HALO bias:
// Gemini has trained-in priors on outlet reputation (foxnews.com ->
// right, theguardian.com -> left) and will shortcut to those priors
// instead of reading the text if we hand it the domain. Blinding forces
// the model to classify on language and word-choice alone.
//
// We keep the "with source" prompt path available so Phase 6's
// benchmark harness can A/B the two modes on the same ground-truth
// dataset and report the blinded-vs-leaky F1 delta as a paper finding.
//
// Residual leaks not handled by this flag (measured separately in the
// Phase 6 bias audit): outlet names that appear inside the article
// body itself via bylines, mastheads, or social-share footers.
export const CLASSIFIER_BLINDED = true;

// News domains EchoBreaker is allowed to read. Mirrors the manifest's
// content_scripts.matches and host_permissions, so anything added here
// MUST also be added there (and vice versa).
//
// Three groups: US/UK English, Indian English, Indian Hindi. The Indian
// tier is included to broaden the study population and expose the
// classifier to a framing taxonomy (Hindu-nationalist / secular / etc.)
// that the L/C/R scheme captures only imperfectly — see README.
export const NEWS_ALLOWLIST = [
  // --- US / UK English ---
  'nytimes.com', 'washingtonpost.com', 'foxnews.com', 'cnn.com',
  'bbc.com', 'bbc.co.uk', 'theguardian.com', 'wsj.com',
  'reuters.com', 'apnews.com', 'nbcnews.com', 'cbsnews.com',
  'npr.org', 'politico.com', 'breitbart.com', 'theatlantic.com',
  'economist.com', 'bloomberg.com', 'axios.com', 'vox.com',

  // --- International English ---
  'aljazeera.com',

  // --- India, English ---
  'thehindu.com', 'indiatimes.com', 'hindustantimes.com', 'indianexpress.com',
  'ndtv.com', 'indiatoday.in', 'news18.com', 'republicworld.com',
  'thewire.in', 'scroll.in', 'thequint.com', 'theprint.in',
  'livemint.com', 'business-standard.com', 'firstpost.com', 'opindia.com',
  'swarajyamag.com', 'deccanherald.com', 'outlookindia.com', 'wionews.com',

  // --- India, Hindi (allowlisted only; no curated contrast entries yet) ---
  'jagran.com', 'bhaskar.com', 'amarujala.com', 'livehindustan.com',
];

// URL dedup / rate limit windows.
export const RECENT_URL_TTL_MS = 10 * 60 * 1000;   // 10 min

// Daily analyze cap: the user can raise this in the Options page, but the
// default is conservative because users bring their own API keys and we
// don't want surprise billing from rapid browsing.
export const DEFAULT_DAILY_CAP = 50;

// Consolidation batch bounds.
export const MAX_CONSOLIDATION_BATCH = 50;
export const MIN_CONSOLIDATION_BATCH = 3;

// Minimum article text length for the content script to even bother
// calling the backend. Below this it's probably a login page / search
// result / nav shell, not an article.
export const MIN_ARTICLE_CHARS = 400;

// Max text we ship off to Gemini per analyze call. Gemini Flash-Lite
// can handle much more, but we truncate for cost + latency.
export const MAX_ANALYZE_CHARS = 4000;

// Max text we store in IndexedDB per memory (content field).
export const MAX_MEMORY_CHARS = 2000;
