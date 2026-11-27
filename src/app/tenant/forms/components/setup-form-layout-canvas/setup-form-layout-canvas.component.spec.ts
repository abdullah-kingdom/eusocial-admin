import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormField } from '../../../form-builder/models/form-field.model';
import {
  addSetupSection,
  buildDefaultSetupSections,
  type SetupFormSection,
} from '../../utils/setup-form-layout.utils';
import { SetupFormLayoutCanvasComponent } from './setup-form-layout-canvas.component';

function field(
  partial: Partial<FormField> & Pick<FormField, 'id' | 'type'>,
): FormField {
  return {
    label: partial.label ?? partial.id,
    placeholder: '',
    required: false,
    options: [],
    width: 12,
    ...partial,
  };
}

function paletteDropEvent(
  template: Partial<FormField>,
  paletteListId: string,
): CdkDragDrop<FormField[]> {
  return {
    previousContainer: { id: paletteListId, data: [template] },
    container: { id: 'target', data: [] },
    previousIndex: 0,
    currentIndex: 0,
    item: { data: template },
    isPointerOverContainer: true,
    distance: { x: 0, y: 0 },
    dropPoint: { x: 0, y: 0 },
    event: new MouseEvent('mouseup'),
  } as unknown as CdkDragDrop<FormField[]>;
}

describe('SetupFormLayoutCanvasComponent multi-section drops', () => {
  let fixture: ComponentFixture<SetupFormLayoutCanvasComponent>;
  let component: SetupFormLayoutCanvasComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupFormLayoutCanvasComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SetupFormLayoutCanvasComponent);
    component = fixture.componentInstance;
    component.paletteListId = 'itemSetupPaletteList';
  });

  it('adds a palette field into an empty second section row', () => {
    let sections: SetupFormSection[] = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    sections = addSetupSection(sections, 'Work');
    component.sections = sections;

    const emitted: SetupFormSection[][] = [];
    component.sectionsChange.subscribe((next) => emitted.push(next));

    const targetSection = sections[1];
    const targetRow = targetSection.rows[0];
    expect(targetRow.fields.length).toBe(0);

    component.onRowDrop(
      targetSection.id,
      targetRow.id,
      paletteDropEvent(
        { type: 'email', label: 'Email Field' },
        component.paletteListId,
      ),
    );

    expect(emitted.length).toBe(1);
    const next = emitted[0];
    expect(next[0].rows[0].fields.map((item) => item.id)).toEqual(['a']);
    expect(next[1].name).toBe('Work');
    expect(next[1].rows[0].fields.length).toBe(1);
    expect(next[1].rows[0].fields[0].type).toBe('email');
    expect(next[1].rows[0].id).toBe(targetRow.id);
  });

  it('adds palette fields into empty third section and keeps section 2 intact', () => {
    let sections: SetupFormSection[] = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    sections = addSetupSection(sections, 'Work');
    sections = addSetupSection(sections, 'Contact');
    sections[1].rows[0].fields = [
      field({ id: 'b', type: 'email', width: 4 }),
    ];
    component.sections = sections;

    const emitted: SetupFormSection[][] = [];
    component.sectionsChange.subscribe((next) => emitted.push(next));

    const third = sections[2];
    component.onRowDrop(
      third.id,
      third.rows[0].id,
      paletteDropEvent(
        { type: 'number', label: 'Number Field' },
        component.paletteListId,
      ),
    );

    const next = emitted[0];
    expect(next[1].rows[0].fields.map((item) => item.id)).toEqual(['b']);
    expect(next[2].rows[0].fields.length).toBe(1);
    expect(next[2].rows[0].fields[0].type).toBe('number');
  });

  it('accepts a drop on the empty-row placeholder for section 2', () => {
    let sections: SetupFormSection[] = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    sections = addSetupSection(sections, 'Work');
    component.sections = sections;

    const emitted: SetupFormSection[][] = [];
    component.sectionsChange.subscribe((next) => emitted.push(next));

    const emptyRowId = sections[1].rows[0].id;
    component.onEmptyRowDrop(
      sections[1].id,
      emptyRowId,
      paletteDropEvent(
        { type: 'textarea', label: 'Textarea Field' },
        component.paletteListId,
      ),
    );

    expect(emitted.length).toBe(1);
    expect(emitted[0][1].rows[0].id).toBe(emptyRowId);
    expect(emitted[0][1].rows[0].fields[0].type).toBe('textarea');
  });

  it('accepts a drop on the section new-row sink for section 2', () => {
    let sections: SetupFormSection[] = buildDefaultSetupSections([
      field({ id: 'a', type: 'text', width: 4 }),
    ]);
    sections = addSetupSection(sections, 'Work');
    component.sections = sections;

    const emitted: SetupFormSection[][] = [];
    component.sectionsChange.subscribe((next) => emitted.push(next));

    component.onNewRowDrop(
      sections[1].id,
      paletteDropEvent(
        { type: 'textarea', label: 'Notes' },
        component.paletteListId,
      ),
    );

    const next = emitted[0];
    expect(next[1].rows.some((row) => row.fields.some((f) => f.type === 'textarea'))).toBe(
      true,
    );
  });
});
