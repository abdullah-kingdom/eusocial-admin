import { FormField } from '../../form-builder/models/form-field.model';
import {
  addSetupSection,
  buildDefaultSetupSections,
  duplicateSetupSection,
  flattenSetupSections,
  formatSetupSectionMeta,
  hydrateSetupSections,
  insertFieldIntoSetupRow,
  isSetupSectionDragData,
  removeSetupSection,
  renameSetupSection,
  reorderSetupSections,
  serializeSetupSections,
  type SetupFormSection,
} from './setup-form-layout.utils';

function field(
  partial: Partial<FormField> & Pick<FormField, 'id' | 'type'>,
): FormField {
  return {
    label: partial.label ?? partial.id,
    placeholder: '',
    required: false,
    options: [],
    width: 12,
    ...partial,
  };
}

describe('Setup section management', () => {
  it('adds a named empty section after existing ones', () => {
    const base = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    const next = addSetupSection(base, 'Work');

    expect(next.length).toBe(2);
    expect(next[1].name).toBe('Work');
    expect(next[1].rows.length).toBe(1);
    expect(next[1].rows[0].fields.length).toBe(0);
  });

  it('renames a section without touching fields', () => {
    const base = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    const renamed = renameSetupSection(base, base[0].id, 'Account');

    expect(renamed[0].name).toBe('Account');
    expect(renamed[0].rows[0].fields[0].id).toBe('a');
  });

  it('removes a section and always leaves at least one', () => {
    let sections = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    sections = addSetupSection(sections, 'Contact');
    sections = removeSetupSection(sections, sections[0].id);

    expect(sections.length).toBe(1);
    expect(sections[0].name).toBe('Contact');

    const only = removeSetupSection(sections, sections[0].id);
    expect(only.length).toBe(1);
    expect(only[0].rows[0].fields.length).toBe(0);
  });

  it('duplicates a section with new ids for section, rows, and fields', () => {
    const base = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4, name: 'first' }),
      field({ id: 'b', type: 'email', width: 4, name: 'email' }),
    ]);
    base[0].name = 'Account';
    const next = duplicateSetupSection(base, base[0].id);

    expect(next.length).toBe(2);
    expect(next[1].name).toBe('Account Copy');
    expect(next[1].id).not.toBe(next[0].id);
    expect(next[1].rows[0].id).not.toBe(next[0].rows[0].id);
    expect(next[1].rows[0].fields.map((item) => item.id)).not.toEqual(
      next[0].rows[0].fields.map((item) => item.id),
    );
    expect(next[1].rows[0].fields.map((item) => item.width)).toEqual([4, 4]);
  });

  it('reorders sections', () => {
    let sections = buildDefaultSetupSections([]);
    sections[0].name = 'A';
    sections = addSetupSection(sections, 'B');
    sections = addSetupSection(sections, 'C');
    const reordered = reorderSetupSections(sections, 0, 2);

    expect(reordered.map((section) => section.name)).toEqual(['B', 'C', 'A']);
  });

  it('formats section meta like the builder chrome', () => {
    const sections = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
      field({ id: 'b', type: 'text', width: 4 }),
      field({ id: 'c', type: 'text', width: 4 }),
      field({ id: 'd', type: 'text', width: 4 }),
    ]);
    expect(formatSetupSectionMeta(sections[0], 0)).toBe(
      'SECTION 1 • 2 ROWS • 4 FIELDS',
    );
  });

  it('round-trips multiple named sections including an empty one', () => {
    let sections: SetupFormSection[] = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 12 }),
    ]);
    sections[0].name = 'Account';
    sections = addSetupSection(sections, 'Availability');

    const stored = serializeSetupSections(sections);
    const flat = flattenSetupSections(sections);
    const reloaded = hydrateSetupSections(flat, stored);

    expect(reloaded.length).toBe(2);
    expect(reloaded[0].name).toBe('Account');
    expect(reloaded[1].name).toBe('Availability');
    expect(reloaded[0].rows[0].fields.map((item) => item.id)).toEqual(['a']);
    expect(reloaded[1].rows[0].fields.length).toBe(0);
  });

  it('inserts into an empty second-section row without orphaning the field', () => {
    let sections = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    sections = addSetupSection(sections, 'Work');
    const emptyRowId = sections[1].rows[0].id;

    const next = insertFieldIntoSetupRow(
      sections,
      sections[1].id,
      emptyRowId,
      field({ id: 'b', type: 'email', width: 4 }),
    );

    expect(next[0].rows[0].fields.map((item) => item.id)).toEqual(['a']);
    expect(next[1].rows.length).toBe(1);
    expect(next[1].rows[0].id).toBe(emptyRowId);
    expect(next[1].rows[0].fields.map((item) => item.id)).toEqual(['b']);
  });

  it('inserts into an empty third-section row the same way', () => {
    let sections = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    sections = addSetupSection(sections, 'Work');
    sections = addSetupSection(sections, 'Contact');
    const targetId = sections[2].id;
    const emptyRowId = sections[2].rows[0].id;

    const next = insertFieldIntoSetupRow(
      sections,
      targetId,
      emptyRowId,
      field({ id: 'c', type: 'number', width: 6 }),
    );

    expect(next[2].rows[0].fields.map((item) => item.id)).toEqual(['c']);
    expect(flattenSetupSections(next).map((item) => item.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('rejects field/palette drag data from the section reorder list', () => {
    const section = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ])[0];

    expect(isSetupSectionDragData(section)).toBe(true);
    expect(
      isSetupSectionDragData(field({ id: 'a', type: 'text', width: 4 })),
    ).toBe(false);
    expect(
      isSetupSectionDragData({ type: 'text', label: 'Text Field' }),
    ).toBe(false);
    expect(isSetupSectionDragData(null)).toBe(false);
  });

  it('inserts fields into the targeted section, not always the first', () => {
    let sections = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    sections[0].name = 'Account';
    sections = addSetupSection(sections, 'Work');
    sections = addSetupSection(sections, 'Contact');

    sections[1].rows[0].fields.push(field({ id: 'b', type: 'email', width: 4 }));
    sections[2].rows[0].fields.push(field({ id: 'c', type: 'number', width: 6 }));

    const stored = serializeSetupSections(sections);
    const reloaded = hydrateSetupSections(flattenSetupSections(sections), stored);

    expect(reloaded[0].rows[0].fields.map((item) => item.id)).toEqual(['a']);
    expect(reloaded[1].rows[0].fields.map((item) => item.id)).toEqual(['b']);
    expect(reloaded[2].rows[0].fields.map((item) => item.id)).toEqual(['c']);
    expect(reloaded.map((section) => section.name)).toEqual([
      'Account',
      'Work',
      'Contact',
    ]);
  });

  it('preserves multi-section layout on save/load with half and third widths', () => {
    const saved: SetupFormSection[] = [
      {
        id: 'section-1',
        name: 'Account',
        rows: [
          {
            id: 'row-1',
            fields: [
              field({ id: 'first', type: 'text', width: 6 }),
              field({ id: 'last', type: 'text', width: 6 }),
            ],
          },
        ],
      },
      {
        id: 'section-2',
        name: 'Work',
        rows: [
          {
            id: 'row-2',
            fields: [
              field({ id: 'role', type: 'select', width: 4 }),
              field({ id: 'job', type: 'select', width: 4 }),
              field({ id: 'loc', type: 'select', width: 4 }),
            ],
          },
        ],
      },
    ];

    const reloaded = hydrateSetupSections(
      flattenSetupSections(saved),
      serializeSetupSections(saved),
    );

    expect(reloaded.map((section) => section.name)).toEqual(['Account', 'Work']);
    expect(reloaded[0].rows[0].fields.map((item) => item.width)).toEqual([6, 6]);
    expect(reloaded[1].rows[0].fields.map((item) => item.width)).toEqual([
      4, 4, 4,
    ]);
  });
});
