import {
  canDownloadModelInBrowser,
  isRemoteModelLoadEnabled,
} from 'browser-use-wasm';
let gateOpen = false;

/**
 * @param {import('../../src/config/models/types.ts').ModelCard} model
 * @param {Set<string>} cachedIds
 */
export function shouldPromptModelDownload(model, cachedIds) {
  if (!isRemoteModelLoadEnabled()) return false;
  if (cachedIds.has(model.id)) return false;
  return canDownloadModelInBrowser(model);
}

/**
 * Blocker modal before the first browser download of GGUF weights.
 * @param {{ model: import('../../src/config/models/types.ts').ModelCard }} opts
 * @returns {Promise<boolean>}
 */
export function requestModelDownloadConsent({ model }) {
  if (gateOpen) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    gateOpen = true;

    const overlay = document.createElement('div');
    overlay.className = 'model-download-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'model-download-gate-title');

    const sizeHint =
      model.id === 'ShowUI-2B' ? '~1.8 GB' : 'several GB (model size varies)';

    overlay.innerHTML = `
      <div class="model-download-gate__panel">
        <p class="model-download-gate__eyebrow">Before you download</p>
        <h2 id="model-download-gate-title" class="model-download-gate__title">Load ${model.label} in your browser?</h2>
        <p class="model-download-gate__lead">
          This vision model downloads <strong>${sizeHint}</strong> from Hugging Face into your browser.
          Inference stays local — <strong>$0</strong> per task after the first download.
        </p>
        <ul class="model-download-gate__list">
          <li>Runs entirely in your tab (WebGPU + WASM)</li>
          <li>wllama caches weights in the browser for next time</li>
        </ul>
        <div class="model-download-gate__actions">
          <button type="button" class="model-download-gate__btn model-download-gate__btn--ghost" data-action="cancel">
            Not now
          </button>
          <button type="button" class="model-download-gate__btn model-download-gate__btn--primary" data-action="confirm">
            Download and load
          </button>
        </div>
      </div>
    `;

    const finish = (ok) => {
      gateOpen = false;
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
  return requestModelDownloadConsent({ model });
}
