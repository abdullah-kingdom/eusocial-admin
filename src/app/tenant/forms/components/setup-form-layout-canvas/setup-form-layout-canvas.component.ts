import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CdkDrag, CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { FormCanvasComponent } from '../../../form-builder/components/form-canvas/form-canvas.component';
import { FormField } from '../../../form-builder/models/form-field.model';
import { applyCanvasDrop } from '../../../form-builder/utils/form-field-operations';
import {
  buildPlaceholderFromLabel,
  createFieldFromTemplate,
  supportsPlaceholderAutoGeneration,
} from '../../../form-builder/utils/form-field.factory';
import {
  addSetupSection,
  clampWidthForRemaining,
  createSetupRowId,
  defaultSetupNewFieldWidth,
  duplicateSetupSection,
  formatSetupSectionMeta,
  isSetupSectionDragData,
  removeSetupFieldFromOtherRows,
  removeSetupSection,
  renameSetupSection,
  reorderSetupSections,
  setupRowAddColumnFlexBasis,
  setupRowCanAddColumn,
  setupRowUsedFlexBasis,
  type SetupFormRow,
  type SetupFormSection,
} from '../../utils/setup-form-layout.utils';
import {
  largestFittingBuilderWidth,
  normalizeBuilderWidthUnits,
  rowRemainingGridUnits,
} from '../../../pages/extra-management/forms/utils/field-builder-adapter.utils';

