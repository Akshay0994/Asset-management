import { Timestamp } from './timestamp';

export function timestampFromDateInput(ymd: string): Timestamp {
  const trimmed = ymd.trim();
  if (!trimmed) return Timestamp.now();
  const parts = trimmed.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return Timestamp.now();
  const [y, m, d] = parts;
  return Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0, 0));
}

export function toDateInputValue(ts: Timestamp | undefined | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function todayDateInputValue(): string {
  return toDateInputValue(Timestamp.now());
}
