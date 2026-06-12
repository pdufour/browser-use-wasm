/**
 * Scripted multi-stop cursor tour on the screenshot (visual tour).
 */

export type TourAction = 'hover' | 'move' | 'click' | 'doubleclick' | 'rightclick';

export interface CursorTourStep {
  target: string;
  action?: TourAction;
  pauseMs?: number;
  recaptureAfter?: boolean;
}

export function tourMoveDurationMs(ax: number, ay: number, bx: number, by: number): number {
  const dist = Math.hypot(bx - ax, by - ay);
  return Math.round(380 + dist * 1100);
}

export function tourSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
