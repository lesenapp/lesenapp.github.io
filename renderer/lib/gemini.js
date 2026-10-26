// Gemini API (Google AI Studio key, free tier). Called straight from the app on every device;
// the key stays in this profile's settings on this device.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (best free)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (faster, more requests per day)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (older)' },
  // Not on the free tier: needs billing on the key's Google Cloud project.
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon (paid API, needs billing)' },
];

export const KEY_PAGE = 'https://aistudio.google.com/apikey';

const SYSTEM = `You are a patient German tutor inside "Lesen", a reading app. The learner reads German texts and asks about words and sentences. Answer in English (German examples in German).

When asked about a word, cover what helps: meaning in this context, part of speech, base form, gender and plural for nouns, word formation (compound parts, prefixes, suffixes), separable or inseparable prefix verbs (show the split position, e.g. "Ich rufe dich an"), case or preposition it takes, principal parts for verbs (Infinitiv, Präteritum, Perfekt with haben/sein), and 1–2 short example sentences with translations.

When asked about a sentence, give a translation, then explain word order (verb position: V2, verb-final in subordinate clauses, Satzklammer), the case of each noun phrase and why, verb tenses/moods, separable verbs and anything a learner would trip over.

Be concise and structured: short headings or bullet points, no filler. Use Markdown (**bold**, lists). If the learner writes in Turkish, answer in Turkish.`;

// Streams the answer; onText gets the whole text so far. Returns the final text.
export async function askGemini({ key, model, history, onText, signal }) {
  const res = await fetch(`${API}/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const chunk = JSON.parse(line.slice(5));
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      text += parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
      onText(text);
    }
  }
  if (!text) throw new Error('Gemini sent an empty answer. Try again or rephrase.');
  return text;
}

async function errorMessage(res) {
  let message = '';
  try {
    message = (await res.json()).error?.message ?? '';
  } catch {
    // not JSON
  }
  if (res.status === 400 && /API key/i.test(message)) return 'The Gemini API key is not valid. Check it in Settings.';
  if ([403, 404, 429].includes(res.status) && /argon/.test(res.url))
    return 'Gemini 4 Argon is not free in the API (it needs billing). Use the “Gemini app ↗” button (your Pro plan) or choose a Flash model in Settings.';
  if (res.status === 403) return 'This API key is not allowed to use Gemini. Create a new key in Google AI Studio.';
  if (res.status === 404) return 'This model is not available. Choose another model in Settings.';
  if (res.status === 429)
    return 'The free limit is used up for now. Wait a minute (or until tomorrow), or choose Flash-Lite in Settings.';
  return message || `Gemini error ${res.status}`;
}
