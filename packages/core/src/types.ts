import type { ManifestInfo } from './android/manifest.js';

export type ArtifactType = 'apk' | 'aab' | 'ipa';

export type Category = 'js' | 'native' | 'dex' | 'image' | 'font' | 'resources' | 'other';

export const CATEGORIES: readonly Category[] = ['native', 'js', 'dex', 'image', 'font', 'resources', 'other'];

export const CATEGORY_LABELS: Record<Category, string> = {
  native: 'Native libraries (.so)',
  js: 'JS bundle',
  dex: 'Dex (Java/Kotlin)',
  image: 'Images',
  font: 'Fonts',
  resources: 'Android resources',
  other: 'Other',
};

/** One entry of the zip central directory. */
export interface ArchiveEntry {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
  /** 0 = stored, 8 = deflated */
  compressionMethod: number;
  crc32: number;
}

export interface FileEntry {
  /** Path inside the artifact, as stored in the zip. */
  path: string;
  category: Category;
  compressed: number;
  uncompressed: number;
  /** Set for native libraries: arm64-v8a, armeabi-v7a, x86, x86_64. */
  abi?: string;
  /** AAB module name (base, feature modules, asset packs). Always "base" for APKs. */
  module: string;
  /** False for files the store never sends to devices (AAB metadata, debug symbols). */
  delivered: boolean;
  crc32: number;
  /** Real resource name (e.g. drawable/ic_logo) when R8 shrank the file name to res/-B.png. */
  resourceName?: string;
}

/** A delivered file as stored in the report (just what a comparison needs). */
export interface ReportFile {
  path: string;
  category: Category;
  compressed: number;
  resourceName?: string;
}

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  checkId: string;
  severity: Severity;
  title: string;
  /** Bytes saved from the download if fixed. Omitted for informational findings. */
  savings?: { bytes: number; estimate: boolean };
  /** Every path the finding is about. */
  files: string[];
  /** The files to show the user, biggest first, with an optional note (e.g. "same as x.png"). */
  items: FindingItem[];
  fix: string;
}

export interface FindingItem {
  path: string;
  bytes: number;
  note?: string;
}

export interface SizeValue {
  bytes: number;
  estimate: boolean;
}

export interface BreakdownRow {
  category: Category;
  compressed: number;
  uncompressed: number;
  count: number;
}

export interface JsEngineInfo {
  engine: 'hermes' | 'jsc' | 'unknown';
  bundlePath: string;
  bytes: number;
  hermesBytecodeVersion?: number;
}

export type { ManifestInfo };

export interface CodeInfo {
  /** true/false when we can tell whether R8/ProGuard minified the Java/Kotlin code; null when unsure. */
  minified: boolean | null;
  /** Share of classes with minified-looking names (0–1). */
  obfuscatedShare: number;
  /** AAB contains an R8/ProGuard mapping file (a sure sign minification ran). */
  mappingFile: boolean;
}

export interface NativeLibInfo {
  path: string;
  compressed: number;
  uncompressed: number;
  /** Bytes of debug info / symbol tables that a stripped library would not contain. */
  debugBytes: number;
}

export interface LottieInfo {
  path: string;
  /** json/dotlottie: a file in res/raw or assets; bundled: a JSON file the JS code require()s. */
  format: 'json' | 'dotlottie' | 'bundled';
  compressed: number;
  uncompressed: number;
  /** Raster images embedded as base64 (JSON only; 0 for .lottie files, which are not inspected). */
  embeddedImages: number;
  /** Decoded bytes of those embedded images. */
  embeddedImageBytes: number;
}

export interface FontUsageInfo {
  path: string;
  /** null when it can't be told (name built at runtime, obfuscated file name). */
  used: boolean | null;
  /** The code spells the name with different letter case than the file (Android is case-sensitive). */
  writtenAs?: string;
}

export interface ImageUsageInfo {
  path: string;
  /** null when it can't be judged (library asset, native resource, or no app source text). */
  used: boolean | null;
}

export interface PackageSizeInfo {
  name: string;
  bytes: number;
  files: number;
  /** How many separate copies of the package are bundled (more than 1 = duplicate versions). */
  installs: number;
  /** Bytes in all copies except the largest one. */
  duplicateBytes: number;
}

