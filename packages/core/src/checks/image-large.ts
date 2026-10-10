import { formatBytes } from '../format.js';
import type { Check } from './types.js';

const THRESHOLD = 100_000;
/** Typical lossy WebP (q≈80) saving over PNG/JPEG for photos and UI art. Refined with sharp later. */
const WEBP_SAVING = 0.4;

export const imageLarge: Check = {
  id: 'image-large',
  title: 'Large PNG/JPEG images',
  description: `PNG or JPEG files over ${THRESHOLD / 1000} KB that would usually be much smaller as WebP.`,
  requires: 'build',
  run(ctx) {
    const big = ctx.delivered
      .filter((f) => f.category === 'image' && /\.(png|jpe?g)$/i.test(f.path) && !/\.9\.png$/i.test(f.path))
      .filter((f) => f.uncompressed >= THRESHOLD)
      .sort((a, b) => b.compressed - a.compressed);
    if (big.length === 0) return [];
    const total = big.reduce((s, f) => s + f.compressed, 0);
    const savingsByFile = Object.fromEntries(big.map((f) => [f.path, Math.round(f.compressed * WEBP_SAVING)]));
    return [
      {
        severity: 'warn',
        title: `${big.length} PNG/JPEG image${big.length === 1 ? '' : 's'} over ${THRESHOLD / 1000} KB (${formatBytes(total)})`,
        files: big.map((f) => f.path),
        savingsByFile,
        estimate: true,
        fix: 'Convert to WebP (Android Studio: right-click → Convert to WebP, or `cwebp -q 80`). Also check the image is not far larger than it is displayed.',
      },
    ];
  },
};
