#!/usr/bin/env node
/** Remove repo `.model-cache/` (dev-server GGUF pre-cache). Browser OPFS: use in-app Clear cache. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.model-cache');

if (!fs.existsSync(cacheDir)) {
  console.log('No .model-cache/ directory — nothing to clear.');
  process.exit(0);
}

let removed = 0;
for (const name of fs.readdirSync(cacheDir)) {
  const file = path.join(cacheDir, name);
  if (!fs.statSync(file).isFile()) continue;
  fs.unlinkSync(file);
  removed++;
  console.log('removed', name);
}

console.log(`Cleared ${removed} file(s) from .model-cache/`);
