import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  DynamicField,
  DynamicFieldOption,
  DynamicFormValue,
} from '../../interfaces/dynamic-field';
import {
  getFieldCharacterLimit,
} from './character-limit.utils';
import { allowsDecimalPoint, integerNumberValidator } from './number-field.utils';
import { emailFieldPatternValidator } from './email-field.utils';
import {
  createEmptyRangeValue,
  normalizeRangeType,
  normalizeRangeValue,
  rangeFieldValidator,
} from './range-field.utils';
import {
  dateFieldValidator,
  normalizeDateFieldValue,
} from './date-field.utils';
import {
  filterAnswerImages,
  imageFieldValidator,
} from '../../tenant/form-builder/utils/image-field.utils';
import {
  normalizeMaxRating,
  normalizeRatingValue,
} from './rating-field.utils';
import {
  normalizeSignatureValue,
  signatureFieldValidator,
} from './signature-field.utils';
import {
  normalizeTimeFieldFormat,
  normalizeTimeFieldValue,
  timeFieldValidator,
} from './time-field.utils';
import {
  measurementFieldValidator,
  normalizeMeasurementValue,
} from './measurement-field.utils';
import {
  getDefaultUnitCode,
  isMeasurementFieldType,
  normalizeMeasurementUnitCode,
  normalizeMeasurementUnitMode,
} from './measurement-units';
import {
  isRepeaterAnswerMap,
  isRuntimeRepeaterField,
  normalizeRepeaterAnswerMap,
} from '../../tenant/form-builder/utils/repeater-field.utils';
import { isDynamicDefaultValueSource } from '../conditional-logic';

export function sortDynamicFields(fields: DynamicField[]): DynamicField[] {
  return [...fields]
    .map((field, index) => ({ field, index }))
    .sort(
      (a, b) =>
        (a.field.order ?? a.index) - (b.field.order ?? b.index) || a.index - b.index,
    )
    .map(({ field }) => field);
}

export function serializeDynamicFieldsSchema(fields: DynamicField[]): string {
  if (!fields?.length) {
    return '';
  }

  return sortDynamicFields(fields)
    .map(
      (field) =>
        `${field.id}:${field.name}:${field.type}:${Number(!!field.required)}:${field.selectionType || 'single'}:${Number(field.isShow !== false)}:${Number(!!field.isReadonly)}:${Number(allowsDecimalPoint(field))}:${getFieldCharacterLimit(field) ?? ''}:${field.type === 'range' ? normalizeRangeType(field.rangeType) : ''}:${field.type === 'date' ? `${field.minDate ?? ''}:${field.maxDate ?? ''}` : ''}:${field.type === 'image' ? `${Number(!!field.multiple)}:${field.minFiles ?? ''}:${field.maxFiles ?? ''}:${(field.referenceImages || []).length}` : ''}:${field.type === 'rating' ? normalizeMaxRating(field.maxRating) : ''}:${field.type === 'time' ? normalizeTimeFieldFormat(field.timeFormat) : ''}:${isMeasurementFieldType(field.type) ? `${normalizeMeasurementUnitMode(field.unitMode)}:${normalizeMeasurementUnitCode(field.type, field.unit) ?? getDefaultUnitCode(field.type)}:${field.minValue ?? 0}:${field.maxValue ?? ''}` : ''}:${JSON.stringify(field.condition ?? null)}`,
    )
    .join('|');
}

export function remapDynamicFormValuesByFieldId(
  values: DynamicFormValue,
  previousFields: DynamicField[],
  nextFields: DynamicField[],
): DynamicFormValue {
  const remapped: DynamicFormValue = {};
  const previousById = new Map(previousFields.map((field) => [field.id, field]));

  for (const field of nextFields) {
    const previous = previousById.get(field.id);

    if (previous && Object.prototype.hasOwnProperty.call(values, previous.name)) {
      remapped[field.name] = values[previous.name];
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(values, field.name)) {
      remapped[field.name] = values[field.name];
    }
  }

  return remapped;
}

