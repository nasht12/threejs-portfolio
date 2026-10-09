import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3, type Group } from 'three';
import { useGallery } from '../state/store';
import { CAM_DIST, CAM_Y, DEPTH, ENTER_DIST, angleOf, frontAngle, nearestIndex, radiusFor, step } from './layout';
import { ease, transition } from './transition';

const DRAG_THRESHOLD_PX = 6;
const SNAP = 5; // how quickly the ring settles a card at the front, per second

/**
 * Turns the ring and moves the camera. The ring's angle lives in a ref (it changes every frame);
 * the store only hears about it when a different card reaches the front.
 */
export function Rig({ count, children }: { count: number; children: ReactNode }) {
  const ring = useRef<Group>(null);
  const camera = useThree(s => s.camera);
  const gl = useThree(s => s.gl);
  const invalidate = useThree(s => s.invalidate);
  const r = radiusFor(count);
  const st = useRef({
    theta: angleOf(useGallery.getState().index, count), vel: 0, dragging: false, dragPx: 0, lastX: 0, lastT: 0, turned: -1,
  });
  const look = useRef(new Vector3());

  const base = { x: 0, y: CAM_Y, z: r + CAM_DIST, lz: r };
  const inside = { x: 0, y: 0, z: r + ENTER_DIST, lz: r - DEPTH };

  useLayoutEffect(() => {
    if (ring.current) ring.current.rotation.y = -st.current.theta;
    const t = ease(transition.value);
    camera.position.set(0, MathUtils.lerp(base.y, inside.y, t), MathUtils.lerp(base.z, inside.z, t));
    look.current.set(0, 0, MathUtils.lerp(base.lz, inside.lz, t));
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

  // Drag or scroll to turn the ring.
  useEffect(() => {
    const el = gl.domElement;
    const S = st.current;
    const radPerPx = () => (step(count) * 1.25) / Math.max(1, Math.min(el.clientWidth, 900) * 0.3);
    const browsing = () => useGallery.getState().mode === 'walk';
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
    let wheelGate = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || !browsing()) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      // a mouse wheel notch moves one card; a trackpad's stream of small deltas turns smoothly
      if (Math.abs(d) >= 50 && e.deltaMode === 0) {
        const now = performance.now();
        if (now - wheelGate < 280) return;
        wheelGate = now;
        useGallery.getState().step(d > 0 ? 1 : -1);
        return;
      }
      S.theta += d * (e.deltaMode === 1 ? 0.05 : 0.004);
      S.vel = 0;
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
      S.theta = MathUtils.damp(S.theta, goal, s.reducedMotion ? 1e4 : SNAP, dt);
      if (Math.abs(S.theta - goal) > 1e-4) moving = true;
      else S.theta = goal;
    }
    if (ring.current) ring.current.rotation.y = -S.theta;

    // dive with the portal: the camera follows the shared transition, it doesn't own it
    const t = ease(transition.value);
    const k = s.reducedMotion ? 1e4 : 8;
    camera.position.y = MathUtils.damp(camera.position.y, MathUtils.lerp(base.y, inside.y, t), k, dt);
    camera.position.z = MathUtils.damp(camera.position.z, MathUtils.lerp(base.z, inside.z, t), k, dt);
    camera.position.x = 0;
    look.current.z = MathUtils.damp(look.current.z, MathUtils.lerp(base.lz, inside.lz, t), k, dt);
    camera.lookAt(look.current);
    if (Math.abs(camera.position.z - MathUtils.lerp(base.z, inside.z, t)) > 1e-3) moving = true;

    if (moving) invalidate();
  });

  return <group ref={ring}>{children}</group>;
}
