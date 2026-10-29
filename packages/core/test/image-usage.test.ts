import { describe, expect, it } from 'vitest';
import { imageUsage, type SourceFile } from '../src/js/image-usage.js';

const D = 'base/res/drawable-mdpi-v4/';
const usedOf = (r: ReturnType<typeof imageUsage>) => Object.fromEntries((r ?? []).map((u) => [u.path.split('/').pop(), u.used]));

describe('imageUsage', () => {
  const sources: SourceFile[] = [
    {
      path: 'src/screens/Home.tsx',
      // a relative require, an aliased require, and a hyphenated filename Metro strips to one word
      text: `
        const logo = require('../../assets/images/logo.png');
        const evo = require('@/assets/images/promo-banner.png');
        <Image source={require('../../assets/images/logo-light.png')} />
      `,
    },
  ];

  it('flags an image in a used folder that no code references, keeps referenced ones', () => {
    const used = usedOf(
      imageUsage(
        [
          `${D}src_assets_images_logo.png`, // relative require
          `${D}src_assets_images_promobanner.png`, // alias + hyphen (promo-banner.png)
          `${D}src_assets_images_logolight.png`, // hyphen (logo-light.png)
          `${D}src_assets_images_oldbanner.png`, // same folder, never referenced
        ],
        sources,
      ),
    );
    expect(used).toEqual({
      'src_assets_images_logo.png': true,
      'src_assets_images_promobanner.png': true,
      'src_assets_images_logolight.png': true,
      'src_assets_images_oldbanner.png': false,
    });
  });

  it('never judges native, library or non-drawable images', () => {
    const used = usedOf(
      imageUsage(
        [
          `${D}ic_launcher.png`, // native launcher-ish name, not in an app asset folder
          `${D}abc_btn_check_to_on.png`, // appcompat drawable
          `${D}node_modules_somelib_icon.png`, // library asset
          'base/res/mipmap-xxhdpi-v4/ic_launcher.png', // mipmap, not drawable
          `${D}src_assets_images_bootsplash.png`, // in the app images folder → judged
        ],
        sources,
      ),
    );
    expect(used['ic_launcher.png']).toBeNull();
    expect(used['abc_btn_check_to_on.png']).toBeNull();
    expect(used['node_modules_somelib_icon.png']).toBeNull();
    expect(used['src_assets_images_bootsplash.png']).toBe(false); // unreferenced, but in a used folder
  });

  it('returns null when there is no app source text', () => {
    expect(imageUsage([`${D}src_assets_images_logo.png`], null)).toBeNull();
  });

  it('ignores remote image URLs', () => {
    const r = imageUsage([`${D}src_cdn_banner.png`], [{ path: 'a.ts', text: `const x = 'https://cdn.example.com/cdn/banner.png';` }]);
    // The URL gives no local folder, so the drawable isn't judged.
    expect(r?.[0]!.used).toBeNull();
  });
});
