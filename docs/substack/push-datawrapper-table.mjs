#!/usr/bin/env node
/**
 * Push Substack CSV tables to Datawrapper.
 *
 *   export DATAWRAPPER_TOKEN=...   # from app.datawrapper.de/account/api-tokens
 *   node docs/substack/push-datawrapper-table.mjs              # both tables
 *   node docs/substack/push-datawrapper-table.mjs --tokens     # token comparison only
 *   node docs/substack/push-datawrapper-table.mjs --libraries # capture libraries only
 *
 * Chart IDs (defaults):
 *   DATAWRAPPER_TOKENS_CHART_ID=ZUOL7
 *   DATAWRAPPER_LIBRARIES_CHART_ID=kJYQ5
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const token = process.env.DATAWRAPPER_TOKEN;
const args = new Set(process.argv.slice(2));
const pushTokens = args.size === 0 || args.has('--tokens');
const pushLibraries = args.size === 0 || args.has('--libraries');

/** Colors match docs/substack/index.html library landscape card */
const LIB_COLORS = {
  native: { head: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  procedural: { head: '#fffbeb', text: '#92400e', border: '#fcd34d' },
  foreign: { head: '#ecfdf5', text: '#15803d', border: '#86efac' },
  snapdom: { head: '#ecfdf5', text: '#15803d', border: '#059669' },
};

const LIBRARIES_INTRO = '';

const LIBRARIES_NOTES =
  '<strong>Why SnapDOM:</strong> near-instantaneous capture (&lt;10ms many times for complex webpages), no complex DOM traversals. Tradeoff: layout composition within an SVG foreignObject is full of quirks.';

const tables = [];
if (pushTokens) {
  tables.push({
    name: 'tokens',
    chartId: process.env.DATAWRAPPER_TOKENS_CHART_ID ?? 'ZUOL7',
    csvPath: path.join(dir, 'capture-comparison.csv'),
  });
}
if (pushLibraries) {
  tables.push({
    name: 'libraries',
    chartId: process.env.DATAWRAPPER_LIBRARIES_CHART_ID ?? 'kJYQ5',
    csvPath: path.join(dir, 'capture-libraries.csv'),
    patchMetadata: librariesMetadata(),
  });
}

function familyColumn(name, colors, { leftGutter = false } = {}) {
  const gutter = leftGutter ? { left: { width: 2, color: '#e2e8f0' } } : {};
  return {
    style: {
      'background-color': colors.head,
      color: colors.text,
      'font-weight': '700',
      'text-transform': 'uppercase',
      'font-size': '12px',
      'letter-spacing': '0.04em',
      padding: '12px 16px',
      'line-height': '1.3',
    },
    border: {
      top: { width: 1, color: colors.border },
      left: { width: 1, color: colors.border },
      right: { width: 1, color: colors.border },
      bottom: { width: 2, color: colors.border },
      ...gutter,
    },
  };
}

function familyBodyColumn(colors, { leftGutter = false } = {}) {
  const gutter = leftGutter ? { left: { width: 2, color: '#e2e8f0' } } : {};
  return {
    style: {
      'background-color': '#ffffff',
      color: '#475569',
      'vertical-align': 'top',
      'line-height': '1.5',
      'font-size': '14px',
      padding: '16px 18px',
    },
    border: {
      left: { width: 1, color: colors.border },
      right: { width: 1, color: colors.border },
      bottom: { width: 1, color: colors.border },
      ...gutter,
    },
  };
}

function librariesMetadata() {
  const col = (name, opts = {}) => ({
    name,
    type: 'text',
    visible: true,
    ...opts,
  });

  const nativeCol = 'Native compositor paint';
  const proceduralCol = 'Procedural canvas redraw';
  const foreignCol = 'foreignObject clone → SVG → canvas';

  return {
    title: 'DOM-to-screenshot capture libraries',
    metadata: {
      data: {
        transpose: false,
        'vertical-header': true,
        'horizontal-header': true,
        'column-format': {
          [nativeCol]: col(nativeCol),
          [proceduralCol]: col(proceduralCol),
          [foreignCol]: col(foreignCol),
        },
      },
      describe: {
        intro: LIBRARIES_INTRO,
        'source-name': '',
        'source-url': '',
      },
      annotate: {
        notes: LIBRARIES_NOTES,
      },
      publish: {
        'embed-width': 960,
        'embed-height': 480,
        blocks: {
          logo: { enabled: false },
          'get-the-data': { enabled: false },
        },
      },
      visualize: {
        markdown: true,
        'dark-mode-invert': true,
        columns: {
          [nativeCol]: familyColumn(nativeCol, LIB_COLORS.native),
          [proceduralCol]: familyColumn(proceduralCol, LIB_COLORS.procedural, { leftGutter: true }),
          [foreignCol]: familyColumn(foreignCol, LIB_COLORS.foreign, { leftGutter: true }),
        },
        rows: {
          '1': {
            style: { 'background-color': '#ffffff' },
            cells: {
              [nativeCol]: familyBodyColumn(LIB_COLORS.native),
              [proceduralCol]: familyBodyColumn(LIB_COLORS.procedural, { leftGutter: true }),
              [foreignCol]: familyBodyColumn(LIB_COLORS.foreign, { leftGutter: true }),
            },
          },
          '2': {
            style: { 'background-color': '#ffffff' },
            cells: {
              [nativeCol]: familyBodyColumn(LIB_COLORS.native),
              [proceduralCol]: familyBodyColumn(LIB_COLORS.procedural, { leftGutter: true }),
              [foreignCol]: {
                ...familyBodyColumn(LIB_COLORS.foreign, { leftGutter: true }),
                style: {
                  ...familyBodyColumn(LIB_COLORS.foreign, { leftGutter: true }).style,
                  'background-color': LIB_COLORS.snapdom.head,
                  color: LIB_COLORS.snapdom.text,
                  'font-weight': '600',
                },
              },
            },
          },
        },
      },
    },
  };
}

if (!token) {
  console.error('Missing DATAWRAPPER_TOKEN (set in env or repo root .envrc)');
  process.exit(1);
}

async function patchChart(chartId, body) {
  const res = await fetch(`https://api.datawrapper.de/v3/charts/${chartId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`patch ${chartId} failed (${res.status}): ${text}`);
  }
  return res.json();
}

for (const { name, chartId, csvPath, patchMetadata } of tables) {
  const csv = fs.readFileSync(csvPath, 'utf8');
  const res = await fetch(`https://api.datawrapper.de/v3/charts/${chartId}/data`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/csv',
    },
    body: csv,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`${name} upload failed (${res.status}): ${body}`);
    process.exit(1);
  }

  if (patchMetadata) {
    try {
      await patchChart(chartId, patchMetadata);
      console.log(`${name}: applied intro, notes, column colors`);
    } catch (err) {
      console.warn(`${name}: metadata patch warning — ${err.message}`);
      console.warn(`${name}: open editor to finish column styling if colors missing`);
    }
  }

  const pub = await fetch(`https://api.datawrapper.de/v3/charts/${chartId}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!pub.ok) {
    const body = await pub.text();
    console.error(`${name} publish failed (${pub.status}): ${body}`);
    process.exit(1);
  }

  const meta = await pub.json();
  console.log(`Uploaded ${path.basename(csvPath)} → chart ${chartId}`);
  console.log(`Edit: https://app.datawrapper.de/edit/${chartId}/`);
  console.log(`Embed: ${meta.publicUrl ?? meta.url ?? '(see editor)'}`);
}
