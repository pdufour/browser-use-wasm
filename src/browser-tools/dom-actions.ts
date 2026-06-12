/**
 * Generic DOM helpers for voice browser tools.
 * Grounding coords come from ShowUI on the screenshot; execution resolves the
 * element at the model's grounded point (`elementFromPoint`) — never by
 * searching the live DOM for label/placeholder text (vision-only-execution.mdc).
 */

/**
 * Document the tools act on. The embedding app decides: the host page itself,
 * or an iframe's contentDocument (like the operator example's browse frame).
 */
let targetDocumentResolver: () => Document | null = () =>
  typeof document !== 'undefined' ? document : null;

export function setBrowserToolDocument(resolver: () => Document | null): void {
  targetDocumentResolver = resolver;
}

function getBrowseDocument(): Document | null {
  return targetDocumentResolver();
}

/** Live page root inside the target document (never the operator shell). */
function browseRoot(): HTMLElement | null {
  const doc = getBrowseDocument();
  if (!doc) return null;
  return (doc.getElementById('capture-target') as HTMLElement | null) ?? doc.body;
}

function browseActiveElement(): HTMLElement | null {
  const el = getBrowseDocument()?.activeElement;
  return el && typeof (el as HTMLElement).focus === 'function'
    ? (el as HTMLElement)
    : null;
}

function isCheckboxInput(el: Element | null | undefined): el is HTMLInputElement {
  return !!el && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox';
}

function isSelect(el: Element | null | undefined): el is HTMLSelectElement {
  return !!el && el.tagName === 'SELECT';
}

/**
 * Resolve an element at coordinates computed from `browseRoot()` rects.
 * Those rects are relative to the browse iframe's own viewport, so hit-testing
 * must run in the browse document — not the operator page.
 * @param x browse-frame viewport X
 * @param y browse-frame viewport Y
 */
function elementAtViewportPoint(x: number, y: number): Element | null {
  const doc = getBrowseDocument();
  return (doc ?? document).elementFromPoint(x, y);
}

export type ScrollDirection = 'up' | 'down';

/**
 * Trigger a real DOM event at normalized coordinates.
 */
export function triggerActionAtNorm(nx: number, ny: number, type: string = 'click'): boolean {
  const root = browseRoot();
  if (!root) return false;
  const rect = root.getBoundingClientRect();
  const baseVpX = rect.left + nx * rect.width;
  const baseVpY = rect.top + ny * rect.height;

  let el: Element | null = null;
  let finalX = baseVpX;
  let finalY = baseVpY;

  // Probe in a small radius to find ANY element (tolerates minor grounding drift)
  for (const [dx, dy] of POINT_PROBE_OFFSETS_PX) {
    const x = baseVpX + dx;
    const y = baseVpY + dy;
    el = elementAtViewportPoint(x, y);
    if (el) {
      finalX = x;
      finalY = y;
      break;
    }
  }

  if (!el) {
    console.warn(`[browser-actions] triggerActionAtNorm type="${type}" norm=(${nx.toFixed(3)}, ${ny.toFixed(3)}) no element found`);
    return false;
  }

  const view = el.ownerDocument?.defaultView ?? window;
  console.info(`[browser-actions] triggerActionAtNorm type="${type}" target=${el.tagName}#${el.id || '?'}`);

  if (type === 'click' || type === 'doubleclick' || type === 'rightclick') {
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view,
      clientX: finalX,
      clientY: finalY,
    };
    if (type === 'doubleclick') {
      el.dispatchEvent(new MouseEvent('dblclick', init));
    } else if (type === 'rightclick') {
      el.dispatchEvent(new MouseEvent('contextmenu', init));
    } else {
      // Standard click on the element at the point.
      // If it's a button/input, we use .click() for better compatibility with some frameworks.
      if (
        el instanceof HTMLButtonElement ||
        (el instanceof HTMLInputElement &&
          (el.type === 'button' || el.type === 'submit' || el.type === 'reset'))
      ) {
        el.click();
      } else {
        el.dispatchEvent(new MouseEvent('click', init));
        if (el.tagName === 'INPUT') {
          (el as HTMLElement).focus();
        }
      }
    }
    return true;
  }
  return false;
}

