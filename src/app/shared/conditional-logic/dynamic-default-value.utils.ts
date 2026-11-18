import {
  RelatedRecordLookup,
  collectValueSourceFieldIds,
  coerceSetValueForField,
  filterRelatedPropertiesForTargetKind,
  isCompatibleSetValueSourceField,
  normalizeValueSource,
  resolveSetValueFieldKind,
  resolveValueSource,
  setValuesEqual,
  supportsSetValueFieldType,
} from './conditional-logic.set-value';
import {
  ConditionalLogicFieldLike,
  ValueSource,
  ValueSourceKind,
} from './conditional-logic.types';

/** Dynamic default source kinds (Fixed belongs to static Default Value). */
export const DYNAMIC_DEFAULT_VALUE_SOURCE_KINDS: readonly ValueSourceKind[] = [
  'field',
  'relatedData',
  'expression',
] as const;

export type DynamicDefaultPropertyColumn = {
  id: string;
  label: string;
  /** Schema field type when known (email, text, number, …). */
  type?: string;
};

const IDENTITY_PROPERTY_KEYS = new Set([
  'id',
  '_id',
  'userid',
  'user_id',
  'userId',
  'uuid',
  'guid',
  'pk',
]);

/**
 * Dynamic Select/Radio wired to a module endpoint — FormControl stores
 * `valueKey` (usually record id), not a display/email string.
 */
export function isDynamicRecordSelectField(
  field: { type?: string; optionSource?: { type?: string; endpoint?: string } | null } | null | undefined,
): boolean {
  if (!field) {
    return false;
  }
  if (field.type !== 'select' && field.type !== 'radio') {
    return false;
  }
  const sourceType = String(field.optionSource?.type ?? '').trim().toLowerCase();
  const endpoint = String(field.optionSource?.endpoint ?? '').trim();
  return (sourceType === 'dynamic' || sourceType === 'api') && !!endpoint;
}

/**
 * Scoped Dynamic Default Value direct-source compatibility.
 * Does not change shared Conditional Logic `isCompatibleSetValueSourceField`.
 */
export function isCompatibleDynamicDefaultSourceField(
  targetField: ConditionalLogicFieldLike | null | undefined,
  sourceField: ConditionalLogicFieldLike | null | undefined,
): boolean {
  if (!isCompatibleSetValueSourceField(targetField, sourceField)) {
    return false;
  }

  const targetKind = resolveSetValueFieldKind(targetField);
  // Record-based selects store IDs — never treat them as direct text/email sources.
  if (
    (targetKind === 'text' || targetField?.type === 'email') &&
    isDynamicRecordSelectField(sourceField)
  ) {
    return false;
  }

  return true;
}

function isIdentityPropertyKey(raw: string): boolean {
  const key = String(raw ?? '').trim();
  if (!key) {
    return true;
  }
  if (IDENTITY_PROPERTY_KEYS.has(key)) {
    return true;
  }
  const lower = key.toLowerCase();
  if (IDENTITY_PROPERTY_KEYS.has(lower)) {
    return true;
  }
  if (/^fld_/i.test(key)) {
    // fld_* may be a real email/text field — not identity by id shape alone.
    return false;
  }
  return (
    lower === 'userid' ||
    lower.endsWith('_id') ||
    lower.endsWith('id') && (lower === 'id' || lower.includes('user'))
  );
}

