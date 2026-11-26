import { FormField } from '../../form-builder/models/form-field.model';
import { generateFieldId } from '../../form-builder/utils/form-field.factory';
import {
  largestFittingBuilderWidth,
  normalizeBuilderWidthUnits,
  preferredNewFieldBuilderWidth,
  rowHasAvailableColumnSpace,
  rowRemainingGridUnits,
  ROW_WIDTH_UNITS,
} from '../../pages/extra-management/forms/utils/field-builder-adapter.utils';
import { DynamicField } from '../../../interfaces/dynamic-field';
import { DynamicFormSectionLayout } from '../../../shared/dynamic-form/dynamic-form.component';

/** Setup Form Builder row (fields are FormField references by identity). */
export interface SetupFormRow {
  id: string;
  fields: FormField[];
}

/** Setup Form Builder section — typically one default section. */
export interface SetupFormSection {
  id: string;
  name: string;
  rows: SetupFormRow[];
}

/** Persisted layout under schema.sections (field ids only; fields stay flat). */
export interface SetupStoredLayoutRow {
  id: string;
  fieldIds: string[];
}

export interface SetupStoredLayoutSection {
  id: string;
  name: string;
  type: 'custom';
  rows: SetupStoredLayoutRow[];
}

export function createSetupRowId(): string {
  return generateFieldId().replace(/^field_/, 'row_');
}

export function createSetupSectionId(): string {
  return generateFieldId().replace(/^field_/, 'section_');
}

/**
 * Backward-compatible default when no row layout is stored:
 * pack fields into rows by remaining grid units (same 4/6/12 rules as Form Template),
 * preserving field order and existing widths.
 */
export function buildDefaultSetupSections(fields: FormField[]): SetupFormSection[] {
  const normalized = fields.map((field) => ({
    ...field,
    width: normalizeBuilderWidthUnits(field.width),
  }));

  const rows: SetupFormRow[] = [];
  let current: FormField[] = [];

  for (const field of normalized) {
    const width = normalizeBuilderWidthUnits(field.width);
    const canFit =
      current.length === 0 ||
      (current.length < 3 && rowRemainingGridUnits(current) >= width);

    if (!canFit) {
      rows.push({ id: createSetupRowId(), fields: current });
      current = [];
    }

    current.push(field);
  }

  if (current.length) {
    rows.push({ id: createSetupRowId(), fields: current });
  }

  if (!rows.length) {
    rows.push({ id: createSetupRowId(), fields: [] });
  }

  return [
    {
      id: createSetupSectionId(),
      name: '',
      rows,
    },
  ];
}

/** Flatten sections → ordered FormField[] (API fields array). */
export function flattenSetupSections(sections: SetupFormSection[]): FormField[] {
  const fields: FormField[] = [];
  for (const section of sections) {
    for (const row of section.rows) {
      for (const field of row.fields) {
        fields.push({
          ...field,
          width: normalizeBuilderWidthUnits(field.width),
        });
      }
    }
  }
  return fields.map((field, index) => ({ ...field, order: index }));
}

/** Serialize layout for schema.sections (ids only). */
export function serializeSetupSections(
  sections: SetupFormSection[],
): SetupStoredLayoutSection[] {
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    type: 'custom' as const,
    rows: section.rows.map((row) => ({
      id: row.id,
      fieldIds: row.fields.map((field) => field.id),
    })),
  }));
}

/**
 * Hydrate builder sections from stored layout + flat fields.
 * Missing / invalid layout → safe default (one field per row).
 */