const CONTROL_SELECTOR = 'input, textarea, select, [contenteditable]';

/**
 * Resolve the form control at a capture-norm point (model's grounded `[x, y]`).
 * Point-derived only: elementFromPoint, then a label→control hop (when the
 * point lands on the field's own `<label>`) or `closest()` up to the control.
 * No text search — if the grounded point misses, this returns null.
 */
/**
 * Small point-derived probe offsets (px): the exact point first, then a ring
 * within ~16px for points that land in padding/grid gaps right next to the
 * control. Not a search — anything beyond this radius fails honestly.
 */
const POINT_PROBE_OFFSETS_PX: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [8, 0], [-8, 0], [0, 8], [0, -8],
  [16, 0], [-16, 0], [0, 16], [0, -16],
  [12, 12], [-12, 12], [12, -12], [-12, -12],
];

function controlAtNorm(nx: number, ny: number): HTMLElement | null {
  const root = browseRoot();
  if (!root) return null;
  const rect = root.getBoundingClientRect();
  const x = rect.left + nx * rect.width;
  const y = rect.top + ny * rect.height;
  for (const [dx, dy] of POINT_PROBE_OFFSETS_PX) {
    const el = elementAtViewportPoint(x + dx, y + dy);
    const control = resolveControlFromHit(el);
    if (control) {
      console.info(
        `[main:browser-actions] controlAtNorm norm=(${nx.toFixed(3)}, ${ny.toFixed(3)}) probe=(${dx},${dy}) hit=${el?.tagName} -> control=${control.tagName}#${control.id || '?'}`
      );
      return control;
    }
  }
  console.info(
    `[main:browser-actions] controlAtNorm norm=(${nx.toFixed(3)}, ${ny.toFixed(3)}) no control within probe radius`
  );
  return null;
}

/** Point-derived hop from the hit element to its form control (no text search). */
function resolveControlFromHit(el: Element | null): HTMLElement | null {
  if (!el) return null;
  const label = el.closest('label');
  if (label?.control) return label.control as HTMLElement;
  return el.closest<HTMLElement>(CONTROL_SELECTOR);
}

export function scrollPage(direction: ScrollDirection): void {
  const root = browseRoot();
  if (!root) return;
  const scroller =
    [...root.querySelectorAll('*')].find((el) => {
      const style = (root.ownerDocument?.defaultView ?? window).getComputedStyle(el);
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight
      );
    }) ??
    root;

  const delta = direction === 'down' ? 140 : -140;
  scroller.scrollBy({ top: delta, behavior: 'auto' });
}

/** Precise scroll to element top-left. */
export function scrollToElement(el: Element | null | undefined): void {
  if (!el) return;
  const doc = el.ownerDocument;
  if (!doc) return;
  const view = doc.defaultView ?? window;
  const rect = el.getBoundingClientRect();
  const scrollX = view.scrollX || view.pageXOffset;
  const scrollY = view.scrollY || view.pageYOffset;
  view.scrollTo({
    left: scrollX + rect.left,
    top: scrollY + rect.top,
    behavior: 'auto',
  });
}

/** Reset scroll for capture. */
export function resetScrollForCapture(): void {
  const doc = getBrowseDocument();
  if (!doc) return;
  const view = doc.defaultView ?? window;
  view.scrollTo(0, 0);
  const scrollers = doc.querySelectorAll('*');
  for (const el of scrollers) {
    const style = view.getComputedStyle(el);
    if (
      style.overflow === 'auto' ||
      style.overflow === 'scroll' ||
      style.overflowX === 'auto' ||
      style.overflowX === 'scroll' ||
      style.overflowY === 'auto' ||
      style.overflowY === 'scroll'
    ) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }
}

function isRangeInput(el: Element | null | undefined): el is HTMLInputElement {
  return !!el && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range';
}

