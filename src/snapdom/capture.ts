import { CAPTURE_DPR_MAX, MAX_CAPTURE_WIDTH } from '../config/vl.ts';

/** Integer CSS px box for SnapDOM capture. */
export interface CaptureSize {
  width: number;
  height: number;
}

/** Viewport lock dims (`prepareCaptureDimensions`). */
export interface CaptureDimensions {
  w: number;
  h: number;
}

/** Minimal structural type for the `snapdom` callable from `@zumer/snapdom`. */
export interface SnapdomCaptureApi {
  toCanvas(
    element: Element,
    options?: {
      width?: number;
      height?: number;
      dpr?: number;
      scale?: number;
      embedFonts?: boolean;
    }
  ): Promise<HTMLCanvasElement>;
}

function captureSize(captureRoot: Element): CaptureSize {
  const rect = captureRoot.getBoundingClientRect();
  return {
    width: Math.min(MAX_CAPTURE_WIDTH, Math.max(1, Math.round(rect.width))),
    height: Math.max(1, Math.round(rect.height)),
  };
}

/**
 * SnapDOM clones DOM nodes, which drops `scrollTop`/`scrollLeft` state — a
 * scrolled inner region would be captured at scroll 0, so the screenshot would
 * not match what the user sees (and grounded points would be wrong). Emulate
 * each scrolled descendant with an equivalent inline transform for the
 * duration of the capture, then restore. Generic for any page structure.
 */
function emulateScrollPositionsForClone(root: Element): () => void {
  const restores: Array<() => void> = [];
  // No `instanceof HTMLElement`: the capture root may live in an iframe (other
  // realm), where instanceof against the host window's constructors is false.
  const scrollers = [root, ...root.querySelectorAll('*')].filter(
    (el): el is HTMLElement =>
      !!(el as HTMLElement).style && !!((el as HTMLElement).scrollTop || (el as HTMLElement).scrollLeft)
  );
  console.info(`[main:capture] scroll emulation: ${scrollers.length} scrolled region(s)`);
  for (const el of scrollers) {
    const { scrollTop, scrollLeft } = el;
    for (const child of Array.from(el.children) as HTMLElement[]) {
      if (!child.style) continue;
      const prev = child.style.transform;
      child.style.transform =
        `${prev ? `${prev} ` : ''}translate(${-scrollLeft}px, ${-scrollTop}px)`;
      restores.push(() => {
        child.style.transform = prev;
      });
    }
    const prevOverflow = el.style.overflow;
    el.style.overflow = 'hidden';
    el.scrollTop = 0;
    el.scrollLeft = 0;
    restores.push(() => {
      el.style.overflow = prevOverflow;
      el.scrollTop = scrollTop;
      el.scrollLeft = scrollLeft;
    });
  }
  return () => {
    for (const restore of restores.reverse()) restore();
  };
}

/** SnapDOM: `#capture-target` → canvas (single pass). */
export async function snapdomCaptureToCanvas(
  snapdom: SnapdomCaptureApi,
  captureRoot: Element
): Promise<HTMLCanvasElement> {
  const dpr = Math.min(CAPTURE_DPR_MAX, globalThis.devicePixelRatio ?? 1);
  const { width, height } = captureSize(captureRoot);
  const restoreScroll = emulateScrollPositionsForClone(captureRoot);
  try {
    return await snapdom.toCanvas(captureRoot, { width, height, dpr, scale: 1, embedFonts: true });
  } finally {
    restoreScroll();
  }
}

/** Device pixels → CSS px for screenshot display. */
export function snapdomCanvasToCssSize(canvas: HTMLCanvasElement, dpr: number): CaptureSize {
  const d = Math.max(1, dpr);
  return {
    width: Math.round(canvas.width / d),
    height: Math.round(canvas.height / d),
  };
}

/** Viewport lock dims before capture. */
export function prepareCaptureDimensions(captureRoot: Element): CaptureDimensions {
  const { width, height } = captureSize(captureRoot);
  return { w: width, h: height };
}
