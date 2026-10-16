import {
  CATEGORY_LABELS,
  comparisonToMarkdown,
  formatBytes,
  formatDelta,
  MIN_CHANGE_BYTES,
  percentChange,
  shortPath,
  sideLabel,
  type ChangeKind,
  type Comparison,
  type Delta,
  type FindingRef,
} from '@rnsc/core';
import { useRef, useState, type DragEvent } from 'react';
import { CopyButton } from './CopyButton';

/** What one side of the comparison was given: a build (with optional maps) or a saved report. */
export type CompareInput = { kind: 'build'; build: File; maps: File[] } | { kind: 'report'; report: File };

/** Sorts dropped files into one build or report, plus source maps; returns an error message if it can't. */
export function pickCompareInput(files: File[]): CompareInput | string {
  const builds = files.filter((f) => /\.(aab|apk)$/i.test(f.name));
  const reports = files.filter((f) => /\.json$/i.test(f.name));
  const maps = files.filter((f) => /\.map$/i.test(f.name));
  if (builds.length + reports.length === 0) {
    return maps.length > 0 ? 'Add the .aab or .apk together with its source maps.' : `"${files[0]?.name}" is not an .aab, .apk or .json report.`;
  }
  if (builds.length + reports.length > 1) return 'One build or report per side.';
  if (reports[0]) return { kind: 'report', report: reports[0] };
  return { kind: 'build', build: builds[0]!, maps };
}

interface FormProps {
  busy: string | null;
  error?: string;
  onCompare: (oldInput: CompareInput, newInput: CompareInput) => void;
}

export function CompareForm({ busy, error, onCompare }: FormProps) {
  const [oldInput, setOld] = useState<CompareInput>();
  const [newInput, setNew] = useState<CompareInput>();
  return (
    <section className="compare-form">
      <div className="hero compare-hero">
        <p className="eyebrow">Compare</p>
        <h1>What grew between two builds?</h1>
        <p className="lede">
          Drop the old and the new release build. You'll see which files and npm packages got bigger, and which problems are new
          or fixed. Both are read in your browser.
        </p>
      </div>
      <div className="slots">
        <Slot side="old" hint="the last release" value={oldInput} onChange={setOld} disabled={!!busy} />
        <span className="slots-arrow" aria-hidden="true">
          →
        </span>
        <Slot side="new" hint="the one you're about to ship" value={newInput} onChange={setNew} disabled={!!busy} />
      </div>
      <div className="compare-actions">
        <button
          type="button"
          className={`btn btn-primary btn-large${busy ? ' is-busy' : ''}`}
          disabled={!oldInput || !newInput || !!busy}
          onClick={() => oldInput && newInput && onCompare(oldInput, newInput)}
        >
          {busy ? (
            <>
              <span className="spinner spinner-small" aria-hidden="true" /> {busy}
            </>
          ) : (
            'Compare'
          )}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="muted small">
          Each side takes an .aab or .apk (add its .map files for the npm package comparison) or a report saved with{' '}
          <code>--json</code>.
        </p>
      </div>
    </section>
  );
}

