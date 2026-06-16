import { toPng, toSvg } from 'html-to-image';
import { initStarCharts } from './star-charts.js';
import { initDriftDemo } from './drift-demo.mjs';
import { initDprRoundingDemo } from './dpr-rounding-demo.mjs';

const exportRoot = document.getElementById('export-root');
const captureExportRoot = document.getElementById('capture-export-root');
const libsExportRoot = document.getElementById('libs-export-root');
const snapdomExportRoot = document.getElementById('snapdom-export-root');
const fontMetricsExportRoot = document.getElementById('font-metrics-export-root');
const driftExportRoot = document.getElementById('drift-export-root');
const driftDebugExportRoot = document.getElementById('drift-debug-export-root');
const dprRoundingExportRoot = document.getElementById('dpr-rounding-export-root');
const starsExportRoot = document.getElementById('stars-export-root');
const btnTheme = document.getElementById('btn-theme');
const btnSvg = document.getElementById('btn-svg');

const themedRoots = [
  exportRoot,
  captureExportRoot,
  libsExportRoot,
  snapdomExportRoot,
  fontMetricsExportRoot,
  driftExportRoot,
  driftDebugExportRoot,
  dprRoundingExportRoot,
  starsExportRoot,
];

let starCharts = null;

function isDark() {
  return exportRoot.classList.contains('dark');
}

function setDark(dark) {
  for (const root of themedRoots) {
    root?.classList.toggle('dark', dark);
  }
  btnTheme.textContent = dark ? 'Light frame' : 'Dark frame';
  starCharts?.refresh(dark);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const COPY_ALT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="9" y="9" width="13" height="13" rx="2"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;

function isExportChrome(el) {
  return (
    el.classList?.contains('btn-download-png') ||
    el.classList?.contains('btn-copy-alt') ||
    el.classList?.contains('export-asset__actions')
  );
}

function extractAltText(node) {
  const clone = node.cloneNode(true);
  clone
    .querySelectorAll(
      '.btn-download-png, .btn-copy-alt, .export-asset__actions, [hidden], [aria-hidden="true"]'
    )
    .forEach((el) => el.remove());

  const lines = clone.innerText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  node.querySelectorAll('[aria-label]').forEach((el) => {
    if (isExportChrome(el) || el.closest('[hidden]') || el.getAttribute('aria-hidden') === 'true') {
      return;
    }
    const label = el.getAttribute('aria-label')?.trim();
    if (label && !lines.includes(label)) lines.push(label);
  });

  return lines.join('\n');
}

async function copyAltText(node) {
  const text = extractAltText(node);
  if (!text) throw new Error('No alt text found');
  await navigator.clipboard.writeText(text);
  return text;
}

function ensureCopyAltButton(pngBtn) {
  const targetId = pngBtn.dataset.exportTarget;
  if (!targetId) return null;

  const parent = pngBtn.parentElement;
  let wrap = pngBtn.closest('.export-asset__actions');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'export-asset__actions';
    if (parent?.classList.contains('star-card__head')) {
      wrap.classList.add('export-asset__actions--inline');
    }
    parent.insertBefore(wrap, pngBtn);
    wrap.appendChild(pngBtn);
  }

  let copyBtn = wrap.querySelector('.btn-copy-alt');
  if (!copyBtn) {
    copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-copy-alt';
    if (pngBtn.classList.contains('btn-download-png--sm')) {
      copyBtn.classList.add('btn-copy-alt--sm');
    }
    copyBtn.dataset.copyTarget = targetId;
    copyBtn.title = 'Copy alt text for Substack image';
    copyBtn.innerHTML = `${COPY_ALT_ICON}<span class="btn-copy-alt__label">Alt</span>`;
    wrap.insertBefore(copyBtn, pngBtn);
  } else {
    copyBtn.dataset.copyTarget = targetId;
  }
  return copyBtn;
}

async function captureNode(node, toImage) {
  node.classList.add('exporting');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    return await toImage(node, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: isDark() ? '#0f172a' : '#ffffff',
      filter: (el) => !isExportChrome(el),
    });
  } finally {
    node.classList.remove('exporting');
  }
}

async function downloadPng(node, filename) {
  const dataUrl = await captureNode(node, toPng);
  const res = await fetch(dataUrl);
  downloadBlob(await res.blob(), filename);
}

async function waitDriftReady() {
  const root = document.getElementById('drift-export-root');
  if (root?.dataset.driftReady === '1') return;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('drift demo timeout')), 30_000);
    const check = () => {
      if (root?.dataset.driftReady === '1') {
        clearTimeout(t);
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

async function waitDprRoundingReady() {
  const root = document.getElementById('dpr-rounding-export-root');
  if (root?.dataset.dprReady === '1') return;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('dpr rounding demo timeout')), 30_000);
    const check = () => {
      if (root?.dataset.dprReady === '1') {
        clearTimeout(t);
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

export function wireExportButtons(root = document) {
  root.querySelectorAll('.btn-download-png[data-export-target]').forEach((btn) => {
    const copyBtn = ensureCopyAltButton(btn);

    if (!btn.dataset.wired) {
      btn.dataset.wired = '1';
      btn.addEventListener('click', async () => {
        const node = document.getElementById(btn.dataset.exportTarget);
        if (!node) return;
        const prev = btn.disabled;
        btn.disabled = true;
        try {
          if (btn.dataset.exportTarget === 'drift-export-root') {
            await waitDriftReady();
          }
          if (btn.dataset.exportTarget === 'dpr-rounding-export-root') {
            await waitDprRoundingReady();
          }
          await downloadPng(node, btn.dataset.exportFilename);
        } finally {
          btn.disabled = prev;
        }
      });
    }

    if (copyBtn && !copyBtn.dataset.wired) {
      copyBtn.dataset.wired = '1';
      copyBtn.addEventListener('click', async () => {
        const node = document.getElementById(copyBtn.dataset.copyTarget);
        if (!node) return;
        const label = copyBtn.querySelector('.btn-copy-alt__label');
        const prevLabel = label?.textContent ?? 'Alt';
        copyBtn.disabled = true;
        try {
          await copyAltText(node);
          copyBtn.classList.add('is-copied');
          if (label) label.textContent = 'Copied';
          setTimeout(() => {
            copyBtn.classList.remove('is-copied');
            if (label) label.textContent = prevLabel;
          }, 1600);
        } catch (err) {
          console.error(err);
          if (label) label.textContent = 'Failed';
          setTimeout(() => {
            if (label) label.textContent = prevLabel;
          }, 1600);
        } finally {
          copyBtn.disabled = false;
        }
      });
    }
  });
}

wireExportButtons();

btnTheme.addEventListener('click', () => {
  setDark(!isDark());
});

btnSvg.addEventListener('click', async () => {
  const dataUrl = await captureNode(exportRoot, (node, opts) =>
    toSvg(node, { ...opts, pixelRatio: undefined })
  );
  const res = await fetch(dataUrl);
  downloadBlob(await res.blob(), 'browser-use-pipeline.svg');
});

await initDriftDemo(driftExportRoot);
await initDprRoundingDemo(dprRoundingExportRoot);
starCharts = await initStarCharts(isDark());
wireExportButtons(document.getElementById('star-chart-grid'));
