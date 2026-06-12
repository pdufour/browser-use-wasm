import fs from 'fs';
import { cacheModel } from '../../scripts/cache-model.mjs';
import { E2E_BENCHMARK, E2E_RESULTS_FILE, E2E_MODEL_ID } from './e2e.js';

const SETUP_CACHE_TIMEOUT_MS = 5 * 60_000;

/** Ensure weights for the E2E model exist before Playwright runs. */
export default async function globalSetup() {
  await Promise.race([
    cacheModel({ modelId: E2E_MODEL_ID }),
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `global-setup cache:model exceeded ${SETUP_CACHE_TIMEOUT_MS / 1000}s — check network or run npm run cache:model first`
            )
          ),
        SETUP_CACHE_TIMEOUT_MS
      );
    }),
  ]);
  const header = E2E_BENCHMARK
    ? `E2E benchmark (all loadable models) — ${new Date().toISOString()}\n\n`
    : `E2E gate — ${E2E_MODEL_ID} — ${new Date().toISOString()}\n\n`;
  fs.writeFileSync(E2E_RESULTS_FILE, header);
}
