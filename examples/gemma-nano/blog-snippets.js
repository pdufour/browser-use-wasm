/**
 * Blog "Run" buttons execute the adjacent <code> block (same code you can paste in the console).
 */
import { snapdom } from '@zumer/snapdom';

if (typeof window !== 'undefined') window.snapdom = snapdom;

const AsyncRun = Object.getPrototypeOf(async function () {}).constructor;

function snippetRoot(btn) {
  return btn.closest('.interactive-snippet');
}

function setFeedback(resultEl, text, state) {
  const textEl = resultEl.querySelector('.snippet-feedback__text') ?? resultEl;
  textEl.textContent = text;
  resultEl.dataset.state = state;
  resultEl.hidden = false;
}

function showPreview(previewEl, canvas, caption, modelText = '') {
  const thumb = document.createElement('canvas');
  thumb.className = 'snippet-preview__canvas';
  thumb.width = canvas.width;
  thumb.height = canvas.height;
  thumb.getContext('2d')?.drawImage(canvas, 0, 0);
  const captionEl = document.createElement('p');
  captionEl.className = 'snippet-preview__caption';
  captionEl.textContent = caption;
  previewEl.replaceChildren(thumb, captionEl);
  if (modelText) {
    const pre = document.createElement('pre');
    pre.className = 'snippet-preview__model';
    pre.textContent = modelText;
    previewEl.append(pre);
  }
  previewEl.hidden = false;
  return thumb;
}

function drawClickMarker(canvas, nx, ny) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const x = nx * canvas.width;
  const y = ny * canvas.height;
  const r = Math.max(10, Math.round(canvas.width * 0.035));
  ctx.strokeStyle = '#dc2626';
  ctx.fillStyle = 'rgba(220, 38, 38, 0.2)';
  ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.006));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

async function runCodeBlock(btn) {
  const root = snippetRoot(btn);
  const codeEl = root?.querySelector('code');
  const resultEl = root?.querySelector('.snippet-feedback');
  const previewEl = root?.querySelector('.snippet-preview');
  if (!codeEl || !resultEl) return;

  btn.disabled = true;
  if (previewEl) {
    previewEl.hidden = true;
    previewEl.replaceChildren();
  }
  setFeedback(resultEl, 'Running…', 'pending');

  try {
    const run = new AsyncRun('snapdom', codeEl.textContent);
    const value = await run(snapdom);

    if (value instanceof HTMLCanvasElement && previewEl) {
      showPreview(previewEl, value, `${value.width}×${value.height}px`);
      setFeedback(resultEl, `✓ Captured ${value.width}×${value.height}px — preview below`, 'ok');
      return;
    }

    if (value?.canvas && value?.point && previewEl) {
      const thumb = showPreview(
        previewEl,
        value.canvas,
        `Gemini @ [${value.point.x.toFixed(2)}, ${value.point.y.toFixed(2)}]`,
        value.text
      );
      drawClickMarker(thumb, value.point.x, value.point.y);
      setFeedback(
        resultEl,
        value.hitSubmit
          ? `✓ Submit @ [${value.point.x.toFixed(2)}, ${value.point.y.toFixed(2)}] in ${value.inferMs}ms`
          : `⚠ Clicked "${value.clickedLabel}" in ${value.inferMs}ms`,
        value.hitSubmit ? 'ok' : 'error'
      );
      return;
    }

    setFeedback(resultEl, `✓ ${value ?? 'Done'}`, 'ok');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setFeedback(resultEl, `✗ ${msg}`, 'error');
    console.error('[gemma-nano:snippet]', err);
  } finally {
    btn.disabled = false;
  }
}

function wireRunButtons() {
  for (const btn of document.querySelectorAll('.interactive-snippet .chip-btn')) {
    btn.addEventListener('click', () => {
      void runCodeBlock(btn);
    });
  }
}

function wireSubmitDemo() {
  const btn = document.getElementById('snippet-submit');
  const stage = document.getElementById('snippet-stage');
  if (!btn || !stage) return;
  btn.addEventListener('click', () => {
    btn.classList.remove('snippet-stage__submit--hit');
    void btn.offsetWidth;
    btn.classList.add('snippet-stage__submit--hit');
    btn.addEventListener('animationend', () => btn.classList.remove('snippet-stage__submit--hit'), {
      once: true,
    });
  });
}

export function wireBlogSnippets() {
  wireRunButtons();
  wireSubmitDemo();
}