function Slot({
  side,
  hint,
  value,
  onChange,
  disabled,
}: {
  side: 'old' | 'new';
  hint: string;
  value?: CompareInput;
  onChange: (v: CompareInput | undefined) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const accept = (list: FileList | null | undefined) => {
    if (!list || list.length === 0) return;
    const picked = pickCompareInput([...list]);
    if (typeof picked === 'string') return setError(picked);
    setError(undefined);
    onChange(picked);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) accept(e.dataTransfer.files);
  };
  const name = value ? (value.kind === 'build' ? value.build.name : value.report.name) : null;
  return (
    <div className="slot-wrap">
      <button
        type="button"
        className={`slot${dragging ? ' dragging' : ''}${value ? ' filled' : ''}`}
        onClick={() => !disabled && input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={disabled}
      >
        <span className="slot-label">{side === 'old' ? 'Old build' : 'New build'}</span>
        {name ? (
          <>
            <strong className="slot-file">{name}</strong>
            <span className="dz-hint">
              {value?.kind === 'report' ? 'saved report' : value && value.maps.length > 0 ? `with ${value.maps.length} source map${value.maps.length === 1 ? '' : 's'}` : 'build'}
              {' · click to change'}
            </span>
          </>
        ) : (
          <>
            <strong>Drop the {side} .aab, .apk or .json</strong>
            <span className="dz-hint">{hint}</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept=".aab,.apk,.map,.json"
        multiple
        hidden
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const KIND_LABEL: Record<ChangeKind, string> = { added: 'new', removed: 'removed', grew: 'grew', shrank: 'shrank' };
const ROWS = 15;

export function ComparisonView({ cmp, onReset }: { cmp: Comparison; onReset: () => void }) {
  const [allFiles, setAllFiles] = useState(false);
  const [allPackages, setAllPackages] = useState(false);
  const categories = cmp.categories.filter((r) => Math.abs(r.change) >= MIN_CHANGE_BYTES);
  const files = cmp.files ?? [];
  const packages = cmp.packages ?? [];
  const target = [cmp.target.abi === 'all' ? 'all ABIs' : cmp.target.abi, cmp.target.density].filter(Boolean).join(', ');
  const { added, worse, fixed, better } = cmp.findings;

  return (
    <div className="report">
      <section className="report-head">
        <div>
          <p className="eyebrow">Comparison</p>
          <h1 className="app-name">
            {sideLabel(cmp.old)} <span className="muted">→</span> {sideLabel(cmp.new)}
          </h1>
          <p className="file-name">
            {cmp.new.packageName ? `${cmp.new.packageName} · ` : ''}
            {cmp.old.fileName} → {cmp.new.fileName}
          </p>
        </div>
        <div className="actions">
          <CopyButton text={comparisonToMarkdown(cmp)} label="Copy as Markdown" />
          <button type="button" className="btn" onClick={() => downloadJson(cmp)}>
            Download JSON
          </button>
          <button type="button" className="btn btn-primary" onClick={onReset}>
            Compare other builds
          </button>
        </div>
      </section>

      <section className="stats">
        <DeltaStat label={`Download (${target})`} d={cmp.sizes.download} primary />
        <DeltaStat label="Install" d={cmp.sizes.install} />
        <DeltaStat label="File" d={cmp.sizes.file} />
      </section>

      {cmp.notes.map((n) => (
        <div key={n} className="banner">
          {n}
        </div>
      ))}

      {(added.length > 0 || worse.length > 0 || fixed.length > 0 || better.length > 0) && (
        <section>
          <h2>Problems</h2>
          <div className="change-lists">
            <FindingList title="New" items={added} tone="bad" />
            <FindingList title="Got worse" items={worse} tone="bad" />
            <FindingList title="Fixed" items={fixed} tone="good" />
            <FindingList title="Got better" items={better} tone="good" />
          </div>
        </section>
      )}

      <section>
        <h2>By category</h2>
        {categories.length === 0 ? (
          <p className="all-good">No category changed by more than 1 KB.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Before</th>
                <th className="num">After</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((r) => (
                <tr key={r.category}>
                  <td>
                    <span className={`dot cat-${r.category}`} />
                    {CATEGORY_LABELS[r.category]}
                  </td>
                  <td className="num muted">{formatBytes(r.old)}</td>
                  <td className="num">{formatBytes(r.new)}</td>
                  <td className={`num ${tone(r.change)}`}>{formatDelta(r.change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {files.length > 0 && (
        <section>
          <h2>Biggest file changes</h2>
          <table className="table">
            <tbody>
              {(allFiles ? files : files.slice(0, ROWS)).map((f) => (
                <tr key={`${f.kind}-${f.path}`}>
                  <td className="path" title={f.path}>
                    <span className={`dot cat-${f.category}`} />
                    {shortPath(f.path)}
                  </td>
                  <td className="num">
                    <span className={`kind kind-${f.kind}`}>{KIND_LABEL[f.kind]}</span>
                  </td>
                  <td className={`num ${tone(f.change)}`}>{formatDelta(f.change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {files.length > ROWS && !allFiles && (
            <button type="button" className="link" onClick={() => setAllFiles(true)}>
              Show all {files.length} changed files
            </button>
          )}
        </section>
      )}

      {packages.length > 0 && (
        <section>
          <h2>npm packages in the JS bundle</h2>
          <table className="table">
            <tbody>
              {(allPackages ? packages : packages.slice(0, ROWS)).map((p) => (
                <tr key={p.name}>
                  <td className="path">{p.name}</td>
                  <td className="num">
                    <span className={`kind kind-${p.kind}`}>{KIND_LABEL[p.kind]}</span>
                  </td>
                  <td className={`num ${tone(p.change)}`}>{formatDelta(p.change)}</td>
                </tr>
              ))}
              {cmp.js && Math.abs(cmp.js.appCode.change) >= MIN_CHANGE_BYTES && (
                <tr>
                  <td>
                    <em>Your app code</em>
                  </td>
                  <td />
                  <td className={`num ${tone(cmp.js.appCode.change)}`}>{formatDelta(cmp.js.appCode.change)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {packages.length > ROWS && !allPackages && (
            <button type="button" className="link" onClick={() => setAllPackages(true)}>
              Show all {packages.length} changed packages
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function DeltaStat({ label, d, primary }: { label: string; d: Delta; primary?: boolean }) {
  const pct = percentChange(d);
  return (
    <div className={`stat${primary ? ' stat-primary' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone(d.change)}`}>{formatDelta(d.change)}</span>
      <span className="stat-note">
        {formatBytes(d.old)} → {formatBytes(d.new)}
        {pct ? ` · ${pct}` : ''}
      </span>
    </div>
  );
}

function FindingList({ title, items, tone: t }: { title: string; items: (FindingRef & { oldTitle?: string })[]; tone: 'good' | 'bad' }) {
  if (items.length === 0) return null;
  return (
    <div className={`change-list change-${t}`}>
      <h3>
        {title} <span className="muted">{items.length}</span>
      </h3>
      <ul>
        {items.map((f) => (
          <li key={f.title}>
            <span className={`sev-dot sev-${t === 'good' ? 'good' : f.severity}`} aria-hidden="true" />
            <span>
              {f.title}
              {f.oldTitle && <span className="muted small was">was: {f.oldTitle}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** App size growing is bad news. */
const tone = (change: number) => (change > 0 ? 'grew' : change < 0 ? 'shrank' : 'muted');

function downloadJson(cmp: Comparison) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(cmp, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${cmp.new.packageName ?? 'app'}-size-comparison.json` });
  a.click();
  URL.revokeObjectURL(url);
}
