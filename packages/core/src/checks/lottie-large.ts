import { formatBytes } from '../format.js';
import type { Check } from './types.js';

/** Animations above this size are worth a look; most UI animations are well under it. */
const LARGE = 100_000;
/** Embedded raster images this big are the usual reason a Lottie file is heavy. */
const EMBEDDED_IMAGES = 20_000;

export const lottieLarge: Check = {
  id: 'lottie-large',
  title: 'Large Lottie animations',
  description: 'Lottie animations shipped as files that are large, usually because raster images are embedded in them.',
  requires: 'build',
  run(ctx) {
    const heavy = ctx.lottie.filter((l) => l.uncompressed >= LARGE || l.embeddedImageBytes >= EMBEDDED_IMAGES);
    if (heavy.length === 0) return [];
    const total = heavy.reduce((s, l) => s + l.compressed, 0);
    const unpacked = heavy.reduce((s, l) => s + l.uncompressed, 0);
    const withImages = heavy.filter((l) => l.embeddedImages > 0).length;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    return [
      {
        // Vector-only JSON compresses very well, so it mostly costs parse time and memory rather than
        // download size. Embedded base64 images barely compress, which is what makes a download heavy.
        severity: withImages > 0 ? 'warn' : 'info',
        title:
          `${plural(heavy.length, 'Lottie animation')} ${heavy.length === 1 ? 'takes' : 'take'} ${formatBytes(total)} (${formatBytes(unpacked)} unpacked)` +
          (withImages > 0 ? `; ${withImages} ${withImages === 1 ? 'has' : 'have'} images embedded inside` : ''),
        files: heavy.map((l) => l.path),
        items: heavy.map((l) => ({
          path: l.path,
          bytes: l.compressed,
          note:
            l.embeddedImages > 0
              ? `${plural(l.embeddedImages, 'embedded image')}, ${formatBytes(l.embeddedImageBytes)}`
              : l.format === 'dotlottie'
                ? 'dotLottie file'
                : undefined,
        })),
        fix:
          withImages > 0
            ? 'Embedded images (base64 PNG/JPG inside the JSON) are the usual cause: compress them or swap them for vector shapes in After Effects / LottieFiles, or move to dotLottie with WebP images. Also check frame count and layers on long or looping animations.'
            : 'Vector-only animations compress well in the download, but the app parses the full unpacked JSON. Trim unused layers and frames on the biggest ones, especially animations that loop or play on startup.',
      },
    ];
  },
};
