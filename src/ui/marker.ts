/**
 * Click marker overlay on the screenshot panel.
 *
 * Positioned against the rendered `#screenshot-img` bitmap (same norm space as
 * grounding + execution), not the wider `.screenshot-inner` wrapper.
 */

import { getCaptureElement } from './browse-frame.ts';
import {
  captureNormToLayerOffset,
  ensureIframeGroundingLayer,
} from './iframe-overlay.ts';

const MARKER_ID = 'click-marker';

/** Bitmap display rect inside `#screenshot-img` (accounts for letterboxing). */
export function displayedBitmapRect(
  img: HTMLCanvasElement | HTMLImageElement,
  viewportRect = img.getBoundingClientRect()
): DOMRect {
  const nw = img instanceof HTMLCanvasElement ? img.width : img.naturalWidth;
  const nh = img instanceof HTMLCanvasElement ? img.height : img.naturalHeight;
  if (!nw || !nh || !viewportRect.width || !viewportRect.height) return viewportRect;

  const scale = Math.min(viewportRect.width / nw, viewportRect.height / nh);
  const width = nw * scale;
  const height = nh * scale;
  const left = viewportRect.left + (viewportRect.width - width) / 2;
  const top = viewportRect.top + (viewportRect.height - height) / 2;
  return new DOMRect(left, top, width, height);
}

export function clearMarker(doc: Document = document): void {
  doc.getElementById(MARKER_ID)?.remove();
}

/**
 * Draw the marker at a capture-normalized point (0–1) over `#screenshot-img`.
 * No-op when there is no screenshot in the DOM.
 */
export function drawMarker(nx: number, ny: number, doc: Document = document): void {
  clearMarker(doc);
  const img = doc.getElementById('screenshot-img');
  const container = img?.parentElement;
  if (!img || !container) return;

  const bitmap = displayedBitmapRect(img as HTMLCanvasElement | HTMLImageElement);
  const innerRect = container.getBoundingClientRect();
  const left = nx * bitmap.width + (bitmap.left - innerRect.left);
  const top = ny * bitmap.height + (bitmap.top - innerRect.top);

  const marker = doc.createElement('div');
  marker.id = MARKER_ID;
  marker.className = 'click-marker click-marker--success click-marker--compact';
  marker.dataset.normX = String(nx);
  marker.dataset.normY = String(ny);
  marker.style.left = `${left}px`;
  marker.style.top = `${top}px`;
  container.appendChild(marker);
}

/** Re-position an existing marker after layout changes (dev details, resize). */
export function relayoutMarker(doc: Document = document): void {
  const marker = doc.getElementById(MARKER_ID);
  if (!marker) return;
  const nx = parseFloat(marker.dataset.normX ?? '');
  const ny = parseFloat(marker.dataset.normY ?? '');
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
  drawMarker(nx, ny, doc);
}

/** Click marker inside the browse iframe overlay layer. */
export function drawIframeMarker(nx: number, ny: number): void {
  const layer = ensureIframeGroundingLayer();
  if (!layer) return;
  const doc = layer.ownerDocument;
  clearIframeMarker(doc);
  const offset = captureNormToLayerOffset(nx, ny, layer);
  if (!offset) return;

  const marker = doc.createElement('div');
  marker.id = MARKER_ID;
  marker.className = 'click-marker click-marker--success click-marker--compact';
  marker.dataset.normX = String(nx);
  marker.dataset.normY = String(ny);
  marker.style.left = `${offset.left}px`;
  marker.style.top = `${offset.top}px`;
  marker.setAttribute('aria-hidden', 'true');
  layer.appendChild(marker);
}

export function clearIframeMarker(doc?: Document | null): void {
  const d = doc ?? getCaptureElement()?.ownerDocument;
  d?.getElementById(MARKER_ID)?.remove();
}

export function relayoutIframeMarker(): void {
  const doc = getCaptureElement()?.ownerDocument;
  const marker = doc?.getElementById(MARKER_ID);
  if (!marker) return;
  const nx = parseFloat(marker.dataset.normX ?? '');
  const ny = parseFloat(marker.dataset.normY ?? '');
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
  drawIframeMarker(nx, ny);
}
