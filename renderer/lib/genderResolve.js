// Gender of a capitalised noun form: the form itself, else its longest known ending
// (Krankenversicherungskarte → Karte → f). 'x' means more than one gender: not coloured.
export function resolveGender(map, word, exactOnly = false) {
  const exact = map.get(word);
  if (exact || exactOnly) return exact ?? null;
  for (let i = 2; i <= word.length - 3; i++) {
    const g = map.get(word[i].toUpperCase() + word.slice(i + 1));
    if (g) return g;
  }
  return null;
}
