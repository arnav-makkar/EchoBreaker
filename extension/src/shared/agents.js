// Framing classification pipeline + consolidation agent.
//
// Pipeline overview (Stage 1 → Stage 2 → aggregate):
//
//   1. EXTRACTION call (1 request, temperature 0.1)
//      The model reads the article body and returns a descriptive
//      summary, topics, entities, sentiment, importance, and 2-4
//      "framing-loaded" passages with one-sentence justifications.
//      It does NOT produce a framing label. This forces a clean
//      separation between understanding and judgment, and means the
//      summary is never contaminated by the framing decision.
//
//   2. CLASSIFICATION calls (3 parallel requests at temperatures
//      0.0 / 0.3 / 0.6). Each sees ONLY the distilled evidence from
//      Stage 1 — no raw article, no URL, no title, no bylines. Each
//      returns a reasoning trace (forced to appear before the label
//      in schema order), a framing label (left/center/right/unclear),
//      and a self-reported confidence.
//
//   3. AGGREGATE. Majority vote across the 3 samples. If all three
//      disagree, the result is "unclear". Confidence is derived from
//      agreement rate × mean self-reported confidence of the winning
//      samples — not from a single model's self-confidence, which is
//      known to be poorly calibrated in LLMs.
//
// Why this design:
//   - Separates reading from judging (Stage 1 vs Stage 2).
//   - Self-consistency sampling (Wang et al. 2022) reduces variance.
//   - Agreement-based confidence is auditable.
//   - Genuinely ambiguous content can abstain via "unclear".
//   - The returned analysis shape is backward-compatible with the
//     old single-call pipeline, plus new audit fields the UI can
//     render: reasoning, framing_passages, agreement_rate, unclear.

import { callGemini } from './gemini.js';
import {
  EXTRACTION_SCHEMA,
  CLASSIFICATION_SCHEMA,
  CONSOLIDATION_SCHEMA,
} from './schemas.js';
import { MAX_ANALYZE_CHARS, CLASSIFIER_BLINDED } from './constants.js';

// =========================================================================
// Shared framing guide — used by both the extraction and classification
// system instructions so both stages reason with the same mental model.
// =========================================================================

const FRAMING_GUIDE = `
Framing guide:
- "left": emphasizes social justice, government intervention, systemic
  inequality, environmental regulation, progressive/secular/welfarist
  social policies. In an Indian context: secular, pro-welfare,
  sympathetic to minority and agrarian causes, critical of Hindu-
  nationalist movements.
- "right": emphasizes individual liberty, free market, traditional or
  nationalist values, national security, limited government. In an
  Indian context: Hindu-nationalist, pro-market reform, majoritarian,
  pro-establishment when the establishment is BJP-led.
- "center": balanced coverage, presents multiple viewpoints, factual
  without strong editorial lean. Wire-service style.

Confidence reflects how clear the framing is in the text itself, not
how much the analyst likes the conclusion. Straight wire-service news
typically scores center with high confidence; op-eds typically score
left or right with high confidence.

L/C/R is a US-rooted taxonomy and is an imperfect fit for Indian
political discourse (which is more naturally organized around
BJP/Congress/regional, Hindu-nationalist/secular, and pro-reform/
pro-welfare axes). Apply it by analogy, not as a precise mapping.
`.trim();

// =========================================================================
// Stage 1 — EXTRACTION
// =========================================================================

const EXTRACTION_SYSTEM = `
You are a media analyst. Your job in this step is to READ and EXTRACT,
not to judge framing. You do NOT output a framing label in this step.

Your tasks:

1. SUMMARY. Write 2-3 sentences that describe what the article says.
   Keep the summary PURELY DESCRIPTIVE. Do not characterize the
   article's political leaning. Do not use words like "progressive",
   "conservative", "liberal", "right-wing", "left-wing", or
   "establishment". Just say what the article claims, describes, or
   reports.

2. TOPICS. Extract 2-4 concrete topic tags.

3. ENTITIES. Extract 1-4 named entities (people, organizations,
   institutions).

4. SENTIMENT. Estimate tone on a scale of -1 (very negative) to +1
   (very positive). This is about emotional tone, not political
   direction.

5. IMPORTANCE. Estimate the stakes of the event on 0-1 scale.

6. FRAMING PASSAGES. Pull 2-4 exact quotes from the article where the
   word choice reveals how the author frames the issue. For each
   quote, write one sentence explaining WHAT MAKES IT FRAMING-LOADED
   — what choice of words or emphasis reveals the author's
   perspective. Do NOT label which direction (left/right/center) —
   that's a later step's job. Just explain what makes the passage
   loaded.

IMPORTANT: You must infer framing cues from the article's LANGUAGE
and WORD CHOICE. If the body text happens to contain an outlet name,
author byline, or "Read more on <site>" footer, IGNORE it completely
when selecting your passages. The passages you pull must be from the
substantive prose, not the masthead.

${FRAMING_GUIDE}
`.trim();