export function hydrateSetupSections(
  fields: FormField[],
  storedSections: unknown,
): SetupFormSection[] {
  const byId = new Map(fields.map((field) => [field.id, field] as const));
  if (!Array.isArray(storedSections) || storedSections.length === 0) {
    return buildDefaultSetupSections(fields);
  }

  const used = new Set<string>();
  const sections: SetupFormSection[] = [];

  for (const raw of storedSections) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const section = raw as Record<string, unknown>;
    const rowsRaw = Array.isArray(section['rows']) ? section['rows'] : [];
    const rows: SetupFormRow[] = [];

    for (const rowRaw of rowsRaw) {
      if (!rowRaw || typeof rowRaw !== 'object') {
        continue;
      }
      const row = rowRaw as Record<string, unknown>;
      const fieldIds = Array.isArray(row['fieldIds'])
        ? (row['fieldIds'] as unknown[]).map(String)
        : Array.isArray(row['fields'])
          ? (row['fields'] as unknown[])
              .map((item) => {
                if (item && typeof item === 'object' && 'id' in item) {
                  return String((item as { id: unknown }).id);
                }
                return '';
              })
              .filter(Boolean)
          : [];

      const rowFields: FormField[] = [];
      for (const id of fieldIds) {
        const field = byId.get(id);
        if (field && !used.has(id)) {
          rowFields.push({
            ...field,
            width: normalizeBuilderWidthUnits(field.width),
          });
          used.add(id);
        }
      }
      // Keep empty rows only when the stored row listed no fields (section chrome).
      if (rowFields.length || fieldIds.length === 0) {
        rows.push({
          id: String(row['id'] || createSetupRowId()),
          fields: rowFields,
        });
      }
    }

    // Preserve empty sections so multi-section layouts round-trip correctly.
    sections.push({
      id: String(section['id'] || createSetupSectionId()),
      name: typeof section['name'] === 'string' ? section['name'] : '',
      rows: rows.length ? rows : [{ id: createSetupRowId(), fields: [] }],
    });
  }

  // Append any fields missing from stored layout (do not drop them).
  const orphans = fields.filter((field) => !used.has(field.id));
  if (orphans.length) {
    const orphanRows = orphans.map((field) => ({
      id: createSetupRowId(),
      fields: [
        {
          ...field,
          width: normalizeBuilderWidthUnits(field.width),
        },
      ],
    }));
    if (sections.length) {
      sections[0] = {
        ...sections[0],
        rows: [...sections[0].rows, ...orphanRows],
      };
    } else {
      return buildDefaultSetupSections(fields);
    }
  }

  return sections.length ? sections : buildDefaultSetupSections(fields);
}

/** Update a field in place across sections (settings edits). */
export function updateFieldInSetupSections(
  sections: SetupFormSection[],
  updated: FormField,
): SetupFormSection[] {
  return sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({
      ...row,
      fields: row.fields.map((field) =>
        field.id === updated.id
          ? {
              ...updated,
              width: normalizeBuilderWidthUnits(updated.width),
            }
          : field,
      ),
    })),
  }));
}

export function removeFieldFromSetupSections(
  sections: SetupFormSection[],
  fieldId: string,
): SetupFormSection[] {
  const next = sections.map((section) => ({
    ...section,
    rows: section.rows
      .map((row) => ({
        ...row,
        fields: row.fields.filter((field) => field.id !== fieldId),
      }))
      .filter((row) => row.fields.length > 0),
  }));

  // Keep every section (even empty) so Setup section chrome remains stable.
  return ensureSetupSectionsHaveRows(next.length ? next : buildDefaultSetupSections([]));
}

/** Ensure each section has at least one droppable row. */
export function ensureSetupSectionsHaveRows(
  sections: SetupFormSection[],
): SetupFormSection[] {
  if (!sections.length) {
    return buildDefaultSetupSections([]);
  }
  return sections.map((section) => ({
    ...section,
    rows: section.rows.length
      ? section.rows
      : [{ id: createSetupRowId(), fields: [] }],
  }));
}

export function countSetupSectionFields(section: SetupFormSection): number {
  return section.rows.reduce((sum, row) => sum + row.fields.length, 0);
}

export function countSetupSectionRows(section: SetupFormSection): number {
  return section.rows.filter((row) => row.fields.length > 0).length;
}

export function createEmptySetupSection(name = ''): SetupFormSection {
  return {
    id: createSetupSectionId(),
    name: name.trim(),
    rows: [{ id: createSetupRowId(), fields: [] }],
  };
}

export function addSetupSection(
  sections: SetupFormSection[],
  name: string,
): SetupFormSection[] {
  return ensureSetupSectionsHaveRows([
    ...sections,
    createEmptySetupSection(name),
  ]);
}

export function renameSetupSection(
  sections: SetupFormSection[],
  sectionId: string,
  name: string,
): SetupFormSection[] {
  const nextName = name.trim();
  return sections.map((section) =>
    section.id === sectionId ? { ...section, name: nextName } : section,
  );
}

/**
 * Remove a section. Fields are discarded with the section (same as Form Template).
 * Always leaves at least one empty section.
 */
