#!/usr/bin/env node
// Smoke test: reads GOOGLE_API_KEY and sends "hello" to gemini-2.0-flash-lite.
// No dependencies — uses Node's built-in fetch and a tiny .env parser.
//
// Lookup order for the key:
//   1. process.env.GOOGLE_API_KEY
//   2. ../.env (project root, where your key likely lives)
//   3. ./.env (extension directory)
//
// The script prints the model's reply but NEVER prints the key itself.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- minimal .env parser ----

function parseDotenv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

// Accept either name — Google's docs use GOOGLE_API_KEY but many users
// name it GEMINI_API_KEY since the model is Gemini.
const KEY_NAMES = ['GOOGLE_API_KEY', 'GEMINI_API_KEY'];

function pickFrom(obj) {
  for (const name of KEY_NAMES) if (obj[name]) return { key: obj[name], name };
  return null;
}

function loadKey() {
  const fromProcess = pickFrom(process.env);
  if (fromProcess) {
    return { key: fromProcess.key, source: `process.env.${fromProcess.name}` };
  }

  const candidates = [
    join(__dirname, '..', '..', '.env'), // project root
    join(__dirname, '..', '.env'),        // extension dir
  ];

  for (const path of candidates) {
    try {
      const env = parseDotenv(readFileSync(path, 'utf8'));
      const picked = pickFrom(env);
      if (picked) return { key: picked.key, source: `${path} (${picked.name})` };
    } catch {
      // missing file — try next
    }
  }
  return null;
}

// ---- call ----

// Default matches extension's MODEL_NAME in src/shared/constants.js.
// Override with: MODEL=gemini-3.1-flash-lite-preview npm run test:key
const MODEL = process.env.MODEL || 'gemini-2.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function main() {
  const found = loadKey();
  if (!found) {
    console.error('No API key found.');
    console.error(`Looked for ${KEY_NAMES.join(' or ')} in:`);
    console.error('  - process.env');
    console.error('  - ../.env');
    console.error('  - ./.env');
    process.exit(1);
  }
  console.log(`Key source: ${found.source}`);
  console.log(`Model:      ${MODEL}`);
  console.log(`Prompt:     "hello"`);
  console.log('');

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(found.key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      }),
    });
  } catch (err) {
    console.error(`Network error: ${err.message}`);
    process.exit(2);
  }

  const latency = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text();
    console.error(`HTTP ${res.status} (${latency}ms):`);
    console.error(body.slice(0, 500));
    process.exit(3);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  console.log(`OK — ${latency}ms`);
  console.log('---');
  console.log(text || '(empty response)');
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
