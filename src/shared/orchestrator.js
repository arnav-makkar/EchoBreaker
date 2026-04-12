// Orchestrator: the analyze -> retrieve -> store -> update-stats flow.
// Also hosts the on-demand consolidation entry point.
//
// Everything is a plain async function. No classes, no frameworks.

import { analyzeContent, runConsolidation } from './agents.js';
import {
  upsertMemory, getMemoryByUrl, recordPageSeen, getSessionStats,
  getUnconsolidatedMemories, insertConsolidation, markConsolidated,
} from './storage.js';
import { getApiKey, checkAndIncrementDailyCount } from './settings.js';
import { MAX_CONSOLIDATION_BATCH, MIN_CONSOLIDATION_BATCH } from './constants.js';
import { logEvent, EVENT } from './events.js';

export class OrchestratorError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'OrchestratorError';
    this.code = code;
  }
}

/**
 * Analyze a page end-to-end. Returns a FullAnalysis object:
 *   { memory_id, analysis, perspectives, bubble_score, already_seen }
 *
 * Short-circuits with already_seen=true when the URL has been analyzed
 * before. Throws OrchestratorError with codes NO_KEY / CAP_REACHED /
 * ANALYZE_FAILED so the caller can render specific messages.
 */
export async function orchestrateAnalysis({ text, url, title }) {
  await logEvent(EVENT.ANALYZE_START, { url, title });

  const apiKey = await getApiKey();
  if (!apiKey) {
    await logEvent(EVENT.ANALYZE_ERROR, { url, code: 'NO_KEY' });
    throw new OrchestratorError('No API key set', 'NO_KEY');
  }

  // Dedup: if we've seen this URL before, return the cached result.
  const existing = await getMemoryByUrl(url);
  if (existing) {
    const stats = await getSessionStats();
    const analysis = memoryToAnalysis(existing);
    await logEvent(EVENT.ANALYZE_DEDUPED, { url, memory_id: existing.id });
    return {
      memory_id: existing.id,
      analysis,
      bubble_score: stats.bubble_score,
      already_seen: true,
      url,
      title: existing.title,
    };
  }

  // Daily cap: fail loud so the caller can surface the exact limit.
  const cap = await checkAndIncrementDailyCount();
  if (!cap.allowed) {
    await logEvent(EVENT.ANALYZE_CAPPED, { url, current: cap.current, cap: cap.cap });
    throw new OrchestratorError(
      `Daily analyze cap reached (${cap.current}/${cap.cap})`,
      'CAP_REACHED',
    );
  }

  let analysis;
  try {
    analysis = await analyzeContent({ text, url, title }, apiKey);
  } catch (err) {
    await logEvent(EVENT.ANALYZE_ERROR, { url, message: err.message });
    throw new OrchestratorError(err.message, 'ANALYZE_FAILED');
  }

  const { id: memory_id } = await upsertMemory({ url, title, text, analysis });
  const bubble_score = await recordPageSeen(analysis.framing, analysis.topics);

  await logEvent(EVENT.ANALYZE_COMPLETE, {
    url,
    memory_id,
    framing: analysis.framing,
    framing_confidence: analysis.framing_confidence,
    topics: analysis.topics,
    bubble_score,
    agreement_rate: analysis.agreement_rate,
    unclear: analysis.unclear,
    sample_framings: analysis.sample_framings,
    n_samples: analysis.n_samples,
  });

  return {
    memory_id,
    analysis,
    bubble_score,
    already_seen: false,
    url,
    title,
  };
}

/**
 * Run the consolidation agent over all unconsolidated memories (up to
 * MAX_CONSOLIDATION_BATCH). Skips if there aren't enough memories.
 * Returns { skipped: true, reason } or { skipped: false, id, insight }.
 */
export async function consolidateNow() {
  await logEvent(EVENT.CONSOLIDATION_TRIGGER);

  const apiKey = await getApiKey();
  if (!apiKey) throw new OrchestratorError('No API key set', 'NO_KEY');

  const memories = await getUnconsolidatedMemories(MAX_CONSOLIDATION_BATCH);
  if (memories.length < MIN_CONSOLIDATION_BATCH) {
    return {
      skipped: true,
      reason: `Need at least ${MIN_CONSOLIDATION_BATCH} unconsolidated memories (have ${memories.length})`,
    };
  }

  let result;
  try {
    result = await runConsolidation(memories, apiKey);
  } catch (err) {
    throw new OrchestratorError(err.message, 'CONSOLIDATE_FAILED');
  }

  const id = await insertConsolidation({
    memory_ids: memories.map((m) => m.id),
    connections: result.connections,
    insight: result.insight,
    recommendations: result.recommendations,
  });
  await markConsolidated(memories.map((m) => m.id));

  await logEvent(EVENT.CONSOLIDATION_COMPLETE, {
    consolidation_id: id,
    memory_count: memories.length,
    recommendation_count: (result.recommendations || []).length,
  });

  return { skipped: false, id, insight: result.insight, recommendations: result.recommendations };
}

/**
 * Rebuild a FullAnalysis object from a cached memory WITHOUT calling
 * Gemini. Used by the side panel's tab-change handler: when the user
 * switches to a tab whose URL we've already analyzed, we want to
 * render the cached analysis immediately rather than re-running the
 * pipeline. Returns null if the URL has not been analyzed.
 */
export async function getFullAnalysisForUrl(url) {
  if (!url) return null;
  const existing = await getMemoryByUrl(url);
  if (!existing) return null;

  const stats = await getSessionStats();
  const analysis = memoryToAnalysis(existing);
  return {
    memory_id:    existing.id,
    analysis,
    bubble_score: stats.bubble_score,
    already_seen: true,
    url:          existing.url,
    title:        existing.title,
  };
}

function memoryToAnalysis(memory) {
  return {
    summary:            memory.summary,
    framing:            memory.framing,
    framing_confidence: memory.framing_confidence,
    sentiment:          memory.sentiment,
    topics:             memory.topics,
    entities:           memory.entities,
    importance:         memory.importance,
    // Audit fields — present on memories written by the 2-stage pipeline,
    // absent on legacy memories. The UI guards against missing values.
    reasoning:          memory.reasoning || '',
    framing_passages:   memory.framing_passages || [],
    agreement_rate:     memory.agreement_rate,
    unclear:            memory.unclear === true,
    sample_framings:    memory.sample_framings || [],
    n_samples:          memory.n_samples,
  };
}
