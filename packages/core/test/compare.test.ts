import { afterAll, describe, expect, it } from 'vitest';
import {
  analyze,
  comparablePath,
  compareReports,
  comparisonToMarkdown,
  InvalidOptionError,
  reportFromJson,
  type Finding,
  type PackageReport,
  type Report,
} from '../src/node.js';
import { binaryManifest, dexWithClasses } from './binary-fixtures.js';
import { blob, cleanup, hermesBundle, jsBundle, makeZip } from './helpers.js';

afterAll(cleanup);

const KB = 1024;

const manifest = (versionName: string, versionCode: number) =>
  binaryManifest([
    {
      name: 'manifest',
      attrs: [
        { name: 'package', type: 'string', value: 'com.example.app' },
        { name: 'versionCode', resId: 0x0101021b, type: 'int', value: versionCode },
        { name: 'versionName', resId: 0x0101021c, type: 'string', value: versionName },
      ],
    },
  ]);

describe('compare: two APK builds', async () => {
  const lib = blob(400 * KB);
  // Minified class names, so R8 counts as on in both builds.
  const dex = dexWithClasses(Array.from({ length: 40 }, (_, i) => 'La' + String.fromCharCode(97 + (i % 26)) + ';'));
  const oldReport = await analyze(
    await makeZip('old.apk', {
      'AndroidManifest.xml': manifest('1.0', 1),
      'classes.dex': dex,
      'assets/index.android.bundle': hermesBundle(200 * KB),
      'lib/arm64-v8a/libreactnative.so': lib,
      'res/drawable-mdpi-v4/hero.png': 300 * KB,
      'assets/index.android.bundle.map': 50 * KB,
      'res/raw/tiny.json': 600,
    }),
  );
  const newReport = await analyze(
    await makeZip('new.apk', {
      'AndroidManifest.xml': manifest('1.1', 2),
      'classes.dex': dex,
      'assets/index.android.bundle': jsBundle(260 * KB),
      'lib/arm64-v8a/libreactnative.so': lib,
      'res/drawable-mdpi-v4/onboarding.png': 150 * KB,
      'res/raw/tiny.json': 900,
    }),
  );
  const c = compareReports(oldReport, newReport);

  it('reports the download change', () => {
    expect(c.sizes.download.change).toBe(newReport.sizes.download.bytes - oldReport.sizes.download.bytes);
    expect(c.sizes.download.change).toBeLessThan(0);
    expect(c.old.versionName).toBe('1.0');
    expect(c.new.versionCode).toBe(2);
  });

  it('lists added, removed and grown files, and skips tiny changes', () => {
    const byPath = new Map(c.files!.map((f) => [f.path, f]));
    expect(byPath.get('res/drawable-mdpi-v4/onboarding.png')?.kind).toBe('added');
    expect(byPath.get('res/drawable-mdpi-v4/hero.png')?.kind).toBe('removed');
    expect(byPath.get('assets/index.android.bundle')?.kind).toBe('grew');
    expect(byPath.has('lib/arm64-v8a/libreactnative.so')).toBe(false); // unchanged
    expect(byPath.has('res/raw/tiny.json')).toBe(false); // 300 bytes
    // Biggest change first.
    expect(c.files![0]!.path).toBe('res/drawable-mdpi-v4/hero.png');
  });

  it('gives category totals', () => {
    const images = c.categories.find((r) => r.category === 'image')!;
    expect(images.change).toBeLessThan(-100 * KB);
  });

  it('knows which problems are new and which are fixed', () => {
    expect(c.findings.added.map((f) => f.checkId)).toContain('hermes-off');
    expect(c.findings.fixed.map((f) => f.checkId)).toContain('sourcemap-in-build');
    // A big PNG on both sides is the same open problem, even though it's a different file.
    expect(c.findings.added.map((f) => f.checkId)).not.toContain('image-large');
    expect(c.findings.fixed.map((f) => f.checkId)).not.toContain('image-large');
  });

  it('renders Markdown for a pull request', () => {
    const md = comparisonToMarkdown(c);
    expect(md).toMatch(/^### 📦 App size: com\.example\.app 1\.0 \(1\) → 1\.1 \(2\)/);
    expect(md).toContain('| Images |');
    expect(md).toContain('| `drawable-mdpi-v4/onboarding.png` | +');
    expect(md).toContain('**New problems**');
    expect(md).toContain('**Fixed**');
  });
});

describe('compare: report details', () => {
  const base = (over: Partial<Report> = {}): Report =>
    ({
      schemaVersion: 1,
      tool: { name: 'rn-size-check', version: '0.3.0' },
      createdAt: '2026-10-16T00:00:00.000Z',
      app: {
        platform: 'android',
        artifact: 'aab',
        fileName: 'app-release.aab',
        abis: ['arm64-v8a'],
        extraModules: [],
        js: null,
        manifest: { packageName: 'com.example.app' },
        code: { minified: true, obfuscatedShare: 0.5, mappingFile: true },
      },
      sizes: {
        file: 10_000_000,
        download: { bytes: 5_000_000, estimate: true, abi: 'arm64-v8a', density: 'xxhdpi' },
        install: { bytes: 8_000_000, estimate: true, abi: 'arm64-v8a' },
        notDelivered: 0,
      },
      breakdown: [],
      nativeByAbi: [],
      nativeLibs: [],
      lottie: [],
      packages: null,
      largestFiles: [],
      files: [],
      findings: [],
      totals: { savingsBytes: 0 },
      meta: { durationMs: 1, warnings: [] },
      ...over,
    }) as Report;

  const packages = (items: [string, number][], appCode = 100_000): PackageReport => ({
    kind: 'hermes',
    estimate: false,
    bundleBytes: 1_000_000,
    appCodeBytes: appCode,
    runtimeBytes: 0,
    dataBytes: 0,
    unmappedCodeBytes: 0,
    items: items.map(([name, bytes]) => ({ name, bytes, files: 1, installs: 1, duplicateBytes: 0 })),
    jsonModules: [],
    duplicateModules: [],
    fontUsage: null,
    directImports: null,
    maps: ['index.android.bundle.map'],
  });

  it('compares npm packages when both reports have them', () => {
    const c = compareReports(
      base({ packages: packages([['react-native', 600_000], ['moment', 50_000], ['dayjs', 500]]) }),
      base({ packages: packages([['react-native', 620_000], ['date-fns', 30_000]], 140_000) }),
    );
    expect(c.packages).toEqual([
      { name: 'moment', kind: 'removed', old: 50_000, new: 0, change: -50_000 },
      { name: 'date-fns', kind: 'added', old: 0, new: 30_000, change: 30_000 },
      { name: 'react-native', kind: 'grew', old: 600_000, new: 620_000, change: 20_000 },
    ]);
    expect(c.js?.appCode.change).toBe(40_000);
  });

  it('explains when only one side has the package breakdown', () => {
    const c = compareReports(base({ packages: packages([['react-native', 1]]) }), base());
    expect(c.packages).toBeNull();
    expect(c.notes.join(' ')).toMatch(/Only the old build has the npm package breakdown/);
  });

  it('matches AAB and APK paths of the same file', () => {
    expect(comparablePath('base/res/drawable-xxhdpi-v4/a.png', 'aab')).toBe('res/drawable-xxhdpi-v4/a.png');
    expect(comparablePath('base/dex/classes2.dex', 'aab')).toBe('classes2.dex');
    expect(comparablePath('base/root/kotlin/collections.kotlin_builtins', 'aab')).toBe('kotlin/collections.kotlin_builtins');
    expect(comparablePath('feature_ar/dex/classes.dex', 'aab')).toBe('feature_ar/dex/classes.dex');
    expect(comparablePath('res/drawable/a.png', 'apk')).toBe('res/drawable/a.png');
  });

  it('still compares totals when an old report has no file list', () => {
    const old = base({ tool: { name: 'rn-size-check', version: '0.2.1' } });
    delete old.files;
    const c = compareReports(old, base());
    expect(c.files).toBeNull();
    expect(c.notes[0]).toMatch(/The old report \(app-release\.aab\) was saved by rn-size-check 0\.2\.1/);
  });

  it('warns when the reports estimate different phones', () => {
    const other = base();
    other.sizes = { ...other.sizes, download: { ...other.sizes.download, abi: 'armeabi-v7a' } };
    expect(compareReports(base(), other).notes.join(' ')).toMatch(/different phones/);
  });

  it('pairs findings of one check by package name or shared file', () => {
    const f = (checkId: string, title: string, files: string[] = []): Finding => ({ checkId, severity: 'warn', title, files, items: [], fix: '' });
    const c = compareReports(
      base({
        findings: [
          f('heavy-package', 'moment adds 50 KB of bytecode to the JS bundle'),
          f('heavy-package', 'lodash adds 70 KB of bytecode to the JS bundle'),
          f('font-weights', '3 of 7 Manrope font files are never used', ['assets/fonts/Manrope-Light.ttf']),
          f('font-weights', '2 of 4 Inter font files are never used', ['assets/fonts/Inter-Thin.ttf']),
        ],
      }),
      base({
        findings: [
          f('heavy-package', 'lodash adds 72 KB of bytecode to the JS bundle'),
          f('font-weights', '4 of 7 Manrope font files are never used', ['assets/fonts/Manrope-Light.ttf', 'assets/fonts/Manrope-Bold.ttf']),
          f('r8-off', 'R8 is off'),
        ],
      }),
    );
    expect(c.findings.added.map((x) => x.title)).toEqual(['R8 is off']);
    expect(c.findings.fixed.map((x) => x.title)).toEqual([
      'moment adds 50 KB of bytecode to the JS bundle',
      '2 of 4 Inter font files are never used',
    ]);
  });

  it('says when an open problem got worse or better', () => {
    const img = (n: number, bytes: number): Finding => ({
      checkId: 'image-large',
      severity: 'warn',
      title: `${n} PNG/JPEG images over 100 KB`,
      savings: { bytes, estimate: true },
      files: [],
      items: [],
      fix: '',
    });
    const worse = compareReports(base({ findings: [img(10, 2_000_000)] }), base({ findings: [img(11, 2_400_000)] }));
    expect(worse.findings.worse).toEqual([expect.objectContaining({ title: '11 PNG/JPEG images over 100 KB', oldTitle: '10 PNG/JPEG images over 100 KB' })]);
    expect(worse.findings.added).toEqual([]);
    const better = compareReports(base({ findings: [img(11, 2_400_000)] }), base({ findings: [img(10, 2_000_000)] }));
    expect(better.findings.better).toHaveLength(1);
    const same = compareReports(base({ findings: [img(10, 2_000_000)] }), base({ findings: [img(10, 2_000_000)] }));
    expect([...same.findings.worse, ...same.findings.better]).toEqual([]);
  });

  it("doesn't call map-only findings new when only the new build has a map", () => {
    const f = (checkId: string, title: string): Finding => ({ checkId, severity: 'warn', title, files: [], items: [], fix: '' });
    const c = compareReports(
      base(),
      base({
        packages: packages([['moment', 50_000]]),
        findings: [f('heavy-package', 'moment adds 50 KB of bytecode to the JS bundle'), f('r8-off', 'R8 is off')],
      }),
    );
    expect(c.findings.added.map((x) => x.checkId)).toEqual(['r8-off']);
    expect(c.notes.join(' ')).toMatch(/left out of new\/fixed/);
  });

  it('accepts a saved report and refuses other JSON', () => {
    expect(reportFromJson(JSON.parse(JSON.stringify(base())), 'a.json').app.fileName).toBe('app-release.aab');
    expect(() => reportFromJson({ hello: 1 }, 'package.json')).toThrow(InvalidOptionError);
    expect(() => reportFromJson({ kind: 'rn-size-check-comparison' }, 'c.json')).toThrow(/is a comparison/);
  });
});
