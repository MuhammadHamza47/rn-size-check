import { writeFile } from 'node:fs/promises';
import { analyze, formatBytes, InvalidOptionError, UnsupportedArtifactError, ZipError } from '@rnsc/core/node';
import { renderTerminal } from '../render/terminal.js';
import { findReleaseBuild } from './find-build.js';

export interface AnalyzeCliOptions {
  /** A folder, or `true` when --project is given without one (= the current folder). */
  project?: string | boolean;
  sourcemap?: string;
  abi?: string;
  density?: string;
  json?: string;
  format: 'pretty' | 'plain' | 'json';
  top: string;
  budget?: string;
  ignore?: string;
}

export const EXIT = { ok: 0, failed: 1, badInput: 2, internal: 3 } as const;

export async function runAnalyze(buildArg: string | undefined, opts: AnalyzeCliOptions, version: string): Promise<number> {
  const project = opts.project === true ? process.cwd() : opts.project || undefined;
  let build = buildArg;
  if (!build) {
    const found = await findReleaseBuild(project ?? process.cwd());
    if (!found) {
      return fail(
        'No build given, and no release .aab or .apk found under android/app/build/outputs.\n' +
          'Build one first (cd android && ./gradlew bundleRelease), or pass its path:\n' +
          '  npx rn-size-check android/app/build/outputs/bundle/release/app-release.aab',
        EXIT.badInput,
      );
    }
    build = found;
    if (opts.format !== 'json') process.stderr.write(`Using ${build} (newest release build)\n`);
  }
  let report;
  try {
    report = await analyze(build, {
      project,
      sourcemap: opts.sourcemap,
      abi: opts.abi,
      density: opts.density,
      ignore: opts.ignore?.split(',').map((s) => s.trim()),
      toolVersion: version,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      const found = await findReleaseBuild(project ?? process.cwd());
      return fail(
        `File not found: ${build}\n` +
          (found
            ? `This project has a release build at ${found}\nUse that path, or leave the path out to use the newest release build.`
            : 'Pass the path to a release build, usually one of:\n' +
              '  android/app/build/outputs/bundle/release/app-release.aab\n' +
              '  android/app/build/outputs/apk/release/app-release.apk'),
        EXIT.badInput,
      );
    }
    if (err instanceof UnsupportedArtifactError || err instanceof InvalidOptionError) return fail(e.message, EXIT.badInput);
    if (err instanceof ZipError) return fail(`${build} is not a valid APK/AAB (zip) file: ${e.message}`, EXIT.badInput);
    throw err;
  }

  if (opts.json) await writeFile(opts.json, JSON.stringify(report, null, 2));

  if (opts.format === 'json') {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const color = opts.format === 'pretty' && process.stdout.isTTY === true && !process.env.NO_COLOR;
    process.stdout.write(renderTerminal(report, { color, top: Number(opts.top) || 10 }));
    if (opts.json) process.stdout.write(`  Report saved to ${opts.json}\n\n`);
  }

  if (opts.budget) {
    const budgetBytes = Number(opts.budget) * 1_000_000; // decimal MB, same as the report and Play Console
    if (report.sizes.download.bytes > budgetBytes) {
      process.stderr.write(
        `Size budget exceeded: download ${formatBytes(report.sizes.download.bytes)} > budget ${opts.budget} MB\n`,
      );
      return EXIT.failed;
    }
  }
  return EXIT.ok;
}

function fail(message: string, code: number): number {
  process.stderr.write(`rn-size-check: ${message}\n`);
  return code;
}
