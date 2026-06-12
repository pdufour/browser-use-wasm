import {
  VL_MIN_PIXELS,
  VL_MAX_PIXELS,
  VL_PATCH_SIZE,
  VL_IMAGE_MAX_TOKENS,
  VL_IMAGE_MIN_TOKENS,
  MAX_CAPTURE_WIDTH,
  CAPTURE_DPR_MAX,
} from '../config/vl.ts';
import { resolveModelLoadCaps } from '../env/model-gating.ts';
import { BROWSER_VALIDATED_MODEL_IDS, getCurrentModel } from '../config/models/registry.ts';
import type { ModelCard } from '../config/models/types.ts';

/** Per-model vision sizing (patch grid + token cap → pixel bounds). */
export interface VisionSizing {
  patchSize: number;
  imageMaxTokens: number;
  minPixels: number;
  maxPixels: number;
}

/** Patch-aligned vision dimensions (device pixels). */
export interface VisionDimensions {
  width: number;
  height: number;
}

/** Normalized crop rect on the full capture (0–1 coords). */
export interface VisionCropRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Crop + token target plan for one capture (`resolveVisionCapturePlan`). */
export interface VisionCapturePlan {
  cropHeight: number | null;
  tokenTarget: number;
  visionCrop: VisionCropRect | null;
}

/** Normalized point on a capture/vision bitmap. */
export interface VisionNormPoint {
  x: number;
  y: number;
}

/** Bitmap-like sources with numeric width/height accepted by the vision resize pipeline. */
export type VisionImageSource = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

/** Result of `prepareVisionCapture` — resized bitmap + crop metadata. */
export interface VisionCaptureResult {
  canvas: VisionImageSource;
  visionCrop: VisionCropRect | null;
  tokenTarget: number;
}

/**
 * Vision sizing for capture resize (per-model patch grid + token cap).
 */
export function visionSizingFromModel(model: ModelCard = getCurrentModel()): VisionSizing {
  const patchSize = model.patch_size ?? VL_PATCH_SIZE;
  const browserValidated = BROWSER_VALIDATED_MODEL_IDS.includes(model.id);
  const caps = resolveModelLoadCaps(model, { browserValidated });
  const imageMaxTokens = caps.imageMaxTokens ?? VL_IMAGE_MAX_TOKENS;
  const minPixels = VL_MIN_PIXELS;
  const maxPixels = Math.min(VL_MAX_PIXELS, imageMaxTokens * patchSize * patchSize);
  return { patchSize, imageMaxTokens, minPixels, maxPixels };
}

/** Vision tokens for a patch-aligned width × height. */
export function pixelsToVisionTokens(
  width: number,
  height: number,
  patchSize: number = VL_PATCH_SIZE
): number {
  return (width / patchSize) * (height / patchSize);
}

/**
 * Qwen2-VL-style smart_resize (height, width) — matches HF / llama.cpp grid.
 */
export function visionSmartResize(
  height: number,
  width: number,
  sizing: VisionSizing = visionSizingFromModel()
): VisionDimensions {
  const factor = sizing.patchSize;
  const minPixels = sizing.minPixels;
  const maxPixels = sizing.maxPixels;

  let h = Math.max(factor, Math.round(height));
  let w = Math.max(factor, Math.round(width));

  let hBar = Math.max(factor, Math.round(h / factor) * factor);
  let wBar = Math.max(factor, Math.round(w / factor) * factor);

  if (hBar * wBar > maxPixels) {
    const beta = Math.sqrt((h * w) / maxPixels);
    hBar = Math.max(factor, Math.floor(h / beta / factor) * factor);
    wBar = Math.max(factor, Math.floor(w / beta / factor) * factor);
  } else if (hBar * wBar < minPixels) {
    const beta = Math.sqrt(minPixels / (h * w));
    hBar = Math.max(factor, Math.ceil(h * beta / factor) * factor);
    wBar = Math.max(factor, Math.ceil(w * beta / factor) * factor);
  }

  while (hBar * wBar > maxPixels && (hBar > factor || wBar > factor)) {
    if (hBar >= wBar) hBar -= factor;
    else wBar -= factor;
  }

  return { width: wBar, height: hBar };
}

/** @deprecated Use `visionSmartResize`. */
export const showuiSmartResize = visionSmartResize;

/** Patch-aligned height preserving capture aspect (uniform scale — no stretch). */
function patchHeightForWidth(width: number, aspect: number, patchSize: number): number {
  return Math.max(patchSize, Math.round((width * aspect) / patchSize) * patchSize);
}

/** Max patch width when growing — never upscale past source width. */
function sourceMaxPatchWidth(sourceWidth: number, patch: number): number {
  return Math.max(patch, Math.floor(sourceWidth / patch) * patch);
}

