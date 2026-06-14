/**
 * Shared fake-cursor + click-marker styles (screenshot panel + iframe injection).
 * Classic CSS arrow pointer + small red grounding dot — SnapDOM paints pseudo-elements.
 */

export const CURSOR_HOTSPOT_X = 7;
export const CURSOR_HOTSPOT_Y = 4;

export const CURSOR_OVERLAY_CSS = `
.fake-cursor {
  position: absolute;
  width: 28px;
  height: 28px;
  transform: translate(-${CURSOR_HOTSPOT_X}px, -${CURSOR_HOTSPOT_Y}px);
  pointer-events: none;
  z-index: 55;
  transform-origin: ${CURSOR_HOTSPOT_X}px ${CURSOR_HOTSPOT_Y}px;
}

.fake-cursor::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 28px;
  height: 28px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none'%3E%3Cpath d='M7 4V24.58L12.44 19.14L16.31 26.53L20.07 24.57L16.2 17.18H23.5L7 4Z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-size: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  transform-origin: ${CURSOR_HOTSPOT_X}px ${CURSOR_HOTSPOT_Y}px;
}

.fake-cursor::after {
  content: '';
  position: absolute;
  left: ${CURSOR_HOTSPOT_X - 3}px;
  top: ${CURSOR_HOTSPOT_Y - 3}px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 1.5px #ffffff;
  z-index: 56;
  transition: background-color 0.2s ease;
}

.fake-cursor[data-state='listening']::after {
  background: #6366f1;
}

.fake-cursor[data-moving='1']::after {
  background: #ef4444;
}

.fake-cursor[data-state='thinking']::after {
  background: #f59e0b;
}

.fake-cursor[data-state='thinking']::before {
  animation: agent-cursor-wiggle 0.5s ease-in-out infinite;
}

.fake-cursor.fake-cursor--click,
.fake-cursor.fake-cursor--dblclick {
  animation: agent-cursor-click-pop 0.35s ease-out;
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
  z-index: 50;
  box-shadow: none;
}

.click-marker::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: #ef4444;
}

.click-marker--compact,
.click-marker--success {
  width: 18px;
  height: 18px;
  border-width: 2.5px;
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
  box-shadow: none;
  animation: none;
}

.click-marker--success::after {
  background: #ef4444;
}

@keyframes agent-cursor-wiggle {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(8deg); }
}

@keyframes agent-cursor-click-pop {
  0% { transform: translate(-${CURSOR_HOTSPOT_X}px, -${CURSOR_HOTSPOT_Y}px) scale(1); }
  40% { transform: translate(-${CURSOR_HOTSPOT_X}px, -${CURSOR_HOTSPOT_Y}px) scale(1.2); }
  100% { transform: translate(-${CURSOR_HOTSPOT_X}px, -${CURSOR_HOTSPOT_Y}px) scale(1); }
}
`;

const STYLE_ID = 'agent-cursor-overlay-styles';

/** Inject cursor/marker CSS into any document (parent shell or browse iframe). */
export function injectCursorOverlayStyles(doc: Document): void {
  let style = doc.getElementById(STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = CURSOR_OVERLAY_CSS;
}
