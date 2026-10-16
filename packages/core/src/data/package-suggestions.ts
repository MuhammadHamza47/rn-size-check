/**
 * npm packages that are often much bigger in a React Native bundle than they need to be, with what to
 * do instead. Metro bundles whole modules (no tree shaking by default), so "import one thing from a big
 * index file" pulls in the whole package. Keep advice specific and conservative.
 */
export interface PackageSuggestion {
  /** Package name, or a pattern for families of packages. */
  match: string | RegExp;
  /** Only flag the package above this size (bytes in the bundle). Default 30 KB. */
  minBytes?: number;
  /** Advice; may depend on which other packages are in the bundle. */
  advice: (bundled: Set<string>) => string;
}

const ICON_LIBRARY_ADVICE = () =>
  "Metro bundles every icon the library's index file exports, not only the ones you use. If the library has one file per icon, import from those files; otherwise copy the few SVG icons you need into the app.";

export const PACKAGE_SUGGESTIONS: readonly PackageSuggestion[] = [
  {
    match: 'moment',
    advice: (bundled) => {
      const other = ['date-fns', 'dayjs', 'luxon'].find((p) => bundled.has(p));
      return other
        ? `The bundle already includes ${other}: move the code that still uses moment to ${other} and remove moment.`
        : 'Replace with dayjs (about 7 KB, similar API) or date-fns. moment is large and cannot be split.';
    },
  },
  {
    // Importing from the package root pulls in every function; a whole date-fns is well over 100 KB.
    match: 'date-fns',
    minBytes: 100_000,
    advice: () =>
      "Imports from 'date-fns' pull in the whole library because Metro doesn't tree-shake. Import each function from its own path instead (for example date-fns/format).",
  },
  {
    match: 'lodash',
    advice: () => "Import single functions (import debounce from 'lodash/debounce') instead of the whole library; Metro does not tree-shake.",
  },
  {
    match: 'ramda',
    minBytes: 50_000,
    advice: () => "Imports from 'ramda' pull in the whole library. Import single functions (ramda/src/map) or use plain JS for the few you need.",
  },
  { match: 'aws-sdk', advice: () => 'Use the modular v3 clients (@aws-sdk/client-s3 and so on) instead of the whole v2 SDK.' },
  {
    match: /^(react-native-heroicons|lucide-react-native|phosphor-react-native|@tabler\/icons-react-native)$/,
    advice: ICON_LIBRARY_ADVICE,
  },
];

export const DEFAULT_MIN_BYTES = 30_000;

export function suggestionFor(name: string): PackageSuggestion | undefined {
  return PACKAGE_SUGGESTIONS.find((s) => (typeof s.match === 'string' ? s.match === name : s.match.test(name)));
}
