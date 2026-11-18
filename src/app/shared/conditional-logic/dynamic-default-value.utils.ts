import {
  RelatedRecordLookup,
  collectValueSourceFieldIds,
  coerceSetValueForField,
  isCompatibleSetValueSourceField,
  normalizeRelatedEndpointKey,
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
  /** Related module endpoint when this property stores a relationship FK. */
  relatedEndpoint?: string;
  /** Preferred display key on related module records. */
  relatedDisplayKey?: string;
};

/**
 * Calculation (expression) is only meaningful for numeric / measurement targets.
 * Rating and Range are excluded — their shapes are not plain calculation operands.
 */
export function supportsDynamicDefaultCalculation(
  field: { type?: string | null } | null | undefined,
): boolean {
  const type = String(field?.type ?? '')
    .trim()
    .toLowerCase();
  return (
    type === 'number' ||
    type === 'price' ||
    type === 'length' ||
    type === 'mass' ||
    type === 'volume' ||
    type === 'temperature'
  );
}

/** Source kinds offered for a Dynamic Default Value target. */
export function getDynamicDefaultValueSourceKindsForTarget(
  field: { type?: string | null } | null | undefined,
): readonly ValueSourceKind[] {
  if (supportsDynamicDefaultCalculation(field)) {
    return DYNAMIC_DEFAULT_VALUE_SOURCE_KINDS;
  }
  return DYNAMIC_DEFAULT_VALUE_SOURCE_KINDS.filter((kind) => kind !== 'expression');
}

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

/** True when the column stores a module relationship / foreign key. */
export function isRelationshipPropertyColumn(
  column: DynamicDefaultPropertyColumn | null | undefined,
): boolean {
  if (!column) {
    return false;
  }
  if (String(column.relatedEndpoint ?? '').trim()) {
    return true;
  }
  const type = String(column.type ?? '')
    .trim()
    .toLowerCase();
  return type === 'select' || type === 'radio';
}

function isStrictDateLikeValue(value: unknown): boolean {
  const text = String(value ?? '').trim();
  if (!text) {
    return false;
  }
  // Prefer ISO date / datetime — avoid loose Date.parse (accepts many non-dates).
  return /^\d{4}-\d{2}-\d{2}([T\s].*)?$/.test(text);
}

function isStrictTimeLikeValue(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return /^\d{1,2}:\d{2}(:\d{2})?(\s*[AaPp][Mm])?$/.test(text);
}

function isNumericLikeSample(value: unknown): boolean {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return true;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const nested = record['value'] ?? record['amount'] ?? record['quantity'];
    return isNumericLikeSample(nested);
  }
  const text = String(value ?? '').trim();
  if (!text || isStrictDateLikeValue(text) || isStrictTimeLikeValue(text)) {
    return false;
  }
  return Number.isFinite(Number(text));
}

function looksLikeDatePropertyName(column: DynamicDefaultPropertyColumn): boolean {
  const key = String(column.id ?? '')
    .trim()
    .toLowerCase();
  const label = String(column.label ?? '')
    .trim()
    .toLowerCase();
  const blob = `${key} ${label}`;
  return (
    /(^|_)(created|updated|deleted)_?(at|date|on)?$/.test(key) ||
    /(^|_)date(_|$)/.test(key) ||
    /\b(created|updated|deleted)\b.*\bdate\b/.test(label) ||
    /\bdate\b/.test(label) ||
    blob.includes('created at') ||
    blob.includes('updated at')
  );
}

function looksLikeTimePropertyName(column: DynamicDefaultPropertyColumn): boolean {
  const key = String(column.id ?? '')
    .trim()
    .toLowerCase();
  const label = String(column.label ?? '')
    .trim()
    .toLowerCase();
  return /(^|_)(time|start_time|end_time)(_|$)/.test(key) || /\btime\b/.test(label);
}

function propertyLooksEmailCompatible(
  column: DynamicDefaultPropertyColumn,
  sampleValues: unknown[],
): boolean {
  if (isRelationshipPropertyColumn(column) || isIdentityPropertyKey(column.id)) {
    return false;
  }
  const type = String(column.type ?? '').trim().toLowerCase();
  if (type === 'email') {
    return true;
  }
  if (type && type !== 'email' && type !== 'text' && type !== 'textarea') {
    return false;
  }
  const key = String(column.id ?? '').trim().toLowerCase();
  const label = String(column.label ?? '').trim().toLowerCase();
  if (key.includes('email') || label.includes('email')) {
    return true;
  }
  if (!sampleValues.length) {
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
  // Relationships are allowed for text targets — runtime resolves FK → display name.
  if (isRelationshipPropertyColumn(column)) {
    return true;
  }
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
      // Nested related object may already carry a display name.
      return !!pickRelatedRecordDisplayValue(value as Record<string, unknown>);
    }
    return String(value).trim() !== '';
  });
}

