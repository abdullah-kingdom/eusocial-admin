import { FormField } from '../../form-builder/models/form-field.model';
import { createFieldFromTemplate } from '../../form-builder/utils/form-field.factory';
import {
  buildDefaultSetupSections,
  defaultSetupNewFieldWidth,
  flattenSetupSections,
  hydrateSetupSections,
  insertDuplicatedSetupField,
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

describe('Setup User / Item / Vendor new field width', () => {
  it('defaults a new field to one-third on an empty or open row', () => {
    expect(defaultSetupNewFieldWidth()).toBe(4);
    expect(defaultSetupNewFieldWidth(12)).toBe(4);
    expect(defaultSetupNewFieldWidth(8)).toBe(4);
    expect(defaultSetupNewFieldWidth(4)).toBe(4);
  });

  it('uses the same default for every field type', () => {
    const types: FormField['type'][] = [
      'text',
      'email',
      'number',
      'textarea',
      'select',
      'date',
      'time',
      'range',
      'image',
      'signature',
    ];

    types.forEach((type) => {
      const created = {
        ...createFieldFromTemplate({
          type,
          label: type,
          placeholder: '',
          required: false,
          options: [],
        }),
        width: defaultSetupNewFieldWidth(),
      };
      expect(created.width).toBe(4);
    });
  });

  it('leaves the shared field factory default unchanged', () => {
    const created = createFieldFromTemplate({
      type: 'text',
      label: 'Text Field',
      placeholder: '',
      required: false,
      options: [],
    });
    expect(created.width).toBe(12);
  });

  it('packs three one-third fields on one row and wraps the fourth', () => {
    const sections = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
      field({ id: 'b', type: 'email', width: 4 }),
      field({ id: 'c', type: 'number', width: 4 }),
      field({ id: 'd', type: 'textarea', width: 4 }),
    ]);

    expect(sections[0].rows.length).toBe(2);
    expect(sections[0].rows[0].fields.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(sections[0].rows[1].fields.map((item) => item.id)).toEqual(['d']);
    sections[0].rows.flatMap((row) => row.fields).forEach((item) => {
      expect(item.width).toBe(4);
    });
  });

  it('keeps saved widths when a form is reloaded', () => {
    const saved: SetupFormSection[] = [
      {
        id: 'section-1',
        name: '',
        rows: [
          { id: 'row-1', fields: [field({ id: 'full', type: 'text', width: 12 })] },
          { id: 'row-2', fields: [field({ id: 'half', type: 'email', width: 6 })] },
          { id: 'row-3', fields: [field({ id: 'third', type: 'date', width: 4 })] },
        ],
      },
    ];
    const stored = serializeSetupSections(saved);
    const flat = flattenSetupSections(saved);
    const reloaded = hydrateSetupSections(flat, stored);

    const widths = new Map(
      reloaded.flatMap((section) =>
        section.rows.flatMap((row) =>
          row.fields.map((item) => [item.id, item.width] as const),
        ),
      ),
    );
    expect(widths.get('full')).toBe(12);
    expect(widths.get('half')).toBe(6);
    expect(widths.get('third')).toBe(4);
    expect(reloaded[0].rows.map((row) => row.fields.map((item) => item.id))).toEqual([
      ['full'],
      ['half'],
      ['third'],
    ]);
  });

  it('copies a field width and wraps the duplicate when the row is full', () => {
    const sections = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
      field({ id: 'b', type: 'text', width: 4 }),
      field({ id: 'c', type: 'text', width: 4 }),
    ]);
    const duplicate = field({ id: 'a-copy', type: 'text', width: 4, label: 'A Copy' });
    const placed = insertDuplicatedSetupField(sections, 'c', duplicate);

    expect(placed[0].rows.length).toBe(2);
    expect(placed[0].rows[0].fields.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(placed[0].rows[1].fields.map((item) => item.id)).toEqual(['a-copy']);
    expect(placed[0].rows[1].fields[0].width).toBe(4);
  });

  it('keeps a manually widened field at that width when duplicated', () => {
    const sections = buildDefaultSetupSections([
      field({ id: 'wide', type: 'range', width: 12 }),
    ]);
    const duplicate = field({
      id: 'wide-copy',
      type: 'range',
      width: 12,
      label: 'Wide Copy',
    });
    const placed = insertDuplicatedSetupField(sections, 'wide', duplicate);

    expect(placed[0].rows.length).toBe(2);
    expect(placed[0].rows[0].fields[0].width).toBe(12);
    expect(placed[0].rows[1].fields[0].width).toBe(12);
  });

  it('places a one-third duplicate on the same row while space remains', () => {
    const sections = buildDefaultSetupSections([
      field({ id: 'a', type: 'time', width: 4 }),
    ]);
    const duplicate = field({ id: 'a-copy', type: 'time', width: 4 });
    const placed = insertDuplicatedSetupField(sections, 'a', duplicate);

    expect(placed[0].rows.length).toBe(1);
    expect(placed[0].rows[0].fields.map((item) => item.width)).toEqual([4, 4]);
  });
});
