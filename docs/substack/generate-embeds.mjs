#!/usr/bin/env node
/**
 * Write docs/substack/embeds/*.html from embed-shell.html + embeds.json.
 * Run after push-datawrapper-table.mjs updates a revision.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'embeds.json'), 'utf8'));
const shell = fs.readFileSync(path.join(dir, 'embed-shell.html'), 'utf8');
const outDir = path.join(dir, 'embeds');
fs.mkdirSync(outDir, { recursive: true });

for (const [key, entry] of Object.entries(manifest)) {
  const html = shell
    .replaceAll('<!-- DW_TITLE -->', entry.title)
    .replaceAll('<!-- DW_CHART_ID -->', entry.chartId)
    .replaceAll('<!-- DW_REVISION -->', String(entry.revision))
    .replaceAll('<!-- DW_HEIGHT -->', String(entry.height));
  const out = path.join(outDir, entry.file);
  fs.writeFileSync(out, html);
  console.log(`wrote ${path.relative(dir, out)} (${key} ${entry.chartId}/${entry.revision})`);
}
