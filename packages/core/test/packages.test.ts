import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyze } from '../src/node.js';
import { cleanup, hermesBundle, jsBundle, makeZip } from './helpers.js';
import { hermesMap, packagerMap } from './sourcemap-fixtures.js';

afterAll(cleanup);

const KB = 1000;
const BUNDLE = 120 * KB;

const lottieText = (layers: number) =>
  JSON.stringify({ v: '5.7.4', fr: 30, ip: 0, op: 60, layers: Array.from({ length: layers }, (_, i) => ({ ty: 4, nm: `l${i}`, ks: {} })) });
const copyText = JSON.stringify({ words: Array.from({ length: 2000 }, (_, i) => `word-${i}`) });

const mainMap = hermesMap(
  [
    { path: '/app/node_modules/moment/moment.js' },
    { path: '/app/src/App.tsx', content: "const s = { title: { fontFamily: 'Rubik-Bold' }, sub: { fontFamily: 'Rubik-bold' } };" },
    { path: '/app/node_modules/lodash/lodash.js' },
    { path: '/app/node_modules/x/node_modules/lodash/lodash.js' },
  ],
  [
    [0, 0], // moment: 40 KB
    [40 * KB, 1], // App.tsx: 5 KB
    [45 * KB, 2], // lodash: 15 KB
    [60 * KB, 3], // second lodash copy: 15 KB
    [75 * KB], // 20 KB of code missing from the map (JSON)
    [95 * KB, 1], // App.tsx again: 5 KB
    [100 * KB, 1],
  ],
);
const packager = packagerMap([
  { path: '/app/src/anim/confetti.json', content: lottieText(5000) },
  { path: '/app/src/a/words.json', content: copyText },
  { path: '/app/src/b/words.json', content: copyText },
  { path: '/app/node_modules/react-native-vector-icons/glyphmaps/Feather.json', content: '{"x":1}' },
]);

const rubik = ['Black', 'Bold', 'BoldItalic', 'ExtraBold', 'Italic', 'Light', 'Medium', 'Regular', 'SemiBold'];
const apk = () =>
  makeZip(`pk-${Math.random()}.apk`, {
    'AndroidManifest.xml': KB,
    'classes.dex': KB,
    'assets/index.android.bundle': hermesBundle(BUNDLE),
    ...Object.fromEntries(rubik.map((w) => [`assets/fonts/Rubik-${w}.ttf`, 20 * KB])),
    'assets/fonts/Feather.ttf': 20 * KB,
    'assets/fonts/Ionicons.ttf': 30 * KB,
  });

