import { FormField } from '../models/form-field.model';
import { sanitizeField } from './form-field.factory';
import { updateFormField } from './form-field-operations';

describe('sanitizeField / updateFormField repeaterConfig restore', () => {
  const emailRepeater: FormField = {
    id: 'fld_email',
    type: 'email',
    fieldTypeName: 'Email',
    label: 'Email',
    placeholder: 'Enter Email',
    required: false,
    options: [],
    repeaterConfig: {
      enabled: true,
      sourceFieldId: 'fld_select_user',
    },
  };

  const sourceSelect: FormField = {
    id: 'fld_select_user',
    type: 'select',
    fieldTypeName: 'Select',
    label: 'Select User',
    placeholder: '',
    required: false,
    options: [
      { id: 'u1', label: 'Ada', value: 'u1' },
      { id: 'u2', label: 'Bob', value: 'u2' },
    ],
    selectionType: 'multi',
  };

  it('sanitizeField preserves an enabled repeaterConfig sourceFieldId', () => {
    const sanitized = sanitizeField({
      ...emailRepeater,
    } as FormField & Record<string, unknown>);
    expect(sanitized.repeaterConfig).toEqual({
      enabled: true,
      sourceFieldId: 'fld_select_user',
    });
  });

  it('updateFormField keeps repeaterConfig so settings can restore Source Field', () => {
    const schema = [sourceSelect, emailRepeater];
    const next = updateFormField(
      {
        ...emailRepeater,
        label: 'Work Email',
        repeaterConfig: {
          enabled: true,
          sourceFieldId: 'fld_select_user',
        },
      },
      schema,
    );

    const updated = next.find((field) => field.id === 'fld_email');
    expect(updated?.repeaterConfig).toEqual({
      enabled: true,
      sourceFieldId: 'fld_select_user',
    });
  });

  it('sanitizeField normalizes disabled / empty repeaterConfig to null', () => {
    expect(
      sanitizeField({
        ...emailRepeater,
        repeaterConfig: { enabled: false, sourceFieldId: 'fld_select_user' },
      } as FormField & Record<string, unknown>).repeaterConfig,
    ).toBeNull();

    expect(
      sanitizeField({
        ...emailRepeater,
        repeaterConfig: { enabled: true, sourceFieldId: '' },
      } as FormField & Record<string, unknown>).repeaterConfig,
    ).toBeNull();

    expect(
      sanitizeField({
        ...emailRepeater,
        repeaterConfig: undefined,
      } as FormField & Record<string, unknown>).repeaterConfig,
    ).toBeNull();
  });
});
