// Where the app was (profile, screen, open text), so a reload comes back to the same place.
// Kept in this browser/app only; a missing or blocked storage just starts at the profile list.
const KEY = 'lesen:last';

export function loadPlace() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function savePlace(place) {
  try {
    if (place) localStorage.setItem(KEY, JSON.stringify(place));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: nothing to remember
  }
}
