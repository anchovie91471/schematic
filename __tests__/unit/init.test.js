const { Schematic } = require('../../src/schematic');
const fs = require('fs-extra');
const path = require('path');

describe('Init Command', () => {
  let testDir;
  let schematic;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = path.join(__dirname, '../temp-init-test');
    fs.ensureDirSync(testDir);

    // Create schematic instance
    schematic = new Schematic({ verbose: false });

    // Mock process.cwd() to return our test directory
    jest.spyOn(process, 'cwd').mockReturnValue(testDir);

    // Mock process.exit to prevent tests from exiting
    jest.spyOn(process, 'exit').mockImplementation(() => {});

    // Spy on console.log
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    // Clean up test directory
    fs.removeSync(testDir);

    // Restore mocks
    jest.restoreAllMocks();
  });

  describe('File creation', () => {
    it('should create file with default name "schematic"', async () => {
      await schematic.init();

      const filePath = path.join(testDir, 'schematic');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should create file with custom name', async () => {
      await schematic.init('my-builder');

      const filePath = path.join(testDir, 'my-builder');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should strip .js extension from filename', async () => {
      await schematic.init('my-builder.js');

      const filePath = path.join(testDir, 'my-builder');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'my-builder.js'))).toBe(false);
    });

    it('should strip .cjs extension from filename', async () => {
      await schematic.init('my-builder.cjs');

      const filePath = path.join(testDir, 'my-builder');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'my-builder.cjs'))).toBe(false);
    });

    it('should strip .mjs extension from filename', async () => {
      await schematic.init('my-builder.mjs');

      const filePath = path.join(testDir, 'my-builder');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'my-builder.mjs'))).toBe(false);
    });
  });

  describe('File existence checking', () => {
    it('should error if file already exists', async () => {
      // Create a file first
      const filePath = path.join(testDir, 'schematic');
      fs.writeFileSync(filePath, 'existing content');

      await schematic.init('schematic');

      // Should have called process.exit(1)
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should show helpful message when file exists', async () => {
      // Create a file first
      const filePath = path.join(testDir, 'schematic');
      fs.writeFileSync(filePath, 'existing content');

      await schematic.init('schematic');

      // Should show helpful message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Please choose a different name')
      );
    });
  });

  describe('File permissions', () => {
    it('should make file executable', async () => {
      await schematic.init();

      const filePath = path.join(testDir, 'schematic');
      const stats = fs.statSync(filePath);

      // Check if file has execute permission (mode includes 0o111)
      const mode = stats.mode & parseInt('777', 8);
      const hasExecute = (mode & parseInt('111', 8)) !== 0;

      expect(hasExecute).toBe(true);
    });
  });

  describe('Template content', () => {
    it('should contain shebang', async () => {
      await schematic.init();

      const filePath = path.join(testDir, 'schematic');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('#!/usr/bin/env node');
    });

    it('should contain require statement for CommonJS projects', async () => {
      // No package.json, defaults to CommonJS
      await schematic.init();

      const filePath = path.join(testDir, 'schematic');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain("const { Schematic } = require('@anchovie/schematic');");
    });

    it('should contain import statement for ES module projects', async () => {
      // Create package.json with "type": "module"
      const pkgPath = path.join(testDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ type: 'module' }));

      // Create new schematic instance to pick up the package.json
      const esSchematic = new Schematic({ verbose: false });
      jest.spyOn(process, 'cwd').mockReturnValue(testDir);

      await esSchematic.init();

      const filePath = path.join(testDir, 'schematic');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain("import { Schematic } from '@anchovie/schematic';");
      expect(content).not.toContain('require');
    });

    it('should contain default paths configuration', async () => {
      await schematic.init();

      const filePath = path.join(testDir, 'schematic');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('paths: {');
      expect(content).toContain("config: './config'");
      expect(content).toContain("sections: './sections'");
      expect(content).toContain("snippets: './snippets'");
      expect(content).toContain("blocks: './blocks'");
      expect(content).toContain("locales: './locales'");
      expect(content).toContain("schema: './src/schema'");
      expect(content).toContain("themeBlocksSchema: './src/schema/theme-blocks'");
    });

    it('should contain verbose: false setting', async () => {
      await schematic.init();

      const filePath = path.join(testDir, 'schematic');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('verbose: false');
    });

    it('should contain helpful comments', async () => {
      await schematic.init();

      const filePath = path.join(testDir, 'schematic');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('// Customize paths below');
      expect(content).toContain('// Shopify config directory');
      expect(content).toContain('// Set to true for detailed output');
    });

    it('should contain app.run() call', async () => {
      await schematic.init();

      const filePath = path.join(testDir, 'schematic');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('app.run();');
    });
  });

  describe('Success messaging', () => {
    it('should show success message with filename', async () => {
      // Mock logger.success
      const successSpy = jest.spyOn(schematic.logger, 'success');

      await schematic.init('my-builder');

      expect(successSpy).toHaveBeenCalledWith('Created executable: my-builder');
    });

    it('should show usage instructions', async () => {
      await schematic.init('my-builder');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('./my-builder')
      );
    });
  });
});
