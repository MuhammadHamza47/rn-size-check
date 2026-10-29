import { runChecks } from '../checks/registry.js';
import { detectBundleKind } from '../js/hermes.js';
import { analyzePackages } from '../js/packages.js';
import type { ZipArchive } from '../archive/zip.js';
import {
  CATEGORIES,
  type AnalyzeOptions,
  type BreakdownRow,
  type FileEntry,
  type JsEngineInfo,
  type ManifestInfo,
  type PackageReport,
  type Report,
} from '../types.js';
import { appRootOf, classifyIosEntries } from './classify.js';
import { parsePlist } from './plist.js';

const sum = (files: FileEntry[], key: 'compressed' | 'uncompressed') => files.reduce((s, f) => s + f[key], 0);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** The JS bundle inside the .app (main.jsbundle), with its engine, if the app is React Native. */
async function readIosJs(zip: ZipArchive, files: FileEntry[], warnings: string[]): Promise<JsEngineInfo | null> {
  const bundles = files.filter((f) => f.category === 'js').sort((a, b) => b.uncompressed - a.uncompressed);
  const main = bundles.find((f) => /main\.jsbundle$/.test(f.path)) ?? bundles[0];
  if (!main) return null;
  try {
    return { ...detectBundleKind(await zip.read(main.path, 64)), bundlePath: main.path, bytes: main.compressed };
  } catch (err) {
    warnings.push(`Could not read ${main.path}: ${(err as Error).message}`);
    return { engine: 'unknown', bundlePath: main.path, bytes: main.compressed };
  }
}

/** Analyze an iOS .ipa. App Store thinning/compression is not modelled, so sizes are estimates. */
export async function analyzeIpa(
  zip: ZipArchive,
  fileName: string,
  options: AnalyzeOptions,
  started: number,
  fileSize: number,
): Promise<Report> {
  const warnings: string[] = [];
  const files = classifyIosEntries(zip.entries);
  const delivered = files; // everything in the .ipa ships; the App Store thins per device afterwards
  const appRoot = appRootOf(zip.entries);

  let manifest: ManifestInfo = {};
  try {
    const plist = parsePlist(await zip.read(`${appRoot}Info.plist`));
    const vc = Number(plist.CFBundleVersion);
    manifest = {
      packageName: str(plist.CFBundleIdentifier),
      versionName: str(plist.CFBundleShortVersionString),
      versionCode: Number.isInteger(vc) && vc > 0 ? vc : undefined,
      minOsVersion: str(plist.MinimumOSVersion),
    };
  } catch (err) {
    warnings.push(`Could not read Info.plist: ${(err as Error).message}`);
  }

  const js = await readIosJs(zip, delivered, warnings);
  if (js?.engine === 'unknown') warnings.push(`Could not tell whether ${js.bundlePath} is Hermes bytecode or plain JS.`);

  const breakdown: BreakdownRow[] = CATEGORIES.map((category) => {
    const inCat = delivered.filter((f) => f.category === category);
    return {
      category,
      compressed: sum(inCat, 'compressed'),
      uncompressed: sum(inCat, 'uncompressed'),
      count: inCat.length,
    };
  }).filter((r) => r.count > 0);

  let packages: PackageReport | null = null;
  if (options.sourceMaps && js) {
    const jsEntry = files.find((f) => f.path === js.bundlePath);
    if (jsEntry) {
      const result = analyzePackages(
        options.sourceMaps,
        js,
        jsEntry.uncompressed,
        jsEntry.compressed,
        delivered.filter((f) => f.category === 'font').map((f) => f.path),
        delivered.filter((f) => f.category === 'image').map((f) => f.path),
        warnings,
      );
      packages = result.report;
    }
  }

  const code = { minified: null, obfuscatedShare: 0, mappingFile: false };
  warnings.push(
    'iOS sizes are estimates: the App Store re-compresses, encrypts and thins the app per device, so the real download and install differ. App Store Connect shows the exact per-device sizes.',
  );

  const checks = runChecks(
    { artifact: 'ipa', abi: 'universal', files, delivered, js, manifest, code, nativeLibs: [], lottie: [], packages },
    options.ignore,
  );

  return {
    schemaVersion: 1,
    tool: { name: 'rn-size-check', version: options.toolVersion ?? '0.0.0' },
    createdAt: new Date().toISOString(),
    app: { platform: 'ios', artifact: 'ipa', fileName, abis: [], extraModules: [], js, manifest, code },
    sizes: {
      file: fileSize,
      download: { bytes: sum(delivered, 'compressed'), estimate: true, abi: 'universal' },
      install: { bytes: sum(delivered, 'uncompressed'), estimate: true, abi: 'universal' },
      notDelivered: 0,
    },
    breakdown,
    nativeByAbi: [],
    nativeLibs: [],
    lottie: [],
    packages,
    largestFiles: [...delivered].sort((a, b) => b.compressed - a.compressed).slice(0, options.topFiles ?? 25),
    files: delivered.map((f) => ({ path: f.path, category: f.category, compressed: f.compressed })),
    findings: checks.findings,
    totals: { savingsBytes: checks.savingsBytes },
    meta: { durationMs: Date.now() - started, warnings: [...warnings, ...checks.warnings] },
  };
}
