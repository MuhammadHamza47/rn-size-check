import { formatBytes } from '../format.js';
import { ICON_FONT_FILE } from '../js/font-usage.js';
import type { Check } from './types.js';

/** Without a source map: react-native-vector-icons ships ~19 fonts; a list this long means nobody trimmed it. */
const FULL_SET_MIN = 12;

const FIX =
  'Ship only the fonts you use: in android/app/build.gradle set project.ext.vectoricons = [ iconFontNames: [ "MaterialIcons.ttf" ] ], or import per-family packages (@react-native-vector-icons/<family>).';

export const iconFonts: Check = {
  id: 'icon-fonts',
  title: 'Unused icon fonts',
  description:
    'Icon fonts the app never uses. With a source map: fonts whose icon family is never imported; without: the full default set of react-native-vector-icons.',
  requires: 'build',
  run(ctx) {
    const fonts = ctx.delivered.filter((f) => f.category === 'font' && ICON_FONT_FILE.test(f.path));
    if (fonts.length === 0) return [];
    const usage = new Map((ctx.packages?.fontUsage ?? []).map((u) => [u.path, u.used]));

    // Exact: an icon font is used when its family is imported (its glyph map is in the bundle).
    if (fonts.some((f) => usage.has(f.path))) {
      const unused = fonts.filter((f) => usage.get(f.path) === false);
      if (unused.length === 0) return [];
      const total = unused.reduce((s, f) => s + f.compressed, 0);
      return [
        {
          severity: 'warn',
          title: `${unused.length} of ${fonts.length} icon fonts are bundled but never used (${formatBytes(total)})`,
          files: unused.map((f) => f.path),
          savingsByFile: Object.fromEntries(unused.map((f) => [f.path, f.compressed])),
          fix: FIX,
        },
      ];
    }

    // Estimate: only the untrimmed default set is a safe bet.
    if (fonts.length < FULL_SET_MIN) return [];
    const total = fonts.reduce((s, f) => s + f.compressed, 0);
    return [
      {
        severity: 'warn',
        title: `All ${fonts.length} icon fonts bundled (${formatBytes(total)}); most apps use 1–3`,
        files: fonts.map((f) => f.path),
        fix: `${FIX} Run with --project to see exactly which ones are unused.`,
      },
    ];
  },
};
