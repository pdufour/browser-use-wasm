/**
 * Locate a UI label on a screenshot with ONE ShowUI navigation inference
 * (`click <label>`) — no query rewriting, no fanout (see
 * `no-navigation-query-overfit.mdc`). Returns the parsed point in the
 * model's vision-norm space without executing anything.
 */

import { runNavigation } from './navigation.ts';
import type { CompletionClient } from './navigation.ts';
import type { GroundingPoint } from './parse-coords.ts';

export interface LocateLabelResult {
  ok: boolean;
  /** Vision-norm point (caller remaps to capture space if cropped). */
  point: GroundingPoint | null;
  text: string;
  inferMs: number;
}

export interface LocateLabelOptions {
  timeoutMs?: number;
  timeoutMessage?: string;
}

export function hasValidNormPoint(
  point: GroundingPoint | null | undefined
): point is GroundingPoint {
  return (
    point != null &&
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export async function locateLabel(
  client: CompletionClient,
  imageBuffer: ArrayBuffer,
  label: string,
  opts: LocateLabelOptions = {}
): Promise<LocateLabelResult> {
  const run = runNavigation(client, imageBuffer, `click ${label}`);
  const result = await (opts.timeoutMs
    ? withTimeout(
        run,
        opts.timeoutMs,
        opts.timeoutMessage ?? `locate timed out after ${opts.timeoutMs / 1000}s`
      )
    : run);
  const step = result.actions.find((a) => hasValidNormPoint(a.point));
  return {
    ok: !!step,
    point: step?.point ?? null,
    text: result.text,
    inferMs: result.inferMs,
  };
}
