const { Schematic } = require('../../dist/index.cjs');

// Reference implementation for cross-checking the production #replaceUpToFirstMarker.
// Intentionally uses a different strategy: `.search()` to locate the first match position,
// then character-by-character scan to compute the end of that match. Production code uses
// `.match()` on a non-/g regex — so if both implementations produce the same result on
// the same input, at least two distinct strategies agree.
function naiveReplaceUpToFirstMarker(contents, newText) {
  const markers = contents.match(/{%-?\s*comment\s*-?%}\s*schematic/gi);
  if (!markers) return contents;
  const firstMarker = markers[0];
  const firstMarkerStart = contents.indexOf(firstMarker);
  return newText + contents.slice(firstMarkerStart + firstMarker.length);
}

function findFirstMarkerEnd(contents) {
  const markers = contents.match(/{%-?\s*comment\s*-?%}\s*schematic/gi);
  if (!markers) return -1;
  const firstMarker = markers[0];
  return contents.indexOf(firstMarker) + firstMarker.length;
}

// Simple seedable PRNG (mulberry32). Deterministic for reproducibility.
function makePrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Fuzz tests for writeCode / writeCodeShort marker matching (v2.2.9)', () => {
  let schematic;
  const PERF_THRESHOLD_MS = 100; // Any single call over this fails the suite
  const SCHEMA = { settings: [{ id: 'heading' }, { id: 'color' }], blocks: [{ type: '@app' }] };
  const IMPORT_NAME = 'test-section';

  beforeAll(() => {
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

  function runTimed(fn) {
    const start = Date.now();
    const result = fn();
    const elapsed = Date.now() - start;
    return { result, elapsed };
  }

  describe('performance under adversarial shapes (regression guards for catastrophic backtracking)', () => {
    test('long runs of {% comment %} without the schematic keyword', () => {
      const nearMiss = '{% comment %} '.repeat(10000); // ~140KB of near-miss
      const input = nearMiss + '{% comment %} schematic {% endcomment %}\n<div>after</div>';

      const { result, elapsed } = runTimed(() =>
        schematic.writeCode(input, IMPORT_NAME, SCHEMA)
      );

      expect(elapsed).toBeLessThan(PERF_THRESHOLD_MS);
      expect(result.endsWith('<div>after</div>')).toBe(true);
    });

    test('many partial-marker fragments that never complete ("{% comment %} schem")', () => {
      const partial = '{% comment %} schem '.repeat(5000);
      const input = partial + '{% comment %} schematic {% endcomment %}\n<x>last</x>';

      const { result, elapsed } = runTimed(() =>
        schematic.writeCode(input, IMPORT_NAME, SCHEMA)
      );

      expect(elapsed).toBeLessThan(PERF_THRESHOLD_MS);
      expect(result.endsWith('<x>last</x>')).toBe(true);
    });

    test('1 MB file with a single marker at the end', () => {
      const filler = 'a'.repeat(1024 * 1024);
      const input = filler + '{% comment %} schematic {% endcomment %}\n<tail/>';

      const { result, elapsed } = runTimed(() =>
        schematic.writeCode(input, IMPORT_NAME, SCHEMA)
      );

      expect(elapsed).toBeLessThan(PERF_THRESHOLD_MS);
      expect(result.endsWith('<tail/>')).toBe(true);
    });

    test('file with 500 valid markers scattered throughout', () => {
      const chunk = '<section>data</section>\n{% comment %} schematic {% endcomment %}\n';
      const input = chunk.repeat(500) + '<footer/>';

      const { result, elapsed } = runTimed(() =>
        schematic.writeCode(input, IMPORT_NAME, SCHEMA)
      );

      expect(elapsed).toBeLessThan(PERF_THRESHOLD_MS);
      expect(result.endsWith('<footer/>')).toBe(true);
    });

    test('heavy whitespace interior within a single marker', () => {
      const weirdMarker = '{%-    comment    -%}' + ' '.repeat(500) + 'schematic';
      const input = 'x'.repeat(100000) + weirdMarker + '\n{% endcomment %}\n<x/>';

      const { result, elapsed } = runTimed(() =>
        schematic.writeCode(input, IMPORT_NAME, SCHEMA)
      );

      expect(elapsed).toBeLessThan(PERF_THRESHOLD_MS);
      expect(result).toContain('<x/>');
    });

    test('mixed adversarial: partial matches + valid markers + large prefix', () => {
      const prefix = ['{% comment %} foo ', '{% comment %} bar ', '{%comment%}', '{% COMMENT %} '].join('').repeat(2000);
      const input = prefix + '{% comment %} schematic {% endcomment %}\n<end/>';

      const { result, elapsed } = runTimed(() =>
        schematic.writeCode(input, IMPORT_NAME, SCHEMA)
      );

      expect(elapsed).toBeLessThan(PERF_THRESHOLD_MS);
      expect(result.endsWith('<end/>')).toBe(true);
    });
  });

  describe('correctness invariants', () => {
    test('input with no marker is returned unchanged', () => {
      const noMarkerInputs = [
        '',
        '<div>hello</div>',
        '{% comment %} not-schematic {% endcomment %}',
        '{% schema %}{% endschema %}',
        'a'.repeat(1000),
        'plain text with {% if x %} liquid {% endif %} but no markers',
      ];

      for (const input of noMarkerInputs) {
        const result = schematic.writeCode(input, IMPORT_NAME, SCHEMA);
        expect(result).toBe(input);
      }
    });

    test('output always preserves everything after the first marker', () => {
      const marker = '{% comment %} schematic {% endcomment %}';
      const suffix = '<h1>after</h1>\n<p>more</p>\n<!-- end -->';
      const inputs = [
        marker + suffix,
        'prefix' + marker + suffix,
        marker + marker + suffix,
        [marker, marker, marker].join('\n') + suffix,
        '{%- comment -%} schematic {%- endcomment -%}' + suffix,
        '{%-comment-%}schematic' + suffix,
      ];

      for (const input of inputs) {
        const firstEnd = findFirstMarkerEnd(input);
        const expectedSuffix = input.slice(firstEnd);
        const result = schematic.writeCode(input, IMPORT_NAME, SCHEMA);
        expect(result.endsWith(expectedSuffix)).toBe(true);
      }
    });

    test('output always contains at least one marker (re-processable)', () => {
      const inputs = [
        '{% comment %} schematic {% endcomment %}',
        'prefix\n{% comment %} schematic {% endcomment %}\nsuffix',
        '{%- comment -%} schematic {%- endcomment -%}',
      ];

      for (const input of inputs) {
        const result = schematic.writeCode(input, IMPORT_NAME, SCHEMA);
        const stillHasMarker = /{%-?\s*comment\s*-?%}\s*schematic/i.test(result);
        expect(stillHasMarker).toBe(true);
      }
    });

    test('multi-marker inputs preserve trailing markers under first-match semantics', () => {
      // v3.0.0 behavior change: first-match replaces up to and including the FIRST
      // marker. Content after the first marker (including subsequent markers) is
      // preserved verbatim. 2.x collapsed all markers to one under last-match.
      const marker = '{% comment %} schematic {% endcomment %}\n';
      const input = marker.repeat(5) + '<end/>';

      const result = schematic.writeCode(input, IMPORT_NAME, SCHEMA);

      const matches = result.match(/{%-?\s*comment\s*-?%}\s*schematic/gi) || [];
      // 1 newly-generated marker (end of the replacement code) + 4 preserved
      // originals (markers 2 through 5 from the input)
      expect(matches.length).toBe(5);
      expect(result.endsWith('<end/>')).toBe(true);
    });

    test('case insensitivity: UPPERCASE and MiXeD-case markers match', () => {
      const inputs = [
        '{% COMMENT %} SCHEMATIC {% ENDCOMMENT %}\n<end/>',
        '{%- Comment -%} Schematic {%- endcomment -%}\n<end/>',
        '{%- coMMeNt -%} ScHemAtic {%- endcomment -%}\n<end/>',
      ];

      for (const input of inputs) {
        const result = schematic.writeCode(input, IMPORT_NAME, SCHEMA);
        expect(result).not.toBe(input);
        expect(result.endsWith('<end/>')).toBe(true);
      }
    });
  });

  describe('cross-check against naive reference implementation', () => {
    const palette = [
      '<div>block</div>\n',
      '{% if x %}{% endif %}\n',
      '{% raw %}text{% endraw %}\n',
      '{% comment %} not-it {% endcomment %}\n',
      '{% comment %} schematic {% endcomment %}\n',
      '{%- comment -%} schematic {%- endcomment -%}\n',
      'plain\n',
      '\n',
      'æøå unicode 🎨\n',
    ];

    test('writeCode matches naive reference across 200 random combinations', () => {
      const prng = makePrng(0xC0FFEE);

      for (let i = 0; i < 200; i++) {
        const len = 1 + Math.floor(prng() * 15);
        let input = '';
        for (let j = 0; j < len; j++) {
          input += palette[Math.floor(prng() * palette.length)];
        }

        const result = schematic.writeCode(input, IMPORT_NAME, SCHEMA);
        const firstEnd = findFirstMarkerEnd(input);

        if (firstEnd === -1) {
          expect(result).toBe(input);
          continue;
        }

        const preservedSuffix = input.slice(firstEnd);
        expect(result.endsWith(preservedSuffix)).toBe(true);

        // Recover the generated code block by taking the prefix of result
        // that comes before the preserved suffix
        const generatedCode = result.slice(0, result.length - preservedSuffix.length);

        // Cross-check: feeding that same generatedCode into the naive reference
        // should reproduce the exact same output
        const reference = naiveReplaceUpToFirstMarker(input, generatedCode);
        expect(result).toBe(reference);
      }
    });

    test('writeCodeShort matches naive reference across 200 random combinations', () => {
      const prng = makePrng(0xBADF00D);

      for (let i = 0; i < 200; i++) {
        const len = 1 + Math.floor(prng() * 15);
        let input = '';
        for (let j = 0; j < len; j++) {
          input += palette[Math.floor(prng() * palette.length)];
        }

        const result = schematic.writeCodeShort(input, IMPORT_NAME, {});
        const firstEnd = findFirstMarkerEnd(input);

        if (firstEnd === -1) {
          expect(result).toBe(input);
          continue;
        }

        const preservedSuffix = input.slice(firstEnd);
        expect(result.endsWith(preservedSuffix)).toBe(true);
        const generatedCode = result.slice(0, result.length - preservedSuffix.length);
        const reference = naiveReplaceUpToFirstMarker(input, generatedCode);
        expect(result).toBe(reference);
      }
    });
  });

  describe('edge cases', () => {
    test('empty string returns empty string', () => {
      expect(schematic.writeCode('', IMPORT_NAME, SCHEMA)).toBe('');
      expect(schematic.writeCodeShort('', IMPORT_NAME, {})).toBe('');
    });

    test('input that is exactly a bare marker with no endcomment', () => {
      const input = '{% comment %} schematic';
      const result = schematic.writeCode(input, IMPORT_NAME, SCHEMA);
      expect(result).not.toBe(input);
      expect(/{%-?\s*comment\s*-?%}\s*schematic/i.test(result)).toBe(true);
    });

    test('marker at the very start (no prefix content)', () => {
      const input = '{% comment %} schematic {% endcomment %}\nafter\n';
      const result = schematic.writeCode(input, IMPORT_NAME, SCHEMA);
      expect(result.endsWith('{% endcomment %}\nafter\n')).toBe(true);
    });

    test('marker at the very end (no suffix content)', () => {
      const input = 'before\n{% comment %} schematic';
      const result = schematic.writeCode(input, IMPORT_NAME, SCHEMA);
      expect(result.length).toBeGreaterThan(0);
      expect(/{%-?\s*comment\s*-?%}\s*schematic/i.test(result)).toBe(true);
    });
  });
});
