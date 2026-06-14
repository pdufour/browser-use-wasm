/**
 * Fake pointer + click marker before each grounded step.
 * Injects into the browse iframe when `liveInIframe` is set (browse / video demos).
 */

import { createFakeCursor } from '../voice/fake-cursor.ts';
import {
  drawMarker,
  clearMarker,
  relayoutMarker,
  drawIframeMarker,
  clearIframeMarker,
  relayoutIframeMarker,
} from './marker.ts';
import { removeIframeGroundingLayer } from './iframe-overlay.ts';
import { screenshotSurface, iframeCaptureSurface } from './cursor-surface.ts';

export interface GroundingPoint {
  x: number;
  y: number;
}

export interface GroundingStep {
  action: string;
  point: GroundingPoint | null;
}

export interface GroundingCursorOptions {
  screenshotStage: HTMLElement;
  /** Mount cursor inside `#browse-frame` content (browse / video demos). */
  liveInIframe?: boolean;
}

function showSnapshotViewport(): void {
  if (typeof document === 'undefined') return;
  document.body.dataset.viewport = 'snapshot';
  const details = document.getElementById('dev-details');
  if (details instanceof HTMLDetailsElement) details.open = true;
}

export function createGroundingCursor({
  screenshotStage,
  liveInIframe = false,
}: GroundingCursorOptions) {
  const useIframe = liveInIframe;
  const cursor = createFakeCursor(
    useIframe ? iframeCaptureSurface() : screenshotSurface(screenshotStage)
  );

  function placeMarker(point: GroundingPoint): void {
    if (useIframe) drawIframeMarker(point.x, point.y);
    else drawMarker(point.x, point.y);
  }

  function clearMarkers(): void {
    clearMarker();
    if (useIframe) {
      clearIframeMarker();
      removeIframeGroundingLayer();
    }
  }

  async function animateTo(point: GroundingPoint, action: string): Promise<void> {
    if (!useIframe) showSnapshotViewport();
    cursor.resetPosition();
    cursor.setState('thinking');
    const actionKey = String(action ?? '').toLowerCase();
    await cursor.moveTo(point.x, point.y, { action: actionKey });

    placeMarker(point);

    const upper = String(action ?? '').toUpperCase();
    if (upper === 'CLICK') cursor.pulseClick();
    else if (upper === 'DOUBLECLICK') cursor.pulseDoubleClick();
    cursor.setState(
      upper === 'CLICK' || upper === 'DOUBLECLICK' ? 'click' : 'hover'
    );
  }

  return {
    async beforeStep(step: GroundingStep): Promise<void> {
      if (!step.point) return;
      await animateTo(step.point, step.action);
    },
    animateTo,
    setListening(on: boolean): void {
      if (on) {
        if (!useIframe) showSnapshotViewport();
        cursor.resetPosition();
        cursor.setState('listening');
      } else {
        cursor.setState('idle');
      }
    },
    onCaptureClear(): void {
      cursor.hide();
      clearMarkers();
      cursor.resetPosition();
    },
    relayout(): void {
      cursor.relayout();
      if (useIframe) relayoutIframeMarker();
      else relayoutMarker();
    },
    hide(): void {
      cursor.hide();
    },
    destroy(): void {
      cursor.destroy();
      clearMarkers();
    },
  };
}

export type GroundingCursor = ReturnType<typeof createGroundingCursor>;
