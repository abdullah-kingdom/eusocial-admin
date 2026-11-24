import {
  extractSelectedSourceIds,
  formatRepeaterInstanceLabel,
  isEligibleRepeaterSourceField,
  isRepeaterAnswerMap,
  isRepeaterEnabled,
  isRepeaterTargetFieldType,
  isRuntimeRepeaterField,
  listEligibleRepeaterSourceFields,
  normalizeRepeaterAnswerMap,
  normalizeRepeaterConfig,
  resolveRepeaterSourceFieldLabel,
  resolveRepeaterSourceItemLabel,
  schemaHasEnabledRepeater,
  UNAVAILABLE_REPEATER_ITEM_LABEL,
  validateRepeaterConfigDraft,
  wouldCreateRepeaterCycle,
} from './repeater-field.utils';

describe('repeater-field.utils', () => {
  describe('isRepeaterTargetFieldType', () => {
    it('accepts eligible v1 target types', () => {
      expect(isRepeaterTargetFieldType('text')).toBe(true);
      expect(isRepeaterTargetFieldType('textarea')).toBe(true);
      expect(isRepeaterTargetFieldType('number')).toBe(true);
      expect(isRepeaterTargetFieldType('email')).toBe(true);
      expect(isRepeaterTargetFieldType('date')).toBe(true);
      expect(isRepeaterTargetFieldType('time')).toBe(true);
    });

    it('rejects ineligible target types', () => {
      expect(isRepeaterTargetFieldType('select')).toBe(false);
      expect(isRepeaterTargetFieldType('checkbox')).toBe(false);
      expect(isRepeaterTargetFieldType('radio')).toBe(false);
      expect(isRepeaterTargetFieldType('rating')).toBe(false);
      expect(isRepeaterTargetFieldType('range')).toBe(false);
      expect(isRepeaterTargetFieldType('price')).toBe(false);
      expect(isRepeaterTargetFieldType('image')).toBe(false);
      expect(isRepeaterTargetFieldType('signature')).toBe(false);
      expect(isRepeaterTargetFieldType('file')).toBe(false);
      expect(isRepeaterTargetFieldType('password')).toBe(false);
    });
  });

  describe('normalizeRepeaterConfig', () => {
    it('returns null for disabled or incomplete configs', () => {
      expect(normalizeRepeaterConfig(null)).toBeNull();
      expect(normalizeRepeaterConfig({ enabled: false, sourceFieldId: 'a' })).toBeNull();
      expect(normalizeRepeaterConfig({ enabled: true, sourceFieldId: '' })).toBeNull();
      expect(normalizeRepeaterConfig({ enabled: true })).toBeNull();
    });

    it('normalizes a valid enabled config', () => {
      expect(
        normalizeRepeaterConfig({ enabled: true, sourceFieldId: ' fld_items ' }),
      ).toEqual({ enabled: true, sourceFieldId: 'fld_items' });
    });
  });

  describe('isEligibleRepeaterSourceField', () => {
    it('accepts static multi-select sources', () => {
      expect(
        isEligibleRepeaterSourceField({
          id: 'fld_items',
          type: 'select',
          selectionType: 'multi',
          options: [
            { id: 'opt_a', label: 'Apple', value: 'opt_a' },
            { id: 'opt_b', label: 'Banana', value: 'opt_b' },
          ],
        }),
      ).toBe(true);
    });

    it('accepts dynamic multi-select sources', () => {
      expect(
        isEligibleRepeaterSourceField({
          id: 'fld_dyn',
          type: 'select',
          selectionType: 'multi',
          optionSource: { type: 'dynamic' },
          options: [1, 2],
        }),
      ).toBe(true);
    });

    it('accepts multi-option checkbox sources', () => {
      expect(
        isEligibleRepeaterSourceField({
          id: 'fld_checks',
          type: 'checkbox',
          options: [
            { id: 'opt_1', label: 'One', value: 'opt_1' },
            { id: 'opt_2', label: 'Two', value: 'opt_2' },
          ],
        }),
      ).toBe(true);
    });

    it('rejects single-select and unsupported sources', () => {
      expect(
        isEligibleRepeaterSourceField({
          id: 'fld_single',
          type: 'select',
          selectionType: 'single',
          options: [{ id: 'opt_a', label: 'Apple', value: 'opt_a' }],
        }),
      ).toBe(false);
      expect(
        isEligibleRepeaterSourceField({
          id: 'fld_radio',
          type: 'radio',
          options: [
            { id: 'opt_a', label: 'A', value: 'opt_a' },
            { id: 'opt_b', label: 'B', value: 'opt_b' },
          ],
        }),
      ).toBe(false);
      expect(
        isEligibleRepeaterSourceField({
          id: 'fld_bool',
          type: 'checkbox',
          options: [{ id: 'opt_yes', label: 'Yes', value: 'opt_yes' }],
        }),
      ).toBe(false);
      expect(
        isEligibleRepeaterSourceField({
          id: 'fld_number',
          type: 'number',
        }),
      ).toBe(false);
    });

    it('rejects another repeater-enabled field as a source', () => {
      expect(
        isEligibleRepeaterSourceField({
          id: 'fld_items',
          type: 'select',
          selectionType: 'multi',
          options: [
            { id: 'opt_a', label: 'Apple', value: 'opt_a' },
            { id: 'opt_b', label: 'Banana', value: 'opt_b' },
          ],
          repeaterConfig: { enabled: true, sourceFieldId: 'fld_other' },
        }),
      ).toBe(false);
    });
  });

  describe('listEligibleRepeaterSourceFields / cycles', () => {
    const schema = [
      {
        id: 'fld_items',
        type: 'select',
        label: 'Select Items',
        selectionType: 'multi',
        options: [
          { id: 'opt_a', label: 'Apple', value: 'opt_a' },
          { id: 'opt_b', label: 'Banana', value: 'opt_b' },
        ],
      },
      {
        id: 'fld_qty',
        type: 'number',
        label: 'Quantity',
      },
      {
        id: 'fld_notes',
        type: 'text',
        label: 'Notes',
        repeaterConfig: { enabled: true, sourceFieldId: 'fld_items' },
      },
      {
        id: 'fld_single',
        type: 'select',
        label: 'Single',
        selectionType: 'single',
        options: [{ id: 'opt_x', label: 'X', value: 'opt_x' }],
      },
    ];

    it('lists compatible sources and excludes self / repeaters / singles', () => {
      const sources = listEligibleRepeaterSourceFields(schema, 'fld_qty');
      expect(sources.map((field) => field.id)).toEqual(['fld_items']);
    });

    it('detects self-reference as a cycle', () => {
      expect(wouldCreateRepeaterCycle('fld_qty', 'fld_qty', schema)).toBe(true);
    });

    it('validateRepeaterConfigDraft rejects self-reference and missing source', () => {
      expect(
        validateRepeaterConfigDraft(
          { enabled: true, sourceFieldId: '' },
          schema,
          'fld_qty',
        ),
      ).toContain('Select a source field');
      expect(
        validateRepeaterConfigDraft(
          { enabled: true, sourceFieldId: 'fld_qty' },
          schema,
          'fld_qty',
        ),
      ).toContain('itself');
      expect(
        validateRepeaterConfigDraft(
          { enabled: false, sourceFieldId: '' },
          schema,
          'fld_qty',
        ),
      ).toBeNull();
    });

    it('resolves source labels for summaries', () => {
      expect(resolveRepeaterSourceFieldLabel(schema, 'fld_items')).toBe('Select Items');
      expect(isRepeaterEnabled(schema[2])).toBe(true);
    });
  });

  describe('runtime answer map + labels', () => {
    it('detects ID-keyed maps and rejects scalars/arrays', () => {
      expect(isRepeaterAnswerMap({ 'opt_a': 10 })).toBe(true);
      expect(isRepeaterAnswerMap({})).toBe(true);
      expect(isRepeaterAnswerMap([1, 2])).toBe(false);
      expect(isRepeaterAnswerMap('x')).toBe(false);
      expect(isRepeaterAnswerMap({ from: 1, to: 2 })).toBe(false);
      expect(isRepeaterAnswerMap({ value: 1, unit: 'kg' })).toBe(false);
    });

    it('normalizes answer maps by stable string ids', () => {
      expect(
        normalizeRepeaterAnswerMap({ ' apple-id ': 10, '': 1, banana: 5 }),
      ).toEqual({ 'apple-id': 10, banana: 5 });
    });

    it('extracts selected source ids without using indexes as identity', () => {
      expect(extractSelectedSourceIds(['opt_a', 'opt_b', 'opt_a'])).toEqual([
        'opt_a',
        'opt_b',
      ]);
      expect(extractSelectedSourceIds([])).toEqual([]);
      expect(extractSelectedSourceIds(null)).toEqual([]);
    });

    it('formats instance labels and falls back when option labels are missing', () => {
      expect(formatRepeaterInstanceLabel('Apple', 'Quantity')).toBe('Apple Quantity');
      expect(resolveRepeaterSourceItemLabel('opt_a', [
        { id: 'opt_a', label: 'Apple', value: 'opt_a' },
      ])).toBe('Apple');
      expect(resolveRepeaterSourceItemLabel('missing', [])).toBe(
        UNAVAILABLE_REPEATER_ITEM_LABEL,
      );
      expect(
        isRuntimeRepeaterField({
          type: 'number',
          repeaterConfig: { enabled: true, sourceFieldId: 'fld_items' },
        }),
      ).toBe(true);
      expect(
        isRuntimeRepeaterField({
          type: 'select',
          repeaterConfig: { enabled: true, sourceFieldId: 'fld_items' },
        }),
      ).toBe(false);
    });

    it('detects schemas that contain an enabled repeater', () => {
      expect(
        schemaHasEnabledRepeater([
          { id: 'a', type: 'text' },
          {
            id: 'b',
            type: 'number',
            repeaterConfig: { enabled: true, sourceFieldId: 'a' },
          },
        ]),
      ).toBe(true);
      expect(schemaHasEnabledRepeater([{ id: 'a', type: 'text' }])).toBe(false);
    });
  });
});
