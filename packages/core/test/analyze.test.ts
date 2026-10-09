import { afterAll, describe, expect, it } from 'vitest';
import { analyze, InvalidOptionError, UnsupportedArtifactError } from '../src/node.js';
import { binaryManifest, dexWithClasses, elfLib, protoManifest } from './binary-fixtures.js';
import { blob, cleanup, hermesBundle, jsBundle, makeZip } from './helpers.js';

afterAll(cleanup);

const KB = 1024;

describe('analyze: universal APK', async () => {
  const path = await makeZip('universal.apk', {
    'AndroidManifest.xml': 2 * KB,
    'classes.dex': 300 * KB,
    'assets/index.android.bundle': jsBundle(200 * KB),
    'lib/arm64-v8a/libreactnative.so': 400 * KB,
    'lib/armeabi-v7a/libreactnative.so': 350 * KB,
    'lib/x86/libreactnative.so': 420 * KB,
    'lib/x86_64/libreactnative.so': 430 * KB,
    'res/drawable-mdpi-v4/src_assets_hero.png': 300 * KB,
    'assets/index.android.bundle.map': 50 * KB,
  });
  const report = await analyze(path);

  it('detects an APK on JSC', () => {
    expect(report.app.artifact).toBe('apk');
    expect(report.app.js?.engine).toBe('jsc');
    expect(report.app.abis).toEqual(['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86']);
    expect(report.sizes.download).toMatchObject({ abi: 'all', estimate: false });
  });

  it('flags the universal APK with savings equal to the other ABIs', () => {
    const f = report.findings.find((x) => x.checkId === 'abi-universal');
    expect(f?.severity).toBe('error');
    const otherAbis = report.nativeByAbi.filter((a) => a.abi !== 'arm64-v8a').reduce((s, a) => s + a.compressed, 0);
    expect(f?.savings?.bytes).toBe(otherAbis);
  });

  it('flags Hermes off, the large PNG and the shipped source map', () => {
    const ids = report.findings.map((f) => f.checkId);
    expect(ids).toEqual(expect.arrayContaining(['hermes-off', 'image-large', 'sourcemap-in-build']));
  });

  it('sorts errors before warnings', () => {
    const sev = report.findings.map((f) => f.severity);
    expect(sev.indexOf('error')).toBeLessThan(sev.indexOf('warn'));
  });
});

describe('analyze: AAB', async () => {
  const sameImage = blob(200 * KB);
  const path = await makeZip('app.aab', {
    'BundleConfig.pb': KB,
    'BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libreactnative.so.dbg': 900 * KB,
    'base/manifest/AndroidManifest.xml': 2 * KB,
    'base/dex/classes.dex': 300 * KB,
    'base/assets/index.android.bundle': hermesBundle(200 * KB),
    'base/lib/arm64-v8a/libreactnative.so': 400 * KB,
    'base/lib/x86/libreactnative.so': 420 * KB,
    'base/res/drawable-mdpi-v4/src_assets_before.png': sameImage,
    'base/res/drawable-mdpi-v4/src_assets_after.png': sameImage,
    'base/res/drawable-hdpi-v4/splash.png': 50 * KB,
    'base/res/drawable-xxhdpi-v4/splash.png': 90 * KB,
    'feature_ar/dex/classes.dex': 100 * KB,
  });
  const report = await analyze(path);

  it('detects Hermes', () => {
    expect(report.app.artifact).toBe('aab');
    expect(report.app.js).toMatchObject({ engine: 'hermes', hermesBytecodeVersion: 96 });
    expect(report.findings.some((f) => f.checkId === 'hermes-off')).toBe(false);
  });

  it('estimates download for one ABI and one density, excluding metadata and feature modules', () => {
    const delivered = report.largestFiles.map((f) => f.path);
    expect(delivered).toContain('base/lib/arm64-v8a/libreactnative.so');
    expect(delivered).not.toContain('base/lib/x86/libreactnative.so');
    expect(delivered).toContain('base/res/drawable-xxhdpi-v4/splash.png');
    expect(delivered).not.toContain('base/res/drawable-hdpi-v4/splash.png');
    expect(delivered.some((p) => p.startsWith('BUNDLE-METADATA'))).toBe(false);
    expect(report.sizes.notDelivered).toBeGreaterThan(900 * KB);
    expect(report.app.extraModules).toEqual(['feature_ar']);
    expect(report.sizes.download).toMatchObject({ abi: 'arm64-v8a', density: 'xxhdpi', estimate: true });
  });

  it('does not flag multiple ABIs for an AAB', () => {
    expect(report.findings.some((f) => f.checkId === 'abi-universal')).toBe(false);
  });

  it('counts each file once in total savings when several checks flag it', () => {
    // src_assets_after.png is both a duplicate (full size) and a large PNG (~40%): count the bigger saving only.
    const dup = report.findings.find((f) => f.checkId === 'duplicate-files');
    const img = report.findings.find((f) => f.checkId === 'image-large');
    expect(dup?.savings?.bytes).toBeGreaterThan(0);
    expect(img?.savings?.bytes).toBeGreaterThan(0);
    expect(report.totals.savingsBytes).toBeLessThan(dup!.savings!.bytes + img!.savings!.bytes);
  });

  it('respects --ignore', async () => {
    const r = await analyze(path, { ignore: ['duplicate-files'] });
    expect(r.findings.some((f) => f.checkId === 'duplicate-files')).toBe(false);
  });
});

