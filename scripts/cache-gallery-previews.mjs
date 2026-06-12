/**
 * Gallery card previews → examples/shared/previews/{id}.jpg
 *
 * Starts Vite if needed, or set PREVIEW_BASE_URL when dev is already running.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SAMPLE_SITES,
  SHOP_DEMO_TASK,
  VIDEO_DEMO_TASK,
} from '../examples/shared/gallery-tasks.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const examplesDir = path.join(repoRoot, 'examples');
const outDir = path.join(repoRoot, 'examples/shared/previews');
const defaultPort = Number(process.env.PREVIEW_PORT ?? 5173);
const baseUrl = process.env.PREVIEW_BASE_URL ?? `http://127.0.0.1:${defaultPort}`;

const PREVIEW_MAX_W = 640;
const PREVIEW_MAX_H = 360;
const PREVIEW_JPEG_QUALITY = 72;
const TASK_TIMEOUT_MS = 30_000;

/** @type {import('../examples/shared/gallery-tasks.js').GalleryTask[]} */
const PREVIEW_TASKS = [SHOP_DEMO_TASK, ...SAMPLE_SITES, VIDEO_DEMO_TASK];

function dedupeTasks(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

async function waitForServer(url, timeoutMs = 8_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok || res.status === 304) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dev server not reachable at ${url}`);
}

/** @param {number} port */
function startDevServer(port) {
  return spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', '--config', 'vite.config.js', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: examplesDir,
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    }
  );
}

async function ensureDevServer() {
  if (process.env.PREVIEW_BASE_URL) {
    await waitForServer(baseUrl, 8_000);
    return null;
  }

  try {
    await waitForServer(baseUrl, 2_000);
    return null;
  } catch {
    const proc = startDevServer(defaultPort);
    await waitForServer(baseUrl, 45_000);
    return proc;
  }
}

/** @param {import('@playwright/test').Page} page @param {string} url */
async function captureFixturePreview(page, url) {
  await page.goto(`${baseUrl}${url}`, {
    waitUntil: 'domcontentloaded',
    timeout: TASK_TIMEOUT_MS,
  });
  const root = page.locator('#capture-target').first();
  await root.waitFor({ state: 'visible', timeout: TASK_TIMEOUT_MS });
  await page.waitForTimeout(300);

  const box = await root.boundingBox();
  if (!box) throw new Error('capture-target has no layout box');

  return page.screenshot({
    type: 'jpeg',
    quality: PREVIEW_JPEG_QUALITY,
    clip: {
      x: box.x,
      y: box.y,
      width: Math.min(box.width, PREVIEW_MAX_W),
      height: Math.min(box.height, PREVIEW_MAX_H),
    },
    timeout: TASK_TIMEOUT_MS,
  });
}

async function main() {
  const devProc = await ensureDevServer();

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage({
    viewport: { width: PREVIEW_MAX_W, height: PREVIEW_MAX_H },
  });
  page.setDefaultTimeout(TASK_TIMEOUT_MS);

  const tasks = dedupeTasks(PREVIEW_TASKS);
  /** @type {Map<string, Buffer>} */
  const byUrl = new Map();

  for (const task of tasks) {
    const out = path.join(outDir, `${task.id}.jpg`);
    process.stdout.write(`cache:previews ${task.id} … `);

    let jpeg = byUrl.get(task.url);
    if (!jpeg) {
      jpeg = await captureFixturePreview(page, task.url);
      byUrl.set(task.url, jpeg);
    }

    fs.writeFileSync(out, jpeg);
    console.log(`${(jpeg.length / 1024).toFixed(1)} KB → ${path.relative(repoRoot, out)}`);
  }

  await browser.close();
  if (devProc?.pid) {
    try {
      process.kill(-devProc.pid);
    } catch {
      devProc.kill();
    }
  }
  console.log(`Wrote ${tasks.length} previews to ${path.relative(repoRoot, outDir)}/`);
  console.log('Commit them: git add examples/shared/previews && git commit -m "Update gallery previews"');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
