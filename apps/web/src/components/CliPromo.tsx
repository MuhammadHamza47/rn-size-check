import { CopyButton } from './CopyButton';

type Line = [string, string?, string?];

const COMMAND = 'npx rn-size-check --project';

/** Trimmed real output of the command above, on the sample app. */
const OUTPUT: Line[] = [
  ['Using android/app/build/outputs/bundle/release/app-release.aab', undefined, 'dim'],
  [''],
  ['Download (arm64-v8a, xxhdpi)', '28.5 MB', 'accent'],
  [''],
  ['⚠ R8 is off: 10.3 MB of Java/Kotlin code is not shrunk', '~3.6 MB'],
  ['⚠ 10 PNG/JPEG images over 100 KB', '~2.7 MB'],
  ['⚠ 17 of 19 icon fonts are bundled but never used', '1.2 MB'],
  ['⚠ date-fns adds 169 KB of bytecode to the JS bundle'],
  [''],
  ['Estimated total savings', '~8.3 MB', 'total'],
];

const COMPARE_COMMAND = 'npx rn-size-check compare old.aab new.aab';

/** Trimmed real output of compare, after adding one image and removing one font. */
const COMPARE_OUTPUT: Line[] = [
  ['Download (arm64-v8a, xxhdpi)', '+950 KB', 'grew'],
  [''],
  ['Images                  6.9 MB → 7.9 MB', '+992 KB', 'grew'],
  ['Fonts                   2.3 MB → 2.2 MB', '−42 KB'],
  [''],
  ['new   onboarding_new.png', '+992 KB', 'grew'],
  ['gone  Manrope-Light.ttf', '−42 KB'],
  [''],
  ['Got worse: 11 PNG/JPEG images over 100 KB', undefined, 'dim'],
];

export function CliPromo({ compare = false }: { compare?: boolean }) {
  const command = compare ? COMPARE_COMMAND : COMMAND;
  const output = compare ? COMPARE_OUTPUT : OUTPUT;
  return (
    <section className="cli" aria-labelledby="cli-title">
      <div className="cli-text">
        <p className="eyebrow">Command line</p>
        <h2 id="cli-title">Prefer the terminal?</h2>
        {compare ? (
          <p>
            Compare two builds, or two reports saved with <code>--json</code>, from the command line. In CI, keep the report of
            your last release and compare every new build against it.
          </p>
        ) : (
          <p>
            The same checks run as one command. Run it inside your React Native project after a release build, and it finds the
            build and its source maps by itself.
          </p>
        )}
        {compare ? (
          <ul className="cli-flags">
            <li>
              <code>--markdown size.md</code> writes a ready-to-paste PR comment
            </li>
            <li>
              <code>--max-growth 1</code> fails CI when the download grows by more than 1 MB
            </li>
            <li>
              <code>--project</code> adds the npm package comparison
            </li>
          </ul>
        ) : (
          <ul className="cli-flags">
            <li>
              <code>--project</code> splits the JS bundle by npm package
            </li>
            <li>
              <code>--budget 40</code> fails a CI build when the download passes 40 MB
            </li>
            <li>
              <code>--json report.json</code> keeps the full report
            </li>
          </ul>
        )}
      </div>
      <div className="terminal">
        <div className="window-bar">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="window-title">Terminal</span>
          <CopyButton text={command} label="Copy" className="btn btn-small btn-ghost" />
        </div>
        <pre className="terminal-body">
          <span className="prompt">$ </span>
          <span className="term-cmd">{command}</span>
          {'\n'}
          {output.map(([text, value, tone], i) => (
            <span key={i} className={`term-line${tone ? ` term-${tone}` : ''}`}>
              <span className="term-text">{text}</span>
              {value && <span className="term-value">{value}</span>}
              {'\n'}
            </span>
          ))}
        </pre>
      </div>
    </section>
  );
}
