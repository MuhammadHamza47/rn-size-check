/**
 * Which bundled font files the app's JS actually references, using the source text stored in the
 * source maps. React Native on Android finds a font by matching `fontFamily` to a file name in
 * assets/fonts, case-sensitively, so a quoted name equal to the file name means "used".
 */

/** react-native-vector-icons / @expo/vector-icons font files. */
export const ICON_FONT_FILE =
  /(^|\/)(AntDesign|Entypo|EvilIcons|Feather|FontAwesome\d?(_\w+)?|FontAwesome5_\w+|FontAwesome6_\w+|Fontisto|Foundation|Ionicons|MaterialCommunityIcons|MaterialIcons|Octicons|SimpleLineIcons|Zocial)\.ttf$/i;

export interface FontUsage {
  path: string;
  /** true/false when known; null when it can't be told (font name built at runtime, obfuscated file). */
  used: boolean | null;
  /** Set when the code writes the name with different letter case than the file, e.g. 'Rubik-bold'. */
  writtenAs?: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.(ttf|otf|ttc)$/i, '');
/** "FontAwesome5_Solid" / "font-awesome-5" / "FontAwesome5Free" → "fontawesome5" (style and Free/Pro dropped). */
export const iconFamilyKey = (s: string) =>
  s
    .replace(/_(solid|regular|brands|light|duotone|thin)$/i, '')
    .replace(/(free|pro)(_meta)?$/i, '')
    .replace(/[-_\s]/g, '')
    .toLowerCase();

/**
 * Icon families the bundle imports, from source paths: react-native-vector-icons/Feather.js,
 * @expo/vector-icons/build/Feather.js, @react-native-vector-icons/feather/…, or glyphmaps/Feather.json.
 */
export function iconFamiliesIn(sources: string[]): Set<string> {
  const families = new Set<string>();
  for (const raw of sources) {
    const s = raw.split('\\').join('/');
    const m =
      /\/react-native-vector-icons\/([A-Za-z0-9]+)\.js$/.exec(s) ??
      /\/@expo\/vector-icons\/build\/([A-Za-z0-9]+)\.js$/.exec(s) ??
      /\/@react-native-vector-icons\/([a-z0-9-]+)\//.exec(s) ??
      /\/glyphmaps\/([A-Za-z0-9_]+)\.json$/.exec(s);
    if (m) families.add(iconFamilyKey(m[1]!));
  }
  return families;
}

/**
 * @param fontPaths font files in the build
 * @param appText the app's own source code (not node_modules), joined
 * @param iconFamilies icon families the bundle imports (see iconFamiliesIn)
 */
export function fontUsage(fontPaths: string[], appText: string, iconFamilies: Set<string>): FontUsage[] {
  return fontPaths.map((path) => {
    const name = baseName(path);
    if (ICON_FONT_FILE.test(path)) {
      // An icon font is used when its family's component is in the bundle.
      return { path, used: iconFamilies.has(iconFamilyKey(name)) };
    }
    // Only assets/fonts is where React Native looks up fontFamily names. Fonts in res/font are Android
    // resources that native libraries use from Java/Kotlin or XML, which the JS can't show; obfuscated
    // names (res/ab.ttf) can't be matched either.
    if (!/(^|\/)assets\/fonts\//.test(path) || name.length < 3) return { path, used: null };

    // A wrong-case spelling is worth reporting even when the right spelling is used elsewhere.
    let writtenAs: string | undefined;
    for (const m of appText.matchAll(new RegExp(`(['"\`])(${escape(name)})\\1`, 'gi'))) {
      if (m[2] !== name) {
        writtenAs = m[2];
        break;
      }
    }
    const withCase = (u: FontUsage): FontUsage => (writtenAs ? { ...u, writtenAs } : u);

    if (new RegExp(`(['"\`])${escape(name)}\\1`).test(appText)) return withCase({ path, used: true });
    // Names built at runtime ('Rubik-' + weight, `Rubik-${weight}`): can't tell which files are used.
    const family = escape(name.split(/[-_]/)[0]!);
    if (new RegExp(`(['"\`])${family}[-_]?(\\$\\{|\\1\\s*\\+)`).test(appText)) return withCase({ path, used: null });
    return withCase({ path, used: false });
  });
}
