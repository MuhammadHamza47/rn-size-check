import type { AnalyzeOptions, Report } from '@rnsc/core';
import { useCallback, useState } from 'react';
import { analyzeInWorker } from './analyze';
import { CliPromo } from './components/CliPromo';
import { Dropzone } from './components/Dropzone';
import { ReportView } from './components/ReportView';

type State =
  | { status: 'idle'; error?: string }
  | { status: 'analyzing'; file: File }
  | { status: 'done'; file: File; report: Report; options: AnalyzeOptions };

export function App() {
  const [state, setState] = useState<State>({ status: 'idle' });

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

  return (
    <>
      <header className="topbar">
        <a className="brand" href="./" onClick={(e) => (e.preventDefault(), setState({ status: 'idle' }))}>
          <Logo /> rn-size-check
        </a>
        <a className="topbar-link" href="https://github.com/MuhammadHamza47/rn-size-check" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </header>

      <main>
        {state.status === 'done' ? (
          <ReportView
            report={state.report}
            options={state.options}
            onOptionsChange={(options) => run(state.file, options)}
            onReset={() => setState({ status: 'idle' })}
          />
        ) : (
          <>
            <section className="hero">
              <h1>Why is your React Native app so big?</h1>
              <p className="lede">
                Drop your Android <code>.aab</code> or <code>.apk</code>. See what takes the space, what to fix, and how many MB
                you'll save.
              </p>
              <Dropzone
                busy={state.status === 'analyzing'}
                busyLabel={state.status === 'analyzing' ? `Scanning ${state.file.name}…` : ''}
                error={state.status === 'idle' ? state.error : undefined}
                onFile={(file) => run(file)}
              />
              <p className="privacy">
                🔒 Your build never leaves your computer. It's scanned right here in your browser; nothing is uploaded.
              </p>
            </section>
            <HowItWorks />
          </>
        )}
        <CliPromo />
      </main>

      <footer className="footer">
        <span>
          Open source (MIT) ·{' '}
          <a href="https://github.com/MuhammadHamza47/rn-size-check" target="_blank" rel="noreferrer">
            GitHub
          </a>{' '}
          ·{' '}
          <a href="https://github.com/MuhammadHamza47/rn-size-check/issues" target="_blank" rel="noreferrer">
            Report an issue
          </a>
        </span>
        <span>Android today · iOS coming</span>
      </footer>
    </>
  );
}

function HowItWorks() {
  const items = [
    ['Exact breakdown', 'JS / Hermes bundle, native libraries, Java/Kotlin code, images and fonts, for what one phone downloads.'],
    ['Ranked quick wins', 'R8 off, unstripped native libraries, every ABI shipped, huge PNGs, 19 icon fonts, duplicate files.'],
    ['Real MB savings', 'Each fix shows the files involved and how much it saves, counted once even if two checks flag a file.'],
  ];
  return (
    <section className="how">
      {items.map(([title, body]) => (
        <div key={title} className="how-item">
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
      ))}
    </section>
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
