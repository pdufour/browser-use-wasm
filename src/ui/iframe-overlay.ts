/**
 * Grounding overlay injected into the browse iframe (`#capture-target`).
 * Pointer + marker live in the captured page document — same norm space as execution.
 */

import { getCaptureElement } from './browse-frame.ts';

export const IFRAME_LAYER_ID = 'agent-grounding-layer';
const STYLE_ID = 'agent-grounding-styles';

/** Injected once per iframe document (cursor + marker rules). */
const OVERLAY_CSS = `
.agent-grounding-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
  overflow: visible;
}
.click-marker {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2.5px solid #ef4444;
  background: rgba(239, 68, 68, 0.15);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 2;
  box-shadow: none;
}
.click-marker::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: #ef4444;
}
.fake-cursor {
  position: absolute;
  width: 28px;
  height: 28px;
  transform: translate(-4px, -4px);
  pointer-events: none;
  z-index: 3;
}
.fake-cursor::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-bottom: 20px solid #1a1d26;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.2));
}
.fake-cursor::after {
  content: '';
  position: absolute;
  left: 10px;
  top: 16px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 1px #1a1d26;
}
.fake-cursor[data-state='listening']::before { border-bottom-color: #6366f1; }
.fake-cursor[data-moving='1']::before { border-bottom-color: #ef4444; }
.fake-cursor[data-state='thinking']::before {
  border-bottom-color: #f59e0b;
  animation: agent-cursor-wiggle 0.5s ease-in-out infinite;
}
.fake-cursor.fake-cursor--click,
.fake-cursor.fake-cursor--dblclick {
  animation: agent-cursor-click-pop 0.35s ease-out;
}
@keyframes agent-cursor-wiggle {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(8deg); }
}
@keyframes agent-cursor-click-pop {
  0% { transform: translate(-4px, -4px) scale(1); }
  40% { transform: translate(-4px, -4px) scale(1.2); }
  100% { transform: translate(-4px, -4px) scale(1); }
}
`;

export function injectIframeOverlayStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = OVERLAY_CSS;
  doc.head.appendChild(style);
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
