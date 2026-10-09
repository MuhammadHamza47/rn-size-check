import { CATEGORY_LABELS, formatBytes, type Report, type Severity } from '@rnsc/core';
import { createColors } from 'picocolors';

export interface RenderOptions {
  color: boolean;
  top: number;
}

const BAR_WIDTH = 14;
const FINDING_ITEMS = 3;

/**
 * Short display name. Resources and native libraries keep their folder, because it carries the meaning
 * (`drawable-night-xxhdpi-v8/logo.png` vs `drawable-xxhdpi-v4/logo.png`, `x86/libfoo.so` vs `arm64-v8a/libfoo.so`);
 * other files show the name only.
 */
const fileName = (path: string) => {
  const parts = path.split('/');
  return parts.includes('res') || parts.includes('lib') ? parts.slice(-2).join('/') : parts[parts.length - 1]!;
};

export function renderTerminal(report: Report, opts: RenderOptions): string {
  const c = createColors(opts.color);
  const out: string[] = [];
  const line = (s = '') => out.push(s);
  const rule = (w: number) => c.dim('─'.repeat(w));
  const est = (e: boolean) => (e ? c.dim(' (est.)') : '');

  const { app, sizes } = report;
  const engine = app.js
    ? app.js.engine === 'hermes'
      ? `Hermes bytecode v${app.js.hermesBytecodeVersion}`
      : app.js.engine === 'jsc'
        ? 'JSC (plain JS)'
        : 'unknown JS engine'
    : 'no JS bundle';
  line();
  const m = app.manifest;
  const appName = m.packageName
    ? `${m.packageName}${m.versionName ? ` ${m.versionName}` : ''}${m.versionCode !== undefined ? ` (${m.versionCode})` : ''}`
    : app.fileName;
  const r8 = app.code.minified === true ? 'R8 on' : app.code.minified === false ? 'R8 off' : '';
  const details = [app.fileName, app.artifact.toUpperCase(), engine, r8, m.minSdk ? `minSdk ${m.minSdk}` : '']
    .filter(Boolean)
    .join(' · ');
  line(`${c.bold('RN Size Check')} ${c.dim('·')} ${c.bold(appName)}`);
  line(c.dim(`  ${details}`));
  line();
  const target = [sizes.download.abi === 'all' ? 'all ABIs' : sizes.download.abi, sizes.download.density]
    .filter(Boolean)
    .join(', ');
  const dlLabel = `Download (${target})`;
  line(
    `  ${dlLabel}  ${c.bold(c.cyan(formatBytes(sizes.download.bytes)))}${est(sizes.download.estimate)}` +
      `     Install  ${c.bold(formatBytes(sizes.install.bytes))}${est(sizes.install.estimate)}` +
      `     File  ${formatBytes(sizes.file)}`,
  );
  if (sizes.notDelivered > 0) {
    line(c.dim(`  ${formatBytes(sizes.notDelivered)} of the AAB is metadata/debug symbols that Play never sends to devices.`));
  }

  // Breakdown
  line();
  const total = report.breakdown.reduce((s, r) => s + r.compressed, 0) || 1;
  line(`  ${c.bold(pad('Breakdown', 26))}${padL('Size', 10)}${padL('%', 8)}`);
  line(`  ${rule(44)}`);
  for (const row of [...report.breakdown].sort((a, b) => b.compressed - a.compressed)) {
    const share = row.compressed / total;
    const bar = '█'.repeat(Math.max(1, Math.round(share * BAR_WIDTH)));
    line(
      `  ${pad(labelFor(row.category, report), 26)}${padL(formatBytes(row.compressed), 10)}${padL(`${(share * 100).toFixed(1)}%`, 8)}  ${c.cyan(bar)}`,
    );
  }

  // Native libs per ABI (only interesting when there are several)
  if (report.nativeByAbi.length > 1) {
    line();
    line(`  ${c.bold('Native libraries by ABI')}${c.dim(app.artifact === 'aab' ? '  (each device gets one)' : '  (every user downloads all)')}`);
    for (const a of report.nativeByAbi) {
      line(`  ${pad(a.abi, 26)}${padL(formatBytes(a.compressed), 10)}`);
    }
  }

  // Largest files
  line();
  line(`  ${c.bold('Largest files')}`);
  for (const f of report.largestFiles.slice(0, opts.top)) {
    line(`  ${padL(formatBytes(f.compressed), 9)}  ${c.dim(shorten(f.path, 70))}`);
  }

  // Findings
  line();
  if (report.findings.length === 0) {
    line(`  ${c.green('✔ No quick wins found.')}`);
  } else {
    line(`  ${c.bold(pad('Quick wins', 62))}${c.bold(padL('Saves', 10))}`);
    line(`  ${rule(72)}`);
    for (const f of report.findings) {
      const saves = f.savings ? `${f.savings.estimate ? '~' : ''}${formatBytes(f.savings.bytes)}` : '';
      // Never truncate a finding: if the title is long, put the savings on the line below it.
      if (f.title.length <= 60) line(`  ${icon(f.severity, c)} ${pad(f.title, 60)}${c.green(padL(saves, 10))}`);
      else {
        line(`  ${icon(f.severity, c)} ${f.title}`);
        if (saves) line(`  ${' '.repeat(62)}${c.green(padL(saves, 10))}`);
      }
      for (const item of f.items.slice(0, FINDING_ITEMS)) {
        const note = item.note ? c.dim(`  (${item.note.replace(/\S+\/\S+/g, fileName)})`) : '';
        line(`    ${padL(formatBytes(item.bytes), 8)}  ${shorten(fileName(item.path), 60)}${note}`);
      }
      if (f.items.length > FINDING_ITEMS) {
        line(c.dim(`              …and ${f.items.length - FINDING_ITEMS} more (full list in --json)`));
      }
      line(`    ${c.dim(`→ ${f.fix}`)}`);
    }
    if (app.manifest.debuggable) {
      line(`  ${rule(72)}`);
      line(`  ${c.dim('No savings total for a debug build: debug libraries and ABIs inflate it. Analyze a release build.')}`);
    } else if (report.totals.savingsBytes > 0) {
      const pct = ((report.totals.savingsBytes / sizes.download.bytes) * 100).toFixed(0);
      line(`  ${rule(72)}`);
      line(
        `  ${c.bold(pad('Estimated total savings', 62))}${c.bold(c.green(padL(`~${formatBytes(report.totals.savingsBytes)}`, 10)))} ${c.dim(`(${pct}%)`)}`,
      );
    }
  }

  for (const w of report.meta.warnings) {
    line();
    line(`  ${c.yellow('!')} ${w}`);
  }
  line();
  line(c.dim(`  Analyzed in ${(report.meta.durationMs / 1000).toFixed(1)}s. Save the full report with --json report.json`));
  line();
  return out.join('\n');
}

function labelFor(category: Report['breakdown'][number]['category'], report: Report): string {
  if (category === 'js' && report.app.js?.engine === 'hermes') return 'JS bundle (Hermes)';
  return CATEGORY_LABELS[category];
}

function icon(severity: Severity, c: ReturnType<typeof createColors>): string {
  if (severity === 'error') return c.red('✖');
  if (severity === 'warn') return c.yellow('⚠');
  return c.blue('ℹ');
}

function pad(s: string, w: number): string {
  return s.length >= w ? `${s.slice(0, w - 1)}…` : s + ' '.repeat(w - s.length);
}

function padL(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

function shorten(s: string, w: number): string {
  return s.length <= w ? s : `…${s.slice(s.length - w + 1)}`;
}