export function removeSetupSection(
  sections: SetupFormSection[],
  sectionId: string,
): SetupFormSection[] {
  const next = sections.filter((section) => section.id !== sectionId);
  return ensureSetupSectionsHaveRows(
    next.length ? next : [createEmptySetupSection('')],
  );
}

export function duplicateSetupSection(
  sections: SetupFormSection[],
  sectionId: string,
): SetupFormSection[] {
  const source = sections.find((section) => section.id === sectionId);
  if (!source) {
    return sections;
  }

  const baseName = source.name.trim() || 'Section';
  let name = `${baseName} Copy`;
  let suffix = 2;
  const names = new Set(
    sections.map((section) => section.name.trim().toLocaleLowerCase()),
  );
  while (names.has(name.toLocaleLowerCase())) {
    name = `${baseName} Copy ${suffix}`;
    suffix += 1;
  }

  const duplicated: SetupFormSection = {
    id: createSetupSectionId(),
    name,
    rows: source.rows.map((row) => ({
      id: createSetupRowId(),
      fields: row.fields.map((field) => ({
        ...field,
        id: generateFieldId(),
        name: `${field.name || field.type}_copy`,
      })),
    })),
  };

  const index = sections.findIndex((section) => section.id === sectionId);
  const next = [...sections];
  next.splice(index >= 0 ? index + 1 : next.length, 0, duplicated);
  return ensureSetupSectionsHaveRows(next);
}

export function reorderSetupSections(
  sections: SetupFormSection[],
  fromIndex: number,
  toIndex: number,
): SetupFormSection[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= sections.length ||
    toIndex >= sections.length
  ) {
    return sections;
  }
  const next = [...sections];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function formatSetupSectionMeta(
  section: SetupFormSection,
  index: number,
): string {
  const rows = countSetupSectionRows(section);
  const fields = countSetupSectionFields(section);
  const rowLabel = rows === 1 ? 'ROW' : 'ROWS';
  const fieldLabel = fields === 1 ? 'FIELD' : 'FIELDS';
  return `SECTION ${index + 1} • ${rows} ${rowLabel} • ${fields} ${fieldLabel}`;
}

/** True when drag data is a Setup section (not a palette/canvas field). */
export function isSetupSectionDragData(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const candidate = data as Partial<SetupFormSection>;
  // Fields/palette items never carry a rows array; sections always do.
  return typeof candidate.id === 'string' && Array.isArray(candidate.rows);
}

/**
 * Remove a field from every row except an optional drop-target row, then prune
 * emptied rows. The keep row must survive even when it is still empty so the
 * caller can insert into that same row object (empty 2nd+ sections).
 */
export function removeSetupFieldFromOtherRows(
  sections: SetupFormSection[],
  fieldId: string,
  keepSectionId: string,
  keepRowId: string | null,
): void {
  for (const section of sections) {
    for (const row of section.rows) {
      if (section.id === keepSectionId && row.id === keepRowId) {
        continue;
      }
      row.fields = row.fields.filter((field) => field.id !== fieldId);
    }

    section.rows = section.rows.filter((row) => {
      if (
        section.id === keepSectionId &&
        keepRowId != null &&
        row.id === keepRowId
      ) {
        return true;
      }
      return row.fields.length > 0;
    });

    if (!section.rows.length) {
      section.rows.push({ id: createSetupRowId(), fields: [] });
    }
  }
}

/**
 * Insert a field into an existing (possibly empty) row after relocating it.
 * Mirrors the Setup canvas onRowDrop path for empty-section drops.
 */
export function insertFieldIntoSetupRow(
  sections: SetupFormSection[],
  sectionId: string,
  rowId: string,
  field: FormField,
  insertIndex?: number,
): SetupFormSection[] {
  const next = sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({
      ...row,
      fields: [...row.fields],
    })),
  }));

  const targetSection = next.find((section) => section.id === sectionId);
  const targetRow = targetSection?.rows.find((row) => row.id === rowId);
  if (!targetSection || !targetRow) {
    return sections;
  }

  removeSetupFieldFromOtherRows(next, field.id, sectionId, rowId);

  // Target row must still be the same object identity after prune.
  const kept = targetSection.rows.find((row) => row.id === rowId);
  if (!kept) {
    return sections;
  }

  const siblings = [...kept.fields];
  const index = Math.min(
    Math.max(insertIndex ?? siblings.length, 0),
    siblings.length,
  );
  siblings.splice(index, 0, {
    ...field,
    width: normalizeBuilderWidthUnits(field.width),
  });
  kept.fields = siblings;
  return next;
}

