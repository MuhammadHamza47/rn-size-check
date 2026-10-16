import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** Where Gradle puts release builds, relative to the project (or to its android/ folder). */
const OUTPUT_DIRS = ['android/app/build/outputs', 'app/build/outputs'];

/**
 * The newest release .aab or .apk under a React Native project, or null.
 * Covers flavors too (bundle/playRelease, apk/play/release); debug builds are skipped.
 */
export async function findReleaseBuild(projectDir: string): Promise<string | null> {
  let best: { path: string; mtime: number } | null = null;
  for (const dir of OUTPUT_DIRS) {
    for (const path of await listFiles(join(projectDir, dir), 3)) {
      if (!/\.(aab|apk)$/i.test(path) || !/release/i.test(relative(projectDir, path))) continue;
      const { mtimeMs } = await stat(path);
      if (!best || mtimeMs > best.mtime) best = { path, mtime: mtimeMs };
    }
  }
  return best ? relative(process.cwd(), best.path) || best.path : null;
}

async function listFiles(dir: string, depth: number): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isFile()) out.push(path);
    else if (e.isDirectory() && depth > 0) out.push(...(await listFiles(path, depth - 1)));
  }
  return out;
}
