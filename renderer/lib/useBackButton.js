import { useEffect, useRef } from 'react';

// Phone back button / browser back, one step at a time: while `active` (a screen other than the
// Library, an open word panel, a dialog) a history entry exists, and Back calls `onBack` for the
// most recently opened one only. Closing it from the UI removes its entry again.
const stack = [];
let ignorePops = 0;
let pendingBack = 0;

// Several entries closed at once (e.g. leaving the reader with a word open) are removed with
// one history.go(-n), which fires a single popstate to ignore.
function dropEntry() {
  if (pendingBack++ > 0) return;
  queueMicrotask(() => {
    const n = pendingBack;
    pendingBack = 0;
    ignorePops++;
    history.go(-n);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      ignorePops--;
      return;
    }
    const top = stack.pop();
    if (top) {
      top.popped = true;
      top.onBack();
    }
  });
}

export function useBackButton(active, onBack) {
  const callback = useRef(onBack);
  callback.current = onBack;

  useEffect(() => {
    if (!active) return;
    const entry = { popped: false, onBack: () => callback.current() };
    stack.push(entry);
    history.pushState({ lesen: stack.length }, '');
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (!entry.popped) dropEntry();
    };
  }, [active]);
}
