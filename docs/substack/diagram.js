import { toPng, toSvg } from 'html-to-image';
import { initStarCharts } from './star-charts.js';
import { initDriftDemo } from './drift-demo.mjs';
import { initDprRoundingDemo } from './dpr-rounding-demo.mjs';

const exportRoot = document.getElementById('export-root');
const captureExportRoot = document.getElementById('capture-export-root');
const libsExportRoot = document.getElementById('libs-export-root');
const snapdomExportRoot = document.getElementById('snapdom-export-root');
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

async function captureNode(node, toImage) {
  node.classList.add('exporting');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    return await toImage(node, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: isDark() ? '#0f172a' : '#ffffff',
      filter: (el) => !el.classList?.contains('btn-download-png'),
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
    if (btn.dataset.wired) return;
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
