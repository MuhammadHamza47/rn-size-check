import { formatBytes } from '../format.js';
import { ICON_FONT_FILE } from '../js/font-usage.js';
import type { FileEntry } from '../types.js';
import type { Check } from './types.js';

/** Without a source map: a family shipped with this many files almost always includes unused weights. */
const MANY_WEIGHTS = 8;

/** `assets/fonts/Rubik-SemiBoldItalic.ttf` → `rubik`; `res/font/open_sans_bold.ttf` → `open` (good enough to group). */
function family(path: string): string | null {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.(ttf|otf|ttc)$/i, '');
  const [first] = name.split(/[-_]/);
  // Obfuscated resource names (res/ab.ttf) carry no family information.
  return first && first.length >= 3 ? first.toLowerCase() : null;
}

const displayFamily = (f: FileEntry) => f.path.slice(f.path.lastIndexOf('/') + 1).split(/[-_]/)[0];

export const fontWeights: Check = {
  id: 'font-weights',
  title: 'Unused font weights',
  description:
    'Font files the app never uses. With a source map: the exact files no code references; without: families shipped with many weights.',
  requires: 'build',
  sharperWithSourcemap: true,
  run(ctx) {
    const fonts = ctx.delivered.filter((f) => f.category === 'font' && !ICON_FONT_FILE.test(f.path));
    const usage = new Map((ctx.packages?.fontUsage ?? []).map((u) => [u.path, u.used]));

    // Exact: the source map tells which font names the code uses.
    const unused = fonts.filter((f) => usage.get(f.path) === false);
    if (unused.length > 0) {
      const families = [...new Set(unused.map(displayFamily))];
      const total = unused.reduce((s, f) => s + f.compressed, 0);
      const shipped = fonts.filter((f) => families.includes(displayFamily(f))).length;
      return [
        {
          severity: 'warn',
          title:
            families.length === 1
              ? `${unused.length} of ${shipped} ${families[0]} font files are never used (${formatBytes(total)})`
              : `${unused.length} font files are never used (${formatBytes(total)})`,
          files: unused.map((f) => f.path),
          savingsByFile: Object.fromEntries(unused.map((f) => [f.path, f.compressed])),
          fix: 'No code references these font names. Delete the files from your fonts folder (and from android/app/src/main/assets/fonts if they were copied there), then rebuild.',
        },
      ];
    }
    // When usage is known and nothing is unused, there is nothing to report.
    if (fonts.some((f) => usage.get(f.path) === true)) return [];

    // Estimate: group by family and flag the ones shipped in many weights.
    const groups = new Map<string, FileEntry[]>();
    for (const f of fonts) {
      const key = family(f.path);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    return [...groups.values()]
      .filter((files) => files.length >= MANY_WEIGHTS)
      .map((files) => {
        const name = displayFamily(files[0]!);
        const total = files.reduce((s, f) => s + f.compressed, 0);
        return {
          severity: 'warn' as const,
          title: `${files.length} ${name} font files bundled (${formatBytes(total)}); apps usually use 3–5 weights`,
          files: files.map((f) => f.path),
          fix: `Search your code for the ${name} names you actually use (fontFamily: '${name}-…'). Delete the other files from your fonts folder and from android/app/src/main/assets/fonts if they were copied there. Run with --project to see exactly which files are unused.`,
        };
      });
  },
};
