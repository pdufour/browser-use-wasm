import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { browseProxyPlugin } from '../vite.browse-proxy.js';
import { fixturesPlugin } from '../vite.fixtures.js';
import { modelCachePlugin } from '../vite.model-cache.js';
import { wllamaWasmPlugin } from '../vite.wllama-wasm.js';
import { coopCoepCorpPlugin } from '../vite.coop-corp.js';
import { createDemoPagesPlugins } from '../vite.demo-pages.js';
import { wllamaPlugins } from '../vite.wllama-plugins.js';

const examplesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(examplesDir, '..');

/** Dev server — homepage at `/`, other demos via demoHtmlPlugin. */
export default defineConfig({
  root: path.join(examplesDir, 'home'),
  publicDir: false,
  plugins: [
    ...createDemoPagesPlugins(),
    react(),
    coopCoepCorpPlugin(),
    modelCachePlugin(),
    fixturesPlugin(),
    browseProxyPlugin(),
    wllamaWasmPlugin(),
    ...wllamaPlugins,
  ],
  optimizeDeps: {
    exclude: ['@wllama/wllama', 'browser-use-wasm'],
  },
  resolve: {
    alias: {
      'browser-use-wasm': path.join(repoRoot, 'src/index.ts'),
    },
  },
  worker: {
    format: 'es',
    plugins: () => wllamaPlugins,
  },
  server: {
    host: true,
    allowedHosts: true,
    fs: {
      allow: [repoRoot],
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  },
});
