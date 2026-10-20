/**
 * Which bundled drawable images the app's code actually references.
 *
 * When RN code does `require('./logo.png')`, Metro copies the image into the res/drawable folders under
 * a flattened name relative to the project root (src/assets/images/logo.png becomes
 * src_assets_images_logo.png) and the require() call stays in the app's source. We resolve each image
 * require against the file that contains it (so a relative path lines up with the project-root name),
 * then flag an image whose folder the code requires from but whose name it never references. Conservative
 * by design - native and library drawables live in other folders and stay unjudged.
 */

import type { ImageUsageInfo } from '../types.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
const STRIP_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

/**
 * Flatten one path segment the way Metro's getAndroidResourceIdentifier does: lowercase, then *remove*
 * every character that isn't a-z0-9 (so `promo-banner` becomes `promobanner`, not `promo_banner`). Separators
 * become underscores separately, by joining the segments with `_`.
 */
const flattenSeg = (s: string) => s.toLowerCase().replace(/@\d+(\.\d+)?x$/i, '').replace(/[^a-z0-9]/g, '');

export interface SourceFile {
  path: string;
  text: string;
}

/**
 * We match on the last two path segments (folder + file), so path aliases (`@/assets/…`), relative
 * paths and absolute roots all line up with the drawable name without resolving the project root.
 * `assets/images/logo.png` and `src_assets_images_logo.png` both reduce to `images_logo`.
 */
function lastTwo(segs: string[]): { key: string; parent: string } | null {
  const flat = segs.map((s, i) => flattenSeg(i === segs.length - 1 ? s.replace(STRIP_EXT, '') : s)).filter(Boolean);
  if (flat.length < 2) return null;
  const parent = flat[flat.length - 2]!;
  return { key: `${parent}_${flat[flat.length - 1]}`, parent };
}

/** Image references in the app source, reduced to their folder+file keys and the folders they live in. */
function referenced(files: SourceFile[]): { keys: Set<string>; parents: Set<string> } {
  const keys = new Set<string>();
  const parents = new Set<string>();
  for (const file of files) {
    for (const m of file.text.matchAll(/['"`]([^'"`]+\.(?:png|jpe?g|gif|webp|bmp))['"`]/gi)) {
      const raw = m[1]!.replace(/[?#].*$/, '');
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) continue; // remote URL, not bundled
      const lt = lastTwo(raw.split(/[\\/]+/).filter((s) => s && s !== '.' && s !== '..'));
      if (!lt) continue;
      keys.add(lt.key);
      parents.add(lt.parent);
    }
  }
  return { keys, parents };
}

const resourceName = (path: string) => (path.split(/[\\/]/).pop() ?? path).replace(STRIP_EXT, '').toLowerCase();
const isDrawable = (p: string) => /(^|[\\/])res[\\/]drawable[^\\/]*[\\/]/.test(p) && IMAGE_EXT.test(p);

/**
 * For each delivered image, whether the app code references it. `null` for images we won't judge
 * (library assets, native resources) or when there are no app source files to search.
 */
export function imageUsage(imagePaths: string[], sources: SourceFile[] | null): ImageUsageInfo[] | null {
  if (sources === null) return null;
  const { keys, parents } = referenced(sources);
  return imagePaths.map((path) => {
    if (!isDrawable(path)) return { path, used: null };
    const name = resourceName(path);
    if (name.includes('node_modules')) return { path, used: null };
    const lt = lastTwo(name.split('_'));
    if (!lt) return { path, used: null };
    if (keys.has(lt.key)) return { path, used: true };
    // Only judge a drawable that lives in a folder the app requires images from.
    if (parents.has(lt.parent)) return { path, used: false };
    return { path, used: null };
  });
}
