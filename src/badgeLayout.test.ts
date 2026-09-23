import { describe, expect, it } from 'vitest';
import { BADGE_LAYOUT, fillPage, mirrorForDuplex, paginate } from './badgeLayout';

describe('badge sheets', () => {
  it('fills sheets and pads the last one', () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(fillPage([1, 2, 3], 4)).toEqual([1, 2, 3, null]);
    expect(fillPage([1, 2, 3, 4], 4)).toEqual([1, 2, 3, 4]);
  });

  it('puts each back behind its own front when the paper turns on the long edge', () => {
    // 8 per page, two columns: the sheet is mirrored left to right.
    const fronts = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(mirrorForDuplex(fronts, 2, 'long')).toEqual([2, 1, 4, 3, 6, 5, 8, 7]);
  });

  it('mirrors top to bottom when the paper turns on the short edge', () => {
    const fronts = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(mirrorForDuplex(fronts, 2, 'short')).toEqual([7, 8, 5, 6, 3, 4, 1, 2]);
  });

  it('is its own inverse, so nothing is ever lost or doubled', () => {
    for (const perPage of [4, 6, 8] as const) {
      const cols = BADGE_LAYOUT[perPage].cols;
      const fronts = Array.from({ length: perPage }, (_, i) => i);
      for (const flip of ['long', 'short'] as const) {
        const backs = mirrorForDuplex(fronts, cols, flip);
        expect([...backs].sort((a, b) => a - b)).toEqual(fronts);
        expect(mirrorForDuplex(backs, cols, flip)).toEqual(fronts);
      }
    }
  });

  it('keeps a half-empty sheet lined up', () => {
    // three badges on a sheet of four: the backs of the blanks stay opposite the blanks.
    const page = fillPage(['a', 'b', 'c'], 4);
    expect(mirrorForDuplex(page, 2, 'long')).toEqual(['b', 'a', null, 'c']);
  });
});
