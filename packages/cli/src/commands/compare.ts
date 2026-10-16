import { readFile, writeFile } from 'node:fs/promises';
import {
  analyze,
  compareReports,
  comparisonToMarkdown,
  formatBytes,
  InvalidOptionError,
  reportFromJson,
  UnsupportedArtifactError,
  ZipError,
  type Report,
} from '@rnsc/core/node';
import { renderComparison } from '../render/compare-terminal.js';
import { EXIT } from './analyze.js';

export interface CompareCliOptions {
  /** Source maps for the new build: a project folder, or `true` for the current folder. */
  project?: string | boolean;
  sourcemap?: string;
  oldSourcemap?: string;
  abi?: string;
  density?: string;
  json?: string;
  markdown?: string;
  format: 'pretty' | 'plain' | 'json' | 'markdown';
  top: string;
  maxGrowth?: string;
  ignore?: string;
}

export async function runCompare(oldPath: string, newPath: string, opts: CompareCliOptions, version: string): Promise<number> {
  const project = opts.project === true ? process.cwd() : opts.project || undefined;
  const common = { abi: opts.abi, density: opts.density, ignore: opts.ignore?.split(',').map((s) => s.trim()), toolVersion: version };
  let oldReport: Report;
  let newReport: Report;
  try {
    oldReport = await load(oldPath, { ...common, sourcemap: opts.oldSourcemap });
    newReport = await load(newPath, { ...common, sourcemap: opts.sourcemap, project });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return fail(`File not found: ${e.path ?? e.message}`, EXIT.badInput);
    if (err instanceof UnsupportedArtifactError || err instanceof InvalidOptionError) return fail(e.message, EXIT.badInput);
    if (err instanceof ZipError) return fail(`Not a valid APK/AAB (zip) file: ${e.message}`, EXIT.badInput);
    throw err;
  }

  const cmp = compareReports(oldReport, newReport);
  if (opts.json) await writeFile(opts.json, JSON.stringify(cmp, null, 2));
  if (opts.markdown) await writeFile(opts.markdown, `${comparisonToMarkdown(cmp)}\n`);

  if (opts.format === 'json') process.stdout.write(`${JSON.stringify(cmp, null, 2)}\n`);
  else if (opts.format === 'markdown') process.stdout.write(`${comparisonToMarkdown(cmp)}\n`);
  else {
    const color = opts.format === 'pretty' && process.stdout.isTTY === true && !process.env.NO_COLOR;
    process.stdout.write(renderComparison(cmp, { color, top: Number(opts.top) || 10 }));
  }

  if (opts.maxGrowth) {
    const limit = Number(opts.maxGrowth) * 1_000_000; // decimal MB, same as the report and Play Console
    if (cmp.sizes.download.change > limit) {
      process.stderr.write(
        `Size growth over the limit: download grew ${formatBytes(cmp.sizes.download.change)} > ${opts.maxGrowth} MB\n`,
      );
      return EXIT.failed;
    }
  }
  return EXIT.ok;
}

/** A saved report (.json) is read as is; anything else is analyzed as a build. */
async function load(path: string, options: Parameters<typeof analyze>[1] & { project?: string }): Promise<Report> {
  if (!/\.json$/i.test(path)) return analyze(path, options);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw err;
    throw new InvalidOptionError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
  if (options.project || options.sourcemap) {
    process.stderr.write(`Note: ${path} is a saved report, so its source maps can't be added now.\n`);
  }
  return reportFromJson(value, path);
}

function fail(message: string, code: number): number {
  process.stderr.write(`rn-size-check: ${message}\n`);
  return code;
}
