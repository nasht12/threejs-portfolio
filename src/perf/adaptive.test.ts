import { describe, expect, it } from 'vitest';
import { buildLadder, looksIntegrated, nextRung, OPTS } from '../../public/scenes/adaptive-quality.js';

describe('scene quality ladder', () => {
  it('starts at the device ratio and ends at half resolution with sparse grass', () => {
    const l = buildLadder(2);
    expect(l[0]).toMatchObject({ scale: 2, grass: 1, msaa: true });
    expect(l.at(-1)).toMatchObject({ scale: 0.5, msaa: false });
    expect(l.at(-1)!.grass).toBeLessThan(0.1);
    // every rung is lighter than the one before
    for (let i = 1; i < l.length; i++) expect(l[i].scale * l[i].grass).toBeLessThan(l[i - 1].scale * l[i - 1].grass);
  });

  it('has no rungs above 1x on a 1x display', () => {
    expect(buildLadder(1)[0]).toMatchObject({ scale: 1, grass: 1 });
  });

  it('steps down when frames run long, two rungs when far behind', () => {
    expect(nextRung(30, 3, 10)).toBe(4);
    expect(nextRung(300, 3, 10)).toBe(5);
    expect(nextRung(300, 9, 10)).toBe(9); // already at the bottom
  });

  it('steps up with headroom, but never past a rung that was too slow recently', () => {
    expect(nextRung(10, 3, 10, 0)).toBe(2);
    expect(nextRung(10, 3, 10, 3)).toBe(3);
  });

  it('holds steady in between', () => {
    expect(nextRung((OPTS.slowMs + OPTS.fastMs) / 2, 4, 10)).toBe(4);
  });

  it('recognises integrated and software GPUs', () => {
    expect(looksIntegrated('ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11)')).toBe(true);
    expect(looksIntegrated('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))')).toBe(true);
    expect(looksIntegrated('Mali-G78')).toBe(true);
    expect(looksIntegrated('ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)')).toBe(false);
  });
});
