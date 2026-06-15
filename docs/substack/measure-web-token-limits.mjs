#!/usr/bin/env node
/**
 * DOM token counts (Node) + Chrome WebGPU runtime context probe.
 *
 *   node docs/substack/measure-web-token-limits.mjs
 *   node docs/substack/measure-web-token-limits.mjs --tokens-only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { AutoTokenizer } from '@huggingface/transformers';

const TOKENS_ONLY = process.argv.includes('--tokens-only');
const HEADED = process.env.CHROME_PROBE_HEADED === '1';
const PROBE_ORIGIN = 'https://example.com';
const PROBE_STEP_TIMEOUT_MS = Number(process.env.PROBE_STEP_TIMEOUT_MS ?? 120_000);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_DIR = path.join(ROOT, 'examples/operator/fixtures/shop-demo');
const TRANSFORMERS_CDN =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.6.2/dist/transformers.min.js';

const TOKENIZER_MODEL = {
  id: 'Qwen/Qwen2.5-0.5B',
  label: 'Qwen2.5-0.5B',
};

/** Text LLM loaded in Chrome WebGPU for runtime memory probe. */
const PROBE_MODEL = {
  id: 'onnx-community/Qwen2.5-0.5B-Instruct',
  tokenizerId: 'Qwen/Qwen2.5-0.5B',
  label: 'Qwen2.5-0.5B Instruct (q4 WebGPU)',
};

const PAGES = [
  {
    label: 'Checkout fixture (this repo)',
    async load() {
      const html = fs.readFileSync(path.join(FIXTURE_DIR, 'index.html'), 'utf8');
      const css = fs.readFileSync(path.join(FIXTURE_DIR, 'fixture.css'), 'utf8');
      return { html, css };
    },
  },
  { label: 'Hacker News', url: 'https://news.ycombinator.com/' },
  {
    label: 'MDN docs article',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch',
  },
  { label: 'Wikipedia article', url: 'https://en.wikipedia.org/wiki/Web_browser' },
];

const est = (chars) => Math.ceil(chars / 3.5);

function countIds(out) {
  const ids = out?.input_ids;
  if (!ids) return 0;
  if (Array.isArray(ids)) return ids.length;
  if (ids?.data) return ids.data.length;
  if (typeof ids?.size === 'number') return ids.size;
  if (typeof ids?.length === 'number') return ids.length;
  if (ids?.dims) return ids.dims.reduce((a, b) => a * b, 1);
  return 0;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'wllama-example-substack-token-probe/1.0' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

async function collectSample(entry) {
  let html;
  let css = '';
  if (entry.load) {
    ({ html, css } = await entry.load());
  } else {
    html = await fetchHtml(entry.url);
  }
  const htmlPlusCss = css ? `${html}\n\n/* --- styles --- */\n${css}` : html;
  return {
    label: entry.label,
    chars: { htmlOnly: html.length, htmlPlusCss: htmlPlusCss.length },
    htmlPlusCss,
  };
}

async function measureDomTokens() {
  console.log(`[node] tokenizer ${TOKENIZER_MODEL.label}…`);
  const tok = await AutoTokenizer.from_pretrained(TOKENIZER_MODEL.id);
  const count = async (text) => countIds(await tok(text, { add_special_tokens: false }));

  const pageRows = [];
  for (const entry of PAGES) {
    console.log(`[collect] ${entry.label}`);
    const sample = await collectSample(entry);
    console.log(
      `  html ${sample.chars.htmlOnly.toLocaleString()} chars, html+css ${sample.chars.htmlPlusCss.toLocaleString()} chars`
    );
    const htmlPlusCssTokens = await count(sample.htmlPlusCss);
    pageRows.push({
      page: sample.label,
      chars: sample.chars,
      estimate: {
        htmlOnly: est(sample.chars.htmlOnly),
        htmlPlusCss: est(sample.chars.htmlPlusCss),
      },
      tokens: { htmlPlusCss: htmlPlusCssTokens },
    });
  }
  return { pageRows };
}

async function probeChromeContext() {
  console.log('[chrome] launching with WebGPU…');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !HEADED,
    ignoreDefaultArgs: ['--disable-gpu'],
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const t = msg.text();
      if (/\[probe\]/i.test(t)) console.log(`[browser] ${t.slice(0, 320)}`);
    });

    await page.goto(PROBE_ORIGIN, { waitUntil: 'domcontentloaded' });
    console.log(`[chrome] loading ${PROBE_MODEL.label} (first run downloads ~300–500 MB)…`);

    return await page.evaluate(
      async ({ probeModel, transformersCdn, stepTimeoutMs }) => {
        const log = (msg) => console.log(`[probe] ${msg}`);
        const { pipeline, AutoTokenizer, env } = await import(transformersCdn);
        env.allowLocalModels = false;
        env.useBrowserCache = false;

        const webgpu = !!navigator.gpu;
        let adapterInfo = null;
        if (navigator.gpu) {
          try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter?.info) {
              adapterInfo = {
                vendor: adapter.info.vendor,
                architecture: adapter.info.architecture,
              };
            }
          } catch {
            /* ignore */
          }
        }

        const countIds = (out) => {
          const ids = out?.input_ids;
          if (!ids) return 0;
          if (Array.isArray(ids)) return ids.length;
          if (ids?.data) return ids.data.length;
          if (typeof ids?.size === 'number') return ids.size;
          if (typeof ids?.length === 'number') return ids.length;
          if (ids?.dims) return ids.dims.reduce((a, b) => a * b, 1);
          return 0;
        };

        log(`tokenizer ${probeModel.tokenizerId}`);
        const tok = await AutoTokenizer.from_pretrained(probeModel.tokenizerId);
        log(`model ${probeModel.id} (q4, webgpu)`);
        const gen = await pipeline('text-generation', probeModel.id, {
          device: webgpu ? 'webgpu' : 'wasm',
          dtype: 'q4',
        });

        const maxPos =
          gen.model?.config?.max_position_embeddings ??
          gen.model?.config?.n_positions ??
          32768;

        const padChunk =
          'DOM node class="btn-primary" id="checkout-submit" aria-label="Submit order"> ';
        const padChunkTokens = countIds(await tok(padChunk, { add_special_tokens: false }));
        if (!padChunkTokens) throw new Error('padding chunk tokenized to 0');

        async function runPromptTokens(target) {
          const repeats = Math.ceil(target / padChunkTokens);
          const text = padChunk.repeat(repeats);
          const actual = countIds(await tok(text, { add_special_tokens: false }));
          const t0 = performance.now();
          const infer = gen(text, { max_new_tokens: 1, do_sample: false });
          const timed = Promise.race([
            infer,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`timeout ${stepTimeoutMs}ms`)), stepTimeoutMs)
            ),
          ]);
          await timed;
          return { actual, ms: Math.round(performance.now() - t0) };
        }

        log(`config max_position_embeddings=${maxPos}`);
        log('ascending scan for max working prompt (stop at first failure)…');

        const scanTargets = [512, 2048, 4096, 8192, 12288, 16384, 20480, 24576, 28672, maxPos].filter(
          (v, i, a) => v > 0 && a.indexOf(v) === i
        );

        let maxWorking = 0;
        let maxWorkingMs = 0;
        const attempts = [];

        for (const target of scanTargets) {
          try {
            const { actual, ms } = await runPromptTokens(target);
            maxWorking = actual;
            maxWorkingMs = ms;
            attempts.push({ target, actual, ok: true, ms });
            log(`OK target≈${target.toLocaleString()} actual=${actual.toLocaleString()} (${ms}ms)`);
          } catch (err) {
            attempts.push({
              target,
              ok: false,
              error: String(err?.message ?? err).slice(0, 120),
            });
            log(`FAIL target≈${target.toLocaleString()} — ${String(err?.message ?? err).slice(0, 80)}`);
            break;
          }
        }

        const limit75 = Math.floor(maxWorking * 0.75);
        log(`max working prompt: ${maxWorking.toLocaleString()} tokens`);
        log(`75% practical budget: ${limit75.toLocaleString()} tokens`);

        return {
          webgpu,
          adapterInfo,
          model: probeModel.id,
          label: probeModel.label,
          device: webgpu ? 'webgpu' : 'wasm',
          configMaxPos: maxPos,
          maxWorking,
          maxWorkingMs,
          limit75,
          attempts,
        };
      },
      { probeModel: PROBE_MODEL, transformersCdn: TRANSFORMERS_CDN, stepTimeoutMs: PROBE_STEP_TIMEOUT_MS }
    );
  } finally {
    await browser.close();
  }
}