function looksLikeEmailValue(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

function propertyLooksEmailCompatible(
  column: DynamicDefaultPropertyColumn,
  sampleValues: unknown[],
): boolean {
  const type = String(column.type ?? '').trim().toLowerCase();
  if (type === 'email') {
    return true;
  }
  const key = String(column.id ?? '').trim().toLowerCase();
  const label = String(column.label ?? '').trim().toLowerCase();
  if (key.includes('email') || label.includes('email')) {
    return true;
  }
  if (!sampleValues.length) {
    // Incomplete metadata: keep non-identity columns rather than hiding everything.
    return !isIdentityPropertyKey(column.id);
  }
  return sampleValues.some(looksLikeEmailValue);
}

function propertyLooksTextCompatible(
  column: DynamicDefaultPropertyColumn,
  sampleValues: unknown[],
): boolean {
  if (isIdentityPropertyKey(column.id)) {
    return false;
  }
  const type = String(column.type ?? '').trim().toLowerCase();
  if (
    type === 'number' ||
    type === 'date' ||
    type === 'time' ||
    type === 'checkbox' ||
    type === 'image' ||
    type === 'signature'
  ) {
    return false;
  }
  if (!sampleValues.length) {
    return true;
  }
  return sampleValues.some((value) => {
    if (value == null) {
      return false;
    }
    if (typeof value === 'object') {
      return false;
    }
    return String(value).trim() !== '';
  });
}

function propertyLooksSelectCompatible(
  column: DynamicDefaultPropertyColumn,
  sampleValues: unknown[],
  targetField: ConditionalLogicFieldLike,
): boolean {
  if (isIdentityPropertyKey(column.id) && String(column.type ?? '') !== 'select') {
    // Allow id only when target options themselves are those ids (checked below).
  }
  if (!sampleValues.length) {
    return !isIdentityPropertyKey(column.id);
  }
  return sampleValues.some((sample) => {
    const coerced = coerceSetValueForField(targetField, sample);
    return coerced !== undefined && coerced !== null && coerced !== '';
  });
}

/**
 * Related Data property filter scoped to Dynamic Default Value.
 * Reuses numeric/date/time heuristics from shared Set Value filtering.
 */
export function filterRelatedPropertiesForDynamicDefault(
  columns: DynamicDefaultPropertyColumn[],
  records: Record<string, unknown>[],
  targetField: ConditionalLogicFieldLike | null | undefined,
): DynamicDefaultPropertyColumn[] {
  if (!columns.length || !targetField) {
    return [];
  }

  const targetKind = resolveSetValueFieldKind(targetField);
  const targetType = String(targetField.type ?? '').trim().toLowerCase();

  if (targetKind === 'numeric' || targetKind === 'date' || targetKind === 'time') {
    return filterRelatedPropertiesForTargetKind(
      columns,
      records,
      targetKind,
    ) as DynamicDefaultPropertyColumn[];
  }

  return columns.filter((column) => {
    const id = String(column.id ?? '').trim();
    if (!id) {
      return false;
    }

    const sampleValues = (records ?? [])
      .map((record) => record[id])
      .filter((value) => value !== undefined && value !== null && value !== '');

    if (targetType === 'email') {
      if (isIdentityPropertyKey(id)) {
        return false;
      }
      return propertyLooksEmailCompatible(column, sampleValues);
    }

    if (targetKind === 'select') {
      return propertyLooksSelectCompatible(column, sampleValues, targetField);
    }

    if (targetKind === 'text') {
      return propertyLooksTextCompatible(column, sampleValues);
    }

    // Other kinds: keep non-identity columns when metadata is thin.
    return !isIdentityPropertyKey(id);
  });
}

/** Resolve a readable Related Data property label (display only). */
export function resolveRelatedPropertyDisplayLabel(
  columnId: string,
  options?: {
    schemaLabel?: string | null;
    mappedLabel?: string | null;
  },
): string {
  const schemaLabel = String(options?.schemaLabel ?? '').trim();
  if (schemaLabel) {
    return schemaLabel;
  }
  const mappedLabel = String(options?.mappedLabel ?? '').trim();
  if (mappedLabel && !/^fld_/i.test(mappedLabel)) {
    return mappedLabel;
  }

  const id = String(columnId ?? '').trim();
  if (!id) {
    return 'Unnamed property';
  }
  if (/^fld_/i.test(id)) {
    return 'Unnamed property';
  }

  const humanized = id
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bId\b/g, 'ID');

  return humanized || 'Unnamed property';
}

export function isDynamicDefaultValueSource(
  source: ValueSource | null | undefined,
): boolean {
  if (!source) {
    return false;
  }
  const kind = normalizeValueSource(source).kind;
  return kind === 'field' || kind === 'relatedData' || kind === 'expression';
}

export function normalizeDefaultValueSource(
  raw: unknown,
): ValueSource | null {
  if (raw == null) {
    return null;
  }
  const normalized = normalizeValueSource(raw);
  if (!isDynamicDefaultValueSource(normalized)) {
    return null;
  }
  return normalized;
}

export function cloneDefaultValueSource(
  source: ValueSource | null | undefined,
): ValueSource | null {
  const normalized = normalizeDefaultValueSource(source);
  return normalized
    ? (JSON.parse(JSON.stringify(normalized)) as ValueSource)
    : null;
}

export function describeDefaultValueSource(
  source: ValueSource | null | undefined,
  fieldLabelById: (fieldId: string) => string,
): string {
  const normalized = normalizeDefaultValueSource(source);
  if (!normalized) {
    return '';
  }

  switch (normalized.kind) {
    case 'field':
      return normalized.fieldId
        ? `From field: ${fieldLabelById(normalized.fieldId) || normalized.fieldId}`
        : 'From field (not configured)';
    case 'relatedData': {
      const sourceLabel = normalized.sourceFieldId
        ? fieldLabelById(normalized.sourceFieldId) || normalized.sourceFieldId
        : 'source';
      const property = normalized.property || 'property';
      return `From related data: ${sourceLabel} → ${property}`;
    }
    case 'expression':
      return `Calculation (${normalized.op})`;
    default:
      return 'Dynamic default';
  }
}

export type DynamicDefaultFieldLike = ConditionalLogicFieldLike & {
  defaultValueSource?: ValueSource | null;
  name?: string;
};

export interface ResolveDynamicDefaultsOptions {
  /** Field ids that already have submitted / preserved answers — skip defaults. */
  skipFieldIds?: ReadonlySet<string>;
  lookup?: RelatedRecordLookup;
  /**
   * Called when a field value should be patched.
   * Return false to abort further patches for that field.
   */
  applyValue: (field: DynamicDefaultFieldLike, value: unknown) => boolean;
  /** Current values keyed by field id (mutated as values are applied). */
  valuesByFieldId: Record<string, unknown>;
  fieldsById: Map<string, DynamicDefaultFieldLike>;
}

