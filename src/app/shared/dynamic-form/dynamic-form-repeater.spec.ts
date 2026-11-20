import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { DynamicFormComponent } from './dynamic-form.component';
import { DynamicField } from '../../interfaces/dynamic-field';
import { DropdownOverlayService } from '../directives/dropdown-panel/dropdown-overlay.service';
import { LocationCacheService } from '../../services/location-cache.service';
import { FormImageUploadService } from '../../tenant/form-builder/services/form-image-upload.service';
import { DynamicModuleOptionsService } from '../../tenant/form-builder/services/dynamic-module-options.service';
import { FormStorageService } from '../../tenant/forms/services/form-storage.service';
import { FlatpickrDirective } from '../directives/flatpickr/flatpickr.directive';
import { DropdownPanelDirective } from '../directives/dropdown-panel/dropdown-panel.directive';
import {
  buildDynamicFormGroupConfig,
  getRepeaterChildSeedValue,
  syncRepeaterFormGroup,
} from './dynamic-form.builder';
import { FormBuilder } from '@angular/forms';

describe('DynamicFormComponent repeater runtime', () => {
  let fixture: ComponentFixture<DynamicFormComponent>;
  let component: DynamicFormComponent;

  const itemsField = (): DynamicField => ({
    id: 'fld_items',
    name: 'items',
    type: 'select',
    selectionType: 'multi',
    label: 'Items',
    options: [
      { id: 'apple-id', label: 'Apple', value: 'apple-id' },
      { id: 'banana-id', label: 'Banana', value: 'banana-id' },
      { id: 'orange-id', label: 'Orange', value: 'orange-id' },
    ],
    defaultValue: [],
  });

  const quantityField = (overrides: Partial<DynamicField> = {}): DynamicField => ({
    id: 'fld_qty',
    name: 'quantity',
    type: 'number',
    label: 'Quantity',
    required: true,
    repeaterConfig: { enabled: true, sourceFieldId: 'fld_items' },
    ...overrides,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DynamicFormComponent, DropdownPanelDirective],
      imports: [CommonModule, ReactiveFormsModule, FlatpickrDirective],
      providers: [
        {
          provide: DropdownOverlayService,
          useValue: {
            close: () => undefined,
            open: () => undefined,
            isOpen: () => false,
            register: () => undefined,
            unregister: () => undefined,
          },
        },
        {
          provide: LocationCacheService,
          useValue: {
            getCachedResponse: () => null,
            setCachedResponse: () => undefined,
            getCountries: () => of([]),
            getStates: () => of([]),
            getCities: () => of([]),
          },
        },
        {
          provide: FormImageUploadService,
          useValue: { upload: () => of(null) },
        },
        {
          provide: DynamicModuleOptionsService,
          useValue: {
            getModuleData: () => of({ records: [], columns: [] }),
          },
        },
        {
          provide: FormStorageService,
          useValue: {
            getEndpointApi: () => of({ data: [] }),
          },
        },
        {
          provide: ToastrService,
          useValue: {
            success: () => undefined,
            error: () => undefined,
            warning: () => undefined,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DynamicFormComponent);
    component = fixture.componentInstance;
  });

  function setFields(fields: DynamicField[]): void {
    fixture.componentRef.setInput('fields', fields);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }

  it('creates three repeated controls with human-readable labels', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: ['apple-id', 'banana-id', 'orange-id'] },
      quantityField({ defaultValue: null }),
    ]);

    const instances = component.getRepeaterInstances(quantityField());
    expect(instances.map((item) => item.id)).toEqual([
      'apple-id',
      'banana-id',
      'orange-id',
    ]);
    expect(instances.map((item) => item.label)).toEqual([
      'Apple Quantity',
      'Banana Quantity',
      'Orange Quantity',
    ]);

    const group = component.form.get('quantity');
    expect(group instanceof FormGroup).toBeTrue();
    expect(Object.keys((group as FormGroup).controls)).toEqual([
      'apple-id',
      'banana-id',
      'orange-id',
    ]);
  }));

  it('stores values under source ids and preserves them across reorder', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: ['apple-id', 'banana-id'] },
      quantityField({ defaultValue: null }),
    ]);

    component.form.get(['quantity', 'apple-id'])?.setValue(10);
    component.form.get(['quantity', 'banana-id'])?.setValue(5);
    fixture.detectChanges();

    component.form.get('items')?.setValue(['banana-id', 'apple-id']);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(component.form.get(['quantity', 'apple-id'])?.value).toBe(10);
    expect(component.form.get(['quantity', 'banana-id'])?.value).toBe(5);
    expect(component.value['quantity']).toEqual({
      'apple-id': 10,
      'banana-id': 5,
    });
  }));

  it('removes only the deselected item value and clears when source is empty', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: ['apple-id', 'banana-id', 'orange-id'] },
      quantityField({
        value: { 'apple-id': 10, 'banana-id': 5, 'orange-id': 8 },
        defaultValue: { 'apple-id': 10, 'banana-id': 5, 'orange-id': 8 },
      }),
    ]);

    component.form.get('items')?.setValue(['apple-id', 'orange-id']);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(component.value['quantity']).toEqual({
      'apple-id': 10,
      'orange-id': 8,
    });

    component.form.get('items')?.setValue([]);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(component.value['quantity']).toEqual({});
    expect(component.getRepeaterInstances(quantityField()).length).toBe(0);
  }));

  it('seeds new instances from static default without overwriting existing values', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: ['apple-id'] },
      quantityField({ defaultValue: 7 }),
    ]);

    expect(component.form.get(['quantity', 'apple-id'])?.value).toBe(7);
    component.form.get(['quantity', 'apple-id'])?.setValue(99);

    component.form.get('items')?.setValue(['apple-id', 'banana-id']);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(component.form.get(['quantity', 'apple-id'])?.value).toBe(99);
    expect(component.form.get(['quantity', 'banana-id'])?.value).toBe(7);
  }));

  it('restores draft maps by source id and seeds new ids from static default', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: ['apple-id', 'banana-id', 'orange-id'] },
      quantityField({
        value: { 'apple-id': 10, 'banana-id': 5 },
        defaultValue: 1,
      }),
    ]);

    expect(component.form.get(['quantity', 'apple-id'])?.value).toBe(10);
    expect(component.form.get(['quantity', 'banana-id'])?.value).toBe(5);
    expect(component.form.get(['quantity', 'orange-id'])?.value).toBe(1);
    expect(component.value['quantity']).toEqual({
      'apple-id': 10,
      'banana-id': 5,
      'orange-id': 1,
    });
  }));

  it('keeps existing values when selecting a new item after hydration-style defaults', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: ['apple-id', 'banana-id'] },
      quantityField({
        value: { 'apple-id': 10, 'banana-id': 1 },
        defaultValue: 1,
      }),
    ]);

    component.form.get('items')?.setValue(['apple-id', 'banana-id', 'orange-id']);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(component.form.get(['quantity', 'apple-id'])?.value).toBe(10);
    expect(component.form.get(['quantity', 'banana-id'])?.value).toBe(1);
    expect(component.form.get(['quantity', 'orange-id'])?.value).toBe(1);
  }));

  it('applies required validation per selected item and clears errors on deselect', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: ['apple-id', 'banana-id'] },
      quantityField({ defaultValue: null, required: true }),
    ]);

    const apple = component.form.get(['quantity', 'apple-id']);
    const banana = component.form.get(['quantity', 'banana-id']);
    apple?.markAsTouched();
    banana?.markAsTouched();
    apple?.updateValueAndValidity();
    banana?.updateValueAndValidity();

    expect(apple?.invalid).toBeTrue();
    expect(banana?.invalid).toBeTrue();
    expect(component.form.invalid).toBeTrue();

    apple?.setValue(3);
    component.form.get('items')?.setValue(['apple-id']);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(component.form.get(['quantity', 'banana-id'])).toBeNull();
    expect(component.form.get(['quantity', 'apple-id'])?.valid).toBeTrue();
  }));

  it('marks a required repeater invalid when no source items are selected', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: [] },
      quantityField({ defaultValue: 1, required: true }),
    ]);

    const group = component.form.get('quantity');
    group?.markAsTouched();
    group?.updateValueAndValidity();

    expect(group?.errors?.['repeaterRequiredSelection']).toBeTrue();
    expect(component.form.invalid).toBeTrue();
    expect(component.getErrorMessage(quantityField({ required: true }))).toContain(
      'requires at least one selected item',
    );

    component.form.get('items')?.setValue(['apple-id']);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    component.form.get(['quantity', 'apple-id'])?.setValue(4);
    component.form.get('quantity')?.updateValueAndValidity();
    expect(component.form.get('quantity')?.errors).toBeNull();
    expect(component.form.valid).toBeTrue();

    component.form.get('items')?.setValue([]);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(component.form.get('quantity')?.errors?.['repeaterRequiredSelection']).toBeTrue();
  }));

  it('allows a non-required empty repeater to remain valid', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: [] },
      quantityField({ defaultValue: 1, required: false }),
    ]);

    expect(component.form.get('quantity')?.valid).toBeTrue();
    expect(component.form.valid).toBeTrue();
  }));

  it('does not throw when scalar Set Value targets a repeater FormGroup', fakeAsync(() => {
    setFields([
      { ...itemsField(), defaultValue: ['apple-id'] },
      quantityField({
        defaultValue: 1,
        condition: {
          enabled: true,
          when: { logic: 'and', rules: [] },
          actions: [{ type: 'setValue', source: { kind: 'fixed', value: 99 } }],
        },
      }),
    ]);

    expect(component.form.get(['quantity', 'apple-id'])?.value).toBe(1);
    expect(() => {
      component.form.get('items')?.setValue(['apple-id', 'banana-id']);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();
    }).not.toThrow();
    // Scalar Set Value must not overwrite repeater child values.
    expect(component.form.get(['quantity', 'apple-id'])?.value).toBe(1);
    expect(component.form.get(['quantity', 'banana-id'])?.value).toBe(1);
  }));

  it('does not apply dynamic defaults to repeater fields', fakeAsync(() => {
    setFields([
      {
        id: 'source_email',
        name: 'source_email',
        type: 'email',
        label: 'Source Email',
        defaultValue: 'ada@example.com',
      },
      { ...itemsField(), defaultValue: ['apple-id'] },
      quantityField({
        defaultValue: null,
        defaultValueSource: { kind: 'field', fieldId: 'source_email' },
      }),
    ]);

    expect(component.form.get(['quantity', 'apple-id'])?.value).toBeNull();
  }));

  it('leaves non-repeater fields as scalar controls', fakeAsync(() => {
    setFields([
      itemsField(),
      {
        id: 'fld_notes',
        name: 'notes',
        type: 'text',
        label: 'Notes',
        defaultValue: 'hello',
      },
    ]);

    expect(component.form.get('notes') instanceof FormGroup).toBeFalse();
    expect(component.form.get('notes')?.value).toBe('hello');
  }));

  it('does not expand repeaters in typeform mode', fakeAsync(() => {
    fixture.componentRef.setInput('typeformMode', true);
    setFields([
      { ...itemsField(), defaultValue: ['apple-id'] },
      quantityField({ defaultValue: null }),
    ]);

    expect(component.isRuntimeRepeaterField(quantityField())).toBeFalse();
    expect(component.form.get('quantity') instanceof FormGroup).toBeFalse();
  }));

  it('uses hydrated dynamic multi-select labels when options are present', fakeAsync(() => {
    setFields([
      {
        ...itemsField(),
        optionSource: { type: 'dynamic', endpoint: '/items' },
        options: [
          { id: 'rec-1', label: 'Hydrated Apple', value: 'rec-1' },
          { id: 'rec-2', label: 'Hydrated Banana', value: 'rec-2' },
        ],
        defaultValue: ['rec-1', 'rec-2'],
      },
      quantityField({ defaultValue: null }),
    ]);

    expect(component.getRepeaterInstances(quantityField()).map((item) => item.label)).toEqual([
      'Hydrated Apple Quantity',
      'Hydrated Banana Quantity',
    ]);
  }));
});

