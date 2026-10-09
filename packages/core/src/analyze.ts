import { classifyEntries, deliveredTo } from './android/classify.js';
import { DEFAULT_DENSITY, DENSITIES } from './android/density.js';
import { detectArtifact } from './android/detect.js';
import { obfuscatedShare as obfuscatedShareOf, readDexClassNames } from './android/dex.js';
import { debugSectionBytes, readElfHeader } from './android/elf.js';
import { parseBinaryManifest, parseProtoManifest, type ManifestInfo } from './android/manifest.js';
import { ZipArchive } from './archive/zip.js';
import { runChecks } from './checks/registry.js';
import { InvalidOptionError } from './errors.js';
import { detectBundleKind } from './js/hermes.js';
import {
  CATEGORIES,
  type AnalyzeOptions,
  type ArtifactType,
  type BreakdownRow,
  type CodeInfo,
  type FileEntry,
  type JsEngineInfo,
  type NativeLibInfo,
  type Report,
} from './types.js';

const ABI_PREFERENCE = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'];
const sum = (files: FileEntry[], key: 'compressed' | 'uncompressed') => files.reduce((s, f) => s + f[key], 0);

/**
 * Analyze an APK/AAB given as a Blob. Works in Node and in the browser; for a file path in Node use
 * `analyze()` from the node entry.
 */
export async function analyzeBlob(blob: Blob, fileName: string, options: AnalyzeOptions = {}): Promise<Report> {
  const started = Date.now();
  const fileSize = blob.size;
  const zip = await ZipArchive.open(blob);
  try {
    const artifact = detectArtifact(zip.entries);
    const files = classifyEntries(zip.entries, artifact);
    const warnings: string[] = [];

    const abis = [...new Set(files.filter((f) => f.abi).map((f) => f.abi!))].sort(
      (a, b) => rank(a) - rank(b),
    );
    const abi = options.abi ?? abis[0] ?? 'arm64-v8a';
    if (options.abi && abis.length > 0 && !abis.includes(options.abi)) {
      warnings.push(`ABI "${options.abi}" not found in build (has: ${abis.join(', ')}).`);
    }

    const density = options.density ?? DEFAULT_DENSITY;
    if (!(density in DENSITIES)) {
      throw new InvalidOptionError(`Unknown density "${density}". Use one of: ${Object.keys(DENSITIES).join(', ')}.`);
    }
    const delivered = deliveredTo(files, artifact, abi, density);
    const js = await readJsInfo(zip, delivered, warnings);
    if (!js) {
      warnings.push(
        'No JS bundle found. Debug builds load JS from Metro instead of bundling it, so analyze a release build.',
      );
    } else if (js.engine === 'unknown') {
      warnings.push(`Could not tell whether ${js.bundlePath} is Hermes bytecode or plain JS.`);
    }

    const extraModules = [
      ...new Set(files.filter((f) => f.delivered && f.module !== 'base').map((f) => f.module)),
    ];
    if (extraModules.length > 0) {
      warnings.push(
        `Modules not included in the download estimate (dynamic features / asset packs): ${extraModules.join(', ')}.`,
      );
    }

    const breakdown: BreakdownRow[] = CATEGORIES.map((category) => {
      const inCat = delivered.filter((f) => f.category === category);
      return { category, compressed: sum(inCat, 'compressed'), uncompressed: sum(inCat, 'uncompressed'), count: inCat.length };
    }).filter((r) => r.count > 0);

    const nativeByAbi = abis.map((a) => {
      const libs = files.filter((f) => f.abi === a && (artifact === 'apk' || f.module === 'base'));
      return { abi: a, compressed: sum(libs, 'compressed'), uncompressed: sum(libs, 'uncompressed'), count: libs.length };
    });

    // APK: users download the file itself; only one ABI's libraries are extracted on install.
    // AAB: Play builds a split APK set per device; summing compressed sizes is a close estimate.
    const download =
      artifact === 'apk'
        ? { bytes: fileSize, estimate: false, abi: abis.length > 1 ? 'all' : abi }
        : { bytes: sum(delivered, 'compressed'), estimate: true, abi, density };
    const install =
      artifact === 'apk'
        ? { bytes: fileSize + sum(delivered.filter((f) => f.abi === abi), 'uncompressed'), estimate: true, abi }
        : { bytes: sum(delivered, 'uncompressed'), estimate: true, abi };

    const manifest = await readManifest(zip, artifact, warnings);
    const code = await readCodeInfo(zip, delivered, warnings);
    const nativeLibs = await readNativeLibs(zip, delivered, abi, warnings);

    const checks = runChecks({ artifact, abi, files, delivered, js, manifest, code, nativeLibs }, options.ignore);

    return {
      schemaVersion: 1,
      tool: { name: 'rn-size-check', version: options.toolVersion ?? '0.0.0' },
      createdAt: new Date().toISOString(),
      app: { platform: 'android', artifact, fileName, abis, extraModules, js, manifest, code },
      sizes: {
        file: fileSize,
        download,
        install,
        notDelivered: sum(files.filter((f) => !f.delivered), 'compressed'),
      },
      breakdown,
      nativeByAbi,
      nativeLibs: nativeLibs.sort((a, b) => b.compressed - a.compressed),
      largestFiles: [...delivered].sort((a, b) => b.compressed - a.compressed).slice(0, options.topFiles ?? 25),
      findings: checks.findings,
      totals: { savingsBytes: checks.savingsBytes },
      meta: { durationMs: Date.now() - started, warnings: [...warnings, ...checks.warnings] },
    };
  } finally {
    zip.close();
  }
}

