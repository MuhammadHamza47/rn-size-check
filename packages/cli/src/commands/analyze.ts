import { writeFile } from 'node:fs/promises';
import { analyze, formatBytes, InvalidOptionError, UnsupportedArtifactError, ZipError } from '@rnsc/core/node';
import { renderTerminal } from '../render/terminal.js';

export interface AnalyzeCliOptions {
  abi?: string;
  density?: string;
  json?: string;
  format: 'pretty' | 'plain' | 'json';
  top: string;
  budget?: string;
  ignore?: string;
}

export const EXIT = { ok: 0, failed: 1, badInput: 2, internal: 3 } as const;

export async function runAnalyze(build: string, opts: AnalyzeCliOptions, version: string): Promise<number> {
  let report;
  try {
    report = await analyze(build, {
      abi: opts.abi,
      density: opts.density,
      ignore: opts.ignore?.split(',').map((s) => s.trim()),
      toolVersion: version,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return fail(
        `File not found: ${build}\n` +
          'Pass the path to a release build, usually one of:\n' +
          '  android/app/build/outputs/bundle/release/app-release.aab\n' +
          '  android/app/build/outputs/apk/release/app-release.apk',
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
    const budgetBytes = Number(opts.budget) * 1024 * 1024;
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