/** Patch-aligned width — floor when round would upscale. */
function initialPatchWidth(sourceWidth: number, patchSize: number): number {
  const rounded = Math.max(patchSize, Math.round(sourceWidth / patchSize) * patchSize);
  const floored = Math.max(patchSize, Math.floor(sourceWidth / patchSize) * patchSize);
  if (rounded <= sourceWidth) return rounded;
  return floored;
}

/** True when vision width is materially below the source patch-grid ceiling. */
function visionWidthStarved(width: number, sourceMaxWidth: number, patch: number): boolean {
  return width < sourceMaxWidth - patch * 2;
}

/**
 * Moderate-aspect pages (forms, checkout) — keep full height at max tokens instead of
 * top-band crop that drops lower fields for a few extra patch columns.
 */
function preferFullFrameOverTopCrop(sourceWidth: number, sourceHeight: number): boolean {
  const aspect = sourceHeight / Math.max(1, sourceWidth);
  return aspect <= 2.5 && sourceHeight <= 1100;
}

/**
 * Scale dimensions for the active model's vision budget — preserves capture aspect.
 * `targetTokens` is the token cap for this encode (defaults to model max).
 */
export function fitVisionPixelBudget(
  width: number,
  height: number,
  model: ModelCard = getCurrentModel(),
  targetTokens?: number
): VisionDimensions {
  const sizing = visionSizingFromModel(model);
  const { patchSize: patch, imageMaxTokens: modelMax, minPixels, maxPixels } = sizing;
  const cap = targetTokens ?? modelMax;
  const aspect = height / Math.max(1, width);
  const targetTok = cap;
  const tokOf = (ww: number, hh: number) => pixelsToVisionTokens(ww, hh, patch);

  let w = initialPatchWidth(width, patch);
  let h = patchHeightForWidth(w, aspect, patch);

  while (tokOf(w, h) > targetTok && w > patch) {
    w -= patch;
    h = patchHeightForWidth(w, aspect, patch);
  }

  while (w * h < minPixels) {
    const nextW = w + patch;
    const nextH = patchHeightForWidth(nextW, aspect, patch);
    if (tokOf(nextW, nextH) > cap || nextW * nextH > maxPixels) break;
    w = nextW;
    h = nextH;
  }

  let tok = tokOf(w, h);
  const sourceMaxW = sourceMaxPatchWidth(width, patch);
  const widthFilledAt = (ww: number) => ww >= sourceMaxW - patch / 2;
  while (tok < targetTok && !widthFilledAt(w)) {
    const nextW = w + patch;
    if (nextW > sourceMaxW) break;
    const nextH = patchHeightForWidth(nextW, aspect, patch);
    const nextTok = tokOf(nextW, nextH);
    if (nextTok > cap || nextW * nextH > maxPixels) break;
    w = nextW;
    h = nextH;
    tok = nextTok;
  }

  return {
    width: w,
    height: h,
  };
}

/** @deprecated Use `fitVisionPixelBudget`. */
export const fitShowUIPixelBudget = fitVisionPixelBudget;

/**
 * SnapDOM width from element size only (not used for grounding coords).
 */
export function computeSnapdomCaptureWidth(
  element: HTMLElement,
  maxWidth: number = MAX_CAPTURE_WIDTH,
  { dprMax = CAPTURE_DPR_MAX, model = getCurrentModel() }: { dprMax?: number; model?: ModelCard } = {}
): number {
  const dpr = Math.min(dprMax, globalThis.devicePixelRatio ?? 1);
  const srcW = Math.max(1, Math.round((element.offsetWidth || 1) * dpr));
  const srcH = Math.max(1, Math.round((element.offsetHeight || 1) * dpr));
  const { width: targetW } = fitVisionPixelBudget(srcW, srcH, model);
  return Math.min(maxWidth, targetW);
}

/**
 * SnapDOM width for on-screen snapshot — matches live iframe CSS pixels (no vision downscale).
 * Vision resize for the model runs on the full bitmap afterward.
 * `element` is `#capture-target`.
 */
export function snapdomWidthForDisplay(
  element: HTMLElement | null | undefined,
  maxWidth: number = MAX_CAPTURE_WIDTH,
  frameClientWidth?: number
): number {
  const raw =
    element?.getBoundingClientRect?.().width ??
    element?.clientWidth ??
    frameClientWidth ??
    element?.offsetWidth ??
    1;
  return Math.min(maxWidth, Math.max(1, Math.round(raw)));
}

/**
 * Resize display canvas to integer iframe CSS size (1:1 snapshot, no CSS upscale blur).
 */
