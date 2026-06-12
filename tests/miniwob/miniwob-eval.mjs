#!/usr/bin/env node
/**
 * MiniWoB++ tool-execution eval — blackbox against the real app (no src/ hooks).
 *
 * Opt-in, never part of the `npm run test` gate. Serves the MIT-licensed
 * MiniWoB++ task pages (cached via `npm run cache:miniwob`) same-origin in the
 * browse iframe, captures with SnapDOM, then drives the production tool paths:
 *   - clicks  → Run task UI (`#prompt` + btn-task), instruction verbatim
 *   - input / select / toggle_checkbox / focus_field → structured voice tool
 *     calls through `__e2eVoiceTool` (`?e2e=1`, no mic, no phrase regex)
 * Success is the task's own checker: `WOB_DONE_GLOBAL` + raw reward > 0 read
 * from the task frame (eval oracle only — never used for coordinates).
 *
 * Only tasks expressible with the app's supported single-inference tools are
 * included; drag, timing, multi-step-planning, and canvas-geometry tasks are
 * skipped by design (see TASKS / SKIPPED_TASKS below).
 *
 *   npm run cache:showui && npm run cache:miniwob
 *   npm run eval:miniwob
 */

import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheModel } from '../../scripts/cache-model.mjs';
import { cacheMiniwob, miniwobCorpusReady } from '../../scripts/cache-miniwob.mjs';
import {
  ensureModelLoaded,
  dismissCoachOverlay,
  loadTimeoutMsForModel,
  waitForBrowseFixtureReady,
  navigateBrowseTo,
  runCaptureUntilReady,
  runTaskAndWaitParsed,
  showLiveBrowseViewport,
  waitForE2eVoiceApi,
  runE2eVoiceTool,
  VOICE_GROUNDING_WAIT_MS,
} from '../e2e/e2e.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const RESULTS_FILE = path.join(ROOT, 'miniwob-results.txt');

const MODEL_ID = process.env.E2E_MODEL ?? 'ShowUI-2B';
const EVAL_DEV_PORT = process.env.MINIWOB_EVAL_PORT ?? '5175';
const BASE_URL = (
  process.env.MINIWOB_EVAL_BASE ?? `http://127.0.0.1:${EVAL_DEV_PORT}`
).replace(/\/$/, '');
const EPISODES = Math.max(1, Number(process.env.MINIWOB_EVAL_EPISODES ?? 3) || 3);
const HEADED = process.env.MINIWOB_EVAL_HEADED === '1';
const SEED_BASE = process.env.MINIWOB_EVAL_SEED ?? 'miniwob-eval';
/** Fresh app session every N episodes (clears worker/UI stalls). */
const SESSION_EVERY = 10;

/** Eval-only timeouts (gate `INFERENCE_TIMEOUT_MS` unchanged). */
const NAV_TIMEOUT_MS = Number(process.env.MINIWOB_EVAL_NAV_TIMEOUT_MS ?? 30_000) || 30_000;
const CAPTURE_TIMEOUT_MS =
  Number(process.env.MINIWOB_EVAL_CAPTURE_TIMEOUT_MS ?? 25_000) || 25_000;
const INFER_TIMEOUT_MS =
  Number(process.env.MINIWOB_EVAL_INFERENCE_TIMEOUT_MS ?? 15_000) || 15_000;
const PAGE_TIMEOUT_MS = Number(process.env.MINIWOB_EVAL_PAGE_TIMEOUT_MS ?? 90_000) || 90_000;
/** Wait for the task page's own success checker after the final step. */
const DONE_POLL_MS = 5_000;

/**
 * Step kinds:
 *   { kind: 'task', goal }            — Run task UI, executes live click at grounded point
 *   { kind: 'tool', call }            — structured voice tool call (input/select/toggle/focus)
 * Mappers build steps from the task's own utterance (structured oracle text —
 * same precedent as the Mind2Web harness building voice calls from dataset
 * fields). Instruction text is used verbatim or split; never rewritten.
 * @typedef {{ kind: 'task'; goal: string } | { kind: 'tool'; call: { name: string; arguments: Record<string, unknown> } }} Step
 */

/** Single-click tasks: the utterance itself is the Run task goal, verbatim. */
function verbatimClick(utterance) {
  return [{ kind: 'task', goal: utterance }];
}

