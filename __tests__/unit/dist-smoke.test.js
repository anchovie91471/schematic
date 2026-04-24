const fs = require('fs');
const path = require('path');

const distCjs = path.resolve(__dirname, '../../dist/index.cjs');
const distMjs = path.resolve(__dirname, '../../dist/index.mjs');
const distDts = path.resolve(__dirname, '../../dist/index.d.ts');

// Jest doesn't support real ESM dynamic `import()` without --experimental-vm-modules,
// so runtime verification of dist/index.mjs is done in scripts/build.mjs (post-build
// self-check) rather than here. These Jest tests cover the CJS path (which is also
// what bin/schematic uses) plus static-shape assertions on the ESM output.
describe('dist/ build smoke test', () => {
  test('dist/index.cjs, dist/index.mjs, dist/index.d.ts all exist (run npm run build first)', () => {
    expect(fs.existsSync(distCjs)).toBe(true);
    expect(fs.existsSync(distMjs)).toBe(true);
    expect(fs.existsSync(distDts)).toBe(true);
  });

  test('dist/index.d.ts declares the expected public API', () => {
    const dts = fs.readFileSync(distDts, 'utf8');
    // Class declarations
    expect(dts).toMatch(/export declare class Schematic/);
    expect(dts).toMatch(/export declare class Logger/);
    // Named exports
    expect(dts).toMatch(/export declare const app/);
    // Config surface
    expect(dts).toMatch(/export interface SchematicConfig/);
    expect(dts).toMatch(/export interface SchematicPaths/);
    // Error discriminants
    expect(dts).toMatch(/MISSING_DIRECTORIES/);
    expect(dts).toMatch(/FILE_EXISTS/);
    expect(dts).toMatch(/INIT_WRITE_FAILED/);
  });

  test('CJS require exposes Schematic class, app helpers, and Logger', () => {
    const m = require(distCjs);
    expect(typeof m.Schematic).toBe('function');
    expect(typeof m.app).toBe('object');
    expect(typeof m.app.section).toBe('function');
    expect(typeof m.app.make).toBe('function');
    expect(typeof m.Logger).toBe('function');
  });

  test('CJS build instantiates a Schematic with the full public surface', () => {
    const { Schematic } = require(distCjs);
    const instance = new Schematic({ verbose: false });

    expect(typeof instance.run).toBe('function');
    expect(typeof instance.runSection).toBe('function');
    expect(typeof instance.runBlock).toBe('function');
    expect(typeof instance.scaffold).toBe('function');
    expect(typeof instance.preCheck).toBe('function');
    expect(typeof instance.buildConfig).toBe('function');
    expect(typeof instance.buildLocales).toBe('function');
  });

  test('ESM output has named exports for Schematic, app, and Logger', () => {
    const mjs = fs.readFileSync(distMjs, 'utf8');
    // Phase 3 rewrote src/ to native ESM so esbuild emits clean named exports
    expect(mjs).toMatch(/export\s*\{[^}]*\bSchematic\b[^}]*\}/);
    expect(mjs).toMatch(/export\s*\{[^}]*\bapp\b[^}]*\}/);
    expect(mjs).toMatch(/export\s*\{[^}]*\bLogger\b[^}]*\}/);
  });

  test('ESM output does NOT contain the phase-2.5 createRequire banner', () => {
    const mjs = fs.readFileSync(distMjs, 'utf8');
    // Phase 3 converted src/ to native ESM, so the createRequire shim that
    // phase-2.5 added to make CJS-style requires work inside ESM output is
    // no longer needed. If this assertion starts failing, something regressed
    // to CJS-style requires in src/.
    expect(mjs).not.toMatch(/createRequire/);
    expect(mjs).not.toMatch(/__esbuildCreateRequire/);
  });

  test('bin/schematic references the built CJS, not the src/ entry', () => {
    const binContents = fs.readFileSync(
      path.resolve(__dirname, '../../bin/schematic'),
      'utf8'
    );
    expect(binContents).toMatch(/require\(['"]\.\.\/dist\/index\.cjs['"]\)/);
    expect(binContents).not.toMatch(/require\(['"]\.\.\/src\/schematic\.js['"]\)/);
  });

  test('bin/schematic uses Citty for CLI parsing (phase 6.1)', () => {
    const binContents = fs.readFileSync(
      path.resolve(__dirname, '../../bin/schematic'),
      'utf8'
    );
    expect(binContents).toMatch(/import\(['"]citty['"]\)/);
    expect(binContents).toMatch(/defineCommand/);
    expect(binContents).toMatch(/runMain/);
  });

  test('bin/schematic uses c12 for config discovery (phase 6.2)', () => {
    const binContents = fs.readFileSync(
      path.resolve(__dirname, '../../bin/schematic'),
      'utf8'
    );
    expect(binContents).toMatch(/import\(['"]c12['"]\)/);
    expect(binContents).toMatch(/loadConfig/);
    // $env-key merging via NODE_ENV is enabled (matches the $development/
    // $production/$test pattern users see in schematic.config.js templates).
    expect(binContents).toMatch(/envName/);
  });

  test('bin/schematic declares the expected subcommands', () => {
    const binContents = fs.readFileSync(
      path.resolve(__dirname, '../../bin/schematic'),
      'utf8'
    );
    // Citty subcommands: build (+ default), scaffold, section, init
    expect(binContents).toMatch(/name:\s*['"]build['"]/);
    expect(binContents).toMatch(/name:\s*['"]scaffold['"]/);
    expect(binContents).toMatch(/name:\s*['"]section['"]/);
    expect(binContents).toMatch(/name:\s*['"]init['"]/);
    // `watch` does NOT exist yet — that's phase 6.3. Guard against accidental addition.
    expect(binContents).not.toMatch(/name:\s*['"]watch['"]/);
  });

  test('init subcommand exposes the --executable flag (phase 6.2)', () => {
    const binContents = fs.readFileSync(
      path.resolve(__dirname, '../../bin/schematic'),
      'utf8'
    );
    expect(binContents).toMatch(/executable:\s*\{/);
    expect(binContents).toMatch(/args\.executable/);
  });
});