function propertyLooksDateCompatible(
  column: DynamicDefaultPropertyColumn,
  sampleValues: unknown[],
): boolean {
  if (isRelationshipPropertyColumn(column) || isIdentityPropertyKey(column.id)) {
    return false;
  }
  const type = String(column.type ?? '').trim().toLowerCase();
  if (type === 'date') {
    return true;
  }
  if (
    type === 'select' ||
    type === 'radio' ||
    type === 'email' ||
    type === 'number' ||
    type === 'checkbox' ||
    type === 'time' ||
    type === 'image' ||
    type === 'signature'
  ) {
    return false;
  }
  if (looksLikeDatePropertyName(column)) {
    if (!sampleValues.length) {
      return true;
    }
    return sampleValues.some(isStrictDateLikeValue);
  }
  if (!sampleValues.length) {
    // Incomplete metadata: do not assume every unknown column is a date.
    return false;
  }
  return sampleValues.every(isStrictDateLikeValue);
}

function propertyLooksTimeCompatible(
  column: DynamicDefaultPropertyColumn,
  sampleValues: unknown[],
): boolean {
  if (isRelationshipPropertyColumn(column) || isIdentityPropertyKey(column.id)) {
    return false;
  }
  const type = String(column.type ?? '').trim().toLowerCase();
  if (type === 'time') {
    return true;
  }
  if (
    type === 'select' ||
    type === 'radio' ||
    type === 'email' ||
    type === 'number' ||
    type === 'date' ||
    type === 'checkbox'
  ) {
    return false;
  }
  if (looksLikeTimePropertyName(column)) {
    if (!sampleValues.length) {
      return true;
    }
    return sampleValues.some(isStrictTimeLikeValue);
  }
  if (!sampleValues.length) {
    return false;
  }
  return sampleValues.every(isStrictTimeLikeValue);
}

function propertyLooksNumericCompatible(
  column: DynamicDefaultPropertyColumn,
  sampleValues: unknown[],
): boolean {
  if (isRelationshipPropertyColumn(column) || isIdentityPropertyKey(column.id)) {
    return false;
  }
  const type = String(column.type ?? '').trim().toLowerCase();
  if (
    type === 'number' ||
    type === 'price' ||
    type === 'length' ||
    type === 'mass' ||
    type === 'volume' ||
    type === 'temperature' ||
    type === 'rating'
  ) {
    return true;
  }
  if (
    type === 'select' ||
    type === 'radio' ||
    type === 'email' ||
    type === 'date' ||
    type === 'time' ||
    type === 'checkbox' ||
    type === 'text' ||
    type === 'textarea'
  ) {
    return false;
  }
  if (!sampleValues.length) {
    return false;
  }
  return sampleValues.some(isNumericLikeSample);
}

function propertyLooksSelectCompatible(
  column: DynamicDefaultPropertyColumn,
  sampleValues: unknown[],
  targetField: ConditionalLogicFieldLike,
): boolean {
  if (!sampleValues.length) {
    return !isIdentityPropertyKey(column.id) || isRelationshipPropertyColumn(column);
  }
  return sampleValues.some((sample) => {
    const coerced = coerceSetValueForField(targetField, sample);
    return coerced !== undefined && coerced !== null && coerced !== '';
  });
}