function printReport({ pageRows, runtime }) {
  console.log('\n=== DOM capture sizes (Node tokenizer) ===\n');
  for (const row of pageRows) {
    console.log(`## ${row.page}`);
    console.log(
      `  chars html+css: ${row.chars.htmlPlusCss.toLocaleString()}  |  estimate ÷3.5: ${row.estimate.htmlPlusCss.toLocaleString()}  |  actual tokens: ${row.tokens.htmlPlusCss.toLocaleString()}`
    );
  }

  if (!runtime) {
    console.log('\n(skipped Chrome runtime probe — pass without --tokens-only to measure)\n');
    return;
  }

  console.log('\n=== Chrome runtime context probe ===\n');
  console.log(`WebGPU: ${runtime.webgpu}${runtime.adapterInfo ? ` (${JSON.stringify(runtime.adapterInfo)})` : ''}`);
  console.log(`Model: ${runtime.label}`);
  console.log(`Device: ${runtime.device}`);
  console.log(`config max_position_embeddings: ${runtime.configMaxPos?.toLocaleString() ?? '?'}`);
  console.log(`max working prompt (this machine): ${runtime.maxWorking.toLocaleString()} tokens`);
  console.log(`75% practical budget: ${runtime.limit75.toLocaleString()} tokens`);

  console.log('\n## DOM vs 75% runtime budget');
  if (!runtime.limit75) {
    console.log('  (probe found no working context — check WebGPU / model load)');
  }
  for (const row of pageRows) {
    const dom = row.tokens.htmlPlusCss;
    if (!runtime.limit75) {
      console.log(`  ${row.page}: ${dom.toLocaleString()} tokens`);
      continue;
    }
    const pct = Math.round((dom / runtime.limit75) * 100);
    const fits = dom <= runtime.limit75 ? 'FITS' : 'OVER';
    console.log(`  ${row.page}: ${dom.toLocaleString()} tokens (${pct}% of 75% budget) — ${fits}`);
  }
  console.log('');
}

async function main() {
  const { pageRows } = await measureDomTokens();
  const runtime = TOKENS_ONLY ? null : await probeChromeContext();
  printReport({ pageRows, runtime });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
