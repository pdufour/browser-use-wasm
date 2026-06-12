#!/usr/bin/env node
/** Cache every model in PUBLIC_CACHE_MODEL_IDS (open Hugging Face GGUF downloads). */
import { cacheModel } from './cache-model.mjs';
import { PUBLIC_CACHE_MODEL_IDS } from '../src/config/models/registry.ts';

for (const modelId of PUBLIC_CACHE_MODEL_IDS) {
  await cacheModel({ modelId });
}

console.log(`[cache:public] Done — ${PUBLIC_CACHE_MODEL_IDS.length} models`);
