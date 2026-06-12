import { DEFAULT_MODEL_ID } from '../config/vl.ts';
import { getCurrentModel } from '../config/models/registry.ts';
import { SHOWUI_MODEL_SOURCE, assertShowUIModelSource } from '../config/models/ShowUI-2B.ts';
import type { ModelCard, ModelSource } from '../config/models/types.ts';

/** One GGUF file entry inside /model-cache/manifest.json. */
export interface ManifestFileEntry {
  name: string;
  url?: string;
  size?: number;
}

/** Files for one cached model (`llm` required at runtime, `mmproj` optional). */
export interface ManifestFiles {
  llm?: ManifestFileEntry;
  mmproj?: ManifestFileEntry;
}

/** manifest.json written by `npm run cache:model` (v1: single model; v2: multi-model map). */
export interface ModelCacheManifest {
  version?: number;
  model?: string;
  files?: ManifestFiles;
  models?: Record<string, { files?: ManifestFiles } | undefined>;
}

/** @param baseURI Page/worker location.href */
async function loadManifest(baseURI: string): Promise<ModelCacheManifest | null> {
  try {
    const cacheUrl = new URL('/model-cache/manifest.json', baseURI);
    const res = await fetch(cacheUrl);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function manifestEntryForModel(
  manifest: ModelCacheManifest | null,
  modelId: string
): { model: string; files: ManifestFiles } | null {
  if (!manifest) return null;
  const versioned = manifest.models?.[modelId];
  if (manifest.version === 2 && versioned?.files) {
    return { model: modelId, files: versioned.files };
  }
  if (manifest.model === modelId && manifest.files) {
    return { model: modelId, files: manifest.files };
  }
  return null;
}

export async function getLocalModelUrls(
  baseURI: string,
  forcedModelId: string | null = null
): Promise<ModelSource | null> {
  const model = getCurrentModel(forcedModelId);
  const manifest = await loadManifest(baseURI);
  const entry = manifestEntryForModel(manifest, model.id);
  if (!entry?.files?.llm?.name) return null;
  if (!model.llmFileRe!.test(entry.files.llm.name)) return null;

  const base = new URL('/model-cache/', baseURI);
  const sources: ModelSource = {
    url: new URL(entry.files.llm.name, base).href,
  };
  if (entry.files.mmproj?.name) {
    if (!model.mmprojFileRe!.test(entry.files.mmproj.name)) return null;
    sources.mmprojUrl = new URL(entry.files.mmproj.name, base).href;
  }
  return sources;
}

/** Trust manifest from `npm run cache:model` (0.0.1: llm size only — mmproj optional). */
export function manifestFilesReady(
  entry: { files?: ManifestFiles } | null | undefined
): boolean {
  const llm = entry?.files?.llm;
  return !!(llm?.name && typeof llm.size === 'number' && llm.size > 0);
}

/**
 * Model ids with a complete manifest entry (same-origin cache via `npm run cache:model`).
 */
export async function loadCachedModelIds(
  baseURI: string = typeof location !== 'undefined' ? location.href : ''
): Promise<Set<string>> {
  const manifest = await loadManifest(baseURI);
  if (!manifest) return new Set();
  if (manifest.version === 2 && manifest.models) {
    return new Set(
      Object.entries(manifest.models)
        .filter(([, entry]) => manifestFilesReady(entry))
        .map(([id]) => id)
    );
  }
  if (manifest.model && manifestFilesReady(manifest)) {
    return new Set([manifest.model]);
  }
  return new Set();
}

export async function resolveLocalModelSource(
  baseURI: string,
  forcedModelId: string | null = null
): Promise<ModelSource | null> {
  const model = getCurrentModel(forcedModelId);
  const manifest = await loadManifest(baseURI);
  const entry = manifestEntryForModel(manifest, model.id);
  if (!manifestFilesReady(entry)) return null;
  return getLocalModelUrls(baseURI, forcedModelId);
}

export function assertModelSource(source: ModelSource, model: ModelCard): void {
  const llmFile = new URL(source.url).pathname.split('/').pop() ?? '';
  if (!model.llmFileRe!.test(llmFile)) {
    throw new Error(
      `Invalid LLM weights for ${model.label} (expected ${model.llmFileRe}, got "${llmFile}"). Run: npm run cache:model -- --model ${model.id}`
    );
  }
  if (source.mmprojUrl) {
    const mmprojFile = new URL(source.mmprojUrl).pathname.split('/').pop() ?? '';
    if (!model.mmprojFileRe!.test(mmprojFile)) {
      throw new Error(
        `Invalid vision projector for ${model.label} (expected ${model.mmprojFileRe}, got "${mmprojFile}").`
      );
    }
  }
}

async function describeCacheMiss(baseURI: string, modelId: string): Promise<string> {
  const manifest = await loadManifest(baseURI);
  if (!manifest) {
    return (
      `Could not read /model-cache/manifest.json from ${baseURI} — run npm run dev (or preview), not file://.`
    );
  }
  const entry = manifestEntryForModel(manifest, modelId);
  if (!entry?.files?.llm?.name) {
    return `No manifest entry for ${modelId}.`;
  }
  if (!manifestFilesReady(entry)) {
    return `Manifest entry for ${modelId} is incomplete (missing llm/mmproj sizes).`;
  }
  return `Manifest entry for ${modelId} failed validation.`;
}

async function cacheMissError(baseURI: string, model: ModelCard): Promise<never> {
  const detail = await describeCacheMiss(baseURI, model.id);
    const tokenHint = model.requiresHfToken ? ' Set HF_TOKEN for gated repos.' : '';
    const remoteHint =
      canDownloadModelInBrowser(model) && !isRemoteModelLoadEnabled()
        ? ' Remote download is off (?cacheOnly=1 or ?e2e=1).'
        : '';
  throw new Error(
    `Model ${model.id} not found in cache. ${detail} Run: npm run cache:model -- --model ${model.id}` +
      ' (or npm run cache:repair if GGUF files are already in .model-cache/).' +
      tokenHint +
      remoteHint
  );
}

export type ModelSourceOrigin = 'cache' | 'remote';

/** Pre-cached same-origin `/model-cache/` is preferred; public models may download from HF on demand. */
export function isRemoteModelLoadEnabled(): boolean {
  if (typeof location === 'undefined') return true;
  const params = new URLSearchParams(location.search);
  if (params.get('cacheOnly') === '1') return false;
  // E2E keeps cache-only semantics (uncached picker revert, fast gate).
  if (params.has('e2e')) return false;
  return true;
}

/** Public registry models can stream GGUFs from Hugging Face when not pre-cached. */
export function canDownloadModelInBrowser(model: ModelCard): boolean {
  return !model.requiresHfToken && !!model.source?.url && !!model.llmFileRe;
}

function registryRemoteSource(model: ModelCard): ModelSource {
  return model.id === DEFAULT_MODEL_ID ? SHOWUI_MODEL_SOURCE : model.source;
}

/**
 * Resolve GGUF URLs: same-origin `/model-cache/` first, then registry HF URLs when allowed.
 */
export async function resolveRegistryModelSource(
  baseURI: string,
  forcedModelId: string | null = null
): Promise<ModelSource> {
  const { source } = await resolveRegistryModelSourceDetailed(baseURI, forcedModelId);
  return source;
}

export async function resolveRegistryModelSourceDetailed(
  baseURI: string,
  forcedModelId: string | null = null
): Promise<{ source: ModelSource; origin: ModelSourceOrigin }> {
  const model = getCurrentModel(forcedModelId);
  const local = await resolveLocalModelSource(baseURI, forcedModelId);
  if (local) {
    assertModelSource(local, model);
    return { source: local, origin: 'cache' };
  }
  if (!isRemoteModelLoadEnabled() || !canDownloadModelInBrowser(model)) {
    return cacheMissError(baseURI, model);
  }
  const remote = registryRemoteSource(model);
  if (model.id === DEFAULT_MODEL_ID) {
    assertShowUIModelSource(remote);
  } else {
    assertModelSource(remote, model);
  }
  return { source: remote, origin: 'remote' };
}
