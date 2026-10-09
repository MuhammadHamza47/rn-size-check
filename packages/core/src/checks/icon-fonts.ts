import { formatBytes } from '../format.js';
import type { Check } from './types.js';

/** Font files shipped by react-native-vector-icons / @expo/vector-icons. */
const ICON_FONTS =
  /(^|\/)(AntDesign|Entypo|EvilIcons|Feather|FontAwesome\d?(_\w+)?|FontAwesome5_\w+|FontAwesome6_\w+|Fontisto|Foundation|Ionicons|MaterialCommunityIcons|MaterialIcons|Octicons|SimpleLineIcons|Zocial)\.ttf$/i;

export const iconFonts: Check = {
  id: 'icon-fonts',
  title: 'Many icon fonts bundled',
  description: 'react-native-vector-icons ships every icon font by default; most apps use one or two.',
  requires: 'build',
  run(ctx) {
    const fonts = ctx.delivered.filter((f) => f.category === 'font' && ICON_FONTS.test(f.path));
    if (fonts.length < 4) return [];
    const total = fonts.reduce((s, f) => s + f.compressed, 0);
    return [
      {
        severity: 'warn',
        title: `${fonts.length} icon fonts bundled (${formatBytes(total)}); most apps use 1–2`,
        files: fonts.map((f) => f.path),
        fix: 'Ship only the fonts you use: in android/app/build.gradle set project.ext.vectoricons = [ iconFontNames: [ "MaterialIcons.ttf" ] ], or import per-family packages (@react-native-vector-icons/<family>).',
      },
    ];
  },
};
