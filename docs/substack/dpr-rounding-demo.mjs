/**
 * Live canvas demo — fractional CSS × DPR → integer canvas.height.
 */
import { snapdom } from '@zumer/snapdom';

const MODES = [
  {
    id: 'floor',
    label: 'floor',
    fn: Math.floor,
    explain: 'Bitmap is shorter than layout — bottom pixels get clipped.',
  },
  {
    id: 'round',
    label: 'round',
    fn: Math.round,
    explain: 'Nearest integer — what SnapDOM uses today.',
  },
  {
    id: 'ceil',
    label: 'ceil',
    fn: Math.ceil,
    explain: 'Bitmap is taller than layout — empty pixels below the content.',
  },
];

function fmt(n, digits = 1) {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function isFractional(n) {
  return Math.abs(n - Math.round(n)) > 0.01;
}

/** SnapDOM skips painting when ancestors use visibility:hidden — stage on-screen briefly. */
async function captureReference(source, cssW, cssH, dpr) {
  const measure = source.closest('.dpr-live__measure');
  const prev = measure
    ? {
        position: measure.style.position,
        left: measure.style.left,
        top: measure.style.top,
        visibility: measure.style.visibility,
        opacity: measure.style.opacity,
        zIndex: measure.style.zIndex,
        pointerEvents: measure.style.pointerEvents,
      }
    : null;

  if (measure) {
    Object.assign(measure.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      visibility: 'visible',
      opacity: '1',
      zIndex: '-1',
      pointerEvents: 'none',
    });
  }

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    return await snapdom.toCanvas(source, {
      width: cssW,
      height: cssH,
      dpr: Math.min(2, dpr),
      scale: 1,
      embedFonts: true,
    });
  } finally {
    if (measure && prev) {
      measure.style.position = prev.position;
      measure.style.left = prev.left;
      measure.style.top = prev.top;
      measure.style.visibility = prev.visibility;
      measure.style.opacity = prev.opacity;
      measure.style.zIndex = prev.zIndex;
      measure.style.pointerEvents = prev.pointerEvents;
    }
  }
}

function displayCanvas(ref, cssW, cssH) {
  const out = document.createElement('canvas');
  out.width = ref.width;
  out.height = ref.height;
  out.style.width = `${cssW}px`;
  out.style.height = `${cssH}px`;
  out.className = 'dpr-live__bitmap';
  out.getContext('2d')?.drawImage(ref, 0, 0);
  return out;
}

function backingCanvas(ref, cssW, cssH, deviceW, deviceH, dark) {
  const out = document.createElement('canvas');
  out.width = deviceW;
  out.height = deviceH;
  out.style.width = `${cssW}px`;
  out.style.height = `${cssH}px`;
  out.className = 'dpr-live__bitmap dpr-live__bitmap--hidden';

  const ctx = out.getContext('2d');
  if (!ctx) return out;

  ctx.fillStyle = dark ? '#1e293b' : '#ffffff';
  ctx.fillRect(0, 0, deviceW, deviceH);
  const srcH = Math.min(ref.height, deviceH);
  ctx.drawImage(ref, 0, 0, ref.width, srcH, 0, 0, deviceW, srcH);
  return out;
}

function hatchBand(ctx, x, y, w, h, stroke) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  for (let i = -h; i < w + h; i += 5) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

/** 16× strip of the last device pixels — the only place rounding choices diverge. */
function buildEdgeFocusCanvas(bitmap, exactH, deviceH, dark, zoom = 16, band = 14) {
  const z = document.createElement('canvas');
  const srcY = Math.max(0, Math.min(bitmap.height - band, Math.floor(exactH - band)));
  z.width = bitmap.width * zoom;
  z.height = band * zoom;
  z.className = 'dpr-live__edge-canvas';

  const ctx = z.getContext('2d');
  if (!ctx) return z;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = dark ? '#0f172a' : '#f1f5f9';
  ctx.fillRect(0, 0, z.width, z.height);
  ctx.drawImage(bitmap, 0, srcY, bitmap.width, band, 0, 0, z.width, z.height);

  const layoutY = (exactH - srcY) * zoom;
  const bitmapY = (deviceH - srcY) * zoom;
  const top = Math.min(layoutY, bitmapY);
  const bottom = Math.max(layoutY, bitmapY);

  if (bottom - top > 0.5) {
    const tone = deviceH < exactH ? 'rgba(220, 38, 38, 0.22)' : 'rgba(245, 158, 11, 0.28)';
    ctx.fillStyle = tone;
    ctx.fillRect(0, top, z.width, bottom - top);
    hatchBand(ctx, 0, top, z.width, bottom - top, deviceH < exactH ? '#dc2626' : '#d97706');
  }

  if (layoutY >= 0 && layoutY <= z.height) {
    ctx.strokeStyle = '#f59e0b';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, layoutY + 0.5);
    ctx.lineTo(z.width, layoutY + 0.5);
    ctx.stroke();
  }

  if (bitmapY >= 0 && bitmapY <= z.height) {
    ctx.strokeStyle = '#dc2626';
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, bitmapY + 0.5);
    ctx.lineTo(z.width, bitmapY + 0.5);
    ctx.stroke();
  }

  return z;
}