describe('repeater builder helpers', () => {
  it('builds a FormGroup map and syncs without resetting existing controls', () => {
    const fb = new FormBuilder();
    const field: DynamicField = {
      id: 'fld_qty',
      name: 'quantity',
      type: 'number',
      label: 'Quantity',
      defaultValue: 4,
      repeaterConfig: { enabled: true, sourceFieldId: 'fld_items' },
    };

    const config = buildDynamicFormGroupConfig(fb, [
      {
        id: 'fld_items',
        name: 'items',
        type: 'select',
        selectionType: 'multi',
        label: 'Items',
        defaultValue: [],
      },
      field,
    ]);

    expect(config['quantity'] instanceof FormGroup).toBeTrue();
    const group = config['quantity'] as FormGroup;

    syncRepeaterFormGroup(group, field, ['a', 'b']);
    group.get('a')?.setValue(11);
    syncRepeaterFormGroup(group, field, ['b', 'a', 'c']);

    expect(group.get('a')?.value).toBe(11);
    expect(group.get('c')?.value).toBe(4);
    expect(getRepeaterChildSeedValue(field)).toBe(4);

    syncRepeaterFormGroup(group, field, []);
    expect(Object.keys(group.controls)).toEqual([]);
  });

  it('does not expand unsupported targets even with repeaterConfig present', () => {
    const fb = new FormBuilder();
    const config = buildDynamicFormGroupConfig(fb, [
      {
        id: 'fld_rating',
        name: 'rating',
        type: 'rating',
        label: 'Rating',
        repeaterConfig: { enabled: true, sourceFieldId: 'fld_items' },
      },
    ]);

    expect(config['rating'] instanceof FormGroup).toBeFalse();
  });
});
