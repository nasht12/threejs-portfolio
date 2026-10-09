import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3, type Group } from 'three';
import { useGallery } from '../state/store';
import { CAM_DIST, CAM_Y, DEPTH, ENTER_DIST, LOOK_Y, angleOf, frontAngle, nearestIndex, radiusFor, step, zoomBy } from './layout';
import { ease, transition } from './transition';

const DRAG_THRESHOLD_PX = 6;
const SNAP = 5; // how quickly the ring settles a card at the front, per second

/**
 * Turns the ring and moves the camera, like the pmndrs portals example: drag slides the cards,
 * scroll (or a trackpad pinch) zooms, clicking the front card dives in. Ring angle and zoom live in
 * a ref (they change every frame); the store only hears when a different card reaches the front.
 */
export function Rig({ count, children }: { count: number; children: ReactNode }) {
  const ring = useRef<Group>(null);
  const camera = useThree(s => s.camera);
  const gl = useThree(s => s.gl);
  const invalidate = useThree(s => s.invalidate);
  const r = radiusFor(count);
  const st = useRef({
    theta: angleOf(useGallery.getState().index, count), vel: 0, dragging: false, dragPx: 0, lastX: 0, lastT: 0, turned: -1,
    dist: CAM_DIST, distGoal: CAM_DIST,
  });
  const look = useRef(new Vector3());

  /** Camera pose for a dive progress t (0 = on the ring at the current zoom, 1 = inside the front card). */
  const pose = (t: number, dist: number) => ({
    y: MathUtils.lerp(CAM_Y, 0, t),
    z: MathUtils.lerp(r + dist, r + ENTER_DIST, t),
    ly: MathUtils.lerp(LOOK_Y, 0, t),
    lz: MathUtils.lerp(r, r - DEPTH, t),
  });

  useLayoutEffect(() => {
    if (ring.current) ring.current.rotation.y = -st.current.theta;
    const p = pose(ease(transition.value), st.current.dist);
    camera.position.set(0, p.y, p.z);
    look.current.set(0, p.ly, p.lz);
    camera.lookAt(look.current);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, invalidate]);

  // A card chosen from the UI (keys, list, a click on a side card): turn it to the front.
  useEffect(() => useGallery.subscribe((s, prev) => {
    if (s.index !== prev.index && s.index !== st.current.turned) st.current.vel = 0;
    st.current.turned = -1;
    invalidate();
  }), [invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    const S = st.current;
    const radPerPx = () => (step(count) * 1.25) / Math.max(1, Math.min(el.clientWidth, 900) * 0.3);
    const browsing = () => useGallery.getState().mode === 'walk';

    // drag: slide the cards
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !browsing()) return;
      Object.assign(S, { dragging: true, dragPx: 0, lastX: e.clientX, lastT: performance.now(), vel: 0 });
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!S.dragging) return;
      const dx = e.clientX - S.lastX;
      S.lastX = e.clientX;
      S.dragPx += Math.abs(dx);
      if (S.dragPx < DRAG_THRESHOLD_PX) return;
      const d = -dx * radPerPx();
      S.theta += d;
      const now = performance.now();
      S.vel = (d / Math.max(1, now - S.lastT)) * 16.7; // radians per 60 Hz frame
      S.lastT = now;
      invalidate();
    };
    const up = () => {
      S.dragging = false;
      if (performance.now() - S.lastT > 90) S.vel = 0;
      invalidate();
    };

    // wheel: zoom in and out; a sideways trackpad swipe slides the cards; a pinch arrives as ctrl+wheel and zooms
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!browsing()) return;
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        S.theta += e.deltaX * unit * 0.004;
        S.vel = 0;
      } else {
        S.distGoal = zoomBy(S.distGoal, e.deltaY * unit * (e.ctrlKey ? 4 : 1));
      }
      invalidate();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl, invalidate, count]);

  useFrame((_, delta) => {
    const S = st.current;
    const s = useGallery.getState();
    const dt = Math.min(delta, 0.05);
    const snap = s.reducedMotion ? 1e4 : SNAP;
    let moving = S.dragging;

    if (!S.dragging && S.vel !== 0) {
      S.theta += S.vel * dt * 60;
      S.vel *= Math.pow(0.9, dt * 60);
      if (Math.abs(S.vel) < 1e-4) S.vel = 0;
      moving = true;
    }
    if (S.dragging || S.vel !== 0) {
      const nearest = nearestIndex(S.theta, count);
      if (nearest !== s.index) { S.turned = nearest; s.select(nearest, 'walk'); }
    } else {
      const goal = frontAngle(S.theta, s.index, count);
      S.theta = MathUtils.damp(S.theta, goal, snap, dt);
      if (Math.abs(S.theta - goal) > 1e-4) moving = true;
      else S.theta = goal;
    }
    if (ring.current) ring.current.rotation.y = -S.theta;

    S.dist = MathUtils.damp(S.dist, S.distGoal, s.reducedMotion ? 1e4 : 6, dt);
    if (Math.abs(S.dist - S.distGoal) > 1e-3) moving = true;
    else S.dist = S.distGoal;

    // dive with the portal: the camera follows the shared transition, it doesn't own it
    const p = pose(ease(transition.value), S.dist);
    const k = s.reducedMotion ? 1e4 : 8;
    camera.position.set(0, MathUtils.damp(camera.position.y, p.y, k, dt), MathUtils.damp(camera.position.z, p.z, k, dt));
    look.current.set(0, MathUtils.damp(look.current.y, p.ly, k, dt), MathUtils.damp(look.current.z, p.lz, k, dt));
    camera.lookAt(look.current);
    if (Math.abs(camera.position.z - p.z) + Math.abs(look.current.y - p.ly) > 1e-3) moving = true;

    if (moving) invalidate();
  });

  return <group ref={ring}>{children}</group>;
}
