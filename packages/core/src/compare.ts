import { CHECKS } from './checks/registry.js';
import { InvalidOptionError } from './errors.js';
import { CATEGORIES, type ArtifactType, type Category, type Finding, type Report, type Severity } from './types.js';

/** Changes smaller than this are noise (a few bytes of zip headers, timestamps) and are left out. */
export const MIN_CHANGE_BYTES = 1_000;

export interface Delta {
  old: number;
  new: number;
  /** new − old */
  change: number;
}

export type ChangeKind = 'added' | 'removed' | 'grew' | 'shrank';

export interface FileChange extends Delta {
  /** Path in the new build (in the old one for removed files). */
  path: string;
  category: Category;
  kind: ChangeKind;
}

export interface PackageChange extends Delta {
  name: string;
  kind: ChangeKind;
}

export interface FindingRef {
  checkId: string;
  severity: Severity;
  title: string;
  savings?: number;
}

export interface ChangedFinding extends FindingRef {
  /** The title in the old report. */
  oldTitle: string;
}

export interface CompareSide {
  fileName: string;
  artifact: ArtifactType;
  packageName?: string;
  versionName?: string;
  versionCode?: number;
  toolVersion: string;
  createdAt: string;
}

export interface Comparison {
  kind: 'rn-size-check-comparison';
  schemaVersion: 1;
  old: CompareSide;
  new: CompareSide;
  /** Same ABI and screen density on both sides (the estimate is for one phone). */
  target: { abi: string; density?: string };
  sizes: { download: Delta; install: Delta; file: Delta };
  /** Every category, biggest change first. */
  categories: (Delta & { category: Category })[];
  /** Files that changed by at least MIN_CHANGE_BYTES, biggest change first; null when a report has no file list. */
  files: FileChange[] | null;
  /** npm packages that changed, biggest change first; null unless both reports have the package breakdown. */
  packages: PackageChange[] | null;
  /** The rest of the JS bundle, when both reports have the package breakdown. */
  js: { appCode: Delta; unmapped: Delta; data: Delta; bundle: Delta } | null;
  /**
   * added: only in the new build; fixed: only in the old one; worse/better: in both, but the problem
   * grew or shrank (e.g. 10 → 12 big PNGs).
   */
  findings: { added: FindingRef[]; fixed: FindingRef[]; worse: ChangedFinding[]; better: ChangedFinding[] };
  /** Things the reader should know about this comparison (different ABIs, old report format…). */
  notes: string[];
}

/** Compares two reports of the same app: what grew, what shrank, which problems are new or fixed. */
export function compareReports(oldR: Report, newR: Report): Comparison {
  const notes: string[] = [];
  const oldName = oldR.app.manifest.packageName;
  const newName = newR.app.manifest.packageName;
  if (oldName && newName && oldName !== newName) {
    notes.push(`These are two different apps (${oldName} and ${newName}).`);
  }
  if (oldR.app.artifact !== newR.app.artifact) {
    notes.push(
      `Comparing an ${oldR.app.artifact.toUpperCase()} with an ${newR.app.artifact.toUpperCase()}: an AAB download is an estimate for one phone, an APK is downloaded whole, so the totals differ for that reason alone.`,
    );
  }
  const od = oldR.sizes.download;
  const nd = newR.sizes.download;
  if (od.abi !== nd.abi || od.density !== nd.density) {
    notes.push(
      `The two reports estimate different phones (${[od.abi, od.density].filter(Boolean).join(', ')} vs ${[nd.abi, nd.density].filter(Boolean).join(', ')}). Analyze both with the same --abi and --density.`,
    );
  }

  return {
    kind: 'rn-size-check-comparison',
    schemaVersion: 1,
    old: side(oldR),
    new: side(newR),
    target: { abi: nd.abi, density: nd.density },
    sizes: {
      download: delta(od.bytes, nd.bytes),
      install: delta(oldR.sizes.install.bytes, newR.sizes.install.bytes),
      file: delta(oldR.sizes.file, newR.sizes.file),
    },
    categories: compareCategories(oldR, newR),
    files: compareFiles(oldR, newR, notes),
    ...comparePackages(oldR, newR, notes),
    findings: compareFindings(...comparableFindings(oldR, newR, notes)),
    notes,
  };
}

const delta = (o: number, n: number): Delta => ({ old: o, new: n, change: n - o });

const byChange = (a: Delta, b: Delta) => Math.abs(b.change) - Math.abs(a.change);

