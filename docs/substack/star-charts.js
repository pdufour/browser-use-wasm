/**
 * Star history charts — embed cached star-history.com SVGs + optional Inter charts from JSON.
 */

const SVG_FILES = {
  combined: 'combined.svg',
  'html-in-canvas': 'html-in-canvas.svg',
  html2canvas: 'html2canvas.svg',
  'html2canvas-pro': 'html2canvas-pro.svg',
  'html-to-image': 'html-to-image.svg',
  SnapDOM: 'SnapDOM.svg',
};

const INDIVIDUAL = [
  { key: 'html-in-canvas', repo: 'WICG/html-in-canvas' },
  { key: 'html2canvas', repo: 'niklasvh/html2canvas' },
  { key: 'html2canvas-pro', repo: 'yorickshan/html2canvas-pro' },
  { key: 'html-to-image', repo: 'bubkoo/html-to-image' },
  { key: 'SnapDOM', repo: 'zumerlab/snapdom' },
];

function svgUrl(baseFile, dark) {
  const file = dark ? baseFile.replace('.svg', '-dark.svg') : baseFile;
  return `./star-history-svgs/${file}`;
}

async function loadSvgInto(el, baseFile, dark) {
  const url = svgUrl(baseFile, dark);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`missing ${url}`);
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  const trimmed = text.trimStart();
  if (!type.includes('svg') && !trimmed.startsWith('<svg')) {
    throw new Error(`${url} returned HTML, not SVG — serve via npm run dev or host star-history-svgs/`);
  }
  el.innerHTML = text;
  const svg = el.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '100%');
    svg.removeAttribute('height');
    svg.style.display = 'block';
  }
}

function chartError(el, message) {
  el.innerHTML = `<p class="star-chart__empty">${message}</p>`;
}

function formatStars(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}

function renderInterChart(container, series, color, dark) {
  const w = 520;
  const h = 220;
  const pad = { t: 18, r: 16, b: 32, l: 48 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  if (!series?.length) {
    container.innerHTML = '<p class="star-chart__empty">No series data</p>';
    return;
  }

  const t0 = Date.parse(series[0].date);
  const t1 = Date.parse(series[series.length - 1].date);
  const maxY = Math.max(...series.map((p) => p.count), 1);

  const x = (d) => pad.l + ((Date.parse(d) - t0) / Math.max(t1 - t0, 1)) * innerW;
  const y = (c) => pad.t + innerH - (c / maxY) * innerH;

  const pts = series.map((p) => `${x(p.date).toFixed(1)},${y(p.count).toFixed(1)}`).join(' ');
  const gridColor = dark ? '#334155' : '#e2e8f0';
  const textColor = dark ? '#94a3b8' : '#64748b';
  const axisColor = dark ? '#475569' : '#cbd5e1';

  const yTicks = 4;
  const yLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = Math.round((maxY * i) / yTicks);
    const yy = y(v).toFixed(1);
    return `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" stroke="${gridColor}" stroke-width="1"/>
      <text x="${pad.l - 8}" y="${yy}" fill="${textColor}" font-size="10" text-anchor="end" dominant-baseline="middle">${formatStars(v)}</text>`;
  }).join('');

  const startYear = series[0].date.slice(0, 4);
  const endYear = series[series.length - 1].date.slice(0, 4);

  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Star history line chart">
    ${yLines}
    <line x1="${pad.l}" y1="${pad.t + innerH}" x2="${w - pad.r}" y2="${pad.t + innerH}" stroke="${axisColor}" stroke-width="1.5"/>
    <polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/>
    <text x="${pad.l}" y="${h - 8}" fill="${textColor}" font-size="10">${startYear}</text>
    <text x="${w - pad.r}" y="${h - 8}" fill="${textColor}" font-size="10" text-anchor="end">${endYear}</text>
  </svg>`;
}

const PNG_BTN = `<button type="button" class="btn-download-png btn-download-png--sm" data-export-target="STAR_ID" data-export-filename="STAR_FILE" title="Download PNG (2×)">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>
  </svg>
  PNG
</button>`;

function buildIndividualCards(root, json) {
  root.innerHTML = INDIVIDUAL.map(({ key, repo }) => {
    const meta = json?.repos?.[repo];
    const stars = meta?.stars ? formatStars(meta.stars) : '—';
    const complete = meta?.complete ? '' : ' · partial cache';
    const cardId = `star-card-${key}`;
    const filename = `browser-use-stars-${key}-substack.png`;
    const pngBtn = PNG_BTN.replace('STAR_ID', cardId).replace('STAR_FILE', filename);
    return `<article class="star-card export-asset" id="${cardId}" data-chart="${key}">
      <header class="star-card__head">
        <h4 class="star-card__title">${repo}</h4>
        <span class="star-card__stars">★ ${stars}${complete}</span>
        ${pngBtn}
      </header>
      <div class="star-card__chart star-card__chart--svg" aria-hidden="false"></div>
      <div class="star-card__chart star-card__chart--inter" hidden aria-hidden="true"></div>
    </article>`;
  }).join('');
}

export async function initStarCharts(isDark) {
  const combinedEl = document.querySelector('#star-chart-combined .star-chart__svg-host');
  const gridRoot = document.getElementById('star-chart-grid');
  if (!combinedEl || !gridRoot) return;

  let json = { repos: {} };
  try {
    json = await (await fetch('./star-history.json')).json();
  } catch {
    /* SVG fallbacks still work */
  }

  buildIndividualCards(gridRoot, json);

  async function paint(dark) {
    try {
      await loadSvgInto(combinedEl, SVG_FILES.combined, dark);
    } catch (err) {
      chartError(combinedEl, err.message);
    }

    for (const { key, repo } of INDIVIDUAL) {
      const card = gridRoot.querySelector(`[data-chart="${key}"]`);
      const svgHost = card.querySelector('.star-card__chart--svg');
      const interHost = card.querySelector('.star-card__chart--inter');
      const meta = json.repos?.[repo];

      try {
        await loadSvgInto(svgHost, SVG_FILES[key], dark);
      } catch (err) {
        chartError(svgHost, err.message);
      }

      if (meta?.complete && meta.series?.length) {
        renderInterChart(interHost, meta.series, meta.color, dark);
        interHost.hidden = false;
        svgHost.hidden = true;
      } else {
        interHost.hidden = true;
        svgHost.hidden = false;
      }
    }
  }

  await paint(isDark);
  return { refresh: paint };
}
