import type { AnalyzeOptions, Report } from '@rnsc/core';
import type { WorkerRequest, WorkerResponse } from './worker';

const spawn = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

/**
 * A worker started ahead of time, so its code is already downloaded when the user drops a file
 * (scanning then works even if the connection drops after the page has loaded).
 */
let ready: Worker | null = null;

export function prewarmWorker(): void {
  ready ??= spawn();
}

/** Runs the analysis in a Web Worker. Each run gets a fresh worker so memory never piles up. */
export function analyzeInWorker(file: File, options: AnalyzeOptions): Promise<Report> {
  const worker = ready ?? spawn();
  ready = null;
  return new Promise<Report>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.ok) resolve(event.data.report);
      else reject(new Error(friendlyError(event.data.error)));
    };
    worker.onerror = (event) => reject(new Error(event.message || 'The analyzer crashed.'));
    worker.postMessage({ file, options } satisfies WorkerRequest);
  }).finally(() => {
    worker.terminate();
    prewarmWorker();
  });
}

function friendlyError(message: string): string {
  if (/not a zip|central directory|local header/i.test(message)) {
    return 'This file is not a valid .aab or .apk. Pick the build from android/app/build/outputs/.';
  }
  return message;
}
