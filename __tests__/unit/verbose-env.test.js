const { Schematic } = require('../../dist/index.cjs');

// Regression coverage for the 2.2.6 fix to SCHEMATIC_VERBOSE. Before the fix, the
// Logger was instantiated in the constructor with the default verbose=false, and
// envDefaults() would later flip #opts.verbose to true but never sync the Logger.
// Result: SCHEMATIC_VERBOSE=true silently did nothing. This file locks down that
// the env var now actually takes effect.
describe('SCHEMATIC_VERBOSE env var integration', () => {
  const originalEnv = process.env.SCHEMATIC_VERBOSE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SCHEMATIC_VERBOSE;
    } else {
      process.env.SCHEMATIC_VERBOSE = originalEnv;
    }
  });

  test('SCHEMATIC_VERBOSE=true enables logger.verbose after envDefaults()', () => {
    process.env.SCHEMATIC_VERBOSE = 'true';
    const app = new Schematic();
    expect(app.logger.verbose).toBe(false); // constructor default, before envDefaults
    app.envDefaults();
    expect(app.logger.verbose).toBe(true);
  });

  test('SCHEMATIC_VERBOSE=1 enables logger.verbose after envDefaults()', () => {
    process.env.SCHEMATIC_VERBOSE = '1';
    const app = new Schematic();
    app.envDefaults();
    expect(app.logger.verbose).toBe(true);
  });

  test('SCHEMATIC_VERBOSE=false leaves logger.verbose false after envDefaults()', () => {
    process.env.SCHEMATIC_VERBOSE = 'false';
    const app = new Schematic();
    app.envDefaults();
    expect(app.logger.verbose).toBe(false);
  });

  test('SCHEMATIC_VERBOSE=0 leaves logger.verbose false after envDefaults()', () => {
    process.env.SCHEMATIC_VERBOSE = '0';
    const app = new Schematic();
    app.envDefaults();
    expect(app.logger.verbose).toBe(false);
  });

  test('unset SCHEMATIC_VERBOSE leaves logger.verbose at constructor default (false)', () => {
    delete process.env.SCHEMATIC_VERBOSE;
    const app = new Schematic();
    app.envDefaults();
    expect(app.logger.verbose).toBe(false);
  });

  test('programmatic { verbose: true } is preserved when env var is unset', () => {
    delete process.env.SCHEMATIC_VERBOSE;
    const app = new Schematic({ verbose: true });
    expect(app.logger.verbose).toBe(true);
    app.envDefaults();
    // envDefaults should not override the programmatic setting when env is unset
    expect(app.logger.verbose).toBe(true);
  });

  test('env var SCHEMATIC_VERBOSE=false overrides programmatic { verbose: true }', () => {
    process.env.SCHEMATIC_VERBOSE = 'false';
    const app = new Schematic({ verbose: true });
    expect(app.logger.verbose).toBe(true); // before envDefaults
    app.envDefaults();
    expect(app.logger.verbose).toBe(false); // env overrides
  });
});
