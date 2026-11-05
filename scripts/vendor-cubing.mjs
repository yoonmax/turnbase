// Bundles the parts of cubing.js used at runtime into public/vendor/cubing as
// standalone ES modules, outside the application's own bundle.
//
// Why this is a separate step: cubing.js starts its scramble worker from a chunk
// that it locates through import.meta.url. Vite's chunking merges that worker
// entry with application code, and the worker then dies on `window`/`document`.
// esbuild keeps the chunk graph the way cubing.js expects, so the worker loads.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const outdir = 'public/vendor/cubing';
await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints: {
    scramble: 'cubing/scramble',
    twisty: 'cubing/twisty',
    // cubing.js first looks for its worker under this exact name, next to its chunks.
    'chunks/search-worker-entry': 'node_modules/cubing/dist/lib/cubing/chunks/search-worker-entry.js',
  },
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'linked',
  chunkNames: 'chunks/[name]-[hash]',
  outdir,
  logLevel: 'warning',
  loader: { '.wasm': 'file' },
});
console.log('vendored cubing.js into', outdir);