export function ensureCanvasDisplaySize(
  source: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number
): HTMLCanvasElement {
  const targetW = Math.max(1, Math.round(cssWidth));
  const targetH = Math.max(1, Math.round(cssHeight));
  
  // If aspect ratio is same, we prefer keeping the high-res source for sharpness.
  // We only resize if the requested CSS size doesn't match the source's aspect ratio.
  const sourceAspect = source.width / source.height;
  const targetAspect = targetW / targetH;
  
  if (Math.abs(sourceAspect - targetAspect) < 0.01) {
    return source;
  }

  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  if (!ctx) return source;
  const scaleX = targetW / source.width;
  const scaleY = targetH / source.height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return out;
}

/** @deprecated Use {@link ensureCanvasDisplaySize}. */
export function ensureCanvasDisplayWidth(
  source: HTMLCanvasElement,
  cssWidth: number
): HTMLCanvasElement {
  const targetH = Math.max(
    1,
    Math.round((Math.max(1, Math.round(cssWidth)) * source.height) / source.width)
  );
  return ensureCanvasDisplaySize(source, cssWidth, targetH);
}

/** Uniform-scale vision dimensions — alias for aspect-preserving {@link fitVisionPixelBudget}. */
export function uniformVisionDimensions(
  sourceWidth: number,
  sourceHeight: number,
  model: ModelCard = getCurrentModel()
): VisionDimensions {
  return fitVisionPixelBudget(sourceWidth, sourceHeight, model);
}

/**
 * Top-band crop height when full-page vision width is token-starved.
 * `planTokens` is the token budget used to evaluate crop benefit.
 * Returns crop height in source pixels, or null for full page.
 */
export function planTopVisionCropHeight(
  sourceWidth: number,
  sourceHeight: number,
  model: ModelCard = getCurrentModel(),
  planTokens?: number
): number | null {
  const patch = model.patch_size ?? VL_PATCH_SIZE;
  const planTok =
    planTokens ?? model.image_max_tokens ?? visionSizingFromModel(model).imageMaxTokens;
  const fullVision = fitVisionPixelBudget(sourceWidth, sourceHeight, model, planTok);
  const maxW = sourceMaxPatchWidth(sourceWidth, patch);
  if (fullVision.width >= maxW - patch / 2) return null;

  let bestCropH = sourceHeight;
  let bestVisionW = fullVision.width;
  const minCropH = Math.max(patch, sourceWidth);
  for (let cropH = sourceHeight; cropH >= minCropH; cropH -= patch) {
    const v = fitVisionPixelBudget(sourceWidth, cropH, model, planTok);
    if (v.width > bestVisionW) {
      bestVisionW = v.width;
      bestCropH = cropH;
    }
  }
  if (bestCropH >= sourceHeight || bestVisionW <= fullVision.width) return null;
  return bestCropH;
}

/**
 * Crop + token target for one capture — min tokens when they fill width; max only when needed.
 */
export function resolveVisionCapturePlan(
  sourceWidth: number,
  sourceHeight: number,
  model: ModelCard = getCurrentModel()
): VisionCapturePlan {
  const minTok = model.image_min_tokens ?? VL_IMAGE_MIN_TOKENS;
  const maxTok = model.image_max_tokens ?? VL_IMAGE_MAX_TOKENS;
  const patch = model.patch_size ?? VL_PATCH_SIZE;
  const maxW = sourceMaxPatchWidth(sourceWidth, patch);
  const widthFilled = (w: number) => w >= maxW - patch / 2;
  const widthStarved = (w: number) => visionWidthStarved(w, maxW, patch);

  const fullAtMin = fitVisionPixelBudget(sourceWidth, sourceHeight, model, minTok);
  if (widthFilled(fullAtMin.width)) {
    return { cropHeight: null, tokenTarget: minTok, visionCrop: null };
  }

  // Wide form pages: full-frame at max tokens (700px) — no top crop that would clip bottom actions.
  if (!widthStarved(fullAtMin.width) && maxTok > minTok) {
    const fullAtMax = fitVisionPixelBudget(sourceWidth, sourceHeight, model, maxTok);
    if (widthFilled(fullAtMax.width)) {
      return { cropHeight: null, tokenTarget: maxTok, visionCrop: null };
    }
  }

  if (!widthStarved(fullAtMin.width)) {
    return { cropHeight: null, tokenTarget: minTok, visionCrop: null };
  }

  if (preferFullFrameOverTopCrop(sourceWidth, sourceHeight)) {
    return {
      cropHeight: null,
      tokenTarget: maxTok > minTok ? maxTok : minTok,
      visionCrop: null,
    };
  }

  const cropAtMin = planTopVisionCropHeight(sourceWidth, sourceHeight, model, minTok);
  if (cropAtMin != null) {
    const bandAtMin = fitVisionPixelBudget(sourceWidth, cropAtMin, model, minTok);
    if (widthFilled(bandAtMin.width)) {
      const cropAtMax =
        maxTok > minTok ? planTopVisionCropHeight(sourceWidth, sourceHeight, model, maxTok) : null;
      if (cropAtMax != null && cropAtMax > cropAtMin) {
        const bandAtMaxMin = fitVisionPixelBudget(sourceWidth, cropAtMax, model, minTok);
        if (!widthFilled(bandAtMaxMin.width)) {
          const bandAtMaxMax = fitVisionPixelBudget(sourceWidth, cropAtMax, model, maxTok);
          if (widthFilled(bandAtMaxMax.width)) {
            return {
              cropHeight: cropAtMax,
              tokenTarget: maxTok,
              visionCrop: { x0: 0, y0: 0, x1: 1, y1: cropAtMax / sourceHeight },
            };
          }
        }
      }
      return {
        cropHeight: cropAtMin,
        tokenTarget: minTok,
        visionCrop: { x0: 0, y0: 0, x1: 1, y1: cropAtMin / sourceHeight },
      };
    }
  }

  if (maxTok <= minTok) {
    return {
      cropHeight: cropAtMin,
      tokenTarget: minTok,
      visionCrop:
        cropAtMin != null
          ? { x0: 0, y0: 0, x1: 1, y1: cropAtMin / sourceHeight }
          : null,
    };
  }

  const cropAtMax = planTopVisionCropHeight(sourceWidth, sourceHeight, model, maxTok);
  return {
    cropHeight: cropAtMax,
    tokenTarget: maxTok,
    visionCrop:
      cropAtMax != null
        ? { x0: 0, y0: 0, x1: 1, y1: cropAtMax / sourceHeight }
        : null,
  };
}