function roundingDelta(exactH, deviceH, dpr) {
  const delta = deviceH - exactH;
  if (Math.abs(delta) < 0.01) {
    return { text: 'Bitmap height matches layout exactly.', tone: 'neutral' };
  }
  if (delta < 0) {
    const lost = (-delta).toFixed(1);
    const css = (-delta / dpr).toFixed(2);
    return {
      text: `Canvas is ${lost} device px shorter (~${css} CSS px) — bottom clipped.`,
      tone: 'clip',
    };
  }
  const extra = delta.toFixed(1);
  const css = (delta / dpr).toFixed(2);
  return {
    text: `Canvas is ${extra} device px taller (~${css} CSS px) — empty band below layout.`,
    tone: 'pad',
  };
}

/**
 * @param {HTMLElement} root — `#dpr-rounding-export-root`
 */
export async function initDprRoundingDemo(root = document.getElementById('dpr-rounding-export-root')) {
  const source = root?.querySelector('#dpr-rounding-source');
  const problemEl = root?.querySelector('#dpr-rounding-problem');
  const sourceHost = root?.querySelector('#dpr-rounding-source-host');
  const grid = root?.querySelector('#dpr-rounding-grid');
  const edgeHost = root?.querySelector('#dpr-rounding-edge');
  if (!source || !problemEl || !sourceHost || !grid) return;

  const dark = () => root.classList.contains('dark');

  try {
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const rect = source.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    const dpr = globalThis.devicePixelRatio ?? 1;
    const exactW = cssW * dpr;
    const exactH = cssH * dpr;

    const reference = await captureReference(source, cssW, cssH, dpr);

    const problemTail = isFractional(exactH)
      ? '<strong>not an integer</strong>. Canvas <code>.height</code> must pick floor, round, or ceil.'
      : 'an integer — floor, round, and ceil all agree.';

    problemEl.innerHTML = `
      <div class="dpr-live__step">
        <span class="dpr-live__step-num">1</span>
        <p>CSS box height: <code>${fmt(cssH)} px</code></p>
      </div>
      <div class="dpr-live__step dpr-live__step--op">×</div>
      <div class="dpr-live__step">
        <span class="dpr-live__step-num">2</span>
        <p>devicePixelRatio: <code>${fmt(dpr, 2)}</code></p>
      </div>
      <div class="dpr-live__step dpr-live__step--op">=</div>
      <div class="dpr-live__step dpr-live__step--problem">
        <span class="dpr-live__step-num">3</span>
        <p><code>${fmt(exactH)}</code> device px — ${problemTail}</p>
      </div>
    `;

    sourceHost.replaceChildren();
    const previewWrap = document.createElement('div');
    previewWrap.className = 'dpr-live__source-frame';
    previewWrap.append(displayCanvas(reference, cssW, cssH));
    sourceHost.append(previewWrap);

    grid.replaceChildren();
    const floorH = Math.floor(exactH);
    const roundH = Math.round(exactH);
    const ceilH = Math.ceil(exactH);

    for (const mode of MODES) {
      const deviceW = mode.fn(exactW);
      const deviceH = mode.fn(exactH);
      const bitmap = backingCanvas(reference, cssW, cssH, deviceW, deviceH, dark());
      const delta = roundingDelta(exactH, deviceH, dpr);
      const tie =
        mode.id === 'ceil' && deviceH === roundH
          ? 'same as round'
          : mode.id === 'round' && deviceH === floorH
            ? 'same as floor'
            : mode.id === 'round' && deviceH === ceilH
              ? 'same as ceil'
              : '';

      const col = document.createElement('article');
      col.className = 'dpr-live__col';
      if (mode.id === 'floor') col.classList.add('dpr-live__col--clip');
      if (deviceH > exactH) col.classList.add('dpr-live__col--pad');
      col.innerHTML = `
        <p class="dpr-live__formula"><code>${mode.label}(${fmt(exactH)}) = ${deviceH}</code></p>
        <p class="dpr-live__backing">canvas.height = <strong>${deviceH}</strong> device px${
          tie ? ` <span class="dpr-live__tie">${tie}</span>` : ''
        }</p>
      `;

      const focus = document.createElement('div');
      focus.className = 'dpr-live__edge-focus';
      const focusTitle = document.createElement('p');
      focusTitle.className = 'dpr-live__edge-focus-title';
      focusTitle.textContent = 'Bottom edge — 16× zoom (rest of card is identical)';
      focus.append(focusTitle, buildEdgeFocusCanvas(bitmap, exactH, deviceH, dark()));

      const deltaEl = document.createElement('p');
      deltaEl.className = `dpr-live__delta dpr-live__delta--${delta.tone}`;
      deltaEl.textContent = delta.text;

      const key = document.createElement('p');
      key.className = 'dpr-live__edge-key';
      key.innerHTML =
        '<span class="dpr-live__key-line dpr-live__key-line--layout"></span> layout bottom &nbsp; ' +
        '<span class="dpr-live__key-line dpr-live__key-line--bitmap"></span> canvas bottom';

      const note = document.createElement('p');
      note.className = 'dpr-live__note';
      note.textContent = mode.explain;

      col.append(focus, deltaEl, key, note);
      grid.append(col);
    }

    if (edgeHost) edgeHost.replaceChildren();

    root.dataset.dprReady = '1';
  } catch (err) {
    problemEl.textContent = String(err?.message ?? err);
    root.dataset.dprReady = 'error';
  }
}
