import {
  buildDynamicFormPayload,
  createDefaultFrequencyRecurring,
  FormMetaConfig,
  resolveSelectedIds,
} from './dynamic-form.models';

describe('Assign/Report selection identity', () => {
  const users = [
    { id: '101', name: 'John' },
    { id: '205', name: 'John' },
    { id: '300', name: 'Jane' },
  ];

  it('maps only the selected user id when duplicate names exist', () => {
    expect(resolveSelectedIds(['101'], users)).toEqual([101]);
    expect(resolveSelectedIds(['205'], users)).toEqual([205]);
    expect(resolveSelectedIds(['101', '205'], users).sort()).toEqual([101, 205]);
  });

  it('does not expand a display name into all matching users', () => {
    expect(resolveSelectedIds(['John'], users)).toEqual([]);
  });

  it('builds payload users from selected ids only', () => {
    const meta: FormMetaConfig = {
      assignJobPosition: [],
      assignUsers: ['101'],
      assignMode: 'individual',
      reportJobPosition: [],
      reportUsers: ['205'],
      reportMode: 'shared',
      frequencyJobPosition: [],
      frequencyDate: null,
      frequencyTime: null,
      frequencyStartDate: null,
      frequencyEndDate: null,
      frequencyType: 'atOnce',
      frequencyRecurring: createDefaultFrequencyRecurring(),
    };

    const payload = buildDynamicFormPayload('Template', [], meta, { users });
    expect(payload.assign.users).toEqual([101]);
    expect(payload.report.users).toEqual([205]);
  });
});
