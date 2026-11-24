import { moveItemInArray } from '@angular/cdk/drag-drop';
import { FormSection } from '../models/dynamic-form.models';

/**
 * Returns a new sections array with one section moved from `fromIndex` to `toIndex`.
 * Preserves every section object (rows/fields) by reference — order only.
 */
export function reorderFormSections(
  sections: readonly FormSection[],
  fromIndex: number,
  toIndex: number,
): FormSection[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= sections.length ||
    toIndex >= sections.length
  ) {
    return [...sections];
  }

  const next = [...sections];
  moveItemInArray(next, fromIndex, toIndex);
  return next;
}
