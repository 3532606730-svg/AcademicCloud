export function toDatabaseTimestamp(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function fromDatabaseTimestamp(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}
