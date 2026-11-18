import {
  collectDynamicDefaultSkipFieldIds,
  describeDefaultValueSource,
  filterRelatedPropertiesForDynamicDefault,
  getDynamicDefaultValueSourceKindsForTarget,
  hasPopulatedAnswerValue,
  isCompatibleDynamicDefaultSourceField,
  isDynamicDefaultValueSource,
  isDynamicRecordSelectField,
  normalizeDefaultValueSource,
  resolveDynamicDefaultValues,
  resolveRelatedPropertyDisplayLabel,
  resolveRelatedPropertyValueForDynamicDefault,
  shouldApplyDynamicDefaultResolvedValue,
  supportsDynamicDefaultCalculation,
  topologicalSortFieldIds,
} from './dynamic-default-value.utils';
import {
  isCompatibleSetValueSourceField,
  resolveValueSource,
} from './conditional-logic.set-value';

describe('dynamic default value utils', () => {
  describe('normalizeDefaultValueSource', () => {
    it('keeps field / relatedData / expression sources', () => {
      expect(normalizeDefaultValueSource({ kind: 'field', fieldId: 'a' })?.kind).toBe(
        'field',
      );
      expect(
        normalizeDefaultValueSource({
          kind: 'relatedData',
          sourceFieldId: 'items',
          property: 'price',
        })?.kind,
      ).toBe('relatedData');
      expect(
        normalizeDefaultValueSource({
          kind: 'expression',
          op: 'add',
          left: { kind: 'fixed', value: 1 },
          right: { kind: 'fixed', value: 2 },
        })?.kind,
      ).toBe('expression');
    });

    it('rejects fixed sources (static mode owns those)', () => {
      expect(normalizeDefaultValueSource({ kind: 'fixed', value: 'x' })).toBeNull();
      expect(isDynamicDefaultValueSource({ kind: 'fixed', value: 'x' })).toBeFalse();
    });
  });

  describe('topologicalSortFieldIds', () => {
    it('orders dependencies before dependents', () => {
      const cycles: string[] = [];
      const ordered = topologicalSortFieldIds(
        ['a', 'b', 'c'],
        new Map([
          ['a', ['b']],
          ['b', ['c']],
          ['c', []],
        ]),
        cycles,
      );

      expect(ordered).toEqual(['c', 'b', 'a']);
      expect(cycles).toEqual([]);
    });

    it('reports cycles without looping forever', () => {
      const cycles: string[] = [];
      const ordered = topologicalSortFieldIds(
        ['a', 'b'],
        new Map([
          ['a', ['b']],
          ['b', ['a']],
        ]),
        cycles,
      );

      expect(ordered).toEqual([]);
      expect(cycles.sort()).toEqual(['a', 'b']);
    });
  });

  describe('resolveDynamicDefaultValues', () => {
    it('resolves form-field sources without a Conditional Logic trigger', () => {
      const fields = [
        {
          id: 'target',
          name: 'target',
          type: 'text',
          defaultValueSource: { kind: 'field' as const, fieldId: 'source' },
        },
        { id: 'source', name: 'source', type: 'text' },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        source: 'hello',
        target: '',
      };
      const applied: unknown[] = [];

      resolveDynamicDefaultValues(fields, {
        valuesByFieldId,
        fieldsById: new Map(fields.map((field) => [field.id, field])),
        applyValue: (_field, value) => {
          applied.push(value);
          return true;
        },
      });

      expect(applied).toEqual(['hello']);
      expect(valuesByFieldId['target']).toBe('hello');
    });

    it('respects dependency order across dynamic defaults', () => {
      const fields = [
        {
          id: 'a',
          name: 'a',
          type: 'number',
          defaultValueSource: { kind: 'field' as const, fieldId: 'b' },
        },
        {
          id: 'b',
          name: 'b',
          type: 'number',
          defaultValueSource: { kind: 'field' as const, fieldId: 'c' },
        },
        {
          id: 'c',
          name: 'c',
          type: 'number',
          defaultValueSource: { kind: 'field' as const, fieldId: 'seed' },
        },
        { id: 'seed', name: 'seed', type: 'number' },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        seed: 7,
        a: null,
        b: null,
        c: null,
      };

      resolveDynamicDefaultValues(fields, {
        valuesByFieldId,
        fieldsById: new Map(fields.map((field) => [field.id, field])),
        applyValue: (field, value) => {
          valuesByFieldId[field.id] = value;
          return true;
        },
      });

      expect(valuesByFieldId['c']).toBe(7);
      expect(valuesByFieldId['b']).toBe(7);
      expect(valuesByFieldId['a']).toBe(7);
    });

    it('does not wipe values when source is unresolved', () => {
      const fields = [
        {
          id: 'target',
          name: 'target',
          type: 'text',
          defaultValueSource: { kind: 'field' as const, fieldId: 'missing' },
        },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        target: 'keep-me',
      };

      resolveDynamicDefaultValues(fields, {
        valuesByFieldId,
        fieldsById: new Map(fields.map((field) => [field.id, field])),
        applyValue: () => {
          fail('should not apply');
          return false;
        },
      });

      expect(valuesByFieldId['target']).toBe('keep-me');
    });

    it('skips fields with submitted answers', () => {
      const fields = [
        {
          id: 'target',
          name: 'target',
          type: 'text',
          defaultValueSource: { kind: 'field' as const, fieldId: 'source' },
        },
        { id: 'source', name: 'source', type: 'text' },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        source: 'from-source',
        target: 'submitted',
      };

      resolveDynamicDefaultValues(fields, {
        skipFieldIds: new Set(['target']),
        valuesByFieldId,
        fieldsById: new Map(fields.map((field) => [field.id, field])),
        applyValue: () => {
          fail('should not overwrite submitted answer');
          return false;
        },
      });

      expect(valuesByFieldId['target']).toBe('submitted');
    });

    it('resolves expression sources', () => {
      const fields = [
        {
          id: 'total',
          name: 'total',
          type: 'number',
          defaultValueSource: {
            kind: 'expression' as const,
            op: 'multiply' as const,
            left: { kind: 'field' as const, fieldId: 'qty' },
            right: { kind: 'field' as const, fieldId: 'price' },
          },
        },
        { id: 'qty', name: 'qty', type: 'number' },
        { id: 'price', name: 'price', type: 'number' },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        qty: 3,
        price: 4,
        total: null,
      };

      resolveDynamicDefaultValues(fields, {
        valuesByFieldId,
        fieldsById: new Map(fields.map((field) => [field.id, field])),
        applyValue: (field, value) => {
          valuesByFieldId[field.id] = value;
          return true;
        },
      });

      expect(valuesByFieldId['total']).toBe(12);
    });

    it('re-resolves when a source value changes later', () => {
      const fields = [
        {
          id: 'target',
          name: 'target',
          type: 'email',
          defaultValueSource: { kind: 'field' as const, fieldId: 'source' },
        },
        { id: 'source', name: 'source', type: 'email' },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        source: 'first@example.com',
        target: '',
      };
      const fieldsById = new Map(fields.map((field) => [field.id, field]));
      const applyValue = (field: { id: string }, value: unknown) => {
        valuesByFieldId[field.id] = value;
        return true;
      };

      resolveDynamicDefaultValues(fields, { valuesByFieldId, fieldsById, applyValue });
      expect(valuesByFieldId['target']).toBe('first@example.com');

      valuesByFieldId['source'] = 'second@example.com';
      resolveDynamicDefaultValues(fields, { valuesByFieldId, fieldsById, applyValue });
      expect(valuesByFieldId['target']).toBe('second@example.com');
    });

    it('re-resolves Related Data after records become available', () => {
      const fields = [
        {
          id: 'email',
          name: 'email',
          type: 'email',
          defaultValueSource: {
            kind: 'relatedData' as const,
            sourceFieldId: 'user',
            property: 'email',
          },
        },
        {
          id: 'user',
          name: 'user',
          type: 'select',
          optionSource: {
            type: 'dynamic',
            endpoint: 'users',
            response: { valueKey: 'id', labelKey: 'name', dataPath: 'data' },
          },
        },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        user: '42',
        email: '',
      };
      const fieldsById = new Map(fields.map((field) => [field.id, field]));
      const applyValue = (field: { id: string }, value: unknown) => {
        valuesByFieldId[field.id] = value;
        return true;
      };
      const lookup = { recordsByEndpoint: new Map<string, Record<string, unknown>[]>() };

      resolveDynamicDefaultValues(fields, {
        valuesByFieldId,
        fieldsById,
        lookup,
        applyValue,
      });
      expect(valuesByFieldId['email']).toBe('');

      lookup.recordsByEndpoint.set('users', [
        { id: '42', name: 'Ada', email: 'ada@example.com' },
      ]);
      resolveDynamicDefaultValues(fields, {
        valuesByFieldId,
        fieldsById,
        lookup,
        applyValue,
      });
      expect(valuesByFieldId['email']).toBe('ada@example.com');
    });

    it('does not apply empty results over existing values', () => {
      const fields = [
        {
          id: 'target',
          name: 'target',
          type: 'text',
          defaultValueSource: { kind: 'field' as const, fieldId: 'source' },
        },
        { id: 'source', name: 'source', type: 'text' },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        source: '',
        target: 'keep-me',
      };

      resolveDynamicDefaultValues(fields, {
        valuesByFieldId,
        fieldsById: new Map(fields.map((field) => [field.id, field])),
        applyValue: () => {
          fail('empty source must not erase target');
          return false;
        },
      });

      expect(valuesByFieldId['target']).toBe('keep-me');
    });

    it('does not overwrite user-edited targets while still updating other dependents', () => {
      const fields = [
        {
          id: 'edited',
          name: 'edited',
          type: 'text',
          defaultValueSource: { kind: 'field' as const, fieldId: 'source' },
        },
        {
          id: 'open',
          name: 'open',
          type: 'text',
          defaultValueSource: { kind: 'field' as const, fieldId: 'source' },
        },
        { id: 'source', name: 'source', type: 'text' },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        source: 'fresh',
        edited: 'user-typed',
        open: '',
      };

      resolveDynamicDefaultValues(fields, {
        skipFieldIds: collectDynamicDefaultSkipFieldIds({
          userEditedFieldIds: ['edited'],
        }),
        valuesByFieldId,
        fieldsById: new Map(fields.map((field) => [field.id, field])),
        applyValue: (field, value) => {
          valuesByFieldId[field.id] = value;
          return true;
        },
      });

      expect(valuesByFieldId['edited']).toBe('user-typed');
      expect(valuesByFieldId['open']).toBe('fresh');
    });
  });

  describe('skip / apply helpers', () => {
    it('merges answer, user-edited, and dirty skip ids', () => {
      const skip = collectDynamicDefaultSkipFieldIds({
        answerProtectedFieldIds: ['a'],
        userEditedFieldIds: ['b'],
        dirtyOrTouchedFieldIds: ['c', 'a'],
      });
      expect(skip.has('a')).toBeTrue();
      expect(skip.has('b')).toBeTrue();
      expect(skip.has('c')).toBeTrue();
    });

    it('rejects empty and equal resolved values', () => {
      expect(shouldApplyDynamicDefaultResolvedValue('', 'x')).toBeTrue();
      expect(shouldApplyDynamicDefaultResolvedValue('x', 'x')).toBeFalse();
      expect(shouldApplyDynamicDefaultResolvedValue('x', '')).toBeFalse();
      expect(shouldApplyDynamicDefaultResolvedValue('x', null)).toBeFalse();
    });
  });

  describe('hasPopulatedAnswerValue / describe', () => {
    it('detects empty vs populated answers', () => {
      expect(hasPopulatedAnswerValue('')).toBeFalse();
      expect(hasPopulatedAnswerValue([])).toBeFalse();
      expect(hasPopulatedAnswerValue('abc')).toBeTrue();
      expect(hasPopulatedAnswerValue(0)).toBeTrue();
    });

    it('describes sources for canvas summary', () => {
      expect(
        describeDefaultValueSource({ kind: 'field', fieldId: 'email' }, (id) =>
          id === 'email' ? 'Email' : id,
        ),
      ).toContain('Email');
    });

    it('describes Related Data with human-readable property labels', () => {
      const summary = describeDefaultValueSource(
        {
          kind: 'relatedData',
          sourceFieldId: 'select_user',
          property: 'fld_1788885525561_nzxdgvw',
        },
        (id) => (id === 'select_user' ? 'Select User' : ''),
        {
          propertyLabelByKey: (property) =>
            property === 'fld_1788885525561_nzxdgvw' ? 'Email' : '',
        },
      );
      expect(summary).toBe('From related data: Select User → Email');
      expect(summary).not.toContain('fld_');
    });

    it('never falls back to raw fld_ ids in summaries', () => {
      const summary = describeDefaultValueSource(
        {
          kind: 'relatedData',
          sourceFieldId: 'fld_missing_source',
          property: 'fld_missing_property',
        },
        () => '',
      );
      expect(summary).toContain('Unknown field');
      expect(summary).toContain('Unnamed property');
      expect(summary).not.toMatch(/fld_/i);
    });

    it('describes Calculation operands with field labels', () => {
      const summary = describeDefaultValueSource(
        {
          kind: 'expression',
          op: 'multiply',
          left: { kind: 'field', fieldId: 'qty' },
          right: { kind: 'field', fieldId: 'price' },
        },
        (id) => (id === 'qty' ? 'Quantity' : id === 'price' ? 'Price' : ''),
      );
      expect(summary).toBe('Calculation: Quantity × Price');
    });
  });

  describe('resolveValueSource reuse', () => {
    it('reads related data through the shared resolver', () => {
      const fieldsById = new Map([
        [
          'items',
          {
            id: 'items',
            type: 'select',
            optionSource: {
              type: 'dynamic',
              endpoint: 'items',
              response: { valueKey: 'id', labelKey: 'name', dataPath: 'data' },
            },
          },
        ],
      ]);
      const lookup = {
        recordsByEndpoint: new Map([
          ['items', [{ id: '1', name: 'Widget', sku: 'W-1' }]],
        ]),
      };

      const value = resolveValueSource(
        {
          kind: 'relatedData',
          sourceFieldId: 'items',
          property: 'sku',
        },
        { items: '1' },
        fieldsById,
        lookup,
      );

      expect(value).toBe('W-1');
    });

    it('resolves User dropdown selection to related Email property', () => {
      const fieldsById = new Map([
        [
          'select_user',
          {
            id: 'select_user',
            type: 'select',
            optionSource: {
              type: 'dynamic',
              endpoint: 'users',
              response: { valueKey: 'id', labelKey: 'name', dataPath: 'data' },
            },
          },
        ],
      ]);
      const lookup = {
        recordsByEndpoint: new Map([
          [
            'users',
            [{ id: '42', name: 'Ada', email: 'ada@example.com', user_id: '42' }],
          ],
        ]),
      };

      const value = resolveValueSource(
        {
          kind: 'relatedData',
          sourceFieldId: 'select_user',
          property: 'email',
        },
        { select_user: '42' },
        fieldsById,
        lookup,
      );

      expect(value).toBe('ada@example.com');
    });
  });

  describe('scoped Dynamic Default source compatibility', () => {
    const emailTarget = { id: 'email_field', type: 'email', label: 'Email' };
    const emailSource = { id: 'other_email', type: 'email', label: 'Work Email' };
    const textSource = { id: 'name', type: 'text', label: 'Name' };
    const userSelect = {
      id: 'select_user',
      type: 'select',
      label: 'Select User',
      optionSource: {
        type: 'dynamic' as const,
        endpoint: 'users',
        response: { valueKey: 'id', labelKey: 'name', dataPath: 'data' },
      },
    };
    const staticSelect = {
      id: 'status',
      type: 'select',
      label: 'Status',
      options: [
        { id: 'open', label: 'Open', value: 'open' },
        { id: 'closed', label: 'Closed', value: 'closed' },
      ],
    };

    it('detects dynamic record select fields', () => {
      expect(isDynamicRecordSelectField(userSelect)).toBeTrue();
      expect(isDynamicRecordSelectField(staticSelect)).toBeFalse();
      expect(isDynamicRecordSelectField(emailSource)).toBeFalse();
    });

    it('allows email/text sources for Email targets', () => {
      expect(isCompatibleDynamicDefaultSourceField(emailTarget, emailSource)).toBeTrue();
      expect(isCompatibleDynamicDefaultSourceField(emailTarget, textSource)).toBeTrue();
    });

    it('excludes Dynamic User Select as a direct Email source', () => {
      expect(isCompatibleDynamicDefaultSourceField(emailTarget, userSelect)).toBeFalse();
    });

    it('does not change shared Conditional Logic compatibility', () => {
      // Shared helper still treats select as compatible with text/email kinds.
      expect(isCompatibleSetValueSourceField(emailTarget, userSelect)).toBeTrue();
    });
  });

  describe('Related Data property filtering for Dynamic Default', () => {
    const emailTarget = { id: 'email_field', type: 'email', label: 'Email' };
    const textTarget = { id: 'notes', type: 'text', label: 'Notes' };
    const numberTarget = { id: 'amount', type: 'number', label: 'Amount' };
    const columns = [
      { id: 'id', label: 'ID', type: 'text' },
      { id: 'user_id', label: 'User ID', type: 'text' },
      { id: 'email', label: 'Email', type: 'email' },
      { id: 'first_name', label: 'First Name', type: 'text' },
      { id: 'price', label: 'Price', type: 'number' },
      { id: 'fld_abc123', label: 'Email', type: 'email' },
    ];
    const records = [
      {
        id: '1',
        user_id: '1',
        email: 'ada@example.com',
        first_name: 'Ada',
        price: 12,
        fld_abc123: 'ada@example.com',
      },
    ];

    it('keeps email properties and excludes identity keys for Email targets', () => {
      const filtered = filterRelatedPropertiesForDynamicDefault(
        columns,
        records,
        emailTarget,
      );
      const ids = filtered.map((column) => column.id);
      expect(ids).toContain('email');
      expect(ids).toContain('fld_abc123');
      expect(ids).not.toContain('id');
      expect(ids).not.toContain('user_id');
      expect(ids).not.toContain('price');
    });

    it('keeps text properties and excludes identity keys for Text targets', () => {
      const filtered = filterRelatedPropertiesForDynamicDefault(
        columns,
        records,
        textTarget,
      );
      const ids = filtered.map((column) => column.id);
      expect(ids).toContain('first_name');
      expect(ids).toContain('email');
      expect(ids).not.toContain('id');
      expect(ids).not.toContain('user_id');
    });

    it('preserves numeric filtering for Number targets', () => {
      const filtered = filterRelatedPropertiesForDynamicDefault(
        columns,
        records,
        numberTarget,
      );
      const ids = filtered.map((column) => column.id);
      expect(ids).toContain('price');
      expect(ids).not.toContain('id');
      expect(ids).not.toContain('email');
    });

    it('preserves date/time filtering', () => {
      const dateColumns = [
        { id: 'id', label: 'ID' },
        { id: 'created_at', label: 'Created Date', type: 'date' },
        { id: 'updated_at', label: 'Updated Date', type: 'date' },
        { id: 'email', label: 'Email', type: 'email' },
        {
          id: 'role',
          label: 'Role',
          type: 'select',
          relatedEndpoint: 'roles',
          relatedDisplayKey: 'name',
        },
        {
          id: 'job_position',
          label: 'Job Position',
          type: 'select',
          relatedEndpoint: 'jobpositions',
          relatedDisplayKey: 'name',
        },
      ];
      const dateRecords = [
        {
          id: '1',
          created_at: '2024-01-15',
          updated_at: '2024-02-01',
          email: 'a@b.com',
          role: 'role_1',
          job_position: 'pos_1',
        },
      ];
      const dateFiltered = filterRelatedPropertiesForDynamicDefault(
        dateColumns,
        dateRecords,
        { id: 'due', type: 'date', label: 'Due' },
      );
      const dateIds = dateFiltered.map((c) => c.id);
      expect(dateIds).toContain('created_at');
      expect(dateIds).toContain('updated_at');
      expect(dateIds).not.toContain('role');
      expect(dateIds).not.toContain('job_position');
      expect(dateIds).not.toContain('email');
      expect(dateIds).not.toContain('id');

      const timeColumns = [
        { id: 'id', label: 'ID' },
        { id: 'start_time', label: 'Start', type: 'time' },
        { id: 'name', label: 'Name' },
      ];
      const timeRecords = [
        { id: '1', start_time: '14:30', name: 'Shift' },
      ];
      const timeFiltered = filterRelatedPropertiesForDynamicDefault(
        timeColumns,
        timeRecords,
        { id: 'when', type: 'time', label: 'When' },
      );
      expect(timeFiltered.map((c) => c.id)).toEqual(['start_time']);
    });

    it('allows Job Position relationship for Text targets (display resolved at runtime)', () => {
      const filtered = filterRelatedPropertiesForDynamicDefault(
        [
          {
            id: 'job_position',
            label: 'Job Position',
            type: 'select',
            relatedEndpoint: 'jobpositions',
          },
          { id: 'email', label: 'Email', type: 'email' },
        ],
        [{ id: '1', job_position: 'pos_1', email: 'a@b.com' }],
        textTarget,
      );
      expect(filtered.map((c) => c.id)).toContain('job_position');
    });

    it('keeps select-compatible properties that coerce to option values', () => {
      const selectTarget = {
        id: 'status_target',
        type: 'select',
        label: 'Status',
        options: [
          { id: 'open', label: 'Open', value: 'open' },
          { id: 'closed', label: 'Closed', value: 'closed' },
        ],
      };
      const selectColumns = [
        { id: 'id', label: 'ID' },
        { id: 'status', label: 'Status' },
        { id: 'notes', label: 'Notes' },
      ];
      const selectRecords = [
        { id: '1', status: 'open', notes: 'hello' },
      ];
      const filtered = filterRelatedPropertiesForDynamicDefault(
        selectColumns,
        selectRecords,
        selectTarget,
      );
      const ids = filtered.map((c) => c.id);
      expect(ids).toContain('status');
      expect(ids).not.toContain('id');
    });

    it('handles missing metadata and sample values safely', () => {
      const thinColumns = [
        { id: 'id', label: 'ID' },
        { id: 'email', label: 'Email', type: 'email' },
        { id: 'mystery', label: 'Mystery' },
      ];
      const filtered = filterRelatedPropertiesForDynamicDefault(
        thinColumns,
        [],
        emailTarget,
      );
      const ids = filtered.map((c) => c.id);
      expect(ids).toContain('email');
      expect(ids).toContain('mystery');
      expect(ids).not.toContain('id');
    });
  });

  describe('Related Data property labels', () => {
    it('prefers schema labels over technical ids', () => {
      expect(
        resolveRelatedPropertyDisplayLabel('fld_abc123', {
          schemaLabel: 'Email',
        }),
      ).toBe('Email');
    });

    it('never displays raw fld_ ids when no schema label exists', () => {
      expect(resolveRelatedPropertyDisplayLabel('fld_abc123')).toBe(
        'Unnamed property',
      );
    });

    it('humanizes snake_case keys', () => {
      expect(resolveRelatedPropertyDisplayLabel('first_name')).toBe('First Name');
      expect(resolveRelatedPropertyDisplayLabel('user_id')).toBe('User ID');
    });

    it('keeps persisted property keys separate from display labels', () => {
      const propertyKey = 'fld_abc123';
      const label = resolveRelatedPropertyDisplayLabel(propertyKey, {
        schemaLabel: 'Email',
      });
      const persisted = normalizeDefaultValueSource({
        kind: 'relatedData',
        sourceFieldId: 'select_user',
        property: propertyKey,
      });
      expect(label).toBe('Email');
      expect(persisted?.kind).toBe('relatedData');
      if (persisted?.kind === 'relatedData') {
        expect(persisted.property).toBe(propertyKey);
      }
    });
  });

  describe('relationship display resolution', () => {
    const textTarget = { id: 'job_name', type: 'text', label: 'Job Position Name' };
    const jobColumn = {
      id: 'job_position',
      label: 'Job Position',
      type: 'select',
      relatedEndpoint: 'jobpositions',
      relatedDisplayKey: 'name',
    };

    it('resolves User Email scalar unchanged', () => {
      const lookup = { recordsByEndpoint: new Map() };
      expect(
        resolveRelatedPropertyValueForDynamicDefault(
          'ada@example.com',
          { id: 'email', label: 'Email', type: 'email' },
          { id: 'email_field', type: 'email' },
          lookup,
        ),
      ).toBe('ada@example.com');
    });

    it('resolves Job Position ID to Job Position Name for text targets', () => {
      const lookup = {
        recordsByEndpoint: new Map([
          [
            'jobpositions',
            [{ id: 'position_456', name: 'Restaurant Manager' }],
          ],
        ]),
      };
      expect(
        resolveRelatedPropertyValueForDynamicDefault(
          'position_456',
          jobColumn,
          textTarget,
          lookup,
        ),
      ).toBe('Restaurant Manager');
    });

    it('does not populate raw relationship IDs when related records are missing', () => {
      const lookup = { recordsByEndpoint: new Map() };
      expect(
        resolveRelatedPropertyValueForDynamicDefault(
          'position_456',
          jobColumn,
          textTarget,
          lookup,
        ),
      ).toBeNull();
    });

    it('applies resolved Job Position name through resolveDynamicDefaultValues', () => {
      const fields = [
        {
          id: 'job_name',
          name: 'job_name',
          type: 'text',
          defaultValueSource: {
            kind: 'relatedData' as const,
            sourceFieldId: 'user',
            property: 'job_position',
          },
        },
        {
          id: 'user',
          name: 'user',
          type: 'select',
          optionSource: {
            type: 'dynamic',
            endpoint: 'users',
            response: { valueKey: 'id', labelKey: 'name', dataPath: 'data' },
          },
        },
      ];
      const valuesByFieldId: Record<string, unknown> = {
        user: 'user_123',
        job_name: '',
      };
      const lookup = {
        recordsByEndpoint: new Map([
          ['users', [{ id: 'user_123', job_position: 'position_456' }]],
          [
            'jobpositions',
            [{ id: 'position_456', name: 'Restaurant Manager' }],
          ],
        ]),
      };
      const relatedPropertyColumns = new Map([
        ['user::job_position', jobColumn],
        ['job_position', jobColumn],
      ]);

      resolveDynamicDefaultValues(fields, {
        valuesByFieldId,
        fieldsById: new Map(fields.map((field) => [field.id, field])),
        lookup,
        relatedPropertyColumns,
        applyValue: (field, value) => {
          valuesByFieldId[field.id] = value;
          return true;
        },
      });

      expect(valuesByFieldId['job_name']).toBe('Restaurant Manager');
    });
  });

  describe('Calculation eligibility', () => {
    it('allows Calculation for Number and Measurement targets', () => {
      expect(supportsDynamicDefaultCalculation({ type: 'number' })).toBeTrue();
      expect(supportsDynamicDefaultCalculation({ type: 'price' })).toBeTrue();
      expect(supportsDynamicDefaultCalculation({ type: 'length' })).toBeTrue();
      expect(
        getDynamicDefaultValueSourceKindsForTarget({ type: 'number' }),
      ).toContain('expression');
    });

    it('hides Calculation for Email, Text, Date, Select, and similar targets', () => {
      for (const type of [
        'email',
        'text',
        'textarea',
        'date',
        'time',
        'select',
        'radio',
        'checkbox',
        'barcode',
        'qr-code',
        'rating',
        'range',
      ]) {
        expect(supportsDynamicDefaultCalculation({ type })).toBeFalse();
        expect(
          getDynamicDefaultValueSourceKindsForTarget({ type }),
        ).not.toContain('expression');
      }
    });

    it('does not execute saved Calculation configs on unsupported targets', () => {
      const fields = [
        {
          id: 'email',
          name: 'email',
          type: 'email',
          defaultValueSource: {
            kind: 'expression' as const,
            op: 'add' as const,
            left: { kind: 'fixed' as const, value: 1 },
            right: { kind: 'fixed' as const, value: 2 },
          },
        },
      ];
      const valuesByFieldId: Record<string, unknown> = { email: '' };

      resolveDynamicDefaultValues(fields, {
        valuesByFieldId,
        fieldsById: new Map(fields.map((field) => [field.id, field])),
        applyValue: () => {
          fail('calculation must not run for email');
          return false;
        },
      });

      expect(valuesByFieldId['email']).toBe('');
    });
  });
});
