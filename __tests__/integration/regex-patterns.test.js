const { Schematic } = require('../../src/schematic.js');

describe('Regex Patterns', () => {
  let schematic;

  beforeEach(() => {
    schematic = new Schematic({ verbose: false });
  });

  test('should match basic magic comment', () => {
    const content = '{%- comment -%} schematic {%- endcomment -%}';
    const regex = /{%\-?\s*comment\s*\-?%}\s*schematic\s*['"]?([^'"\s{]+)?['"]?\s*(.*)?{%\-?\s*endcomment\s*\-?%}/mi;

    expect(regex.test(content)).toBe(true);
  });

  test('should match magic comment with filename', () => {
    const content = '{%- comment -%} schematic mySection {%- endcomment -%}';
    const regex = /{%\-?\s*comment\s*\-?%}\s*schematic\s*['"]?([^'"\s{]+)?['"]?\s*(.*)?{%\-?\s*endcomment\s*\-?%}/mi;
    const match = content.match(regex);

    expect(match).toBeTruthy();
    expect(match[1]).toBe('mySection');
  });

  test('should match magic comment with options', () => {
    const content = '{%- comment -%} schematic writeCode {%- endcomment -%}';
    const regex = /{%\-?\s*comment\s*\-?%}\s*schematic\s*['"]?([^'"\s{]+)?['"]?\s*(.*)?{%\-?\s*endcomment\s*\-?%}/mi;
    const match = content.match(regex);

    expect(match).toBeTruthy();
    expect(match[1]).toBe('writeCode');
  });

  test('should match magic comment with filename and options', () => {
    const content = '{%- comment -%} schematic mySection writeCodeShort {%- endcomment -%}';
    const regex = /{%\-?\s*comment\s*\-?%}\s*schematic\s*['"]?([^'"\s{]+)?['"]?\s*(.*)?{%\-?\s*endcomment\s*\-?%}/mi;
    const match = content.match(regex);

    expect(match).toBeTruthy();
    expect(match[1]).toBe('mySection');
    expect(match[2].trim()).toBe('writeCodeShort');
  });

  test('should match schema tag for replacement', () => {
    const content = `
      <div>Content</div>
      {% schema %}
      {"name": "Test"}
      {% endschema %}
    `;
    const regex = /({%\-?\s*schema\s*\-?%}[\s\S]*{%\-?\s*endschema\s*\-?%})/mig;

    expect(regex.test(content)).toBe(true);
  });
});