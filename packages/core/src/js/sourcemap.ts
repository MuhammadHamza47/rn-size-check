import { decodedMappings, TraceMap, type DecodedSourceMap } from '@jridgewell/trace-mapping';
import type { PackageSizeInfo } from '../types.js';

/**
 * Attribute JS bundle bytes to source files and npm packages using source maps.
 *
 * React Native release builds with Hermes produce two maps (android/app/build/...):
 * - the composed map (generated/sourcemaps/react/<variant>/index.android.bundle.map): one generated line
 *   whose columns are byte offsets in the Hermes bytecode file. Distances between segments are real
 *   bytecode bytes. JSON modules are compiled into Hermes data tables and are missing from this map.
 * - the packager map (intermediates/sourcemaps/react/<variant>/index.android.bundle.packager.map): maps
 *   Metro's JS output and still lists JSON modules with their full text in sourcesContent.
 */

export type RawSourceMap = DecodedSourceMap | (Omit<DecodedSourceMap, 'mappings'> & { mappings: string }) & {
  x_hermes_function_offsets?: unknown;
};

export interface SourceBytes {
  /** Bytes per source path (as written in the map). */
  bySource: Map<string, number>;
  /** Bytes attributed to sources (bytecode for Hermes maps, JS text for plain maps). */
  mappedBytes: number;
  /** Hermes only: bytes after the last function, i.e. string and data tables. */
  dataBytes: number;
  /**
   * Hermes only: long stretches of bytecode with no source in the map. These are modules the composed
   * map leaves out, mostly JSON files (Lottie animations, emoji data) compiled into code.
   */
  unmappedCodeBytes: number;
  kind: 'hermes' | 'js';
  /** True when sizes are approximations (plain JS map without the bundle text). */
  estimate: boolean;
}

export class SourceMapError extends Error {}

/** Runs of source-less bytecode at least this long are modules missing from the map, not gaps in a function. */
const LONG_UNMAPPED_RUN = 16_000;

/** A Hermes composed map has a single generated line of bytecode offsets. */
export function isHermesMap(raw: RawSourceMap, decoded: readonly (readonly number[])[][]): boolean {
  return 'x_hermes_function_offsets' in raw || (decoded.length === 1 && (decoded[0]?.length ?? 0) > 1000);
}

/**
 * Bytes per source for a source map. `bundleSize` is the size of the file the map describes (the
 * Hermes bytecode file or the JS bundle); `bundleText` (plain JS maps only) gives exact line lengths.
 */
export function sourceBytes(raw: RawSourceMap, bundleSize: number, bundleText?: string): SourceBytes {
  if (!raw || !Array.isArray(raw.sources) || raw.mappings === undefined) {
    throw new SourceMapError('Not a source map (missing "sources" or "mappings").');
  }
  const lines = decodedMappings(new TraceMap(raw as never));
  const bySource = new Map<string, number>();
  const add = (sourceIndex: number, bytes: number) => {
    if (bytes <= 0) return;
    const name = raw.sources[sourceIndex] ?? '(unknown)';
    bySource.set(name, (bySource.get(name) ?? 0) + bytes);
  };

  if (isHermesMap(raw, lines)) {
    const segs = lines[0] ?? [];
    if (segs.length === 0) throw new SourceMapError('The Hermes source map has no mappings.');
    const lastOffset = segs[segs.length - 1]![0]!;
    if (lastOffset > bundleSize) {
      throw new SourceMapError(
        `The source map points past the end of the JS bundle (${lastOffset} > ${bundleSize} bytes). It belongs to a different build.`,
      );
    }
    // Segments without a source come in two kinds. Short gaps inside function bodies belong to the code
    // before them. Long runs are whole modules the map leaves out (mostly JSON compiled into bytecode);
    // giving those to the previous file would inflate it by megabytes, so they are counted separately.
    let current = -1;
    let mapped = 0;
    let unmappedCode = 0;
    let i = 0;
    while (i < segs.length) {
      const seg = segs[i]!;
      const end = (k: number) => (k + 1 < segs.length ? segs[k + 1]![0]! : lastOffset);
      if (seg.length >= 4) {
        current = seg[1]!;
        add(current, end(i) - seg[0]!);
        mapped += end(i) - seg[0]!;
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < segs.length && segs[j + 1]!.length < 4) j++;
      const runBytes = end(j) - seg[0]!;
      if (runBytes >= LONG_UNMAPPED_RUN || current < 0) unmappedCode += runBytes;
      else {
        add(current, runBytes);
        mapped += runBytes;
      }
      i = j + 1;
    }
    return {
      bySource,
      mappedBytes: mapped,
      dataBytes: Math.max(0, bundleSize - lastOffset),
      unmappedCodeBytes: unmappedCode,
      kind: 'hermes',
      estimate: false,
    };
  }

  // Plain JS map: each segment runs until the next one on the same line, the last one to the line end.
  const lineLengths = bundleText?.split('\n').map((l) => l.length);
  let mapped = 0;
  lines.forEach((segs, lineIndex) => {
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (seg.length < 4) continue;
      const end = i + 1 < segs.length ? segs[i + 1]![0]! : (lineLengths?.[lineIndex] ?? seg[0]!);
      add(seg[1]!, end - seg[0]!);
      mapped += Math.max(0, end - seg[0]!);
    }
  });
  return { bySource, mappedBytes: mapped, dataBytes: 0, unmappedCodeBytes: 0, kind: 'js', estimate: !bundleText };
}

