// Text-to-speech through the voices installed on the device.
export const germanVoice = () =>
  window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('de')) ?? null;

function utterance(text, rate) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = rate;
  const voice = germanVoice();
  if (voice) u.voice = voice;
  return u;
}

export function speak(text, rate = 0.9) {
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance(text, rate));
}

// Speaks one piece and calls onEnd when it has finished (not when it was stopped).
// Returns a function that stops it.
export function speakThen(text, rate, onEnd) {
  let stopped = false;
  const u = utterance(text, rate);
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
