import { formatConditionOptionDisplay } from './condition-option-label';

const available = {
  id: 'opt_45093a7617c54f87bf87aa3b20a7d97f',
  label: 'Available',
  value: 'opt_45093a7617c54f87bf87aa3b20a7d97f',
};
const busy = {
  id: 'opt_c8644cfa706048cdb03f46c4024885ac',
  label: 'Busy',
  value: 'opt_c8644cfa706048cdb03f46c4024885ac',
};

describe('formatConditionOptionDisplay', () => {
  it('shows the option label for select, radio, and checkbox ids', () => {
    const types = ['select', 'radio', 'checkbox'] as const;
    types.forEach((type) => {
      expect(
        formatConditionOptionDisplay(
          { type, options: [available, busy] },
          available.id,
        ),
      ).toBe('Available');
    });
  });

  it('resolves a saved rule after options are reloaded', () => {
    const reloaded = [
      { ...busy },
      { ...available },
    ];
    expect(
      formatConditionOptionDisplay({ type: 'radio', options: reloaded }, available.value),
    ).toBe('Available');
  });

  it('joins labels when several option ids are stored', () => {
    expect(
      formatConditionOptionDisplay(
        { type: 'checkbox', options: [available, busy] },
        [available.id, busy.id],
      ),
    ).toBe('Available, Busy');
  });

  it('resolves a dynamic select value to its label', () => {
    expect(
      formatConditionOptionDisplay(
        {
          type: 'select',
          options: [{ id: 8, label: 'Safety gloves', value: 8 }],
        },
        8,
      ),
    ).toBe('Safety gloves');
  });

  it('keeps an unresolved id visible', () => {
    expect(
      formatConditionOptionDisplay(
        { type: 'select', options: [available] },
        'opt_missing',
      ),
    ).toBe('opt_missing');
  });

  it('leaves non-choice comparison values unchanged', () => {
    expect(
      formatConditionOptionDisplay({ type: 'number', options: [] }, 8),
    ).toBe('8');
    expect(
      formatConditionOptionDisplay({ type: 'text', options: [] }, 'morning'),
    ).toBe('morning');
  });

  it('does not change the stored option objects', () => {
    const options = [{ ...available }];
    formatConditionOptionDisplay({ type: 'select', options }, available.id);
    expect(options[0]).toEqual(available);
  });
});
