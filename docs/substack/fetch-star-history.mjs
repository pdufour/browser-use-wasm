#!/usr/bin/env node
/**
 * Fetch GitHub star history for capture libraries + cache star-history.com SVGs.
 *
 *   node docs/substack/fetch-star-history.mjs
 *   GITHUB_TOKEN=ghp_… node docs/substack/fetch-star-history.mjs   # full history (recommended)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CAPTURE_REPOS = [
  { id: 'yorickshan/html2canvas-pro', label: 'html2canvas-pro', family: 'procedural', color: '#f59e0b' },
  { id: 'WICG/html-in-canvas', label: 'html-in-canvas', family: 'native', color: '#2563eb' },
  { id: 'bubkoo/html-to-image', label: 'html-to-image', family: 'foreign', color: '#7c3aed' },
  { id: 'zumerlab/snapdom', label: 'SnapDOM', family: 'foreign', color: '#059669' },
  { id: 'niklasvh/html2canvas', label: 'html2canvas', family: 'procedural', color: '#d97706' },
];

const JSON_PATH = path.join(__dirname, 'star-history.json');
const SVG_DIR = path.join(__dirname, 'star-history-svgs');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

function parseLink(linkHeader, rel) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m && m[2] === rel) return m[1];
  }
  return null;
}

function downsample(series, maxPoints = 140) {
  if (series.length <= maxPoints) return series;
  const out = [];
  const step = (series.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(series[Math.round(i * step)]);
  }
  return out;
}

function toDailyCumulative(stars) {
  stars.sort((a, b) => a.localeCompare(b));
  const byDay = new Map();
  for (const t of stars) {
    const day = t.slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  const days = [...byDay.keys()].sort();
  let total = 0;
  return days.map((date) => {
    total += byDay.get(date);
    return { date, count: total };
  });
}

async function fetchStargazers(repo) {
  const timestamps = [];
  let url = `https://api.github.com/repos/${repo}/stargazers?per_page=100`;
  let pages = 0;

  while (url) {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3.star+json',
        'User-Agent': 'wllama-example-substack-star-fetch/1.0',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    });

    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      throw new Error(
        `GitHub rate limit (403) after ${pages} pages for ${repo}. ` +
          `Remaining: ${remaining}. Set GITHUB_TOKEN for 5k/hr.`
      );
    }
    if (!res.ok) {
      throw new Error(`GitHub ${res.status} for ${repo}: ${await res.text()}`);
    }

    const batch = await res.json();
    for (const row of batch) timestamps.push(row.starred_at);
    pages += 1;
    url = parseLink(res.headers.get('link'), 'next');
    if (url) process.stdout.write(`  ${repo}: page ${pages}\r`);
  }

  process.stdout.write(`  ${repo}: ${pages} pages, ${timestamps.length} stars\n`);
  return { timestamps, pages, complete: true };
}

async function loadExisting() {
  try {
    return JSON.parse(await readFile(JSON_PATH, 'utf8'));
  } catch {
    return { fetchedAt: null, repos: {} };
  }
}

async function fetchStarHistorySvgs() {
  await mkdir(SVG_DIR, { recursive: true });
  const allRepos = CAPTURE_REPOS.map((r) => r.id).join(',');

  const jobs = [
    ['combined.svg', `repos=${encodeURIComponent(allRepos)}&type=date&size=laptop&legend=bottom-right`],
    ...CAPTURE_REPOS.map((r) => [
      `${r.label.replace(/\//g, '-')}.svg`,
      `repos=${encodeURIComponent(r.id)}&type=date&size=laptop`,
    ]),
  ];

  for (const [file, query] of jobs) {
    for (const theme of ['', 'dark']) {
      const suffix = theme === 'dark' ? '-dark' : '';
      const outFile = file.replace('.svg', `${suffix}.svg`);
      const url = `https://api.star-history.com/svg?${query}${theme ? '&theme=dark' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`star-history ${res.status} for ${outFile}`);
      await writeFile(path.join(SVG_DIR, outFile), await res.text());
      console.log(`  saved star-history-svgs/${outFile}`);
    }
  }
}

async function main() {
  console.log(`GitHub token: ${TOKEN ? 'yes' : 'no (60 req/hr — partial fetch likely)'}`);
  const existing = await loadExisting();
  const out = {
    fetchedAt: new Date().toISOString(),
    tokenUsed: Boolean(TOKEN),
    repos: { ...existing.repos },
  };

  for (const repo of CAPTURE_REPOS) {
    const cached = out.repos[repo.id];
    if (cached?.complete) {
      console.log(`skip ${repo.id} (cached ${cached.stars} stars)`);
      continue;
    }

    console.log(`fetch ${repo.id}…`);
    try {
      const { timestamps, pages, complete } = await fetchStargazers(repo.id);
      const series = downsample(toDailyCumulative(timestamps));
      out.repos[repo.id] = {
        label: repo.label,
        family: repo.family,
        color: repo.color,
        stars: timestamps.length,
        pages,
        complete,
        series,
      };
    } catch (err) {
      console.error(`  ${err.message}`);
      if (cached?.series?.length) {
        console.log(`  keeping prior partial cache (${cached.stars} stars)`);
        out.repos[repo.id] = cached;
      }
      break;
    }
  }

  await writeFile(JSON_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${JSON_PATH}`);

  console.log('download star-history.com SVG fallbacks…');
  await fetchStarHistorySvgs();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
