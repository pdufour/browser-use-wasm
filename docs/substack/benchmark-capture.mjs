#!/usr/bin/env node
/**
 * Playwright driver for SnapDOM vs html2canvas-pro capture benchmark.
 *
 *   npm run dev   # in another terminal
 *   node docs/substack/benchmark-capture.mjs
 *
 * Env:
 *   BENCHMARK_BASE_URL=http://127.0.0.1:5173
 *   BENCHMARK_RUNS=5
 *   BENCHMARK_WARMUP=1
 *   BENCHMARK_HEADED=1
 */

import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BENCHMARK_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const RUNS = Number(process.env.BENCHMARK_RUNS ?? 5);
const WARMUP = Number(process.env.BENCHMARK_WARMUP ?? 1);
const HEADED = process.env.BENCHMARK_HEADED === '1';
const TIMEOUT_MS = Number(process.env.BENCHMARK_TIMEOUT_MS ?? 120_000);

function machineLine() {
  if (process.platform !== 'darwin') return `${os.type()} · ${os.cpus()[0]?.model ?? 'unknown CPU'}`;
  try {
    const model = execSync('sysctl -n hw.model', { encoding: 'utf8' }).trim();
    const chip = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
    const ramGb = Math.round(Number(execSync('sysctl -n hw.memsize', { encoding: 'utf8' })) / 1024 ** 3);
    return `${model} · ${chip} · ${ramGb} GB`;
  } catch {
    return `${os.type()} · ${os.cpus()[0]?.model ?? 'unknown CPU'}`;
  }
}

function toCsv(payload) {
  const header = ['Fixture', 'Library', 'Capture time (ms)'];
  const rows = [];
  for (const row of payload.results) {
    rows.push([row.fixture, 'SnapDOM', row.snapdom.median]);
    rows.push([row.fixture, 'html2canvas-pro', row.html2canvasPro.median]);
  }
  return [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

async function main() {
  const url = `${BASE_URL}/substack/capture-benchmark.html?autorun=1&runs=${RUNS}&warmup=${WARMUP}`;
  console.log(`Machine: ${machineLine()}`);
  console.log(`Opening ${url}`);

  const browser = await chromium.launch({
    headless: !HEADED,
    channel: 'chrome',
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);

    const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (!res?.ok()) throw new Error(`Failed to load benchmark page (${res?.status()})`);

    await page.waitForFunction(() => window.__benchmarkResults || window.__benchmarkError, null, {
      timeout: TIMEOUT_MS,
    });

    const err = await page.evaluate(() => window.__benchmarkError);
    if (err) throw new Error(err);

    const payload = await page.evaluate(() => window.__benchmarkResults);
    const csv = toCsv(payload);
    const outTxt = path.join(dir, 'capture-benchmark-results.txt');
    const outCsv = path.join(dir, 'capture-benchmark.csv');

    const banner = [
      `# capture benchmark - ${payload.ranAt}`,
      `# ${machineLine()}`,
      `# DPR ${payload.devicePixelRatio} · warmup ${payload.warmup} · runs ${payload.runs}`,
      '',
    ].join('\n');

    fs.writeFileSync(outTxt, `${banner}${JSON.stringify(payload, null, 2)}\n`);
    fs.writeFileSync(outCsv, `${csv}\n`);

    console.log('\nResults:');
    for (const row of payload.results) {
      console.log(
        `  ${row.fixture}: SnapDOM ${row.snapdom.median} ms vs html2canvas-pro ${row.html2canvasPro.median} ms (${row.snapdomFasterBy}×)`
      );
    }
    console.log(`\nWrote ${outCsv}`);
    console.log(`Wrote ${outTxt}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
