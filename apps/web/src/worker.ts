import './polyfills';
import { analyzeBlob, type AnalyzeOptions, type Report, type SourceMapInput } from '@rnsc/core';

export type WorkerRequest = { file: File; options: AnalyzeOptions; maps: File[] };
export type WorkerResponse = { ok: true; report: Report } | { ok: false; error: string };

/**
 * React Native's Gradle build writes index.android.bundle.map (the map of the shipped bundle) and
 * index.android.bundle.packager.map (adds JSON modules such as Lottie files). Either name is accepted.
 */
async function readMaps(maps: File[]): Promise<{ input?: SourceMapInput; notes: string[] }> {
  if (maps.length === 0) return { notes: [] };
  const parsed: { name: string; json: unknown }[] = [];
  for (const f of maps) {
    try {
      parsed.push({ name: f.name, json: JSON.parse(await f.text()) });
    } catch {
      throw new Error(`${f.name} is not a source map (it isn't valid JSON).`);
    }
  }
  const main = parsed.find((m) => !/packager/i.test(m.name));
  const packager = parsed.find((m) => /packager/i.test(m.name));
  if (!main) {
    return {
      notes: [
        'Only the packager map was added. Add index.android.bundle.map too (android/app/build/generated/sourcemaps/react/<variant>/) for the npm package breakdown.',
      ],
    };
  }
  return { input: { main: main.json, packager: packager?.json, names: parsed.map((m) => m.name) }, notes: [] };
}

// Runs the analysis off the main thread so the page stays responsive on 200 MB builds.
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { file, options, maps } = event.data;
  let response: WorkerResponse;
  try {
    const { input, notes } = await readMaps(maps);
    const report = await analyzeBlob(file, file.name, { ...options, sourceMaps: input });
    report.meta.warnings.unshift(...notes);
    response = { ok: true, report };
  } catch (err) {
    response = { ok: false, error: (err as Error).message };
  }
  self.postMessage(response);
};
