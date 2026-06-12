/**
 * Examples-only — clear wllama OPFS weights + download consent, then reload.
 * Does not touch repo `.model-cache/` (use `npm run cache:clear` for that).
 */
import { clearStoredDownloadConsent } from './model-download-gate.js';

/** OPFS (`navigator.storage.getDirectory`) requires a secure context — localhost/https, not `.local` http. */
export function isOpfsCacheAvailable() {
  return (
    globalThis.isSecureContext === true &&
    typeof navigator.storage?.getDirectory === 'function'
  );
}

/**
 * @returns {Promise<{ opfsFiles: number, opfsAvailable: boolean }>}
 */
export async function clearBrowserModelCache() {
  const opfsAvailable = isOpfsCacheAvailable();
  let opfsFiles = 0;

  if (opfsAvailable) {
    const { CacheManager } = await import('@wllama/wllama');
    const cache = new CacheManager();
    const entries = await cache.list().catch(() => []);
    await cache.clear().catch(() => {});
    opfsFiles = entries.length;
  }

  clearStoredDownloadConsent();
  return { opfsFiles, opfsAvailable };
}

/**
 * @param {HTMLButtonElement} btn
 * @param {string} idleLabel
 */
async function onClearCacheClick(btn, idleLabel) {
  const opfsAvailable = isOpfsCacheAvailable();
  const ok = confirm(
    opfsAvailable
      ? 'Clear downloaded model weights from this browser and reset the consent dialog?\n\nThe page will reload.'
      : 'Model cache (OPFS) is not available on this origin — use https:// or http://localhost.\n\nReset the download consent dialog and reload?'
  );
  if (!ok) return;
  btn.disabled = true;
  btn.textContent = 'Clearing…';
  try {
    const { opfsFiles, opfsAvailable: clearedOpfs } = await clearBrowserModelCache();
    btn.textContent = !clearedOpfs
      ? 'Consent reset — reloading…'
      : opfsFiles > 0
        ? `Cleared ${opfsFiles} file(s) — reloading…`
        : 'Reloading…';
    location.reload();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = idleLabel;
    alert(err instanceof Error ? err.message : String(err));
  }
}

/**
 * @param {ParentNode | null | undefined} container
 * @param {{ compact?: boolean }} [opts]
 * @returns {HTMLButtonElement | null}
 */
export function wireClearCacheButton(container, { compact = false } = {}) {
  if (!container || container.querySelector('[data-clear-browser-cache]')) return null;

  const idleLabel = compact ? 'Clear cache' : 'Clear browser cache';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = compact
    ? 'site-header__github browse-clear-cache'
    : 'site-header__github dev-cache-tools__btn';
  btn.dataset.clearBrowserCache = '1';
  btn.title =
    'Clear wllama weights in this browser (OPFS) and reset download consent. Repo .model-cache/: npm run cache:clear';
  btn.textContent = idleLabel;
  btn.addEventListener('click', () => onClearCacheClick(btn, idleLabel));

  if (compact) {
    container.appendChild(btn);
    return btn;
  }

  const wrap = document.createElement('div');
  wrap.className = 'dev-cache-tools';

  const hint = document.createElement('p');
  hint.className = 'dev-cache-tools__hint';
  hint.textContent =
    'Clears wllama weights stored in this browser (OPFS) and resets the download consent dialog. To clear repo .model-cache/ on disk, run npm run cache:clear in the terminal.';

  wrap.append(hint, btn);
  container.appendChild(wrap);
  return btn;
}
