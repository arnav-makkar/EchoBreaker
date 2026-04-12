// JSON schemas passed to Gemini as responseSchema. Gemini enforces these
// server-side, so we don't need to write defensive parsing code — if the
// response parses, it already matches the shape.

// ============================================================
// STAGE 1 — EXTRACTION
//
// "Read and extract" call. Produces a purely descriptive summary,
// topics/entities/sentiment/importance, plus 2-4 framing-loaded
// passages with one-sentence justifications. Deliberately does NOT
// include a framing label: the extraction step has no business making
// that judgment — that's stage 2's job.
// ============================================================

export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    summary:    { type: 'string' },
    topics:     { type: 'array', items: { type: 'string' } },
    entities:   { type: 'array', items: { type: 'string' } },
    sentiment:  { type: 'number' },
    importance: { type: 'number' },
    framing_passages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string' },
          why:   { type: 'string' },
        },
        required: ['quote', 'why'],
      },
    },
  },
  required: [
    'summary', 'topics', 'entities', 'sentiment',
    'importance', 'framing_passages',
  ],
};

// ============================================================
// STAGE 2 — CLASSIFICATION
//
// Run N times at different temperatures for self-consistency.
//
// The "reasoning" field is listed FIRST in the schema. Gemini generates
// fields in schema order, so this forces chain-of-thought: the model
// writes out its justification before committing to a framing label.
// That's free CoT without a second round-trip.
//
// "unclear" is a real enum value. If the evidence genuinely doesn't
// support a confident L/C/R, the model can abstain rather than being
// forced into a false choice.
// ============================================================

export const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    reasoning:          { type: 'string' },
    framing:            { type: 'string', enum: ['left', 'center', 'right', 'unclear'] },
    framing_confidence: { type: 'number' },
  },
  required: ['reasoning', 'framing', 'framing_confidence'],
};

// ============================================================
// LEGACY — single-shot analysis schema
//
// Preserved so the service-worker "Test key" handler can continue to
// validate keys with a minimal one-shot request. NOT used by the
// production analyzeContent() pipeline anymore.
// ============================================================

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

// ============================================================
// CONSOLIDATION
// ============================================================

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
