const { Schematic } = require('../../dist/index.cjs');

describe('Summary Output', () => {
  let schematic;
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Verbose mode behavior', () => {
    it('should NOT show summary in verbose mode', () => {
      const verboseSchematic = new Schematic({ verbose: true });

      consoleSpy.mockClear();

      verboseSchematic.printSummary();

      // Summary should not appear in verbose mode
      const summaryCall = consoleSpy.mock.calls.find(call =>
        call.join(' ').includes('Generated:')
      );
      expect(summaryCall).toBeUndefined();
    });

    it('should not show summary when all counters are 0 in non-verbose mode', () => {
      const quietSchematic = new Schematic({ verbose: false });

      consoleSpy.mockClear();

      quietSchematic.resetCounters();
      quietSchematic.printSummary();

      // Should not output when all counters are 0
      const summaryCall = consoleSpy.mock.calls.find(call =>
        call.join(' ').includes('Generated:')
      );
      expect(summaryCall).toBeUndefined();
    });
  });

  describe('Counter reset', () => {
    it('should have resetCounters method available', () => {
      const schematic = new Schematic({ verbose: false });

      // Method should exist and be callable
      expect(() => schematic.resetCounters()).not.toThrow();
    });
  });
});
