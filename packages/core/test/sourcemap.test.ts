import { describe, expect, it } from 'vitest';
import { fontUsage, iconFamiliesIn } from '../src/js/font-usage.js';
import { appRelative, packageOf, packageRoot, sourceBytes, SourceMapError, summarizePackages } from '../src/js/sourcemap.js';
import { encodeMappings, hermesMap } from './sourcemap-fixtures.js';

describe('packageOf / packageRoot', () => {
  it.each([
    ['/app/node_modules/react-native/Libraries/Text.js', 'react-native'],
    ['/app/node_modules/@react-navigation/stack/lib/index.js', '@react-navigation/stack'],
    ['/app/node_modules/a/node_modules/lodash/debounce.js', 'lodash'],
    ['/app/node_modules/.pnpm/moment@2.30.1/node_modules/moment/moment.js', 'moment'],
    ['D:\\app\\node_modules\\axios\\index.js', 'axios'],
    ['/app/src/App.tsx', null],
  ])('%s → %s', (source, name) => {
    expect(packageOf(source)).toBe(name);
  });

  it('tells nested installs apart', () => {
    expect(packageRoot('/app/node_modules/a/node_modules/lodash/x.js')).toBe('/app/node_modules/a/node_modules/lodash');
    expect(packageRoot('/app/node_modules/lodash/x.js')).toBe('/app/node_modules/lodash');
  });

  it('strips machine-specific path parts', () => {
    expect(appRelative('D:\\work\\game\\src\\assets\\anim.json')).toBe('src/assets/anim.json');
    expect(appRelative('/Users/me/game/node_modules/x/a.json')).toBe('node_modules/x/a.json');
    // A project folder named "app" must not hide src/; Expo Router's app/ folder still works.
    expect(appRelative('/home/me/app/src/a/b.json')).toBe('src/a/b.json');
    expect(appRelative('/home/me/shop/app/(tabs)/index.tsx')).toBe('app/(tabs)/index.tsx');
  });
});

describe('sourceBytes (Hermes composed map)', () => {
  const sources = [{ path: '/app/node_modules/moment/moment.js' }, { path: '/app/src/App.tsx' }];

  it('gives short gaps to the code before them and keeps long runs and data tables separate', () => {
    const map = hermesMap(sources, [
      [0, 0], // moment: 0–100
      [100, 1], // App.tsx: 100–150
      [150], // 10-byte gap inside App.tsx → App.tsx
      [160, 1], // App.tsx: 160–200
      [200], // 20 000-byte source-less run → modules missing from the map
      [20_200, 0], // moment again: 20 200–20 300 (last segment ends at the last offset)
      [20_300, 0],
    ]);
    const r = sourceBytes(map, 25_000);
    expect(r.kind).toBe('hermes');
    expect(r.bySource.get('/app/node_modules/moment/moment.js')).toBe(200);
    expect(r.bySource.get('/app/src/App.tsx')).toBe(100);
    expect(r.unmappedCodeBytes).toBe(20_000);
    expect(r.dataBytes).toBe(25_000 - 20_300);
    expect(r.estimate).toBe(false);
  });

  it('rejects a map that points past the end of the bundle', () => {
    const map = hermesMap(sources, [[0, 0], [5000, 1]]);
    expect(() => sourceBytes(map, 4000)).toThrow(SourceMapError);
  });

  it('rejects data that is not a source map', () => {
    expect(() => sourceBytes({} as never, 100)).toThrow(SourceMapError);
  });
});

describe('sourceBytes (plain JS map)', () => {
  const map = {
    version: 3 as const,
    sources: ['/app/node_modules/lodash/lodash.js', '/app/src/a.js'],
    names: [],
    mappings: encodeMappings([
      [[0, 0, 0, 0], [30, 1, 0, 0]],
      [[0, 1, 1, 0]],
    ]),
  };

  it('is exact with the bundle text', () => {
    const r = sourceBytes(map, 0, `${'x'.repeat(50)}\n${'y'.repeat(25)}`);
    expect(r.kind).toBe('js');
    expect(r.bySource.get('/app/node_modules/lodash/lodash.js')).toBe(30);
    expect(r.bySource.get('/app/src/a.js')).toBe(45);
    expect(r.estimate).toBe(false);
  });

  it('marks sizes as estimates without the bundle text', () => {
    expect(sourceBytes(map, 0).estimate).toBe(true);
  });
});

