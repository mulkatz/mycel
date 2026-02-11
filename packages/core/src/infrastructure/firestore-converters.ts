import { Timestamp } from '@google-cloud/firestore';

export function dateToTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

export function timestampToDate(timestamp: Timestamp): Date {
  return timestamp.toDate();
}

export function convertDatesToTimestamps<T extends Record<string, unknown>>(
  obj: T,
  dateFields: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj };
  for (const field of dateFields) {
    const value = result[field];
    if (value instanceof Date) {
      result[field] = dateToTimestamp(value);
    }
  }
  return result;
}

export function convertTimestampsToDates<T extends Record<string, unknown>>(
  obj: T,
  dateFields: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj };
  for (const field of dateFields) {
    const value = result[field];
    if (value instanceof Timestamp) {
      result[field] = timestampToDate(value);
    }
  }
  return result;
}

export function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