/** Kept tasks — id → tool category + utterance→steps mapper. */
const TASKS = [
  { id: 'click-test', category: 'click', map: verbatimClick },
  { id: 'click-test-2', category: 'click', map: verbatimClick },
  { id: 'click-button', category: 'click', map: verbatimClick },
  { id: 'click-link', category: 'click', map: verbatimClick },
  { id: 'click-dialog', category: 'click', map: verbatimClick },
  { id: 'click-dialog-2', category: 'click', map: verbatimClick },
  { id: 'click-tab', category: 'click', map: verbatimClick },
  { id: 'click-widget', category: 'click', map: verbatimClick },
  {
    // 'Select <option> and click Submit.' → click option, click Submit
    id: 'click-option',
    category: 'click',
    map: (u) => {
      const m = u.match(/^Select\s+(.+?)\s+and click Submit\.?$/i);
      if (!m) return null;
      return [
        { kind: 'task', goal: `click ${m[1]}` },
        { kind: 'task', goal: 'click Submit' },
      ];
    },
  },
  {
    // 'Select a, b and click Submit.' → toggle each checkbox, click Submit
    id: 'click-checkboxes',
    category: 'toggle_checkbox',
    map: (u) => {
      const m = u.match(/^Select\s+(.+?)\s+and click Submit\.?$/i);
      if (!m) return null;
      const items = m[1]
        .split(/,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!items.length) return null;
      return [
        ...items.map((item) => ({
          kind: 'tool',
          call: { name: 'toggle_checkbox', arguments: { target: item } },
        })),
        { kind: 'task', goal: 'click Submit' },
      ];
    },
  },
  {
    // 'Select <option> from the list and click Submit.'
    id: 'choose-list',
    category: 'select',
    map: (u) => {
      const m = u.match(/^Select\s+(.+?)\s+from the list and click Submit\.?$/i);
      if (!m) return null;
      return [
        { kind: 'tool', call: { name: 'select', arguments: { target: 'the list', value: m[1] } } },
        { kind: 'task', goal: 'click Submit' },
      ];
    },
  },
  {
    // 'Enter "x" into the text field and press Submit.'
    id: 'enter-text',
    category: 'input',
    map: enterTextSteps,
  },
  { id: 'enter-text-dynamic', category: 'input', map: enterTextSteps },
  {
    // 'Focus into the textbox.' / 'Focus into the 3rd input textbox.'
    id: 'focus-text',
    category: 'focus_field',
    map: focusSteps,
  },
  { id: 'focus-text-2', category: 'focus_field', map: focusSteps },
];

function enterTextSteps(u) {
  const m = u.match(/^Enter\s+"(.+?)"\s+into\s+(.+?)\s+and press Submit\.?$/i);
  if (!m) return null;
  return [
    { kind: 'tool', call: { name: 'input', arguments: { target: m[2], value: m[1] } } },
    { kind: 'task', goal: 'click Submit' },
  ];
}

function focusSteps(u) {
  const m = u.match(/^Focus into\s+(.+?)\.?$/i);
  if (!m) return null;
  return [{ kind: 'tool', call: { name: 'focus_field', arguments: { target: m[1] } } }];
}

/**
 * Skipped MiniWoB++ families (documented, by design — not failures):
 *   drag-*, draw-*, highlight-text*           — drag gestures unsupported
 *   *-delay, chase-circle, moving-items,
 *   simon-says, hot-cold, button-delay        — timing / dynamics
 *   book-flight, email-inbox*, order-food,
 *   search-engine, use-autocomplete,
 *   navigate-tree, form-sequence*, login-user — multi-step planning loops
 *   count-*, find-*, read-table*, math tasks  — answer synthesis, not tool use
 *   bisect-angle, circle-center, right-angle,
 *   grid-coordinate, click-pie, click-shape   — precise canvas geometry
 *   use-slider*, use-spinner, resize-textarea — drag / repeated adjustment
 *   copy-paste*, terminal, text-editor        — clipboard / rich editing
 */
const SKIPPED_NOTE = 'see header comment — drag, timing, planning, geometry, editing';

const TASK_FILTER = (process.env.MINIWOB_EVAL_TASKS ?? '')
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter(Boolean);
const RUN_TASKS = TASK_FILTER.length
  ? TASKS.filter((t) => TASK_FILTER.includes(t.id))
  : TASKS;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @returns {Promise<import('node:child_process').ChildProcess | null>} */
async function ensureDevServer() {
  try {
    const r = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    if (r.ok) return null;
  } catch {
    /* start vite */
  }
  const port = new URL(BASE_URL).port || EVAL_DEV_PORT;
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return child;
    } catch {
      await sleep(500);
    }
  }
  child.kill();
  throw new Error(`Dev server did not start at ${BASE_URL}`);
}