const EXTRACTION_USER_BLINDED = (text) => `
Article body (no title, no URL, no outlet name given):

${text}
`.trim();

const EXTRACTION_USER_WITH_SOURCE = (title, url, text) => `
Title: ${title}
URL: ${url}

Article body:
${text}
`.trim();

async function extractArticleEvidence({ text, url, title }, apiKey) {
  const userPrompt = isBlinded()
    ? EXTRACTION_USER_BLINDED(text)
    : EXTRACTION_USER_WITH_SOURCE(title || '', url || '', text);

  return callGemini({
    systemInstruction: EXTRACTION_SYSTEM,
    prompt: userPrompt,
    schema: EXTRACTION_SCHEMA,
    apiKey,
    temperature: 0.1,
  });
}

// =========================================================================
// Stage 2 — CLASSIFICATION (self-consistency across 3 samples)
// =========================================================================

const CLASSIFICATION_SYSTEM = `
You are a media framing classifier. You will be given distilled
evidence extracted from a news article:

  - a descriptive summary
  - a list of topics and entities
  - 2-4 framing-loaded quotes with brief notes on what makes each
    one framing-loaded

Your job is to decide whether the article's framing reads as left,
center, right, or unclear.

${FRAMING_GUIDE}

Process:

1. In the "reasoning" field, explain what the quotes and summary
   together reveal about how the article frames its subject. Walk
   through the evidence. Name specific quotes. This chain of thought
   must come BEFORE you commit to a label.

2. Only after you've written your reasoning, commit to a "framing"
   value:
     - "left"    — clear left-leaning framing in the evidence
     - "right"   — clear right-leaning framing in the evidence
     - "center"  — balanced, neutral, or wire-service tone
     - "unclear" — the evidence genuinely does not support a
                   confident L/C/R call. Prefer "unclear" over
                   forcing a label you can't defend.

3. Report "framing_confidence" as how confident YOU (this single
   sample) are in your label. Calibrated confidence across multiple
   samples is handled downstream — just report your own confidence
   for this one attempt.

Classify only on the evidence provided. Do not speculate about
content that is not in the extraction.
`.trim();

function buildEvidencePayload(extraction) {
  const passages = (extraction.framing_passages || [])
    .map((p, i) => `  ${i + 1}. "${p.quote}"\n     (${p.why})`)
    .join('\n');

  return `
Summary: ${extraction.summary}

Topics: ${(extraction.topics || []).join(', ')}
Entities: ${(extraction.entities || []).join(', ')}
Sentiment: ${extraction.sentiment}

Framing-loaded passages:
${passages || '  (none extracted)'}
`.trim();
}

async function classifySingleSample(evidencePayload, apiKey, temperature) {
  return callGemini({
    systemInstruction: CLASSIFICATION_SYSTEM,
    prompt: evidencePayload,
    schema: CLASSIFICATION_SCHEMA,
    apiKey,
    temperature,
  });
}

// =========================================================================
// Aggregation — majority vote with agreement-based confidence
// =========================================================================

/**
 * Combine N classification samples into a single verdict.
 *
 * Returns:
 *   framing:             majority label, or 'unclear' on tie / all-different
 *   framing_confidence:  mean self-confidence of winning samples × agreement rate
 *   agreement_rate:      (winners.count / samples.count), 0..1
 *   reasoning:           reasoning trace from the most-confident winning sample
 *   unclear:             true iff the verdict is 'unclear'
 *   sample_framings:     array of each sample's framing for auditing
 */
export function aggregateSamples(samples) {
  const validFramings = ['left', 'center', 'right', 'unclear'];
  const sanitized = samples.filter(
    (s) => s && validFramings.includes(s.framing),
  );

  if (sanitized.length === 0) {
    return {
      framing: 'unclear',
      framing_confidence: 0,
      agreement_rate: 0,
      reasoning: 'No valid samples returned by the classifier.',
      unclear: true,
      sample_framings: [],
    };
  }

  const votes = { left: 0, center: 0, right: 0, unclear: 0 };
  for (const s of sanitized) votes[s.framing] += 1;

  const maxVotes = Math.max(...Object.values(votes));
  const winners = Object.keys(votes).filter((k) => votes[k] === maxVotes);

  // Tie between two or more labels → abstain as unclear.
  const framing = winners.length === 1 ? winners[0] : 'unclear';
  const isUnclear = framing === 'unclear';

  const winningSamples = sanitized.filter((s) => s.framing === framing);
  const meanSelfConf =
    winningSamples.length > 0
      ? winningSamples.reduce((a, s) => a + (s.framing_confidence || 0), 0) /
        winningSamples.length
      : 0;

  const agreementRate = (votes[framing] || 0) / sanitized.length;
  const combinedConfidence = Math.round(meanSelfConf * agreementRate * 1000) / 1000;

  // Best reasoning trace = most-confident sample that agreed with the winner.
  // If no one agreed (unclear), take the first sample's reasoning as a hint.
  const fallback = sanitized[0];
  const bestSample =
    winningSamples.length > 0
      ? [...winningSamples].sort(
          (a, b) => (b.framing_confidence || 0) - (a.framing_confidence || 0),
        )[0]
      : fallback;

  return {
    framing,
    framing_confidence: combinedConfidence,
    agreement_rate: Math.round(agreementRate * 1000) / 1000,
    reasoning: bestSample?.reasoning || '',
    unclear: isUnclear,
    sample_framings: sanitized.map((s) => s.framing),
  };
}

