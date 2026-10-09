import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { analyzeBlob } from './analyze.js';
import type { AnalyzeOptions, Report } from './types.js';

export * from './index.js';

/** Analyze an APK/AAB on disk. The file is read lazily through a file-backed Blob. */
export async function analyze(filePath: string, options: AnalyzeOptions = {}): Promise<Report> {
  // openAsBlob reports a missing file as a generic TypeError; stat gives callers a proper ENOENT.
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw Object.assign(new Error(`Not a file: ${filePath}`), { code: 'ENOENT' });
  }
  return analyzeBlob(await openAsBlob(filePath), basename(filePath), options);
}
