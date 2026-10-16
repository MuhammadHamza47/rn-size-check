import { CopyButton } from './CopyButton';

const COMMAND = 'npx rn-size-check --project';

/** Trimmed real output of the command above, on the sample app. */
const OUTPUT: [string, string?, string?][] = [
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

export function CliPromo() {
  return (
    <section className="cli" aria-labelledby="cli-title">
      <div className="cli-text">
        <p className="eyebrow">Command line</p>
        <h2 id="cli-title">Prefer the terminal?</h2>
        <p>
          The same checks run as one command. Run it inside your React Native project after a release build, and it finds the build
          and its source maps by itself.
        </p>
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
      </div>
      <div className="terminal">
        <div className="window-bar">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="window-title">Terminal</span>
          <CopyButton text={COMMAND} label="Copy" className="btn btn-small btn-ghost" />
        </div>
        <pre className="terminal-body">
          <span className="prompt">$ </span>
          <span className="term-cmd">{COMMAND}</span>
          {'\n'}
          {OUTPUT.map(([text, value, tone], i) => (
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
