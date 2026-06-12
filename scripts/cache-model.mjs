#!/usr/bin/env node
/**
 * Download GGUF + mmproj into .model-cache/ (gitignored).
 * v2 manifest holds one entry per model id (multi-model registry).
 */
import fs from 'fs';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';
import { fileURLToPath } from 'url';
import { MODELS, getModelById, PUBLIC_CACHE_MODEL_IDS } from '../src/config/models/registry.ts';
import { DEFAULT_MODEL_ID } from '../src/config/vl.ts';
import { resolveGgufSource, probeUrl } from './hf-resolve-gguf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MODEL_CACHE_DIR = path.join(__dirname, '..', '.model-cache');
const MANIFEST_PATH = path.join(MODEL_CACHE_DIR, 'manifest.json');

function hfFetchHeaders() {
  const token = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Transient network only — 404/401/etc. fail once (HEAD + GET). */
const DOWNLOAD_RETRIES = 2;
/** HEAD / manifest probes only — not multi-GB GET bodies. */
const FETCH_TIMEOUT_MS = 120_000;
/** Whole-file GET (UI-Venus Q4 ~1.3 GB, BF16 ~4 GB); stall abort is separate. */
const DOWNLOAD_FETCH_TIMEOUT_MS = 60 * 60_000;
const DOWNLOAD_STALL_MS = 120_000;

async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: ac.signal,
      headers: { ...hfFetchHeaders(), ...init.headers },
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isPermanentHttpStatus(status) {
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 410;
}

async function downloadFile(url, dest, onProgress, { retries = DOWNLOAD_RETRIES } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, DOWNLOAD_FETCH_TIMEOUT_MS);
      if (!res.ok) {
        const hint =
          res.status === 401 || res.status === 403
            ? ' — set HF_TOKEN for gated Hugging Face repos'
            : '';
        const err = new Error(`Download failed (${res.status})${hint}: ${url}`);
        if (isPermanentHttpStatus(res.status)) err.noRetry = true;
        throw err;
      }
      const total = Number(res.headers.get('content-length') || 0);
      const tmp = `${dest}.part`;
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

      const body = res.body
        ? Readable.fromWeb(res.body)
        : Readable.from(Buffer.from(await res.arrayBuffer()));

      let loaded = 0;
      let lastByteAt = Date.now();
      const stallTimer = setInterval(() => {
        if (Date.now() - lastByteAt > DOWNLOAD_STALL_MS) {
          body.destroy(new Error(`Download stalled (no data for ${DOWNLOAD_STALL_MS / 1000}s)`));
        }
      }, 10_000);

      body.on('data', (chunk) => {
        loaded += chunk.length;
        lastByteAt = Date.now();
        onProgress?.(loaded, total || loaded);
      });

      try {
        await pipeline(body, createWriteStream(tmp));
      } finally {
        clearInterval(stallTimer);
      }
      fs.renameSync(tmp, dest);
      return fs.statSync(dest).size;
    } catch (err) {
      if (err.noRetry) throw err;
      if (attempt >= retries) throw err;
      console.warn(`[cache:model] retry ${attempt}/${retries - 1}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error('unreachable');
}

function fileNameFromUrl(url) {
  const u = new URL(url);
  return path.basename(u.pathname);
}

/** @returns {Record<string, { source: object; files: Record<string, { name: string; url: string; size: number }> }>} */
function readManifestModels() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    if (raw?.version === 2 && raw.models) return { ...raw.models };
    if (raw?.model && raw.files) {
      return {
        [raw.model]: { source: raw.source, files: raw.files },
      };
    }
  } catch {
    /* rebuild */
  }
  return {};
}

/** @param {Record<string, { files?: Record<string, { name?: string }> }>} models */
function allCachedFileNames(models) {
  const names = new Set(['manifest.json']);
  for (const entry of Object.values(models)) {
    for (const f of Object.values(entry.files ?? {})) {
      if (f?.name) names.add(f.name);
    }
  }
  return names;
}

/**
 * @param {ReturnType<typeof getModelById>} model
 * @param {{ key: string; url: string }[]} files
 */
async function assertSourcesReachable(model, files) {
  const hasToken = !!(process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN);
  for (const { key, url } of files) {
    const status = await probeUrl(url);
    if (status === 200) continue;

    if (status === 401 || status === 403) {
      if (model.requiresHfToken && !hasToken) {
        throw new Error(
          `${model.id} requires HF_TOKEN (gated Hugging Face repo). Export HF_TOKEN=hf_… then retry.`
        );
      }
      throw new Error(`Auth failed (${status}) for ${model.id} ${key}: ${url}`);
    }
    if (status === 404) {
      throw new Error(
        `Broken URL (404) for ${model.id} ${key}. Fix src/config/models/*.js — run: npm run verify:models`
      );
    }
    throw new Error(`Unreachable (${status}) for ${model.id} ${key}: ${url}`);
  }
}

function purgeStaleCacheFiles(keepNames) {
  const keep = new Set(keepNames);
  if (!fs.existsSync(MODEL_CACHE_DIR)) return;
  for (const name of fs.readdirSync(MODEL_CACHE_DIR)) {
    if (keep.has(name)) continue;
    if (name.endsWith('.gguf') || name.endsWith('.part')) {
      fs.unlinkSync(path.join(MODEL_CACHE_DIR, name));
      console.log(`[cache:model] Removed stale ${name}`);
    }
  }
}

/**
 * Register GGUF files already on disk into manifest.json (e.g. after interrupted cache:all).
 * @param {string} [onlyModelId]
 * @returns {boolean} true if manifest was updated
 */
export function repairManifestFromDisk(onlyModelId = null) {
  if (!fs.existsSync(MODEL_CACHE_DIR)) return false;
  const names = fs
    .readdirSync(MODEL_CACHE_DIR)
    .filter((n) => n.endsWith('.gguf') && !n.endsWith('.part'));
  if (!names.length) return false;

  const models = readManifestModels();
  let changed = false;
  const targets = onlyModelId
    ? [getModelById(onlyModelId)]
    : MODELS;

  for (const model of targets) {
    const preferLlm = model.source?.url ? fileNameFromUrl(model.source.url) : null;
    const preferMm = model.source?.mmprojUrl ? fileNameFromUrl(model.source.mmprojUrl) : null;

    const llmName =
      (preferLlm && names.includes(preferLlm) && model.llmFileRe.test(preferLlm)
        ? preferLlm
        : null) ??
      names.find((n) => model.llmFileRe.test(n) && !/mmproj/i.test(n));
    const mmprojName =
      (preferMm && names.includes(preferMm) && model.mmprojFileRe.test(preferMm)
        ? preferMm
        : null) ??
      names.find((n) => model.mmprojFileRe.test(n) && /mmproj/i.test(n));

    if (!llmName || !mmprojName) continue;

    const llmPath = path.join(MODEL_CACHE_DIR, llmName);
    const mmPath = path.join(MODEL_CACHE_DIR, mmprojName);
    if (!fs.existsSync(llmPath) || !fs.existsSync(mmPath)) continue;

    const llmSize = fs.statSync(llmPath).size;
    const mmSize = fs.statSync(mmPath).size;
    const prev = models[model.id]?.files;
    if (
      prev?.llm?.name === llmName &&
      prev?.llm?.size === llmSize &&
      prev?.mmproj?.name === mmprojName &&
      prev?.mmproj?.size === mmSize
    ) {
      continue;
    }

    const source = model.source ?? {
      url: `https://huggingface.co/${model.ggufRepo ?? 'unknown'}/resolve/main/${llmName}`,
      mmprojUrl: `https://huggingface.co/${model.ggufRepo ?? 'unknown'}/resolve/main/${mmprojName}`,
    };
    models[model.id] = {
      source,
      files: {
        llm: { name: llmName, url: source.url, size: llmSize },
        mmproj: { name: mmprojName, url: source.mmprojUrl, size: mmSize },
      },
    };
    changed = true;
    console.log(`[cache:model] Repaired manifest for ${model.id} (${llmName}, ${mmprojName})`);
  }

  if (changed) {
    fs.mkdirSync(MODEL_CACHE_DIR, { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ version: 2, models }, null, 2));
  }
  return changed;
}

/**
 * @param {{ modelId?: string; force?: boolean }} opts
 */
export async function cacheModel({ modelId = DEFAULT_MODEL_ID, force = false } = {}) {
  const model = getModelById(modelId);
  repairManifestFromDisk(model.id);
  console.log(`[cache:model] Resolving GGUF URLs for ${model.id}…`);
  const resolved = await resolveGgufSource(model);
  if (resolved.requiresHfToken && !(process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN)) {
    throw new Error(
      `${model.id} requires HF_TOKEN (gated Hugging Face repo ${resolved.repo}). Export HF_TOKEN=hf_…`
    );
  }

  const source = { url: resolved.url, mmprojUrl: resolved.mmprojUrl };
  const files = [
    { key: 'llm', url: source.url },
    { key: 'mmproj', url: source.mmprojUrl },
  ].filter((f) => f.url);

  await assertSourcesReachable(model, files);

  fs.mkdirSync(MODEL_CACHE_DIR, { recursive: true });

  const models = readManifestModels();
  const entry = models[model.id] ?? { source, files: {} };

  if (!force) {
    const complete = files.every(({ key, url }) => {
      const fileEntry = entry.files?.[key];
      const name = fileNameFromUrl(url);
      const dest = path.join(MODEL_CACHE_DIR, name);
      const nameOk =
        key === 'llm'
          ? model.llmFileRe.test(name)
          : key === 'mmproj'
            ? model.mmprojFileRe.test(name)
            : true;
      return (
        fileEntry?.url === url &&
        fileEntry?.name === name &&
        nameOk &&
        fs.existsSync(dest) &&
        fs.statSync(dest).size === fileEntry.size
      );
    });
    if (complete) {
      console.log(`[cache:model] ${model.id} already in .model-cache/`);
      entry.source = source;
      entry.resolvedRepo = resolved.repo;
      models[model.id] = entry;
      const manifest = { version: 2, models };
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
      return manifest;
    }
  }

  console.log(`[cache:model] Caching ${model.label} (${model.id})…`);

  for (const { key, url } of files) {
    const name = fileNameFromUrl(url);
    if (key === 'llm' && !model.llmFileRe.test(name)) {
      throw new Error(`LLM filename does not match ${model.id}: ${name}`);
    }
    if (key === 'mmproj' && !model.mmprojFileRe.test(name)) {
      throw new Error(`mmproj filename does not match ${model.id}: ${name}`);
    }
    const dest = path.join(MODEL_CACHE_DIR, name);
    if (!force && fs.existsSync(dest)) {
      const size = fs.statSync(dest).size;
      const label = key === 'llm' ? 'LLM' : 'Vision projector';
      console.log(`[cache:model] ${label} already present (${(size / 1e6).toFixed(0)} MB)`);
      entry.files[key] = { name, url, size };
      continue;
    }

    const label = key === 'llm' ? 'LLM' : 'Vision projector';
    console.log(`[cache:model] Downloading ${label} for ${model.id}…`);
    let lastPct = -1;
    const size = await downloadFile(url, dest, (loaded, total) => {
      const pct = total > 0 ? Math.floor((loaded / total) * 100) : 0;
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        process.stdout.write(`  ${pct}%\n`);
      }
    });
    console.log(`[cache:model] Saved ${label} (${(size / 1e6).toFixed(0)} MB)`);
    entry.files[key] = { name, url, size };
  }

  entry.source = source;
  entry.resolvedRepo = resolved.repo;

  models[model.id] = entry;
  // Drop only GGUFs not listed in manifest (keeps every model from cache:all / prior cache:model runs).
  purgeStaleCacheFiles(allCachedFileNames(models));
  const manifest = { version: 2, models };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`[cache:model] Done → .model-cache/ (${model.id})`);
  return manifest;
}

