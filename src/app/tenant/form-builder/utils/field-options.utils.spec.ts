import {
  createOptionId,
  findStaticChoiceLabelById,
  normalizeStaticChoiceOptions,
  normalizeStaticSelectFieldOptions,
  toStaticChoiceOptions,
} from './field-options.utils';
import { evaluatePredicate } from '../../../shared/conditional-logic/conditional-logic.evaluate';

describe('normalizeStaticChoiceOptions', () => {
  it('assigns a unique stable id independent of label', () => {
    const options = normalizeStaticChoiceOptions([
      'Room Maintenance',
      'Equipment Check',
      'Billing Issue',
    ]);

    expect(options.length).toBe(3);
    expect(options.map((option) => option.label)).toEqual([
      'Room Maintenance',
      'Equipment Check',
      'Billing Issue',
    ]);
    options.forEach((option) => {
      expect(String(option.id)).toMatch(/^opt_/);
      expect(option.value).toBe(option.id);
      expect(option.value).not.toBe(option.label);
    });
    const ids = options.map((option) => String(option.id));
    expect(new Set(ids).size).toBe(3);
  });

  it('preserves existing non-index ids across rename-equivalent reloads', () => {
    const original = normalizeStaticChoiceOptions([
      { id: 'opt_stable_a', label: 'Room Maintenance' },
      { id: 'opt_stable_b', label: 'Equipment Check' },
    ]);

    const renamed = normalizeStaticChoiceOptions([
      { id: 'opt_stable_a', label: 'Room Maintenance (Updated)' },
      { id: 'opt_stable_b', label: 'Equipment Check' },
    ]);

    expect(renamed[0].id).toBe('opt_stable_a');
    expect(renamed[0].label).toBe('Room Maintenance (Updated)');
    expect(renamed[0].value).toBe('opt_stable_a');
    expect(renamed[1].id).toBe(original[1].id);
  });

  it('allows duplicate labels with distinct ids', () => {
    const options = normalizeStaticChoiceOptions([
      { id: 'opt_one', label: 'Same' },
      { id: 'opt_two', label: 'Same' },
    ]);

    expect(options[0].label).toBe('Same');
    expect(options[1].label).toBe('Same');
    expect(options[0].id).toBe('opt_one');
    expect(options[1].id).toBe('opt_two');
    expect(options[0].id).not.toBe(options[1].id);
  });

  it('does not reuse ids when regenerating missing ones', () => {
    const first = createOptionId();
    const second = createOptionId();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^opt_/);
  });

  it('preserves ids when reordering', () => {
    const reordered = normalizeStaticChoiceOptions([
      { id: 'opt_b', label: 'B' },
      { id: 'opt_a', label: 'A' },
    ]);

    expect(reordered.map((option) => option.id)).toEqual(['opt_b', 'opt_a']);
    expect(reordered.map((option) => option.label)).toEqual(['B', 'A']);
  });

  it('rejects index-like numeric ids and regenerates stable ones', () => {
    const options = normalizeStaticChoiceOptions([
      { id: 1, label: 'One' },
      { id: 2, label: 'Two' },
    ]);

    expect(String(options[0].id)).toMatch(/^opt_/);
    expect(String(options[1].id)).toMatch(/^opt_/);
    expect(options[0].id).not.toBe(options[1].id);
  });
});

describe('toStaticChoiceOptions / findStaticChoiceLabelById', () => {
  it('serializes to { id, label } without stripping ids', () => {
    const persisted = toStaticChoiceOptions([
      { id: 'opt_a', label: 'Alpha', value: 'opt_a' },
      { id: 'opt_b', label: 'Beta', value: 'opt_b' },
    ]);

    expect(persisted).toEqual([
      { id: 'opt_a', label: 'Alpha' },
      { id: 'opt_b', label: 'Beta' },
    ]);
  });

  it('resolves display labels from option ids', () => {
    const options = [
      { id: 'opt_a', label: 'Alpha' },
      { id: 'opt_b', label: 'Beta' },
    ];

    expect(findStaticChoiceLabelById(options, 'opt_b')).toBe('Beta');
    expect(findStaticChoiceLabelById(options, 'missing')).toBe('missing');
  });
});

describe('normalizeStaticSelectFieldOptions alias', () => {
  it('delegates to normalizeStaticChoiceOptions', () => {
    const options = normalizeStaticSelectFieldOptions([
      { id: 'opt_x', label: 'X' },
    ]);
    expect(options[0].id).toBe('opt_x');
    expect(options[0].value).toBe('opt_x');
  });
});

describe('Static choice conditional logic equals by option id', () => {
  it('matches when FormControl emits the option id stored in the predicate', () => {
    const fieldId = 'static-items';
    const options = normalizeStaticChoiceOptions([
      { id: 'opt_room', label: 'Room Maintenance' },
      { id: 'opt_equip', label: 'Equipment Check' },
      { id: 'opt_bill', label: 'Billing Issue' },
    ]);
    const selected = options[0].id;

    expect(
      evaluatePredicate(
        {
          fieldId,
          operator: 'equals',
          value: 'opt_room',
        },
        { [fieldId]: selected },
      ),
    ).toBeTrue();

    expect(
      evaluatePredicate(
        {
          fieldId,
          operator: 'equals',
          value: 'opt_room',
        },
        { [fieldId]: 'opt_equip' },
      ),
    ).toBeFalse();

    expect(
      evaluatePredicate(
        {
          fieldId,
          operator: 'notEquals',
          value: 'opt_room',
        },
        { [fieldId]: 'opt_equip' },
      ),
    ).toBeTrue();
  });

  it('matches multi-select / checkbox arrays of option ids', () => {
    const fieldId = 'checkbox_field';

    expect(
      evaluatePredicate(
        { fieldId, operator: 'equals', value: 'opt_a' },
        { [fieldId]: ['opt_a', 'opt_b'] },
      ),
    ).toBeTrue();

    expect(
      evaluatePredicate(
        { fieldId, operator: 'equals', value: 'opt_c' },
        { [fieldId]: ['opt_a', 'opt_b'] },
      ),
    ).toBeFalse();

    expect(
      evaluatePredicate(
        { fieldId, operator: 'isEmpty', value: undefined },
        { [fieldId]: [] },
      ),
    ).toBeTrue();

    expect(
      evaluatePredicate(
        { fieldId, operator: 'isNotEmpty', value: undefined },
        { [fieldId]: ['opt_a'] },
      ),
    ).toBeTrue();
  });
});
