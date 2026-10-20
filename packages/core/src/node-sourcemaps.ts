import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { InvalidOptionError } from './errors.js';
import { HERMES_MAGIC } from './js/hermes.js';
import type { SourceMapInput } from './types.js';

/**
 * Node-only: locate and load the source maps for the npm package breakdown, either from an explicit
 * `--sourcemap` file or from a React Native project's Gradle build output (`--project`).
 */

export interface LoadedMaps {
  input?: SourceMapInput;
  /** Explanations for the report when no usable map was found. */
  notes: string[];
}

const exists = async (path: string) => stat(path).then(() => true, () => false);

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    throw new InvalidOptionError(`Could not read source map ${path}: ${(err as Error).message}`);
  }
}

/** The bundle next to a map (`x.bundle.map` → `x.bundle`): text for JS maps, size for Hermes bytecode. */
async function siblingBundle(mapPath: string): Promise<Pick<SourceMapInput, 'bundleText' | 'siblingBundleBytes'>> {
  const bundlePath = mapPath.replace(/\.map$/i, '');
  if (bundlePath === mapPath || !(await exists(bundlePath))) return {};
  const buf = await readFile(bundlePath);
  if (buf.subarray(0, HERMES_MAGIC.length).equals(HERMES_MAGIC)) return { siblingBundleBytes: buf.length };
  return { bundleText: buf.toString('utf8'), siblingBundleBytes: buf.length };
}

export async function loadExplicitMap(mapPath: string): Promise<LoadedMaps> {
  if (!(await exists(mapPath))) throw new InvalidOptionError(`Source map not found: ${mapPath}`);
  return { input: { main: await readJson(mapPath), names: [basename(mapPath)], ...(await siblingBundle(mapPath)) }, notes: [] };
}

/**
 * React Native's Gradle plugin writes, per build variant (release, playRelease, …):
 *   android/app/build/generated/sourcemaps/react/<variant>/index.android.bundle.map          (shipped bundle)
 *   android/app/build/intermediates/sourcemaps/react/<variant>/index.android.bundle.packager.map
 *   android/app/build/generated/assets/createBundle<Variant>JsAndAssets/index.android.bundle  (RN 0.71+)
 * The most recently built variant is used.
 */
/**
 * Expo's `expo export -p android --source-maps` writes the bundle and its map under
 * dist/_expo/static/js/android/ (index-<hash>.hbc + .map, or .js + .map). Use the newest map there.
 */
async function loadExpoExportMap(projectDir: string): Promise<LoadedMaps | null> {
  const dir = join(projectDir, 'dist', '_expo', 'static', 'js', 'android');
  const entries = (await readdir(dir).catch(() => [] as string[])) as string[];
  const maps: { path: string; mtime: number }[] = [];
  for (const name of entries) {
    if (!name.endsWith('.map')) continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info) maps.push({ path, mtime: info.mtimeMs });
  }
  if (maps.length === 0) return null;
  const newest = maps.sort((a, b) => b.mtime - a.mtime)[0]!;
  const bundlePath = newest.path.replace(/\.map$/i, '');
  const bundle = await stat(bundlePath).catch(() => null);
  return {
    input: {
      main: await readJson(newest.path),
      siblingBundleBytes: bundle?.size,
      names: [`dist/.../${basename(newest.path)}`],
    },
    notes: [],
  };
}

export async function loadProjectMaps(projectDir: string): Promise<LoadedMaps> {
  const build = join(projectDir, 'android', 'app', 'build');
  const mapsDir = join(build, 'generated', 'sourcemaps', 'react');
  if (!(await exists(projectDir))) throw new InvalidOptionError(`Project folder not found: ${projectDir}`);

  const variants = (await readdir(mapsDir).catch(() => [] as string[])) as string[];
  const candidates: { variant: string; path: string; mtime: number }[] = [];
  for (const variant of variants) {
    const path = join(mapsDir, variant, 'index.android.bundle.map');
    const info = await stat(path).catch(() => null);
    if (info) candidates.push({ variant, path, mtime: info.mtimeMs });
  }
  if (candidates.length === 0) {
    const expo = await loadExpoExportMap(projectDir);
    if (expo) return expo;
    return {
      notes: [
        (await exists(join(projectDir, 'android')))
          ? 'No source map found in android/app/build or dist/. Build a release (cd android && ./gradlew bundleRelease) or run npx expo export -p android --source-maps, then run --project again.'
          : 'No source map found. For Expo, run `npx expo export -p android --source-maps` (its map lands in dist/_expo/static/js/android/), then run --project again — or pass one with --sourcemap.',
      ],
    };
  }
  const newest = candidates.sort((a, b) => b.mtime - a.mtime)[0]!;
  const packagerPath = join(build, 'intermediates', 'sourcemaps', 'react', newest.variant, 'index.android.bundle.packager.map');
  const variantTitle = newest.variant.charAt(0).toUpperCase() + newest.variant.slice(1);
  const bundleCandidates = [
    join(build, 'generated', 'assets', `createBundle${variantTitle}JsAndAssets`, 'index.android.bundle'),
    join(build, 'generated', 'assets', 'react', newest.variant, 'index.android.bundle'),
  ];
  let siblingBundleBytes: number | undefined;
  for (const path of bundleCandidates) {
    const info = await stat(path).catch(() => null);
    if (info) {
      siblingBundleBytes = info.size;
      break;
    }
  }

  const names = [`${newest.variant}/index.android.bundle.map`];
  let packager: unknown;
  if (await exists(packagerPath)) {
    packager = await readJson(packagerPath);
    names.push(`${newest.variant}/index.android.bundle.packager.map`);
  }
  return { input: { main: await readJson(newest.path), packager, siblingBundleBytes, names }, notes: [] };
}
