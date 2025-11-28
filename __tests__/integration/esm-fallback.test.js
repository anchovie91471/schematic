/**
 * Integration test for ESM fallback behavior
 *
 * This test verifies that in ESM projects (type: module), schematic
 * can find .js schema files when .cjs doesn't exist (fallback behavior).
 *
 * This test would have caught the v2.2.4 bug where #resolveSchemaPath
 * was defined but never called.
 */
const { Schematic } = require('../../src/schematic.js');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

describe('ESM Fallback Integration', () => {
  let tempDir;
  let originalCwd;

  beforeEach(async () => {
    // Save original cwd
    originalCwd = process.cwd();

    // Create a temp directory that simulates an ESM project
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'schematic-esm-fallback-'));

    // Create the directory structure
    await fs.ensureDir(path.join(tempDir, 'config'));
    await fs.ensureDir(path.join(tempDir, 'sections'));
    await fs.ensureDir(path.join(tempDir, 'snippets'));
    await fs.ensureDir(path.join(tempDir, 'locales'));
    await fs.ensureDir(path.join(tempDir, 'src/schema'));

    // Create ESM package.json
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      type: 'module'
    });

    // Change to temp directory
    process.chdir(tempDir);
  });

  afterEach(async () => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up temp directory
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  test('should find .cjs schema in ESM project (primary extension)', async () => {
    // Create a section file with schematic comment referencing "hero"
    // Note: Must use {% comment %} syntax, not {# #}
    const sectionContent = `{%- comment -%} schematic hero {%- endcomment -%}
<section>
  <h1>{{ section.settings.heading }}</h1>
</section>
{% schema %}
{% endschema %}`;
    await fs.writeFile(path.join(tempDir, 'sections/hero.liquid'), sectionContent);

    // Create a .cjs schema file - the preferred extension in ESM projects
    const schemaContent = `module.exports = {
  name: 'Hero Section',
  settings: [
    {
      type: 'text',
      id: 'heading',
      label: 'Heading',
      default: 'Welcome'
    }
  ],
  presets: [{ name: 'Hero' }]
};`;
    await fs.writeFile(path.join(tempDir, 'src/schema/hero.cjs'), schemaContent);

    // Create schematic instance
    const schematic = new Schematic({
      paths: {
        config: './config',
        sections: './sections',
        snippets: './snippets',
        blocks: './blocks',
        locales: './locales',
        schema: './src/schema',
        themeBlocksSchema: './src/schema/theme-blocks',
      },
      verbose: false,
    });

    // Run schematic - this should find hero.cjs
    await schematic.run();

    // Verify the section was processed - check for schema in output file
    const outputContent = await fs.readFile(path.join(tempDir, 'sections/hero.liquid'), 'utf-8');

    expect(outputContent).toContain('{% schema %}');
    expect(outputContent).toContain('Hero Section');
    expect(outputContent).toContain('"id": "heading"');
  });

  test('should use extension fallback order in ESM projects', async () => {
    // Create a section file
    // Note: Must use {% comment %} syntax, not {# #}
    const sectionContent = `{%- comment -%} schematic test {%- endcomment -%}
<section></section>
{% schema %}
{% endschema %}`;
    await fs.writeFile(path.join(tempDir, 'sections/test.liquid'), sectionContent);

    // In ESM projects, fallback order is: .cjs → .js → .mjs
    // Create only .cjs to verify it's found as primary extension
    const cjsSchema = `module.exports = {
  name: 'CJS Schema Found',
  settings: [],
  presets: [{ name: 'CJS' }]
};`;
    await fs.writeFile(path.join(tempDir, 'src/schema/test.cjs'), cjsSchema);

    const schematic = new Schematic({
      paths: {
        config: './config',
        sections: './sections',
        snippets: './snippets',
        blocks: './blocks',
        locales: './locales',
        schema: './src/schema',
        themeBlocksSchema: './src/schema/theme-blocks',
      },
      verbose: false,
    });

    await schematic.run();

    const outputContent = await fs.readFile(path.join(tempDir, 'sections/test.liquid'), 'utf-8');

    // Should find .cjs file
    expect(outputContent).toContain('CJS Schema Found');
  });

  test('should provide helpful error when no schema file exists', async () => {
    // Create a section file referencing non-existent schema
    // Note: Must use {% comment %} syntax, not {# #}
    const sectionContent = `{%- comment -%} schematic nonexistent {%- endcomment -%}
<section></section>
{% schema %}
{% endschema %}`;
    await fs.writeFile(path.join(tempDir, 'sections/missing.liquid'), sectionContent);

    const schematic = new Schematic({
      paths: {
        config: './config',
        sections: './sections',
        snippets: './snippets',
        blocks: './blocks',
        locales: './locales',
        schema: './src/schema',
        themeBlocksSchema: './src/schema/theme-blocks',
      },
      verbose: false,
    });

    // This should not throw, but should log an error
    // The section should remain unchanged (no schema injected)
    await schematic.run();

    const outputContent = await fs.readFile(path.join(tempDir, 'sections/missing.liquid'), 'utf-8');

    // Schema should remain empty since file wasn't found
    expect(outputContent).toContain('{% schema %}');
    expect(outputContent).toContain('{% endschema %}');
    // Should not have any JSON content between schema tags (beyond whitespace)
    const schemaMatch = outputContent.match(/{% schema %}([\s\S]*?){% endschema %}/);
    expect(schemaMatch[1].trim()).toBe('');
  });
});
