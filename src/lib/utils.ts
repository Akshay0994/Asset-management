import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HistoryEvent } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Newest first; when timestamps tie, treat returns as after assignments (same checkout session). */
export function sortHistoryNewestFirst(a: HistoryEvent, b: HistoryEvent): number {
  const diff = b.timestamp.toMillis() - a.timestamp.toMillis();
  if (diff !== 0) return diff;
  const rank = (e: HistoryEvent) => {
    const t = (e.type || '').toLowerCase();
    if (t === 'return') return 2;
    if (t === 'assignment') return 1;
    return 0;
  };
  return rank(b) - rank(a);
}

/** Normalize free-text asset type so it matches filter keys and icons (lowercase). */
export function normalizeAssetTypeInput(raw: string): string {
  return raw.trim().toLowerCase();
}
