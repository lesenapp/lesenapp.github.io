// Text-to-speech through the voices installed on the device. `tag` is the language of the
// profile: 'de-DE', or 'en-GB' / 'en-US' for English (British or American accent).

// The voice for a language: the exact accent if installed, else any voice of that language.
export function voiceFor(tag = 'de-DE') {
  const voices = window.speechSynthesis.getVoices();
  const lower = tag.toLowerCase();
  const lang = (v) => v.lang?.toLowerCase().replace('_', '-') ?? '';
  return (
    voices.find((v) => lang(v) === lower) ?? voices.find((v) => lang(v).startsWith(lower.slice(0, 2))) ?? null
  );
}

function utterance(text, rate, tag) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = tag;
  u.rate = rate;
  const voice = voiceFor(tag);
  if (voice) u.voice = voice;
  return u;
}

export function speak(text, rate = 0.9, tag = 'de-DE') {
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance(text, rate, tag));
}

// Speaks one piece and calls onEnd when it has finished (not when it was stopped).
// Returns a function that stops it.
export function speakThen(text, rate, tag, onEnd) {
  let stopped = false;
  const u = utterance(text, rate, tag);
  u.onend = () => !stopped && onEnd();
  u.onerror = (e) => !stopped && e.error !== 'interrupted' && e.error !== 'canceled' && onEnd();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return () => {
    stopped = true;
    window.speechSynthesis.cancel();
  };
}

// iPhones only allow speech that starts from a tap; an empty utterance during the tap unlocks it.
export function unlockSpeech() {
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

// A recorded pronunciation (mp3), e.g. the UK/US recordings of English words.
export function playAudio(url) {
  window.speechSynthesis.cancel();
  new Audio(url).play().catch(() => {});
}
