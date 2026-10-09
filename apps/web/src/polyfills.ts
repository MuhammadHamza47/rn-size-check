import { Buffer } from 'buffer';

// The analysis engine uses Node's Buffer API. Imported first so it exists before core modules load.
(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
