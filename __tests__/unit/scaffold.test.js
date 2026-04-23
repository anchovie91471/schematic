const { Schematic } = require('../../dist/index.cjs');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('Scaffold', () => {
  let tempDir;
  let schematic;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'schematic-test-'));

    schematic = new Schematic({
      paths: {
        config: path.join(tempDir, 'config'),
        sections: path.join(tempDir, 'sections'),
        snippets: path.join(tempDir, 'snippets'),
        blocks: path.join(tempDir, 'blocks'),
        locales: path.join(tempDir, 'locales'),
        schema: path.join(tempDir, 'src/schema'),
        themeBlocksSchema: path.join(tempDir, 'src/schema/theme-blocks'),
      },
      verbose: false,
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  describe('Default scaffold (section files)', () => {
    it('should create section, snippet, and schema files', async () => {
      await schematic.scaffold('test-section');

      const sectionFile = path.join(tempDir, 'sections/test-section.liquid');
      const snippetFile = path.join(tempDir, 'snippets/test-section.liquid');
      const schemaFile = path.join(tempDir, 'src/schema/test-section.js');

      expect(await fs.pathExists(sectionFile)).toBe(true);
      expect(await fs.pathExists(snippetFile)).toBe(true);
      expect(await fs.pathExists(schemaFile)).toBe(true);
    });

    it('should NOT create block files by default', async () => {
      await schematic.scaffold('test-section');

      const blockFile = path.join(tempDir, 'blocks/test-section.liquid');
      const blockSchemaFile = path.join(tempDir, 'src/schema/theme-blocks/test-section.js');

      expect(await fs.pathExists(blockFile)).toBe(false);
      expect(await fs.pathExists(blockSchemaFile)).toBe(false);
    });

    it('should create writeCode comment by default', async () => {
      await schematic.scaffold('test-section');

      const sectionFile = path.join(tempDir, 'sections/test-section.liquid');
      const content = await fs.readFile(sectionFile, 'utf-8');

      expect(content).toContain('schematic writeCode');
    });

    it('should create writeCodeShort comment when --short flag used', async () => {
      await schematic.scaffold('test-section', true);

      const sectionFile = path.join(tempDir, 'sections/test-section.liquid');
      const content = await fs.readFile(sectionFile, 'utf-8');

      expect(content).toContain('schematic writeCodeShort');
    });
  });

  describe('Block-only scaffold', () => {
    it('should create only block and blockSchema files when blockOnly=true', async () => {
      await schematic.scaffold('test-block', false, true);

      const blockFile = path.join(tempDir, 'blocks/test-block.liquid');
      const blockSchemaFile = path.join(tempDir, 'src/schema/theme-blocks/test-block.js');

      expect(await fs.pathExists(blockFile)).toBe(true);
      expect(await fs.pathExists(blockSchemaFile)).toBe(true);
    });

    it('should NOT create section files when blockOnly=true', async () => {
      await schematic.scaffold('test-block', false, true);

      const sectionFile = path.join(tempDir, 'sections/test-block.liquid');
      const snippetFile = path.join(tempDir, 'snippets/test-block.liquid');
      const schemaFile = path.join(tempDir, 'src/schema/test-block.js');

      expect(await fs.pathExists(sectionFile)).toBe(false);
      expect(await fs.pathExists(snippetFile)).toBe(false);
      expect(await fs.pathExists(schemaFile)).toBe(false);
    });
  });

  describe('Directory creation', () => {
    it('should automatically create parent directories if they do not exist', async () => {
      // tempDir is empty - no directories exist yet
      await schematic.scaffold('test-section');

      const sectionFile = path.join(tempDir, 'sections/test-section.liquid');
      const snippetFile = path.join(tempDir, 'snippets/test-section.liquid');
      const schemaFile = path.join(tempDir, 'src/schema/test-section.js');

      // All files should exist even though directories didn't exist before
      expect(await fs.pathExists(sectionFile)).toBe(true);
      expect(await fs.pathExists(snippetFile)).toBe(true);
      expect(await fs.pathExists(schemaFile)).toBe(true);
    });
  });

  describe('Smart naming', () => {
    it('should format section names properly', async () => {
      await schematic.scaffold('my-hero-section');

      const schemaFile = path.join(tempDir, 'src/schema/my-hero-section.js');
      const content = await fs.readFile(schemaFile, 'utf-8');

      expect(content).toContain("'My Hero Section'");
    });

    it('should format block names properly', async () => {
      await schematic.scaffold('my-custom-block', false, true);

      const blockSchemaFile = path.join(tempDir, 'src/schema/theme-blocks/my-custom-block.js');
      const content = await fs.readFile(blockSchemaFile, 'utf-8');

      expect(content).toContain("'My Custom Block'");
    });
  });

  describe('File already exists', () => {
    it('should skip files that already exist', async () => {
      const sectionFile = path.join(tempDir, 'sections/test-section.liquid');
      await fs.outputFile(sectionFile, 'existing content');

      await schematic.scaffold('test-section');

      const content = await fs.readFile(sectionFile, 'utf-8');
      expect(content).toBe('existing content'); // Should not be overwritten
    });
  });
});
