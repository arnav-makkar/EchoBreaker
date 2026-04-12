// Perspective retriever. Given an article analysis, return up to k
// articles from the curated DB whose framing CONTRASTS with the
// analysis's framing, ranked by topic overlap (Jaccard) plus a small
// entity-overlap bonus.
//
// No LLM, no embeddings, no network. Pure function over articles.json.
//
// URL rewriting: the URLs stored in articles.json are demonstrative
// and do not resolve to real articles. At retrieval time we rewrite
// each perspective's `url` to a Google site-search query over the
// outlet's domain — this always opens a real results page with real
// current articles on the topic, rather than 404-ing. See
// toSiteSearchUrl() below.

import articles from './articles.json';

const CONTRAST_MAP = {
  left:   ['right', 'center'],
  right:  ['left',  'center'],
  center: ['left',  'right'],
};

function lowerSet(arr) {
  return new Set((arr || []).map((x) => String(x).toLowerCase()));
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  const inter = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return inter.size / union.size;
}

function explainDiff(originalFraming, otherFraming, sharedTopic) {
  const topic = sharedTopic || 'this issue';
  return (
    `Where the original frames this as ${originalFraming}-leaning, ` +
    `this piece reads as ${otherFraming}, approaching ${topic} from ` +
    `a different angle.`
  );
}

/**
 * Extract the registrable domain from a URL (e.g.,
 * "https://www.theguardian.com/us-news/foo" -> "theguardian.com").
 * Falls back to the full hostname if URL parsing fails.
 */
function domainFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    // Strip common www. / m. / mobile. prefixes
    return host.replace(/^(www\.|m\.|mobile\.)/, '');
  } catch {
    return '';
  }
}

/**
 * Rewrite a curated-article URL to a Google site-search query over
 * the outlet's domain. The original URL in articles.json is
 * demonstrative and doesn't resolve; this wrapper lets clicks go to a
 * real page that's topically relevant.
 *
 * Example:
 *   https://www.theguardian.com/us-news/climate-cost
 *     -> https://www.google.com/search?q=site%3Atheguardian.com+The+Human+Cost...
 */
function toSiteSearchUrl(originalUrl, title) {
  const domain = domainFromUrl(originalUrl);
  if (!domain) return originalUrl;
  const query = `site:${domain} ${title || ''}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function findPerspectives(analysis, k = 3) {
  if (!analysis || !analysis.framing) return [];

  const targets = new Set(CONTRAST_MAP[analysis.framing] || []);
  if (targets.size === 0) return [];

  const inputTopics   = lowerSet(analysis.topics);
  const inputEntities = lowerSet(analysis.entities);

  const scored = [];
  for (const a of articles) {
    if (!targets.has(a.framing)) continue;

    const aTopics   = lowerSet(a.topics);
    const aEntities = lowerSet(a.entities);

    const topicScore  = jaccard(inputTopics, aTopics);
    const entityBonus = 0.1 * [...inputEntities].filter((e) => aEntities.has(e)).length;
    const score = topicScore + entityBonus;

    if (score > 0) {
      // Pick the first shared topic, if any, for the diff explanation.
      const shared = [...inputTopics].find((t) => aTopics.has(t));
      scored.push({
        score,
        perspective: {
          id: a.id,
          title: a.title,
          // Rewrite the demonstrative URL to a Google site-search link
          // that actually resolves to real current articles. See
          // toSiteSearchUrl() notes at the top of this file.
          url: toSiteSearchUrl(a.url, a.title),
          source: a.source,
          framing: a.framing,
          framing_diff: explainDiff(analysis.framing, a.framing, shared),
          relevance: Math.round(score * 1000) / 1000,
          snippet: a.snippet || '',
        },
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.perspective);
}
