import type { FileEntry } from '../types.js';

export const DENSITIES: Record<string, number> = {
  ldpi: 120,
  mdpi: 160,
  tvdpi: 213,
  hdpi: 240,
  xhdpi: 320,
  xxhdpi: 480,
  xxxhdpi: 640,
};

/** Density used for estimates when none is given: most current Android phones are xxhdpi. */
export const DEFAULT_DENSITY = 'xxhdpi';

const RES = /^(?<prefix>(?:[^/]+\/)?res\/)(?<type>[a-z]+)(?<quals>(?:-[^/]+)?)\/(?<name>[^/]+)$/;

interface Parsed {
  key: string;
  dpi: number | 'any';
}

/** `base/res/drawable-night-xhdpi-v8/a.png` → key `base/res/drawable-night/a.png`, dpi 320. */
function parse(path: string): Parsed | null {
  const m = RES.exec(path);
  if (!m?.groups) return null;
  const { prefix = '', type = '', quals = '', name = '' } = m.groups;
  let dpi: number | 'any' = 160; // no density qualifier = default (mdpi) bucket
  const rest: string[] = [];
  for (const q of quals.split('-').filter(Boolean)) {
    if (q in DENSITIES) dpi = DENSITIES[q]!;
    else if (/^\d+dpi$/.test(q)) dpi = parseInt(q, 10);
    else if (q === 'nodpi' || q === 'anydpi') dpi = 'any';
    else if (!/^v\d+$/.test(q)) rest.push(q); // platform version qualifiers are added by aapt alongside densities
  }
  return { key: `${prefix}${[type, ...rest].join('-')}/${name}`, dpi };
}

/**
 * Keep only the resource variants a device of `density` receives from an AAB's density split:
 * the exact density, else the nearest higher one, else the nearest lower one.
 * Density-independent (nodpi/anydpi) and non-resource files are always kept.
 */
export function selectDensity(files: FileEntry[], density: string): FileEntry[] {
  const target = DENSITIES[density] ?? DENSITIES[DEFAULT_DENSITY]!;
  const groups = new Map<string, { file: FileEntry; dpi: number }[]>();
  const keep: FileEntry[] = [];

  for (const f of files) {
    const p = f.category === 'image' || f.category === 'resources' ? parse(f.path) : null;
    if (!p || p.dpi === 'any') {
      keep.push(f);
      continue;
    }
    const g = groups.get(p.key);
    if (g) g.push({ file: f, dpi: p.dpi });
    else groups.set(p.key, [{ file: f, dpi: p.dpi }]);
  }

  for (const variants of groups.values()) {
    const higher = variants.filter((v) => v.dpi >= target).sort((a, b) => a.dpi - b.dpi);
    const best = higher[0] ?? variants.sort((a, b) => b.dpi - a.dpi)[0]!;
    keep.push(best.file);
  }
  return keep;
}