/** @param {import('@playwright/test').Page} page */
async function openMiniwobSession(page) {
  const url = new URL('/home/', BASE_URL);
  url.searchParams.set('model', MODEL_ID);
  url.searchParams.set('e2e', '1');
  if (MODEL_ID !== 'ShowUI-2B') url.searchParams.set('benchmark', '1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await dismissCoachOverlay(page);
  await page.waitForSelector('[data-testid="browse-frame"]', { timeout: 15_000 });
  await waitForBrowseFixtureReady(page);
  await ensureModelLoaded(page, MODEL_ID, loadTimeoutMsForModel(MODEL_ID));
  await waitForE2eVoiceApi(page);
}

/**
 * Start one deterministic episode in the task frame and return its utterance.
 * Frame-evaluate here is eval setup/oracle only (seed, timer, success read) —
 * never coordinates. `#capture-target` wrapper confines SnapDOM to the task
 * area (capture sizing, same as any site exposing that id).
 * @param {import('@playwright/test').Page} page
 * @param {string} seed
 */
async function startEpisode(page, seed) {
  return page.evaluate((sd) => {
    const w = document.querySelector('[data-testid="browse-frame"]')?.contentWindow;
    if (!w?.core) throw new Error('miniwob core missing in browse frame');
    const doc = w.document;
    const wrap = doc.getElementById('wrap');
    if (wrap && !doc.getElementById('capture-target')) {
      const host = doc.createElement('div');
      host.id = 'capture-target';
      host.style.display = 'inline-block';
      wrap.parentNode.insertBefore(host, wrap);
      host.appendChild(wrap);
    }
    w.Math.seedrandom(sd);
    // Inference latency must not turn into reward-timer noise — success is
    // judged on the raw reward sign, and the 10s default would expire mid-run.
    w.core.EPISODE_MAX_TIME = 10 * 60 * 1000;
    w.core.startEpisodeReal();
    return w.core.getUtterance();
  }, seed);
}

/** @param {import('@playwright/test').Page} page */
async function episodeState(page) {
  return page.evaluate(() => {
    const w = document.querySelector('[data-testid="browse-frame"]')?.contentWindow;
    return {
      done: Boolean(w?.WOB_DONE_GLOBAL),
      raw: Number(w?.WOB_RAW_REWARD_GLOBAL ?? 0),
      reason: w?.WOB_REWARD_REASON ?? null,
    };
  });
}

/**
 * Structured voice tool call → wait for a new ✓ (or fail honestly on Error).
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string; arguments: Record<string, unknown> }} call
 */
async function runVoiceStep(page, call) {
  const before =
    (await page.getByTestId('voice-transcript').textContent().catch(() => '')) ?? '';
  await runE2eVoiceTool(page, call);
  await expect
    .poll(
      async () => {
        const text =
          (await page.getByTestId('voice-transcript').textContent().catch(() => '')) ?? '';
        if (text === before) return null;
        const fresh = text.startsWith(before) ? text.slice(before.length) : text;
        if (/Error:|Could not/i.test(fresh)) {
          throw new Error(`voice tool failed: ${fresh.trim().slice(0, 200)}`);
        }
        return /✓/.test(fresh) ? fresh : null;
      },
      { timeout: Math.max(INFER_TIMEOUT_MS, VOICE_GROUNDING_WAIT_MS) }
    )
    .not.toBeNull();
}

/** @param {Step} step */
function stepLabel(step) {
  return step.kind === 'task'
    ? `task "${step.goal.slice(0, 60)}"`
    : `${step.call.name}(${JSON.stringify(step.call.arguments).slice(0, 60)})`;
}

async function main() {
  if (!miniwobCorpusReady()) cacheMiniwob();
  await cacheModel({ modelId: MODEL_ID });

  console.info(
    `[miniwob-eval] ${MODEL_ID} — ${RUN_TASKS.length} tasks × ${EPISODES} episodes ` +
      `(skipped families: ${SKIPPED_NOTE})`
  );
  fs.writeFileSync(
    RESULTS_FILE,
    `MiniWoB++ tool-execution eval — ${MODEL_ID} — ${new Date().toISOString()}\n` +
      `tasks=${RUN_TASKS.map((t) => t.id).join(',')} episodes_per_task=${EPISODES}\n`
  );

  const vite = await ensureDevServer();
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !HEADED,
    args: ['--enable-unsafe-webgpu'],
  });

  /** per task + per category tallies */
  const byTask = new Map();
  const byCategory = new Map();
  const tally = (map, key, field) => {
    const t = map.get(key) ?? { success: 0, fail: 0, unmapped: 0, harnessFail: 0 };
    t[field] += 1;
    map.set(key, t);
  };

  let episodesRun = 0;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);
    if (process.env.MINIWOB_EVAL_DEBUG === '1') {
      page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error' || /\[(browser-actions|worker|capture|perf)/i.test(text)) {
          console.info(`\n[browser:${msg.type()}] ${text.slice(0, 300)}`);
        }
      });
      page.on('pageerror', (err) => console.info(`\n[pageerror] ${String(err).slice(0, 300)}`));
    }
    await openMiniwobSession(page);

    let sinceSession = 0;
    for (const task of RUN_TASKS) {
      for (let ep = 0; ep < EPISODES; ep++) {
        const seed = `${SEED_BASE}-${task.id}-${ep}`;
        const tag = `${task.id}#${ep + 1}`;
        process.stdout.write(`[miniwob-eval] ${tag} `);

        if (sinceSession >= SESSION_EVERY) {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await openMiniwobSession(page);
          sinceSession = 0;
        }
        sinceSession += 1;

        try {
          await page.locator('#prompt').fill('');
          await showLiveBrowseViewport(page);
          await navigateBrowseTo(
            page,
            `/miniwob/miniwob/${task.id}.html?ep=${ep}`,
            { timeoutMs: NAV_TIMEOUT_MS, browseChromeTimeoutMs: NAV_TIMEOUT_MS }
          );
          const utterance = (await startEpisode(page, seed)).trim();
          process.stdout.write(`"${utterance.slice(0, 60)}" `);

          const steps = task.map(utterance);
          if (!steps) {
            episodesRun += 1;
            tally(byTask, task.id, 'unmapped');
            tally(byCategory, task.category, 'unmapped');
            console.info('UNMAPPED');
            fs.appendFileSync(RESULTS_FILE, `UNMAPPED ${tag} "${utterance}"\n`);
            continue;
          }

          let stepErr = null;
          for (const step of steps) {
            const state = await episodeState(page);
            if (state.done) break;
            await runCaptureUntilReady(page, {
              captureTimeoutMs: CAPTURE_TIMEOUT_MS,
              screenshotTimeoutMs: CAPTURE_TIMEOUT_MS,
              readyTimeoutMs: CAPTURE_TIMEOUT_MS,
              browseChromeTimeoutMs: NAV_TIMEOUT_MS,
            });
            try {
              if (step.kind === 'task') {
                await runTaskAndWaitParsed(page, step.goal, INFER_TIMEOUT_MS);
              } else {
                await runVoiceStep(page, step.call);
              }
            } catch (err) {
              stepErr = `${stepLabel(step)} — ${err instanceof Error ? err.message.split('\n')[0] : err}`;
              break;
            }
          }

          // Let the task's own checker settle, then judge on raw reward sign.
          let state = await episodeState(page);
          const deadline = Date.now() + DONE_POLL_MS;
          while (!state.done && Date.now() < deadline) {
            await sleep(300);
            state = await episodeState(page);
          }

          episodesRun += 1;
          const success = state.done && state.raw > 0;
          const status = success ? 'SUCCESS' : 'FAIL';
          tally(byTask, task.id, success ? 'success' : 'fail');
          tally(byCategory, task.category, success ? 'success' : 'fail');
          console.info(
            `${status} done=${state.done} raw=${state.raw.toFixed(2)}` +
              (stepErr ? ` step_err=${stepErr.slice(0, 80)}` : '')
          );
          fs.appendFileSync(
            RESULTS_FILE,
            `${status} ${tag} cat=${task.category} "${utterance}" done=${state.done} ` +
              `raw=${state.raw.toFixed(2)} reason=${state.reason ?? '-'}` +
              (stepErr ? ` step_err=${stepErr}` : '') +
              '\n'
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
          episodesRun += 1;
          tally(byTask, task.id, 'harnessFail');
          tally(byCategory, task.category, 'harnessFail');
          console.info(`HARNESS_FAIL ${msg.slice(0, 120)}`);
          fs.appendFileSync(RESULTS_FILE, `HARNESS_FAIL ${tag} — ${msg}\n`);
          // Recover the session for the next episode.
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          await openMiniwobSession(page).catch(() => {});
          sinceSession = 0;
        }
      }
    }

    const fmt = (t) => {
      const attempts = t.success + t.fail;
      const pct = attempts ? ((100 * t.success) / attempts).toFixed(1) : '0.0';
      return (
        `${t.success}/${attempts} (${pct}%)` +
        (t.unmapped ? ` unmapped=${t.unmapped}` : '') +
        (t.harnessFail ? ` harness_fail=${t.harnessFail}` : '')
      );
    };
    const lines = [
      '',
      'Per category:',
      ...[...byCategory.entries()].map(([k, t]) => `  ${k}: ${fmt(t)}`),
      'Per task:',
      ...[...byTask.entries()].map(([k, t]) => `  ${k}: ${fmt(t)}`),
      '',
    ];
    fs.appendFileSync(RESULTS_FILE, lines.join('\n'));
    console.info(lines.join('\n'));
    console.info(`[miniwob-eval] → ${RESULTS_FILE}`);
    if (episodesRun === 0) process.exitCode = 1;
  } finally {
    await browser.close();
    vite?.kill();
  }
}

main().catch((err) => {
  console.error('[miniwob-eval] fatal:', err);
  process.exit(1);
});