/**
 * Normalized rect of the top band sent to the VLM (full capture coords).
 */
export function planTopVisionCropRect(
  sourceWidth: number,
  sourceHeight: number,
  model: ModelCard = getCurrentModel()
): VisionCropRect | null {
  return resolveVisionCapturePlan(sourceWidth, sourceHeight, model).visionCrop;
}

/**
 * Map model norm coords on the vision crop back to full-capture norm space.
 */
export function remapVisionNormToCaptureNorm(
  point: VisionNormPoint | null | undefined,
  rect: VisionCropRect | null | undefined
): VisionNormPoint | null | undefined {
  if (!point || !rect) return point;
  return {
    x: rect.x0 + point.x * (rect.x1 - rect.x0),
    y: rect.y0 + point.y * (rect.y1 - rect.y0),
  };
}

function cropCanvasTop(source: VisionImageSource, cropHeight: number): VisionImageSource {
  const sw = source.width;
  const sh = source.height;
  const ch = Math.min(sh, Math.max(1, Math.round(cropHeight)));
  if (ch >= sh) return source;
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0, sw, ch, 0, 0, sw, ch);
  return canvas;
}

async function resizeCanvasUniform(
  source: VisionImageSource,
  width: number,
  targetH: number
): Promise<VisionImageSource> {
  if (width === source.width && targetH === source.height) {
    return source instanceof HTMLCanvasElement ? source : source;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, targetH);
    return canvas;
  }
  return await createImageBitmap(source, {
    resizeWidth: width,
    resizeHeight: targetH,
    resizeQuality: 'high',
  });
}

/**
 * Resize capture for VLM — optional top-band crop when token budget squeezes width.
 */
export async function prepareVisionCapture(
  source: VisionImageSource,
  model: ModelCard = getCurrentModel()
): Promise<VisionCaptureResult> {
  const sw = source.width;
  const sh = source.height;
  const { cropHeight, tokenTarget, visionCrop } = resolveVisionCapturePlan(sw, sh, model);
  const cropped = cropHeight != null ? cropCanvasTop(source, cropHeight) : source;
  const { width, height: targetH } = fitVisionPixelBudget(
    cropped.width,
    cropped.height,
    model,
    tokenTarget
  );
  const canvas = await resizeCanvasUniform(cropped, width, targetH);
  return { canvas, visionCrop, tokenTarget };
}

/** Resize a canvas — uniform scale preserving capture aspect (with token-budget top crop). */
export async function canvasToVisionSize(
  source: VisionImageSource,
  model: ModelCard = getCurrentModel()
): Promise<VisionImageSource> {
  const { canvas } = await prepareVisionCapture(source, model);
  return canvas;
}

/** @deprecated Use `canvasToVisionSize`. */
export const canvasToShowUISize = canvasToVisionSize;

/** @deprecated Use `pixelsToVisionTokens`. */
export const pixelsToShowUITokens = (w: number, h: number) => pixelsToVisionTokens(w, h);