function parseNumericValue(text: string): number | null {
  const match = String(text).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function setRangeValue(el: HTMLInputElement, text: string): boolean {
  const num = parseNumericValue(text);
  if (num == null) return false;
  const min = Number(el.min);
  const max = Number(el.max);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 100;
  const step = Number(el.step);
  let value = Math.min(hi, Math.max(lo, num));
  if (Number.isFinite(step) && step > 0) {
    value = lo + Math.round((value - lo) / step) * step;
    value = Math.min(hi, Math.max(lo, value));
  }
  el.focus();
  el.value = String(value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function isTypable(el: Element | null | undefined): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color', 'hidden'].includes(type);
}

/**
 * Type into the control at the model's normalized point (ShowUI navigation INPUT).
 * Coords come from the VLA on the screenshot; the point must land on the field
 * (or its own label — point-derived hop).
 */
export function typeAtNorm(nx: number, ny: number, text: string): boolean {
  const el = controlAtNorm(nx, ny);
  console.info(
    `[browser-actions] typeAtNorm norm=(${nx.toFixed(3)}, ${ny.toFixed(3)}) hit=${el?.tagName}#${el?.id || '?'} typable=${isTypable(el)} range=${isRangeInput(el)}`
  );
  if (isRangeInput(el)) return setRangeValue(el, text);
  if (!isTypable(el)) return false;
  const field: HTMLInputElement | HTMLTextAreaElement = el;
  field.focus();
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Clear the text control at the model's normalized point. */
export function clearAtNorm(nx: number, ny: number): boolean {
  const el = controlAtNorm(nx, ny);
  if (!isTypable(el)) return false;
  el.focus();
  el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Focus the form control at the model's normalized point. */
export function focusAtNorm(nx: number, ny: number): boolean {
  const el = controlAtNorm(nx, ny);
  if (!el || typeof el.focus !== 'function') return false;
  el.focus();
  return browseActiveElement() === el;
}

/** Blur the form control at the model's normalized point. */
export function blurAtNorm(nx: number, ny: number): boolean {
  const el = controlAtNorm(nx, ny);
  if (!el || typeof el.blur !== 'function') return false;
  if (browseActiveElement() !== el) el.focus();
  el.blur();
  return browseActiveElement() !== el;
}

/** Toggle the checkbox at the model's normalized point. */
export function toggleCheckboxAtNorm(nx: number, ny: number): boolean {
  const el = controlAtNorm(nx, ny);
  if (!isCheckboxInput(el)) return false;
  el.checked = !el.checked;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Set the `<select>` at the model's normalized point to the option matching `optionText`. */
export function selectOptionAtNorm(nx: number, ny: number, optionText: string): boolean {
  const el = controlAtNorm(nx, ny);
  if (!isSelect(el)) return false;
  const want = optionText.trim().toLowerCase();
  const opt = [...el.options].find((o) => o.textContent?.trim().toLowerCase() === want);
  if (!opt) return false;
  el.value = opt.value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export function pressKey(key: 'Tab' | 'Enter' | 'Escape'): { ok: boolean; detail: string } {
  const root = browseRoot();
  if (!root) return { ok: false, detail: 'browse frame not ready' };
  const activeEl = browseActiveElement();
  const active = activeEl && root.contains(activeEl) ? activeEl : null;

  if (key === 'Escape') {
    active?.blur();
    const modal = getBrowseDocument()?.querySelector<HTMLElement>('[role="dialog"]:not([hidden])');
    if (modal) {
      modal.hidden = true;
      return { ok: true, detail: 'escape' };
    }
    dispatchKey(root, 'Escape', { key: 'Escape', code: 'Escape', keyCode: 27 });
    return { ok: true, detail: 'escape' };
  }

  if (key === 'Tab') {
    // Let browser handle tab or implement basic focus cycle
    dispatchKey(root, 'Tab', { key: 'Tab', code: 'Tab', keyCode: 9 });
    return { ok: true, detail: 'tab' };
  }

  if (key === 'Enter') {
    if (active) {
      dispatchKey(active, 'Enter', { key: 'Enter', code: 'Enter', keyCode: 13 });
      active.click();
      return { ok: true, detail: 'enter' };
    }
  }

  return { ok: false, detail: 'unhandled key' };
}

function dispatchKey(
  el: HTMLElement,
  type: string,
  init: KeyboardEventInit & { keyCode?: number }
): void {
  el.dispatchEvent(
    new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })
  );
}
