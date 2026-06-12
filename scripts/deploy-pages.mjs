#!/usr/bin/env node
/**
 * Manual GitHub Pages deploy — build, stage, push `dist/` to branch `gh-pages`.
 * Usage: npm run deploy:pages
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(repoRoot, 'dist');
const pagesBase = process.env.PAGES_BASE ?? '/browser-use-wasm/';

function pagesBuildId() {
  if (process.env.PAGES_BUILD_ID?.trim()) return process.env.PAGES_BUILD_ID.trim();
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return `${sha}-${Date.now().toString(36)}`;
  } catch {
    return Date.now().toString(36);
  }
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: repoRoot, ...opts });
}

const buildId = pagesBuildId();
console.log(`[deploy-pages] build id ${buildId}`);
run('npm run build:examples', {
  env: { ...process.env, PAGES_BASE: pagesBase, PAGES_BUILD_ID: buildId },
});
run('node scripts/stage-pages-dist.mjs');

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ missing after stage');
}

const worktree = path.join(repoRoot, '.pages-worktree');
rmrf(worktree);

let hasGhPages = false;
try {
  run('git fetch origin gh-pages', { stdio: 'pipe' });
  execSync('git rev-parse --verify origin/gh-pages', { cwd: repoRoot, stdio: 'pipe' });
  hasGhPages = true;
} catch {
  /* first deploy */
}

if (hasGhPages) {
  run(`git worktree add -B gh-pages "${worktree}" origin/gh-pages`);
} else {
  run(`git worktree add -B gh-pages "${worktree}"`);
  run('git commit --allow-empty -m "Initialize gh-pages"', { cwd: worktree });
}

for (const name of fs.readdirSync(worktree)) {
  if (name === '.git') continue;
  rmrf(path.join(worktree, name));
}
run(`cp -R "${distDir}/." "${worktree}/"`);
run('git add -A', { cwd: worktree });
let hasChanges = true;
try {
  execSync('git diff --cached --quiet', { cwd: worktree, stdio: 'pipe' });
  hasChanges = false;
} catch {
  /* diff exits 1 when there are staged changes */
}
if (hasChanges) {
  run('git commit -m "Deploy examples to GitHub Pages"', { cwd: worktree });
} else {
  console.log('[deploy-pages] no file changes — skipping commit');
}
run('git push origin gh-pages', { cwd: worktree });
rmrf(worktree);
run('git worktree prune');

console.log(`\nDeployed to gh-pages (base ${pagesBase}).`);
console.log('Enable: Settings → Pages → Deploy from branch gh-pages / root');
console.log('Site: https://pdufour.github.io/browser-use-wasm/');
