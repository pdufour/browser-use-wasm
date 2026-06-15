#!/usr/bin/env node
/**
 * Push docs/substack/capture-comparison.csv to a Datawrapper table chart.
 *
 *   export DATAWRAPPER_TOKEN=...   # from app.datawrapper.de/account/api-tokens
 *   export DATAWRAPPER_CHART_ID=ZUOL7   # optional, default ZUOL7
 *   node docs/substack/push-datawrapper-table.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const token = process.env.DATAWRAPPER_TOKEN;
const chartId = process.env.DATAWRAPPER_CHART_ID ?? 'ZUOL7';

if (!token) {
  console.error('Missing DATAWRAPPER_TOKEN (set in env or repo root .envrc)');
  process.exit(1);
}

const csvPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'capture-comparison.csv');
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
  console.error(`Datawrapper upload failed (${res.status}): ${body}`);
  process.exit(1);
}

console.log(`Uploaded ${csvPath} → chart ${chartId}`);
console.log(`Edit: https://app.datawrapper.de/edit/${chartId}/`);
