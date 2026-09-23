/**
 * How name badges are laid out on a sheet, and how the backs are ordered so each one
 * lands behind its own front. Kept apart from the page so the duplex arithmetic — the
 * part nobody can check by eye until the paper comes out wrong — can be tested.
 */
import type { BadgeDesign } from './engine/types';

export const BADGE_LAYOUT: Record<BadgeDesign['perPage'], { cols: number; rows: number; label: string }> = {
  4: { cols: 2, rows: 2, label: '4 per page (big, 4.25 × 5.5 in)' },
  6: { cols: 2, rows: 3, label: '6 per page (4.25 × 3.67 in)' },
  8: { cols: 2, rows: 4, label: '8 per page (4.25 × 2.75 in)' },
};

/** Splits a list into sheets of `perPage`. */
export function paginate<T>(items: T[], perPage: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

/** Pads the last sheet out with empty slots, so the grid keeps its shape. */
export function fillPage<T>(page: T[], perPage: number): (T | null)[] {
  return [...page, ...Array.from({ length: Math.max(0, perPage - page.length) }, () => null)];
}

/**
 * Re-orders the backs so each one lands behind its own front. A printer that turns the
 * paper on the long edge mirrors the sheet left to right; one that turns it on the short
 * edge mirrors it top to bottom.
 */
export function mirrorForDuplex<T>(cells: T[], cols: number, flip: 'long' | 'short'): T[] {
  const rows: T[][] = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const out = flip === 'long' ? rows.map((r) => [...r].reverse()) : [...rows].reverse();
  return out.flat();
}
