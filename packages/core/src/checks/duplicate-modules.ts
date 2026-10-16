import { formatBytes } from '../format.js';
import type { Check } from './types.js';

export const duplicateModules: Check = {
  id: 'duplicate-modules',
  title: 'Same file bundled twice in the JS',
  description: 'App files with identical content under different paths; Metro bundles each path as its own module.',
  requires: 'sourcemap',
  run(ctx) {
    const groups = ctx.packages?.duplicateModules ?? [];
    if (groups.length === 0) return [];
    const extraCopies = groups.reduce((s, g) => s + g.paths.length - 1, 0);
    const extraBytes = groups.reduce((s, g) => s + g.bytes * (g.paths.length - 1), 0);
    return [
      {
        severity: extraBytes >= 50_000 ? 'warn' : 'info',
        title: `${extraCopies} file${extraCopies === 1 ? ' is' : 's are'} bundled twice in the JS (${formatBytes(extraBytes)} of duplicate source)`,
        files: groups.flatMap((g) => g.paths),
        items: groups.flatMap((g) =>
          g.paths.slice(1).map((path) => ({ path, bytes: g.bytes, note: `same as ${g.paths[0]}` })),
        ),
        fix: 'Keep one copy and require() it from both places. Each path is a separate module to Metro, so identical files are bundled (and for Hermes, compiled) twice.',
      },
    ];
  },
};
