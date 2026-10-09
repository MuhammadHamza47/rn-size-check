import { CopyButton } from './CopyButton';

const COMMAND = 'npx rn-size-check android/app/build/outputs/bundle/release/app-release.aab';

export function CliPromo() {
  return (
    <section className="cli">
      <div>
        <h2>Prefer the terminal?</h2>
        <p>
          The same checks run as a command. Add <code>--budget 40</code> to fail a CI build when the app passes 40 MB, or{' '}
          <code>--json report.json</code> to keep the full report.
        </p>
      </div>
      <div className="cli-cmd">
        <code>{COMMAND}</code>
        <CopyButton text={COMMAND} label="Copy" />
      </div>
    </section>
  );
}
