#!/usr/bin/env node
/**
 * HEAD-check every registry model source URL (LLM + mmproj).
 * Usage: node scripts/verify-model-urls.mjs
 * Exit 1 if any model fails without HF_TOKEN when requiresHfToken is set.
 */
import { MODELS } from '../src/config/models/registry.ts';
import { resolveGgufSource, probeUrl } from './hf-resolve-gguf.mjs';

/** @param {typeof MODELS[number]} model */
async function checkModel(model) {
  if (model.noGgufMirror) {
    return {
      id: model.id,
      repo: 'n/a',
      llm: 0,
      mm: 0,
      ok: true,
      nameOk: true,
      requiresHfToken: false,
      error: null,
      skipped: true,
    };
  }
  try {
    const resolved = await resolveGgufSource(model);
    const llmName = resolved.url.split('/').pop() ?? '';
    const mmName = resolved.mmprojUrl?.split('/').pop() ?? '';
    const llm = await probeUrl(resolved.url);
    const mm = resolved.mmprojUrl ? await probeUrl(resolved.mmprojUrl) : 200;
    const nameOk =
      model.llmFileRe.test(llmName) &&
      (!resolved.mmprojUrl || model.mmprojFileRe.test(mmName));
    const ok = llm === 200 && mm === 200 && nameOk;
    return {
      id: model.id,
      repo: resolved.repo,
      llm,
      mm,
      ok,
      nameOk,
      requiresHfToken: resolved.requiresHfToken,
      error: null,
    };
  } catch (err) {
    return {
      id: model.id,
      repo: '?',
      llm: 0,
      mm: 0,
      ok: false,
      nameOk: false,
      requiresHfToken: !!model.requiresHfToken,
      error: err.message,
    };
  }
}

const rows = [];
for (const model of MODELS) {
  rows.push(await checkModel(model));
}

const hasToken = !!(process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN);
console.log('[verify:models] HF_TOKEN:', hasToken ? 'set' : 'not set');
console.log('id                         repo → llm mm  ok  gated');
for (const r of rows) {
  if (r.skipped) {
    console.log(`${r.id.padEnd(26)} SKIP no GGUF mirror`);
    continue;
  }
  if (r.error) {
    console.log(`${r.id.padEnd(26)} FAIL ${r.error.slice(0, 60)}`);
    continue;
  }
  console.log(
    `${r.id.padEnd(26)} ${r.repo.slice(0, 32).padEnd(34)} ${String(r.llm).padEnd(4)} ${String(r.mm).padEnd(4)} ${r.ok ? 'yes' : 'NO '} ${r.requiresHfToken ? 'yes' : 'no'}`
  );
}

const publicOk = rows
  .filter((r) => r.ok && !r.requiresHfToken && !r.skipped)
  .map((r) => r.id);
const failedPublic = rows.filter(
  (r) => !r.skipped && !r.ok && !r.requiresHfToken && !r.error?.includes('HF_TOKEN')
);
const failedGated = rows.filter((r) => r.error?.includes('HF_TOKEN') || (!r.ok && r.requiresHfToken));

console.log('\n[verify:models] Public OK:', publicOk.join(', ') || '(none)');
if (failedPublic.length) {
  console.error('[verify:models] Public FAIL:', failedPublic.map((r) => r.id).join(', '));
  process.exit(1);
}
if (failedGated.length && !hasToken) {
  console.warn(
    '[verify:models] Gated (need HF_TOKEN):',
    failedGated.map((r) => r.id).join(', ')
  );
}
const brokenGated = failedGated.filter((r) => r.llm === 404 || r.mm === 404);
if (brokenGated.length && hasToken) {
  console.error(
    '[verify:models] Gated but 404 (wrong filename/repo):',
    brokenGated.map((r) => r.id).join(', ')
  );
  process.exit(1);
}
