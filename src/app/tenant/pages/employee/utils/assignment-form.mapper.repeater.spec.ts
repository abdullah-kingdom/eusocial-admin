import { mapAssignmentSectionsToBuilder } from './assignment-form.mapper';
import { FormSection } from '../../extra-management/forms/models/dynamic-form.models';

describe('assignment-form.mapper repeater hydration', () => {
  const sectionWithRepeater = (): FormSection[] => [
    {
      id: 'sec_1',
      name: 'Section 1',
      type: 'custom',
      rows: [
        {
          id: 'row_1',
          fields: [
            {
              id: 'fld_items',
              name: 'items',
              type: 'select',
              selectionType: 'multi',
              label: 'Items',
              required: false,
              options: [
                { id: 'apple-id', label: 'Apple' },
                { id: 'banana-id', label: 'Banana' },
              ],
            },
            {
              id: 'fld_qty',
              name: 'quantity',
              type: 'number',
              label: 'Quantity',
              required: false,
              defaultValue: 1,
              repeaterConfig: { enabled: true, sourceFieldId: 'fld_items' },
            },
            {
              id: 'fld_notes',
              name: 'notes',
              type: 'text',
              label: 'Notes',
              required: false,
              defaultValue: 'hello',
            },
          ],
        },
      ],
    },
  ];

  it('keeps repeater static default scalar while restoring the answer map on value', () => {
    const answers = {
      fld_qty: { 'apple-id': 10, 'banana-id': 5 },
      fld_notes: 'saved note',
    };

    const [section] = mapAssignmentSectionsToBuilder(sectionWithRepeater(), {}, answers);
    const qty = section.builderFields.find((field) => field.id === 'fld_qty');
    const notes = section.builderFields.find((field) => field.id === 'fld_notes');

    expect(qty?.value).toEqual({ 'apple-id': 10, 'banana-id': 5 });
    expect(qty?.defaultValue).toBe(1);
    expect(notes?.value).toBe('saved note');
    expect(notes?.defaultValue).toBe('saved note');
  });

  it('leaves repeater schema default untouched when there is no answer', () => {
    const [section] = mapAssignmentSectionsToBuilder(sectionWithRepeater(), {}, {});
    const qty = section.builderFields.find((field) => field.id === 'fld_qty');

    expect(qty?.defaultValue).toBe(1);
  });
});
