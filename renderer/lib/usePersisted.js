import { useEffect, useRef, useState } from 'react';

// State loaded from and saved to the profile's JSON file. null until loaded.
export function usePersisted(profileId, name, initial) {
  const [value, setValue] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    let alive = true;
    window.api.load(profileId, name).then((v) => {
      if (!alive) return;
      loaded.current = true;
      setValue(v ?? initial);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, name]);

  useEffect(() => {
    if (loaded.current && value !== null) window.api.save(profileId, name, value);
  }, [profileId, name, value]);

  return [value, setValue];
}
