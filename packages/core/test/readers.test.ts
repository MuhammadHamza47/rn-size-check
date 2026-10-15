import { describe, expect, it } from 'vitest';
import { obfuscatedShare, readDexClassNames } from '../src/android/dex.js';
import { debugSectionBytes, readElfHeader } from '../src/android/elf.js';
import { parseBinaryManifest, parseProtoManifest } from '../src/android/manifest.js';
import { embeddedImages, looksLikeLottie } from '../src/assets/lottie.js';
import { binaryManifest, dexWithClasses, elfLib, protoManifest } from './binary-fixtures.js';

describe('parseBinaryManifest (APK)', () => {
  it('reads package, version, sdk and application flags', () => {
    const buf = binaryManifest([
      {
        name: 'manifest',
        attrs: [
          { name: 'versionCode', resId: 0x0101021b, type: 'int', value: 42 },
          { name: 'versionName', resId: 0x0101021c, type: 'string', value: '2.4.0' },
          { name: 'package', type: 'string', value: 'com.example.game' },
        ],
      },
      { name: 'uses-sdk', attrs: [{ name: 'minSdkVersion', resId: 0x0101020c, type: 'int', value: 24 }] },
      { name: 'application', attrs: [{ name: 'debuggable', resId: 0x0101000f, type: 'bool', value: true }] },
    ]);
    expect(parseBinaryManifest(buf)).toEqual({
      packageName: 'com.example.game',
      versionName: '2.4.0',
      versionCode: 42,
      minSdk: 24,
      targetSdk: undefined,
      debuggable: true,
      extractNativeLibs: undefined,
    });
  });

  it('resolves stripped attribute names through resource ids', () => {
    const buf = binaryManifest([
      { name: 'manifest', attrs: [{ name: '', resId: 0x0101021b, type: 'int', value: 7 }] },
    ]);
    expect(parseBinaryManifest(buf).versionCode).toBe(7);
  });
});

describe('parseProtoManifest (AAB)', () => {
  it('reads string values and compiled primitives in nested elements', () => {
    const buf = protoManifest({
      name: 'manifest',
      attrs: [
        { name: 'package', value: 'com.example.shop' },
        { name: 'versionCode', value: '13', resId: 0x0101021b, prim: { int: 13 } },
        { name: 'versionName', value: '1.3', resId: 0x0101021c },
      ],
      children: [
        { name: 'uses-sdk', attrs: [{ name: 'minSdkVersion', value: '24', resId: 0x0101020c, prim: { int: 24 } }] },
        { name: 'application', attrs: [{ name: 'extractNativeLibs', resId: 0x010104ea, prim: { bool: false } }] },
      ],
    });
    expect(parseProtoManifest(buf)).toMatchObject({
      packageName: 'com.example.shop',
      versionCode: 13,
      versionName: '1.3',
      minSdk: 24,
      extractNativeLibs: false,
    });
  });
});

describe('dex', () => {
  it('reads class names', () => {
    const names = readDexClassNames(dexWithClasses(['Lcom/app/MainActivity;', 'La/b;']));
    expect(names).toEqual(['Lcom/app/MainActivity;', 'La/b;']);
  });

  it('measures the share of minified class names', () => {
    expect(obfuscatedShare(['Lcom/app/MainActivity;', 'Lcom/app/Foo$Bar;'])).toBe(0);
    expect(obfuscatedShare(['La/b;', 'Lcom/app/c0;', 'Lx/y$a;', 'Lcom/app/Real;'])).toBe(0.75);
  });

  it('ignores files that are not dex', () => {
    expect(readDexClassNames(Buffer.alloc(200))).toEqual([]);
  });
});

describe('lottie', () => {
  it('recognises Lottie JSON by its header fields', () => {
    expect(looksLikeLottie('{"v":"5.7.4","fr":30,"ip":0,"op":90,"layers":[]}')).toBe(true);
    expect(looksLikeLottie('  {"v":"5.12.1","layers":[') ).toBe(true);
    // LottieFiles toolkit exports: name and layers first, version at the end of the file.
    expect(looksLikeLottie('{"nm":"Comp 1","ddd":0,"h":1000,"w":1000,"meta":{"g":"@lottiefiles/toolkit-js 0.33.2"},"layers":[{"ty":4,"nm":"x"')).toBe(true);
    expect(looksLikeLottie('{"name":"app","version":"1.0.0"}')).toBe(false);
    expect(looksLikeLottie('{"data":{"layers":["a","b"]}}')).toBe(false);
    expect(looksLikeLottie('[1,2,3]')).toBe(false);
  });

  it('counts embedded base64 images and their decoded size', () => {
    const img = Buffer.alloc(3000, 7).toString('base64');
    const json = `{"assets":[{"id":"a","p":"data:image/png;base64,${img}"},{"id":"b","p":"data:image/jpeg;base64,${img}"},{"id":"c","p":"img_2.png"}]}`;
    expect(embeddedImages(json)).toEqual({ count: 2, bytes: 6000 });
    expect(embeddedImages('{"assets":[]}')).toEqual({ count: 0, bytes: 0 });
  });
});

describe('elf', () => {
  it('counts non-loaded debug sections only', () => {
    const lib = elfLib(1000, 300_000);
    const header = readElfHeader(lib)!;
    expect(header.is64).toBe(true);
    expect(debugSectionBytes(header, lib.subarray(header.shoff))).toBe(300_000);
  });

  it('reports zero for a stripped library', () => {
    const lib = elfLib(5000, 0);
    const header = readElfHeader(lib)!;
    expect(debugSectionBytes(header, lib.subarray(header.shoff))).toBe(0);
  });

  it('rejects non-ELF data', () => {
    expect(readElfHeader(Buffer.alloc(64))).toBeNull();
  });
});
