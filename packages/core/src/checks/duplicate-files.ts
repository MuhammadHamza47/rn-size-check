import { formatBytes } from '../format.js';
import type { FileEntry } from '../types.js';
import type { Check } from './types.js';

/** Ignore tiny files: duplicates there are normal (empty XML, placeholder resources) and save nothing. */
const MIN_SIZE = 8 * 1024;

export const duplicateFiles: Check = {
  id: 'duplicate-files',
  title: 'Duplicate files',
  description: 'The same file content is stored more than once (e.g. one image copied into several folders).',
  requires: 'build',
  run(ctx) {
    // CRC-32 + size from the zip directory identifies identical content without reading files.
    const groups = new Map<string, FileEntry[]>();
    for (const f of ctx.delivered) {
      if (f.uncompressed < MIN_SIZE || f.category === 'native' || f.category === 'dex') continue;
      const key = `${f.crc32}:${f.uncompressed}`;
      const group = groups.get(key);
      if (group) group.push(f);
      else groups.set(key, [f]);
    }
    const dupes = [...groups.values()].filter((g) => g.length > 1);
    if (dupes.length === 0) return [];

    const savingsByFile: Record<string, number> = {};
    const items = [];
    for (const [keep, ...extras] of dupes) {
      for (const extra of extras) {
        savingsByFile[extra.path] = extra.compressed;
        items.push({ path: extra.path, bytes: extra.compressed, note: `same as ${keep!.path}` });
      }
    }
    items.sort((a, b) => b.bytes - a.bytes);
    const total = Object.values(savingsByFile).reduce((s, b) => s + b, 0);
    const copies = Object.keys(savingsByFile).length;
    return [
      {
        severity: total > 512 * 1024 ? 'warn' : 'info',
        title: `${dupes.length} file${dupes.length === 1 ? '' : 's'} stored more than once (${copies} extra cop${copies === 1 ? 'y' : 'ies'}, ${formatBytes(total)})`,
        files: dupes.flat().map((f) => f.path),
        items,
        savingsByFile,
        fix: 'Keep one copy. For RN images, require() the same file instead of copying it; for Android resources, move it to one drawable folder.',
      },
    ];
  },
};
