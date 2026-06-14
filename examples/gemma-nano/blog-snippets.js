/**
 * Runnable code blocks in the Gemini Nano architecture post.
 * Steps 1 & 3 use Chrome's built-in Prompt API only (no browser-use-wasm).
 */
import { snapdom } from '@zumer/snapdom';
import { STEP3_TUTORIAL_CODE, runStep3TutorialCode } from './step3-tutorial-code.js';

if (typeof window !== 'undefined') {
  window.snapdom = snapdom;
  window.runStep3TutorialCode = runStep3TutorialCode;
}

const SNIPPET_STAGE = '#snippet-stage';

const PROMPT_API_SESSION_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

function resolvePromptApi() {
  const g = globalThis;
  if (g.LanguageModel && typeof g.LanguageModel.create === 'function') {
    return g.LanguageModel;
  }
  const w = typeof window !== 'undefined' ? window : null;
  const legacy =
    w?.ai?.languageModel ??
    w?.ai?.textModel ??
    w?.ai?.assistant ??
    w?.model?.languageModel ??
    w?.model?.textModel ??
    w?.model;
  return legacy && typeof legacy.create === 'function' ? legacy : null;
}

async function assertPromptApiReady() {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error('Prompt API needs a secure context - use npm run dev (http://127.0.0.1:5173/)');
  }
  const api = resolvePromptApi();
  if (!api) {
    throw new Error('LanguageModel not found - enable Chrome Prompt API flags');
  }
  if (api.availability) {
    const status = await api.availability(PROMPT_API_SESSION_OPTIONS);
    if (status === 'unavailable') {
      throw new Error('Built-in AI unavailable in this browser');
    }
  }
  return api;
}

function setSnippetMessage(resultEl, text, state) {
  const textEl = resultEl.querySelector('.snippet-feedback__text') ?? resultEl;
  textEl.textContent = text;
  resultEl.dataset.state = state;
  resultEl.hidden = false;
}

function getSnippetStage() {
  const stage = document.querySelector(SNIPPET_STAGE);
  if (!stage) throw new Error('#snippet-stage not found');
  return stage;
}

function showSubmitToast(stage, text = 'Submit clicked!') {
  if (!(stage instanceof HTMLElement)) return;
  let toast = stage.querySelector('.snippet-stage__toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'snippet-stage__toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      '<span class="snippet-stage__toast-burst" aria-hidden="true"></span>' +
      '<span class="snippet-stage__toast-icon" aria-hidden="true">✓</span>' +
      '<span class="snippet-stage__toast-text"></span>';
    stage.append(toast);
  }
  const textEl = toast.querySelector('.snippet-stage__toast-text');
  if (textEl) textEl.textContent = text;
  toast.hidden = false;
  toast.classList.remove('snippet-stage__toast--show');
  void toast.offsetWidth;
  toast.classList.add('snippet-stage__toast--show');
}

function animateSubmitButton(btn) {
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.classList.remove('snippet-stage__submit--hit');
  void btn.offsetWidth;
  btn.classList.add('snippet-stage__submit--hit');
  btn.addEventListener(
    'animationend',
    () => btn.classList.remove('snippet-stage__submit--hit'),
    { once: true }
  );
}

function wireSubmitButtonAnimation(btn) {
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.addEventListener('click', () => {
    animateSubmitButton(btn);
    const stage = btn.closest('.snippet-stage');
    if (stage) showSubmitToast(stage);
  });
}

async function captureStage(target) {
  const dpr = Math.min(2, globalThis.devicePixelRatio ?? 1);
  const cssW = Math.max(1, target.offsetWidth);
  const cssH = Math.max(1, target.offsetHeight);
  return snapdom.toCanvas(target, {
    width: cssW,
    height: cssH,
    dpr,
    scale: 1,
    embedFonts: true,
  });
}

async function captureSnippetStage() {
  return captureStage(getSnippetStage());
}

function mountCanvasPreview(previewEl, sourceCanvas, captionText, modelText = '') {
  const thumb = document.createElement('canvas');
  thumb.className = 'snippet-preview__canvas';
  thumb.width = sourceCanvas.width;
  thumb.height = sourceCanvas.height;
  thumb.getContext('2d')?.drawImage(sourceCanvas, 0, 0);

  const caption = document.createElement('p');
  caption.className = 'snippet-preview__caption';
  caption.textContent = captionText;

  previewEl.replaceChildren(thumb, caption);
  if (modelText) {
    const model = document.createElement('pre');
    model.className = 'snippet-preview__model';
    model.textContent = modelText;
    previewEl.append(model);
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

  ctx.beginPath();
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
  ctx.stroke();
}

function wireSnippet(btnId, resultId, run) {
  const btn = document.getElementById(btnId);
  const result = document.getElementById(resultId);
  if (!btn || !result) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setSnippetMessage(result, 'Running…', 'pending');
    try {
      setSnippetMessage(result, `✓ ${await run()}`, 'ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSnippetMessage(result, `✗ ${msg}`, 'error');
      console.error(`[gemma-nano:snippet ${btnId}]`, err);
    } finally {
      btn.disabled = false;
    }
  });
}

