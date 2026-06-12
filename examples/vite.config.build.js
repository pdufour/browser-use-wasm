import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { browseProxyPlugin } from '../vite.browse-proxy.js';
import { fixturesPlugin } from '../vite.fixtures.js';
import { modelCachePlugin } from '../vite.model-cache.js';
import { wllamaWasmPlugin } from '../vite.wllama-wasm.js';
import { coopCoepCorpPlugin } from '../vite.coop-corp.js';
import { wllamaPlugins } from '../vite.wllama-plugins.js';

const examplesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(examplesDir, '..');

const mpaInput = {
  index: path.join(examplesDir, 'home/index.html'),
  operator: path.join(examplesDir, 'operator/index.html'),
  gallery: path.join(examplesDir, 'gallery/index.html'),
  browse: path.join(examplesDir, 'browse/index.html'),
  video: path.join(examplesDir, 'video/index.html'),
};

/** GitHub Pages project site: https://pdufour.github.io/browser-use-wasm/ */
const pagesBase = process.env.PAGES_BASE ?? '/browser-use-wasm/';

/** Production build — repo-root Vite root avoids cross-root MPA path errors. */
export default defineConfig({
  base: pagesBase,
  root: repoRoot,
  publicDir: false,
  build: {
    outDir: path.join(repoRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: mpaInput,
    },
  },
  plugins: [
    react(),
    coopCoepCorpPlugin(),
    modelCachePlugin(),
    fixturesPlugin(),
    browseProxyPlugin(),
    wllamaWasmPlugin(),
    ...wllamaPlugins,
  ],
  resolve: {
    alias: {
      'browser-use-wasm': path.join(repoRoot, 'src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@wllama/wllama', 'browser-use-wasm'],
  },
  worker: {
    format: 'es',
    plugins: () => wllamaPlugins,
  },
});
