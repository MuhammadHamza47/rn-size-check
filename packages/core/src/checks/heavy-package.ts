import { DEFAULT_MIN_BYTES, suggestionFor } from '../data/package-suggestions.js';
import { formatBytes } from '../format.js';
import type { Check } from './types.js';

export const heavyPackage: Check = {
  id: 'heavy-package',
  title: 'Heavy npm packages with lighter options',
  description: 'npm packages known to be large in a React Native bundle, with a lighter alternative or import style.',
  requires: 'sourcemap',
  run(ctx) {
    const pk = ctx.packages;
    if (!pk) return [];
    const unit = pk.kind === 'hermes' ? 'bytecode' : 'JS';
    const bundled = new Set(pk.items.map((p) => p.name));
    return pk.items.flatMap((p) => {
      const suggestion = suggestionFor(p.name);
      if (!suggestion || p.bytes < (suggestion.minBytes ?? DEFAULT_MIN_BYTES)) return [];
      // When the app's code never imports the package, another dependency pulls it in: advice about
      // how to import it doesn't apply.
      const transitive = pk.directImports !== null && !pk.directImports.includes(p.name);
      return [
        {
          severity: transitive ? ('info' as const) : ('warn' as const),
          title: `${p.name} adds ${formatBytes(p.bytes)} of ${unit} to the JS bundle${transitive ? ' (pulled in by another package)' : ''}`,
          files: [],
          items: [],
          fix: transitive
            ? `Your code doesn't import ${p.name}; another dependency does. Run npm ls ${p.name} (or yarn why ${p.name}) to see which one, and if that library is easy to replace, consider a lighter one.`
            : suggestion.advice(bundled),
        },
      ];
    });
  },
};
