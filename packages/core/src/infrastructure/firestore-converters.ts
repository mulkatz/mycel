import { Timestamp } from '@google-cloud/firestore';

export function dateToTimestamp(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

export function timestampToDate(timestamp: Timestamp): Date {
  return timestamp.toDate();
}
