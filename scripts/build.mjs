// Bundle src/index.js into dist/index.cjs and dist/index.mjs.
// External deps (chalk, fs-extra, ora, Node built-ins) stay as runtime requires/imports
// — we don't bundle them into the output.
import { build } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outdir = resolve(root, 'dist');

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const shared = {
  entryPoints: [resolve(root, 'src/index.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  packages: 'external',
  logLevel: 'info',
};

await build({
  ...shared,
  format: 'cjs',
  outfile: resolve(outdir, 'index.cjs'),
});

// ESM output needs a createRequire shim because src/ is currently written in
// CJS style (`const fs = require('fs-extra')`). Phase 3 will rewrite the source
// to native ESM imports and this banner becomes unnecessary.
await build({
  ...shared,
  format: 'esm',
  outfile: resolve(outdir, 'index.mjs'),
  banner: {
    js: "import { createRequire as __esbuildCreateRequire } from 'node:module';\nconst require = __esbuildCreateRequire(import.meta.url);",
  },
});

// Post-build self-verification. Jest can't run real ESM dynamic imports without
// --experimental-vm-modules, so we do the runtime check here where we have a
// plain Node runtime. If this fails, the build fails.
console.log('\nVerifying dist/ outputs...');

const cjsMod = await import(resolve(outdir, 'index.cjs'));
const cjsDefault = cjsMod.default || cjsMod;
if (typeof cjsDefault.Schematic !== 'function' || typeof cjsDefault.app !== 'object') {
  throw new Error('dist/index.cjs is missing Schematic or app exports');
}

const esmMod = await import(resolve(outdir, 'index.mjs'));
if (typeof esmMod.Schematic !== 'function' || typeof esmMod.app !== 'object') {
  throw new Error('dist/index.mjs is missing named Schematic or app exports');
}
if (typeof esmMod.app.section !== 'function' || typeof esmMod.app.make !== 'function') {
  throw new Error('dist/index.mjs app helper is missing expected methods');
}

console.log('  dist/index.cjs  ✓ exposes { Schematic, app }');
console.log('  dist/index.mjs  ✓ exposes named { Schematic, app }');
