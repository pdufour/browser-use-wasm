/**
 * Click marker overlay on the screenshot panel.
 *
 * DOM contract: `#screenshot-img` lives inside a positioned wrapper
 * (`.screenshot-inner`); the marker is `#click-marker`, positioned in % of the
 * wrapper so it tracks the displayed image at any size.
 */

const MARKER_ID = 'click-marker';

export function clearMarker(doc: Document = document): void {
  doc.getElementById(MARKER_ID)?.remove();
}

/**
 * Draw the marker at a capture-normalized point (0–1) over `#screenshot-img`.
 * No-op when there is no screenshot in the DOM.
 */
export function drawMarker(nx: number, ny: number, doc: Document = document): void {
  clearMarker(doc);
  const parent = doc.getElementById('screenshot-img')?.parentElement;
  if (!parent) return;
  const marker = doc.createElement('div');
  marker.id = MARKER_ID;
  marker.className = 'click-marker click-marker--success click-marker--compact';
  marker.style.left = `${(nx * 100).toFixed(2)}%`;
  marker.style.top = `${(ny * 100).toFixed(2)}%`;
  parent.appendChild(marker);
}
