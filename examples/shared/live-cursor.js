/**
 * Screen Studio–style pointer over the live demo iframe (browse runner).
 * Cursor shape and motion follow each action (click, type, enter).
 */

const DEFAULT_MOVE_MS = 420;

const POINTER_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M8 4l15.5 11.5-6.5 1.5 3.5 7.5-3 1.5-3.5-7.5-6 5.5z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E";

const HAND_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M10 8c0-1.1.9-2 2-2s2 .9 2 2v6h1V9c0-1.1.9-2 2-2s2 .9 2 2v5h1v-4c0-1.1.9-2 2-2s2 .9 2 2v5h1v-2c0-1.1.9-2 2-2s2 .9 2 2v8c0 3.9-3.1 7-7 7H14c-3.9 0-7-3.1-7-7V11c0-1.1.9-2 2-2s1 .9 1 2v5h1v-8z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E";

const TEXT_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M12 8h8M16 8v16M12 24h8' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {HTMLElement | null} wrapEl `#live-wrap` — positions relative to iframe
 * @param {() => HTMLIFrameElement | null} getFrame
 * @param {() => HTMLElement | null} [getCaptureRoot] Optional: element the model is scoped to (default: frame body)
 */
export function createLiveCursor(wrapEl, getFrame, getCaptureRoot) {
  let el = null;
  let pos = { x: 0.12, y: 0.12 };
  let animFrame = null;
  let mode = 'pointer';

  function ensureElement() {
    if (!wrapEl) return null;
    if (!el || !wrapEl.contains(el)) {
      el?.remove();
      el = document.createElement('div');
      el.id = 'live-cursor';
      el.className = 'live-cursor';
      el.dataset.testid = 'live-cursor';
      el.dataset.mode = 'pointer';
      el.setAttribute('aria-hidden', 'true');
      el.hidden = true;
      wrapEl.appendChild(el);
    }
    return el;
  }

  function setMode(next) {
    const cursor = ensureElement();
    if (!cursor || mode === next) return;
    mode = next;
    cursor.dataset.mode = next;
    if (next === 'text') {
      cursor.style.setProperty('--live-cursor-art', `url("${TEXT_SVG}")`);
      cursor.style.setProperty('--live-cursor-hotspot-x', '16px');
      cursor.style.setProperty('--live-cursor-hotspot-y', '16px');
      cursor.style.setProperty('--live-cursor-size', '32px');
    } else if (next === 'hand') {
      cursor.style.setProperty('--live-cursor-art', `url("${HAND_SVG}")`);
      cursor.style.setProperty('--live-cursor-hotspot-x', '13px');
      cursor.style.setProperty('--live-cursor-hotspot-y', '7px');
      cursor.style.setProperty('--live-cursor-size', '32px');
    } else {
      cursor.style.setProperty('--live-cursor-art', `url("${POINTER_SVG}")`);
      cursor.style.setProperty('--live-cursor-hotspot-x', '9px');
      cursor.style.setProperty('--live-cursor-hotspot-y', '5px');
      cursor.style.setProperty('--live-cursor-size', '32px');
    }
  }

  /**
   * Calculate mapping from capture-norm coords (0-1 on the grounded element)
   * to pixel coords relative to `wrapEl`.
   */
  function getMapping() {
    const frame = getFrame();
    const wrap = wrapEl;
    if (!frame || !wrap) return null;

    const fRect = frame.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    
    // Default to the whole frame
    let targetRect = { left: 0, top: 0, width: fRect.width, height: fRect.height };

    // If we have a specific capture root (like #capture-target), use its rect relative to the frame.
    const root = getCaptureRoot?.();
    if (root) {
      const rRect = root.getBoundingClientRect(); // relative to iframe viewport
      targetRect = {
        left: rRect.left,
        top: rRect.top,
        width: rRect.width,
        height: rRect.height,
      };
    }

    return {
      // Offset from wrapEl to frame content origin
      offsetX: fRect.left - wRect.left,
      offsetY: fRect.top - wRect.top,
      // Target area within the frame
      target: targetRect,
    };
  }

  function layout(normX, normY) {
    const cursor = ensureElement();
    const map = getMapping();
    if (!cursor || !map) return;
    
    const nx = Math.min(1, Math.max(0, normX));
    const ny = Math.min(1, Math.max(0, normY));
    
    // 1. Scale norm coords by target element size
    // 2. Add target element's offset within the iframe
    // 3. Add iframe's offset within the wrap
    const x = map.offsetX + map.target.left + nx * map.target.width;
    const y = map.offsetY + map.target.top + ny * map.target.height;
    
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
  }

  function cancelAnim() {
    if (animFrame != null) cancelAnimationFrame(animFrame);
    animFrame = null;
  }

  function moveDurationMs(from, to) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    return Math.round(DEFAULT_MOVE_MS + dist * 900);
  }

  /**
   * @param {number} normX
   * @param {number} normY
   * @param {{ durationMs?: number, travelMode?: string }} [opts]
   */
  function moveTo(normX, normY, opts = {}) {
    const cursor = ensureElement();
    if (!cursor) return Promise.resolve();
    cursor.hidden = false;
    if (opts.travelMode) setMode(opts.travelMode);

    const target = {
      x: Math.min(1, Math.max(0, normX)),
      y: Math.min(1, Math.max(0, normY)),
    };
    const from = { ...pos };
    const durationMs = opts.durationMs ?? moveDurationMs(from, target);

    cancelAnim();
    cursor.classList.add('is-moving');
    const start = performance.now();

    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - start) / durationMs);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pos = {
          x: from.x + (target.x - from.x) * ease,
          y: from.y + (target.y - from.y) * ease,
        };
        layout(pos.x, pos.y);
        if (t < 1) {
          animFrame = requestAnimationFrame(step);
        } else {
          pos = { ...target };
          cancelAnim();
          cursor.classList.remove('is-moving');
          resolve();
        }
      };
      animFrame = requestAnimationFrame(step);
    });
  }

  async function playClick() {
    const cursor = ensureElement();
    if (!cursor) return;
    setMode('hand');

    cursor.classList.add('is-pressing');
    await sleep(90);
    cursor.classList.remove('is-pressing');
    cursor.classList.add('is-clicking');

    const ripple = document.createElement('span');
    ripple.className = 'live-cursor__ripple';
    ripple.setAttribute('aria-hidden', 'true');
    const burst = document.createElement('span');
    burst.className = 'live-cursor__burst';
    burst.setAttribute('aria-hidden', 'true');
    cursor.append(ripple, burst);

    await sleep(320);
    cursor.classList.remove('is-clicking');
    ripple.remove();
    burst.remove();
    setMode('pointer');
  }

  async function playType(value) {
    const cursor = ensureElement();
    if (!cursor) return;
    setMode('text');
    cursor.classList.add('is-typing');
    const label = document.createElement('span');
    label.className = 'live-cursor__label';
    label.textContent = value ?? '';
    cursor.appendChild(label);
    await sleep(Math.min(900, 140 + String(value ?? '').length * 38));
    label.remove();
    cursor.classList.remove('is-typing');
    setMode('pointer');
  }

  async function playEnter() {
    const cursor = ensureElement();
    if (!cursor) return;
    setMode('pointer');
    cursor.classList.add('is-enter');
    await sleep(160);
    cursor.classList.remove('is-enter');
  }

  async function clickAt(normX, normY) {
    await moveTo(normX, normY, { travelMode: 'hand' });
    await playClick();
  }

  function onResize() {
    if (el && !el.hidden) layout(pos.x, pos.y);
  }
  window.addEventListener('resize', onResize);

  return {
    /** Show pointer at default entry position (call when Run starts). */
    show() {
      setMode('pointer');
      pos = { x: 0.14, y: 0.16 };
      layout(pos.x, pos.y);
      const cursor = ensureElement();
      if (cursor) cursor.hidden = false;
    },
    showAt(normX, normY) {
      pos = { x: normX, y: normY };
      layout(pos.x, pos.y);
      const cursor = ensureElement();
      if (cursor) {
        cursor.hidden = false;
        setMode('pointer');
      }
    },
    /** Subtle pulse while ShowUI inference runs (before first action). */
    setThinking(on) {
      const cursor = ensureElement();
      if (!cursor) return;
      cursor.classList.toggle('is-thinking', on);
    },
    moveTo,
    clickAt,
    /**
     * Animate the cursor for one agent step before DOM execution.
     * @param {{ action: string, value?: string | null, point?: { x: number, y: number } | null }} step
     */
    async performStep(step) {
      const cursor = ensureElement();
      if (cursor) {
        cursor.hidden = false;
        cursor.classList.remove('is-thinking');
      }
      const action = String(step.action ?? '').toUpperCase();
      const point = step.point;

      if (action === 'ENTER') {
        await playEnter();
        return;
      }
      if (!point) return;

      if (action === 'CLICK' || action === 'SELECT') {
        await moveTo(point.x, point.y, { travelMode: 'hand' });
        await playClick();
        return;
      }
      if (action === 'INPUT') {
        await moveTo(point.x, point.y, { travelMode: 'pointer' });
        await playType(step.value);
        return;
      }
      await moveTo(point.x, point.y, { travelMode: 'pointer' });
    },
    hide() {
      cancelAnim();
      if (el) {
        el.hidden = true;
        el.classList.remove('is-clicking', 'is-pressing', 'is-moving', 'is-typing', 'is-enter');
        el.querySelector('.live-cursor__ripple')?.remove();
        el.querySelector('.live-cursor__burst')?.remove();
        el.querySelector('.live-cursor__label')?.remove();
      }
    },
    destroy() {
      window.removeEventListener('resize', onResize);
      cancelAnim();
      el?.remove();
      el = null;
    },
  };
}