export function getOptionValue(
  option: string | number | DynamicFieldOption & { id?: string | number },
  index = 0,
): string | number {
  if (typeof option === 'string' || typeof option === 'number') {
    return option;
  }

  // Prefer stable option id when present (static select/radio/checkbox).
  if (option.id != null && String(option.id).trim() !== '') {
    return option.id;
  }

  return option.value ?? index;
}

export function getInitialFieldValue(field: DynamicField): unknown {
  switch (field.type) {
    case 'radio': {
      if (
        field.defaultValue !== undefined &&
        field.defaultValue !== null &&
        field.defaultValue !== ''
      ) {
        return field.defaultValue;
      }

      if (field.value !== undefined && field.value !== null && field.value !== '') {
        return field.value;
      }

      const firstOption = field.options?.[0];
      return firstOption !== undefined ? getOptionValue(firstOption, 0) : '';
    }
    case 'checkbox':
      if (Array.isArray(field.defaultValue)) {
        return [...field.defaultValue];
      }
      if (Array.isArray(field.value)) {
        return [...field.value];
      }
      return [];
    case 'select': {
      if (isMultiSelectField(field)) {
        if (Array.isArray(field.defaultValue)) {
          return [...field.defaultValue];
        }
        if (Array.isArray(field.value)) {
          return [...field.value];
        }
        return [];
      }
      return field.defaultValue ?? field.value ?? '';
    }
    case 'number':
      return field.defaultValue ?? field.value ?? null;
    case 'rating':
      return normalizeRatingValue(
        field.defaultValue ?? field.value,
        normalizeMaxRating(field.maxRating),
      );
    case 'range':
      return normalizeRangeValue(field.defaultValue ?? field.value ?? createEmptyRangeValue());
    case 'image':
      return filterAnswerImages(field.defaultValue ?? field.value);
    case 'signature':
      return normalizeSignatureValue(field.defaultValue ?? field.value);
    case 'time':
      return normalizeTimeFieldValue(field.defaultValue ?? field.value);
    case 'date':
      return normalizeDateFieldValue(field.defaultValue ?? field.value) ?? '';
    case 'price':
    case 'length':
    case 'mass':
    case 'volume':
    case 'temperature':
      return normalizeMeasurementValue(field.defaultValue ?? field.value, field.type, {
        unitMode: normalizeMeasurementUnitMode(field.unitMode),
        unit: field.unit,
      });
    default:
      return field.defaultValue ?? field.value ?? '';
  }
}

export function isMultiSelectField(field: DynamicField): boolean {
  return field.type === 'select' && field.selectionType === 'multi';
}

export function getFieldValidators(
  field: DynamicField,
  options?: { required?: boolean; visible?: boolean }
) {
  const validators = [];
  const required = options?.required ?? !!field.required;
  const visible = options?.visible ?? true;

  if (field.type === 'range') {
    validators.push(rangeFieldValidator(field, { required, visible }));
    return validators;
  }

  if (field.type === 'image') {
    validators.push(imageFieldValidator(field, { required, visible }));
    return validators;
  }

  if (field.type === 'signature') {
    validators.push(signatureFieldValidator(field, { required, visible }));
    return validators;
  }

  if (field.type === 'time') {
    validators.push(timeFieldValidator(field, { required, visible }));
    return validators;
  }

  if (field.type === 'date') {
    validators.push(dateFieldValidator(field, { required, visible }));
    return validators;
  }

  if (isMeasurementFieldType(field.type)) {
    validators.push(measurementFieldValidator(field, { required, visible }));
    return validators;
  }

  if (visible && required && field.type !== 'checkbox') {
    validators.push(Validators.required);
  }

  if (field.type === 'email') {
    validators.push(emailFieldPatternValidator);
  }

  if (field.type === 'number' && !allowsDecimalPoint(field)) {
    validators.push(integerNumberValidator());
  }

  if (field.type === 'rating') {
    const max = normalizeMaxRating(field.maxRating);
    validators.push(Validators.min(1), Validators.max(max));
  }

  const characterLimit = getFieldCharacterLimit(field);
  if (characterLimit != null) {
    validators.push(Validators.maxLength(characterLimit));
  }

  return validators;
}

