/**
 * Fractional CSS × DPR → floor / round / ceil on canvas.height (normal text card).
 */
import { snapdom } from '@zumer/snapdom';
import { snapdomCaptureToCanvas } from '../../src/snapdom/capture.ts';

const MODES = [
  { id: 'floor', label: 'floor', fn: Math.floor, tone: 'clip' },
  { id: 'round', label: 'round', fn: Math.round, tone: 'pad', note: 'SnapDOM default' },
  { id: 'ceil', label: 'ceil', fn: Math.ceil, tone: 'pad' },
];

function fmt(n, digits = 1) {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function isFractional(n) {
  return Math.abs(n - Math.round(n)) > 0.01;
}

function stageBox(element) {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

async function captureStage(stage) {
  const measure = stage.closest('.dpr-frac__measure');
  const prev = measure
    ? { position: measure.style.position, left: measure.style.left, visibility: measure.style.visibility, opacity: measure.style.opacity, zIndex: measure.style.zIndex }
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
    return await snapdomCaptureToCanvas(snapdom, stage);
  } finally {
    if (measure && prev) {
      measure.style.position = prev.position;
      measure.style.left = prev.left;
      measure.style.visibility = prev.visibility;
      measure.style.opacity = prev.opacity;
      measure.style.zIndex = prev.zIndex;
    }
  }
}

function buildMath(cssW, cssH, dpr) {
  const exactH = cssH * dpr;
  const tail = isFractional(exactH)
    ? 'not an integer - <code>canvas.height</code> must pick <code>floor</code>, <code>round</code>, or <code>ceil</code>.'
    : 'lands on integers on this display - open on Retina (DPR=2) to see a fractional result.';

  return `
    <div class="dpr-frac__step"><span class="dpr-frac__step-num">1</span><p>CSS height: <code>${fmt(cssH)} px</code></p></div>
    <div class="dpr-frac__step dpr-frac__step--op">×</div>
    <div class="dpr-frac__step"><span class="dpr-frac__step-num">2</span><p>DPR: <code>${fmt(dpr, 2)}</code></p></div>
    <div class="dpr-frac__step dpr-frac__step--op">=</div>
    <div class="dpr-frac__step dpr-frac__step--result"><span class="dpr-frac__step-num">3</span><p><code>${fmt(exactH)}</code> device px - ${tail}</p></div>
  `;
}

function roundingDelta(exactH, deviceH, dpr) {
  const delta = deviceH - exactH;
  if (Math.abs(delta) < 0.01) return { text: 'Matches layout exactly.', tone: 'neutral' };
  if (delta < 0) {
    return {
      text: `${(-delta).toFixed(1)} device px clipped (~${(-delta / dpr).toFixed(2)} CSS px)`,
      tone: 'clip',
    };
  }
  return {
    text: `${delta.toFixed(1)} device px empty below (~${(delta / dpr).toFixed(2)} CSS px)`,
    tone: 'pad',
  };
}

function backingCanvas(ref, deviceW, deviceH, dark) {
  const out = document.createElement('canvas');
  out.width = deviceW;
  out.height = deviceH;
  out.className = 'dpr-frac__round-bitmap';
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.fillStyle = dark ? '#1e293b' : '#ffffff';
  ctx.fillRect(0, 0, deviceW, deviceH);
  const srcH = Math.min(ref.height, deviceH);
  ctx.drawImage(ref, 0, 0, ref.width, srcH, 0, 0, deviceW, srcH);
  return out;
}

/** One magnified ruler - all three canvas bottoms vs layout (per-column bars were invisible). */
function buildCombinedRuler(exactH, choices) {
  const minY = Math.floor(exactH) - 0.5;
  const maxY = Math.ceil(exactH) + 0.5;
  const span = maxY - minY;
  const toPct = (y) => ((y - minY) / span) * 100;

  const wrap = document.createElement('div');
  wrap.className = 'dpr-frac__ruler';

  const title = document.createElement('p');
  title.className = 'dpr-frac__ruler-title';
  title.textContent = `Bottom edge magnified - only the last ~${span.toFixed(1)} device px (real gap is sub-pixel)`;

  const track = document.createElement('div');
  track.className = 'dpr-frac__ruler-track';
  track.setAttribute('aria-hidden', 'true');

  const layout = document.createElement('div');
  layout.className = 'dpr-frac__ruler-mark dpr-frac__ruler-mark--layout';
  layout.style.bottom = `calc(${toPct(exactH)}% - 1px)`;
  layout.innerHTML = `<span>layout ${fmt(exactH)}</span>`;
  track.append(layout);

  for (const { id, label, deviceH } of choices) {
    const mark = document.createElement('div');
    mark.className = `dpr-frac__ruler-mark dpr-frac__ruler-mark--${id}`;
    mark.style.bottom = `calc(${toPct(deviceH)}% - 1px)`;
    mark.innerHTML = `<span>${label} → ${deviceH}</span>`;
    track.append(mark);
  }

  // Stack labels when round/ceil share the same integer
  const marks = [...track.querySelectorAll('.dpr-frac__ruler-mark:not(.dpr-frac__ruler-mark--layout)')];
  const byBottom = new Map();
  for (const m of marks) {
    const b = m.style.bottom;
    if (!byBottom.has(b)) byBottom.set(b, []);
    byBottom.get(b).push(m);
  }
  for (const group of byBottom.values()) {
    if (group.length < 2) continue;
    const labels = group.map((m) => m.querySelector('span')?.textContent?.split(' → ')[0]).filter(Boolean);
    const h = group[0].querySelector('span')?.textContent?.split(' → ')[1];
    group[0].querySelector('span').textContent = `${labels.join(' / ')} → ${h}`;
    for (let i = 1; i < group.length; i++) group[i].remove();
  }

  const key = document.createElement('ul');
  key.className = 'dpr-frac__ruler-key';
  key.innerHTML = `
    <li><span class="dpr-frac__key-swatch dpr-frac__key-swatch--layout"></span> Layout bottom - ${fmt(exactH)} device px</li>
    ${choices
      .map(
        (c) =>
          `<li><span class="dpr-frac__key-swatch dpr-frac__key-swatch--${c.id}"></span> <code>${c.label}</code> canvas - ${c.deviceH} device px</li>`
      )
      .join('')}
  `;

  wrap.append(title, track, key);
  return wrap;
}

/**
 * @param {HTMLElement} root
 */
export async function initDprRoundingDemo(root = document.getElementById('dpr-rounding-export-root')) {
  const stage = root?.querySelector('#dpr-frac-stage');
  const mathEl = root?.querySelector('#dpr-frac-math');
  const grid = root?.querySelector('#dpr-frac-round-grid');
  const rulerHost = root?.querySelector('#dpr-frac-ruler');
  const caption = root?.querySelector('#dpr-frac-caption');

  if (!stage || !mathEl || !grid || !rulerHost || !caption) return;

  const dark = () => root.classList.contains('dark');

  try {
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const rect = stage.getBoundingClientRect();
    const cssW = rect.width;
    const cssH = rect.height;
    const dpr = globalThis.devicePixelRatio ?? 1;
    const exactW = cssW * dpr;
    const exactH = cssH * dpr;

    mathEl.innerHTML = buildMath(cssW, cssH, dpr);

    const reference = await captureStage(stage);
    const { width, height } = stageBox(stage);
    const floorH = Math.floor(exactH);
    const roundH = Math.round(exactH);

    grid.replaceChildren();
    const rulerChoices = [];

    for (const mode of MODES) {
      const deviceW = mode.fn(exactW);
      const deviceH = mode.fn(exactH);
      const bitmap = backingCanvas(reference, deviceW, deviceH, dark());
      const delta = roundingDelta(exactH, deviceH, dpr);
      const tie =
        mode.id === 'ceil' && deviceH === roundH
          ? 'same as round'
          : mode.id === 'round' && deviceH === floorH
            ? 'same as floor'
            : '';

      const col = document.createElement('article');
      col.className = `dpr-frac__round-col dpr-frac__round-col--${delta.tone}`;
      col.innerHTML = `
        <p class="dpr-frac__formula"><code>${mode.label}(${fmt(exactH)}) = ${deviceH}</code></p>
        <p class="dpr-frac__backing">canvas.height = <strong>${deviceH}</strong>${tie ? ` <span class="dpr-frac__tie">${tie}</span>` : ''}${mode.note ? ` · ${mode.note}` : ''}</p>
      `;

      const thumb = document.createElement('div');
      thumb.className = 'dpr-frac__round-thumb';
      const shown = document.createElement('canvas');
      shown.width = bitmap.width;
      shown.height = bitmap.height;
      shown.className = 'dpr-frac__round-bitmap';
      shown.style.width = `${width}px`;
      shown.style.height = `${height}px`;
      shown.getContext('2d')?.drawImage(bitmap, 0, 0);
      thumb.append(shown);

      const deltaEl = document.createElement('p');
      deltaEl.className = `dpr-frac__delta dpr-frac__delta--${delta.tone}`;
      deltaEl.textContent = delta.text;

      col.append(thumb, deltaEl);
      grid.append(col);
      rulerChoices.push({ id: mode.id, label: mode.label, deviceH });
    }

    rulerHost.replaceChildren(buildCombinedRuler(exactH, rulerChoices));

    caption.textContent = isFractional(exactH)
      ? `Card previews look the same, but when you zoom in you can see the difference - the magnified ruler shows how much floor, round, and ceil can shift the layout.`
      : `Use a Retina display (DPR=2) to compare floor / round / ceil on fractional device pixels.`;

    root.dataset.dprReady = '1';
  } catch (err) {
    caption.textContent = String(err?.message ?? err);
    root.dataset.dprReady = 'error';
  }
}
