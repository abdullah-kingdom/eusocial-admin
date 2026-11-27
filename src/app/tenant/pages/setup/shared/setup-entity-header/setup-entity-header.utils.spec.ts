import {
  buildSetupEntityHeaderIdentity,
  buildSetupEntityInitials,
} from './setup-entity-header.utils';

describe('setup-entity-header utils', () => {
  it('builds initials from a two-word name', () => {
    expect(buildSetupEntityInitials('Maria Lopez')).toBe('ML');
  });

  it('resolves edit identity title, initials, and meta for a user record', () => {
    const identity = buildSetupEntityHeaderIdentity({
      entityKind: 'user',
      entityId: 427,
      fields: [
        { id: 'fld_name', name: 'full_name', label: 'Full Name', type: 'text' },
        {
          id: 'fld_job',
          name: 'job_position',
          label: 'Job Position',
          type: 'select',
        },
        { id: 'fld_team', name: 'team', label: 'Team', type: 'text' },
      ],
      record: {
        full_name: 'Maria Lopez',
        job_position: { id: 1, name: 'Line cook' },
        team: 'Kitchen leads',
        last_active: new Date().toISOString(),
      },
    });

    expect(identity.title).toBe('Maria Lopez');
    expect(identity.initials).toBe('ML');
    expect(identity.subtitle).toContain('ID-00427');
    expect(identity.subtitle).toContain('Line cook');
    expect(identity.subtitle).toContain('Kitchen leads');
    expect(identity.subtitle).toContain('Last active');
  });

  it('falls back to Item #id when no name is available', () => {
    const identity = buildSetupEntityHeaderIdentity({
      entityKind: 'item',
      entityId: '12',
      fields: [],
      record: {},
    });
    expect(identity.title).toBe('Item #12');
    expect(identity.initials).toBe('I1');
  });
});