/**
 * Parent-level required rule: a required repeater with zero selected source
 * items is invalid. Per-item emptiness is enforced by child validators.
 */
export function repeaterRequiredSelectionValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!(control instanceof FormGroup)) {
      return null;
    }
    return Object.keys(control.controls).length === 0
      ? { repeaterRequiredSelection: true }
      : null;
  };
}

export function getRepeaterGroupValidators(options?: {
  required?: boolean;
  visible?: boolean;
}): ValidatorFn[] {
  const required = options?.required ?? false;
  const visible = options?.visible ?? true;
  if (visible && required) {
    return [repeaterRequiredSelectionValidator()];
  }
  return [];
}

/** Empty child seed by target type when no static default applies. */
export function getEmptyRepeaterChildValue(field: DynamicField): unknown {
  switch (field.type) {
    case 'number':
      return null;
    case 'time':
      return normalizeTimeFieldValue(null);
    case 'date':
      return '';
    default:
      return '';
  }
}

/**
 * Normalize a single repeated child value to the target field's control shape.
 */
export function normalizeRepeaterChildValue(
  field: DynamicField,
  value: unknown,
): unknown {
  switch (field.type) {
    case 'number': {
      if (value === '' || value == null) {
        return null;
      }
      const numeric = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }
    case 'date':
      return normalizeDateFieldValue(value) ?? '';
    case 'time':
      return normalizeTimeFieldValue(value);
    default:
      return value ?? '';
  }
}

/**
 * Static default seed for a newly created repeated instance.
 * Never uses a hydrated answer map or dynamic-default source as the seed.
 */
export function getRepeaterChildSeedValue(field: DynamicField): unknown {
  if (isDynamicDefaultValueSource(field.defaultValueSource)) {
    return getEmptyRepeaterChildValue(field);
  }

  if (isRepeaterAnswerMap(field.defaultValue)) {
    return getEmptyRepeaterChildValue(field);
  }

  return normalizeRepeaterChildValue(
    field,
    getInitialFieldValue({
      ...field,
      value: undefined,
      defaultValueSource: null,
    }),
  );
}

/**
 * Nested FormGroup (FormRecord) under the target field's existing `name`.
 * Children are added/removed by runtime sync from the source selection.
 */
export function buildRepeaterFormGroup(
  fb: FormBuilder,
  field: DynamicField,
  options?: { required?: boolean; visible?: boolean },
): FormGroup {
  const answerMap = normalizeRepeaterAnswerMap(
    isRepeaterAnswerMap(field.value)
      ? field.value
      : isRepeaterAnswerMap(field.defaultValue)
        ? field.defaultValue
        : {},
  );
  const childValidators = getFieldValidators(field, options);
  const controls: Record<string, FormControl> = {};

  for (const [itemId, raw] of Object.entries(answerMap)) {
    controls[itemId] = new FormControl(
      normalizeRepeaterChildValue(field, raw),
      childValidators,
    );
  }

  return fb.group(controls, {
    validators: getRepeaterGroupValidators({
      required: options?.required ?? !!field.required,
      visible: options?.visible ?? true,
    }),
  });
}

/**
 * Synchronize repeater FormGroup children with the current selected source ids.
 * Preserves existing controls by source item id; seeds only newly added children.
 * @returns true when controls were added or removed.
 */