/** `…/node_modules/@scope/pkg/lib/x.js` → `@scope/pkg`; works for nested and pnpm layouts and Windows paths. */
export function packageOf(source: string): string | null {
  const p = source.split('\\').join('/');
  const i = p.lastIndexOf('node_modules/');
  if (i < 0) return null;
  const parts = p.slice(i + 'node_modules/'.length).split('/');
  if (!parts[0]) return null;
  return parts[0].startsWith('@') && parts[1] ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** `…/node_modules/a/node_modules/lodash/x.js` → `…/node_modules/a/node_modules/lodash` (one install of a package). */
export function packageRoot(source: string): string | null {
  const p = source.split('\\').join('/');
  const name = packageOf(p);
  if (!name) return null;
  const i = p.lastIndexOf('node_modules/');
  return p.slice(0, i + 'node_modules/'.length + name.length);
}

/** Metro's module system and polyfills: not app code and not an npm package worth acting on. */
const METRO_RUNTIME_PACKAGES = new Set(['metro-runtime', '@react-native/js-polyfills']);

export interface PackageSummary {
  packages: PackageSizeInfo[];
  appCodeBytes: number;
  runtimeBytes: number;
}

export function summarizePackages(bySource: Map<string, number>): PackageSummary {
  const byName = new Map<string, { bytes: number; files: number; roots: Map<string, number> }>();
  let appCodeBytes = 0;
  let runtimeBytes = 0;
  for (const [source, bytes] of bySource) {
    const normalized = source.split('\\').join('/');
    const name = packageOf(normalized);
    if (normalized === '__prelude__' || (name && METRO_RUNTIME_PACKAGES.has(name))) {
      runtimeBytes += bytes;
      continue;
    }
    if (!name) {
      appCodeBytes += bytes;
      continue;
    }
    const entry = byName.get(name) ?? { bytes: 0, files: 0, roots: new Map<string, number>() };
    entry.bytes += bytes;
    entry.files += 1;
    const root = packageRoot(normalized)!;
    entry.roots.set(root, (entry.roots.get(root) ?? 0) + bytes);
    byName.set(name, entry);
  }
  const packages = [...byName]
    .map(([name, e]) => ({
      name,
      bytes: e.bytes,
      files: e.files,
      installs: e.roots.size,
      duplicateBytes: e.bytes - Math.max(...e.roots.values()),
    }))
    .sort((a, b) => b.bytes - a.bytes);
  return { packages, appCodeBytes, runtimeBytes };
}

export interface JsonModule {
  /** Path relative to the app (project root stripped when it can be inferred). */
  path: string;
  text: string;
}

/** JSON modules (e.g. Lottie files the code require()s) with their text, from a map's sourcesContent. */
export function jsonModules(raw: RawSourceMap): JsonModule[] {
  const contents = (raw as { sourcesContent?: (string | null)[] }).sourcesContent ?? [];
  const out: JsonModule[] = [];
  raw.sources.forEach((source, i) => {
    if (!source || !/\.json$/i.test(source)) return;
    const text = contents[i];
    if (typeof text === 'string') out.push({ path: appRelative(source), text });
  });
  return out;
}

/** Strip the machine-specific part of a path: keep from node_modules/ or src/ (or the last 3 segments). */
export function appRelative(source: string): string {
  const p = source.split('\\').join('/');
  const nm = p.lastIndexOf('node_modules/');
  if (nm >= 0) return p.slice(nm);
  // Prefer src/, then app/ (Expo Router), then assets/: a project folder that happens to be called
  // "app" must not win over the src/ inside it.
  for (const dir of ['src', 'app', 'assets']) {
    const at = p.search(new RegExp(`(^|/)${dir}/`));
    if (at >= 0) return p.slice(p[at] === '/' ? at + 1 : at);
  }
  return p.split('/').slice(-3).join('/');
}