// =========================================================================
// Test-only override for CLASSIFIER_BLINDED — matches the
// __resetDbCacheForTests pattern in storage.js.
// =========================================================================

let _classifierBlindedOverride = null;

export function __setClassifierBlindedForTests(value) {
  _classifierBlindedOverride = value;
}
export function __clearClassifierBlindedOverrideForTests() {
  _classifierBlindedOverride = null;
}

function isBlinded() {
  return _classifierBlindedOverride !== null
    ? _classifierBlindedOverride
    : CLASSIFIER_BLINDED;
}

// =========================================================================
// analyzeContent — public entry point
//
// Signature and returned object remain backward-compatible with the old
// single-call pipeline. New fields (reasoning, framing_passages,
// agreement_rate, unclear, sample_framings) are additive — callers that
// don't know about them can ignore them.
// =========================================================================

export const CLASSIFICATION_SAMPLES = 3;
const SAMPLE_TEMPERATURES = [0.0, 0.3, 0.6];

export async function analyzeContent({ text, url, title }, apiKey) {
  const truncated = (text || '').slice(0, MAX_ANALYZE_CHARS);

  // --- Stage 1: extract evidence ---
  const extraction = await extractArticleEvidence(
    { text: truncated, url, title },
    apiKey,
  );

  // --- Stage 2: self-consistency classification ---
  const evidencePayload = buildEvidencePayload(extraction);
  const sampleCalls = SAMPLE_TEMPERATURES.map((t) =>
    classifySingleSample(evidencePayload, apiKey, t).catch((err) => {
      console.warn('[EchoBreaker] classification sample failed:', err.message);
      return null;
    }),
  );
  const samples = await Promise.all(sampleCalls);

  // --- Aggregate ---
  const verdict = aggregateSamples(samples);

  // If the verdict is "unclear", map it to "center" for downstream
  // compatibility (retriever enum is left/center/right). Preserve the
  // unclear flag so the UI can render a distinct state.
  const outwardFraming =
    verdict.framing === 'unclear' ? 'center' : verdict.framing;

  return {
    // --- backward-compatible fields ---
    summary:            extraction.summary,
    framing:            outwardFraming,
    framing_confidence: verdict.framing_confidence,
    sentiment:          extraction.sentiment,
    topics:             extraction.topics,
    entities:           extraction.entities,
    importance:         extraction.importance,

    // --- new audit / display fields (safe to ignore) ---
    reasoning:          verdict.reasoning,
    framing_passages:   extraction.framing_passages || [],
    agreement_rate:     verdict.agreement_rate,
    unclear:            verdict.unclear,
    sample_framings:    verdict.sample_framings,
    n_samples:          CLASSIFICATION_SAMPLES,
  };
}

// =========================================================================
// Consolidation — unchanged. Still one call, still receives a simple
// memory list, still produces insight + recommendations. The new audit
// fields on memories (reasoning etc.) are not yet surfaced here because
// consolidation operates on aggregates and adding per-memory reasoning
// to the prompt blows the context window fast.
// =========================================================================

const CONSOLIDATE_PROMPT = (memoryText) => `
You are a memory consolidation system. You receive a batch of recent
browsing memories, each with framing analysis. Your job:

1. Find CONNECTIONS between memories. Favor pairs that share a topic
   or entity but have opposing framing. Reference the numeric IDs
   exactly as they appear in the input.
2. Generate one actionable INSIGHT about the user's information diet.
   Be specific: name topics and source leanings. Don't hedge.
3. Produce 2-4 concrete RECOMMENDATIONS — specific sources or article
   types the user should read to broaden their diet.

Memories:
${memoryText}
`.trim();

export async function runConsolidation(memories, apiKey) {
  const memoryText = memories
    .map(
      (m) =>
        `[#${m.id}] ${m.created_at} | "${m.title}" | framing: ${m.framing}` +
        ` | topics: ${(m.topics || []).join(', ')} | ${m.summary}`,
    )
    .join('\n');

  return callGemini({
    prompt: CONSOLIDATE_PROMPT(memoryText),
    schema: CONSOLIDATION_SCHEMA,
    apiKey,
  });
}