function rank(abi: string): number {
  const i = ABI_PREFERENCE.indexOf(abi);
  return i === -1 ? ABI_PREFERENCE.length : i;
}

const AAB_MAPPING = 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map';
/** Below this share of short class names the code is almost certainly not minified. */
const UNMINIFIED_MAX_SHARE = 0.05;

async function readManifest(zip: ZipArchive, artifact: ArtifactType, warnings: string[]): Promise<ManifestInfo> {
  try {
    return artifact === 'aab'
      ? parseProtoManifest(await zip.read('base/manifest/AndroidManifest.xml'))
      : parseBinaryManifest(await zip.read('AndroidManifest.xml'));
  } catch (err) {
    warnings.push(`Could not read AndroidManifest.xml: ${(err as Error).message}`);
    return {};
  }
}

async function readCodeInfo(zip: ZipArchive, delivered: FileEntry[], warnings: string[]): Promise<CodeInfo> {
  const mappingFile = zip.has(AAB_MAPPING);
  let names: string[] = [];
  try {
    for (const dex of delivered.filter((f) => f.category === 'dex')) {
      names = names.concat(readDexClassNames(await zip.read(dex.path)));
    }
  } catch (err) {
    warnings.push(`Could not read dex files: ${(err as Error).message}`);
  }
  const obfuscatedShare = obfuscatedShareOf(names);
  const minified = mappingFile ? true : names.length === 0 ? null : obfuscatedShare < UNMINIFIED_MAX_SHARE ? false : obfuscatedShare > 0.15 ? true : null;
  return { minified, obfuscatedShare: Math.round(obfuscatedShare * 1000) / 1000, mappingFile };
}

async function readNativeLibs(zip: ZipArchive, delivered: FileEntry[], abi: string, warnings: string[]): Promise<NativeLibInfo[]> {
  const libs: NativeLibInfo[] = [];
  for (const f of delivered.filter((x) => x.category === 'native' && x.abi === abi)) {
    let debugBytes = 0;
    try {
      const header = readElfHeader(await zip.read(f.path, 64));
      if (header && header.shoff > 0 && header.shoff < f.uncompressed) {
        debugBytes = debugSectionBytes(header, await zip.readFrom(f.path, header.shoff));
      }
    } catch (err) {
      warnings.push(`Could not read ${f.path}: ${(err as Error).message}`);
    }
    libs.push({ path: f.path, compressed: f.compressed, uncompressed: f.uncompressed, debugBytes });
  }
  return libs;
}

async function readJsInfo(zip: ZipArchive, delivered: FileEntry[], warnings: string[]): Promise<JsEngineInfo | null> {
  const bundles = delivered.filter((f) => f.category === 'js').sort((a, b) => b.uncompressed - a.uncompressed);
  const main = bundles.find((f) => f.path.endsWith('index.android.bundle')) ?? bundles[0];
  if (!main) return null;
  try {
    const head = await zip.read(main.path, 64);
    return { ...detectBundleKind(head), bundlePath: main.path, bytes: main.compressed };
  } catch (err) {
    warnings.push(`Could not read ${main.path}: ${(err as Error).message}`);
    return { engine: 'unknown', bundlePath: main.path, bytes: main.compressed };
  }
}