@Component({
  selector: 'app-setup-form-layout-canvas',
  standalone: true,
  imports: [CommonModule, DragDropModule, FormCanvasComponent],
  templateUrl: './setup-form-layout-canvas.component.html',
  styleUrl: './setup-form-layout-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupFormLayoutCanvasComponent {
  @Input({ required: true }) sections: SetupFormSection[] = [];
  @Input() selectedFieldId: string | null = null;
  @Input() paletteListId = 'setupPaletteList';
  @Input() selectionMode = false;
  @Input() selectedFieldIds: string[] = [];
  @Input() interactionsDisabled = false;

  @Output() sectionsChange = new EventEmitter<SetupFormSection[]>();
  @Output() selectField = new EventEmitter<FormField>();
  @Output() toggleFieldSelection = new EventEmitter<FormField>();

  @ViewChild('renameInput') renameInput?: ElementRef<HTMLInputElement>;

  readonly emptyDropListData: FormField[] = [];

  renamingSectionId: string | null = null;
  renameDraft = '';
  private readonly collapsedSectionIds = new Set<string>();

  constructor(private readonly cdr: ChangeDetectorRef) {}

  /**
   * Only Setup sections may enter the section reorder list.
   * Rejects field-palette / row-canvas drags so nested field DnD into
   * the 2nd+ section is not swallowed by the parent drop list
   * (same pattern as Form Template's sectionDropListEnterPredicate).
   */
  readonly sectionDropListEnterPredicate = (drag: CdkDrag) =>
    isSetupSectionDragData(drag.data);

  rowCanvasListId(sectionId: string, rowId: string): string {
    return `setupCanvas_${sectionId}_${rowId}`;
  }

  rowAddColumnListId(sectionId: string, rowId: string): string {
    return `setupAddCol_${sectionId}_${rowId}`;
  }

  sectionNewRowListId(sectionId: string): string {
    return `setupNewRow_${sectionId}`;
  }

  /** All layout drop targets + palette — for cross-row / palette DnD. */
  get connectedDropLists(): string[] {
    const ids: string[] = [this.paletteListId];
    for (const section of this.sections || []) {
      if (this.isSectionCollapsed(section.id)) {
        continue;
      }
      for (const row of section.rows) {
        ids.push(this.rowCanvasListId(section.id, row.id));
        if (this.rowCanAddColumn(row) && !this.interactionsDisabled) {
          ids.push(this.rowAddColumnListId(section.id, row.id));
        }
      }
      if (!this.interactionsDisabled) {
        ids.push(this.sectionNewRowListId(section.id));
      }
    }
    return ids;
  }

  /** IDs the palette should connect to (excludes itself). */
  get paletteTargetDropLists(): string[] {
    return this.connectedDropLists.filter((id) => id !== this.paletteListId);
  }

  sectionMeta(section: SetupFormSection, index: number): string {
    return formatSetupSectionMeta(section, index);
  }

  sectionDisplayName(section: SetupFormSection, index: number): string {
    const name = section.name?.trim();
    return name || `Section ${index + 1}`;
  }

  isSectionCollapsed(sectionId: string): boolean {
    return this.collapsedSectionIds.has(sectionId);
  }

  toggleSectionCollapsed(sectionId: string): void {
    if (this.collapsedSectionIds.has(sectionId)) {
      this.collapsedSectionIds.delete(sectionId);
    } else {
      this.collapsedSectionIds.add(sectionId);
    }
    this.cdr.markForCheck();
  }

  addSection(): void {
    const nextIndex = (this.sections?.length || 0) + 1;
    const next = addSetupSection(this.cloneSections(), `Section ${nextIndex}`);
    const created = next[next.length - 1];
    this.emitSections(next);
    if (created) {
      this.startRename(created);
    }
  }

  startRename(section: SetupFormSection): void {
    this.renamingSectionId = section.id;
    this.renameDraft = section.name?.trim() || '';
    this.cdr.markForCheck();
    setTimeout(() => {
      this.renameInput?.nativeElement?.focus();
      this.renameInput?.nativeElement?.select();
    }, 0);
  }

  cancelRename(): void {
    this.renamingSectionId = null;
    this.renameDraft = '';
    this.cdr.markForCheck();
  }

  commitRename(sectionId: string): void {
    const name = this.renameDraft.trim();
    if (!name) {
      return;
    }
    const duplicate = this.sections.some(
      (section) =>
        section.id !== sectionId &&
        section.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (duplicate) {
      return;
    }
    this.emitSections(renameSetupSection(this.cloneSections(), sectionId, name));
    this.cancelRename();
  }

  duplicateSection(sectionId: string): void {
    this.emitSections(duplicateSetupSection(this.cloneSections(), sectionId));
  }

  deleteSection(sectionId: string): void {
    if (this.renamingSectionId === sectionId) {
      this.cancelRename();
    }
    this.collapsedSectionIds.delete(sectionId);
    this.emitSections(removeSetupSection(this.cloneSections(), sectionId));
  }

  onSectionsDrop(event: CdkDragDrop<SetupFormSection[]>): void {
    if (event.previousContainer !== event.container) {
      return;
    }
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    this.emitSections(
      reorderSetupSections(
        this.cloneSections(),
        event.previousIndex,
        event.currentIndex,
      ),
    );
  }

  rowCanAddColumn(row: SetupFormRow): boolean {
    return setupRowCanAddColumn(row);
  }

  rowUsedFlexBasis(row: SetupFormRow): string {
    return setupRowUsedFlexBasis(row);
  }

  rowAddColumnFlexBasis(row: SetupFormRow): string {
    return setupRowAddColumnFlexBasis(row);
  }

  onRowDrop(
    sectionId: string,
    rowId: string,
    event: CdkDragDrop<FormField[]>,
  ): void {
    const sections = this.cloneSections();
    const target = this.findRow(sections, sectionId, rowId);
    if (!target) {
      return;
    }

    const current = [...target.row.fields];

    if (event.previousContainer === event.container) {
      const result = applyCanvasDrop(event, current);
      target.row.fields = result.schema;
      this.emitSections(sections);
      return;
    }

    // Cross-list: if no capacity, append as a new row instead.
    if (current.length > 0 && rowRemainingGridUnits(current) < 4) {
      this.insertFieldAsNewRow(sections, sectionId, rowId, event);
      return;
    }

    const moved = this.resolveIncomingField(event);
    this.removeFieldFromOtherRows(sections, moved.id, sectionId, rowId);

    const siblings = [...target.row.fields];
    const fitting = largestFittingBuilderWidth(rowRemainingGridUnits(siblings));
    const widthAdjusted: FormField = {
      ...moved,
      width:
        fitting > 0
          ? Math.min(normalizeBuilderWidthUnits(moved.width), fitting)
          : normalizeBuilderWidthUnits(moved.width),
    };

    const insertIndex = Math.min(
      Math.max(event.currentIndex, 0),
      siblings.length,
    );
    siblings.splice(insertIndex, 0, widthAdjusted);
    target.row.fields = siblings;

    this.emitSections(sections);
    this.selectField.emit(widthAdjusted);
  }

  onAddColumnDrop(
    sectionId: string,
    rowId: string,
    event: CdkDragDrop<FormField[]>,
  ): void {
    if (event.previousContainer === event.container) {
      return;
    }

    const sections = this.cloneSections();
    const target = this.findRow(sections, sectionId, rowId);
    if (!target) {
      return;
    }

    if (!setupRowCanAddColumn(target.row)) {
      this.insertFieldAsNewRow(sections, sectionId, rowId, event);
      return;
    }

    const appendEvent = {
      ...event,
      currentIndex: target.row.fields.length,
    } as CdkDragDrop<FormField[]>;
    this.onRowDrop(sectionId, rowId, appendEvent);
  }

  onNewRowDrop(sectionId: string, event: CdkDragDrop<FormField[]>): void {
    if (event.previousContainer === event.container) {
      return;
    }
    const sections = this.cloneSections();
    this.insertFieldAsNewRow(sections, sectionId, null, event);
  }

  /**
   * Drop onto the empty-row placeholder ("Drag fields here…").
   * Routes through the same row-insert path as a populated canvas drop.
   */
  onEmptyRowDrop(
    sectionId: string,
    rowId: string,
    event: CdkDragDrop<FormField[]>,
  ): void {
    if (event.previousContainer === event.container) {
      return;
    }
    this.onRowDrop(sectionId, rowId, event);
  }

  addEmptyRow(sectionId: string): void {
    const sections = this.cloneSections();
    const section = sections.find((item) => item.id === sectionId);
    if (!section) {
      return;
    }
    section.rows.push({ id: createSetupRowId(), fields: [] });
    this.emitSections(sections);
  }

  removeEmptyRow(sectionId: string, rowId: string): void {
    const sections = this.cloneSections();
    const section = sections.find((item) => item.id === sectionId);
    if (!section) {
      return;
    }
    const row = section.rows.find((item) => item.id === rowId);
    if (!row || row.fields.length) {
      return;
    }
    section.rows = section.rows.filter((item) => item.id !== rowId);
    if (!section.rows.length) {
      section.rows.push({ id: createSetupRowId(), fields: [] });
    }
    this.emitSections(sections);
  }

  /** Palette templates are created; existing canvas fields are moved as-is. */
  private resolveIncomingField(event: CdkDragDrop<FormField[]>): FormField {
    const data = event.item.data as FormField;
    const fromPalette =
      String(event.previousContainer.id) === this.paletteListId;

    if (!fromPalette && data?.id) {
      return { ...data };
    }

    const field = createFieldFromTemplate(data as Partial<FormField>);
    if (supportsPlaceholderAutoGeneration(field.type)) {
      field.placeholder = buildPlaceholderFromLabel(field.label);
    }
    // New palette fields default to 1/3. Existing canvas moves return above
    // and keep the width already stored on the field.
    field.width = defaultSetupNewFieldWidth();
    return field;
  }

  private insertFieldAsNewRow(
    sections: SetupFormSection[],
    sectionId: string,
    afterRowId: string | null,
    event: CdkDragDrop<FormField[]>,
  ): void {
    const section = sections.find((item) => item.id === sectionId);
    if (!section) {
      return;
    }

    const field = this.resolveIncomingField(event);
    this.removeFieldFromOtherRows(sections, field.id, sectionId, null);

    const widthAdjusted: FormField = {
      ...field,
      width: clampWidthForRemaining(12, field.width),
    };
    const newRow: SetupFormRow = {
      id: createSetupRowId(),
      fields: [widthAdjusted],
    };

    if (afterRowId) {
      const index = section.rows.findIndex((row) => row.id === afterRowId);
      const insertAt = index >= 0 ? index + 1 : section.rows.length;
      section.rows.splice(insertAt, 0, newRow);
    } else {
      section.rows.push(newRow);
    }

    // Drop empty rows left behind when moving the last field out.
    section.rows = section.rows.filter(
      (row) => row.fields.length > 0 || row.id === newRow.id,
    );

    this.emitSections(sections);
    this.selectField.emit(widthAdjusted);
  }

  private removeFieldFromOtherRows(
    sections: SetupFormSection[],
    fieldId: string,
    keepSectionId: string,
    keepRowId: string | null,
  ): void {
    removeSetupFieldFromOtherRows(sections, fieldId, keepSectionId, keepRowId);
  }

  private findRow(
    sections: SetupFormSection[],
    sectionId: string,
    rowId: string,
  ): { section: SetupFormSection; row: SetupFormRow } | null {
    const section = sections.find((item) => item.id === sectionId);
    const row = section?.rows.find((item) => item.id === rowId);
    if (!section || !row) {
      return null;
    }
    return { section, row };
  }

  private cloneSections(): SetupFormSection[] {
    return this.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => ({
        ...row,
        fields: row.fields.map((field) => ({ ...field })),
      })),
    }));
  }

  private emitSections(sections: SetupFormSection[]): void {
    // Ensure every section has at least one row slot for drops.
    for (const section of sections) {
      if (!section.rows.length) {
        section.rows.push({ id: createSetupRowId(), fields: [] });
      }
    }
    this.sectionsChange.emit(sections);
  }
}
