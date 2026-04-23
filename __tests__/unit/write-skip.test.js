const { Schematic } = require('../../dist/index.cjs');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const SECTION_SCHEMA_SRC = `module.exports = {
  name: 'Test Section',
  settings: [
    { id: 'heading', type: 'text', label: 'Heading', default: 'Hello' },
  ],
};
`;

const BLOCK_SCHEMA_SRC = `module.exports = {
  name: 'Test Block',
  settings: [
    { id: 'text', type: 'text', label: 'Text', default: 'Hi' },
  ],
};
`;

// Bare liquid with the schematic marker; writeCode fills in above the marker
const BARE_SECTION_LIQUID = `<div class="test-section">
  <h1>{{ section.settings.heading }}</h1>
</div>
{% comment %} schematic writeCode() {% endcomment %}
`;

const BARE_BLOCK_LIQUID = `<div class="test-block">
  {{ block.settings.text }}
</div>
{% comment %} schematic writeCode() {% endcomment %}
`;

describe('Write-skip in runSection/runBlock (v2.2.9)', () => {
  let tempDir;
  let schematic;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'schematic-writeskip-'));

    // preCheck() requires these theme directories; ensure they exist up front
    for (const dir of ['config', 'sections', 'snippets', 'blocks', 'locales', 'src/schema', 'src/schema/theme-blocks']) {
      await fs.ensureDir(path.join(tempDir, dir));
    }

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
      localization: {
        file: path.join(tempDir, 'snippets/p-app-localization.liquid'),
        expression: 'window.app.copy = %%json%%;',
      },
      verbose: false,
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('runSection', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tempDir, 'src/schema/test-section.js'),
        SECTION_SCHEMA_SRC
      );
      await fs.writeFile(
        path.join(tempDir, 'sections/test-section.liquid'),
        BARE_SECTION_LIQUID
      );
    });

    test('writes liquid file on first run (bare liquid lacks compiled schema)', async () => {
      const writeSpy = jest.spyOn(fs, 'writeFile');
      await schematic.runSection('test-section.liquid');

      const sectionWrites = writeSpy.mock.calls.filter(
        c => String(c[0]).endsWith(path.join('sections', 'test-section.liquid'))
      );
      expect(sectionWrites.length).toBe(1);
      writeSpy.mockRestore();
    });

    test('skips write on second run when compiled output matches existing content', async () => {
      await schematic.runSection('test-section.liquid');

      const writeSpy = jest.spyOn(fs, 'writeFile');
      await schematic.runSection('test-section.liquid');

      const sectionWrites = writeSpy.mock.calls.filter(
        c => String(c[0]).endsWith(path.join('sections', 'test-section.liquid'))
      );
      expect(sectionWrites.length).toBe(0);
      writeSpy.mockRestore();
    });
  });

  describe('runBlock', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tempDir, 'src/schema/theme-blocks/test-block.js'),
        BLOCK_SCHEMA_SRC
      );
      await fs.writeFile(
        path.join(tempDir, 'blocks/test-block.liquid'),
        BARE_BLOCK_LIQUID
      );
    });

    test('writes block liquid file on first run (bare liquid lacks compiled schema)', async () => {
      const writeSpy = jest.spyOn(fs, 'writeFile');
      await schematic.runBlock('test-block.liquid');

      const blockWrites = writeSpy.mock.calls.filter(
        c => String(c[0]).endsWith(path.join('blocks', 'test-block.liquid'))
      );
      expect(blockWrites.length).toBe(1);
      writeSpy.mockRestore();
    });

    test('skips write on second run when compiled output matches existing content', async () => {
      await schematic.runBlock('test-block.liquid');

      const writeSpy = jest.spyOn(fs, 'writeFile');
      await schematic.runBlock('test-block.liquid');

      const blockWrites = writeSpy.mock.calls.filter(
        c => String(c[0]).endsWith(path.join('blocks', 'test-block.liquid'))
      );
      expect(blockWrites.length).toBe(0);
      writeSpy.mockRestore();
    });
  });

  describe('buildConfig', () => {
    const SETTINGS_SCHEMA_SRC = `module.exports = [
  {
    name: 'theme_info',
    theme_name: 'Test Theme',
    theme_version: '1.0.0',
    theme_author: 'Test',
    theme_documentation_url: '',
    theme_support_url: ''
  }
];
`;

    beforeEach(async () => {
      await fs.writeFile(
        path.join(tempDir, 'src/schema/settings_schema.js'),
        SETTINGS_SCHEMA_SRC
      );
    });

    test('writes settings_schema.json on first run (file does not exist yet)', async () => {
      const writeSpy = jest.spyOn(fs, 'writeFile');
      await schematic.buildConfig();

      const configWrites = writeSpy.mock.calls.filter(
        c => String(c[0]).endsWith(path.join('config', 'settings_schema.json'))
      );
      expect(configWrites.length).toBe(1);
      writeSpy.mockRestore();
    });

    test('skips write on second run when compiled JSON matches existing content', async () => {
      await schematic.buildConfig();

      const writeSpy = jest.spyOn(fs, 'writeFile');
      await schematic.buildConfig();

      const configWrites = writeSpy.mock.calls.filter(
        c => String(c[0]).endsWith(path.join('config', 'settings_schema.json'))
      );
      expect(configWrites.length).toBe(0);
      writeSpy.mockRestore();
    });
  });

  describe('buildLocales (covers locale file write + writeLocalization snippet)', () => {
    beforeEach(async () => {
      // Locale source schema
      await fs.ensureDir(path.join(tempDir, 'src/schema/locales'));
      await fs.writeFile(
        path.join(tempDir, 'src/schema/locales/en.default.js'),
        `module.exports = { hello: 'Hello' };\n`
      );
      // Localization snippet (writeLocalization target)
      await fs.writeFile(
        path.join(tempDir, 'snippets/p-app-localization.liquid'),
        `{% comment %} schematicLocalization {% endcomment %}\n`
      );
    });

    test('skips locale JSON write on second run when compiled content matches', async () => {
      await schematic.buildLocales();

      const writeSyncSpy = jest.spyOn(fs, 'writeFileSync');
      await schematic.buildLocales();

      const localeWrites = writeSyncSpy.mock.calls.filter(
        c => String(c[0]).endsWith(path.join('locales', 'en.default.json'))
      );
      expect(localeWrites.length).toBe(0);
      writeSyncSpy.mockRestore();
    });

    test('skips localization snippet write on second run (writeLocalization)', async () => {
      await schematic.buildLocales();

      const writeSpy = jest.spyOn(fs, 'writeFile');
      await schematic.buildLocales();

      const snippetWrites = writeSpy.mock.calls.filter(
        c => String(c[0]).endsWith(path.join('snippets', 'p-app-localization.liquid'))
      );
      expect(snippetWrites.length).toBe(0);
      writeSpy.mockRestore();
    });
  });

  describe('printSummary', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tempDir, 'src/schema/test-section.js'),
        SECTION_SCHEMA_SRC
      );
      await fs.writeFile(
        path.join(tempDir, 'sections/test-section.liquid'),
        BARE_SECTION_LIQUID
      );
    });

    test('prints "no files changed" when all counters are zero (non-verbose)', async () => {
      // First run populates liquid, increments counter
      await schematic.runSection('test-section.liquid');
      schematic.resetCounters();

      // Second run is a no-op since compiled output already matches
      await schematic.runSection('test-section.liquid');

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      schematic.printSummary();

      const calls = logSpy.mock.calls.map(args => args.join(' '));
      const summaryLine = calls.find(line => line.includes('Schematic'));
      expect(summaryLine).toContain('no files changed');

      logSpy.mockRestore();
    });

    test('prints "Schematic generated: 1 section" when a section was written', async () => {
      await schematic.runSection('test-section.liquid');

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      schematic.printSummary();

      const calls = logSpy.mock.calls.map(args => args.join(' '));
      const summaryLine = calls.find(line => line.includes('Schematic'));
      expect(summaryLine).toContain('generated');
      expect(summaryLine).toContain('1 section');

      logSpy.mockRestore();
    });
  });
});