export function syncRepeaterFormGroup(
  group: FormGroup,
  field: DynamicField,
  selectedIds: readonly string[],
  options?: {
    required?: boolean;
    visible?: boolean;
    /** Extra answer map used when seeding (e.g. draft values still on the field). */
    savedAnswers?: unknown;
  },
): boolean {
  const validators = getFieldValidators(field, {
    required: options?.required,
    visible: options?.visible,
  });
  const saved = normalizeRepeaterAnswerMap(
    options?.savedAnswers ??
      (isRepeaterAnswerMap(field.value)
        ? field.value
        : isRepeaterAnswerMap(field.defaultValue)
          ? field.defaultValue
          : {}),
  );
  const seed = getRepeaterChildSeedValue(field);
  const selected = selectedIds.map((id) => String(id).trim()).filter(Boolean);
  const selectedSet = new Set(selected);
  let changed = false;

  for (const key of Object.keys(group.controls)) {
    if (!selectedSet.has(key)) {
      group.removeControl(key, { emitEvent: false });
      changed = true;
    }
  }

  for (const itemId of selected) {
    if (group.contains(itemId)) {
      const child = group.get(itemId);
      child?.setValidators(validators);
      child?.updateValueAndValidity({ emitEvent: false });
      continue;
    }

    const initial = Object.prototype.hasOwnProperty.call(saved, itemId)
      ? normalizeRepeaterChildValue(field, saved[itemId])
      : seed;

    group.addControl(
      itemId,
      new FormControl(initial, validators),
      { emitEvent: false },
    );
    changed = true;
  }

  group.setValidators(
    getRepeaterGroupValidators({
      required: options?.required,
      visible: options?.visible,
    }),
  );
  if (changed && selected.length === 0 && (options?.required ?? false)) {
    group.markAsTouched({ onlySelf: true });
  }
  group.updateValueAndValidity({ emitEvent: false });
  return changed;
}

export function buildDynamicFormGroupConfig(
  fb: FormBuilder,
  sortedFields: DynamicField[],
  options?: { expandRepeaters?: boolean },
): Record<string, FormControl | FormGroup | unknown[]> {
  const groupConfig: Record<string, FormControl | FormGroup | unknown[]> = {};
  const expandRepeaters = options?.expandRepeaters !== false;

  for (const field of sortedFields) {
    if (expandRepeaters && isRuntimeRepeaterField(field)) {
      groupConfig[field.name] = buildRepeaterFormGroup(fb, field);
      continue;
    }

    if (field.type === 'checkbox') {
      groupConfig[field.name] = new FormControl(getInitialFieldValue(field));
      continue;
    }

    if (isMultiSelectField(field)) {
      groupConfig[field.name] = [
        getInitialFieldValue(field),
        getFieldValidators(field),
      ];
      continue;
    }

    groupConfig[field.name] = [
      getInitialFieldValue(field),
      getFieldValidators(field),
    ];
  }

  return groupConfig;
}

export function normalizeCheckboxFormValue(
  raw: DynamicFormValue,
  sortedFields: DynamicField[],
): DynamicFormValue {
  const result: DynamicFormValue = { ...raw };

  for (const field of sortedFields) {
    if (isRuntimeRepeaterField(field)) {
      const value = raw[field.name];
      const map = normalizeRepeaterAnswerMap(value);
      const normalized: Record<string, unknown> = {};
      for (const [itemId, itemValue] of Object.entries(map)) {
        normalized[itemId] = normalizeRepeaterChildValue(field, itemValue);
      }
      result[field.name] = normalized;
      continue;
    }

    if (field.type === 'checkbox') {
      const value = raw[field.name];

      if ((field.options?.length ?? 0) <= 1) {
        result[field.name] = Array.isArray(value)
          ? value.some(item => item !== false && item != null && item !== '')
          : !!value;
        continue;
      }

      result[field.name] = Array.isArray(value) ? value.filter(Boolean) : [];
      continue;
    }

    if (isMultiSelectField(field)) {
      const value = raw[field.name];
      result[field.name] = Array.isArray(value) ? value.filter((item) => item !== '' && item != null) : [];
      continue;
    }

    if (field.type === 'rating') {
      result[field.name] = normalizeRatingValue(
        raw[field.name],
        normalizeMaxRating(field.maxRating),
      );
      continue;
    }

    if (field.type === 'signature') {
      result[field.name] = normalizeSignatureValue(raw[field.name]);
      continue;
    }

    if (field.type === 'time') {
      result[field.name] = normalizeTimeFieldValue(raw[field.name]);
    }
  }

  return result;
}
