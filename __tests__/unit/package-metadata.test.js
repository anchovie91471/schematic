const pkg = require('../../package.json');

describe('package.json metadata', () => {
  describe('engines', () => {
    it('declares an engines.node constraint', () => {
      expect(pkg.engines).toBeDefined();
      expect(pkg.engines.node).toBeDefined();
    });

    it('requires Node 20 or newer (matches ora@9 peer requirement)', () => {
      expect(pkg.engines.node).toBe('>=20.0.0');
    });
  });
});
