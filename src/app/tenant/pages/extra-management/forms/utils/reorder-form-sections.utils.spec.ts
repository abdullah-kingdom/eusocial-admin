import { FormSection } from '../models/dynamic-form.models';
import { reorderFormSections } from './reorder-form-sections.utils';

function section(id: string, name: string): FormSection {
  return {
    id,
    name,
    type: 'custom',
    rows: [{ id: `row_${id}`, fields: [{ id: `fld_${id}`, type: 'text', label: name, name, required: false }] }],
  } as FormSection;
}

describe('reorderFormSections', () => {
  const s1 = section('s1', 'Section 1');
  const s2 = section('s2', 'Section 2');
  const s3 = section('s3', 'Section 3');
  const s4 = section('s4', 'Section 4');

  it('moves the last section to the first position', () => {
    const next = reorderFormSections([s1, s2, s3, s4], 3, 0);
    expect(next.map((s) => s.id)).toEqual(['s4', 's1', 's2', 's3']);
    expect(next[0].rows[0].fields[0].id).toBe('fld_s4');
  });

  it('moves the first section to the last position', () => {
    const next = reorderFormSections([s1, s2, s3, s4], 0, 3);
    expect(next.map((s) => s.id)).toEqual(['s2', 's3', 's4', 's1']);
  });

  it('moves a middle section below another (2 → after 3)', () => {
    const next = reorderFormSections([s1, s2, s3, s4], 1, 2);
    expect(next.map((s) => s.id)).toEqual(['s1', 's3', 's2', 's4']);
  });

  it('preserves section field payloads by reference', () => {
    const next = reorderFormSections([s1, s2, s3], 2, 0);
    expect(next[0]).toBe(s3);
    expect(next[0].rows).toBe(s3.rows);
  });

  it('returns a copy when indexes are unchanged or invalid', () => {
    const input = [s1, s2];
    const same = reorderFormSections(input, 1, 1);
    expect(same).toEqual(input);
    expect(same).not.toBe(input);

    expect(reorderFormSections(input, -1, 0)).toEqual(input);
    expect(reorderFormSections(input, 0, 9)).toEqual(input);
  });
});
