/** World units are metres. Cards stand on a ring around the y axis, facing outward; the camera looks at the front of the ring. */
export const CARD = { w: 1.42, h: 1.9, r: 0.1 } as const;
/** How far behind each card its scene sits: the depth you see through the window, and fly into. */
export const DEPTH = 2;
/** Height of the backdrop inside each portal; its width follows the poster's aspect. */
export const BACKDROP_H = 2.9;
/** Default camera distance from the front card; scroll zooms between ZOOM.min and ZOOM.max. */
export const CAM_DIST = 5.6;
export const ZOOM = { min: 2.4, max: 10 } as const;
export const CAM_Y = 0.15;
/** The camera aims a little below the cards so they sit above the details panel at the bottom. */
export const LOOK_Y = -0.3;
export const FOV = 38;
/** How close the camera gets to the card when it dives through. */
export const ENTER_DIST = 0.45;

const TAU = Math.PI * 2;

export const wrap = (i: number, n: number) => ((i % n) + n) % n;
export const step = (n: number) => TAU / n;
export const angleOf = (i: number, n: number) => i * step(n);

/** Ring radius that keeps a gap between neighbours however many cards there are. */
export const radiusFor = (n: number) => Math.max(2.9, (n * (CARD.w + 0.5)) / TAU);

/** The card nearest the front for a ring turned by `theta`. */
export const nearestIndex = (theta: number, n: number) => wrap(Math.round(theta / step(n)), n);

/** The angle that brings card `i` to the front with the least rotation from `theta`. */
export function frontAngle(theta: number, i: number, n: number) {
  const base = angleOf(i, n);
  return base + Math.round((theta - base) / TAU) * TAU;
}

export const backdropSize = (aspect: number) => ({ w: BACKDROP_H * aspect, h: BACKDROP_H });

/**
 * The part of a backdrop (in UV units) a viewer sees through a card window, given the camera's
 * position in the card's local space. Used to fake the portal on cards that aren't the live one,
 * so the swap to the real portal at the front doesn't jump.
 */
export function windowCrop(aspect: number, cam: { x: number; y: number; z: number }) {
  const { w: bw, h: bh } = backdropSize(aspect);
  const z = Math.max(0.2, cam.z);
  const grow = (z + DEPTH) / z;
  const rx = Math.min(1, (CARD.w * grow) / bw);
  const ry = Math.min(1, (CARD.h * grow) / bh);
  // the sight line through the card centre lands on the backdrop opposite the camera
  const cx = 0.5 + (-cam.x * DEPTH) / z / bw;
  const cy = 0.5 + (-cam.y * DEPTH) / z / bh;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { rx, ry, ox: clamp(cx - rx / 2, 0, 1 - rx), oy: clamp(cy - ry / 2, 0, 1 - ry) };
}

/** Zoom by a wheel delta (pixels). Multiplicative, so each notch feels the same near or far. */
export function zoomBy(dist: number, deltaY: number) {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, dist * Math.exp(deltaY * 0.0012)));
}
