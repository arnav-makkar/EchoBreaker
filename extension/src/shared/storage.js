// IndexedDB wrapper for EchoBreaker. All persistent state lives here:
// memories, consolidations, feedback, the singleton session row, and the
// research events log.
//
// Every async function opens the DB via getDb(), which caches the
// promise on first call so we don't reopen on every operation.

import { openDB } from 'idb';
import {
  DB_NAME, DB_VERSION, MAX_MEMORY_CHARS,
  MODEL_NAME, CLASSIFIER_BLINDED,
} from './constants.js';
import { computeBubbleScore } from './bubble.js';
import { getParticipantId, getCondition, hasConsented } from './research.js';

// Bumped whenever the export bundle shape changes in a non-additive way.
// Researchers receiving a bundle can use this to dispatch to the right
// analysis script instead of reverse-engineering the shape.
const EXPORT_SCHEMA_VERSION = 1;
const EXTENSION_VERSION = '0.1.0';

let _dbPromise = null;

// Test-only: close the cached DB connection and drop the cache.
// Must be called BEFORE indexedDB.deleteDatabase so the delete request
// doesn't block on an open connection.
export async function __resetDbCacheForTests() {
  if (_dbPromise) {
    try {
      const db = await _dbPromise;
      db.close();
    } catch {
      // ignore — we're tearing down anyway
    }
  }
  _dbPromise = null;
}

export function getDb() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // memories — unique index on url so we can dedupe revisits.
        const memories = db.createObjectStore('memories', {
          keyPath: 'id',
          autoIncrement: true,
        });
        memories.createIndex('url', 'url', { unique: true });
        memories.createIndex('consolidated', 'consolidated');
        memories.createIndex('created_at', 'created_at');

        db.createObjectStore('consolidations', {
          keyPath: 'id',
          autoIncrement: true,
        });

        db.createObjectStore('feedback', {
          keyPath: 'id',
          autoIncrement: true,
        });

        // Singleton session row, always id=1.
        db.createObjectStore('session', { keyPath: 'id' });

        // Research event log — only written to when research_mode is on.
        const events = db.createObjectStore('events', {
          keyPath: 'id',
          autoIncrement: true,
        });
        events.createIndex('session_id', 'session_id');
        events.createIndex('event_type', 'event_type');
        events.createIndex('timestamp', 'timestamp');
      },
    });
  }
  return _dbPromise;
}

// =========================================================================
// memories
// =========================================================================

/**
 * Insert a new memory, or return the existing one if we've already
 * analyzed this URL. Never creates duplicates.
 *
 * New audit fields from the 2-stage pipeline (reasoning,
 * framing_passages, agreement_rate, unclear, sample_framings,
 * n_samples) are persisted when present, ignored when absent.
 */
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
    title: title || '',
    content: (text || '').slice(0, MAX_MEMORY_CHARS),
    summary: analysis.summary,
    framing: analysis.framing,
    framing_confidence: analysis.framing_confidence,
    sentiment: analysis.sentiment,
    topics: Array.isArray(analysis.topics) ? analysis.topics : [],
    entities: Array.isArray(analysis.entities) ? analysis.entities : [],
    importance: analysis.importance,
    // New audit fields (safe defaults for legacy / single-call paths)
    reasoning:        analysis.reasoning || '',
    framing_passages: Array.isArray(analysis.framing_passages)
      ? analysis.framing_passages
      : [],
    agreement_rate:   typeof analysis.agreement_rate === 'number'
      ? analysis.agreement_rate
      : null,
    unclear:          analysis.unclear === true,
    sample_framings:  Array.isArray(analysis.sample_framings)
      ? analysis.sample_framings
      : [],
    n_samples:        analysis.n_samples || null,
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

// created_at has millisecond resolution, so two rows inserted in the
// same tick can tie. Break ties by id (auto-increment) so ordering is
// deterministic across runs.
function byCreatedAtDesc(a, b) {
  const cmp = (b.created_at || '').localeCompare(a.created_at || '');
  return cmp !== 0 ? cmp : (b.id || 0) - (a.id || 0);
}
function byCreatedAtAsc(a, b) {
  const cmp = (a.created_at || '').localeCompare(b.created_at || '');
  return cmp !== 0 ? cmp : (a.id || 0) - (b.id || 0);
}

export async function getAllMemories(limit = 50) {
  const db = await getDb();
  const all = await db.getAll('memories');
  return all.sort(byCreatedAtDesc).slice(0, limit);
}