describe('analyze: manifest, R8 and native symbols', async () => {
  const manifest = protoManifest({
    name: 'manifest',
    attrs: [
      { name: 'package', value: 'com.example.app' },
      { name: 'versionCode', resId: 0x0101021b, prim: { int: 5 } },
    ],
  });
  const plainDex = dexWithClasses(['Lcom/example/MainActivity;', 'Lcom/example/MainApplication;', 'Lcom/facebook/react/ReactActivity;']);
  const minifiedDex = dexWithClasses(['La/a;', 'La/b;', 'Lb/c;', 'Lcom/example/MainActivity;']);

  const aab = (dex: Buffer, extra: Record<string, Buffer | number> = {}) =>
    makeZip(`r8-${Math.random()}.aab`, {
      'BundleConfig.pb': KB,
      'base/manifest/AndroidManifest.xml': manifest,
      'base/dex/classes.dex': dex,
      'base/assets/index.android.bundle': hermesBundle(10 * KB),
      'base/lib/arm64-v8a/libstripped.so': elfLib(200 * KB, 0),
      ...extra,
    });

  it('reads the manifest', async () => {
    const r = await analyze(await aab(plainDex));
    expect(r.app.manifest).toMatchObject({ packageName: 'com.example.app', versionCode: 5 });
    expect(r.meta.warnings).toEqual([]);
  });

  it('flags R8 off for unminified code', async () => {
    const r = await analyze(await aab(plainDex));
    expect(r.app.code.minified).toBe(false);
    expect(r.findings.find((f) => f.checkId === 'r8-off')?.savings?.estimate).toBe(true);
  });

  it('trusts the AAB mapping file and minified class names', async () => {
    const withMap = await analyze(await aab(plainDex, { 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map': KB }));
    expect(withMap.app.code).toMatchObject({ minified: true, mappingFile: true });
    const minified = await analyze(await aab(minifiedDex));
    expect(minified.app.code.minified).toBe(true);
    expect(minified.findings.some((f) => f.checkId === 'r8-off')).toBe(false);
  });

  it('flags unstripped native libraries for the target ABI only', async () => {
    const r = await analyze(
      await aab(minifiedDex, {
        'base/lib/arm64-v8a/libunstripped.so': elfLib(100 * KB, 900 * KB),
        'base/lib/x86/libunstripped.so': elfLib(100 * KB, 900 * KB),
      }),
    );
    const f = r.findings.find((x) => x.checkId === 'native-debug-symbols');
    expect(f?.files).toEqual(['base/lib/arm64-v8a/libunstripped.so']);
    expect(f?.severity).toBe('error');
    expect(r.nativeLibs.find((l) => l.path.endsWith('libstripped.so'))?.debugBytes).toBe(0);
  });

  it('flags a debuggable APK and skips the R8 check for it', async () => {
    const apk = await makeZip('debuggable.apk', {
      'AndroidManifest.xml': binaryManifest([
        { name: 'manifest', attrs: [{ name: 'package', type: 'string', value: 'com.example.app' }] },
        { name: 'application', attrs: [{ name: 'debuggable', resId: 0x0101000f, type: 'bool', value: true }] },
      ]),
      'classes.dex': plainDex,
    });
    const r = await analyze(apk);
    const ids = r.findings.map((f) => f.checkId);
    expect(ids[0]).toBe('debuggable');
    expect(ids).not.toContain('r8-off');
  });
});

describe('analyze: bad input', () => {
  it('rejects an IPA with a clear message', async () => {
    const path = await makeZip('app.ipa', { 'Payload/App.app/App': KB });
    await expect(analyze(path)).rejects.toThrow(UnsupportedArtifactError);
  });

  it('warns when a debug APK has no JS bundle', async () => {
    const path = await makeZip('debug.apk', { 'AndroidManifest.xml': KB, 'classes.dex': KB });
    const r = await analyze(path);
    expect(r.app.js).toBeNull();
    expect(r.meta.warnings.join(' ')).toMatch(/No JS bundle/);
  });

  it('reports a missing file as ENOENT', async () => {
    await expect(analyze('does-not-exist.aab')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an unknown density', async () => {
    const path = await makeZip('d.apk', { 'AndroidManifest.xml': KB, 'classes.dex': KB });
    await expect(analyze(path, { density: 'huge' })).rejects.toThrow(InvalidOptionError);
  });
});
