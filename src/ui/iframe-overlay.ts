/**
 * Grounding overlay injected into the browse iframe (`#capture-target`).
 * Pointer + marker live in the captured page document — same norm space as execution.
 */

import { getCaptureElement } from './browse-frame.ts';
import { injectCursorOverlayStyles } from './cursor-overlay-styles.ts';

export const IFRAME_LAYER_ID = 'agent-grounding-layer';
const LAYER_STYLE_ID = 'agent-grounding-layer-styles';

const LAYER_CSS = `
.agent-grounding-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
  overflow: visible;
}
`;

export function injectIframeOverlayStyles(doc: Document): void {
  injectCursorOverlayStyles(doc);
  let style = doc.getElementById(LAYER_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = LAYER_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = LAYER_CSS;
}

/** Full-size layer inside `#capture-target` for cursor + marker. */
export function ensureIframeGroundingLayer(): HTMLElement | null {
  const root = getCaptureElement();
  if (!root) return null;
  const doc = root.ownerDocument;
  injectIframeOverlayStyles(doc);

  const win = doc.defaultView;
  if (win && win.getComputedStyle(root).position === 'static') {
    root.style.position = 'relative';
  }

  let layer = doc.getElementById(IFRAME_LAYER_ID);
  if (!layer) {
    layer = doc.createElement('div');
    layer.id = IFRAME_LAYER_ID;
    layer.className = 'agent-grounding-layer';
    layer.setAttribute('aria-hidden', 'true');
    root.appendChild(layer);
  }
  return layer as HTMLElement;
}

export function captureNormToLayerOffset(
  nx: number,
  ny: number,
  layer: HTMLElement
): { left: number; top: number } | null {
  const w = layer.clientWidth;
  const h = layer.clientHeight;
  if (!w || !h) return null;
  return { left: nx * w, top: ny * h };
}

export function removeIframeGroundingLayer(): void {
  const root = getCaptureElement();
  root?.ownerDocument.getElementById(IFRAME_LAYER_ID)?.remove();
}
