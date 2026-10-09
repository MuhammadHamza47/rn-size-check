import { formatBytes } from '../format.js';
import type { Check } from './types.js';

/** Font files shipped by react-native-vector-icons / @expo/vector-icons. */
const ICON_FONTS =
  /(^|\/)(AntDesign|Entypo|EvilIcons|Feather|FontAwesome\d?(_\w+)?|FontAwesome5_\w+|FontAwesome6_\w+|Fontisto|Foundation|Ionicons|MaterialCommunityIcons|MaterialIcons|Octicons|SimpleLineIcons|Zocial)\.ttf$/i;

/** react-native-vector-icons ships ~19 fonts; a list this long means nobody trimmed it. */
const FULL_SET_MIN = 12;

export const iconFonts: Check = {
  id: 'icon-fonts',
  title: 'Many icon fonts bundled',
  description: 'react-native-vector-icons ships all of its icon fonts by default; most apps use one to three.',
  requires: 'build',
  run(ctx) {
    const fonts = ctx.delivered.filter((f) => f.category === 'font' && ICON_FONTS.test(f.path));
    // A trimmed list (iconFontNames) is a deliberate choice; only flag what looks like the full default set.
    if (fonts.length < FULL_SET_MIN) return [];
    const total = fonts.reduce((s, f) => s + f.compressed, 0);
    return [
      {
        severity: 'warn',
        title: `All ${fonts.length} icon fonts bundled (${formatBytes(total)}); most apps use 1–3`,
        files: fonts.map((f) => f.path),
        fix: 'Ship only the fonts you use: in android/app/build.gradle set project.ext.vectoricons = [ iconFontNames: [ "MaterialIcons.ttf" ] ], or import per-family packages (@react-native-vector-icons/<family>).',
      },
    ];
  },
};
