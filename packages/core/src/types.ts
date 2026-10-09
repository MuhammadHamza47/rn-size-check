import type { ManifestInfo } from './android/manifest.js';

export type ArtifactType = 'apk' | 'aab';

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

export interface Report {
  schemaVersion: 1;
  tool: { name: string; version: string };
  createdAt: string;
  app: {
    platform: 'android';
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
  /** Largest delivered files (for the target ABI). */
  largestFiles: FileEntry[];
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
}
