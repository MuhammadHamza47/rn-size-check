import type { ReactNode } from 'react';
import { CopyButton } from './CopyButton';

type Area = 'dex' | 'native' | 'image' | 'font' | 'js' | 'other';

/** [title, explanation, area (colors match the report), needs a source map] */
const CHECKS: [string, string, Area, boolean?][] = [
  ['R8 turned off', 'The React Native template ships with enableProguardInReleaseBuilds = false, so Java/Kotlin code is never shrunk.', 'dex'],
  ['Every CPU type in one APK', 'A universal APK carries native code for arm64, armv7, x86 and x86_64. A phone only runs one of them.', 'native'],
  ['Unstripped native libraries', '.so files that still contain debug symbols. Users never need them.', 'native'],
  ['Big PNG and JPEG images', 'Anything over 100 KB. As WebP these are usually 30–50% smaller.', 'image'],
  ['Unused icon fonts', 'react-native-vector-icons ships all 19 fonts unless you list the ones you use.', 'font'],
  ['Unused font weights', 'One font family shipped in 14 weights and italics when the app uses four or five.', 'font'],
  ['Heavy Lottie animations', 'Big animation files, especially ones with PNG or JPG images embedded inside them.', 'image'],
  ['Duplicate files', 'The same image or sound stored twice under different names.', 'other'],
  ['Source maps in the build', '.map files are for crash reports, not for users’ phones.', 'js'],
  ['Hermes turned off', 'The bundle is plain JavaScript instead of precompiled Hermes bytecode.', 'js'],
  ['Debug build by mistake', 'Debug builds have no JS bundle and every CPU type, so the numbers mean nothing.', 'other'],
  ['Heavy npm packages', 'Packages like moment or big icon libraries, with the lighter option to use instead.', 'js', true],
  ['Packages and files bundled twice', 'Two versions of one package, or the same JSON copied into two folders.', 'js', true],
  ['Font names in the wrong case', "fontFamily 'Rubik-bold' when the file is Rubik-Bold.ttf: Android won't find it.", 'font', true],
];

const AREA_LABEL: Record<Area, string> = {
  dex: 'Java/Kotlin',
  native: 'Native',
  image: 'Images',
  font: 'Fonts',
  js: 'JS bundle',
  other: 'Build',
};

const FAQ: [string, ReactNode][] = [
  [
    'Is my build uploaded anywhere?',
    <>
      No. The page reads the file with your browser's File API and does all the work locally, in a background worker. Open
      DevTools → Network before you drop the file: nothing is sent while it's being read. Once the page has loaded you can even go
      offline and it still works.
    </>,
  ],
  [
    'Why is the download smaller than my .aab?',
    <>
      Google Play doesn't send the .aab to phones. It builds a smaller APK for each device: code for one CPU type, images for one
      screen density, and none of the debug symbols or metadata inside the bundle. The download number is that per-phone size.
    </>,
  ],
  [
    'How exact are the numbers?',
    <>
      For an APK, the download size is the file size. For an AAB it's an estimate: the files one phone would receive, added up.
      Play Console can show a slightly different number. Savings marked with <strong>~</strong> are typical results (WebP, R8), not
      exact bytes, and a file flagged by two checks is only counted once.
    </>,
  ],
  [
    'Does it work with Expo?',
    <>
      Yes. It reads the build, not the project, so bare React Native and Expo (EAS) builds both work.
    </>,
  ],
  [
    'What about iOS?',
    <>
      Not yet. iOS (.ipa) support is on the roadmap.
    </>,
  ],
  [
    'Can it tell me which npm package is the biggest?',
    <>
      Yes, if you add the source maps from the same release build: drop <code>index.android.bundle.map</code> (and the{' '}
      <code>packager.map</code> next to it) together with the .aab or .apk, or run the CLI with <code>--project</code>. The build
      alone can't say which package each byte came from. With a map you also get require()d Lottie files, packages bundled twice,
      and exactly which fonts are unused.
    </>,
  ],
];

export function Info() {
  return (
    <>
      <section id="checks" aria-labelledby="checks-title">
        <div className="section-head">
          <p className="eyebrow">Checks</p>
          <h2 id="checks-title">What it looks for</h2>
          <p className="section-lede">
            The same few settings make most React Native apps big. The last three also need the source maps from your build.
          </p>
        </div>
        <ul className="checks">
          {CHECKS.map(([title, body, area, needsMap]) => (
            <li key={title} className="check">
              <span className="check-tags">
                <span className="tag">
                  <span className={`dot cat-${area}`} />
                  {AREA_LABEL[area]}
                </span>
                {needsMap && <span className="tag tag-accent">source map</span>}
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="where" aria-labelledby="where-title">
        <div className="section-head">
          <p className="eyebrow">Getting a build</p>
          <h2 id="where-title">Where's my .aab?</h2>
          <p className="section-lede">
            Use a release build. A debug build has no JS bundle and includes every CPU type, so its size says little about what users
            download.
          </p>
        </div>
        <div className="where">
          <div>
            <span className="tag tag-accent">Bare React Native</span>
            <h3>React Native CLI</h3>
            <Cmd text="cd android && ./gradlew bundleRelease" />
            <p>
              Then drop <code>android/app/build/outputs/bundle/release/app-release.aab</code>
            </p>
          </div>
          <div>
            <span className="tag tag-accent">Expo</span>
            <h3>Expo (EAS)</h3>
            <Cmd text="eas build -p android --profile production" />
            <p>Download the .aab from the build page on expo.dev.</p>
          </div>
          <div>
            <span className="tag tag-accent">Any project</span>
            <h3>Android Studio</h3>
            <p>
              Build → Generate Signed App Bundle or APK. Any release .aab or .apk works, including one you downloaded from Play
              Console.
            </p>
          </div>
        </div>
        <p className="muted small where-maps">
          For the npm package breakdown, also drop the source maps from the same build:{' '}
          <code>android/app/build/generated/sourcemaps/react/&lt;variant&gt;/index.android.bundle.map</code> and{' '}
          <code>android/app/build/intermediates/sourcemaps/react/&lt;variant&gt;/index.android.bundle.packager.map</code>.
        </p>
      </section>

      <section id="faq" className="faq-section" aria-labelledby="faq-title">
        <div className="section-head">
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title">Questions</h2>
        </div>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function Cmd({ text }: { text: string }) {
  return (
    <div className="cmd">
      <code>{text}</code>
      <CopyButton text={text} label="Copy" className="btn btn-small" />
    </div>
  );
}