export async function getUnconsolidatedMemories(limit = 50) {
  const db = await getDb();
  const all = await db.getAll('memories');
  return all.filter((m) => !m.consolidated).sort(byCreatedAtAsc).slice(0, limit);
}

export async function markConsolidated(memoryIds) {
  if (!memoryIds || memoryIds.length === 0) return;
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

// =========================================================================
// consolidations
// =========================================================================

export async function insertConsolidation({
  memory_ids, connections, insight, recommendations,
}) {
  const db = await getDb();
  return db.add('consolidations', {
    memory_ids,
    connections,
    insight,
    recommendations,
    created_at: new Date().toISOString(),
  });
}

export async function getRecentConsolidations(limit = 3) {
  const db = await getDb();
  const all = await db.getAll('consolidations');
  return all.sort(byCreatedAtDesc).slice(0, limit);
}

// =========================================================================
// feedback
// =========================================================================

export async function insertFeedback({ page_url, perspective_id, action }) {
  const db = await getDb();
  return db.add('feedback', {
    page_url:       page_url || '',
    perspective_id: perspective_id || null,
    action,
    created_at: new Date().toISOString(),
  });
}

// =========================================================================
// session (singleton row, id=1)
// =========================================================================

function freshSession() {
  return {
    id: 1,
    bubble_score: 0.5,
    pages_analyzed: 0,
    source_diversity: { left: 0, center: 0, right: 0 },
    topic_distribution: {},
    updated_at: new Date().toISOString(),
  };
}

async function getOrInitSession() {
  const db = await getDb();
  let row = await db.get('session', 1);
  if (!row) {
    row = freshSession();
    await db.put('session', row);
  }
  return row;
}

export async function getSessionStats() {
  return getOrInitSession();
}

/**
 * Record a new analyzed page in the session stats. Increments
 * pages_analyzed, bumps the source_diversity counter for this framing,
 * increments each topic's counter, and recomputes + persists the
 * bubble score. Returns the new score.
 */
export async function recordPageSeen(framing, topics) {
  const db = await getDb();
  const tx = db.transaction('session', 'readwrite');
  const row = (await tx.store.get(1)) || freshSession();

  row.pages_analyzed += 1;
  row.source_diversity[framing] = (row.source_diversity[framing] ?? 0) + 1;
  for (const t of topics || []) {
    const k = String(t).toLowerCase();
    row.topic_distribution[k] = (row.topic_distribution[k] ?? 0) + 1;
  }
  row.bubble_score = computeBubbleScore(row.source_diversity);
  row.updated_at = new Date().toISOString();

  await tx.store.put(row);
  await tx.done;
  return row.bubble_score;
}

// =========================================================================
// clear + export
// =========================================================================

export async function clearAllData() {
  const db = await getDb();
  for (const name of ['memories', 'consolidations', 'feedback', 'session', 'events']) {
    await db.clear(name);
  }
}

/**
 * Return a JSON-serializable snapshot of everything in the DB plus a
 * header block with schema version, participant identity, and the
 * pipeline configuration the data was collected under. Used by the
 * "Export research data" button in the Options page.
 *
 * The top-level `memories` / `consolidations` / `feedback` / `events`
 * / `session` keys are preserved from v0 of the bundle shape so old
 * analysis scripts and existing tests still work.
 */
export async function exportAll() {
  const db = await getDb();
  const [memories, consolidations, feedback, events] = await Promise.all([
    db.getAll('memories'),
    db.getAll('consolidations'),
    db.getAll('feedback'),
    db.getAll('events'),
  ]);
  const session = (await db.get('session', 1)) || freshSession();

  // Pull the research identity if the user has enrolled; leave null if
  // they haven't. Non-research installs produce a valid bundle too —
  // it just has no participant_id / condition.
  const [participantId, condition, consented] = await Promise.all([
    getParticipantId().catch(() => null),
    getCondition().catch(() => null),
    hasConsented().catch(() => false),
  ]);

  return {
    // --- header ---
    schema_version:     EXPORT_SCHEMA_VERSION,
    extension_version:  EXTENSION_VERSION,
    export_timestamp:   new Date().toISOString(),
    participant_id:     participantId,
    condition:          condition,
    consented:          consented,
    // Pipeline configuration the data was collected under. Lets a
    // researcher tell at a glance whether this bundle came from a
    // blinded or leaky classifier and which model version was in use.
    model_name:         MODEL_NAME,
    classifier_blinded: CLASSIFIER_BLINDED,

    // --- payload (backward-compatible top-level keys) ---
    session,
    memories,
    consolidations,
    feedback,
    events,
  };
}
