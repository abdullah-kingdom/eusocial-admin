import { normalizeStaticSelectFieldOptions } from './field-options.utils';
import { evaluatePredicate } from '../../../shared/conditional-logic/conditional-logic.evaluate';

describe('normalizeStaticSelectFieldOptions', () => {
  it('uses the display label as the option value (no slug)', () => {
    const options = normalizeStaticSelectFieldOptions([
      'Room Maintenance',
      'Equipment Check',
      'Billing Issue',
    ]);

    expect(options.map((option) => option.value)).toEqual([
      'Room Maintenance',
      'Equipment Check',
      'Billing Issue',
    ]);
    expect(options.map((option) => option.label)).toEqual([
      'Room Maintenance',
      'Equipment Check',
      'Billing Issue',
    ]);
  });

  it('preserves label values from object options', () => {
    const options = normalizeStaticSelectFieldOptions([
      { label: 'Room Maintenance', value: 'room_maintenance' },
      { label: 'Yes', value: 'yes' },
    ]);

    expect(options[0]).toEqual(
      jasmine.objectContaining({
        label: 'Room Maintenance',
        value: 'Room Maintenance',
      }),
    );
    expect(options[1]).toEqual(
      jasmine.objectContaining({
        label: 'Yes',
        value: 'Yes',
      }),
    );
  });
});

describe('Static select conditional logic equals', () => {
  it('matches when FormControl emits the same label stored in the predicate', () => {
    const fieldId = 'static-items';
    const options = normalizeStaticSelectFieldOptions([
      'Room Maintenance',
      'Equipment Check',
      'Billing Issue',
    ]);
    const selected = options[0].value;

    expect(
      evaluatePredicate(
        {
          fieldId,
          operator: 'equals',
          value: 'Room Maintenance',
        },
        { [fieldId]: selected },
      ),
    ).toBeTrue();

    expect(
      evaluatePredicate(
        {
          fieldId,
          operator: 'equals',
          value: 'Room Maintenance',
        },
        { [fieldId]: 'Equipment Check' },
      ),
    ).toBeFalse();

    expect(
      evaluatePredicate(
        {
          fieldId,
          operator: 'notEquals',
          value: 'Room Maintenance',
        },
        { [fieldId]: 'Equipment Check' },
      ),
    ).toBeTrue();
  });
});
