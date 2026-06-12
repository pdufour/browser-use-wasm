import { useEffect, useRef } from 'react';
import { wireClearCacheButton } from '../../../shared/clear-browser-cache.js';

/** Compact OPFS + consent reset — examples only. */
export function ClearCacheButton() {
  const slotRef = useRef(null);

  useEffect(() => {
    wireClearCacheButton(slotRef.current, { compact: true });
  }, []);

  return <span ref={slotRef} className="command-bar__clear-cache" />;
}
