/**
 * Animated fake pointer on the screenshot overlay (not live DOM).
 */

const DEFAULT_LERP_MS =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('e2e')
    ? 120
    : 380;

export type FakeCursorState = 'idle' | 'listening' | 'thinking' | 'hover' | 'click';

export interface FakeCursorMoveOptions {
  action?: string;
  durationMs?: number;
}

/**
 * @param screenshotStage `#screenshot-stage`
 */
export function createFakeCursor(screenshotStage: HTMLElement) {
  let el: HTMLElement | null = null;
  let pos: { x: number; y: number } = { x: 0.5, y: 0.5 };
  let animFrame: number | null = null;
  let animStart: number | null = null;
  let animFrom: { x: number; y: number } | null = null;
  let animTo: { x: number; y: number } | null = null;

  function inner(): Element | null {
    return screenshotStage.querySelector('.screenshot-inner');
  }

  function img(): HTMLImageElement | HTMLCanvasElement | null {
    return screenshotStage.querySelector<HTMLImageElement | HTMLCanvasElement>(
      '#screenshot-img'
    );
  }

  function ensureElement(): HTMLElement | null {
    const container = inner();
    if (!container) return null;
    if (!el || !container.contains(el)) {
      el?.remove();
      el = document.createElement('div');
      el.id = 'fake-cursor';
      el.className = 'fake-cursor';
      el.dataset.testid = 'fake-cursor';
      el.setAttribute('aria-hidden', 'true');
      el.hidden = true;
      container.appendChild(el);
    }
    return el;
  }

  function layout(normX: number, normY: number): void {
    const cursor = ensureElement();
    const image = img();
    const container = inner();
    if (!cursor || !image || !container) return;

    const rect = image.getBoundingClientRect();
    const innerRect = container.getBoundingClientRect();
    const left = normX * rect.width + (rect.left - innerRect.left);
    const top = normY * rect.height + (rect.top - innerRect.top);
    cursor.style.left = `${left}px`;
    cursor.style.top = `${top}px`;
  }

  function cancelAnim(): void {
    if (animFrame != null) cancelAnimationFrame(animFrame);
    animFrame = null;
    animStart = null;
    animFrom = null;
    animTo = null;
  }

  function moveTo(normX: number, normY: number, opts: FakeCursorMoveOptions = {}): Promise<void> {
    const cursor = ensureElement();
    if (!cursor) return Promise.resolve();
    cursor.hidden = false;
    cursor.dataset.action = opts.action ?? 'hover';
    const durationMs = opts.durationMs ?? DEFAULT_LERP_MS;
    cursor.dataset.moving = durationMs > DEFAULT_LERP_MS ? '1' : '';

    const target = {
      x: Math.min(1, Math.max(0, normX)),
      y: Math.min(1, Math.max(0, normY)),
    };

    cancelAnim();
    animFrom = { ...pos };
    animTo = target;

    return new Promise((resolve) => {
      animStart = performance.now();
      const step = (now: number) => {
        if (!animStart || !animFrom || !animTo) {
          if (cursor) cursor.dataset.moving = '';
          resolve();
          return;
        }
        const t = Math.min(1, (now - animStart) / durationMs);
        const ease = t * (2 - t);
        pos = {
          x: animFrom.x + (animTo.x - animFrom.x) * ease,
          y: animFrom.y + (animTo.y - animFrom.y) * ease,
        };
        layout(pos.x, pos.y);
        if (t < 1) {
          animFrame = requestAnimationFrame(step);
        } else {
          pos = { ...target };
          cancelAnim();
          cursor.dataset.moving = '';
          resolve();
        }
      };
      animFrame = requestAnimationFrame(step);
    });
  }

  return {
    setState(state: FakeCursorState): void {
      const cursor = ensureElement();
      if (!cursor) return;
      cursor.dataset.state = state;
      if (state === 'idle') cursor.hidden = true;
      else cursor.hidden = false;
    },
    showAt(normX: number, normY: number): void {
      pos = { x: normX, y: normY };
      layout(pos.x, pos.y);
      const cursor = ensureElement();
      if (cursor) cursor.hidden = false;
    },
    moveTo,
    pulseClick(): void {
      const cursor = ensureElement();
      if (!cursor) return;
      cursor.classList.remove('fake-cursor--click', 'fake-cursor--dblclick');
      void cursor.offsetWidth;
      cursor.classList.add('fake-cursor--click');
    },
    pulseDoubleClick(): void {
      const cursor = ensureElement();
      if (!cursor) return;
      cursor.classList.remove('fake-cursor--click', 'fake-cursor--dblclick');
      void cursor.offsetWidth;
      cursor.classList.add('fake-cursor--dblclick');
    },
    hide(): void {
      cancelAnim();
      if (el) {
        el.hidden = true;
        el.classList.remove('fake-cursor--click');
      }
    },
    destroy(): void {
      cancelAnim();
      el?.remove();
      el = null;
    },
  };
}
