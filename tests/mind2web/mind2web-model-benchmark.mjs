#!/usr/bin/env node
/**
 * Run Mind2Web eval across all cached registry VL models and summarize.
 *
 *   npm run eval:mind2web:models
 *   MIND2WEB_EVAL_LIMIT=15 npm run eval:mind2web:models
 *   MIND2WEB_BENCHMARK_MODELS=ShowUI-2B,MAI-UI-2B npm run eval:mind2web:models
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_BROWSER_LOADABLE_MODEL_IDS } from '../../scripts/e2e-model-ids.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, '.model-cache/manifest.json');
const RESULTS = path.join(ROOT, 'mind2web-grounding-results.txt');
const OUT = path.join(ROOT, 'mind2web-model-comparison.txt');

const LIMIT = String(process.env.MIND2WEB_EVAL_LIMIT ?? '15');
const FAIL_EARLY = String(process.env.MIND2WEB_EVAL_FAIL_EARLY_PCT ?? '0');
const OPS = process.env.MIND2WEB_EVAL_OPS ?? 'CLICK,TYPE,SELECT';

/** @type {string[]} */
function cachedModelIds() {
  if (!fs.existsSync(MANIFEST)) return [];
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return E2E_BROWSER_LOADABLE_MODEL_IDS.filter((id) => manifest.models?.[id]?.files?.llm);
}

/** @param {string} modelId */
function runEval(modelId) {
  const env = {
    ...process.env,
    E2E_MODEL: modelId,
    MIND2WEB_EVAL_LIMIT: LIMIT,
    MIND2WEB_EVAL_FAIL_EARLY_PCT: FAIL_EARLY,
    MIND2WEB_EVAL_OPS: OPS,
  };
  if (!env.MIND2WEB_EVAL_PER_TYPE) {
    const opList = OPS.split(',').map((s) => s.trim()).filter(Boolean);
    env.MIND2WEB_EVAL_PER_TYPE = String(Math.max(1, Math.ceil(Number(LIMIT) / Math.max(1, opList.length))));
  }
  return spawnSync('node', ['tests/mind2web/mind2web-grounding-eval.mjs'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** @param {string} text */
function parseSummary(text) {
  const overall = text.match(
    /Overall: (\w+).*?parsed=(\d+)\/(\d+).*?bbox_hits=(\d+).*?bbox_acc=([\d.]+)%/
  );
  const byOp = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(CLICK|TYPE|SELECT): (\d+)\/(\d+) \(([\d.]+)%\)(.*)$/);
    if (m) {
      byOp[m[1]] = {
        hits: Number(m[2]),
        parsed: Number(m[3]),
        acc: m[4],
        tail: m[5].trim(),
      };
    }
  }
  return {
    status: overall?.[1] ?? '?',
    parsed: overall ? Number(overall[2]) : 0,
    total: overall ? Number(overall[3]) : 0,
    hits: overall ? Number(overall[4]) : 0,
    acc: overall?.[5] ?? '0.0',
    byOp,
  };
}

/** @param {string} stdout @param {string} stderr */
function harnessNote(stdout, stderr) {
  const blob = `${stdout}\n${stderr}`;
  if (/Timeout 180000ms exceeded/.test(blob)) return 'capture/prewarm timeout';
  if (/expect\(received\)\.toContain/.test(blob)) return 'no Parsed click (bad coord format)';
  if (/fatal:/i.test(blob)) return blob.match(/fatal:([^\n]+)/)?.[1]?.trim() ?? 'fatal';
  if (/parsed=0\/0/.test(blob)) return 'harness — 0 parsed';
  return '';
}

function main() {
  const filter = (process.env.MIND2WEB_BENCHMARK_MODELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const models = (filter.length ? filter : cachedModelIds()).filter((id) =>
    E2E_BROWSER_LOADABLE_MODEL_IDS.includes(id)
  );
  if (!models.length) throw new Error('No cached registry models in .model-cache/manifest.json');

  const header =
    `Mind2Web multi-model benchmark — ${new Date().toISOString()}\n` +
    `limit=${LIMIT} ops=${OPS} per_type=${process.env.MIND2WEB_EVAL_PER_TYPE ?? 'auto'}\n\n`;
  fs.writeFileSync(OUT, header);

  /** @type {Array<{ id: string; summary: ReturnType<typeof parseSummary>; note: string; exit: number }>} */
  const rows = [];

  for (let i = 0; i < models.length; i++) {
    const id = models[i];
    process.stdout.write(`[benchmark] ${i + 1}/${models.length} ${id} …\n`);
    const r = runEval(id);
    const body = fs.existsSync(RESULTS) ? fs.readFileSync(RESULTS, 'utf8') : '';
    const summary = parseSummary(body);
    const note = harnessNote(r.stdout ?? '', r.stderr ?? '');
    rows.push({ id, summary, note, exit: r.status ?? 1 });
    fs.appendFileSync(
      OUT,
      `\n=== ${id} (exit=${r.status})${note ? ` — ${note}` : ''} ===\n` +
        (body.split('\n').slice(-8).join('\n') || r.stderr?.slice(-500) || '(no results)') +
        '\n'
    );
  }

  const pad = (s, n) => String(s).padEnd(n);
  const lines = [
    '',
    '## Summary table',
    '',
    '| Model | Overall | CLICK | TYPE | SELECT | Notes |',
    '|-------|---------|-------|------|--------|-------|',
  ];
  for (const { id, summary, note } of rows.sort((a, b) => Number(b.summary.acc) - Number(a.summary.acc))) {
    const fmt = (op) => {
      const s = summary.byOp[op];
      return s ? `${s.hits}/${s.parsed} (${s.acc}%)` : '—';
    };
    lines.push(
      `| ${id} | ${summary.hits}/${summary.parsed} (${summary.acc}%) | ${fmt('CLICK')} | ${fmt('TYPE')} | ${fmt('SELECT')} | ${note || ''} |`
    );
  }
  fs.appendFileSync(OUT, lines.join('\n') + '\n');
  console.info(`[benchmark] done — ${OUT}`);
  console.info(lines.slice(3).join('\n'));
}

main();
