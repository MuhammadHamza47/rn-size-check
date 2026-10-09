import { describe, expect, it } from 'vitest';
import { categorize, classifyEntries } from '../src/android/classify.js';
import { selectDensity } from '../src/android/density.js';
import { detectBundleKind } from '../src/js/hermes.js';
import type { ArchiveEntry } from '../src/types.js';
import { hermesBundle, jsBundle } from './helpers.js';

const entry = (path: string, size = 1000): ArchiveEntry => ({
  path,
  compressedSize: size,
  uncompressedSize: size,
  compressionMethod: 8,
  crc32: 0,
});

describe('categorize', () => {
  it.each([
    ['lib/arm64-v8a/libhermes.so', 'native'],
    ['classes.dex', 'dex'],
    ['classes12.dex', 'dex'],
    ['assets/index.android.bundle', 'js'],
    ['assets/fonts/Inter-Bold.ttf', 'font'],
    ['res/font/inter.otf', 'font'],
    ['res/drawable-xxhdpi-v4/src_assets_logo.png', 'image'],
    ['res/drawable/bg.xml', 'resources'],
    ['resources.arsc', 'resources'],
    ['META-INF/MANIFEST.MF', 'other'],
    ['kotlin/collections/collections.kotlin_builtins', 'other'],
  ])('%s → %s', (path, category) => {
    expect(categorize(path).category).toBe(category);
  });

  it('extracts the ABI of native libraries', () => {
    expect(categorize('lib/armeabi-v7a/libc++_shared.so').abi).toBe('armeabi-v7a');
  });
});

describe('classifyEntries (AAB)', () => {
  it('maps module paths and marks bundle metadata as not delivered', () => {
    const files = classifyEntries(
      [
        entry('base/dex/classes.dex'),
        entry('base/lib/x86/libfoo.so'),
        entry('base/root/kotlin/x.kotlin_builtins'),
        entry('base/resources.pb'),
        entry('BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libfoo.so.dbg'),
        entry('BundleConfig.pb'),
        entry('feature_camera/dex/classes.dex'),
      ],
      'aab',
    );
    const by = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(by['base/dex/classes.dex']?.category).toBe('dex');
    expect(by['base/lib/x86/libfoo.so']).toMatchObject({ category: 'native', abi: 'x86' });
    expect(by['base/resources.pb']?.category).toBe('resources');
    expect(by['BundleConfig.pb']?.delivered).toBe(false);
    expect(by['BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libfoo.so.dbg']?.delivered).toBe(false);
    expect(by['feature_camera/dex/classes.dex']?.module).toBe('feature_camera');
  });
});

describe('selectDensity', () => {
  const files = classifyEntries(
    [
      entry('base/res/drawable-mdpi-v4/a.png'),
      entry('base/res/drawable-xhdpi-v4/a.png'),
      entry('base/res/drawable-xxxhdpi-v4/a.png'),
      entry('base/res/drawable-night-xhdpi-v8/a.png'),
      entry('base/res/drawable-mdpi-v4/only_mdpi.png'),
      entry('base/res/drawable-nodpi/any.png'),
      entry('base/res/drawable/vector.xml'),
    ],
    'aab',
  );
  const pick = (d: string) => selectDensity(files, d).map((f) => f.path).sort();

  it('picks the nearest higher density, else the highest lower one', () => {
    expect(pick('xxhdpi')).toEqual(
      [
        'base/res/drawable-mdpi-v4/only_mdpi.png',
        'base/res/drawable-night-xhdpi-v8/a.png',
        'base/res/drawable-nodpi/any.png',
        'base/res/drawable-xxxhdpi-v4/a.png',
        'base/res/drawable/vector.xml',
      ].sort(),
    );
    expect(pick('xhdpi')).toContain('base/res/drawable-xhdpi-v4/a.png');
    expect(pick('xhdpi')).not.toContain('base/res/drawable-xxxhdpi-v4/a.png');
  });
});

describe('detectBundleKind', () => {
  it('detects Hermes bytecode and its version', () => {
    expect(detectBundleKind(hermesBundle(64, 96))).toEqual({ engine: 'hermes', hermesBytecodeVersion: 96 });
  });
  it('detects a plain JS bundle', () => {
    expect(detectBundleKind(jsBundle(10)).engine).toBe('jsc');
  });
  it('returns unknown for anything else', () => {
    expect(detectBundleKind(Buffer.from([1, 2, 3, 4])).engine).toBe('unknown');
  });
});
