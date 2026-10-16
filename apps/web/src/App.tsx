import type { AnalyzeOptions, Report } from '@rnsc/core';
import { useCallback, useState } from 'react';
import cliPackage from '../../../packages/cli/package.json';
import { analyzeInWorker } from './analyze';
import { CliPromo } from './components/CliPromo';
import { Dropzone } from './components/Dropzone';
import { Arrow, Preview, Proof, TrustRow } from './components/Home';
import { Info } from './components/Info';
import { ReportView } from './components/ReportView';
import sampleReport from './sample-report.json';

type State =
  | { status: 'idle'; error?: string }
  | { status: 'analyzing'; file: File }
  | { status: 'done'; file: File; maps: File[]; report: Report; options: AnalyzeOptions }
  | { status: 'sample' };

const REPO = 'https://github.com/MuhammadHamza47/rn-size-check';

export function App() {
  // /#sample opens the sample report directly, so it can be linked.
  const [state, setState] = useState<State>(() =>
    window.location.hash === '#sample' ? { status: 'sample' } : { status: 'idle' },
  );

  const run = useCallback(async (file: File, options: AnalyzeOptions = {}, maps: File[] = []) => {
    setState({ status: 'analyzing', file });
    try {
      const report = await analyzeInWorker(file, options, maps);
      setState({ status: 'done', file, maps, report, options });
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

  const home = state.status === 'idle' || state.status === 'analyzing';

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="./" onClick={(e) => (e.preventDefault(), reset())}>
            <Logo /> rn-size-check
          </a>
          <nav className="topbar-links" aria-label="Main">
            {home && (
              <>
                <a href="#checks" className="hide-sm">
                  Checks
                </a>
                <a href="#where" className="hide-sm">
                  Getting a build
                </a>
                <a href="#faq" className="hide-sm">
                  FAQ
                </a>
              </>
            )}
            <a href="https://www.npmjs.com/package/rn-size-check" target="_blank" rel="noreferrer">
              npm
            </a>
            <a className="btn btn-small btn-github" href={REPO} target="_blank" rel="noreferrer">
              <GitHubIcon /> GitHub
            </a>
          </nav>
        </div>
      </header>

      <main>
        {state.status === 'done' && (
          <ReportView
            report={state.report}
            options={state.options}
            onOptionsChange={(options) => run(state.file, options, state.maps)}
            onAddMaps={(maps) => run(state.file, state.options, maps)}
            onReset={reset}
          />
        )}
        {state.status === 'sample' && <ReportView report={sampleReport as Report} options={{}} sample onReset={reset} />}
        {home && (
          <>
            <section className="hero">
              <a className="pill" href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
                <span className="pill-tag">v{cliPackage.version}</span>
                New: JS bundle size by npm package
                <Arrow />
              </a>
              <h1>
                Why is your React Native app <span className="gradient">so big?</span>
              </h1>
              <p className="lede">
                Drop a release <code>.aab</code> or <code>.apk</code>. You'll see what's taking the space, which files to fix, and
                roughly how many MB each fix saves.
              </p>
              <Dropzone
                busy={state.status === 'analyzing'}
                busyLabel={state.status === 'analyzing' ? `Reading ${state.file.name}…` : ''}
                error={state.status === 'idle' ? state.error : undefined}
                onFiles={(build, maps) => run(build, {}, maps)}
              />
              <TrustRow />
              <p className="privacy">
                No build handy?{' '}
                <button type="button" className="link" onClick={showSample}>
                  Open a sample report
                </button>
              </p>
            </section>
            <Proof />
            <Preview onOpen={showSample} />
            <Info />
          </>
        )}
        <CliPromo />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="brand">
              <Logo /> rn-size-check
            </span>
            <p className="muted small">
              Made by{' '}
              <a href="https://github.com/MuhammadHamza47" target="_blank" rel="noreferrer">
                Muhammad Hamza
              </a>
              . MIT licensed · v{cliPackage.version}
            </p>
          </div>
          <nav className="footer-links" aria-label="Project">
            <a href={REPO} target="_blank" rel="noreferrer">
              Source
            </a>
            <a href="https://www.npmjs.com/package/rn-size-check" target="_blank" rel="noreferrer">
              npm
            </a>
            <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
              Changelog
            </a>
            <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
              Report a problem
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3ee0d0" />
          <stop offset="1" stopColor="#0b7f86" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#logo-g)" />
      <rect x="7" y="17" width="4" height="8" rx="1" fill="white" />
      <rect x="14" y="11" width="4" height="14" rx="1" fill="white" />
      <rect x="21" y="6" width="4" height="19" rx="1" fill="white" />
    </svg>
  );
}
