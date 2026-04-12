// Content script — runs on allowlisted news domains. Extracts article
// text using two strategies:
//
//   1. DOM walking: find an <article>/<main>/etc. element, walk the tree,
//      collect text, skip nav/footer/scripts.
//
//   2. JSON-LD fallback: many modern news sites (especially SPAs like
//      The Wire) embed the full article body in a <script
//      type="application/ld+json"> block for SEO. This is available
//      immediately at parse time — no hydration needed — and it's the
//      cleanest content source (no navigation chrome, no ads, no
//      bylines). We use it when DOM walking fails.
//
// This file intentionally avoids importing from shared/ because content
// scripts run in an isolated world.

const CONTENT_SELECTORS = [
  'article',
  '[role="main"]',
  '.article-body',
  '.story-body',
  '.post-content',
  '.entry-content',
  '.article__content',
  'main',
];

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NAV', 'FOOTER', 'HEADER', 'ASIDE', 'FORM', 'BUTTON',
]);

const MIN_ARTICLE_CHARS = 400;
const MAX_SHIP_CHARS = 5000;

// =========================================================================
// Strategy 1 — DOM text extraction
// =========================================================================

function collectText(el) {
  if (!el || SKIP_TAGS.has(el.tagName)) return '';
  if (el.nodeType === Node.TEXT_NODE) return el.textContent.trim();
  return Array.from(el.childNodes)
    .map(collectText)
    .filter(Boolean)
    .join(' ');
}

function findContentElement() {
  for (const sel of CONTENT_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Score-based article detection. Uses hard gates (reject obvious
 * non-articles) and soft signals (score >= 2 to proceed).
 *
 * The og:type meta tag is intentionally NOT a hard gate. Many news
 * CMSes (including The Wire) set og:type to "website" even on article
 * pages. Instead, og:type="article" is a positive signal.
 */
function isArticlePage() {
  // Hard gate: URL path depth — "/" and "/section" are never articles.
  const path = location.pathname.replace(/\/$/, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return false;

  let score = 0;

  // Heading present (h1 or h2 anywhere on the page)
  if (document.querySelector('h1, h2')) score += 1;

  // Paragraph count — check both the content element and body
  const container = findContentElement() || document.body;
  const pCount = container.querySelectorAll('p').length;
  if (pCount >= 3) score += 1;
  else if (pCount >= 1) score += 0.5;

  // Publication date marker
  if (document.querySelector(
    'time, [datetime], meta[property="article:published_time"], ' +
    'meta[name="publish-date"], meta[name="date"], ' +
    'meta[name="article:published_date"]'
  )) {
    score += 1;
  }

  // Explicit article container
  if (document.querySelector('article, [role="article"], [itemtype*="Article"]')) {
    score += 1;
  }

  // og:type = "article" is a positive signal (but NOT a rejection if missing)
  const ogType = document.querySelector('meta[property="og:type"]')
    ?.getAttribute('content')?.toLowerCase();
  if (ogType && ogType.includes('article')) score += 1;

  // JSON-LD signals: if there's a NewsArticle or Article schema, score up
  if (hasArticleJsonLd()) score += 1;

  return score >= 2;
}

// =========================================================================
// Strategy 2 — JSON-LD articleBody extraction
//
// Many modern SPA-based news sites (The Wire, some TOI pages, etc.)
// render content with client-side JavaScript AFTER document_idle. The
// DOM at script execution time may be a skeleton. But the JSON-LD
// <script type="application/ld+json"> blocks are always present in the
// initial server-rendered HTML because they're needed for Google
// Search indexing. The articleBody field contains the full article
// text as a plain string.
//
// This is actually a BETTER extraction source than DOM walking:
//   - No navigation chrome, ads, or social buttons
//   - No bylines or mastheads (clean body text only)
//   - Available immediately, no hydration delay
//   - Already structured by the CMS
// =========================================================================

function hasArticleJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      if (data['@type'] && /article/i.test(data['@type'])) return true;
    } catch { /* malformed JSON-LD, skip */ }
  }
  return false;
}

function extractFromJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      if (data.articleBody && data.articleBody.length >= MIN_ARTICLE_CHARS) {
        return {
          text: data.articleBody.slice(0, MAX_SHIP_CHARS),
          title: data.headline || document.title || '',
        };
      }
    } catch { /* skip */ }
  }
  return null;
}

// =========================================================================
// Main extraction flow
// =========================================================================

function extractPageContent() {
  let text = '';
  let title = document.title || '';

  // Try JSON-LD first — it's cleaner and always available.
  const jsonLd = extractFromJsonLd();
  if (jsonLd) {
    text = jsonLd.text;
    title = jsonLd.title;
  }

  // Fall back to DOM walking if JSON-LD didn't produce enough.
  if (text.length < MIN_ARTICLE_CHARS) {
    if (!isArticlePage()) return;

    const contentEl = findContentElement() || document.body;
    const domText = collectText(contentEl).replace(/\s+/g, ' ').trim();

    if (domText.length >= MIN_ARTICLE_CHARS) {
      text = domText.slice(0, MAX_SHIP_CHARS);
    }
  }

  if (text.length < MIN_ARTICLE_CHARS) return;

  try {
    chrome.runtime.sendMessage({
      type: 'PAGE_CONTENT',
      data: { text, title, url: location.href },
    });
  } catch {
    // Extension context invalidated (dev reload). Silent.
  }
}

// Run after page loads. Also retry after a short delay for SPA sites
// that hydrate content after the initial render.
function run() {
  extractPageContent();

  // Delayed retry for SPA hydration — if the first attempt found
  // nothing, the content might have appeared after React/Next.js
  // hydrated. A 2-second delay catches most hydration latencies.
  // The service worker deduplicates if both attempts fire.
  setTimeout(() => {
    extractPageContent();
  }, 2000);
}

if (document.readyState === 'complete') {
  run();
} else {
  window.addEventListener('load', run, { once: true });
}
