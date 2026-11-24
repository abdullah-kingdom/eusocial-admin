/**
 * Repeater Field — configuration + shared runtime helpers.
 * Phase 1: validate/normalize persisted `repeaterConfig`.
 * Phase 2: answer-map identity, labels, and source-selection helpers used by
 * Template Preview / Staff Regular Form (not Typeform).
 */

/** Persisted repeater configuration on a form field. */
export interface FieldRepeaterConfig {
  enabled: boolean;
  /** Stable schema id of the multi-value source field. */
  sourceFieldId: string;
}

/** Minimal field shape used by compatibility checks (builder or config). */
export interface RepeaterFieldRef {
  id?: string | null;
  type?: string | null;
  label?: string | null;
  selectionType?: string | null;
  options?: unknown[] | null;
  optionSource?: { type?: string | null } | null;
  repeaterConfig?: FieldRepeaterConfig | null;
}

/** Target field types that may be configured as repeaters in v1. */
export const REPEATER_TARGET_TYPES: ReadonlySet<string> = new Set([
  'text',
  'textarea',
  'number',
  'email',
  'date',
  'time',
]);

export function isRepeaterTargetFieldType(
  type: string | null | undefined,
): boolean {
  return !!type && REPEATER_TARGET_TYPES.has(String(type).trim().toLowerCase());
}

export function normalizeRepeaterConfig(
  raw: unknown,
): FieldRepeaterConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const enabled = record['enabled'] === true;
  const sourceFieldId = String(record['sourceFieldId'] ?? '').trim();

  if (!enabled || !sourceFieldId) {
    return null;
  }

  return { enabled: true, sourceFieldId };
}

export function cloneRepeaterConfig(
  raw: unknown,
): FieldRepeaterConfig | null {
  return normalizeRepeaterConfig(raw);
}

export function isRepeaterEnabled(
  field: RepeaterFieldRef | null | undefined,
): boolean {
  return normalizeRepeaterConfig(field?.repeaterConfig)?.enabled === true;
}

export function isMultiSelectSelectionType(
  selectionType: string | null | undefined,
): boolean {
  const raw = String(selectionType ?? '')
    .trim()
    .toLowerCase();
  return raw === 'multi' || raw === 'multiple';
}

function countFieldOptions(field: RepeaterFieldRef): number {
  const options = Array.isArray(field.options) ? field.options : [];
  return options.filter((option) => {
    if (option == null) {
      return false;
    }
    if (typeof option === 'string' || typeof option === 'number') {
      return String(option).trim() !== '';
    }
    if (typeof option === 'object') {
      const record = option as Record<string, unknown>;
      const label = String(record['label'] ?? '').trim();
      const id = String(record['id'] ?? record['value'] ?? '').trim();
      return !!(label || id);
    }
    return false;
  }).length;
}

/**
 * Whether a field can control a repeater (multi-value source with stable ids).
 */
export function isEligibleRepeaterSourceField(
  field: RepeaterFieldRef | null | undefined,
): boolean {
  if (!field?.id || !field.type) {
    return false;
  }

  // A repeater-enabled field cannot itself be a source in v1.
  if (isRepeaterEnabled(field)) {
    return false;
  }

  const type = String(field.type).trim().toLowerCase();

  if (type === 'select') {
    return isMultiSelectSelectionType(field.selectionType);
  }

  if (type === 'checkbox') {
    return countFieldOptions(field) > 1;
  }

  return false;
}

/**
 * Detect A → B → … → A cycles through `repeaterConfig.sourceFieldId`.
 */
export function wouldCreateRepeaterCycle(
  targetFieldId: string,
  sourceFieldId: string,
  schema: readonly RepeaterFieldRef[],
): boolean {
  const targetId = String(targetFieldId ?? '').trim();
  const sourceId = String(sourceFieldId ?? '').trim();
  if (!targetId || !sourceId) {
    return false;
  }
  if (targetId === sourceId) {
    return true;
  }

  const byId = new Map(
    schema
      .filter((field) => !!String(field.id ?? '').trim())
      .map((field) => [String(field.id), field] as const),
  );

  const visited = new Set<string>();
  let current: string | null = sourceId;

  while (current) {
    if (current === targetId) {
      return true;
    }
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);

    const field = byId.get(current);
    const next = normalizeRepeaterConfig(field?.repeaterConfig)?.sourceFieldId;
    current = next ? String(next).trim() : null;
  }

  return false;
}

export function listEligibleRepeaterSourceFields(
  schema: readonly RepeaterFieldRef[],
  targetFieldId: string,
): RepeaterFieldRef[] {
  const targetId = String(targetFieldId ?? '').trim();

  return schema.filter((field) => {
    const id = String(field.id ?? '').trim();
    if (!id || id === targetId) {
      return false;
    }
    if (!isEligibleRepeaterSourceField(field)) {
      return false;
    }
    if (wouldCreateRepeaterCycle(targetId, id, schema)) {
      return false;
    }
    return true;
  });
}

