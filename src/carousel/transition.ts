import { useGallery } from '../state/store';

/**
 * How far through the portal we are: 0 = looking at the ring, 1 = inside the front card's scene.
 * Shared by the front card (which drives the portal blend) and the camera rig (which dives with it).
 * A plain object, not React state: it changes every frame.
 */
export const transition = { value: 0 };

/** Coming back from a live scene, start inside the portal and pull back out of it. */
export function startTransition() {
  const last = useGallery.getState().events.at(-1);
  transition.value = last?.type === 'close' ? 1 : 0;
}

export const ease = (t: number) => t * t * (3 - 2 * t);
