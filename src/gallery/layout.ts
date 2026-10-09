/** World units are metres. The wall runs along +x at z = 0, facing +z; the floor is y = 0. */
export const SPACING = 5.4;
export const EYE = 1.6;
export const WALK_Z = 6.6;
export const ART_Y = 1.75;
export const FOV = 40;
export const BORDER = 0.13;
/** Every picture fits this box, keeping its aspect. */
export const ART_BOX = { w: 2.5, h: 1.7 } as const;

export const xOf = (i: number) => i * SPACING;

export function artSize(aspect: number) {
  const w = Math.min(ART_BOX.w, ART_BOX.h * aspect);
  return { w, h: w / aspect };
}

/** Camera distance at which the framed picture fills `fill` of the view height. */
export function focusDistance(h: number, fov = FOV, fill = 0.6) {
  return (h + 2 * BORDER) / fill / (2 * Math.tan((fov * Math.PI) / 360));
}

export function nearestIndex(x: number, n: number) {
  return Math.max(0, Math.min(n - 1, Math.round(x / SPACING)));
}

export function walkLimits(n: number) {
  return { min: -SPACING * 0.6, max: xOf(n - 1) + SPACING * 0.6 };
}

export const wallLength = (n: number) => xOf(n - 1) + SPACING * 3;
