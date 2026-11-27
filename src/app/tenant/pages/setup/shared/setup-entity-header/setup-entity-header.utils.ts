/**
 * Display helpers for Setup edit-page headers (Users / Items / Vendors).
 * Best-effort extraction from dynamic form fields + API records.
 */

export type SetupEntityKind = 'user' | 'item' | 'vendor';

export interface SetupEntityHeaderIdentity {
  title: string;
  initials: string;
  subtitle: string;
}

type FieldRef = {
  id?: string | null;
  name?: string | null;
  label?: string | null;
  type?: string | null;
};

const NAME_KEY_RE =
  /^(full[_\s-]?name|display[_\s-]?name|user[_\s-]?name|item[_\s-]?name|vendor[_\s-]?name|name|title)$/i;
const ROLE_KEY_RE =
  /(job[_\s-]?position|job[_\s-]?title|role|position|department|team|group)/i;
const LAST_ACTIVE_KEY_RE = /(last[_\s-]?active|last[_\s-]?login|last[_\s-]?seen)/i;

function readString(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nested =
      record['name'] ??
      record['label'] ??
      record['title'] ??
      record['value'];
    if (typeof nested === 'string' || typeof nested === 'number') {
      return String(nested).trim();
    }
  }
  return '';
}

function fieldKeys(field: FieldRef): string[] {
  return [field.id, field.name, field.label]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
}

function lookupValue(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): unknown {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        return source[key];
      }
    }
  }
  return undefined;
}

function collectMatchingValues(
  fields: readonly FieldRef[],
  sources: Array<Record<string, unknown> | null | undefined>,
  matcher: RegExp,
  limit = 2,
): string[] {
  const values: string[] = [];
  for (const field of fields) {
    const keys = fieldKeys(field);
    const haystack = keys.join(' ');
    if (!matcher.test(haystack)) {
      continue;
    }
    const raw = lookupValue(sources, keys);
    const text = readString(raw);
    if (text && !values.includes(text)) {
      values.push(text);
      if (values.length >= limit) {
        break;
      }
    }
  }
  return values;
}

function resolveTitle(
  fields: readonly FieldRef[],
  sources: Array<Record<string, unknown> | null | undefined>,
  entityKind: SetupEntityKind,
  entityId: string | number,
): string {
  for (const field of fields) {
    const keys = fieldKeys(field);
    if (!keys.some((key) => NAME_KEY_RE.test(key))) {
      continue;
    }
    const text = readString(lookupValue(sources, keys));
    if (text) {
      return text;
    }
  }

  for (const field of fields) {
    if (String(field.type ?? '').toLowerCase() !== 'text') {
      continue;
    }
    const text = readString(lookupValue(sources, fieldKeys(field)));
    if (text) {
      return text;
    }
  }

  const fallback =
    entityKind === 'item'
      ? 'Item'
      : entityKind === 'vendor'
        ? 'Vendor'
        : 'User';
  return `${fallback} #${entityId}`;
}

export function buildSetupEntityInitials(title: string): string {
  const parts = title
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  if (!parts.length) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function formatEntityId(entityId: string | number): string {
  const raw = String(entityId ?? '').trim();
  if (!raw) {
    return '';
  }
  if (/^id[-_]/i.test(raw)) {
    return raw.toUpperCase();
  }
  const numeric = raw.replace(/\D/g, '');
  if (numeric && numeric === raw) {
    return `ID-${numeric.padStart(5, '0')}`;
  }
  return `ID-${raw}`;
}

function formatLastActive(value: unknown): string {
  const text = readString(value);
  if (!text) {
    return '';
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text.startsWith('Last active') ? text : `Last active ${text}`;
  }

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (sameDay) {
    return `Last active today, ${time}`;
  }

  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `Last active ${day}, ${time}`;
}

export function buildSetupEntityHeaderIdentity(options: {
  entityKind: SetupEntityKind;
  entityId: string | number;
  fields?: readonly FieldRef[] | null;
  record?: Record<string, unknown> | null;
  formValues?: Record<string, unknown> | null;
}): SetupEntityHeaderIdentity {
  const fields = options.fields ?? [];
  const sources = [options.formValues, options.record];
  const title = resolveTitle(
    fields,
    sources,
    options.entityKind,
    options.entityId,
  );
  const initials = buildSetupEntityInitials(title);

  const parts: string[] = [];
  const idPart = formatEntityId(options.entityId);
  if (idPart) {
    parts.push(idPart);
  }

  parts.push(...collectMatchingValues(fields, sources, ROLE_KEY_RE, 2));

  const lastActiveField = fields.find((field) =>
    fieldKeys(field).some((key) => LAST_ACTIVE_KEY_RE.test(key)),
  );
  const lastActiveRaw = lastActiveField
    ? lookupValue(sources, fieldKeys(lastActiveField))
    : lookupValue(sources, [
        'last_active',
        'lastActive',
        'last_login',
        'lastLogin',
        'updated_at',
        'updatedAt',
      ]);
  const lastActive = formatLastActive(lastActiveRaw);
  if (lastActive) {
    parts.push(lastActive);
  }

  return {
    title,
    initials,
    subtitle: parts.join(' · '),
  };
}
