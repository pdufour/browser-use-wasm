import {
  canDownloadModelInBrowser,
  isRemoteModelLoadEnabled,
} from 'browser-use-wasm';

const CONSENT_STORAGE_PREFIX = 'model-download-consent:v1:';

/** Off by default — examples call {@link setModelDownloadConsentRequired}(true). */
let requireConsent = false;

/** Opt in to the download consent modal (examples only). Library embedders: leave false. */
export function setModelDownloadConsentRequired(required) {
  requireConsent = !!required;
}

export function isModelDownloadConsentRequired() {
  return requireConsent;
}

function consentStorageKey(modelId) {
  return `${CONSENT_STORAGE_PREFIX}${modelId}`;
}

function hasStoredDownloadConsent(modelId) {
  try {
    return sessionStorage.getItem(consentStorageKey(modelId)) === '1';
  } catch {
    return false;
  }
}

function storeDownloadConsent(modelId) {
  try {
    sessionStorage.setItem(consentStorageKey(modelId), '1');
  } catch {
    /* private mode */
  }
}

/** Drop stored download consent (one model or all examples models). */
export function clearStoredDownloadConsent(modelId) {
  try {
    if (modelId) {
      sessionStorage.removeItem(consentStorageKey(modelId));
      return;
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CONSENT_STORAGE_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    /* private mode */
  }
}

/**
 * @param {import('../../src/config/models/types.ts').ModelCard} model
 * @param {Set<string>} cachedIds
 */
export function shouldPromptModelDownload(model, cachedIds) {
  if (!requireConsent) return false;
  if (hasStoredDownloadConsent(model.id)) return false;
  // Examples: consent before any first load this session — dev cache or HF download.
  if (cachedIds.has(model.id)) return true;
  if (!isRemoteModelLoadEnabled()) return false;
  if (!canDownloadModelInBrowser(model)) return false;
  return true;
}

/**
 * Blocker modal before the first browser download of GGUF weights.
 * @param {{ model: import('../../src/config/models/types.ts').ModelCard }} opts
 * @returns {Promise<boolean>}
 */
export function requestModelDownloadConsent({ model, preCached = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'model-download-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'model-download-gate-title');

    const sizeHint =
      model.id === 'ShowUI-2B' ? '~1.8 GB' : 'several GB (model size varies)';
    const eyebrow = preCached ? 'Before you load' : 'Before you download';
    const lead = preCached
      ? `This vision model loads <strong>${sizeHint}</strong> of weights into your browser (from the dev server cache). Inference stays local — <strong>$0</strong> per task.`
      : `This vision model downloads <strong>${sizeHint}</strong> from Hugging Face into your browser. Inference stays local — <strong>$0</strong> per task after the first download.`;
    const cacheNote = preCached
      ? '<li>Weights served from <code>/model-cache/</code> on this dev server</li>'
      : '<li>No npm run cache:model required for public models</li>';
    const confirmLabel = preCached ? 'Load model' : 'Download and load';

    overlay.innerHTML = `
      <div class="model-download-gate__panel">
        <p class="model-download-gate__eyebrow">${eyebrow}</p>
        <h2 id="model-download-gate-title" class="model-download-gate__title">Load ${model.label} in your browser?</h2>
        <p class="model-download-gate__lead">
          ${lead}
        </p>
        <ul class="model-download-gate__list">
          <li>Runs entirely in your tab (WebGPU + WASM)</li>
          <li>wllama caches weights in the browser for next time</li>
          ${cacheNote}
        </ul>
        <div class="model-download-gate__actions">
          <button type="button" class="model-download-gate__btn model-download-gate__btn--ghost" data-action="cancel">
            Not now
          </button>
          <button type="button" class="model-download-gate__btn model-download-gate__btn--primary" data-action="confirm">
            ${confirmLabel}
          </button>
        </div>
      </div>
    `;

    const finish = (ok) => {
      if (ok) storeDownloadConsent(model.id);
      overlay.remove();
      document.body.classList.remove('has-model-download-gate');
      resolve(ok);
    };

    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      finish(btn.dataset.action === 'confirm');
    });

    document.body.classList.add('has-model-download-gate');
    document.body.appendChild(overlay);
    overlay.querySelector('[data-action="confirm"]')?.focus();
  });
}

/**
 * @param {{ model: import('../../src/config/models/types.ts').ModelCard; cachedIds: Set<string> }} opts
 * @returns {Promise<boolean>}
 */
export async function ensureModelDownloadConsent({ model, cachedIds }) {
  if (!shouldPromptModelDownload(model, cachedIds)) return true;
  return requestModelDownloadConsent({
    model,
    preCached: cachedIds.has(model.id),
  });
}
