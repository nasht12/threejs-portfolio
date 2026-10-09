import { describe, expect, it } from 'vitest';
import { angleOf, CARD, CAM_DIST, frontAngle, nearestIndex, radiusFor, step, windowCrop, ZOOM, zoomBy } from './layout';
import { median, shouldDecline, BUDGET_MS, WINDOW } from '../perf/budget';

describe('ring', () => {
  it('grows with the number of cards and keeps neighbours apart', () => {
    for (const n of [3, 7, 12, 24]) {
      const r = radiusFor(n);
      const chord = 2 * r * Math.sin(step(n) / 2);
      expect(chord).toBeGreaterThan(CARD.w);
    }
    expect(radiusFor(24)).toBeGreaterThan(radiusFor(7));
  });

  it('finds the card at the front for any rotation, including past a full turn', () => {
    const n = 7;
    expect(nearestIndex(angleOf(3, n) + step(n) * 0.4, n)).toBe(3);
    expect(nearestIndex(angleOf(3, n) + step(n) * 0.6, n)).toBe(4);
    expect(nearestIndex(-step(n), n)).toBe(6);
    expect(nearestIndex(Math.PI * 2 * 3 + angleOf(2, n), n)).toBe(2);
  });

  it('turns the short way round to bring a card forward', () => {
    const n = 7;
    const theta = angleOf(6, n) + Math.PI * 2; // one full turn on, card 6 in front
    const to0 = frontAngle(theta, 0, n);
    expect(Math.abs(to0 - theta)).toBeCloseTo(step(n)); // next card, not six back
  });
});

describe('zoom', () => {
  it('scrolling down zooms out, up zooms in, within limits', () => {
    expect(zoomBy(CAM_DIST, 100)).toBeGreaterThan(CAM_DIST);
    expect(zoomBy(CAM_DIST, -100)).toBeLessThan(CAM_DIST);
    expect(zoomBy(CAM_DIST, 1e6)).toBe(ZOOM.max);
    expect(zoomBy(CAM_DIST, -1e6)).toBe(ZOOM.min);
  });
  it('is symmetric: in then out by the same amount returns to the start', () => {
    expect(zoomBy(zoomBy(CAM_DIST, 120), -120)).toBeCloseTo(CAM_DIST);
  });
});

describe('fake portal window', () => {
  it('shows the centre of the backdrop when seen straight on', () => {
    const c = windowCrop(16 / 9, { x: 0, y: 0, z: 5 });
    expect(c.ox + c.rx / 2).toBeCloseTo(0.5);
    expect(c.oy + c.ry / 2).toBeCloseTo(0.5);
  });

  it('slides the view the other way as the card turns, like a real window', () => {
    const left = windowCrop(16 / 9, { x: -2, y: 0, z: 5 });
    const right = windowCrop(16 / 9, { x: 2, y: 0, z: 5 });
    expect(left.ox).toBeGreaterThan(right.ox);
  });

  it('never samples outside the backdrop', () => {
    for (const x of [-50, -3, 0, 3, 50]) {
      const c = windowCrop(1.3, { x, y: 9, z: 0.5 });
      expect(c.ox).toBeGreaterThanOrEqual(0);
      expect(c.ox + c.rx).toBeLessThanOrEqual(1 + 1e-9);
      expect(c.oy + c.ry).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('frame budget', () => {
  it('takes the median', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('declines only on a full window of slow frames', () => {
    const slow = Array(WINDOW).fill(BUDGET_MS * 1.5);
    expect(shouldDecline(slow.slice(1))).toBe(false);
    expect(shouldDecline(slow)).toBe(true);
  });

  it('tolerates occasional long frames', () => {
    const mostlyFast = Array.from({ length: WINDOW }, (_, i) => (i % 5 === 0 ? 60 : 16.7));
    expect(shouldDecline(mostlyFast)).toBe(false);
  });
});
