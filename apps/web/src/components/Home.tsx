import { formatBytes, type Report } from '@rnsc/core';
import sampleReport from '../sample-report.json';

const sample = sampleReport as Report;

/** Three short facts under the dropzone. */
export function TrustRow() {
  return (
    <ul className="trust">
      <li>
        <Check /> Read in your browser, never uploaded
      </li>
      <li>
        <Check /> About a second for a 200 MB build
      </li>
      <li>
        <Check /> Free and open source (MIT)
      </li>
    </ul>
  );
}

/** The author's own before/after numbers. */
export function Proof() {
  return (
    <section className="proof" aria-labelledby="proof-title">
      <div className="proof-numbers">
        <p className="eyebrow" id="proof-title">
          Why this exists
        </p>
        <div className="proof-row">
          <span className="proof-label">Before</span>
          <span className="proof-bar">
            <span style={{ width: '100%' }} />
          </span>
          <span className="proof-value">143.7 MB</span>
        </div>
        <div className="proof-row proof-after">
          <span className="proof-label">After</span>
          <span className="proof-bar">
            <span style={{ width: `${(49.4 / 143.7) * 100}%` }} />
          </span>
          <span className="proof-value">49.4 MB</span>
        </div>
        <p className="proof-caption">A React Native game's Android APK, same features</p>
      </div>
      <blockquote className="proof-quote">
        <p>
          Very little of that was clever. R8 was off, every CPU type was bundled, all the icon fonts were shipped, and the art was PNG
          instead of WebP. I keep finding the same few settings in other React Native apps, so I turned the checks into this tool.
        </p>
        <footer>
          <span className="avatar" aria-hidden="true">
            MH
          </span>
          <span>
            <strong>Muhammad Hamza</strong>
            <span className="muted"> · React Native developer</span>
          </span>
        </footer>
      </blockquote>
    </section>
  );
}

/** A small, real slice of the sample report, so people see the output before they have a build. */
export function Preview({ onOpen }: { onOpen: () => void }) {
  const findings = sample.findings.slice(0, 4);
  return (
    <section className="preview" aria-labelledby="preview-title">
      <div className="section-head">
        <p className="eyebrow">The report</p>
        <h2 id="preview-title">Every fix comes with the files and the MB it saves</h2>
        <p className="section-lede">A real production app, with its package and file names changed.</p>
      </div>
      <div className="window">
        <div className="window-bar">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="window-title">{sample.app.manifest.packageName} · AAB · Hermes</span>
        </div>
        <div className="window-body">
          <div className="mini-stats">
            <div>
              <span className="stat-label">Download, one phone</span>
              <span className="mini-value accent">{formatBytes(sample.sizes.download.bytes)}</span>
            </div>
            <div>
              <span className="stat-label">The .aab file</span>
              <span className="mini-value">{formatBytes(sample.sizes.file)}</span>
            </div>
            <div>
              <span className="stat-label">You could save</span>
              <span className="mini-value good">~{formatBytes(sample.totals.savingsBytes)}</span>
            </div>
          </div>
          <ul className="mini-findings">
            {findings.map((f) => (
              <li key={f.title}>
                <span className={`sev-dot sev-${f.severity}`} aria-hidden="true" />
                <span className="mini-title">{f.title}</span>
                {f.savings && (
                  <span className="saves">
                    {f.savings.estimate ? '~' : ''}
                    {formatBytes(f.savings.bytes)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={onOpen}>
            Open the full sample report
            <Arrow />
          </button>
        </div>
      </div>
    </section>
  );
}

export function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}
