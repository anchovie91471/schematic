const { Schematic } = require('../../dist/index.cjs');

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

  // Edge case matrix — added in 2.2.6 to lock down marker-matching semantics
  // after the regex perf fix. Before 2.2.6, these behaviors were emergent from
  // a greedy regex that caused catastrophic backtracking; after 2.2.6 they are
  // explicit in the #replaceUpToLastMarker helper.
  describe('marker matching (regression coverage for 2.2.6 perf fix)', () => {
    const schema = { settings: [], blocks: [] };

    test('returns contents unchanged when no marker is present', () => {
      const contents = '<html>no marker here</html>';
      const result = schematic.writeCode(contents, 'test', schema);
      expect(result).toBe(contents);
    });

    test('handles empty string input', () => {
      const result = schematic.writeCode('', 'test', schema);
      expect(result).toBe('');
    });

    test('replaces when marker is at start of file', () => {
      const contents = '{%- comment -%} schematic rest';
      const result = schematic.writeCode(contents, 'test', schema);
      expect(result).toContain("render 'test'");
      expect(result.endsWith(' rest')).toBe(true);
    });

    test('replaces when marker is at end of file', () => {
      const contents = 'prefix content\n{%- comment -%} schematic';
      const result = schematic.writeCode(contents, 'test', schema);
      expect(result).toContain("render 'test'");
      // Nothing after the marker, so result ends with the code block's trailing marker
      expect(result).toMatch(/\{%- comment -%\} schematic$/);
    });

    test('matches LAST marker when multiple are present (preserves pre-2.2.6 semantics)', () => {
      const contents = 'A\n{%- comment -%} schematic\nB\n{%- comment -%} schematic\nC';
      const result = schematic.writeCode(contents, 'test', schema);
      // Old greedy regex matched through the LAST marker, discarding "B" between markers.
      // 2.2.6 preserves this behavior. The suffix after the last marker is "\nC".
      expect(result).toContain("render 'test'");
      expect(result.endsWith('\nC')).toBe(true);
      expect(result).not.toContain('A\n{%- comment -%}'); // first marker consumed
      expect(result).not.toContain('\nB\n');              // content between markers discarded
    });

    test('matches case-insensitively', () => {
      const contents = '{%- COMMENT -%} Schematic\nrest';
      const result = schematic.writeCode(contents, 'test', schema);
      expect(result).toContain("render 'test'");
      expect(result.endsWith('\nrest')).toBe(true);
    });

    test('matches despite whitespace variations in marker', () => {
      const cases = [
        '{%-comment-%}schematic text',
        '{% comment %}  schematic trailing',
        '{%-  comment  -%}    schematic    extra',
        '{%-comment -%}  schematic tail',
      ];

      for (const contents of cases) {
        const result = schematic.writeCode(contents, 'test', schema);
        expect(result).toContain("render 'test'");
      }
    });

    test('writeCodeShort uses identical marker-matching semantics', () => {
      const contents = 'before\n{%- comment -%} schematic\nafter';
      const result = schematic.writeCodeShort(contents, 'test', schema);
      expect(result).toContain("{%- render 'test' with section as section -%}");
      expect(result.endsWith('\nafter')).toBe(true);
    });

    // Regression guard — before 2.2.6, this test would time out (old regex was O(n^2)
    // and took seconds on files >100KB). After 2.2.6, it completes in a few milliseconds.
    test('completes in < 50ms on a large liquid file (>400KB)', () => {
      // Synthesize a large liquid file: 400KB of filler followed by the marker
      const filler = 'x'.repeat(400 * 1024);
      const contents = filler + '\n{%- comment -%} schematic\nsuffix';

      const start = process.hrtime.bigint();
      const result = schematic.writeCode(contents, 'test', schema);
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

      expect(result.endsWith('\nsuffix')).toBe(true);
      expect(elapsedMs).toBeLessThan(50);
    });
  });
});