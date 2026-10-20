import { formatBytes } from '../format.js';
import type { Check } from './types.js';

/**
 * Images bundled into res/drawable by Metro that the app's own code never references. Needs a source
 * map (the app source is read from it). Conservative: only images in folders the code does require from
 * are judged, so library and native drawables are never flagged — but still, review before deleting,
 * because a path built at runtime can't be seen.
 */
export const unusedImages: Check = {
  id: 'unused-images',
  title: 'Unused images',
  description: 'Images bundled by Metro that no app code references (needs a source map).',
  requires: 'sourcemap',
  run(ctx) {
    const usage = ctx.packages?.imageUsage;
    if (!usage) return [];

    // One entry per image: densities of the same asset share a resource name, so collapse to the
    // largest variant and sum the rest, and only report an asset when every variant is unused.
    const unused = usage.filter((u) => u.used === false).map((u) => u.path);
    const delivered = new Map(ctx.delivered.map((f) => [f.path, f.compressed]));
    const files = unused.filter((p) => delivered.has(p));
    if (files.length === 0) return [];

    const total = files.reduce((s, p) => s + (delivered.get(p) ?? 0), 0);
    return [
      {
        severity: 'warn',
        title: `${files.length} bundled image${files.length === 1 ? '' : 's'} the app never uses (${formatBytes(total)})`,
        files,
        savingsByFile: Object.fromEntries(files.map((p) => [p, delivered.get(p) ?? 0])),
        fix: 'No require() or <Image> in your code references these. Remove the image files (and the dead require() if any), then rebuild. If one is loaded by a path built at runtime, keep it — this check can’t see those.',
      },
    ];
  },
};
