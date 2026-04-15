# EchoBreaker

Final Course Project for Human-AI Interaction, Winter 2026
[Pitch Deck (PDF)](./EchoBreaker.pdf) | [Demo Video](./Video.MP4)

EchoBreaker is a local-first Chrome extension for spotting media framing and exposing filter bubbles while you read the news. It analyzes supported articles with Gemini, labels framing as `left`, `center`, `right`, or `unclear`, and turns your recent reading into a live bubble score.

Instead of giving a source-level label to an entire outlet, EchoBreaker works article by article. It shows a summary, reasoning, key passages, and a running view of how balanced your reading has actually been.

Everything runs inside the extension. Your data stays in the browser, and the only external request is the one your browser sends directly to the Gemini API with your own key.

## What it does

- Labels article framing with a confidence score
- Shows a short summary and reasoning for the label
- Tracks a bubble score and reading mix over time
- Lets users reflect on recent reading patterns
- Supports optional research enrollment and local data export

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Build the extension

```bash
npm run build
```

### 3. Load it into Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder in this repo

### 4. Add your Gemini API key

1. Open the EchoBreaker **Options** page
2. Get a key from [Google AI Studio](https://aistudio.google.com/)
3. Paste the key into **Gemini API Key**
4. Click **Test key**
5. Click **Save**

### 5. Try it

Open a supported news article, then open the EchoBreaker side panel or popup from the Chrome toolbar.

## What the user sees

- **Side panel:** framing label, confidence, summary, reasoning, and key passages
- **Popup:** bubble score, reading mix, recent insights, and a **Reflect now** button
- **Options page:** API key, daily cap, research settings, and data export

The bubble score is based on normalized Shannon entropy across `left`, `center`, and `right` readings. More variety lowers the score, heavier concentration raises it, and a fresh install starts at a neutral `0.5`.

## Supported sites

EchoBreaker currently runs on 45 news domains across US, UK, and Indian news sites.

Examples include Reuters, AP, BBC, CNN, Fox News, The New York Times, The Washington Post, The Guardian, WSJ, NPR, Bloomberg, Al Jazeera, The Hindu, Hindustan Times, Indian Express, NDTV, India Today, The Quint, The Print, Jagran, and Live Hindustan.

For the full allowlist, see [src/shared/constants.js](src/shared/constants.js) and [manifest.json](manifest.json).

## Privacy

EchoBreaker stores analysis data locally in the browser and settings in `chrome.storage.local`. It does not use a backend server and does not send data to any project-owned API.

## Research mode

Research mode is optional and off by default. If enabled from the Options page, EchoBreaker records anonymized interaction events and lets the user export a local JSON bundle for the study.

## Development

- `npm run dev` starts Vite
- `npm run build` builds the extension into `dist/`
- `npm test` runs the Vitest suite
- Main project settings live in [src/shared/constants.js](src/shared/constants.js)

## Limitations

- AI framing labels can be wrong
- `left`, `center`, and `right` are simplified categories, especially for Indian political coverage
- EchoBreaker only works on supported article pages, not homepages or section listings
