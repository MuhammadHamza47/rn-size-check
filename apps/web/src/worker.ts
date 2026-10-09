import './polyfills';
import { analyzeBlob, type AnalyzeOptions, type Report } from '@rnsc/core';

export type WorkerRequest = { file: File; options: AnalyzeOptions };
export type WorkerResponse = { ok: true; report: Report } | { ok: false; error: string };

// Runs the analysis off the main thread so the page stays responsive on 200 MB builds.
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { file, options } = event.data;
  let response: WorkerResponse;
  try {
    response = { ok: true, report: await analyzeBlob(file, file.name, options) };
  } catch (err) {
    response = { ok: false, error: (err as Error).message };
  }
  self.postMessage(response);
};
