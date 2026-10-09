import type { AnalyzeOptions, Report } from '@rnsc/core';
import type { WorkerRequest, WorkerResponse } from './worker';

/** Runs the analysis in a Web Worker. A fresh worker per run keeps memory from piling up. */
export function analyzeInWorker(file: File, options: AnalyzeOptions): Promise<Report> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.report);
      else reject(new Error(friendlyError(event.data.error)));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'The analyzer crashed.'));
    };
    worker.postMessage({ file, options } satisfies WorkerRequest);
  });
}

function friendlyError(message: string): string {
  if (/not a zip|central directory|local header/i.test(message)) {
    return 'This file is not a valid .aab or .apk. Pick the build from android/app/build/outputs/.';
  }
  return message;
}
