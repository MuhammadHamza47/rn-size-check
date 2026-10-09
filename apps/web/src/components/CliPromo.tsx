import { CopyButton } from './CopyButton';

const COMMAND = 'npx rn-size-check android/app/build/outputs/bundle/release/app-release.aab';

export function CliPromo() {
  return (
    <section className="cli">
      <div>
        <h2>Same report in your terminal and CI</h2>
        <p>
          Run it locally or fail a CI build when the app grows past a budget with <code>--budget 40</code>. Save the full
          report with <code>--json</code>.
        </p>
      </div>
      <div className="cli-cmd">
        <code>{COMMAND}</code>
        <CopyButton text={COMMAND} label="Copy" />
      </div>
    </section>
  );
}
