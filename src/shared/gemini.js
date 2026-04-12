// Minimal wrapper around Gemini's generateContent REST endpoint with
// responseSchema-enforced JSON output. This is the ONLY module that
// directly talks to the Gemini API — everything else goes through
// callGemini so we can mock it in tests and swap the endpoint in one
// place if the model name ever changes.

import { GEMINI_ENDPOINT } from './constants.js';

export class GeminiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Call Gemini with a prompt + response schema. Returns the parsed JSON
 * object; throws GeminiError on any failure (no API key, non-2xx
 * response, empty body, unparseable JSON).
 *
 * Optional `systemInstruction` goes into the top-level `systemInstruction`
 * field of the Gemini request (different from OpenAI's message-role
 * pattern — in Gemini v1beta it is a sibling of `contents`).
 */
export async function callGemini({
  prompt,
  systemInstruction,
  schema,
  apiKey,
  temperature = 0.2,
}) {
  if (!apiKey) throw new GeminiError('No API key configured');

  const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GeminiError(`Network error: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GeminiError(`Gemini HTTP ${res.status}`, {
      status: res.status,
      body: text.slice(0, 500),
    });
  }

  const data = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new GeminiError('Empty Gemini response', {
      body: JSON.stringify(data).slice(0, 500),
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError(
      `Gemini returned invalid JSON: ${text.slice(0, 200)}`,
    );
  }
}
