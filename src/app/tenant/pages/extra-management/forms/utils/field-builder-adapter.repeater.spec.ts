import { FormField } from '../../../../form-builder/models/form-field.model';
import { stripFieldId } from '../models/dynamic-form.models';
import {
  mapBuilderFieldToConfig,
  mapConfigFieldToBuilder,
} from './field-builder-adapter.utils';

describe('field-builder-adapter repeaterConfig persistence', () => {
  const builderField: FormField = {
    id: 'fld_qty',
    type: 'number',
    label: 'Quantity',
    placeholder: 'Enter number',
    required: false,
    options: [],
    allowDecimal: false,
    repeaterConfig: {
      enabled: true,
      sourceFieldId: 'fld_items',
    },
  };

  it('survives builder → config → builder round-trip', () => {
    const config = mapBuilderFieldToConfig(builderField, { preserveId: true });
    expect(config.repeaterConfig).toEqual({
      enabled: true,
      sourceFieldId: 'fld_items',
    });

    const back = mapConfigFieldToBuilder(config);
    expect(back.repeaterConfig).toEqual({
      enabled: true,
      sourceFieldId: 'fld_items',
    });
  });

  it('stripFieldId preserves a valid repeaterConfig', () => {
    const config = mapBuilderFieldToConfig(builderField, { preserveId: true });
    const stripped = stripFieldId(config);
    expect(stripped.repeaterConfig).toEqual({
      enabled: true,
      sourceFieldId: 'fld_items',
    });
  });

  it('stripFieldId omits disabled / empty repeaterConfig', () => {
    const config = mapBuilderFieldToConfig(
      {
        ...builderField,
        repeaterConfig: { enabled: false, sourceFieldId: 'fld_items' },
      },
      { preserveId: true },
    );
    // Adapter normalizes disabled configs to null before strip.
    expect(config.repeaterConfig).toBeNull();
    const stripped = stripFieldId({
      ...config,
      repeaterConfig: { enabled: false, sourceFieldId: 'fld_items' },
    });
    expect(stripped.repeaterConfig).toBeUndefined();
  });

  it('templates without repeaterConfig remain unchanged', () => {
    const plain: FormField = {
      id: 'fld_text',
      type: 'text',
      label: 'Name',
      placeholder: '',
      required: false,
      options: [],
      characterLimit: 255,
    };
    const config = mapBuilderFieldToConfig(plain, { preserveId: true });
    expect(config.repeaterConfig).toBeNull();
    const stripped = stripFieldId(config);
    expect(stripped.repeaterConfig).toBeUndefined();
    expect(mapConfigFieldToBuilder(config).repeaterConfig).toBeNull();
  });
});