/** Drop manifest rows for ids removed from the registry. */
function pruneStaleManifestEntries() {
  const models = readManifestModels();
  const valid = new Set(MODELS.map((m) => m.id));
  let changed = false;
  for (const id of Object.keys(models)) {
    if (valid.has(id)) continue;
    delete models[id];
    changed = true;
    console.log(`[cache:model] Pruned stale manifest entry: ${id}`);
  }
  if (!changed) return;
  fs.mkdirSync(MODEL_CACHE_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ version: 2, models }, null, 2));
}

/** Cache every model in the registry (for multi-model E2E). */
export async function cacheAllModels({ force = false } = {}) {
  pruneStaleManifestEntries();
  const hasToken = !!(process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN);
  const targets = hasToken ? MODELS : MODELS.filter((m) => !m.requiresHfToken);
  if (!hasToken) {
    console.log(
      `[cache:model] No HF_TOKEN — caching ${targets.length} public models only (use HF_TOKEN for gated).`
    );
  }
  const skipped = [];
  const cached = [];
  const failures = [];
  for (const model of targets) {
    try {
      await cacheModel({ modelId: model.id, force });
      cached.push(model.id);
    } catch (err) {
      failures.push({ id: model.id, message: err.message });
      console.warn(`[cache:model] SKIP ${model.id}: ${err.message}`);
    }
  }
  console.log(
    `[cache:model] Done — cached ${cached.length}, skipped (no mirror) ${skipped.length}, failed ${failures.length}`
  );
  if (cached.length) console.log(`[cache:model] Cached: ${cached.join(', ')}`);
  if (skipped.length) console.log(`[cache:model] No GGUF: ${skipped.join(', ')}`);
  if (failures.length) {
    console.warn(
      `[cache:model] Failed: ${failures.map((f) => f.id).join(', ')}. Use npm run cache:public for the stable set: ${PUBLIC_CACHE_MODEL_IDS.join(', ')}`
    );
  }
  if (failures.length === MODELS.length) {
    throw new Error('No models cached');
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const force = process.argv.includes('--force');
  const all = process.argv.includes('--all');
  const repair = process.argv.includes('--repair');
  const modelIdx = process.argv.indexOf('--model');
  const modelId = modelIdx !== -1 ? process.argv[modelIdx + 1] : DEFAULT_MODEL_ID;

  if (repair) {
    pruneStaleManifestEntries();
    const ok = repairManifestFromDisk(modelIdx !== -1 ? modelId : null);
    if (!ok) {
      console.log('[cache:model] No manifest repairs needed (or no matching GGUF files on disk).');
    }
    process.exit(0);
  }

  const run = all ? cacheAllModels({ force }) : cacheModel({ modelId, force });
  run.catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