/**
 * Resolve dynamic defaults in dependency order.
 * Skips fields with submitted answers, unresolvable sources, and cycles.
 */
export function resolveDynamicDefaultValues(
  fields: DynamicDefaultFieldLike[],
  options: ResolveDynamicDefaultsOptions,
): { appliedFieldIds: string[]; skippedCycleFieldIds: string[] } {
  const appliedFieldIds: string[] = [];
  const skippedCycleFieldIds: string[] = [];
  const skipFieldIds = options.skipFieldIds ?? new Set<string>();
  const lookup = options.lookup ?? { recordsByEndpoint: new Map() };

  const candidates = fields.filter((field) => {
    if (!field?.id || skipFieldIds.has(field.id)) {
      return false;
    }
    if (!supportsSetValueFieldType(field.type)) {
      return false;
    }
    return !!normalizeDefaultValueSource(field.defaultValueSource);
  });

  if (!candidates.length) {
    return { appliedFieldIds, skippedCycleFieldIds };
  }

  const candidateIds = new Set(candidates.map((field) => field.id));
  const dependencyMap = new Map<string, string[]>();

  for (const field of candidates) {
    const source = normalizeDefaultValueSource(field.defaultValueSource)!;
    const deps = collectValueSourceFieldIds(source).filter((id) =>
      candidateIds.has(id),
    );
    dependencyMap.set(field.id, deps);
  }

  const ordered = topologicalSortFieldIds(
    [...candidateIds],
    dependencyMap,
    skippedCycleFieldIds,
  );

  // Multi-pass so later fields see earlier applied defaults even across soft deps
  // (sources that are not themselves dynamic-default candidates).
  const maxPasses = Math.max(ordered.length, 1) + 1;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let appliedThisPass = 0;

    for (const fieldId of ordered) {
      if (appliedFieldIds.includes(fieldId) || skippedCycleFieldIds.includes(fieldId)) {
        continue;
      }

      const field = options.fieldsById.get(fieldId);
      if (!field) {
        continue;
      }

      const source = normalizeDefaultValueSource(field.defaultValueSource);
      if (!source) {
        continue;
      }

      const resolved = resolveValueSource(
        source,
        options.valuesByFieldId,
        options.fieldsById,
        lookup,
      );

      if (resolved === undefined || resolved === null) {
        continue;
      }

      const coerced = coerceSetValueForField(field, resolved);
      if (coerced === undefined || coerced === null) {
        continue;
      }

      const current = options.valuesByFieldId[field.id];
      if (setValuesEqual(current, coerced)) {
        if (!appliedFieldIds.includes(field.id)) {
          appliedFieldIds.push(field.id);
        }
        continue;
      }

      const applied = options.applyValue(field, coerced);
      if (!applied) {
        continue;
      }

      options.valuesByFieldId[field.id] = coerced;
      if (!appliedFieldIds.includes(field.id)) {
        appliedFieldIds.push(field.id);
      }
      appliedThisPass += 1;
    }

    if (appliedThisPass === 0) {
      break;
    }
  }

  return { appliedFieldIds, skippedCycleFieldIds };
}

/**
 * Kahn-style topological sort. Cyclic nodes are appended to `cycleFieldIds`
 * and omitted from the returned order (safe fallback: do not apply).
 */
export function topologicalSortFieldIds(
  fieldIds: string[],
  dependencyMap: Map<string, string[]>,
  cycleFieldIds: string[],
): string[] {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const id of fieldIds) {
    indegree.set(id, 0);
    dependents.set(id, []);
  }

  for (const id of fieldIds) {
    const deps = (dependencyMap.get(id) ?? []).filter((dep) => indegree.has(dep));
    indegree.set(id, deps.length);
    for (const dep of deps) {
      dependents.get(dep)!.push(id);
    }
  }

  const queue = fieldIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const ordered: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of dependents.get(id) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }

  if (ordered.length !== fieldIds.length) {
    for (const id of fieldIds) {
      if (!ordered.includes(id)) {
        cycleFieldIds.push(id);
      }
    }
  }

  return ordered;
}

/** Whether a control value counts as already populated (skip dynamic default). */
export function hasPopulatedAnswerValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return true;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(record, 'value') ||
      Object.prototype.hasOwnProperty.call(record, 'amount') ||
      Object.prototype.hasOwnProperty.call(record, 'quantity')
    ) {
      const amount = record['value'] ?? record['amount'] ?? record['quantity'];
      return amount !== null && amount !== undefined && String(amount).trim() !== '';
    }
    if (
      Object.prototype.hasOwnProperty.call(record, 'from') ||
      Object.prototype.hasOwnProperty.call(record, 'to')
    ) {
      return (
        String(record['from'] ?? '').trim() !== '' ||
        String(record['to'] ?? '').trim() !== ''
      );
    }
  }
  return true;
}
