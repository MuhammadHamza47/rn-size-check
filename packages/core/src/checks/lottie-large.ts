import { formatBytes } from '../format.js';
import type { Check } from './types.js';

/** Animations above this size are worth a look; most UI animations are well under it. */
const LARGE = 100_000;
/** Embedded raster images this big are the usual reason a Lottie file is heavy. */
const EMBEDDED_IMAGES = 20_000;
/** require()d animations costing this much download together are worth moving out of the JS bundle. */
const BUNDLED_WARN = 300_000;

export const lottieLarge: Check = {
  id: 'lottie-large',
  title: 'Large Lottie animations',
  description:
    'Large Lottie animations: files in res/raw or assets, and (with a source map) JSON the code require()s into the JS bundle.',
  requires: 'build',
  run(ctx) {
    const heavy = ctx.lottie.filter((l) => l.uncompressed >= LARGE || l.embeddedImageBytes >= EMBEDDED_IMAGES);
    if (heavy.length === 0) return [];
    const total = heavy.reduce((s, l) => s + l.compressed, 0);
    const unpacked = heavy.reduce((s, l) => s + l.uncompressed, 0);
    const withImages = heavy.filter((l) => l.embeddedImages > 0).length;
    const bundled = heavy.filter((l) => l.format === 'bundled');
    const bundledDownload = bundled.reduce((s, l) => s + l.compressed, 0);
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

    const fixes: string[] = [];
    if (withImages > 0) {
      fixes.push(
        'Embedded images (base64 PNG/JPG inside the JSON) barely compress: shrink them or swap them for vector shapes in After Effects / LottieFiles, or use dotLottie with WebP images.',
      );
    }
    if (bundled.length > 0) {
      fixes.push(
        "Animations you require() are compiled into the JS bundle, so every user downloads and loads them at startup. Load the big ones from a URL or from native assets instead (lottie-react-native's source also accepts a {uri}), and remove copies of the same file.",
      );
    }
    fixes.push('Trim unused layers and frames on the biggest animations, especially ones that loop or play on startup.');

    return [
      {
        // Vector-only JSON files compress very well, so on their own they mostly cost parse time and
        // memory. Embedded images, or a lot of animation compiled into the JS bundle, cost real download.
        severity: withImages > 0 || bundledDownload >= BUNDLED_WARN ? 'warn' : 'info',
        title:
          `${plural(heavy.length, 'Lottie animation')}${bundled.length === heavy.length ? ' in the JS bundle' : ''} ${heavy.length === 1 ? 'takes' : 'take'} ~${formatBytes(total)} (${formatBytes(unpacked)} unpacked)` +
          (withImages > 0 ? `; ${withImages} ${withImages === 1 ? 'has' : 'have'} images embedded inside` : '') +
          (bundled.length > 0 && bundled.length < heavy.length ? `; ${bundled.length} ${bundled.length === 1 ? 'is' : 'are'} inside the JS bundle` : ''),
        files: heavy.map((l) => l.path),
        items: heavy.map((l) => ({
          path: l.path,
          bytes: l.compressed,
          note: [
            l.format === 'bundled' ? 'require()d, in the JS bundle' : l.format === 'dotlottie' ? 'dotLottie file' : '',
            l.embeddedImages > 0 ? `${plural(l.embeddedImages, 'embedded image')}, ${formatBytes(l.embeddedImageBytes)}` : '',
          ]
            .filter(Boolean)
            .join('; ') || undefined,
        })),
        fix: fixes.join(' '),
      },
    ];
  },
};
