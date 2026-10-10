import { formatBytes } from '../format.js';
import type { FileEntry } from '../types.js';
import type { Check } from './types.js';

/** Icon fonts are handled by the icon-fonts check. */
const ICON_FONT = /(^|\/)(AntDesign|Entypo|EvilIcons|Feather|FontAwesome|Fontisto|Foundation|Ionicons|Material|Octicons|SimpleLineIcons|Zocial)/i;

/** A family shipped with this many files almost always includes weights the app never uses. */
const MANY_WEIGHTS = 8;

/** `assets/fonts/Rubik-SemiBoldItalic.ttf` → `rubik`; `res/font/open_sans_bold.ttf` → `open` (good enough to group). */
function family(path: string): string | null {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.(ttf|otf|ttc)$/i, '');
  const [first] = name.split(/[-_]/);
  // Obfuscated resource names (res/ab.ttf) carry no family information.
  return first && first.length >= 3 ? first.toLowerCase() : null;
}

export const fontWeights: Check = {
  id: 'font-weights',
  title: 'Many weights of one font',
  description: 'A font family shipped with many weights and italics; apps usually use 3 to 5 of them.',
  requires: 'build',
  run(ctx) {
    const groups = new Map<string, FileEntry[]>();
    for (const f of ctx.delivered) {
      if (f.category !== 'font' || ICON_FONT.test(f.path)) continue;
      const key = family(f.path);
      if (!key) continue;
      const list = groups.get(key);
      if (list) list.push(f);
      else groups.set(key, [f]);
    }

    return [...groups.values()]
      .filter((files) => files.length >= MANY_WEIGHTS)
      .map((files) => {
        const name = files[0]!.path.slice(files[0]!.path.lastIndexOf('/') + 1).split(/[-_]/)[0];
        const total = files.reduce((s, f) => s + f.compressed, 0);
        return {
          severity: 'warn' as const,
          title: `${files.length} ${name} font files bundled (${formatBytes(total)}); apps usually use 3–5 weights`,
          files: files.map((f) => f.path),
          fix: `Search your code for the ${name} names you actually use (fontFamily: '${name}-…'). Delete the other files from your fonts folder and from android/app/src/main/assets/fonts if they were copied there. A single variable font is another option.`,
        };
      });
  },
};
