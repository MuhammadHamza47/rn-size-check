import type { AnalyzeOptions, Report } from '@rnsc/core';
import { useCallback, useState } from 'react';
import cliPackage from '../../../packages/cli/package.json';
import { analyzeInWorker } from './analyze';
import { CliPromo } from './components/CliPromo';
import { Dropzone } from './components/Dropzone';
import { Info } from './components/Info';
import { ReportView } from './components/ReportView';
import sampleReport from './sample-report.json';

type State =
  | { status: 'idle'; error?: string }
  | { status: 'analyzing'; file: File }
  | { status: 'done'; file: File; report: Report; options: AnalyzeOptions }
  | { status: 'sample' };

const REPO = 'https://github.com/MuhammadHamza47/rn-size-check';

export function App() {
  // /#sample opens the sample report directly, so it can be linked.
  const [state, setState] = useState<State>(() =>
    window.location.hash === '#sample' ? { status: 'sample' } : { status: 'idle' },
  );

  const run = useCallback(async (file: File, options: AnalyzeOptions = {}) => {
    setState({ status: 'analyzing', file });
    try {
      const report = await analyzeInWorker(file, options);
      setState({ status: 'done', file, report, options });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setState({ status: 'idle', error: (err as Error).message });
    }
  }, []);

  const reset = () => {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    setState({ status: 'idle' });
  };
  const showSample = () => {
    history.replaceState(null, '', '#sample');
    setState({ status: 'sample' });
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <header className="topbar">
        <a className="brand" href="./" onClick={(e) => (e.preventDefault(), reset())}>
          <Logo /> rn-size-check
        </a>
        <nav className="topbar-links">
          <a href="https://www.npmjs.com/package/rn-size-check" target="_blank" rel="noreferrer">
            npm
          </a>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </header>

      <main>
        {state.status === 'done' && (
          <ReportView
            report={state.report}
            options={state.options}
            onOptionsChange={(options) => run(state.file, options)}
            onReset={reset}
          />
        )}
        {state.status === 'sample' && <ReportView report={sampleReport as Report} options={{}} sample onReset={reset} />}
        {(state.status === 'idle' || state.status === 'analyzing') && (
          <>
            <section className="hero">
              <h1>Why is your React Native app so big?</h1>
              <p className="lede">
                Drop a release <code>.aab</code> or <code>.apk</code>. You'll see what's taking the space, which files to fix, and
                roughly how many MB each fix saves.
              </p>
              <Dropzone
                busy={state.status === 'analyzing'}
                busyLabel={state.status === 'analyzing' ? `Reading ${state.file.name}…` : ''}
                error={state.status === 'idle' ? state.error : undefined}
                onFile={(file) => run(file)}
              />
              <p className="privacy">
                The file stays on your computer. It's read by this page in your browser and never uploaded.{' '}
                <button type="button" className="link" onClick={showSample}>
                  No build handy? Open a sample report
                </button>
              </p>
            </section>
            <Info />
          </>
        )}
        <CliPromo />
      </main>

      <footer className="footer">
        <span>
          Made by{' '}
          <a href="https://github.com/MuhammadHamza47" target="_blank" rel="noreferrer">
            Muhammad Hamza
          </a>{' '}
          · MIT licensed · v{cliPackage.version}
        </span>
        <span className="footer-links">
          <a href={REPO} target="_blank" rel="noreferrer">
            Source
          </a>
          <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
            Changelog
          </a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
            Report a problem
          </a>
        </span>
      </footer>
    </>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <rect x="7" y="17" width="4" height="8" rx="1" fill="white" />
      <rect x="14" y="11" width="4" height="14" rx="1" fill="white" />
      <rect x="21" y="6" width="4" height="19" rx="1" fill="white" />
    </svg>
  );
}
