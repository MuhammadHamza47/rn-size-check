import { formatBytes } from '../format.js';
import type { Check } from './types.js';

/** Tiny duplicated helpers are common and not worth chasing. */
const MIN_DUPLICATE_BYTES = 10_000;

export const duplicatePackages: Check = {
  id: 'duplicate-packages',
  title: 'npm packages bundled in more than one copy',
  description: 'The same npm package bundled from several node_modules folders, usually two versions.',
  requires: 'sourcemap',
  run(ctx) {
    const pk = ctx.packages;
    if (!pk) return [];
    const dupes = pk.items.filter((p) => p.installs > 1 && p.duplicateBytes >= MIN_DUPLICATE_BYTES);
    if (dupes.length === 0) return [];
    const total = dupes.reduce((s, p) => s + p.duplicateBytes, 0);
    return [
      {
        severity: total >= 50_000 ? 'warn' : 'info',
        title: `${dupes.length} npm package${dupes.length === 1 ? ' is' : 's are'} bundled more than once (${formatBytes(total)} of extra copies)`,
        files: [],
        items: dupes.map((p) => ({ path: p.name, bytes: p.duplicateBytes, note: `${p.installs} copies` })),
        fix: 'Run npm ls <package> (or yarn why) to see which dependencies pull in each version, then align them, or force one version with "overrides" (npm) or "resolutions" (yarn).',
      },
    ];
  },
};