/**
 * Related Data property filter scoped to Dynamic Default Value.
 * Stricter than shared Conditional Logic filtering (especially date/time).
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

  return columns.filter((column) => {
    const id = String(column.id ?? '').trim();
    if (!id) {
      return false;
    }

    const sampleValues = (records ?? [])
      .map((record) => record[id])
      .filter((value) => value !== undefined && value !== null && value !== '');

    if (targetKind === 'date') {
      return propertyLooksDateCompatible(column, sampleValues);
    }
    if (targetKind === 'time') {
      return propertyLooksTimeCompatible(column, sampleValues);
    }
    if (targetKind === 'numeric') {
      return propertyLooksNumericCompatible(column, sampleValues);
    }
    if (targetType === 'email') {
      return propertyLooksEmailCompatible(column, sampleValues);
    }
    if (targetKind === 'select') {
      return propertyLooksSelectCompatible(column, sampleValues, targetField);
    }
    if (targetKind === 'text') {
      return propertyLooksTextCompatible(column, sampleValues);
    }
    return !isIdentityPropertyKey(id);
  });
}

/** Prefer human-readable fields on a related record. */
export function pickRelatedRecordDisplayValue(
  record: Record<string, unknown> | null | undefined,
  preferredKey?: string | null,
): string | null {
  if (!record) {
    return null;
  }
  const keys = [
    String(preferredKey ?? '').trim(),
    'name',
    'title',
    'label',
    'display_name',
    'displayName',
    'full_name',
    'fullName',
  ].filter(Boolean);

  for (const key of keys) {
    const value = record[key];
    if (value != null && typeof value !== 'object' && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return null;
}

function findRelatedModuleRecord(
  lookup: RelatedRecordLookup,
  endpoint: string,
  rawId: unknown,
): Record<string, unknown> | null {
  const normalized = normalizeRelatedEndpointKey(endpoint);
  const records =
    lookup.recordsByEndpoint.get(endpoint) ??
    lookup.recordsByEndpoint.get(normalized) ??
    [];
  if (!records.length || rawId == null || rawId === '') {
    return null;
  }
  const tokens = Array.isArray(rawId)
    ? rawId.map((item) => String(item))
    : [String(rawId)];

  for (const record of records) {
    const candidate = record['id'] ?? record['_id'];
    if (candidate != null && tokens.some((token) => String(candidate) === token)) {
      return record;
    }
  }
  return null;
}

/**
 * Dynamic Default Value related-property resolution.
 * Resolves relationship FKs to display labels for human-readable targets.
 * Does not change shared Conditional Logic `resolveValueSource` semantics.
 */
export function resolveRelatedPropertyValueForDynamicDefault(
  raw: unknown,
  column: DynamicDefaultPropertyColumn | null | undefined,
  targetField: ConditionalLogicFieldLike | null | undefined,
  lookup: RelatedRecordLookup,
): unknown {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  // Nested related object already present on the parent record.
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nestedDisplay = pickRelatedRecordDisplayValue(
      raw as Record<string, unknown>,
      column?.relatedDisplayKey,
    );
    if (nestedDisplay) {
      return nestedDisplay;
    }
  }

  const targetKind = resolveSetValueFieldKind(targetField);
  const wantsDisplay =
    targetKind === 'text' || String(targetField?.type ?? '').toLowerCase() === 'email';

  if (!wantsDisplay || !isRelationshipPropertyColumn(column)) {
    return raw;
  }

  const endpoint = String(column?.relatedEndpoint ?? '').trim();
  if (!endpoint) {
    // Relationship without resolvable endpoint — never dump raw IDs into text.
    return null;
  }

  const related = findRelatedModuleRecord(lookup, endpoint, raw);
  if (!related) {
    return null;
  }

  return (
    pickRelatedRecordDisplayValue(related, column?.relatedDisplayKey) ?? null
  );
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
   * Optional Related Data column metadata keyed by
   * `${sourceFieldId}::${property}` or bare `property`.
   * Used to resolve relationship FKs into display labels.
   */
  relatedPropertyColumns?: Map<string, DynamicDefaultPropertyColumn>;
  /**
   * Called when a field value should be patched.
   * Return false to abort further patches for that field.
   */
  applyValue: (field: DynamicDefaultFieldLike, value: unknown) => boolean;
  /** Current values keyed by field id (mutated as values are applied). */
  valuesByFieldId: Record<string, unknown>;
  fieldsById: Map<string, DynamicDefaultFieldLike>;
}

function lookupRelatedPropertyColumn(
  source: ValueSource,
  columns: Map<string, DynamicDefaultPropertyColumn> | undefined,
): DynamicDefaultPropertyColumn | undefined {
  if (!columns || source.kind !== 'relatedData') {
    return undefined;
  }
  const property = String(source.property ?? '').trim();
  const sourceFieldId = String(source.sourceFieldId ?? '').trim();
  if (!property) {
    return undefined;
  }
  return (
    columns.get(`${sourceFieldId}::${property}`) ??
    columns.get(property) ??
    undefined
  );
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

      // Saved calculation configs on non-numeric targets must not execute.
      if (source.kind === 'expression' && !supportsDynamicDefaultCalculation(field)) {
        continue;
      }

      let resolved = resolveValueSource(
        source,
        options.valuesByFieldId,
        options.fieldsById,
        lookup,
      );

      if (source.kind === 'relatedData') {
        resolved = resolveRelatedPropertyValueForDynamicDefault(
          resolved,
          lookupRelatedPropertyColumn(source, options.relatedPropertyColumns),
          field,
          lookup,
        );
      }

      if (resolved === undefined || resolved === null) {
        continue;
      }

      const coerced = coerceSetValueForField(field, resolved);
      if (coerced === undefined || coerced === null) {
        continue;
      }

      // Never erase an existing value with an empty / unresolved result.
      if (!hasPopulatedAnswerValue(coerced)) {
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

/**
 * Merge durable answer / user-edit protections with live dirty/touched ids.
 * Used by DynamicForm runtime before every dynamic-default pass.
 */
export function collectDynamicDefaultSkipFieldIds(options: {
  answerProtectedFieldIds?: Iterable<string>;
  userEditedFieldIds?: Iterable<string>;
  dirtyOrTouchedFieldIds?: Iterable<string>;
}): Set<string> {
  const skip = new Set<string>();
  for (const id of options.answerProtectedFieldIds ?? []) {
    if (id) {
      skip.add(id);
    }
  }
  for (const id of options.userEditedFieldIds ?? []) {
    if (id) {
      skip.add(id);
    }
  }
  for (const id of options.dirtyOrTouchedFieldIds ?? []) {
    if (id) {
      skip.add(id);
    }
  }
  return skip;
}

/**
 * Whether a resolved dynamic-default candidate should be written to a control.
 * Rejects null/empty results and no-op equal values.
 */
export function shouldApplyDynamicDefaultResolvedValue(
  current: unknown,
  next: unknown,
): boolean {
  if (next === undefined || next === null) {
    return false;
  }
  if (!hasPopulatedAnswerValue(next)) {
    return false;
  }
  if (setValuesEqual(current, next)) {
    return false;
  }
  return true;
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
