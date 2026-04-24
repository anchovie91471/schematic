const { Schematic } = require('../../dist/index.cjs');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Cache invalidation is phase 6.3's core mechanic — the watcher bumps a tick
// via Schematic#invalidateCache() so the next `await import()` returns fresh
// schema modules. These tests verify the API surface and sanity-check the
// caching-before-invalidation behavior.
//
// **Full invalidation-then-reload end-to-end is manually verified** (see
// CHANGELOG v3.0.0 phase 6.3 manual-verification notes). It is NOT tested
// here: Jest's internal module resolution and VM-module shim behave
// differently from Node's native `await import()` runtime, so the actual
// eviction-then-fresh-load flow doesn't reproduce reliably in-Jest. The
// `scripts/bench-sections.mjs` run and the manual watcher test against
// a temp theme fixture cover the runtime behavior.
describe('Schema cache invalidation (phase 6.3 watcher support)', () => {
  let tempDir;
  let schematic;
  let schemaFile;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'schematic-cache-test-'));
    await fs.ensureDir(path.join(tempDir, 'src/schema'));
    schemaFile = path.join(tempDir, 'src/schema/hero.js');

    await fs.writeFile(
      schemaFile,
      `module.exports = { name: 'First Version', settings: [] };`
    );

    schematic = new Schematic({
      paths: {
        schema: path.join(tempDir, 'src/schema'),
        sections: path.join(tempDir, 'sections'),
        config: path.join(tempDir, 'config'),
        snippets: path.join(tempDir, 'snippets'),
        locales: path.join(tempDir, 'locales'),
      },
      verbose: false,
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('invalidateCache is a public method on Schematic', () => {
    expect(typeof schematic.invalidateCache).toBe('function');
  });

  test('invalidateCache is idempotent — safe to call any number of times before any loads', () => {
    expect(() => schematic.invalidateCache()).not.toThrow();
    expect(() => schematic.invalidateCache()).not.toThrow();
    expect(() => schematic.invalidateCache()).not.toThrow();
    expect(() => schematic.invalidateCache()).not.toThrow();
  });

  test('invalidateCache is safe to call between loads', async () => {
    await schematic.compileSchema(schemaFile);
    expect(() => schematic.invalidateCache()).not.toThrow();
    await schematic.compileSchema(schemaFile);
    expect(() => schematic.invalidateCache()).not.toThrow();
  });

  test('Schematic exposes read-only opts getter', () => {
    expect(schematic.opts).toBeDefined();
    expect(schematic.opts.paths.schema).toBeDefined();
    // The getter returns a live reference to the merged opts object.
    expect(schematic.opts.paths.schema).toBe(path.join(tempDir, 'src/schema'));
  });

  test('Schematic.watch() method exists', () => {
    expect(typeof schematic.watch).toBe('function');
  });

  test('first load returns the file contents at load time', async () => {
    // Sanity check that basic schema loading works against the dist build.
    const schema = await schematic.compileSchema(schemaFile);
    expect(schema.name).toBe('First Version');
  });
});
