const { Schematic } = require('../../src/schematic.js');

describe('Code Generation', () => {
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

  describe('writeCode', () => {
    test('should generate render code with settings', () => {
      const contents = '{%- comment -%} schematic {%- endcomment -%}';
      const schema = {
        settings: [
          { id: 'heading' },
          { id: 'color' },
        ],
        blocks: [],
      };

      const result = schematic.writeCode(contents, 'test', schema);

      expect(result).toContain("render 'test',");
      expect(result).toContain('id: section.id,');
      expect(result).toContain('heading: section.settings.heading,');
      expect(result).toContain('color: section.settings.color,');
    });

    test('should include blocks when present', () => {
      const contents = '{%- comment -%} schematic {%- endcomment -%}';
      const schema = {
        settings: [{ id: 'heading' }],
        blocks: [{ type: '@app' }],
      };

      const result = schematic.writeCode(contents, 'test', schema);

      expect(result).toContain('blocks: section.blocks');
    });

    test('should preserve magic comment', () => {
      const contents = '{%- comment -%} schematic {%- endcomment -%}';
      const schema = { settings: [], blocks: [] };

      const result = schematic.writeCode(contents, 'test', schema);

      expect(result).toContain('{%- comment -%} schematic');
    });
  });

  describe('writeCodeShort', () => {
    test('should generate compact render syntax', () => {
      const contents = '{%- comment -%} schematic {%- endcomment -%}';
      const schema = {};

      const result = schematic.writeCodeShort(contents, 'test', schema);

      expect(result).toContain("{%- render 'test' with section as section -%}");
    });

    test('should preserve magic comment', () => {
      const contents = '{%- comment -%} schematic {%- endcomment -%}';
      const schema = {};

      const result = schematic.writeCodeShort(contents, 'test', schema);

      expect(result).toContain('{%- comment -%} schematic');
    });
  });
});