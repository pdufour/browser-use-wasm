/**
 * Public embed API: add browser-use to a website.
 *
 * High level — `createWebOperator()` then `operator.instruct('…')` (capture →
 * ShowUI navigation inference in a WASM worker → execute on the live page).
 * Lower-level pieces are exported for custom pipelines.
 */

export { createWebOperator, WebOperator } from './operator.ts';
export type {
  WebOperatorOptions,
  OperatorLoadOptions,
  OperatorLoadResult,
  OperatorCapture,
  ExecutedStep,
  InstructOptions,
  InstructPendingStep,
  InstructResult,
  LocateResult,
} from './operator.ts';

// Inference
export { WllamaWorkerClient, CaptureWorkerClient } from './wllama/client.ts';
export { runNavigation } from './actions/navigation.ts';
export type {
  NavigationAction,
  NavigationResult,
  CompletionClient,
} from './actions/navigation.ts';
export type { GroundingPoint } from './actions/parse-coords.ts';

// Capture
export {
  snapdomCaptureToCanvas,
  snapdomCanvasToCssSize,
  prepareCaptureDimensions,
} from './snapdom/capture.ts';
export { prepareVisionCapture, remapVisionNormToCaptureNorm } from './snapdom/vision-resize.ts';
export type { VisionCropRect } from './snapdom/vision-resize.ts';

// Browser tools (DOM execution)
export {
  setBrowserToolDocument,
  triggerActionAtNorm,
  typeAtNorm,
  selectOptionAtNorm,
  toggleCheckboxAtNorm,
  clearAtNorm,
  focusAtNorm,
  blurAtNorm,
  pressKey,
  scrollPage,
  scrollToElement,
  resetScrollForCapture,
} from './browser-tools/dom-actions.ts';
export { BROWSER_TOOL_DEFINITIONS } from './browser-tools/catalog.ts';

// Environment gating — what can load and run in this browser
export {
  getWllamaEnvIssues,
  hasMainThreadWebGpu,
  deviceMemoryGb,
} from './env/capabilities.ts';
export {
  canLoadVlModelInBrowser,
  browserLoadBlockReason,
  experimentalLoadAdvisory,
  allowExperimentalVlLoadInBrowser,
  resolveModelLoadCaps,
} from './env/model-gating.ts';
export type { ModelLoadCaps } from './env/model-gating.ts';

// Models / config
export {
  MODELS,
  getModelById,
  getCurrentModel,
  BROWSER_VALIDATED_MODEL_IDS,
  DEFAULT_MODEL_ID,
} from './config/models/registry.ts';
export type { ModelCard } from './config/models/types.ts';
export {
  WASM_URL,
  resolveWasmUrl,
  INFERENCE_TIMEOUT_MS,
  AUTO_LOAD_MODEL,
  resolveLlamaLogLevel,
} from './config/vl.ts';
export {
  MODEL_SWITCHER_ID,
  MODEL_SWITCHER_TEST_ID,
  MODEL_STATUS_ID,
  PROMPT_INPUT_ID,
  BTN_TASK_ID,
} from './config/operator-ui.ts';
export {
  loadCachedModelIds,
  canDownloadModelInBrowser,
  isRemoteModelLoadEnabled,
  resolveRegistryModelSourceDetailed,
} from './wllama/model-sources.ts';
export type { ModelSourceOrigin } from './wllama/model-sources.ts';

// Screenshot click-marker overlay
export { drawMarker, clearMarker } from './ui/marker.ts';

// Embedded browser frame (iframe chrome for demos / embeds)
export {
  setBrowseHomePath,
  getBrowseHomePath,
  getBrowseFrame,
  getBrowseDocument,
  getCaptureElement,
  navigateBrowseFrame,
  waitForBrowseFrameReady,
} from './ui/browse-frame.ts';

// Voice
export { createVoiceNavController } from './voice/controller.ts';
export type { CursorTourStep } from './voice/cursor-tour.ts';

// Debug / perf instrumentation
export { createPerfTracker, logPerfEvent } from './util/perf.ts';
export { attachPerfHud } from './util/runtime-hints.ts';