describe('npm package breakdown', async () => {
  const report = await analyze(await apk(), { sourceMaps: { main: mainMap, packager, names: ['index.android.bundle.map'] } });
  const pk = report.packages!;
  const ids = report.findings.map((f) => f.checkId);

  it('splits the bundle into packages, app code, unmapped modules and data tables', () => {
    expect(pk.kind).toBe('hermes');
    expect(pk.bundleBytes).toBe(BUNDLE);
    expect(pk.items.map((p) => [p.name, p.bytes])).toEqual([
      ['moment', 40 * KB],
      ['lodash', 30 * KB],
    ]);
    expect(pk.items[1]).toMatchObject({ installs: 2, duplicateBytes: 15 * KB });
    expect(pk.appCodeBytes).toBe(10 * KB);
    expect(pk.unmappedCodeBytes).toBe(20 * KB);
    expect(pk.dataBytes).toBe(BUNDLE - 100 * KB);
    expect(pk.maps).toEqual(['index.android.bundle.map']);
  });

  it('lists JSON modules and finds require()d Lottie files', () => {
    expect(pk.jsonModules.find((m) => m.path === 'src/anim/confetti.json')?.lottie).toBe(true);
    const lottie = report.lottie.find((l) => l.path === 'src/anim/confetti.json');
    expect(lottie?.format).toBe('bundled');
    expect(report.findings.find((f) => f.checkId === 'lottie-large')?.title).toMatch(/in the JS bundle/);
  });

  it('flags heavy packages, duplicate versions and duplicate files', () => {
    expect(report.findings.find((f) => f.checkId === 'heavy-package')?.title).toMatch(/^moment adds 40 KB/);
    expect(report.findings.find((f) => f.checkId === 'duplicate-packages')?.items[0]).toMatchObject({ path: 'lodash', bytes: 15 * KB });
    expect(report.findings.find((f) => f.checkId === 'duplicate-modules')?.items[0]).toMatchObject({
      path: 'src/b/words.json',
      note: 'same as src/a/words.json',
    });
  });

  it('knows exactly which fonts are unused, and catches a wrong-case font name', () => {
    const weights = report.findings.find((f) => f.checkId === 'font-weights')!;
    expect(weights.title).toMatch(/^8 of 9 Rubik font files are never used \(160 KB\)$/);
    expect(weights.files).not.toContain('assets/fonts/Rubik-Bold.ttf');
    // Exact sizes of the 8 unused files as stored in the zip (a few bytes of overhead each).
    expect(weights.savings?.estimate).toBe(false);
    expect(weights.savings!.bytes).toBeGreaterThanOrEqual(8 * 20 * KB);
    expect(weights.savings!.bytes).toBeLessThan(8 * 20 * KB + 1000);
    const icons = report.findings.find((f) => f.checkId === 'icon-fonts')!;
    expect(icons.files).toEqual(['assets/fonts/Ionicons.ttf']);
    expect(icons.fix).toContain('iconFontNames: [ "Feather.ttf" ]');
    expect(report.findings.find((f) => f.checkId === 'font-name-case')?.title).toBe(
      "fontFamily 'Rubik-bold' doesn't match the font file Rubik-Bold.ttf",
    );
    expect(ids).not.toContain(undefined);
  });

  it('without a map, keeps the build-only estimates', async () => {
    const plain = await analyze(await apk());
    expect(plain.packages).toBeNull();
    expect(plain.findings.find((f) => f.checkId === 'font-weights')?.title).toMatch(/^9 Rubik font files bundled/);
    expect(plain.findings.some((f) => f.checkId === 'font-name-case')).toBe(false);
  });
});

describe('heavy-package advice depends on the rest of the bundle', () => {
  const mapWith = (packages: [string, number][]) => {
    let offset = 0;
    const segments: [number, number][] = [];
    packages.forEach(([, bytes], i) => {
      segments.push([offset, i]);
      offset += bytes;
    });
    segments.push([offset, packages.length - 1]);
    return hermesMap(packages.map(([name]) => ({ path: `/app/node_modules/${name}/index.js` })), segments);
  };
  const run = async (packages: [string, number][]) => {
    const path = await makeZip(`heavy-${Math.random()}.apk`, { 'AndroidManifest.xml': KB, 'classes.dex': KB, 'assets/index.android.bundle': hermesBundle(BUNDLE) });
    const r = await analyze(path, { sourceMaps: { main: mapWith(packages), names: ['m.map'] } });
    return r.findings.filter((f) => f.checkId === 'heavy-package');
  };

  it('tells you to move moment code to the date library you already have', async () => {
    const f = await run([['moment', 45 * KB], ['date-fns', 20 * KB]]);
    expect(f).toHaveLength(1);
    expect(f[0]!.fix).toMatch(/already includes date-fns/);
  });

  it('gives different advice when another dependency pulls the package in', async () => {
    const path = await makeZip('transitive.apk', { 'AndroidManifest.xml': KB, 'classes.dex': KB, 'assets/index.android.bundle': hermesBundle(BUNDLE) });
    const main = hermesMap(
      [
        { path: '/app/node_modules/ramda/src/index.js' },
        { path: '/app/node_modules/date-fns/index.js' },
        { path: '/app/src/App.tsx', content: "import { format } from 'date-fns';\nimport RenderHtml from 'react-native-render-html';" },
      ],
      [
        [0, 0], // ramda: 60 KB
        [60 * KB, 1], // date-fns: 50 KB
        [110 * KB, 2], // App.tsx: 9 KB
        [119 * KB, 2],
      ],
    );
    const r = await analyze(path, { sourceMaps: { main, names: ['m.map'] } });
    expect(r.packages?.directImports).toEqual(['date-fns', 'react-native-render-html']);
    const ramda = r.findings.find((f) => f.checkId === 'heavy-package' && f.title.startsWith('ramda'));
    expect(ramda?.severity).toBe('info');
    expect(ramda?.title).toMatch(/pulled in by another package/);
    expect(ramda?.fix).toMatch(/npm ls ramda/);
  });

  it('flags a whole date-fns only when it is big', async () => {
    expect(await run([['date-fns', 60 * KB]])).toHaveLength(0);
    const f = await run([['date-fns', 110 * KB]]);
    expect(f[0]?.fix).toMatch(/its own path/);
  });
});

