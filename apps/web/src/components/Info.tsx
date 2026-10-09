import type { ReactNode } from 'react';
import { CopyButton } from './CopyButton';

const CHECKS: [string, string][] = [
  ['R8 turned off', 'The React Native template ships with enableProguardInReleaseBuilds = false, so Java/Kotlin code is never shrunk.'],
  ['Every CPU type in one APK', 'A universal APK carries native code for arm64, armv7, x86 and x86_64. A phone only runs one of them.'],
  ['Unstripped native libraries', '.so files that still contain debug symbols. Users never need them.'],
  ['Big PNG and JPEG images', 'Anything over 100 KB. As WebP these are usually 30–50% smaller.'],
  ['Every icon font bundled', 'react-native-vector-icons ships all 19 fonts unless you list the ones you use.'],
  ['Duplicate files', 'The same image or sound stored twice under different names.'],
  ['Source maps in the build', '.map files are for crash reports, not for users’ phones.'],
  ['Hermes turned off', 'The bundle is plain JavaScript instead of precompiled Hermes bytecode.'],
  ['Debug build by mistake', 'Debug builds have no JS bundle and every CPU type, so the numbers mean nothing.'],
];

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
      Not from the build alone: a release bundle doesn't say which package each byte came from. That needs your project's source
      map, and it's the next feature for the command-line version.
    </>,
  ],
];

export function Info() {
  return (
    <>
      <section className="note">
        <p>
          I took a React Native game's Android APK from <strong>143.7 MB to 49.4 MB</strong> without removing a feature. Very little of
          that was clever. R8 was off, every CPU type was bundled, all the icon fonts were shipped, and the art was PNG instead of WebP.
          I keep finding the same few settings in other React Native apps, so I turned the checks into this tool.
        </p>
        <p className="note-sig">Muhammad Hamza</p>
      </section>

      <section>
        <h2>What it looks for</h2>
        <dl className="checks">
          {CHECKS.map(([title, body]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2>Where's my .aab?</h2>
        <div className="where">
          <div>
            <h3>React Native CLI</h3>
            <Cmd text="cd android && ./gradlew bundleRelease" />
            <p>
              Then drop <code>android/app/build/outputs/bundle/release/app-release.aab</code>
            </p>
          </div>
          <div>
            <h3>Expo (EAS)</h3>
            <Cmd text="eas build -p android --profile production" />
            <p>Download the .aab from the build page on expo.dev.</p>
          </div>
          <div>
            <h3>Android Studio</h3>
            <p>
              Build → Generate Signed App Bundle or APK. Any release .aab or .apk works, including one you downloaded from Play
              Console.
            </p>
          </div>
        </div>
        <p className="muted small">
          Use a release build. A debug build has no JS bundle and includes every CPU type, so its size says little about what users
          download.
        </p>
      </section>

      <section>
        <h2>Questions</h2>
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
