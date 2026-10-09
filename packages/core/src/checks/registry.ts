import type { Finding, FindingItem, Severity } from '../types.js';
import { abiUniversal } from './abi-universal.js';
import { debuggable } from './debuggable.js';
import { nativeDebugSymbols } from './native-debug-symbols.js';
import { r8Off } from './r8-off.js';
import { duplicateFiles } from './duplicate-files.js';
import { hermesOff } from './hermes-off.js';
import { iconFonts } from './icon-fonts.js';
import { imageLarge } from './image-large.js';
import { sourcemapInBuild } from './sourcemap-in-build.js';
import type { Check, CheckContext } from './types.js';

export const CHECKS: readonly Check[] = [
  debuggable,
  abiUniversal,
  nativeDebugSymbols,
  sourcemapInBuild,
  r8Off,
  hermesOff,
  imageLarge,
  iconFonts,
  duplicateFiles,
];

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export interface CheckRun {
  findings: Finding[];
  /** Total savings, counting each file once (its biggest saving) even if several checks flag it. */
  savingsBytes: number;
  warnings: string[];
}

export function runChecks(ctx: CheckContext, ignore: string[] = []): CheckRun {
  const findings: Finding[] = [];
  const bestByFile = new Map<string, number>();
  const warnings: string[] = [];
  const sizes = new Map(ctx.files.map((f) => [f.path, f.compressed]));

  for (const check of CHECKS) {
    if (ignore.includes(check.id)) continue;
    let results;
    try {
      results = check.run(ctx);
    } catch (err) {
      warnings.push(`Check "${check.id}" failed: ${(err as Error).message}`);
      continue;
    }
    for (const { savingsByFile, estimate, items, ...rest } of results) {
      const finding: Finding = { checkId: check.id, ...rest, items: items ?? itemsFor(rest.files, sizes) };
      if (savingsByFile) {
        const bytes = Object.values(savingsByFile).reduce((s, b) => s + b, 0);
        finding.savings = { bytes, estimate: estimate ?? false };
        for (const [path, b] of Object.entries(savingsByFile)) {
          bestByFile.set(path, Math.max(bestByFile.get(path) ?? 0, b));
        }
      }
      findings.push(finding);
    }
  }

  // A debug build makes every other number misleading, so it always comes first.
  const rank = (f: Finding) => (f.checkId === 'debuggable' ? -1 : SEVERITY_RANK[f.severity]);
  findings.sort((a, b) => rank(a) - rank(b) || (b.savings?.bytes ?? 0) - (a.savings?.bytes ?? 0));
  const savingsBytes = [...bestByFile.values()].reduce((s, b) => s + b, 0);
  return { findings, savingsBytes, warnings };
}

function itemsFor(paths: string[], sizes: Map<string, number>): FindingItem[] {
  return paths.map((path) => ({ path, bytes: sizes.get(path) ?? 0 })).sort((a, b) => b.bytes - a.bytes);
}