export function findSetupFieldRow(
  sections: SetupFormSection[],
  fieldId: string,
): { sectionId: string; rowId: string; row: SetupFormRow } | null {
  for (const section of sections) {
    for (const row of section.rows) {
      if (row.fields.some((field) => field.id === fieldId)) {
        return { sectionId: section.id, rowId: row.id, row };
      }
    }
  }
  return null;
}

export function setupRowCanAddColumn(row: SetupFormRow): boolean {
  return rowHasAvailableColumnSpace(row.fields);
}

export function setupRowRemainingUnits(row: SetupFormRow): number {
  return rowRemainingGridUnits(row.fields);
}

export function setupRowUsedFlexBasis(row: SetupFormRow): string {
  const used = Math.max(0, 12 - setupRowRemainingUnits(row));
  if (used <= 0) {
    return '100%';
  }
  return `calc(${(used / 12) * 100}% - 0.5rem)`;
}

export function setupRowAddColumnFlexBasis(row: SetupFormRow): string {
  const remaining = setupRowRemainingUnits(row);
  if (remaining <= 0) {
    return '0%';
  }
  return `calc(${(remaining / 12) * 100}% - 0.5rem)`;
}

/**
 * Width-in-row for a field just created in the Setup User, Item, or Vendor
 * builders. One-third (4 of 12) when the row can hold it.
 * Saved fields are not passed through this helper.
 */
export function defaultSetupNewFieldWidth(remainingUnits?: number): number {
  return remainingUnits == null
    ? preferredNewFieldBuilderWidth()
    : preferredNewFieldBuilderWidth(remainingUnits);
}

/**
 * Place a duplicated field after its source.
 * The copy keeps the source width. When that width does not fit, it starts
 * the next row instead of overflowing the current one.
 */
export function insertDuplicatedSetupField(
  sections: SetupFormSection[],
  sourceFieldId: string,
  duplicate: FormField,
): SetupFormSection[] {
  const next = sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({ ...row, fields: [...row.fields] })),
  }));

  const copy: FormField = {
    ...duplicate,
    width: normalizeBuilderWidthUnits(duplicate.width),
  };
  const location = findSetupFieldRow(next, sourceFieldId);

  if (!location) {
    if (next[0]) {
      next[0].rows.push({ id: createSetupRowId(), fields: [copy] });
    }
    return next.length ? next : buildDefaultSetupSections([copy]);
  }

  const section = next.find((item) => item.id === location.sectionId);
  const row = section?.rows.find((item) => item.id === location.rowId);
  if (!section || !row) {
    return next;
  }

  const index = row.fields.findIndex((item) => item.id === sourceFieldId);
  const remaining = rowRemainingGridUnits(row.fields);

  if (remaining >= copy.width!) {
    row.fields.splice(index + 1, 0, copy);
    return next;
  }

  const rowIndex = section.rows.findIndex((item) => item.id === row.id);
  section.rows.splice(Math.max(rowIndex, 0) + 1, 0, {
    id: createSetupRowId(),
    fields: [copy],
  });
  return next;
}

export function clampWidthForRemaining(
  remaining: number,
  requested?: number | null,
): number {
  const fitting = largestFittingBuilderWidth(remaining);
  if (fitting <= 0) {
    return ROW_WIDTH_UNITS.full;
  }
  const want = normalizeBuilderWidthUnits(requested);
  return Math.min(want, fitting);
}

/** Build DynamicForm layoutSections from stored layout + resolved fields. */
export function buildDynamicLayoutSections(
  fields: DynamicField[],
  storedSections: unknown,
): DynamicFormSectionLayout[] {
  const builderLike: FormField[] = fields.map((field) => ({
    ...(field as unknown as FormField),
    id: field.id,
    width: field.width ?? 12,
  }));
  const sections = hydrateSetupSections(builderLike, storedSections);
  const byId = new Map(fields.map((field) => [field.id, field] as const));

  return sections
    .map((section) => ({
      id: section.id,
      name: section.name,
      rows: section.rows
        .map((row) =>
          row.fields
            .map((field) => byId.get(field.id))
            .filter((field): field is DynamicField => !!field),
        )
        .filter((row) => row.length > 0),
    }))
    .filter((section) => section.rows.length > 0);
}
