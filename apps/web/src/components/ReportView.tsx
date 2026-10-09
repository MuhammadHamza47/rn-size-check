import {
  CATEGORY_LABELS,
  formatBytes,
  reportToMarkdown,
  shortPath,
  type AnalyzeOptions,
  type Finding,
  type Report,
} from '@rnsc/core';
import { useState } from 'react';
import { CopyButton } from './CopyButton';

const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

interface Props {
  report: Report;
  options: AnalyzeOptions;
  onOptionsChange: (options: AnalyzeOptions) => void;
  onReset: () => void;
}

export function ReportView({ report, options, onOptionsChange, onReset }: Props) {
  const { app, sizes } = report;
  const m = app.manifest;
  const debug = m.debuggable === true;
  // The debug banner already says this; don't repeat it as a card.
  const findings = report.findings.filter((f) => f.checkId !== 'debuggable');
  const savingsPct = Math.round((report.totals.savingsBytes / sizes.download.bytes) * 100);

  return (
    <div className="report">
      <section className="report-head">
        <div>
          <h1 className="app-name">{m.packageName ?? app.fileName}</h1>
          <div className="chips">
            {m.versionName && (
              <span className="chip">
                v{m.versionName}
                {m.versionCode !== undefined && ` (${m.versionCode})`}
              </span>
            )}
            <span className="chip">{app.artifact.toUpperCase()}</span>
            <span className="chip">{engineLabel(report)}</span>
            {app.code.minified !== null && (
              <span className={`chip ${app.code.minified ? 'chip-ok' : 'chip-bad'}`}>R8 {app.code.minified ? 'on' : 'off'}</span>
            )}
            {m.minSdk && <span className="chip">minSdk {m.minSdk}</span>}
            {debug && <span className="chip chip-bad">debug build</span>}
          </div>
          <p className="file-name">{app.fileName}</p>
        </div>
        <div className="actions">
          <CopyButton text={reportToMarkdown(report)} label="Copy as Markdown" />
          <button type="button" className="btn" onClick={() => downloadJson(report)}>
            Download JSON
          </button>
          <button type="button" className="btn btn-primary" onClick={onReset}>
            Analyze another
          </button>
        </div>
      </section>

      {debug && (
        <div className="banner banner-bad">
          <strong>This is a debug build.</strong> Debug builds bundle every ABI, unoptimized libraries and no JS bundle, so these
          sizes are much bigger than what users download. Build a release (<code>./gradlew bundleRelease</code>) and drop that
          instead.
        </div>
      )}

      <section className="stats">
        <Stat
          label={`Download${sizes.download.abi === 'all' ? ' (all ABIs)' : ''}`}
          value={formatBytes(sizes.download.bytes)}
          note={sizes.download.estimate ? 'estimate for one phone' : 'what users download'}
          primary
        />
        <Stat label="Install" value={formatBytes(sizes.install.bytes)} note="estimate" />
        <Stat label="File" value={formatBytes(sizes.file)} note={app.artifact === 'aab' ? 'the .aab itself' : 'the .apk itself'} />
        {report.totals.savingsBytes > 0 && !debug && (
          <Stat label="You could save" value={`~${formatBytes(report.totals.savingsBytes)}`} note={`${savingsPct}% of the download`} good />
        )}
      </section>

      {app.artifact === 'aab' && (
        <div className="target">
          <span>Estimate for a phone with</span>
          <select
            value={options.abi ?? sizes.download.abi}
            onChange={(e) => onOptionsChange({ ...options, abi: e.target.value })}
            aria-label="ABI"
          >
            {app.abis.map((abi) => (
              <option key={abi}>{abi}</option>
            ))}
          </select>
          <select
            value={options.density ?? sizes.download.density}
            onChange={(e) => onOptionsChange({ ...options, density: e.target.value })}
            aria-label="Screen density"
          >
            {DENSITIES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {sizes.notDelivered > 0 && (
            <span className="muted target-note">{formatBytes(sizes.notDelivered)} of the .aab is debug data that Play never sends to phones</span>
          )}
        </div>
      )}

      {report.meta.warnings
        .filter((w) => !(debug && /No JS bundle/.test(w)))
        .map((w) => (
          <div key={w} className="banner">
            {w}
          </div>
        ))}

      <section>
        <h2>Quick wins</h2>
        {findings.length === 0 ? (
          <p className="all-good">✔ No quick wins found. This build is in good shape.</p>
        ) : (
          <div className="findings">
            {findings.map((f) => (
              <FindingCard key={`${f.checkId}-${f.title}`} finding={f} />
            ))}
          </div>
        )}
      </section>

      <Breakdown report={report} />

      {report.nativeByAbi.length > 1 && (
        <section>
          <h2>Native libraries by ABI</h2>
          <p className="muted">
            {app.artifact === 'aab' ? 'Google Play sends each phone only one of these.' : 'Every user downloads all of these.'}
          </p>
          <table className="table">
            <tbody>
              {report.nativeByAbi.map((a) => (
                <tr key={a.abi}>
                  <td>{a.abi}</td>
                  <td className="num">{a.count} libs</td>
                  <td className="num">{formatBytes(a.compressed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>Largest files</h2>
        <table className="table">
          <tbody>
            {report.largestFiles.slice(0, 15).map((f) => (
              <tr key={f.path}>
                <td className="path" title={f.path}>
                  <span className={`dot cat-${f.category}`} />
                  {f.path}
                </td>
                <td className="num">{formatBytes(f.compressed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, note, primary, good }: { label: string; value: string; note: string; primary?: boolean; good?: boolean }) {
  return (
    <div className={`stat${primary ? ' stat-primary' : ''}${good ? ' stat-good' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}

const ITEMS_COLLAPSED = 4;

function FindingCard({ finding: f }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const items = open ? f.items : f.items.slice(0, ITEMS_COLLAPSED);
  return (
    <article className={`finding sev-${f.severity}`}>
      <header>
        <h3>{f.title}</h3>
        {f.savings && (
          <span className="saves">
            saves {f.savings.estimate ? '~' : ''}
            {formatBytes(f.savings.bytes)}
          </span>
        )}
      </header>
      {items.length > 0 && (
        <ul className="items">
          {items.map((i) => (
            <li key={i.path} title={i.path}>
              <span className="num">{formatBytes(i.bytes)}</span>
              <span className="path">{shortPath(i.path)}</span>
              {i.note && <span className="muted">{i.note.replace(/\S+\/\S+/g, shortPath)}</span>}
            </li>
          ))}
        </ul>
      )}
      {f.items.length > ITEMS_COLLAPSED && (
        <button type="button" className="link" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : `Show all ${f.items.length} files`}
        </button>
      )}
      <p className="fix">
        <span aria-hidden="true">→ </span>
        {f.fix}
      </p>
    </article>
  );
}

function Breakdown({ report }: { report: Report }) {
  const rows = [...report.breakdown].sort((a, b) => b.compressed - a.compressed);
  const total = rows.reduce((s, r) => s + r.compressed, 0) || 1;
  const label = (c: (typeof rows)[number]['category']) =>
    c === 'js' && report.app.js?.engine === 'hermes' ? 'JS bundle (Hermes)' : CATEGORY_LABELS[c];
  return (
    <section>
      <h2>What's inside</h2>
      <div className="bar" role="img" aria-label="Size breakdown by category">
        {rows.map((r) => (
          <span
            key={r.category}
            className={`cat-${r.category}`}
            style={{ width: `${(r.compressed / total) * 100}%` }}
            title={`${label(r.category)}: ${formatBytes(r.compressed)}`}
          />
        ))}
      </div>
      <table className="table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.category}>
              <td>
                <span className={`dot cat-${r.category}`} />
                {label(r.category)}
              </td>
              <td className="num muted">{r.count} files</td>
              <td className="num">{formatBytes(r.compressed)}</td>
              <td className="num muted">{((r.compressed / total) * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function engineLabel(report: Report): string {
  const js = report.app.js;
  if (!js) return 'no JS bundle';
  if (js.engine === 'hermes') return `Hermes v${js.hermesBytecodeVersion}`;
  return js.engine === 'jsc' ? 'JSC (no Hermes)' : 'unknown JS engine';
}

function downloadJson(report: Report) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `${report.app.manifest.packageName ?? 'app'}-size-report.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
}
