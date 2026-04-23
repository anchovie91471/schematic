const { Schematic } = require('../../dist/index.cjs');
const fs = require('fs-extra');
const path = require('path');

describe('Optional Paths', () => {
  const testDir = path.join(__dirname, '../fixtures/optional-paths-test');

  beforeAll(async () => {
    // Create a minimal Shopify theme structure without blocks/theme-blocks
    await fs.ensureDir(path.join(testDir, 'config'));
    await fs.ensureDir(path.join(testDir, 'sections'));
    await fs.ensureDir(path.join(testDir, 'snippets'));
    await fs.ensureDir(path.join(testDir, 'locales'));
    await fs.ensureDir(path.join(testDir, 'src/schema'));
  });

  afterAll(async () => {
    // Clean up test directory
    await fs.remove(testDir);
  });

  test('should throw MISSING_DIRECTORIES when a required directory is missing', async () => {
    const schematic = new Schematic({
      paths: {
        config: path.join(testDir, 'does-not-exist'),
        sections: path.join(testDir, 'sections'),
        snippets: path.join(testDir, 'snippets'),
        locales: path.join(testDir, 'locales'),
        schema: path.join(testDir, 'src/schema'),
        blocks: path.join(testDir, 'blocks'),
        themeBlocksSchema: path.join(testDir, 'src/schema/theme-blocks'),
      },
      verbose: false,
    });

    await expect(schematic.preCheck()).rejects.toMatchObject({
      code: 'MISSING_DIRECTORIES',
      missing: expect.arrayContaining([expect.stringContaining('does-not-exist')]),
      message: expect.stringContaining('Missing required directories'),
    });
  });

  test('should not fail preCheck when blocks directory is missing', async () => {
    const schematic = new Schematic({
      paths: {
        config: path.join(testDir, 'config'),
        sections: path.join(testDir, 'sections'),
        snippets: path.join(testDir, 'snippets'),
        locales: path.join(testDir, 'locales'),
        schema: path.join(testDir, 'src/schema'),
        blocks: path.join(testDir, 'blocks'),
        themeBlocksSchema: path.join(testDir, 'src/schema/theme-blocks'),
      },
      verbose: false,
    });

    await expect(schematic.preCheck()).resolves.not.toThrow();
  });

  test('should handle runBlocks gracefully when blocks directory does not exist', async () => {
    const schematic = new Schematic({
      paths: {
        config: path.join(testDir, 'config'),
        sections: path.join(testDir, 'sections'),
        snippets: path.join(testDir, 'snippets'),
        locales: path.join(testDir, 'locales'),
        schema: path.join(testDir, 'src/schema'),
        blocks: path.join(testDir, 'blocks'),
        themeBlocksSchema: path.join(testDir, 'src/schema/theme-blocks'),
      },
      verbose: false,
    });

    await expect(schematic.runBlocks()).resolves.not.toThrow();
  });

  test('should succeed with only required directories present', async () => {
    const schematic = new Schematic({
      paths: {
        config: path.join(testDir, 'config'),
        sections: path.join(testDir, 'sections'),
        snippets: path.join(testDir, 'snippets'),
        locales: path.join(testDir, 'locales'),
        schema: path.join(testDir, 'src/schema'),
        blocks: path.join(testDir, 'blocks'),
        themeBlocksSchema: path.join(testDir, 'src/schema/theme-blocks'),
      },
      verbose: false,
    });

    // Create an empty section file
    const sectionFile = path.join(testDir, 'sections/test.liquid');
    await fs.writeFile(sectionFile, '{%- comment -%} schematic {%- endcomment -%}');

    // Create a simple schema file
    const schemaFile = path.join(testDir, 'src/schema/test.js');
    await fs.writeFile(schemaFile, `module.exports = {
      name: 'Test Section',
      settings: [],
    };`);

    await expect(schematic.run(['test.liquid'])).resolves.not.toThrow();
  });
});