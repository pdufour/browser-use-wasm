#!/usr/bin/env node
/**
 * Flatten Vite MPA output + copy static demo assets for GitHub Pages.
 * Input: dist/ from `npm run build:examples`
 * Output: dist/ replaced with site-root routes (/, /home/, /gallery/, …)
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawDist = path.join(repoRoot, 'dist');
const stageDir = path.join(repoRoot, '.pages-staging');

/** Vite build paths → public site routes (match vite.demo-pages.js). */
const PAGE_ROUTES = [
  { src: 'examples/home/index.html', dest: 'index.html' },
  { src: 'examples/operator/index.html', dest: 'home/index.html' },
  { src: 'examples/gallery/index.html', dest: 'gallery/index.html' },
  { src: 'examples/browse/index.html', dest: 'browse/index.html' },
  { src: 'examples/video/index.html', dest: 'video/index.html' },
];

/** Static trees served by Vite middleware in dev. */
const STATIC_TREES = [
  {
    src: path.join(repoRoot, 'node_modules/@wllama/wllama/esm/wasm/wllama.wasm'),
    dest: 'wllama/wllama.wasm',
  },
  {
    src: path.join(repoRoot, 'examples/shared/previews'),
    dest: 'shared/previews',
  },
  {
    src: path.join(repoRoot, 'examples/fixtures/tasks'),
    dest: 'sites',
  },
  {
    src: path.join(repoRoot, 'examples/operator/fixtures/shop-demo'),
    dest: 'browse-fixture',
  },
];

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyTree(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn('[stage-pages] skip missing', src);
    return;
  }
  const stat = fs.statSync(src);
  if (stat.isFile()) {
    copyFile(src, dest);
    return;
  }
  for (const name of fs.readdirSync(src)) {
    copyTree(path.join(src, name), path.join(dest, name));
  }
}

if (!fs.existsSync(rawDist)) {
  throw new Error('dist/ missing — run npm run build:examples first');
}

rmrf(stageDir);
mkdirp(stageDir);

if (fs.existsSync(path.join(rawDist, 'assets'))) {
  copyTree(path.join(rawDist, 'assets'), path.join(stageDir, 'assets'));
}

for (const { src, dest } of PAGE_ROUTES) {
  const from = path.join(rawDist, src);
  if (!fs.existsSync(from)) {
    throw new Error(`Built page missing: ${src}`);
  }
  copyFile(from, path.join(stageDir, dest));
}

for (const { src, dest } of STATIC_TREES) {
  copyTree(src, path.join(stageDir, dest));
}

fs.writeFileSync(path.join(stageDir, '.nojekyll'), '');

const coiSrc = path.join(
  path.dirname(require.resolve('coi-serviceworker/package.json')),
  'coi-serviceworker.min.js'
);
if (fs.existsSync(coiSrc)) {
  copyFile(coiSrc, path.join(stageDir, 'coi-serviceworker.js'));
} else {
  console.warn('[stage-pages] coi-serviceworker missing — GitHub Pages may need COOP/COEP');
}

rmrf(rawDist);
fs.renameSync(stageDir, rawDist);
console.log('[stage-pages] staged dist/ for GitHub Pages routes');
