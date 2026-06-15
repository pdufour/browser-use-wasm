import { toPng, toSvg } from 'html-to-image';

const exportRoot = document.getElementById('export-root');
const btnTheme = document.getElementById('btn-theme');
const btnSvg = document.getElementById('btn-svg');
const btnPng = document.getElementById('btn-png');

function isDark() {
  return exportRoot.classList.contains('dark');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

btnTheme.addEventListener('click', () => {
  exportRoot.classList.toggle('dark');
  btnTheme.textContent = isDark() ? 'Light frame' : 'Dark frame';
});

async function captureExportRoot(toImage) {
  exportRoot.classList.add('exporting');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    return await toImage(exportRoot, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: isDark() ? '#0f172a' : '#ffffff',
    });
  } finally {
    exportRoot.classList.remove('exporting');
  }
}

btnSvg.addEventListener('click', async () => {
  const dataUrl = await captureExportRoot((node, opts) => toSvg(node, { ...opts, pixelRatio: undefined }));
  const res = await fetch(dataUrl);
  downloadBlob(await res.blob(), 'browser-use-pipeline.svg');
});

btnPng.addEventListener('click', async () => {
  const dataUrl = await captureExportRoot(toPng);
  const res = await fetch(dataUrl);
  downloadBlob(await res.blob(), 'browser-use-pipeline-substack.png');
});
