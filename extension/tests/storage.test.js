import { describe, it, expect, beforeEach } from 'vitest';
import {
  upsertMemory, getMemoryByUrl, recordPageSeen, getSessionStats,
  getUnconsolidatedMemories, markConsolidated,
  insertConsolidation, getRecentConsolidations,
  insertFeedback, clearAllData, exportAll,
  __resetDbCacheForTests,
} from '../src/shared/storage.js';

const sampleAnalysis = {
  summary: 'A test article.',
  framing: 'left',
  framing_confidence: 0.9,
  sentiment: 0.1,
  topics: ['climate', 'policy'],
  entities: ['EPA'],
  importance: 0.8,
};

beforeEach(async () => {
  // Close and drop the cached DB connection before deleting, otherwise
  // the delete request will block.
  await __resetDbCacheForTests();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('echobreaker');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe('upsertMemory', () => {
  it('inserts a new memory and returns alreadyExisted=false', async () => {
    const { id, alreadyExisted } = await upsertMemory({
      url: 'https://example.com/a',
      title: 'A',
      text: 'body',
      analysis: sampleAnalysis,
    });
    expect(id).toBeGreaterThan(0);
    expect(alreadyExisted).toBe(false);
  });

  it('returns the existing id on a second upsert with the same URL', async () => {
    const first = await upsertMemory({
      url: 'https://example.com/dup',
      title: 'A',
      text: 'body',
      analysis: sampleAnalysis,
    });
    const second = await upsertMemory({
      url: 'https://example.com/dup',
      title: 'A2 (should be ignored)',
      text: 'body2',
      analysis: { ...sampleAnalysis, framing: 'right' },
    });
    expect(second.alreadyExisted).toBe(true);
    expect(second.id).toBe(first.id);

    const fetched = await getMemoryByUrl('https://example.com/dup');
    // Original record preserved — upsert does not overwrite.
    expect(fetched.framing).toBe('left');
  });
});

describe('recordPageSeen', () => {
  it('starts at 0.5 and updates after first page', async () => {
    const initial = await getSessionStats();
    expect(initial.bubble_score).toBe(0.5);
    expect(initial.pages_analyzed).toBe(0);

    const score = await recordPageSeen('left', ['climate']);
    expect(score).toBeGreaterThan(0.5); // one-sided -> higher bubble

    const next = await getSessionStats();
    expect(next.pages_analyzed).toBe(1);
    expect(next.source_diversity.left).toBe(1);
    expect(next.topic_distribution.climate).toBe(1);
  });

  it('decreases bubble score as reading diversifies', async () => {
    await recordPageSeen('left', []);
    await recordPageSeen('left', []);
    const high = (await getSessionStats()).bubble_score;

    await recordPageSeen('right', []);
    await recordPageSeen('center', []);
    await recordPageSeen('center', []);
    const lower = (await getSessionStats()).bubble_score;

    expect(lower).toBeLessThan(high);
  });
});

describe('consolidations', () => {
  it('inserts and retrieves in reverse chronological order', async () => {
    await insertConsolidation({
      memory_ids: [1, 2],
      connections: [],
      insight: 'first',
      recommendations: [],
    });
    await insertConsolidation({
      memory_ids: [3, 4],
      connections: [],
      insight: 'second',
      recommendations: [],
    });

    const recent = await getRecentConsolidations(5);
    expect(recent.length).toBe(2);
    expect(recent[0].insight).toBe('second');
    expect(recent[1].insight).toBe('first');
  });

  it('markConsolidated flips the flag on specified memories', async () => {
    const a = await upsertMemory({
      url: 'https://example.com/1', title: 'a', text: 'x', analysis: sampleAnalysis,
    });
    const b = await upsertMemory({
      url: 'https://example.com/2', title: 'b', text: 'x', analysis: sampleAnalysis,
    });

    const before = await getUnconsolidatedMemories();
    expect(before.length).toBe(2);

    await markConsolidated([a.id]);
    const after = await getUnconsolidatedMemories();
    expect(after.length).toBe(1);
    expect(after[0].id).toBe(b.id);
  });
});

describe('feedback', () => {
  it('inserts a row with page_url + action', async () => {
    await insertFeedback({
      page_url: 'https://example.com/x',
      perspective_id: 'imm-r-01',
      action: 'thumbs_up',
    });
    const dump = await exportAll();
    expect(dump.feedback.length).toBe(1);
    expect(dump.feedback[0].action).toBe('thumbs_up');
    expect(dump.feedback[0].perspective_id).toBe('imm-r-01');
  });
});

describe('clearAllData + exportAll', () => {
  it('clearAllData empties every store', async () => {
    await upsertMemory({
      url: 'https://example.com/c',
      title: 'c',
      text: 'x',
      analysis: sampleAnalysis,
    });
    await insertFeedback({ page_url: 'https://example.com/c', action: 'click' });
    await recordPageSeen('center', ['test']);

    const before = await exportAll();
    expect(before.memories.length).toBeGreaterThan(0);

    await clearAllData();

    const after = await exportAll();
    expect(after.memories.length).toBe(0);
    expect(after.feedback.length).toBe(0);
    // session is re-initialized to the fresh default on next read
    expect(after.session.pages_analyzed).toBe(0);
  });
});
