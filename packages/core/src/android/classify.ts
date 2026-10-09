import type { ArchiveEntry, ArtifactType, Category, FileEntry } from '../types.js';
import { selectDensity } from './density.js';

const IMAGE_EXT = /\.(png|webp|jpe?g|gif|bmp)$/i;
const FONT_EXT = /\.(ttf|otf|ttc)$/i;
const JS_BUNDLE = /(^|\/)(index\.android\.bundle|[^/]+\.(bundle|hbc|jsbundle))$/i;

/** AAB top-level paths that Google Play never sends to devices. */
function isAabMetadata(path: string): boolean {
  return path === 'BundleConfig.pb' || path.startsWith('BUNDLE-METADATA/') || path.startsWith('META-INF/');
}

/**
 * Converts an AAB module path (`base/dex/classes.dex`, `base/root/kotlin/x`) to where the file
 * ends up in the generated APK (`classes.dex`, `kotlin/x`), so one set of rules covers both.
 */
function toApkPath(rest: string): string {
  if (rest.startsWith('dex/')) return rest.slice(4);
  if (rest.startsWith('root/')) return rest.slice(5);
  if (rest.startsWith('manifest/')) return rest.slice(9);
  if (rest === 'resources.pb') return 'resources.arsc';
  return rest;
}

export function categorize(apkPath: string): { category: Category; abi?: string } {
  const lib = /^lib\/([^/]+)\/[^/]+\.so$/.exec(apkPath);
  if (lib) return { category: 'native', abi: lib[1] };
  if (/^classes\d*\.dex$/.test(apkPath)) return { category: 'dex' };
  if (apkPath.startsWith('assets/') && JS_BUNDLE.test(apkPath)) return { category: 'js' };
  if (FONT_EXT.test(apkPath) && (apkPath.startsWith('assets/') || apkPath.startsWith('res/'))) {
    return { category: 'font' };
  }
  if (IMAGE_EXT.test(apkPath) && (apkPath.startsWith('assets/') || apkPath.startsWith('res/'))) {
    return { category: 'image' };
  }
  if (apkPath === 'resources.arsc' || apkPath.startsWith('res/') || apkPath === 'assets.pb' || apkPath === 'native.pb') {
    return { category: 'resources' };
  }
  return { category: 'other' };
}

export function classifyEntries(entries: ArchiveEntry[], artifact: ArtifactType): FileEntry[] {
  return entries.map((e) => {
    let module = 'base';
    let delivered = true;
    let apkPath = e.path;

    if (artifact === 'aab') {
      if (isAabMetadata(e.path)) {
        delivered = false;
        module = '(bundle)';
      } else {
        const slash = e.path.indexOf('/');
        module = slash === -1 ? '(bundle)' : e.path.slice(0, slash);
        apkPath = slash === -1 ? e.path : toApkPath(e.path.slice(slash + 1));
      }
    }

    const { category, abi } = delivered ? categorize(apkPath) : { category: 'other' as Category, abi: undefined };
    const file: FileEntry = {
      path: e.path,
      category,
      compressed: e.compressedSize,
      uncompressed: e.uncompressedSize,
      module,
      delivered,
      crc32: e.crc32,
    };
    if (abi) file.abi = abi;
    return file;
  });
}

/**
 * Files a device on `abi` / `density` downloads. For an APK that is the whole APK (the store cannot
 * split it); for an AAB it is the base module with only that ABI's native libraries and that
 * density's resources.
 */
export function deliveredTo(files: FileEntry[], artifact: ArtifactType, abi: string, density: string): FileEntry[] {
  if (artifact === 'apk') return files;
  const base = files.filter((f) => f.delivered && f.module === 'base' && (f.abi === undefined || f.abi === abi));
  return selectDensity(base, density);
}
