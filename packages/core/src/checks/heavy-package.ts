import { suggestionFor } from '../data/package-suggestions.js';
import { formatBytes } from '../format.js';
import type { Check } from './types.js';

/** Below this, swapping a package is rarely worth the effort. */
const MIN_BYTES = 30_000;

export const heavyPackage: Check = {
  id: 'heavy-package',
  title: 'Heavy npm packages with lighter options',
  description: 'npm packages known to be large in a React Native bundle, with a lighter alternative or import style.',
  requires: 'sourcemap',
  run(ctx) {
    const pk = ctx.packages;
    if (!pk) return [];
    const unit = pk.kind === 'hermes' ? 'bytecode' : 'JS';
    return pk.items
      .filter((p) => p.bytes >= MIN_BYTES)
      .flatMap((p) => {
        const suggestion = suggestionFor(p.name);
        if (!suggestion) return [];
        return [
          {
            severity: 'warn' as const,
            title: `${p.name} adds ${formatBytes(p.bytes)} of ${unit} to the JS bundle`,
            files: [],
            items: [],
            fix: suggestion.advice,
          },
        ];
      });
  },
};
