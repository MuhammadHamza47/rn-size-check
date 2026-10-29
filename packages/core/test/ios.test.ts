import { afterAll, describe, expect, it } from 'vitest';
import { analyze } from '../src/node.js';
import { parsePlist } from '../src/ios/plist.js';
import { blob, cleanup, hermesBundle, makeZip } from './helpers.js';

afterAll(cleanup);

const KB = 1024;

const PLIST = Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.example.myapp</string>
  <key>CFBundleShortVersionString</key><string>2.1.0</string>
  <key>CFBundleVersion</key><string>42</string>
  <key>MinimumOSVersion</key><string>13.0</string>
  <key>CFBundleExecutable</key><string>MyApp</string>
</dict>
</plist>`,
  'utf8',
);

describe('analyze: iOS .ipa', async () => {
  const path = await makeZip('MyApp.ipa', {
    'Payload/MyApp.app/Info.plist': PLIST,
    'Payload/MyApp.app/MyApp': blob(500 * KB), // the app binary (no extension)
    'Payload/MyApp.app/main.jsbundle': hermesBundle(200 * KB),
    'Payload/MyApp.app/Assets.car': blob(300 * KB),
    'Payload/MyApp.app/Frameworks/Hermes.framework/Hermes': blob(400 * KB),
    'Payload/MyApp.app/Frameworks/libReact.dylib': blob(120 * KB),
    'Payload/MyApp.app/onboarding.png': blob(150 * KB),
    'Payload/MyApp.app/Fonts/Inter.ttf': 30 * KB,
    'Payload/MyApp.app/_CodeSignature/CodeResources': 2 * KB,
  });
  const report = await analyze(path);

  it('detects the ipa and reads Info.plist', () => {
    expect(report.app.artifact).toBe('ipa');
    expect(report.app.platform).toBe('ios');
    expect(report.app.manifest.packageName).toBe('com.example.myapp');
    expect(report.app.manifest.versionName).toBe('2.1.0');
    expect(report.app.manifest.versionCode).toBe(42);
    expect(report.app.manifest.minOsVersion).toBe('13.0');
  });

  it('detects the Hermes JS bundle', () => {
    expect(report.app.js?.engine).toBe('hermes');
    expect(report.app.js?.bundlePath).toMatch(/main\.jsbundle$/);
  });

  it('classifies native binaries, the asset catalog, fonts and js', () => {
    const cat = (p: string) => report.files?.find((f) => f.path.endsWith(p))?.category;
    expect(cat('/MyApp')).toBe('native'); // app binary
    expect(cat('Hermes.framework/Hermes')).toBe('native'); // framework binary
    expect(cat('libReact.dylib')).toBe('native');
    expect(cat('Assets.car')).toBe('image');
    expect(cat('Inter.ttf')).toBe('font');
    expect(cat('main.jsbundle')).toBe('js');
  });

  it('flags the loose large PNG but not Assets.car', () => {
    const img = report.findings.find((f) => f.checkId === 'image-large');
    expect(img?.files).toEqual(['Payload/MyApp.app/onboarding.png']);
  });

  it('marks iOS sizes as estimates and notes App Store thinning', () => {
    expect(report.sizes.download.estimate).toBe(true);
    expect(report.sizes.install.estimate).toBe(true);
    expect(report.meta.warnings.join(' ')).toMatch(/App Store/);
  });
});

describe('parsePlist (binary)', () => {
  it('reads strings and integers from a bplist dict', () => {
    // bplist00 with { "id": "com.x", "n": 7 }
    const header = Buffer.from('bplist00', 'latin1');
    // objects: 0=dict, 1="id", 2="n", 3="com.x", 4=int 7
    const dict = Buffer.from([0xd2, 0x01, 0x02, 0x03, 0x04]); // dict count 2, keys[1,2] vals[3,4]
    const k1 = Buffer.from([0x52, 0x69, 0x64]); // ASCII "id"
    const k2 = Buffer.from([0x51, 0x6e]); // ASCII "n"
    const v1 = Buffer.from([0x55, ...Buffer.from('com.x', 'latin1')]); // ASCII "com.x"
    const v2 = Buffer.from([0x10, 0x07]); // int 7
    const objs = [dict, k1, k2, v1, v2];
    const bodies = Buffer.concat([header, ...objs]);
    const offsets: number[] = [];
    let at = header.length;
    for (const o of objs) {
      offsets.push(at);
      at += o.length;
    }
    const offsetTable = Buffer.from(offsets); // one byte each (offsetSize=1)
    const trailer = Buffer.alloc(32);
    trailer[6] = 1; // offsetSize
    trailer[7] = 1; // objectRefSize
    trailer.writeBigUInt64BE(BigInt(objs.length), 8); // numObjects
    trailer.writeBigUInt64BE(0n, 16); // topObject
    trailer.writeBigUInt64BE(BigInt(bodies.length), 24); // offsetTableStart
    const buf = Buffer.concat([bodies, offsetTable, trailer]);
    const plist = parsePlist(buf);
    expect(plist.id).toBe('com.x');
    expect(plist.n).toBe(7);
  });
});
