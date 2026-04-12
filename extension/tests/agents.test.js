import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  analyzeContent, runConsolidation, aggregateSamples,
  CLASSIFICATION_SAMPLES,
  __setClassifierBlindedForTests,
  __clearClassifierBlindedOverrideForTests,
} from '../src/shared/agents.js';

// =========================================================================
// helpers
// =========================================================================

function geminiResponse(obj) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }],
    }),
    text: async () => JSON.stringify(obj),
  };
}

function mockHttpError(status, body = 'bad key') {
  return {
    ok: false,
    status,
    json: async () => ({ error: body }),
    text: async () => body,
  };
}

function defaultExtraction() {
  return {
    summary: 'A descriptive summary of the article without political framing.',
    topics: ['climate', 'regulation'],
    entities: ['EPA'],
    sentiment: 0.1,
    importance: 0.8,
    framing_passages: [
      { quote: 'long-overdue reckoning', why: 'moral framing of policy' },
      { quote: 'devastated low-income communities', why: 'class-framing cue' },
    ],
  };
}

function classificationSample({ framing, confidence, reasoning }) {
  return {
    reasoning,
    framing,
    framing_confidence: confidence,
  };
}

/**
 * Build a fetch mock that returns a sequence of responses in order.
 * Used to simulate the 4-call pipeline: 1 extraction + 3 classifications.
 */
function chainedFetch(...responses) {
  const queue = [...responses];
  return vi.fn().mockImplementation(async () => {
    if (queue.length === 0) throw new Error('fetch mock ran out of responses');
    return queue.shift();
  });
}

// =========================================================================
// aggregateSamples — unit test on the pure aggregation logic
// =========================================================================

describe('aggregateSamples', () => {
  it('3/3 unanimous returns that framing with full agreement', () => {
    const v = aggregateSamples([
      classificationSample({ framing: 'left', confidence: 0.9, reasoning: 'r1' }),
      classificationSample({ framing: 'left', confidence: 0.85, reasoning: 'r2' }),
      classificationSample({ framing: 'left', confidence: 0.8, reasoning: 'r3' }),
    ]);
    expect(v.framing).toBe('left');
    expect(v.agreement_rate).toBe(1);
    expect(v.unclear).toBe(false);
    // Confidence = mean self-conf * agreement = ((0.9+0.85+0.8)/3) * 1
    expect(v.framing_confidence).toBeCloseTo(0.85, 2);
    // Best reasoning should be from the sample with highest self-confidence
    expect(v.reasoning).toBe('r1');
  });

  it('2/3 majority returns the majority framing with scaled confidence', () => {
    const v = aggregateSamples([
      classificationSample({ framing: 'right', confidence: 0.9, reasoning: 'rright' }),
      classificationSample({ framing: 'right', confidence: 0.7, reasoning: 'rright2' }),
      classificationSample({ framing: 'center', confidence: 0.6, reasoning: 'rcenter' }),
    ]);
    expect(v.framing).toBe('right');
    expect(v.agreement_rate).toBeCloseTo(0.667, 2);
    expect(v.unclear).toBe(false);
    // Mean of winning samples' self-conf = (0.9+0.7)/2 = 0.8
    // Scaled by agreement 2/3 ≈ 0.533
    expect(v.framing_confidence).toBeCloseTo(0.533, 2);
    expect(v.reasoning).toBe('rright'); // most-confident winner
  });

  it('all 3 different returns unclear', () => {
    const v = aggregateSamples([
      classificationSample({ framing: 'left', confidence: 0.7, reasoning: 'r1' }),
      classificationSample({ framing: 'center', confidence: 0.6, reasoning: 'r2' }),
      classificationSample({ framing: 'right', confidence: 0.8, reasoning: 'r3' }),
    ]);
    expect(v.framing).toBe('unclear');
    expect(v.unclear).toBe(true);
  });

  it('empty input returns unclear with confidence 0', () => {
    const v = aggregateSamples([]);
    expect(v.framing).toBe('unclear');
    expect(v.unclear).toBe(true);
    expect(v.framing_confidence).toBe(0);
  });

  it('skips null samples (failed classifications)', () => {
    const v = aggregateSamples([
      classificationSample({ framing: 'left', confidence: 0.9, reasoning: 'r1' }),
      null,
      classificationSample({ framing: 'left', confidence: 0.85, reasoning: 'r2' }),
    ]);
    expect(v.framing).toBe('left');
    expect(v.agreement_rate).toBe(1); // 2/2 valid samples agreed
    expect(v.sample_framings.length).toBe(2);
  });

  it('preserves per-sample framing list for audit', () => {
    const v = aggregateSamples([
      classificationSample({ framing: 'right', confidence: 0.8, reasoning: 'r' }),
      classificationSample({ framing: 'center', confidence: 0.5, reasoning: 'r' }),
      classificationSample({ framing: 'right', confidence: 0.9, reasoning: 'r' }),
    ]);
    expect(v.sample_framings).toEqual(['right', 'center', 'right']);
  });
});

