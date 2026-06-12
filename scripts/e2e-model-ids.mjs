/**
 * Model ids for Playwright (Node reads registry — tests must not import `src/`).
 * @see `src/config/models/registry.js`
 */
import { MODELS } from '../src/config/models/registry.ts';

export const E2E_BROWSER_LOADABLE_MODEL_IDS = MODELS.map((m) => m.id);
