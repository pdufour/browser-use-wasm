#!/usr/bin/env node
/**
 * Cache the MiniWoB++ task corpus (MIT — Farama-Foundation/miniwob-plusplus)
 * into a gitignored fixtures dir for the opt-in `npm run eval:miniwob` harness.
 * Like `cache:model`, this is Node download tooling only — the browser loads
 * the task pages same-origin via the `/miniwob/` fixtures route.
 *
 *   npm run cache:miniwob
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'examples/operator/fixtures/miniwob/cache');
const CLONE_DIR = path.join(CACHE_DIR, 'miniwob-plusplus');
/** Served at /miniwob/ — tasks at /miniwob/miniwob/<task>.html, core at /miniwob/core/. */
export const MINIWOB_HTML_DIR = path.join(CLONE_DIR, 'miniwob/html');

const REPO = 'https://github.com/Farama-Foundation/miniwob-plusplus.git';

export function miniwobCorpusReady() {
  return fs.existsSync(path.join(MINIWOB_HTML_DIR, 'core/core.js'));
}

export function cacheMiniwob() {
  if (miniwobCorpusReady()) {
    console.info(`[cache:miniwob] corpus already cached at ${MINIWOB_HTML_DIR}`);
    return;
  }
  fs.rmSync(CLONE_DIR, { recursive: true, force: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.info('[cache:miniwob] sparse-cloning miniwob-plusplus (MIT) …');
  const clone = spawnSync(
    'git',
    ['clone', '--depth', '1', '--filter=blob:none', '--sparse', REPO, CLONE_DIR],
    { stdio: 'inherit' }
  );
  if (clone.status !== 0) throw new Error('git clone failed');
  const sparse = spawnSync(
    'git',
    ['-C', CLONE_DIR, 'sparse-checkout', 'set', 'miniwob/html'],
    { stdio: 'inherit' }
  );
  if (sparse.status !== 0) throw new Error('git sparse-checkout failed');
  const sha = spawnSync('git', ['-C', CLONE_DIR, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).stdout.trim();
  fs.writeFileSync(
    path.join(CACHE_DIR, 'VERSION.txt'),
    `Farama-Foundation/miniwob-plusplus @ ${sha}\nLicense: MIT (see miniwob-plusplus/LICENSE)\n`
  );
  if (!miniwobCorpusReady()) throw new Error('corpus missing after clone');
  console.info(`[cache:miniwob] cached @ ${sha}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    cacheMiniwob();
  } catch (err) {
    console.error('[cache:miniwob] fatal:', err);
    process.exit(1);
  }
}
