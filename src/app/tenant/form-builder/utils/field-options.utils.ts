import { FieldOption } from '../models/form-field.model';

/** Canonical static choice option persisted on Form Templates. */
export interface StaticChoiceOption {
  id: string;
  label: string;
}

/** Stable option id — never derived from label or array index. */
export function createOptionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `opt_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readOptionLabel(option: unknown): string | null {
  if (typeof option === 'string') {
    const text = option.trim();
    return text || null;
  }
  if (typeof option === 'number') {
    return String(option);
  }
  if (!option || typeof option !== 'object') {
    return null;
  }
  const record = option as Record<string, unknown>;
  const label = record['label'] ?? record['name'] ?? record['title'];
  if (label != null && String(label).trim()) {
    return String(label).trim();
  }
  return null;
}

function readStableOptionId(option: unknown): string | null {
  if (!option || typeof option !== 'object') {
    return null;
  }
  const record = option as Record<string, unknown>;
  const raw = record['id'] ?? record['value'];
  if (raw == null || raw === '') {
    return null;
  }
  // Reject legacy index-only numeric ids (1, 2, 3…) — regenerate stable ids.
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw < 1000) {
    return null;
  }
  const text = String(raw).trim();
  if (!text) {
    return null;
  }
  // Index-like string ids from older normalize paths.
  if (/^\d{1,3}$/.test(text)) {
    return null;
  }
  return text;
}

/**
 * Normalize static choice options (select / radio / checkbox) to
 * `{ id, label }` with value === id for runtime FormControls.
 * Existing non-index ids are preserved across rename/reorder/reload.
 */
export function normalizeStaticChoiceOptions(
  options: unknown[] | undefined | null,
): FieldOption[] {
  if (!Array.isArray(options)) {
    return [];
  }

  const seenIds = new Set<string>();
  const result: FieldOption[] = [];

  options.forEach((option, index) => {
    const label = readOptionLabel(option);
    if (!label) {
      return;
    }

    let id = readStableOptionId(option);
    if (!id || seenIds.has(id)) {
      id = createOptionId();
    }
    seenIds.add(id);

    result.push({
      id,
      label,
      value: id,
      sortOrder: index,
      isDefault: false,
    });
  });

  return result;
}

/** @deprecated Prefer normalizeStaticChoiceOptions — kept as alias for call sites. */
export function normalizeStaticSelectFieldOptions(
  options: unknown[] | undefined | null,
): FieldOption[] {
  return normalizeStaticChoiceOptions(options);
}

/** @deprecated Prefer normalizeStaticChoiceOptions — kept as alias for call sites. */
export function normalizeCheckboxFieldOptions(
  options: unknown[] | undefined | null,
): FieldOption[] {
  return normalizeStaticChoiceOptions(options);
}

export function toStaticChoiceOptions(
  options: unknown[] | undefined | null,
): StaticChoiceOption[] {
  return normalizeStaticChoiceOptions(options).map((option) => ({
    id: String(option.id ?? option.value),
    label: option.label,
  }));
}

export function getStaticChoiceOptionId(
  option: string | number | FieldOption | StaticChoiceOption | DynamicFieldOptionLike,
  index = 0,
): string {
  if (typeof option === 'string' || typeof option === 'number') {
    return String(option);
  }
  const id = (option as { id?: unknown }).id;
  const value = (option as { value?: unknown }).value;
  if (id != null && String(id).trim() !== '') {
    return String(id);
  }
  if (value != null && String(value).trim() !== '') {
    return String(value);
  }
  return String(index);
}

export function getStaticChoiceOptionLabel(
  option: string | number | FieldOption | StaticChoiceOption | DynamicFieldOptionLike,
  index = 0,
): string {
  if (typeof option === 'string' || typeof option === 'number') {
    return String(option);
  }
  const label = (option as { label?: unknown }).label;
  if (label != null && String(label).trim() !== '') {
    return String(label);
  }
  return getStaticChoiceOptionId(option, index);
}

export function findStaticChoiceLabelById(
  options: ReadonlyArray<string | number | FieldOption | StaticChoiceOption | DynamicFieldOptionLike> | undefined | null,
  id: unknown,
): string {
  if (id == null || id === '') {
    return '';
  }
  const key = String(id);
  const list = options ?? [];
  for (let index = 0; index < list.length; index += 1) {
    const option = list[index];
    if (getStaticChoiceOptionId(option, index) === key) {
      return getStaticChoiceOptionLabel(option, index);
    }
  }
  return key;
}

type DynamicFieldOptionLike = { label?: string; value?: string | number; id?: string | number };

export function normalizeFieldOption(option: unknown): FieldOption | null {
  if (typeof option === 'string' || typeof option === 'number') {
    const text = String(option);
    return { label: text, value: text };
  }

  if (!option || typeof option !== 'object') {
    return null;
  }

  const record = option as Record<string, unknown>;
  const label = record['label'] ?? record['name'] ?? record['title'];
  const value = record['value'] ?? record['key'] ?? record['id'];
  const id = record['id'];

  if (label != null && value != null) {
    const normalized: FieldOption = {
      label: String(label),
      value: value as string | number,
    };

    if (id != null && String(id).trim() !== '') {
      normalized.id = String(id);
    } else if (typeof id === 'number') {
      normalized.id = id;
    }

    if (typeof record['sortOrder'] === 'number') {
      normalized.sortOrder = record['sortOrder'] as number;
    }

    if (typeof record['isDefault'] === 'boolean') {
      normalized.isDefault = record['isDefault'] as boolean;
    }

    return normalized;
  }

  if (label != null) {
    const text = String(label);
    return { label: text, value: text };
  }

  if (value != null) {
    return { label: String(value), value: value as string | number };
  }

  return null;
}

export function normalizeFieldOptions(
  options: unknown[] | undefined | null,
): FieldOption[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => normalizeFieldOption(option))
    .filter((option): option is FieldOption => option !== null);
}

/**
 * Persist dynamic select selections as configured `valueKey` values.
 * Accepts bare ids or FieldOption objects and returns only the value list.
 */
export function toDynamicSelectOptionIds(
  options: unknown[] | undefined | null,
): Array<string | number> {
  if (!Array.isArray(options)) {
    return [];
  }

  const ids: Array<string | number> = [];

  for (const option of options) {
    if (typeof option === 'number') {
      ids.push(option);
      continue;
    }

    if (typeof option === 'string') {
      if (option !== '') {
        ids.push(option);
      }
      continue;
    }

    const normalized = normalizeFieldOption(option);
    if (normalized?.value != null && normalized.value !== '') {
      ids.push(normalized.value);
    }
  }

  return ids;
}
