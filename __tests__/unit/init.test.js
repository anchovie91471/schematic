const { Schematic } = require('../../dist/index.cjs');
const fs = require('fs-extra');
const path = require('path');

describe('Init Command', () => {
  let testDir;
  let schematic;

  beforeEach(() => {
    testDir = path.join(__dirname, '../temp-init-test');
    fs.ensureDirSync(testDir);

    schematic = new Schematic({ verbose: false });

    jest.spyOn(process, 'cwd').mockReturnValue(testDir);
    jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    fs.removeSync(testDir);
    jest.restoreAllMocks();
  });

  // ───────────────────────── config file mode (default in v3.0.0) ─────────────────────────

  describe('config file mode (default)', () => {
    it('creates schematic.config.js with no filename argument', async () => {
      await schematic.init();

      const filePath = path.join(testDir, 'schematic.config.js');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('creates a custom-named config file when filename is provided', async () => {
      await schematic.init('my-project.config.js');

      expect(fs.existsSync(path.join(testDir, 'my-project.config.js'))).toBe(true);
    });

    it('does NOT strip extensions in config mode (user filename is verbatim)', async () => {
      await schematic.init('custom.config.js');

      expect(fs.existsSync(path.join(testDir, 'custom.config.js'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'custom.config'))).toBe(false);
    });

    it('writes CommonJS syntax by default (no package.json)', async () => {
      await schematic.init();

      const content = fs.readFileSync(path.join(testDir, 'schematic.config.js'), 'utf-8');
      expect(content).toContain('module.exports = {');
      expect(content).not.toContain('export default');
    });

    it('writes ESM syntax when package.json has "type": "module"', async () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ type: 'module' }));

      const esSchematic = new Schematic({ verbose: false });
      jest.spyOn(process, 'cwd').mockReturnValue(testDir);
      await esSchematic.init();

      const content = fs.readFileSync(path.join(testDir, 'schematic.config.js'), 'utf-8');
      expect(content).toContain('export default {');
      expect(content).not.toContain('module.exports');
    });

    it('contains default paths configuration', async () => {
      await schematic.init();

      const content = fs.readFileSync(path.join(testDir, 'schematic.config.js'), 'utf-8');
      expect(content).toContain('paths: {');
      expect(content).toContain("config: './config'");
      expect(content).toContain("sections: './sections'");
      expect(content).toContain("schema: './src/schema'");
      expect(content).toContain("themeBlocksSchema: './src/schema/theme-blocks'");
    });

    it('contains a hint about $development / $production env overrides', async () => {
      await schematic.init();

      const content = fs.readFileSync(path.join(testDir, 'schematic.config.js'), 'utf-8');
      expect(content).toContain('$development');
      expect(content).toContain('$production');
    });

    it('does NOT contain shebang or app.run() (config files are data, not scripts)', async () => {
      await schematic.init();

      const content = fs.readFileSync(path.join(testDir, 'schematic.config.js'), 'utf-8');
      expect(content).not.toContain('#!/usr/bin/env node');
      expect(content).not.toContain('app.run()');
    });

    it('does NOT chmod the config file', async () => {
      await schematic.init();

      const stats = fs.statSync(path.join(testDir, 'schematic.config.js'));
      const mode = stats.mode & parseInt('777', 8);
      const hasExecute = (mode & parseInt('111', 8)) !== 0;
      expect(hasExecute).toBe(false);
    });

    it('shows "Created config" success message and "npx schematic" hint', async () => {
      const successSpy = jest.spyOn(schematic.logger, 'success');

      await schematic.init();

      expect(successSpy).toHaveBeenCalledWith('Created config: schematic.config.js');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('npx schematic')
      );
    });
  });

  // ───────────────────────── executable mode (--executable flag) ─────────────────────────

  describe('executable mode (--executable flag)', () => {
    it('creates ./schematic executable with default name', async () => {
      await schematic.init(undefined, { executable: true });

      expect(fs.existsSync(path.join(testDir, 'schematic'))).toBe(true);
    });

    it('creates executable with custom name', async () => {
      await schematic.init('my-builder', { executable: true });

      expect(fs.existsSync(path.join(testDir, 'my-builder'))).toBe(true);
    });

    it('strips .js extension from custom name (executable has no extension)', async () => {
      await schematic.init('my-builder.js', { executable: true });

      expect(fs.existsSync(path.join(testDir, 'my-builder'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'my-builder.js'))).toBe(false);
    });

    it('strips .cjs and .mjs extensions too', async () => {
      await schematic.init('a.cjs', { executable: true });
      await schematic.init('b.mjs', { executable: true });

      expect(fs.existsSync(path.join(testDir, 'a'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'b'))).toBe(true);
    });

    it('chmods the executable file (0o111 set)', async () => {
      await schematic.init(undefined, { executable: true });

      const stats = fs.statSync(path.join(testDir, 'schematic'));
      const mode = stats.mode & parseInt('777', 8);
      const hasExecute = (mode & parseInt('111', 8)) !== 0;
      expect(hasExecute).toBe(true);
    });

    it('contains shebang and app.run()', async () => {
      await schematic.init(undefined, { executable: true });

      const content = fs.readFileSync(path.join(testDir, 'schematic'), 'utf-8');
      expect(content).toContain('#!/usr/bin/env node');
      expect(content).toContain('app.run();');
    });

    it('uses require() for CommonJS projects', async () => {
      await schematic.init(undefined, { executable: true });

      const content = fs.readFileSync(path.join(testDir, 'schematic'), 'utf-8');
      expect(content).toContain("require('@anchovie/schematic')");
      expect(content).not.toContain('import');
    });

    it('uses import for ESM projects', async () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({ type: 'module' }));

      const esSchematic = new Schematic({ verbose: false });
      jest.spyOn(process, 'cwd').mockReturnValue(testDir);
      await esSchematic.init(undefined, { executable: true });

      const content = fs.readFileSync(path.join(testDir, 'schematic'), 'utf-8');
      expect(content).toContain("import { Schematic } from '@anchovie/schematic'");
      expect(content).not.toContain('require');
    });

    it('shows "Created executable" success message', async () => {
      const successSpy = jest.spyOn(schematic.logger, 'success');

      await schematic.init('my-builder', { executable: true });

      expect(successSpy).toHaveBeenCalledWith('Created executable: my-builder');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('./my-builder')
      );
    });
  });

  // ───────────────────────── error paths ─────────────────────────

  describe('error handling', () => {
    it('throws FILE_EXISTS for config mode when file already exists', async () => {
      fs.writeFileSync(path.join(testDir, 'schematic.config.js'), 'existing');

      await expect(schematic.init()).rejects.toMatchObject({
        code: 'FILE_EXISTS',
        filename: 'schematic.config.js',
        message: expect.stringContaining('File already exists'),
      });
    });

    it('throws FILE_EXISTS for executable mode when file already exists', async () => {
      fs.writeFileSync(path.join(testDir, 'schematic'), 'existing');

      await expect(
        schematic.init(undefined, { executable: true })
      ).rejects.toMatchObject({
        code: 'FILE_EXISTS',
        filename: 'schematic',
      });
    });
  });
});
