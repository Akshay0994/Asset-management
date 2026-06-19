import { cn } from './utils';

/** Responsive Lucide icon classes — use with `className`, not the `size` prop. */
export const iconSize = {
  xs: 'size-3 sm:size-3.5 shrink-0',
  sm: 'size-3.5 sm:size-4 shrink-0',
  md: 'size-4 sm:size-5 shrink-0',
  lg: 'size-[1.125rem] sm:size-5 md:size-[1.375rem] shrink-0',
  xl: 'size-5 sm:size-6 shrink-0',
  tile: 'size-[1.375rem] sm:size-6 md:size-7 shrink-0',
  hero: 'size-6 sm:size-7 md:size-8 shrink-0',
  display: 'size-8 sm:size-10 md:size-12 shrink-0',
  nav: 'size-4 sm:size-5 shrink-0',
} as const;

export function iconClass(size: keyof typeof iconSize, className?: string): string {
  return cn(iconSize[size], className);
}
