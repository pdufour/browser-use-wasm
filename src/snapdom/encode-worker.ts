/** Encode ImageBitmap → PNG/JPEG ArrayBuffer off the main thread (pooled canvas). */

declare const self: DedicatedWorkerGlobalScope;

/** Request posted by `CaptureWorkerClient.encodeBitmap`. */
export interface EncodeWorkerRequest {
  id: string;
  bitmap: ImageBitmap;
  encoding?: 'image/png' | 'image/jpeg';
  quality?: number;
}

export interface EncodeWorkerPerfMark {
  label: string;
  ms: number;
  detail?: string;
}

export interface EncodeWorkerPerf {
  title: string;
  marks: EncodeWorkerPerfMark[];
  totalMs: number;
}

export interface EncodeWorkerSuccess {
  id: string;
  ok: true;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  encoding: string;
  perf: EncodeWorkerPerf;
}

export interface EncodeWorkerFailure {
  id: string;
  ok: false;
  message: string;
  perf: EncodeWorkerPerf;
}

export type EncodeWorkerResponse = EncodeWorkerSuccess | EncodeWorkerFailure;

let pooledCanvas: OffscreenCanvas | null = null;
let pooledW = 0;
let pooledH = 0;

function getPooledCanvas(width: number, height: number): OffscreenCanvas {
  if (!pooledCanvas || pooledW !== width || pooledH !== height) {
    pooledCanvas = new OffscreenCanvas(width, height);
    pooledW = width;
    pooledH = height;
  }
  return pooledCanvas;
}

self.onmessage = async (event: MessageEvent<EncodeWorkerRequest>) => {
  const { id, bitmap, encoding = 'image/png', quality = 0.85 } = event.data;
  const t0 = performance.now();
  const isJpeg = encoding === 'image/jpeg';
  const marks: EncodeWorkerPerfMark[] = [];
  const mark = (label: string, detail?: string) => {
    marks.push({ label, ms: performance.now() - t0, detail });
  };

  try {
    const { width, height } = bitmap;
    mark('start', `${width}×${height} ${encoding}`);
    const canvas = getPooledCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    mark('drawImage');

    const blob = await canvas.convertToBlob(
      isJpeg ? { type: 'image/jpeg', quality } : { type: 'image/png' }
    );
    mark('convertToBlob', `${(blob.size / 1024).toFixed(0)} KiB`);

    const buffer = await blob.arrayBuffer();
    mark('arrayBuffer');

    self.postMessage(
      {
        id,
        ok: true,
        buffer,
        width,
        height,
        encoding,
        perf: {
          title: isJpeg ? 'Capture JPEG (worker)' : 'Capture PNG (worker)',
          marks,
          totalMs: performance.now() - t0,
        },
      } satisfies EncodeWorkerSuccess,
      [buffer]
    );
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      perf: {
        title: isJpeg ? 'Capture JPEG (worker)' : 'Capture PNG (worker)',
        marks,
        totalMs: performance.now() - t0,
      },
    } satisfies EncodeWorkerFailure);
  }
};
