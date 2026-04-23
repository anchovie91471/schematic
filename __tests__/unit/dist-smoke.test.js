const fs = require('fs');
const path = require('path');

const distCjs = path.resolve(__dirname, '../../dist/index.cjs');
const distMjs = path.resolve(__dirname, '../../dist/index.mjs');

// Jest doesn't support real ESM dynamic `import()` without --experimental-vm-modules,
// so runtime verification of dist/index.mjs is done in scripts/build.mjs (post-build
// self-check) rather than here. These Jest tests cover the CJS path (which is also
// what bin/schematic uses) plus static-shape assertions on the ESM output.
describe('dist/ build smoke test', () => {
  test('dist/index.cjs and dist/index.mjs both exist (run npm run build first)', () => {
    expect(fs.existsSync(distCjs)).toBe(true);
    expect(fs.existsSync(distMjs)).toBe(true);
  });

  test('CJS require exposes Schematic class and app helpers object', () => {
    const m = require(distCjs);
    expect(typeof m.Schematic).toBe('function');
    expect(typeof m.app).toBe('object');
    expect(typeof m.app.section).toBe('function');
    expect(typeof m.app.make).toBe('function');
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

  test('ESM output has named exports for Schematic and app (static check)', () => {
    const mjs = fs.readFileSync(distMjs, 'utf8');
    // esbuild emits `export { Schematic, app };` or similar as the final line
    expect(mjs).toMatch(/export\s*\{[^}]*\bSchematic\b[^}]*\bapp\b[^}]*\}/);
  });

  test('ESM output has the createRequire banner (phase-3 removes this)', () => {
    const mjs = fs.readFileSync(distMjs, 'utf8');
    expect(mjs).toMatch(/createRequire/);
    expect(mjs).toMatch(/import\.meta\.url/);
  });

  test('bin/schematic references the built CJS, not the src/ entry', () => {
    const binContents = fs.readFileSync(
      path.resolve(__dirname, '../../bin/schematic'),
      'utf8'
    );
    expect(binContents).toMatch(/require\(['"]\.\.\/dist\/index\.cjs['"]\)/);
    expect(binContents).not.toMatch(/require\(['"]\.\.\/src\/schematic\.js['"]\)/);
  });
});