describe('summarizePackages', () => {
  it('groups by package, separates app code and Metro runtime, and finds duplicate installs', () => {
    const s = summarizePackages(
      new Map([
        ['/app/node_modules/lodash/a.js', 60_000],
        ['/app/node_modules/lodash/b.js', 10_000],
        ['/app/node_modules/x/node_modules/lodash/a.js', 30_000],
        ['/app/src/App.tsx', 5_000],
        ['/app/node_modules/metro-runtime/src/polyfills/require.js', 2_000],
        ['__prelude__', 100],
      ]),
    );
    expect(s.appCodeBytes).toBe(5_000);
    expect(s.runtimeBytes).toBe(2_100);
    expect(s.packages[0]).toEqual({ name: 'lodash', bytes: 100_000, files: 3, installs: 2, duplicateBytes: 30_000 });
  });
});

describe('fontUsage', () => {
  const fonts = [
    'assets/fonts/Rubik-Bold.ttf',
    'assets/fonts/Rubik-Light.ttf',
    'assets/fonts/Inter-Regular.ttf',
    'assets/fonts/FontAwesome5_Solid.ttf',
    'assets/fonts/Ionicons.ttf',
    'res/ab.ttf',
  ];
  const code = `const a = { fontFamily: 'Rubik-Bold' }; const b = { fontFamily: "Rubik-bold" };`;

  it('marks fonts used, unused and unknown, and spots wrong letter case', () => {
    const u = Object.fromEntries(fontUsage(fonts, code, iconFamiliesIn(['/app/node_modules/react-native-vector-icons/glyphmaps/FontAwesome5Free.json'])).map((x) => [x.path.split('/').pop(), x]));
    expect(u['Rubik-Bold.ttf']).toEqual({ path: 'assets/fonts/Rubik-Bold.ttf', used: true, writtenAs: 'Rubik-bold' });
    expect(u['Rubik-Light.ttf']!.used).toBe(false);
    expect(u['Inter-Regular.ttf']!.used).toBe(false);
    expect(u['FontAwesome5_Solid.ttf']!.used).toBe(true);
    expect(u['Ionicons.ttf']!.used).toBe(false);
    expect(u['ab.ttf']!.used).toBeNull();
  });

  it('finds icon families from component modules, Expo, per-family packages and glyph maps', () => {
    const families = iconFamiliesIn([
      'D:\\app\\node_modules\\react-native-vector-icons\\Feather.js',
      '/app/node_modules/react-native-vector-icons/lib/create-icon-set.js',
      '/app/node_modules/@expo/vector-icons/build/Ionicons.js',
      '/app/node_modules/@react-native-vector-icons/material-icons/lib/index.js',
      '/app/node_modules/react-native-vector-icons/FontAwesome5.js',
    ]);
    expect([...families].sort()).toEqual(['feather', 'fontawesome5', 'ionicons', 'materialicons']);
    const used = fontUsage(
      ['assets/fonts/Feather.ttf', 'assets/fonts/FontAwesome5_Brands.ttf', 'assets/fonts/MaterialIcons.ttf', 'assets/fonts/Entypo.ttf'],
      '',
      families,
    ).map((u) => u.used);
    expect(used).toEqual([true, true, true, false]);
  });

  it('does not judge Android resource fonts, which native libraries use', () => {
    const [u] = fontUsage(['base/res/font/roboto_medium_numbers.ttf'], "fontFamily: 'Inter'", new Set());
    expect(u!.used).toBeNull();
  });

  it('gives up on names built at runtime', () => {
    const [u] = fontUsage(['assets/fonts/Rubik-Light.ttf'], 'fontFamily: `Rubik-${weight}`', new Set());
    expect(u!.used).toBeNull();
    const [v] = fontUsage(['assets/fonts/Rubik-Light.ttf'], "fontFamily: 'Rubik-' + weight", new Set());
    expect(v!.used).toBeNull();
  });
});
