/**
 * Click marker overlay on the screenshot panel.
 *
 * Positioned against the rendered `#screenshot-img` bitmap (same norm space as
 * grounding + execution), not the wider `.screenshot-inner` wrapper.
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
  const img = doc.getElementById('screenshot-img');
  const container = img?.parentElement;
  if (!img || !container) return;

  const rect = img.getBoundingClientRect();
  const innerRect = container.getBoundingClientRect();
  const left = nx * rect.width + (rect.left - innerRect.left);
  const top = ny * rect.height + (rect.top - innerRect.top);

  const marker = doc.createElement('div');
  marker.id = MARKER_ID;
  marker.className = 'click-marker click-marker--success click-marker--compact';
  marker.dataset.normX = String(nx);
  marker.dataset.normY = String(ny);
  marker.style.left = `${left}px`;
  marker.style.top = `${top}px`;
  container.appendChild(marker);
}
