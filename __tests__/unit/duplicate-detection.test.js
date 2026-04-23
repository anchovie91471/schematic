const { Schematic } = require('../../dist/index.cjs');

describe('Duplicate ID Detection', () => {
  let schematic;

  beforeEach(() => {
    schematic = new Schematic();
  });

  it('should detect duplicate setting IDs', () => {
    const settings = [
      { id: 'heading', label: 'Heading' },
      { id: 'text', label: 'Text' },
      { id: 'heading', label: 'Secondary Heading' } // Duplicate
    ];

    const result = schematic.validateUniqueIds(settings, 'test.js', 'settings');

    expect(result.valid).toBe(false);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].id).toBe('heading');
    expect(result.duplicates[0].firstPosition).toBe(1);
    expect(result.duplicates[0].duplicatePosition).toBe(3);
  });

  it('should pass validation when all IDs are unique', () => {
    const settings = [
      { id: 'heading', label: 'Heading' },
      { id: 'text', label: 'Text' },
      { id: 'image', label: 'Image' }
    ];

    const result = schematic.validateUniqueIds(settings, 'test.js', 'settings');

    expect(result.valid).toBe(true);
    expect(result.duplicates).toHaveLength(0);
  });

  it('should handle settings without IDs (headers, paragraphs)', () => {
    const settings = [
      { type: 'header', content: 'Section Header' },
      { id: 'heading', label: 'Heading' },
      { type: 'paragraph', content: 'Help text' },
      { id: 'text', label: 'Text' }
    ];

    const result = schematic.validateUniqueIds(settings, 'test.js', 'settings');

    expect(result.valid).toBe(true);
  });

  it('should show helpful label in error', () => {
    const settings = [
      { id: 'heading', label: 'Main Heading' },
      { id: 'heading', label: 'Secondary Heading' }
    ];

    const result = schematic.validateUniqueIds(settings, 'test.js', 'settings');

    expect(result.duplicates[0].label).toBe('Secondary Heading');
  });

  it('should detect multiple duplicate IDs in one schema', () => {
    const settings = [
      { id: 'heading', label: 'Heading' },
      { id: 'text', label: 'Text' },
      { id: 'heading', label: 'Subheading' }, // Duplicate 1
      { id: 'color', label: 'Color' },
      { id: 'text', label: 'Description' }  // Duplicate 2
    ];

    const result = schematic.validateUniqueIds(settings, 'test.js', 'settings');

    expect(result.valid).toBe(false);
    expect(result.duplicates).toHaveLength(2);
    expect(result.duplicates[0].id).toBe('heading');
    expect(result.duplicates[1].id).toBe('text');
  });

  it('should handle settings with missing labels', () => {
    const settings = [
      { id: 'heading' }, // No label
      { id: 'heading', label: 'Duplicate' }
    ];

    const result = schematic.validateUniqueIds(settings, 'test.js', 'settings');

    expect(result.valid).toBe(false);
    expect(result.duplicates[0].label).toBe('Duplicate');
  });

  it('should return label as "(no label)" for unlabeled duplicate', () => {
    const settings = [
      { id: 'test', label: 'First' },
      { id: 'test' } // No label
    ];

    const result = schematic.validateUniqueIds(settings, 'test.js', 'settings');

    expect(result.duplicates[0].label).toBe('(no label)');
  });
});

describe('Duplicate Block Type / Name Detection (v2.2.9)', () => {
  let schematic;

  beforeEach(() => {
    schematic = new Schematic();
  });

  it('detects duplicate block type', () => {
    const blocks = [
      { type: 'text', name: 'Text Block', settings: [] },
      { type: 'image', name: 'Image Block', settings: [] },
      { type: 'text', name: 'Second Text', settings: [] }, // duplicate type
    ];

    const result = schematic.validateUniqueBlockAttributes(blocks, 'test.js');

    expect(result.valid).toBe(false);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]).toMatchObject({
      kind: 'type',
      value: 'text',
      firstPosition: 1,
      duplicatePosition: 3,
    });
  });

  it('detects duplicate block name', () => {
    const blocks = [
      { type: 'text', name: 'Content Block' },
      { type: 'image', name: 'Content Block' }, // duplicate name, different type
    ];

    const result = schematic.validateUniqueBlockAttributes(blocks, 'test.js');

    expect(result.valid).toBe(false);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]).toMatchObject({
      kind: 'name',
      value: 'Content Block',
      firstPosition: 1,
      duplicatePosition: 2,
    });
  });

  it('reports both kinds of duplicates when they coexist', () => {
    const blocks = [
      { type: 'text', name: 'Block A' },
      { type: 'text', name: 'Block A' }, // both type AND name duplicate
    ];

    const result = schematic.validateUniqueBlockAttributes(blocks, 'test.js');

    expect(result.valid).toBe(false);
    expect(result.duplicates).toHaveLength(2);
    const kinds = result.duplicates.map(d => d.kind).sort();
    expect(kinds).toEqual(['name', 'type']);
  });

  it('passes when all block types and names are unique', () => {
    const blocks = [
      { type: 'text', name: 'Text Block' },
      { type: 'image', name: 'Image Block' },
      { type: 'video', name: 'Video Block' },
      { type: '@app', name: 'App Block' },
    ];

    const result = schematic.validateUniqueBlockAttributes(blocks, 'test.js');

    expect(result.valid).toBe(true);
    expect(result.duplicates).toHaveLength(0);
  });

  it('skips blocks without type (does not treat undefined as a duplicate)', () => {
    const blocks = [
      { name: 'Block with no type A' },
      { name: 'Block with no type B' },
    ];

    const result = schematic.validateUniqueBlockAttributes(blocks, 'test.js');

    // Two undefined `type` values should NOT count as duplicates
    expect(result.valid).toBe(true);
  });

  it('skips blocks without name (does not treat undefined as a duplicate)', () => {
    const blocks = [
      { type: 'text' },
      { type: 'image' },
    ];

    const result = schematic.validateUniqueBlockAttributes(blocks, 'test.js');

    expect(result.valid).toBe(true);
  });

  it('passes on empty or single-block arrays', () => {
    expect(schematic.validateUniqueBlockAttributes([], 'test.js').valid).toBe(true);
    expect(schematic.validateUniqueBlockAttributes([{ type: 'text', name: 'Only' }], 'test.js').valid).toBe(true);
  });

  it('catches duplicates across multiple positions in a larger array', () => {
    const blocks = [
      { type: 'text', name: 'A' },
      { type: 'image', name: 'B' },
      { type: 'video', name: 'C' },
      { type: 'text', name: 'D' },    // duplicate type at position 4
      { type: 'audio', name: 'B' },   // duplicate name at position 5
    ];

    const result = schematic.validateUniqueBlockAttributes(blocks, 'test.js');

    expect(result.valid).toBe(false);
    expect(result.duplicates).toHaveLength(2);
    expect(result.duplicates.find(d => d.kind === 'type')).toMatchObject({
      value: 'text',
      firstPosition: 1,
      duplicatePosition: 4,
    });
    expect(result.duplicates.find(d => d.kind === 'name')).toMatchObject({
      value: 'B',
      firstPosition: 2,
      duplicatePosition: 5,
    });
  });
});
