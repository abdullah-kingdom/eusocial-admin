import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { DynamicFormComponent } from './dynamic-form.component';
import { DynamicField } from '../../interfaces/dynamic-field';
import { DropdownOverlayService } from '../directives/dropdown-panel/dropdown-overlay.service';
import { LocationCacheService } from '../../services/location-cache.service';
import { FormImageUploadService } from '../../tenant/form-builder/services/form-image-upload.service';
import { DynamicModuleOptionsService } from '../../tenant/form-builder/services/dynamic-module-options.service';
import { FormStorageService } from '../../tenant/forms/services/form-storage.service';
import { CommonModule } from '@angular/common';
import { FlatpickrDirective } from '../directives/flatpickr/flatpickr.directive';
import { DropdownPanelDirective } from '../directives/dropdown-panel/dropdown-panel.directive';

describe('DynamicFormComponent dynamic defaults runtime', () => {
  let fixture: ComponentFixture<DynamicFormComponent>;
  let component: DynamicFormComponent;
  let relatedRecords: Record<string, unknown>[];

  beforeEach(async () => {
    relatedRecords = [];

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
            getModuleData: () =>
              of({
                records: relatedRecords,
                columns: [],
              }),
          },
        },
        {
          provide: FormStorageService,
          useValue: {
            getEndpointApi: () => of({ data: relatedRecords }),
          },
        },
        {
          provide: ToastrService,
          useValue: { success: () => undefined, error: () => undefined, warning: () => undefined },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DynamicFormComponent);
    component = fixture.componentInstance;
  });

  function setFields(fields: DynamicField[]): void {
    fixture.componentRef.setInput('fields', fields);
    fixture.detectChanges();
    tick(); // flush buildForm queueMicrotask
    fixture.detectChanges();
  }

  function runtime(): {
    storeRelatedRecords: (endpoint: string, records: Record<string, unknown>[]) => void;
    refreshSetValueAfterRelatedLoad: () => void;
  } {
    return component as unknown as {
      storeRelatedRecords: (endpoint: string, records: Record<string, unknown>[]) => void;
      refreshSetValueAfterRelatedLoad: () => void;
    };
  }

  it('resolves Field → Field defaults at initialization when source is populated', fakeAsync(() => {
    setFields([
      {
        id: 'source',
        name: 'source',
        type: 'email',
        label: 'Source',
        defaultValue: 'ada@example.com',
      },
      {
        id: 'target',
        name: 'target',
        type: 'email',
        label: 'Target',
        defaultValue: '',
        defaultValueSource: { kind: 'field', fieldId: 'source' },
      },
    ]);

    expect(component.form.get('target')?.value).toBe('ada@example.com');
  }));

  it('re-resolves Field → Field when the source changes later', fakeAsync(() => {
    setFields([
      {
        id: 'source',
        name: 'source',
        type: 'text',
        label: 'Source',
        defaultValue: 'first',
      },
      {
        id: 'target',
        name: 'target',
        type: 'text',
        label: 'Target',
        defaultValue: '',
        defaultValueSource: { kind: 'field', fieldId: 'source' },
      },
    ]);

    expect(component.form.get('target')?.value).toBe('first');

    component.form.get('source')?.setValue('second');
    tick();
    fixture.detectChanges();

    expect(component.form.get('target')?.value).toBe('second');
  }));

  it('does not overwrite a user-edited target when the source changes', fakeAsync(() => {
    setFields([
      {
        id: 'source',
        name: 'source',
        type: 'text',
        label: 'Source',
        defaultValue: 'first',
      },
      {
        id: 'target',
        name: 'target',
        type: 'text',
        label: 'Target',
        defaultValue: '',
        defaultValueSource: { kind: 'field', fieldId: 'source' },
      },
    ]);

    const target = component.form.get('target');
    // Mirror UI interaction: controls become dirty before/with the user change event.
    target?.markAsDirty();
    target?.setValue('manual');
    tick();
    fixture.detectChanges();

    component.form.get('source')?.setValue('changed-source');
    tick();
    fixture.detectChanges();

    expect(component.form.get('target')?.value).toBe('manual');
  }));

  it('does not overwrite hydrated answers on dynamic-default targets', fakeAsync(() => {
    setFields([
      {
        id: 'source',
        name: 'source',
        type: 'text',
        label: 'Source',
        defaultValue: 'from-source',
      },
      {
        id: 'target',
        name: 'target',
        type: 'text',
        label: 'Target',
        value: 'submitted-answer',
        defaultValue: 'submitted-answer',
        defaultValueSource: { kind: 'field', fieldId: 'source' },
      },
    ]);

    expect(component.form.get('target')?.value).toBe('submitted-answer');

    component.form.get('source')?.setValue('new-source');
    tick();
    fixture.detectChanges();

    expect(component.form.get('target')?.value).toBe('submitted-answer');
  }));

  it('resolves Related Data after records load when select already has a value', fakeAsync(() => {
    setFields([
      {
        id: 'user',
        name: 'user',
        type: 'select',
        label: 'User',
        defaultValue: '42',
        options: [{ id: '42', label: 'Ada', value: '42' }],
        optionSource: {
          type: 'dynamic',
          endpoint: 'users',
          response: { valueKey: 'id', labelKey: 'name', dataPath: 'data' },
        },
      },
      {
        id: 'email',
        name: 'email',
        type: 'email',
        label: 'Email',
        defaultValue: '',
        defaultValueSource: {
          kind: 'relatedData',
          sourceFieldId: 'user',
          property: 'email',
        },
      },
    ]);

    relatedRecords.splice(0, relatedRecords.length, {
      id: '42',
      name: 'Ada',
      email: 'ada@example.com',
    });
    runtime().storeRelatedRecords('users', relatedRecords);
    runtime().refreshSetValueAfterRelatedLoad();
    tick();
    fixture.detectChanges();

    expect(component.form.get('email')?.value).toBe('ada@example.com');
  }));

  it('re-resolves Related Data when the selected record changes', fakeAsync(() => {
    relatedRecords.splice(
      0,
      relatedRecords.length,
      { id: '1', name: 'Ada', email: 'ada@example.com' },
      { id: '2', name: 'Grace', email: 'grace@example.com' },
    );

    setFields([
      {
        id: 'user',
        name: 'user',
        type: 'select',
        label: 'User',
        defaultValue: '1',
        options: [
          { id: '1', label: 'Ada', value: '1' },
          { id: '2', label: 'Grace', value: '2' },
        ],
        optionSource: {
          type: 'dynamic',
          endpoint: 'users',
          response: { valueKey: 'id', labelKey: 'name', dataPath: 'data' },
        },
      },
      {
        id: 'email',
        name: 'email',
        type: 'email',
        label: 'Email',
        defaultValue: '',
        defaultValueSource: {
          kind: 'relatedData',
          sourceFieldId: 'user',
          property: 'email',
        },
      },
    ]);

    runtime().storeRelatedRecords('users', relatedRecords);
    runtime().refreshSetValueAfterRelatedLoad();
    tick();
    fixture.detectChanges();
    expect(component.form.get('email')?.value).toBe('ada@example.com');

    component.form.get('user')?.setValue('2');
    tick();
    fixture.detectChanges();
    expect(component.form.get('email')?.value).toBe('grace@example.com');
  }));

  it('re-evaluates expression defaults when operands change', fakeAsync(() => {
    setFields([
      { id: 'qty', name: 'qty', type: 'number', label: 'Qty', defaultValue: 2 },
      { id: 'price', name: 'price', type: 'number', label: 'Price', defaultValue: 5 },
      {
        id: 'total',
        name: 'total',
        type: 'number',
        label: 'Total',
        defaultValue: null,
        defaultValueSource: {
          kind: 'expression',
          op: 'multiply',
          left: { kind: 'field', fieldId: 'qty' },
          right: { kind: 'field', fieldId: 'price' },
        },
      },
    ]);

    expect(component.form.get('total')?.value).toBe(10);

    component.form.get('qty')?.setValue(3);
    tick();
    fixture.detectChanges();
    expect(component.form.get('total')?.value).toBe(15);
  }));

  it('keeps static defaults working without a dynamic source', fakeAsync(() => {
    setFields([
      {
        id: 'notes',
        name: 'notes',
        type: 'text',
        label: 'Notes',
        defaultValue: 'static-default',
      },
    ]);

    expect(component.form.get('notes')?.value).toBe('static-default');
  }));
});
