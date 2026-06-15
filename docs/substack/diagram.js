import { toPng, toSvg } from 'html-to-image';

const exportRoot = document.getElementById('export-root');
const captureExportRoot = document.getElementById('capture-export-root');
const libsExportRoot = document.getElementById('libs-export-root');
const snapdomExportRoot = document.getElementById('snapdom-export-root');
const driftExportRoot = document.getElementById('drift-export-root');
const btnTheme = document.getElementById('btn-theme');
const btnSvg = document.getElementById('btn-svg');
const btnPng = document.getElementById('btn-png');
const btnPngCapture = document.getElementById('btn-png-capture');
const btnPngLibs = document.getElementById('btn-png-libs');
const btnPngSnapdom = document.getElementById('btn-png-snapdom');
const btnPngDrift = document.getElementById('btn-png-drift');

const themedRoots = [
  exportRoot,
  captureExportRoot,
  libsExportRoot,
  snapdomExportRoot,
  driftExportRoot,
];

function isDark() {
  return exportRoot.classList.contains('dark');
}

function setDark(dark) {
  for (const root of themedRoots) {
    root?.classList.toggle('dark', dark);
  }
  btnTheme.textContent = dark ? 'Light frame' : 'Dark frame';
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

btnPng.addEventListener('click', () =>
  downloadPng(exportRoot, 'browser-use-pipeline-substack.png')
);

btnPngCapture.addEventListener('click', () =>
  downloadPng(captureExportRoot, 'browser-use-capture-substack.png')
);

btnPngLibs.addEventListener('click', () =>
  downloadPng(libsExportRoot, 'browser-use-libraries-substack.png')
);

btnPngSnapdom.addEventListener('click', () =>
  downloadPng(snapdomExportRoot, 'browser-use-snapdom-substack.png')
);

btnPngDrift.addEventListener('click', () =>
  downloadPng(driftExportRoot, 'browser-use-drift-substack.png')
);
