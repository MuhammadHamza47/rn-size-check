import type { Check } from './types.js';

export const fontNameCase: Check = {
  id: 'font-name-case',
  title: 'Font name with the wrong letter case',
  description: "A fontFamily in the code differs from the font file name only in letter case; Android won't find it.",
  requires: 'sourcemap',
  run(ctx) {
    const wrong = (ctx.packages?.fontUsage ?? []).filter((u) => u.writtenAs);
    if (wrong.length === 0) return [];
    const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
    return [
      {
        severity: 'warn',
        title:
          wrong.length === 1
            ? `fontFamily '${wrong[0]!.writtenAs}' doesn't match the font file ${fileName(wrong[0]!.path)}`
            : `${wrong.length} fontFamily names don't match their font files' letter case`,
        files: wrong.map((u) => u.path),
        items: wrong.map((u) => ({ path: u.path, bytes: 0, note: `written as '${u.writtenAs}'` })),
        fix: 'Android looks up font files case-sensitively, so text using this name falls back to the default font. Use the exact file name in fontFamily. (Not a size issue, but easy to miss.)',
      },
    ];
  },
};
