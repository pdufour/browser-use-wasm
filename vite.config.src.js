import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { wllamaPlugins } from './vite.wllama-plugins.js';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/** Library build — `src/` embed API only → `dist/lib/`. */
export default defineConfig({
  root: repoRoot,
  build: {
    outDir: 'dist/lib',
    emptyOutDir: true,
    lib: {
      entry: path.join(repoRoot, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: (id) =>
        id.startsWith('@wllama/') ||
        id.startsWith('@zumer/') ||
        id === 'react' ||
        id === 'react-dom' ||
        id.startsWith('react/'),
    },
  },
  plugins: [...wllamaPlugins],
  optimizeDeps: {
    exclude: ['@wllama/wllama'],
  },
  worker: {
    format: 'es',
    plugins: () => wllamaPlugins,
  },
});