describe('npm package breakdown: refusing maps that do not fit', () => {
  it('skips a map from a different build', async () => {
    const r = await analyze(await apk(), { sourceMaps: { main: mainMap, siblingBundleBytes: BUNDLE + 1, names: ['x.map'] } });
    expect(r.packages).toBeNull();
    expect(r.meta.warnings.join(' ')).toMatch(/different build/);
  });

  it('skips a Hermes map for a plain JS bundle', async () => {
    const path = await makeZip('jsc.apk', { 'AndroidManifest.xml': KB, 'classes.dex': KB, 'assets/index.android.bundle': jsBundle(BUNDLE) });
    const r = await analyze(path, { sourceMaps: { main: mainMap, names: ['x.map'] } });
    expect(r.packages).toBeNull();
    expect(r.meta.warnings.join(' ')).toMatch(/Hermes bytecode/);
  });
});

describe('--project: finding the maps in a React Native project', () => {
  it('uses the newest build variant and checks the bundle next to the map', async () => {
    const project = await mkdtemp(join(tmpdir(), 'rnsc-project-'));
    const build = join(project, 'android', 'app', 'build');
    await mkdir(join(build, 'generated', 'sourcemaps', 'react', 'playRelease'), { recursive: true });
    await mkdir(join(build, 'intermediates', 'sourcemaps', 'react', 'playRelease'), { recursive: true });
    await mkdir(join(build, 'generated', 'assets', 'createBundlePlayReleaseJsAndAssets'), { recursive: true });
    await writeFile(join(build, 'generated', 'sourcemaps', 'react', 'playRelease', 'index.android.bundle.map'), JSON.stringify(mainMap));
    await writeFile(join(build, 'intermediates', 'sourcemaps', 'react', 'playRelease', 'index.android.bundle.packager.map'), JSON.stringify(packager));
    await writeFile(join(build, 'generated', 'assets', 'createBundlePlayReleaseJsAndAssets', 'index.android.bundle'), Buffer.alloc(BUNDLE));

    const r = await analyze(await apk(), { project });
    expect(r.packages?.maps).toEqual(['playRelease/index.android.bundle.map', 'playRelease/index.android.bundle.packager.map']);
    expect(r.packages?.items[0]?.name).toBe('moment');

    // A rebuilt bundle (different size) means the maps no longer match the APK being analyzed.
    await writeFile(join(build, 'generated', 'assets', 'createBundlePlayReleaseJsAndAssets', 'index.android.bundle'), Buffer.alloc(BUNDLE + 5));
    const stale = await analyze(await apk(), { project });
    expect(stale.packages).toBeNull();
    expect(stale.meta.warnings.join(' ')).toMatch(/different build/);
    await rm(project, { recursive: true, force: true });
  });

  it('explains what to do when there is no map yet', async () => {
    const project = await mkdtemp(join(tmpdir(), 'rnsc-empty-'));
    await mkdir(join(project, 'android'));
    const r = await analyze(await apk(), { project });
    expect(r.packages).toBeNull();
    expect(r.meta.warnings[0]).toMatch(/Build a release first/);
    await rm(project, { recursive: true, force: true });
  });
});