function wireSnapdomSnippet() {
  const btn = document.getElementById('btn-try-snapdom');
  const result = document.getElementById('snapdom-result');
  const preview = document.getElementById('snapdom-preview');
  if (!btn || !result || !preview) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    preview.hidden = true;
    preview.replaceChildren();
    setSnippetMessage(result, 'Running…', 'pending');
    try {
      const canvas = await captureSnippetStage();
      mountCanvasPreview(
        preview,
        canvas,
        `${canvas.width}×${canvas.height}px - bitmap Gemini would receive (Step 3 marks the click on this)`
      );
      setSnippetMessage(result, `✓ Captured ${canvas.width}×${canvas.height}px - preview below`, 'ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSnippetMessage(result, `✗ ${msg}`, 'error');
      console.error('[gemma-nano:snippet btn-try-snapdom]', err);
    } finally {
      btn.disabled = false;
    }
  });
}

function preservePageScroll(action) {
  const x = window.scrollX;
  const y = window.scrollY;
  const restore = () => window.scrollTo({ left: x, top: y, behavior: 'instant' });
  return Promise.resolve(action()).finally(() => {
    restore();
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
  });
}

function wireGroundingSnippet() {
  const btn = document.getElementById('btn-run-grounding');
  const result = document.getElementById('grounding-result');
  const preview = document.getElementById('grounding-preview');
  if (!btn || !result || !preview) return;

  btn.addEventListener('click', () => {
    void preservePageScroll(async () => {
    btn.disabled = true;
    preview.hidden = true;
    preview.replaceChildren();
    setSnippetMessage(result, 'Running…', 'pending');
    try {
      const outcome = await runStep3TutorialCode();

      const thumb = mountCanvasPreview(
        preview,
        outcome.canvas,
        `Gemini @ [${outcome.point.x.toFixed(2)}, ${outcome.point.y.toFixed(2)}] - red ring is where the model pointed`,
        outcome.text
      );
      drawClickMarker(thumb, outcome.point.x, outcome.point.y);

      if (outcome.hitSubmit) {
        showSubmitToast(outcome.stage, 'Submit clicked!');
      }

      setSnippetMessage(
        result,
        outcome.hitSubmit
          ? `✓ Gemini hit Submit @ [${outcome.point.x.toFixed(2)}, ${outcome.point.y.toFixed(2)}] in ${outcome.inferMs}ms`
          : `⚠ Gemini pointed @ [${outcome.point.x.toFixed(2)}, ${outcome.point.y.toFixed(2)}] but clicked "${outcome.clickedLabel}" (${outcome.inferMs}ms)`,
        outcome.hitSubmit ? 'ok' : 'error'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSnippetMessage(result, `✗ ${msg}`, 'error');
      console.error('[gemma-nano:snippet btn-run-grounding]', err);
    } finally {
      btn.disabled = false;
      btn.focus({ preventScroll: true });
    }
    });
  });
}

async function runPromptApiSnippet() {
  const api = await assertPromptApiReady();
  const session = await api.create({
    ...PROMPT_API_SESSION_OPTIONS,
    temperature: 0,
    topK: 1,
  });
  try {
    return 'Multimodal session created';
  } finally {
    session.destroy?.();
  }
}

function selectCodeBlock(codeEl) {
  if (!(codeEl instanceof HTMLElement)) return;
  const range = document.createRange();
  range.selectNodeContents(codeEl);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function wireCodeBlockDoubleClickSelect() {
  for (const code of document.querySelectorAll('.interactive-snippet .code-block code')) {
    code.addEventListener('dblclick', (event) => {
      event.preventDefault();
      selectCodeBlock(code);
    });
  }
}

export function wireBlogSnippets() {
  const step3Code = document.getElementById('step3-tutorial-code');
  if (step3Code) step3Code.textContent = STEP3_TUTORIAL_CODE;

  wireCodeBlockDoubleClickSelect();
  wireSnippet('btn-run-prompt-api', 'prompt-api-result', runPromptApiSnippet);
  wireSnapdomSnippet();
  wireGroundingSnippet();
  wireSubmitButtonAnimation(document.getElementById('snippet-submit'));
}