export function resolveRepeaterSourceFieldLabel(
  schema: readonly RepeaterFieldRef[],
  sourceFieldId: string | null | undefined,
): string {
  const id = String(sourceFieldId ?? '').trim();
  if (!id) {
    return '';
  }
  const field = schema.find((item) => String(item.id ?? '').trim() === id);
  const label = String(field?.label ?? '').trim();
  return label || id;
}

/**
 * Validate a draft before Apply. Returns null when valid.
 */
export function validateRepeaterConfigDraft(
  draft: { enabled: boolean; sourceFieldId: string },
  schema: readonly RepeaterFieldRef[],
  targetFieldId: string,
): string | null {
  if (!draft.enabled) {
    return null;
  }

  const sourceFieldId = String(draft.sourceFieldId ?? '').trim();
  if (!sourceFieldId) {
    return 'Select a source field before applying.';
  }

  if (sourceFieldId === String(targetFieldId ?? '').trim()) {
    return 'A field cannot repeat based on itself.';
  }

  const source = schema.find(
    (field) => String(field.id ?? '').trim() === sourceFieldId,
  );
  if (!source || !isEligibleRepeaterSourceField(source)) {
    return 'Select a compatible multi-select or multi-option checkbox field.';
  }

  if (wouldCreateRepeaterCycle(targetFieldId, sourceFieldId, schema)) {
    return 'This source would create a circular repeater dependency.';
  }

  return null;
}

/** Fallback when a selected source id has no resolvable display label. */
export const UNAVAILABLE_REPEATER_ITEM_LABEL = 'Unavailable item';

/**
 * Whether a field should expand as a runtime repeater (eligible target + config).
 * Callers must also exclude Typeform / unsupported surfaces.
 */
export function isRuntimeRepeaterField(
  field: RepeaterFieldRef | null | undefined,
): boolean {
  return isRepeaterEnabled(field) && isRepeaterTargetFieldType(field?.type);
}

/**
 * True when `value` is a plain ID-keyed answer map (not array / scalar / File).
 */
export function isRepeaterAnswerMap(value: unknown): boolean {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  if (typeof File !== 'undefined' && value instanceof File) {
    return false;
  }
  // Measurement / range / range shapes are not repeater maps.
  const record = value as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(record, 'from') ||
    Object.prototype.hasOwnProperty.call(record, 'to')
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(record, 'unit') &&
    (Object.prototype.hasOwnProperty.call(record, 'value') ||
      Object.prototype.hasOwnProperty.call(record, 'amount') ||
      Object.prototype.hasOwnProperty.call(record, 'quantity'))
  ) {
    return false;
  }
  return true;
}

/** Normalize a saved/draft repeater answer into a plain ID-keyed object. */
export function normalizeRepeaterAnswerMap(
  raw: unknown,
): Record<string, unknown> {
  if (!isRepeaterAnswerMap(raw)) {
    return {};
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(key ?? '').trim();
    if (!id) {
      continue;
    }
    result[id] = value;
  }
  return result;
}

/**
 * Stable selected source item ids from a multi-select or multi-checkbox value.
 * Preserves first-seen order; never uses array indexes as identity.
 */
export function extractSelectedSourceIds(value: unknown): string[] {
  if (value == null || value === '') {
    return [];
  }

  const rawItems = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (item == null || item === false || item === '') {
      continue;
    }
    const id = String(item).trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function formatRepeaterInstanceLabel(
  optionLabel: string,
  fieldLabel: string,
): string {
  const option = String(optionLabel ?? '').trim() || UNAVAILABLE_REPEATER_ITEM_LABEL;
  const field = String(fieldLabel ?? '').trim();
  return field ? `${option} ${field}` : option;
}

export interface RepeaterOptionLike {
  id?: string | number | null;
  label?: string | null;
  value?: string | number | null;
}

/**
 * Resolve a human-readable label for a selected source item id.
 * Never returns the raw id as the primary label.
 */
/**
 * True when any field in the schema/runtime list has an enabled repeater config.
 */
export function schemaHasEnabledRepeater(
  fields: readonly RepeaterFieldRef[] | null | undefined,
): boolean {
  if (!fields?.length) {
    return false;
  }
  return fields.some((field) => isRepeaterEnabled(field));
}

export function resolveRepeaterSourceItemLabel(
  itemId: string | number | null | undefined,
  options: readonly (string | number | RepeaterOptionLike)[] | null | undefined,
): string {
  const id = String(itemId ?? '').trim();
  if (!id) {
    return UNAVAILABLE_REPEATER_ITEM_LABEL;
  }

  const list = Array.isArray(options) ? options : [];
  for (let index = 0; index < list.length; index++) {
    const option = list[index];
    if (typeof option === 'string' || typeof option === 'number') {
      if (String(option) === id) {
        const label = String(option).trim();
        return label || UNAVAILABLE_REPEATER_ITEM_LABEL;
      }
      continue;
    }
    if (!option || typeof option !== 'object') {
      continue;
    }
    const optionId = String(option.id ?? option.value ?? index).trim();
    if (optionId !== id && String(option.value ?? '').trim() !== id) {
      continue;
    }
    const label = String(option.label ?? '').trim();
    if (label) {
      return label;
    }
  }

  return UNAVAILABLE_REPEATER_ITEM_LABEL;
}
