/**
 * Browser runtime signals for WebGPU / COOP / memory (optional `?perfHud=1`).
 */

export interface RuntimeHints {
  crossOriginIsolated: boolean;
  webgpu: boolean;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  jspi: boolean;
  gpuVendor?: string | null;
  gpuArchitecture?: string | null;
  gpuDevice?: string | null;
  gpuDescription?: string | null;
}

export async function collectRuntimeHints(
  adapter: GPUAdapter | null = null
): Promise<RuntimeHints> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const hints: RuntimeHints = {
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    webgpu: !!navigator.gpu,
    deviceMemoryGb: nav.deviceMemory ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    jspi:
      typeof WebAssembly !== 'undefined' &&
      !!(WebAssembly as typeof WebAssembly & { Suspending?: unknown }).Suspending,
  };

  if (!adapter && navigator.gpu) {
    try {
      adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    } catch {
      adapter = null;
    }
  }

  if (adapter) {
    try {
      const a = adapter as GPUAdapter & {
        requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
      };
      const info = a.info ?? (await a.requestAdapterInfo?.());
      hints.gpuVendor = info?.vendor ?? null;
      hints.gpuArchitecture = info?.architecture ?? null;
      hints.gpuDevice = info?.device ?? null;
      hints.gpuDescription = info?.description ?? null;
    } catch {
      /* optional API */
    }
  }

  return hints;
}

export function formatRuntimeHintsLine(hints: RuntimeHints): string {
  const parts = [
    hints.crossOriginIsolated ? 'COI' : 'no-COI',
    hints.webgpu ? 'WebGPU' : 'no-GPU',
    hints.jspi ? 'JSPI' : 'no-JSPI',
  ];
  if (hints.deviceMemoryGb) parts.push(`${hints.deviceMemoryGb}GB RAM hint`);
  if (hints.gpuArchitecture) parts.push(String(hints.gpuArchitecture));
  return parts.join(' · ');
}

export async function attachPerfHud(statusEl: HTMLElement | null): Promise<void> {
  if (!statusEl || !new URLSearchParams(location.search).has('perfHud')) return;
  const hints = await collectRuntimeHints();
  statusEl.dataset.perfHud = formatRuntimeHintsLine(hints);
  statusEl.title = Object.entries(hints)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}
