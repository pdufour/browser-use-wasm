/**
 * Static live vs SnapDOM canvas comparison - vertical drift demo.
 */
import { snapdom } from '@zumer/snapdom';
import { snapdomCaptureToCanvas } from '../../src/snapdom/capture.ts';

const ZOOM_SCALE = 4;
/** Stylized drift when live capture aligns - article still shows SVG → canvas shift. */
const DEMO_DRIFT_CSS_PX = 2;

function stageBox(element) {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function liveInkTop(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rects = range.getClientRects();
  if (rects.length) return rects[0].top;
  return element.getBoundingClientRect().top;
}

function liveInkDeviceY(element, stage) {
  const stageRect = stage.getBoundingClientRect();
  const dpr = globalThis.devicePixelRatio ?? 1;
  return Math.round((liveInkTop(element) - stageRect.top) * dpr);
}

/** Topmost dark ink row in a tight band (heading ascenders). */
function measureInkTop(canvas, left, right, yMin, yMax) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const tops = [];
  const step = Math.max(1, Math.floor((right - left) / 8));
  for (let x = left; x <= right; x += step) {
    for (let y = yMin; y < yMax; y++) {
      const { data } = ctx.getImageData(x, y, 1, 1);
      const [r, g, b, a] = data;
      if (a < 40) continue;
      if (r < 75 && g < 75 && b < 95 && r + g + b < 175) {
        tops.push(y);
        break;
      }
    }
  }
  return tops.length ? Math.min(...tops) : null;
}

function headingCrop(stage, heading, pad) {
  const stageRect = stage.getBoundingClientRect();
  const rect = heading.getBoundingClientRect();
  return {
    pad,
    cropLeft: rect.left - stageRect.left - pad,
    cropTop: rect.top - stageRect.top - pad,
    stageWidth: stageRect.width,
    stageHeight: stageRect.height,
    inkCss: liveInkTop(heading) - stageRect.top,
  };
}

/** Same 4× CSS clip for live DOM or canvas bitmap - avoids stretched bitmap upscale. */
function buildZoomClip(clip, content, stage, heading, pad) {
  const crop = headingCrop(stage, heading, pad);
  clip.replaceChildren();
  const inner = document.createElement('div');
  inner.className = 'drift-zoom-clip__inner';
  inner.style.width = `${crop.stageWidth}px`;
  inner.style.height = `${crop.stageHeight}px`;
  inner.style.marginLeft = `-${crop.cropLeft}px`;
  inner.style.marginTop = `-${crop.cropTop}px`;
  inner.style.transform = `scale(${ZOOM_SCALE})`;
  inner.style.transformOrigin = 'top left';
  inner.append(content);
  clip.append(inner);
  return crop;
}

function addZoomGuides(clip, crop, shiftCss) {
  const liveY = (crop.inkCss - (crop.cropTop + crop.pad)) * ZOOM_SCALE;
  const canvasY = liveY + shiftCss * ZOOM_SCALE;
  for (const [y, cls, label] of [
    [liveY, 'live', 'live ink'],
    [canvasY, 'canvas', 'canvas ink'],
  ]) {
    const line = document.createElement('div');
    line.className = `drift-zoom-clip__guide drift-zoom-clip__guide--${cls}`;
    line.style.top = `${y}px`;
    line.title = label;
    clip.append(line);
  }
}

/**
 * @param {HTMLElement} root - `#drift-export-root`
 */
export async function initDriftDemo(root = document.getElementById('drift-export-root')) {
  const stage = root?.querySelector('#drift-capture-target');
  const preview = root?.querySelector('#drift-capture-preview');
  const liveGuide = root?.querySelector('#drift-live-guide');
  const canvasGuide = root?.querySelector('#drift-canvas-guide');
  const caption = root?.querySelector('#drift-demo-caption');
  const zoomLiveClip = root?.querySelector('#drift-zoom-live-clip');
  const zoomCanvasClip = root?.querySelector('#drift-zoom-canvas-clip');
  const demo = root?.querySelector('#drift-demo');
  const canvasLegendLabel = root?.querySelector('#drift-legend-canvas-label');

  if (!stage || !preview || !caption) return;

  try {
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await snapdomCaptureToCanvas(snapdom, stage);
    const { width, height } = stageBox(stage);
    preview.width = canvas.width;
    preview.height = canvas.height;
    preview.style.width = `${width}px`;
    preview.style.height = `${height}px`;
    preview.getContext('2d')?.drawImage(canvas, 0, 0);

    const heading = stage.querySelector('#drift-heading');
    const stageRect = stage.getBoundingClientRect();
    const pad = 6;
    const dpr = globalThis.devicePixelRatio ?? 1;

    if (heading && liveGuide && canvasGuide) {
      const liveInkCss = liveInkTop(heading) - stageRect.top;
      const liveInkDevice = liveInkDeviceY(heading, stage);
      liveGuide.style.top = `${liveInkCss}px`;

      const headRect = heading.getBoundingClientRect();
      const left = Math.round((headRect.left - stageRect.left + 4) * dpr);
      const right = Math.round((headRect.right - stageRect.left - 4) * dpr);
      const inkTop = measureInkTop(
        canvas,
        left,
        right,
        Math.max(0, liveInkDevice - 4),
        Math.min(canvas.height, liveInkDevice + 14)
      );

      const measuredShift =
        inkTop == null ? 0 : Math.round(((inkTop - liveInkDevice) / dpr) * 10) / 10;
      const useFakeDrift = Math.abs(measuredShift) < 0.1;
      const displayShift = useFakeDrift ? DEMO_DRIFT_CSS_PX : measuredShift;

      if (useFakeDrift && displayShift) {
        preview.style.transform = `translateY(${displayShift}px)`;
      }

      liveGuide.style.top = `${liveInkCss}px`;
      canvasGuide.style.top = useFakeDrift
        ? `${liveInkCss}px`
        : `${liveInkCss + displayShift}px`;

      const shiftNote = `Heading ink sits <strong>${displayShift > 0 ? '+' : ''}${displayShift}px</strong> lower on the canvas.`;

      if (canvasLegendLabel) {
        canvasLegendLabel.textContent = useFakeDrift
          ? 'Same top coord on canvas'
          : 'Canvas heading top';
      }

      caption.innerHTML = [
        shiftNote,
        'Same normalized <code>[x, y]</code> on live vs screenshot can miss the control the model intended.',
      ].join(' ');

      if (zoomLiveClip && zoomCanvasClip) {
        const liveClone = stage.cloneNode(true);
        liveClone.querySelector('[id]')?.removeAttribute('id');
        buildZoomClip(zoomLiveClip, liveClone, stage, heading, pad);

        const shot = document.createElement('img');
        shot.alt = '';
        shot.decoding = 'sync';
        shot.src = canvas.toDataURL('image/png');
        shot.style.width = `${width}px`;
        shot.style.height = `${height}px`;
        shot.style.display = 'block';
        if (useFakeDrift && displayShift) {
          shot.style.transform = `translateY(${displayShift}px)`;
        }
        const crop = buildZoomClip(zoomCanvasClip, shot, stage, heading, pad);
        if (Math.abs(displayShift) >= 0.1) {
          addZoomGuides(zoomCanvasClip, crop, displayShift);
        }
      }
    }

    if (demo) demo.dataset.ready = '1';
    root.dataset.driftReady = '1';
  } catch (err) {
    caption.textContent = String(err?.message ?? err);
    if (demo) demo.dataset.ready = 'error';
  }
}