// =========================================================================
// analyzeContent — integration test with 4-call mock chain
// =========================================================================

describe('analyzeContent (2-stage pipeline)', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { __clearClassifierBlindedOverrideForTests(); });

  it('calls extraction once + classification 3 times and aggregates', async () => {
    const fetchMock = chainedFetch(
      geminiResponse(defaultExtraction()),
      geminiResponse(classificationSample({
        framing: 'left', confidence: 0.92, reasoning: 'Quote 1 uses moral framing.',
      })),
      geminiResponse(classificationSample({
        framing: 'left', confidence: 0.88, reasoning: 'The passages emphasize harm.',
      })),
      geminiResponse(classificationSample({
        framing: 'left', confidence: 0.85, reasoning: 'Clear progressive wording.',
      })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await analyzeContent(
      { text: 'Some article text', url: 'https://example.com/x', title: 'Headline' },
      'fake-key',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1 + CLASSIFICATION_SAMPLES);

    // Backward-compatible fields
    expect(out.summary).toBe('A descriptive summary of the article without political framing.');
    expect(out.framing).toBe('left');
    expect(out.topics).toEqual(['climate', 'regulation']);
    expect(out.entities).toEqual(['EPA']);
    expect(out.importance).toBe(0.8);

    // New audit fields
    expect(out.agreement_rate).toBe(1);
    expect(out.unclear).toBe(false);
    expect(out.n_samples).toBe(CLASSIFICATION_SAMPLES);
    expect(out.sample_framings).toEqual(['left', 'left', 'left']);
    expect(out.reasoning).toContain('moral framing'); // highest-conf winner
    expect(out.framing_passages.length).toBe(2);
  });

  it('returns framing=center and unclear=true when samples disagree', async () => {
    const fetchMock = chainedFetch(
      geminiResponse(defaultExtraction()),
      geminiResponse(classificationSample({ framing: 'left',   confidence: 0.7, reasoning: 'rL' })),
      geminiResponse(classificationSample({ framing: 'center', confidence: 0.6, reasoning: 'rC' })),
      geminiResponse(classificationSample({ framing: 'right',  confidence: 0.8, reasoning: 'rR' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await analyzeContent(
      { text: 'ambiguous article', url: '', title: '' },
      'fake-key',
    );

    // Outward framing is 'center' for retriever compatibility, but the
    // unclear flag is set so the UI can render a distinct state.
    expect(out.framing).toBe('center');
    expect(out.unclear).toBe(true);
    expect(out.sample_framings).toEqual(['left', 'center', 'right']);
  });

  it('BLINDED mode: no outgoing call contains the URL, domain, or title', async () => {
    __setClassifierBlindedForTests(true);
    const fetchMock = chainedFetch(
      geminiResponse(defaultExtraction()),
      geminiResponse(classificationSample({ framing: 'center', confidence: 0.7, reasoning: 'neutral' })),
      geminiResponse(classificationSample({ framing: 'center', confidence: 0.7, reasoning: 'neutral' })),
      geminiResponse(classificationSample({ framing: 'center', confidence: 0.7, reasoning: 'neutral' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await analyzeContent(
      {
        text: 'Body of the article — the only thing the pipeline should see.',
        url: 'https://www.foxnews.com/politics/something',
        title: 'FOX NEWS: breaking',
      },
      'fake-key',
    );

    // Walk every outgoing prompt body and make sure none contain
    // the URL, domain, or title.
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(call[1].body);
      const userText = body.contents[0].parts[0].text;
      const systemText = body.systemInstruction?.parts?.[0]?.text || '';
      const combined = userText + '\n' + systemText;
      expect(combined).not.toContain('foxnews.com');
      expect(combined).not.toContain('FOX NEWS');
    }
  });

  it('LEAKY mode: extraction call DOES receive URL and title', async () => {
    __setClassifierBlindedForTests(false);
    const fetchMock = chainedFetch(
      geminiResponse(defaultExtraction()),
      geminiResponse(classificationSample({ framing: 'left', confidence: 0.8, reasoning: 'r' })),
      geminiResponse(classificationSample({ framing: 'left', confidence: 0.8, reasoning: 'r' })),
      geminiResponse(classificationSample({ framing: 'left', confidence: 0.8, reasoning: 'r' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await analyzeContent(
      {
        text: 'Body.',
        url: 'https://www.foxnews.com/politics/xyz',
        title: 'FOX NEWS: Breaking',
      },
      'fake-key',
    );

    // The FIRST call is the extraction call — it should contain URL + title.
    const extractionBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const extractionPrompt = extractionBody.contents[0].parts[0].text;
    expect(extractionPrompt).toContain('https://www.foxnews.com/politics/xyz');
    expect(extractionPrompt).toContain('FOX NEWS: Breaking');

    // The classification calls (calls 2, 3, 4) must NOT see the URL/title.
    // They only get the distilled evidence payload.
    for (let i = 1; i < fetchMock.mock.calls.length; i++) {
      const body = JSON.parse(fetchMock.mock.calls[i][1].body);
      const prompt = body.contents[0].parts[0].text;
      expect(prompt).not.toContain('foxnews.com');
      expect(prompt).not.toContain('FOX NEWS: Breaking');
    }
  });

  it('uses Gemini systemInstruction slot for rules, user message for data', async () => {
    const fetchMock = chainedFetch(
      geminiResponse(defaultExtraction()),
      geminiResponse(classificationSample({ framing: 'center', confidence: 0.7, reasoning: 'r' })),
      geminiResponse(classificationSample({ framing: 'center', confidence: 0.7, reasoning: 'r' })),
      geminiResponse(classificationSample({ framing: 'center', confidence: 0.7, reasoning: 'r' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await analyzeContent({ text: 'body', url: '', title: '' }, 'fake-key');

    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(call[1].body);
      expect(body.systemInstruction).toBeTruthy();
      expect(body.systemInstruction.parts[0].text.length).toBeGreaterThan(100);
      // Framing guide should live in system instruction, not user message
      expect(body.systemInstruction.parts[0].text).toContain('Framing guide');
    }
  });

  it('throws GeminiError on extraction HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockHttpError(400, 'invalid key')));
    await expect(
      analyzeContent({ text: 'x', url: '', title: '' }, 'bad-key'),
    ).rejects.toThrow(/Gemini HTTP 400/);
  });

  it('throws when no api key is provided', async () => {
    await expect(
      analyzeContent({ text: 'x', url: '', title: '' }, null),
    ).rejects.toThrow(/No API key/);
  });

  it('survives one failing classification sample via null-skip aggregation', async () => {
    // 1 extraction succeeds + 2 classification succeed + 1 classification fails
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(geminiResponse(defaultExtraction()))
      .mockResolvedValueOnce(geminiResponse(classificationSample({
        framing: 'left', confidence: 0.9, reasoning: 'r1',
      })))
      .mockResolvedValueOnce(mockHttpError(503, 'transient'))
      .mockResolvedValueOnce(geminiResponse(classificationSample({
        framing: 'left', confidence: 0.85, reasoning: 'r2',
      })));
    vi.stubGlobal('fetch', fetchMock);

    const out = await analyzeContent(
      { text: 'body', url: '', title: '' },
      'fake-key',
    );

    // Only 2 samples returned, both left → agreement 1.0
    expect(out.framing).toBe('left');
    expect(out.agreement_rate).toBe(1);
    expect(out.sample_framings.length).toBe(2);
    expect(out.unclear).toBe(false);
  });
});

// =========================================================================
// runConsolidation — unchanged by the pipeline refactor
// =========================================================================

describe('runConsolidation', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('formats memories into the prompt and returns parsed result', async () => {
    const mockResult = {
      connections: [{ from_id: 1, to_id: 2, reason: 'same topic' }],
      insight: 'You are reading mostly left-leaning climate coverage.',
      recommendations: ['Try a right-leaning outlet on the same topic.'],
    };
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(mockResult));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runConsolidation(
      [
        { id: 1, created_at: '2026-01-01', title: 'A', framing: 'left',  topics: ['climate'], summary: 's1' },
        { id: 2, created_at: '2026-01-02', title: 'B', framing: 'right', topics: ['climate'], summary: 's2' },
      ],
      'fake-key',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain('[#1]');
    expect(body.contents[0].parts[0].text).toContain('[#2]');
    expect(out).toEqual(mockResult);
  });
});
