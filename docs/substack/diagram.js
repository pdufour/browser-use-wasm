import { toPng, toSvg } from 'html-to-image';
import { initStarCharts } from './star-charts.js';

const exportRoot = document.getElementById('export-root');
const captureExportRoot = document.getElementById('capture-export-root');
const libsExportRoot = document.getElementById('libs-export-root');
const snapdomExportRoot = document.getElementById('snapdom-export-root');
const driftExportRoot = document.getElementById('drift-export-root');
const starsExportRoot = document.getElementById('stars-export-root');
const btnTheme = document.getElementById('btn-theme');
const btnSvg = document.getElementById('btn-svg');

const themedRoots = [
  exportRoot,
  captureExportRoot,
  libsExportRoot,
  snapdomExportRoot,
  driftExportRoot,
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
      filter: (el) => !(el.classList?.contains('btn-download-png')),
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

starCharts = await initStarCharts(isDark());
wireExportButtons(document.getElementById('star-chart-grid'));
