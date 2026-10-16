import {
  CATEGORY_LABELS,
  formatBytes,
  formatDelta,
  MIN_CHANGE_BYTES,
  percentChange,
  shortPath,
  sideLabel,
  type ChangeKind,
  type Comparison,
  type Delta,
} from '@rnsc/core';
import { createColors } from 'picocolors';
import { icon, pad, padL, shorten, type RenderOptions } from './terminal.js';

const KIND_LABEL: Record<ChangeKind, string> = { added: 'new', removed: 'gone', grew: 'grew', shrank: 'shrank' };

export function renderComparison(cmp: Comparison, opts: RenderOptions): string {
  const c = createColors(opts.color);
  const out: string[] = [];
  const line = (s = '') => out.push(s);
  const rule = (w: number) => c.dim('─'.repeat(w));
  // Growth is bad news for app size: red when it grows, green when it shrinks.
  const signed = (bytes: number, s = formatDelta(bytes)) => (bytes > 0 ? c.red(s) : bytes < 0 ? c.green(s) : c.dim(s));

  const name = cmp.new.packageName ?? cmp.new.fileName;
  line();
  line(`${c.bold('RN Size Check')} ${c.dim('·')} ${c.bold(name)} ${c.dim('·')} ${sideLabel(cmp.old)} → ${sideLabel(cmp.new)}`);
  if (cmp.old.fileName !== cmp.new.fileName) line(c.dim(`  ${cmp.old.fileName} → ${cmp.new.fileName}`));
  line();

  const target = [cmp.target.abi === 'all' ? 'all ABIs' : cmp.target.abi, cmp.target.density].filter(Boolean).join(', ');
  const total = (label: string, d: Delta, bold = false) => {
    const pct = percentChange(d);
    const value = `${formatBytes(d.old)} → ${formatBytes(d.new)}`;
    line(`  ${pad(label, 30)}${bold ? c.bold(padL(value, 22)) : padL(value, 22)}  ${signed(d.change, padL(formatDelta(d.change), 9))}${pct ? c.dim(` (${pct})`) : ''}`);
  };
  total(`Download (${target})`, cmp.sizes.download, true);
  total('Install', cmp.sizes.install);
  total('File', cmp.sizes.file);

  const categories = cmp.categories.filter((r) => Math.abs(r.change) >= MIN_CHANGE_BYTES);
  line();
  if (categories.length === 0) {
    line(`  ${c.green('✔ No category changed by more than 1 KB.')}`);
  } else {
    line(`  ${c.bold(pad('By category', 30))}${padL('Before', 10)}${padL('After', 10)}${padL('Change', 11)}`);
    line(`  ${rule(61)}`);
    for (const r of categories) {
      line(`  ${pad(CATEGORY_LABELS[r.category], 30)}${padL(formatBytes(r.old), 10)}${padL(formatBytes(r.new), 10)}${signed(r.change, padL(formatDelta(r.change), 11))}`);
    }
  }

  if (cmp.files && cmp.files.length > 0) {
    line();
    line(`  ${c.bold('Biggest file changes')}`);
    for (const f of cmp.files.slice(0, opts.top)) {
      line(`  ${signed(f.change, padL(formatDelta(f.change), 9))}  ${pad(KIND_LABEL[f.kind], 7)}${shorten(shortPath(f.path), 58)}`);
    }
    if (cmp.files.length > opts.top) line(c.dim(`             …and ${cmp.files.length - opts.top} more (full list in --json)`));
  }

  if (cmp.packages && cmp.packages.length > 0) {
    line();
    line(`  ${c.bold('npm packages in the JS bundle')}`);
    for (const p of cmp.packages.slice(0, opts.top)) {
      line(`  ${signed(p.change, padL(formatDelta(p.change), 9))}  ${pad(KIND_LABEL[p.kind], 7)}${p.name}`);
    }
    if (cmp.packages.length > opts.top) line(c.dim(`             …and ${cmp.packages.length - opts.top} more (full list in --json)`));
    if (cmp.js && Math.abs(cmp.js.appCode.change) >= MIN_CHANGE_BYTES) {
      line(`  ${signed(cmp.js.appCode.change, padL(formatDelta(cmp.js.appCode.change), 9))}  ${pad('', 7)}${c.dim('your app code')}`);
    }
  }

  if (cmp.findings.added.length > 0) {
    line();
    line(`  ${c.bold('New problems')}`);
    for (const f of cmp.findings.added) {
      line(`  ${icon(f.severity, c)} ${f.title}${f.savings ? c.green(`  saves ${formatBytes(f.savings)}`) : ''}`);
    }
  }
  if (cmp.findings.worse.length > 0) {
    line();
    line(`  ${c.bold('Got worse')}`);
    for (const f of cmp.findings.worse) {
      line(`  ${icon(f.severity, c)} ${f.title}`);
      line(c.dim(`      was: ${f.oldTitle}`));
    }
  }
  if (cmp.findings.fixed.length > 0) {
    line();
    line(`  ${c.bold('Fixed')}`);
    for (const f of cmp.findings.fixed) line(`  ${c.green('✔')} ${f.title}`);
  }
  if (cmp.findings.better.length > 0) {
    line();
    line(`  ${c.bold('Got better')}`);
    for (const f of cmp.findings.better) {
      line(`  ${c.green('✔')} ${f.title}`);
      line(c.dim(`      was: ${f.oldTitle}`));
    }
  }

  for (const note of cmp.notes) {
    line();
    line(`  ${c.yellow('!')} ${note}`);
  }
  line();
  line(c.dim('  Save it with --json compare.json, or as a PR comment with --markdown size.md'));
  line();
  return out.join('\n');
}
