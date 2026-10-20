import type { ArchiveEntry, Category, FileEntry } from '../types.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|tiff?)$/i;
const FONT_EXT = /\.(ttf|otf|ttc)$/i;
const JS_BUNDLE = /\.(jsbundle|hbc|bundle)$/i;
const NATIVE_EXT = /\.(dylib|a)$/i;
const RESOURCE_EXT = /\.(nib|storyboardc|car|plist|strings|stringsdict|json|xml|mom|momd|cdm|loctable|pch|modulemap|map)$/i;

/** The in-app path (inside Payload/<App>.app/) and whether it sits directly in a bundle root. */
function appPath(path: string): { rel: string; inAppRoot: boolean; inFrameworkRoot: boolean } {
  const m = /^Payload\/[^/]+\.app\/(.*)$/.exec(path);
  const rel = m ? m[1]! : path;
  const inAppRoot = m ? !rel.includes('/') : false;
  const fw = /\.framework\/([^/]+)$/.exec(path);
  return { rel, inAppRoot, inFrameworkRoot: !!fw };
}

export function categorizeIos(path: string): Category {
  const { rel, inAppRoot, inFrameworkRoot } = appPath(path);
  const base = rel.split('/').pop() ?? rel;

  if (JS_BUNDLE.test(base) || /(^|\/)main\.jsbundle$/.test(rel)) return 'js';
  if (NATIVE_EXT.test(base)) return 'native';
  // A Mach-O executable: a file with no extension sitting directly in the .app or a .framework root
  // (the app binary and each framework's binary). PkgInfo is a tiny 8-byte stamp, not code.
  if (!base.includes('.') && (inAppRoot || inFrameworkRoot) && base !== 'PkgInfo') return 'native';
  if (FONT_EXT.test(base)) return 'font';
  if (IMAGE_EXT.test(base) || base === 'Assets.car') return 'image';
  if (RESOURCE_EXT.test(base) || /\.(lproj|bundle|storyboardc)\//.test(rel) || base === 'PkgInfo' || path.includes('_CodeSignature/') || /\.mobileprovision$/.test(base)) {
    return 'resources';
  }
  return 'other';
}

/** The `Payload/<App>.app/` prefix, or '' if the layout is unexpected. */
export function appRootOf(entries: ArchiveEntry[]): string {
  for (const e of entries) {
    const m = /^(Payload\/[^/]+\.app\/)/.exec(e.path);
    if (m) return m[1]!;
  }
  return '';
}

export function classifyIosEntries(entries: ArchiveEntry[]): FileEntry[] {
  return entries
    .filter((e) => !e.path.endsWith('/'))
    .map((e) => ({
      path: e.path,
      category: categorizeIos(e.path),
      compressed: e.compressedSize,
      uncompressed: e.uncompressedSize,
      module: 'base',
      delivered: true,
      crc32: e.crc32,
    }));
}
