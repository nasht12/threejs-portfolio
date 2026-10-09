import { describe, expect, it } from 'vitest';
import { ART_BOX, artSize, focusDistance, nearestIndex, SPACING, xOf } from './layout';
import { median, shouldDecline, BUDGET_MS, WINDOW } from '../perf/budget';

describe('layout', () => {
  it('fits every aspect inside the art box', () => {
    for (const aspect of [16 / 9, 1.4, 1, 0.75, 3]) {
      const { w, h } = artSize(aspect);
      expect(w).toBeLessThanOrEqual(ART_BOX.w + 1e-9);
      expect(h).toBeLessThanOrEqual(ART_BOX.h + 1e-9);
      expect(w / h).toBeCloseTo(aspect);
    }
  });

  it('snaps a walking position to the nearest frame, clamped to the wall', () => {
    expect(nearestIndex(xOf(3) + SPACING * 0.4, 7)).toBe(3);
    expect(nearestIndex(xOf(3) + SPACING * 0.6, 7)).toBe(4);
    expect(nearestIndex(-50, 7)).toBe(0);
    expect(nearestIndex(500, 7)).toBe(6);
  });

  it('stands closer to smaller pictures', () => {
    expect(focusDistance(1.2)).toBeLessThan(focusDistance(1.7));
  });
});

describe('frame budget', () => {
  it('takes the median', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('declines only on a full window of slow frames', () => {
    const slow = Array(WINDOW).fill(BUDGET_MS * 1.5);
    expect(shouldDecline(slow.slice(1))).toBe(false); // not enough evidence yet
    expect(shouldDecline(slow)).toBe(true);
  });

  it('tolerates occasional long frames', () => {
    const mostlyFast = Array.from({ length: WINDOW }, (_, i) => (i % 5 === 0 ? 60 : 16.7));
    expect(shouldDecline(mostlyFast)).toBe(false);
  });
});
