import { deflateSync } from 'fflate';
import { embeddedImages, looksLikeLottie } from '../assets/lottie.js';
import type { JsEngineInfo, LottieInfo, PackageReport, SourceMapInput } from '../types.js';
import { fontUsage, iconFamiliesIn } from './font-usage.js';
import { appRelative, jsonModules, sourceBytes, SourceMapError, summarizePackages, type RawSourceMap } from './sourcemap.js';

const MAX_PACKAGES = 100;
/** Bundled JSON smaller than this is not worth listing. */
const JSON_MIN_BYTES = 10_000;

export interface PackageAnalysis {
  report: PackageReport | null;
  /** Lottie animations the JS code require()s (they live inside the JS bundle). */
  bundledLottie: LottieInfo[];
}

/**
 * Build the npm package breakdown from source maps. `bundleBytes` is the unpacked size of the JS
 * bundle inside the APK/AAB. Returns a null report (with a warning) when the maps can't be trusted.
 */
export function analyzePackages(
  input: SourceMapInput,
  js: JsEngineInfo,
  bundleBytes: number,
  /** Size of the JS bundle inside the APK/AAB (compressed), to estimate download sizes. */
  bundleCompressed: number,
  /** Font files in the build, to see which ones the code references. */
  fontPaths: string[],
  warnings: string[],
): PackageAnalysis {
  const none: PackageAnalysis = { report: null, bundledLottie: [] };
  if (input.siblingBundleBytes !== undefined && input.siblingBundleBytes !== bundleBytes) {
    warnings.push(
      `Skipped the npm package breakdown: the source map comes from a different build (its JS bundle is ${input.siblingBundleBytes} bytes, this build's is ${bundleBytes}). Rebuild the release and analyze that build.`,
    );
    return none;
  }

  let measured;
  try {
    measured = sourceBytes(input.main as RawSourceMap, bundleBytes, input.bundleText);
  } catch (err) {
    if (err instanceof SourceMapError) {
      warnings.push(`Skipped the npm package breakdown: ${err.message}`);
      return none;
    }
    throw err;
  }
  if (measured.kind === 'hermes' && js.engine !== 'hermes') {
    warnings.push('Skipped the npm package breakdown: the source map is for Hermes bytecode, but this build has a plain JS bundle.');
    return none;
  }

  // A plain JS map for a Hermes build measures JS text, not bytecode: keep the shares, scale to the bundle.
  let scale = 1;
  let estimate = measured.estimate;
  if (measured.kind === 'js' && js.engine === 'hermes' && measured.mappedBytes > 0) {
    scale = bundleBytes / measured.mappedBytes;
    estimate = true;
  }
  const summary = summarizePackages(measured.bySource);
  const scaled = (n: number) => Math.round(n * scale);

  const maps = [input.main, input.packager].filter(Boolean) as RawSourceMap[];
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const jsonInfo = maps
    .flatMap((m) => jsonModules(m))
    .filter((m) => !seen.has(m.path) && seen.add(m.path))
    .map((m) => ({ path: m.path, text: m.text, bytes: encoder.encode(m.text).length, lottie: looksLikeLottie(m.text.slice(0, 1024)) }));

  // Hermes compiles require()d JSON into bytecode that the composed map leaves unmapped, so the
  // unmapped code is (mostly) the JSON. Share it out by text size and apply the bundle's compression
  // ratio to estimate each file's download cost. Without that information, deflate the text instead.
  const jsonText = jsonInfo.reduce((s, m) => s + m.bytes, 0);
  const ratio = bundleBytes > 0 ? bundleCompressed / bundleBytes : 1;
  const downloadOf = (m: (typeof jsonInfo)[number]) =>
    measured.kind === 'hermes' && measured.unmappedCodeBytes > 0 && jsonText > 0
      ? Math.round((m.bytes / jsonText) * measured.unmappedCodeBytes * ratio)
      : deflateSync(encoder.encode(m.text), { level: 6 }).length;

  const bundledLottie: LottieInfo[] = jsonInfo
    .filter((m) => m.lottie)
    .map((m) => {
      const images = embeddedImages(m.text);
      return {
        path: m.path,
        format: 'bundled' as const,
        uncompressed: m.bytes,
        compressed: downloadOf(m),
        embeddedImages: images.count,
        embeddedImageBytes: images.bytes,
      };
    });

  return {
    report: {
      kind: measured.kind,
      estimate,
      bundleBytes,
      appCodeBytes: scaled(summary.appCodeBytes),
      runtimeBytes: scaled(summary.runtimeBytes),
      dataBytes: measured.dataBytes,
      unmappedCodeBytes: measured.unmappedCodeBytes,
      items: summary.packages.slice(0, MAX_PACKAGES).map((p) => ({
        ...p,
        bytes: scaled(p.bytes),
        duplicateBytes: scaled(p.duplicateBytes),
      })),
      jsonModules: jsonInfo
        .filter((m) => m.bytes >= JSON_MIN_BYTES)
        .sort((a, b) => b.bytes - a.bytes)
        .map((m) => ({ path: m.path, bytes: m.bytes, lottie: m.lottie })),
      duplicateModules: findDuplicateModules(maps, encoder),
      fontUsage: fontUsageFromMaps(maps, fontPaths),
      maps: input.names,
    },
    bundledLottie,
  };
}

function fontUsageFromMaps(maps: RawSourceMap[], fontPaths: string[]) {
  if (fontPaths.length === 0) return [];
  const appSources: string[] = [];
  for (const map of maps) {
    const contents = (map as { sourcesContent?: (string | null)[] }).sourcesContent ?? [];
    map.sources.forEach((source, i) => {
      const text = contents[i];
      if (source && typeof text === 'string' && !/(^|[\\/])node_modules[\\/]/.test(source) && !/\.json$/i.test(source)) {
        appSources.push(text);
      }
    });
  }
  // Without the app's own source text there is nothing to search.
  if (appSources.length === 0) return null;
  return fontUsage(fontPaths, appSources.join('\n'), iconFamiliesIn(maps.flatMap((m) => m.sources.filter(Boolean) as string[])));
}

/** Files this small are not worth reporting as duplicates. */
const DUPLICATE_MIN_BYTES = 10_000;

/**
 * Identical files bundled under different paths (e.g. one Lottie JSON copied into two folders):
 * Metro bundles each path as its own module. Uses the source text stored in the maps.
 */
function findDuplicateModules(maps: RawSourceMap[], encoder: InstanceType<typeof TextEncoder>): { paths: string[]; bytes: number }[] {
  const byContent = new Map<string, { paths: Set<string>; bytes: number }>();
  for (const map of maps) {
    const contents = (map as { sourcesContent?: (string | null)[] }).sourcesContent ?? [];
    map.sources.forEach((source, i) => {
      const text = contents[i];
      if (!source || typeof text !== 'string' || text.length < DUPLICATE_MIN_BYTES) return;
      // node_modules copies are package duplicates, reported per package instead.
      if (/(^|[\\/])node_modules[\\/]/.test(source)) return;
      const key = `${text.length}:${fnv1a(text)}`;
      const entry = byContent.get(key) ?? { paths: new Set<string>(), bytes: encoder.encode(text).length };
      entry.paths.add(appRelative(source));
      byContent.set(key, entry);
    });
  }
  return [...byContent.values()]
    .filter((e) => e.paths.size > 1)
    .map((e) => ({ paths: [...e.paths].sort(), bytes: e.bytes }))
    .sort((a, b) => b.bytes * b.paths.length - a.bytes * a.paths.length);
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
