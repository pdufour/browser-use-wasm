/**
 * Map capture-normalized coords (0–1) to a local overlay on a host element.
 */

import { displayedBitmapRect } from './marker.ts';
import {
  captureNormToLayerOffset,
  ensureIframeGroundingLayer,
} from './iframe-overlay.ts';

export interface CursorLayoutSurface {
  getContainer(): HTMLElement | null;
  normToOffset(nx: number, ny: number): { left: number; top: number } | null;
}

/** Screenshot panel — `.screenshot-inner` + `#screenshot-img`. */
export function screenshotSurface(screenshotStage: HTMLElement): CursorLayoutSurface {
  return {
    getContainer() {
      return screenshotStage.querySelector<HTMLElement>('.screenshot-inner');
    },
    normToOffset(nx, ny) {
      const container = screenshotStage.querySelector<HTMLElement>('.screenshot-inner');
      const image = screenshotStage.querySelector<HTMLCanvasElement | HTMLImageElement>(
        '#screenshot-img'
      );
      if (!container || !image) return null;
      const bitmap = displayedBitmapRect(image);
      const innerRect = container.getBoundingClientRect();
      return {
        left: nx * bitmap.width + (bitmap.left - innerRect.left),
        top: ny * bitmap.height + (bitmap.top - innerRect.top),
      };
    },
  };
}

/** Browse iframe — overlay injected on `#capture-target`. */
export function iframeCaptureSurface(): CursorLayoutSurface {
  return {
    getContainer: () => ensureIframeGroundingLayer(),
    normToOffset(nx, ny) {
      const layer = ensureIframeGroundingLayer();
      if (!layer) return null;
      return captureNormToLayerOffset(nx, ny, layer);
    },
  };
}
