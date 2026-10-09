import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { useGallery, effectiveQuality } from '../state/store';
import { FrameBudget } from '../perf/FrameBudget';
import { Artwork } from './Artwork';
import { CameraRig } from './CameraRig';
import { Hall } from './Hall';
import { EYE, FOV, WALK_Z, xOf } from './layout';
import { Loader } from './Loader';

/** Mounts when everything above it in the Suspense boundary has loaded, and asks for the first frame. */
function FirstFrame() {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => { invalidate(); }, [invalidate]);
  return null;
}

/**
 * The hall. frameloop="demand": nothing renders unless the camera is moving, a video frame
 * arrived, or state changed, so a visitor reading a caption costs no GPU time at all.
 */
export default function Gallery() {
  const works = useGallery(s => s.works);
  const high = useGallery(s => effectiveQuality(s) === 'high');

  return (
    <>
    <Canvas
      frameloop="demand"
      dpr={high ? [1, 2] : 1}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: FOV, near: 0.1, far: 60, position: [xOf(0), EYE, WALK_Z] }}
    >
      <color attach="background" args={['#050605']} />
      <fog attach="fog" args={['#050605', 10, 30]} />
      <hemisphereLight args={['#4a4f45', '#0a0a0a', 0.55]} />

      <Suspense fallback={null}>
        <Hall count={works.length} reflective={high} />
        {works.map((w, i) => <Artwork key={w.id} work={w} index={i} />)}
        {/* Baked once (frames=1) from a few soft light panels: gives the gilt something to reflect, no HDR download. */}
        <Environment frames={1} resolution={64}>
          <Lightformer intensity={2.4} position={[0, 4, 5]} scale={[14, 1.4, 1]} />
          <Lightformer intensity={0.7} color="#ffd9a6" position={[-5, 2, 3]} scale={[3, 3, 1]} />
          <Lightformer intensity={0.5} position={[5, 1, 4]} scale={[3, 2, 1]} />
        </Environment>
        <FirstFrame />
      </Suspense>

      <CameraRig />
      <FrameBudget />
    </Canvas>
    <Loader />
    </>
  );
}
