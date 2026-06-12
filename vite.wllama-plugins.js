/** Shared wllama browser patches — used by src lib build and examples dev server. */

const NODE_ENV_DETECT =
  'ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer"';
const BROWSER_ONLY_ENV = 'ENVIRONMENT_IS_NODE=false';

/** llama.cpp must use browser Workers, never Node worker_threads (even if Vite polyfills process). */
export function wllamaForceBrowserPlugin() {
  return {
    name: 'wllama-force-browser',
    transform(code, id) {
      if (!id.includes('@wllama/wllama')) return;
      if (!code.includes(NODE_ENV_DETECT)) return;
      return code.replaceAll(NODE_ENV_DETECT, BROWSER_ONLY_ENV);
    },
  };
}

/** Forward image_min_tokens into WASM load_req (browser bundle only, not a Node runtime). */
export function wllamaShowUIGroundingPlugin() {
  const anchor = '        jinja: params.jinja\n      });';
  const replacement = `        jinja: params.jinja,
        image_min_tokens: params.image_min_tokens,
        image_max_tokens: params.image_max_tokens
      });`;

  return {
    name: 'wllama-showui-grounding',
    transform(code, id) {
      if (!id.includes('@wllama/wllama') || !id.endsWith('/esm/index.js')) return;
      if (code.includes('image_min_tokens: params.image_min_tokens')) return code;
      if (!code.includes(anchor)) {
        console.warn('[wllama-showui-grounding] patch anchor missing');
        return;
      }
      return code.replace(anchor, replacement);
    },
  };
}

export const wllamaPlugins = [wllamaForceBrowserPlugin(), wllamaShowUIGroundingPlugin()];
