import { formatBytes } from '../format.js';
import type { Check } from './types.js';

export const sourcemapInBuild: Check = {
  id: 'sourcemap-in-build',
  title: 'Source maps shipped in the build',
  description: 'Source map files are only needed for crash symbolication and should not be shipped to users.',
  requires: 'build',
  run(ctx) {
    const maps = ctx.delivered.filter((f) => /\.map$/i.test(f.path));
    if (maps.length === 0) return [];
    const total = maps.reduce((s, f) => s + f.compressed, 0);
    return [
      {
        severity: 'error',
        title: `${maps.length} source map file${maps.length === 1 ? '' : 's'} shipped to users (${formatBytes(total)})`,
        files: maps.map((f) => f.path),
        savingsByFile: Object.fromEntries(maps.map((f) => [f.path, f.compressed])),
        fix: 'Remove .map files from android/app/src/main/assets and upload them to your crash reporter (Sentry, Crashlytics) instead.',
      },
    ];
  },
};