/** What the JS bundle is made of, from source maps (present only when a map was supplied). */
export interface PackageReport {
  /** hermes: sizes are bytecode bytes; js: sizes are bytes of minified JS. */
  kind: 'hermes' | 'js';
  estimate: boolean;
  /** Unpacked size of the JS bundle file the map describes. */
  bundleBytes: number;
  appCodeBytes: number;
  /** Metro's module system and polyfills. */
  runtimeBytes: number;
  /** Hermes string and data tables. */
  dataBytes: number;
  /** Hermes: bytecode of modules the source map leaves out, mostly JSON files (Lottie, emoji data) compiled into code. */
  unmappedCodeBytes: number;
  /** Biggest npm packages first. */
  items: PackageSizeInfo[];
  /** JSON modules (e.g. require()d Lottie files), from the packager map when available. */
  jsonModules: { path: string; bytes: number; lottie: boolean }[];
  /** App files with identical content bundled under different paths (each copy is bundled separately). */
  duplicateModules: { paths: string[]; bytes: number }[];
  /** Which font files in the build the app code references; null when the maps have no app source text. */
  fontUsage: FontUsageInfo[] | null;
  /** Which bundled drawable images the app code references; null when the maps have no app source text. */
  imageUsage: ImageUsageInfo[] | null;
  /** npm packages the app's own code imports directly; null when the maps have no app source text. */
  directImports: string[] | null;
  /** Map file names used (no local paths). */
  maps: string[];
}

export interface Report {
  schemaVersion: 1;
  tool: { name: string; version: string };
  createdAt: string;
  app: {
    platform: 'android' | 'ios';
    artifact: ArtifactType;
    fileName: string;
    /** ABIs that contain native libraries. */
    abis: string[];
    /** Non-base AAB modules (dynamic features, asset packs). */
    extraModules: string[];
    js: JsEngineInfo | null;
    manifest: ManifestInfo;
    code: CodeInfo;
  };
  sizes: {
    file: number;
    /** `density` is set for AABs, where Play also splits resources by screen density. */
    download: SizeValue & { abi: string; density?: string };
    install: SizeValue & { abi: string };
    /** Bytes in the artifact that are never delivered to devices (AAB metadata, debug symbols). */
    notDelivered: number;
  };
  /** Breakdown of what a device on `sizes.download.abi` receives. */
  breakdown: BreakdownRow[];
  /** Per-ABI native library sizes (compressed) across the whole artifact. */
  nativeByAbi: { abi: string; compressed: number; uncompressed: number; count: number }[];
  /** Native libraries for the target ABI with ELF details, biggest first. */
  nativeLibs: NativeLibInfo[];
  /** Lottie animations shipped as files (res/raw, assets) or require()d into the JS bundle, biggest first. */
  lottie: LottieInfo[];
  /** npm package breakdown of the JS bundle; null when no source map was given. */
  packages: PackageReport | null;
  /** Real resource names for files R8 renamed to res/xx (path -> type/name); empty when not applicable. */
  resourceNames?: Record<string, string>;
  /** Largest delivered files (for the target ABI). */
  largestFiles: FileEntry[];
  /**
   * Every delivered file, small enough to keep in a saved report so two reports can be compared file
   * by file. Added in 0.3; missing from reports saved by older versions.
   */
  files?: ReportFile[];
  findings: Finding[];
  totals: { savingsBytes: number };
  meta: { durationMs: number; warnings: string[] };
}

export interface AnalyzeOptions {
  /** ABI used for download/install estimates. Default arm64-v8a. */
  abi?: string;
  /** Screen density for AAB estimates (mdpi…xxxhdpi). Default xxhdpi. */
  density?: string;
  /** How many largest files to include in the report. Default 25. */
  topFiles?: number;
  /** Check ids to skip. */
  ignore?: string[];
  toolVersion?: string;
  /** Source maps of the JS bundle, for the npm package breakdown (already parsed JSON). */
  sourceMaps?: SourceMapInput;
}

export interface SourceMapInput {
  /** The map of the shipped bundle: the composed Hermes map, or a plain JS map. */
  main: unknown;
  /** Metro's packager map (Hermes builds): adds JSON modules such as require()d Lottie files. */
  packager?: unknown;
  /** Plain JS maps only: the bundle text, for exact sizes. */
  bundleText?: string;
  /** Size of the bundle that sat next to the map, to detect a map from a different build. */
  siblingBundleBytes?: number;
  /** File names to show in the report (no local paths). */
  names: string[];
}
