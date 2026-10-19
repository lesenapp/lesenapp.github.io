// Text-to-speech through the voices installed in Windows.
export const germanVoice = () =>
  window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('de')) ?? null;

export function speak(text, rate = 0.9) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = rate;
  const voice = germanVoice();
  if (voice) u.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
