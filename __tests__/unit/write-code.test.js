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
  // after the regex perf fix. v3.0.0 changed the behavior from "match LAST
  // marker" to "match FIRST marker" via #replaceUpToFirstMarker. For single-
  // marker files (the common case) results are byte-identical; multi-marker
  // files produce different output — content after the first marker is now
  // preserved instead of discarded.
  describe('marker matching (regression coverage for 2.2.6 perf fix + v3 first-match switch)', () => {
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

    test('matches FIRST marker when multiple are present (v3 behavior change from 2.x)', () => {
      const contents = 'A\n{%- comment -%} schematic\nB\n{%- comment -%} schematic\nC';
      const result = schematic.writeCode(contents, 'test', schema);
      // v3.0.0 matches the FIRST marker. Everything AFTER the first marker —
      // including the "\nB\n" content and the SECOND marker — is preserved.
      // (2.x matched LAST and destroyed content between markers.)
      expect(result).toContain("render 'test'");
      expect(result).not.toContain('A\n{%- comment -%}');  // content before first marker consumed
      expect(result).toContain('\nB\n');                    // content between markers preserved (was discarded in 2.x)
      expect(result.endsWith('\nC')).toBe(true);            // suffix preserved (unchanged from 2.x)
      // Result now contains TWO markers: the newly-generated one at the end of
      // `code` plus the second original marker that was preserved.
      const markerCount = (result.match(/{%-?\s*comment\s*-?%}\s*schematic/gi) || []).length;
      expect(markerCount).toBe(2);
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