function side(r: Report): CompareSide {
  const m = r.app.manifest;
  return {
    fileName: r.app.fileName,
    artifact: r.app.artifact,
    packageName: m.packageName,
    versionName: m.versionName,
    versionCode: m.versionCode,
    toolVersion: r.tool.version,
    createdAt: r.createdAt,
  };
}

function compareCategories(oldR: Report, newR: Report): Comparison['categories'] {
  const size = (r: Report, c: Category) => r.breakdown.find((b) => b.category === c)?.compressed ?? 0;
  return CATEGORIES.map((category) => ({ category, ...delta(size(oldR, category), size(newR, category)) })).sort(byChange);
}

/**
 * The same file has a different path in an AAB (base/res/x.png, base/dex/classes.dex, base/root/x)
 * than in an APK (res/x.png, classes.dex, x); match on the APK form.
 */
export function comparablePath(path: string, artifact: ArtifactType): string {
  if (artifact !== 'aab') return path;
  const m = /^base\/(.*)$/.exec(path);
  if (!m) return path; // feature modules and asset packs keep their module name
  return m[1]!.replace(/^(dex|root|manifest)\//, '');
}

function compareFiles(oldR: Report, newR: Report, notes: string[]): FileChange[] | null {
  if (!oldR.files || !newR.files) {
    const which = !oldR.files ? oldR : newR;
    notes.push(
      `The ${which === oldR ? 'old' : 'new'} report (${which.app.fileName}) was saved by rn-size-check ${which.tool.version}, which doesn't keep the full file list, so files can't be compared one by one. Analyze that build again with 0.3 or later to get it.`,
    );
    return null;
  }
  const oldFiles = new Map(oldR.files.map((f) => [comparablePath(f.path, oldR.app.artifact), f]));
  const changes: FileChange[] = [];
  for (const f of newR.files) {
    const key = comparablePath(f.path, newR.app.artifact);
    const before = oldFiles.get(key);
    oldFiles.delete(key);
    const d = delta(before?.compressed ?? 0, f.compressed);
    if (before && Math.abs(d.change) < MIN_CHANGE_BYTES) continue;
    if (!before && f.compressed < MIN_CHANGE_BYTES) continue;
    changes.push({ path: f.path, category: f.category, kind: !before ? 'added' : d.change > 0 ? 'grew' : 'shrank', ...d });
  }
  for (const f of oldFiles.values()) {
    if (f.compressed < MIN_CHANGE_BYTES) continue;
    changes.push({ path: f.path, category: f.category, kind: 'removed', ...delta(f.compressed, 0) });
  }
  return changes.sort(byChange);
}

function comparePackages(oldR: Report, newR: Report, notes: string[]): Pick<Comparison, 'packages' | 'js'> {
  const o = oldR.packages;
  const n = newR.packages;
  if (!o || !n) {
    if (o || n) {
      notes.push(
        `Only the ${o ? 'old' : 'new'} build has the npm package breakdown. Give both builds their source maps to compare packages.`,
      );
    }
    return { packages: null, js: null };
  }
  if (o.kind !== n.kind) {
    notes.push('One bundle is Hermes bytecode and the other plain JS, so package sizes are not comparable.');
    return { packages: null, js: null };
  }
  const before = new Map(o.items.map((p) => [p.name, p.bytes]));
  const packages: PackageChange[] = [];
  for (const p of n.items) {
    const was = before.get(p.name);
    before.delete(p.name);
    const d = delta(was ?? 0, p.bytes);
    if (Math.abs(d.change) < MIN_CHANGE_BYTES) continue;
    packages.push({ name: p.name, kind: was === undefined ? 'added' : d.change > 0 ? 'grew' : 'shrank', ...d });
  }
  for (const [name, bytes] of before) {
    if (bytes >= MIN_CHANGE_BYTES) packages.push({ name, kind: 'removed', ...delta(bytes, 0) });
  }
  return {
    packages: packages.sort(byChange),
    js: {
      appCode: delta(o.appCodeBytes, n.appCodeBytes),
      unmapped: delta(o.unmappedCodeBytes, n.unmappedCodeBytes),
      data: delta(o.dataBytes, n.dataBytes),
      bundle: delta(o.bundleBytes, n.bundleBytes),
    },
  };
}

/** Checks whose result depends on whether a source map was given. */
const MAP_DEPENDENT = new Set(CHECKS.filter((c) => c.requires === 'sourcemap' || c.sharperWithSourcemap).map((c) => c.id));

/**
 * When only one side had a source map, findings that need one would all look new (or fixed). Leave
 * them out instead of reporting problems that didn't change.
 */
function comparableFindings(oldR: Report, newR: Report, notes: string[]): [Finding[], Finding[]] {
  if (!oldR.packages === !newR.packages) return [oldR.findings, newR.findings];
  const keep = (list: Finding[]) => list.filter((f) => !MAP_DEPENDENT.has(f.checkId));
  if ([...oldR.findings, ...newR.findings].some((f) => MAP_DEPENDENT.has(f.checkId))) {
    notes.push('Problems found through the source map (npm packages, unused fonts, Lottie in the JS bundle) are left out of new/fixed, because only one side has a map.');
  }
  return [keep(oldR.findings), keep(newR.findings)];
}

/**
 * Pairs up findings of the two reports. Titles carry numbers that change between builds ("10 PNG
 * images" → "12 PNG images"), so findings are matched by check, then by what they are about.
 */
export function compareFindings(oldF: Finding[], newF: Finding[]): Comparison['findings'] {
  const matched = new Set<Finding>();
  const added: Finding[] = [];
  const worse: ChangedFinding[] = [];
  const better: ChangedFinding[] = [];
  for (const f of newF) {
    const twin = oldF.find((o) => !matched.has(o) && sameSubject(o, f, oldF, newF));
    if (!twin) {
      added.push(f);
      continue;
    }
    matched.add(twin);
    const growth = magnitude(f) - magnitude(twin);
    if (twin.title === f.title || growth === 0) continue;
    (growth > 0 ? worse : better).push({ ...ref(f), oldTitle: twin.title });
  }
  const fixed = oldF.filter((o) => !matched.has(o));
  return { added: added.map(ref), fixed: fixed.map(ref), worse, better };
}

/** How big a problem is: what fixing it saves, else the bytes of the files involved, else how many. */
function magnitude(f: Finding): number {
  if (f.savings) return f.savings.bytes;
  const bytes = f.items.reduce((s, i) => s + i.bytes, 0);
  return bytes > 0 ? bytes : f.files.length;
}

function sameSubject(a: Finding, b: Finding, oldF: Finding[], newF: Finding[]): boolean {
  if (a.checkId !== b.checkId) return false;
  // heavy-package: one finding per package, named first in the title.
  if (a.checkId === 'heavy-package') return firstWord(a.title) === firstWord(b.title);
  // Checks that report at most one finding per build.
  const count = (list: Finding[]) => list.filter((f) => f.checkId === a.checkId).length;
  if (count(oldF) === 1 && count(newF) === 1) return true;
  // Several findings of one check (e.g. one per font family): same if they share a file.
  const files = new Set(a.files);
  return b.files.some((p) => files.has(p));
}

const firstWord = (s: string) => s.split(' ')[0];

const ref = (f: Finding): FindingRef => ({
  checkId: f.checkId,
  severity: f.severity,
  title: f.title,
  ...(f.savings ? { savings: f.savings.bytes } : {}),
});

/** "1.2.0 (12)" or the file name, for headings. */
export function sideLabel(s: CompareSide): string {
  if (s.versionName) return `${s.versionName}${s.versionCode !== undefined ? ` (${s.versionCode})` : ''}`;
  return s.fileName;
}

/** "+9.5%" of the old size; empty when the old size is 0. */
export function percentChange(d: Delta): string {
  if (d.old === 0) return '';
  const pct = (d.change / d.old) * 100;
  if (Math.abs(pct) < 0.05) return '';
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(1)}%`;
}

/** Checks that parsed JSON is a report saved with --json (not a comparison or some other file). */
export function reportFromJson(value: unknown, name: string): Report {
  const r = value as Partial<Report> | null;
  const looksRight =
    r !== null &&
    typeof r === 'object' &&
    r.schemaVersion === 1 &&
    r.tool?.name === 'rn-size-check' &&
    typeof r.sizes?.download?.bytes === 'number' &&
    Array.isArray(r.breakdown) &&
    Array.isArray(r.findings);
  if (!looksRight) {
    const isComparison = (value as { kind?: string } | null)?.kind === 'rn-size-check-comparison';
    throw new InvalidOptionError(
      isComparison
        ? `${name} is a comparison, not a report. Compare two reports saved with --json, or two builds.`
        : `${name} is not an rn-size-check report. Save one with: npx rn-size-check app-release.aab --json report.json`,
    );
  }
  return r as Report;
}
