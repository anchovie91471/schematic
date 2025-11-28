const { Schematic } = require('../../src/schematic.js');
const path = require('path');

describe('Schema Compilation', () => {
  let schematic;

  beforeEach(() => {
    schematic = new Schematic({
      paths: {
        config: './__tests__/fixtures/config',
        sections: './__tests__/fixtures/sections',
        snippets: './__tests__/fixtures/snippets',
        blocks: './__tests__/fixtures/blocks',
        locales: './__tests__/fixtures/locales',
        schema: './__tests__/fixtures/schema',
        themeBlocksSchema: './__tests__/fixtures/schema/theme-blocks',
      },
      verbose: false,
    });
  });

  test('compileSchema should load and return valid schema', async () => {
    const schemaPath = path.resolve('./__tests__/fixtures/schema/test-section.js');
    const schema = await schematic.compileSchema(schemaPath);

    expect(schema).toBeDefined();
    expect(schema.name).toBe('Test Section');
    expect(schema.settings).toHaveLength(2);
    expect(schema.settings[0].id).toBe('heading');
  });

  test('compileSchema should handle section type correctly', async () => {
    const schemaPath = path.resolve('./__tests__/fixtures/schema/test-section.js');
    const schema = await schematic.compileSchema(schemaPath, 'section');

    expect(schema.enabled_on).toBeDefined();
    expect(schema.enabled_on.templates).toContain('index');
  });

  test('compileSchema should handle block type correctly', async () => {
    const schemaPath = path.resolve('./__tests__/fixtures/schema/theme-blocks/test-block.js');
    const schema = await schematic.compileSchema(schemaPath, 'block');

    expect(schema).toBeDefined();
    expect(schema.name).toBe('Test Block');
    expect(schema.settings).toHaveLength(1);
  });
});