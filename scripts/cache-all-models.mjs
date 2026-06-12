import { MODELS } from '../src/config/models/registry.ts';
import { cacheModel } from './cache-model.mjs';

async function run() {
  console.log(`Caching all ${MODELS.length} models...`);
  for (const model of MODELS) {
    try {
      console.log(`\n--- Caching ${model.id} ---`);
      await cacheModel({ modelId: model.id });
    } catch (err) {
      console.error(`Failed to cache ${model.id}: ${err.message}`);
    }
  }
  console.log('\nAll caching tasks completed.');
}

run();
