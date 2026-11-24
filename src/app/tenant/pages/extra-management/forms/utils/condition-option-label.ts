import { FormField } from '../../../../form-builder/models/form-field.model';

const CHOICE_FIELD_TYPES = new Set<FormField['type']>(['select', 'radio', 'checkbox']);

/**
 * Display text for a conditional-logic comparison value.
 * Choice fields show the option label; the stored id/value is not changed.
 * Unresolved values are returned unchanged so the modal can still render.
 */
export function formatConditionOptionDisplay(
  sourceField: Pick<FormField, 'type' | 'options'> | null | undefined,
  value: unknown,
): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => formatConditionOptionDisplay(sourceField, item))
      .filter((item) => item !== '')
      .join(', ');
  }

  if (value == null) {
    return '';
  }

  const raw = String(value).trim();
  if (!raw) {
    return '';
  }

  if (!sourceField || !CHOICE_FIELD_TYPES.has(sourceField.type)) {
    return raw;
  }

  return findChoiceOptionLabel(sourceField.options, raw) ?? raw;
}

function findChoiceOptionLabel(
  options: FormField['options'] | undefined,
  raw: string,
): string | null {
  if (!options?.length) {
    return null;
  }

  for (const option of options) {
    if (typeof option === 'string' || typeof option === 'number') {
      if (String(option) === raw) {
        return String(option);
      }
      continue;
    }

    const id = option.id == null ? '' : String(option.id).trim();
    const optionValue = option.value == null ? '' : String(option.value).trim();
    if ((id && id === raw) || (optionValue && optionValue === raw)) {
      const label = String(option.label ?? '').trim();
      return label || null;
    }
  }

  return null;
}
