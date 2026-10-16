import { formatBytes, type Report } from '@rnsc/core';
import { useRef, useState } from 'react';

const COLLAPSED = 12;

/** What the JS bundle is made of, from the source maps. */
export function Packages({ report }: { report: Report }) {
  const pk = report.packages!;
  const [open, setOpen] = useState(false);
  const pct = (n: number) => `${((n / pk.bundleBytes) * 100).toFixed(1)}%`;
  const shown = open ? pk.items : pk.items.slice(0, COLLAPSED);
  const rest = pk.items.slice(shown.length);
  const unit = pk.kind === 'hermes' ? 'Hermes bytecode' : 'minified JS';

  return (
    <section>
      <h2>JS bundle by npm package</h2>
      <p className="muted small">
        {formatBytes(pk.bundleBytes)} of {unit}, unpacked{pk.estimate ? ' (estimated)' : ''}. From {pk.maps.join(' and ')}.
      </p>
      <table className="table">
        <tbody>
          {shown.map((p) => (
            <tr key={p.name}>
              <td className="path">
                {p.name}
                {p.installs > 1 && <span className="muted"> · {p.installs} copies</span>}
              </td>
              <td className="num">{formatBytes(p.bytes)}</td>
              <td className="num muted">{pct(p.bytes)}</td>
            </tr>
          ))}
          {rest.length > 0 && (
            <tr>
              <td>
                <button type="button" className="link" onClick={() => setOpen(true)}>
                  Show {rest.length} more packages
                </button>
              </td>
              <td className="num">{formatBytes(rest.reduce((s, p) => s + p.bytes, 0))}</td>
              <td className="num muted">{pct(rest.reduce((s, p) => s + p.bytes, 0))}</td>
            </tr>
          )}
          <Row label="Your app code" bytes={pk.appCodeBytes} pct={pct} />
          {pk.unmappedCodeBytes > 0 && (
            <Row label="JSON and other modules not in the map" note="e.g. require()d Lottie or emoji data" bytes={pk.unmappedCodeBytes} pct={pct} />
          )}
          {pk.dataBytes > 0 && <Row label="Strings and data tables" bytes={pk.dataBytes} pct={pct} />}
          {pk.runtimeBytes > 0 && <Row label="Metro runtime and polyfills" bytes={pk.runtimeBytes} pct={pct} />}
        </tbody>
      </table>
    </section>
  );
}

function Row({ label, note, bytes, pct }: { label: string; note?: string; bytes: number; pct: (n: number) => string }) {
  return (
    <tr>
      <td>
        <em>{label}</em>
        {note && <span className="muted small"> · {note}</span>}
      </td>
      <td className="num">{formatBytes(bytes)}</td>
      <td className="num muted">{pct(bytes)}</td>
    </tr>
  );
}

/** Offer to add the source maps when the report was made without them. */
export function AddMaps({ onAddMaps }: { onAddMaps: (maps: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="add-maps">
      <h2>Which npm packages make the JS bundle big?</h2>
      <p>
        Add the source maps from the same release build and this report will split the JS bundle by npm package, find
        require()d Lottie files, and tell exactly which fonts are unused. They're read in your browser too.
      </p>
      <ul className="small">
        <li>
          <code>android/app/build/generated/sourcemaps/react/&lt;variant&gt;/index.android.bundle.map</code>
        </li>
        <li>
          <code>android/app/build/intermediates/sourcemaps/react/&lt;variant&gt;/index.android.bundle.packager.map</code>{' '}
          <span className="muted">(optional, adds JSON and Lottie files)</span>
        </li>
      </ul>
      <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
        Add source maps
      </button>
      <input
        ref={input}
        type="file"
        accept=".map"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length > 0) onAddMaps(files);
        }}
      />
    </section>
  );
}
