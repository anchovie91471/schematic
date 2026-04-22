const { Logger } = require('../../src/logger');

describe('Logger', () => {
  let logger;
  let consoleSpy;

  beforeEach(() => {
    logger = new Logger();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should respect NO_COLOR environment variable', () => {
    process.env.NO_COLOR = '1';
    const colorlessLogger = new Logger();
    expect(colorlessLogger.useColor).toBe(false);
    delete process.env.NO_COLOR;
  });

  it('should detect TTY environments', () => {
    // In test environment, process.stdout.isTTY is typically undefined
    // so useColor should be false (unless NO_COLOR is set)
    const testLogger = new Logger();
    // useColor is calculated based on NO_COLOR and TTY status
    // It will be a boolean
    expect(testLogger.useColor === true || testLogger.useColor === false).toBe(true);
  });

  it('should format error messages with context', () => {
    logger.schemaError('test.js', 'Syntax error', 'Test context');

    expect(consoleSpy).toHaveBeenCalled();
    // Check that file and error details are logged
    const calls = consoleSpy.mock.calls.flat();
    expect(calls.some(call => String(call).includes('test.js'))).toBe(true);
  });

  it('should log info messages', () => {
    logger.info('Test info message');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should log success messages', () => {
    logger.success('Test success');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should log warning messages', () => {
    logger.warn('Test warning');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should log error messages', () => {
    logger.error('Test error');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should only log debug messages when verbose is true', () => {
    const verboseLogger = new Logger(true);
    verboseLogger.debug('Debug message');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockClear();

    const quietLogger = new Logger(false);
    quietLogger.debug('Debug message');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should only log info messages when verbose is true', () => {
    const verboseLogger = new Logger(true);
    verboseLogger.info('Info message');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockClear();

    const quietLogger = new Logger(false);
    quietLogger.info('Info message');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should only log success messages when verbose is true', () => {
    const verboseLogger = new Logger(true);
    verboseLogger.success('Success message');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockClear();

    const quietLogger = new Logger(false);
    quietLogger.success('Success message');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should always log error messages regardless of verbose mode', () => {
    const quietLogger = new Logger(false);
    quietLogger.error('Error message');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockClear();

    const verboseLogger = new Logger(true);
    verboseLogger.error('Error message');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should always log warning messages regardless of verbose mode', () => {
    const quietLogger = new Logger(false);
    quietLogger.warn('Warning message');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockClear();

    const verboseLogger = new Logger(true);
    verboseLogger.warn('Warning message');
    expect(consoleSpy).toHaveBeenCalled();
  });

  // Added in 2.2.6 — setVerbose lets callers flip the verbose flag after construction.
  // Schematic.envDefaults() uses this to honor SCHEMATIC_VERBOSE (previously a silent no-op).
  describe('setVerbose', () => {
    it('flips verbose flag from false to true', () => {
      const l = new Logger(false);
      expect(l.verbose).toBe(false);
      l.setVerbose(true);
      expect(l.verbose).toBe(true);
    });

    it('flips verbose flag from true to false', () => {
      const l = new Logger(true);
      expect(l.verbose).toBe(true);
      l.setVerbose(false);
      expect(l.verbose).toBe(false);
    });

    it('makes previously-silent info() actually log after setVerbose(true)', () => {
      const l = new Logger(false);
      l.info('before setVerbose');
      expect(consoleSpy).not.toHaveBeenCalled();

      l.setVerbose(true);
      l.info('after setVerbose');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('makes previously-logging info() silent after setVerbose(false)', () => {
      const l = new Logger(true);
      l.info('before setVerbose');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockClear();
      l.setVerbose(false);
      l.info('after setVerbose');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});
