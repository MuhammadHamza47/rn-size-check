import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { analyzeBlob } from './analyze.js';
import { loadExplicitMap, loadProjectMaps, type LoadedMaps } from './node-sourcemaps.js';
import type { AnalyzeOptions, Report } from './types.js';

export * from './index.js';

export interface NodeAnalyzeOptions extends AnalyzeOptions {
  /** React Native project folder: finds the build's source maps for the npm package breakdown. */
  project?: string;
  /** A source map file (composed Hermes map or plain JS map). Takes precedence over `project`. */
  sourcemap?: string;
}

/** Analyze an APK/AAB on disk. The file is read lazily through a file-backed Blob. */
export async function analyze(filePath: string, options: NodeAnalyzeOptions = {}): Promise<Report> {
  // openAsBlob reports a missing file as a generic TypeError; stat gives callers a proper ENOENT.
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw Object.assign(new Error(`Not a file: ${filePath}`), { code: 'ENOENT' });
  }

  const { project, sourcemap, ...rest } = options;
  let maps: LoadedMaps = { notes: [] };
  if (sourcemap) maps = await loadExplicitMap(sourcemap);
  else if (project) maps = await loadProjectMaps(project);

  const report = await analyzeBlob(await openAsBlob(filePath), basename(filePath), {
    ...rest,
    sourceMaps: maps.input ?? rest.sourceMaps,
  });
  report.meta.warnings.unshift(...maps.notes);
  return report;
}
