const { Schematic } = require('../../src/schematic');

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
