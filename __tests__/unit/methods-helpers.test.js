// The `app` export is a SchematicHelpers instance with every method from
// helpers/common.js and helpers/methods.js attached as instance methods —
// so the checks here work against the public API just like a consumer would.
const { app: methods } = require('../../dist/index.cjs');

describe('methods helpers', () => {
  describe('sidebar()', () => {
    it('should create basic header with content only', () => {
      const result = methods.header('Test Header');
      expect(result).toEqual({
        type: 'header',
        content: 'Test Header'
      });
    });

    it('should create header with string info', () => {
      const result = methods.header('Test Header', 'Some info text');
      expect(result).toEqual({
        type: 'header',
        content: 'Test Header',
        info: 'Some info text'
      });
    });

    it('should place visible_if at top level, not nested in info', () => {
      const result = methods.header('Test Header', { visible_if: 'some_condition' });
      expect(result).toEqual({
        type: 'header',
        content: 'Test Header',
        visible_if: 'some_condition'
      });
      expect(result.info).toBeUndefined();
    });

    it('should keep non-top-level properties in info when visible_if is present', () => {
      const result = methods.header('Test Header', { visible_if: 'cond', extra: 'data' });
      expect(result.visible_if).toBe('cond');
      expect(result.info).toEqual({ extra: 'data' });
    });

    it('should keep properties in info when no top-level props are present', () => {
      const result = methods.header('Test Header', { foo: 'bar', baz: 'qux' });
      expect(result).toEqual({
        type: 'header',
        content: 'Test Header',
        info: { foo: 'bar', baz: 'qux' }
      });
    });

    it('should handle paragraph type', () => {
      const result = methods.paragraph('Some paragraph text');
      expect(result).toEqual({
        type: 'paragraph',
        content: 'Some paragraph text'
      });
    });
  });

  describe('option()', () => {
    it('should create option with value and label', () => {
      const result = methods.option('val', 'Label');
      expect(result).toEqual({
        value: 'val',
        label: 'Label'
      });
    });

    it('should create option with group', () => {
      const result = methods.option('val', 'Label', 'Group');
      expect(result).toEqual({
        value: 'val',
        label: 'Label',
        group: 'Group'
      });
    });
  });
});
