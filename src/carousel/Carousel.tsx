import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useGallery, effectiveQuality } from '../state/store';
import { FrameBudget } from '../perf/FrameBudget';
import { Loader } from '../gallery/Loader';
import { Card } from './Card';
import { Rig } from './Rig';
import { CARD, CAM_DIST, CAM_Y, FOV, radiusFor } from './layout';
import { startTransition } from './transition';

/** Mounts once everything above it in the Suspense boundary has loaded, and asks for the first frame. */
function FirstFrame() {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => { invalidate(); }, [invalidate]);
  return null;
}


/** Publishes the front card's on-screen half width (--card-half) so the details panel can sit beside it. */
function CardMetrics() {
  const height = useThree(s => s.size.height);
  useEffect(() => {
    const pxPerMetre = height / (2 * CAM_DIST * Math.tan((FOV * Math.PI) / 360));
    document.documentElement.style.setProperty('--card-half', `${Math.round((CARD.w / 2) * pxPerMetre)}px`);
  }, [height]);
  return null;
}

/**
 * The home page: a ring of portal cards. frameloop="demand" means nothing renders unless the
 * ring is turning, a preview video produced a frame, or state changed.
 */
export default function Carousel() {
  const works = useGallery(s => s.works);
  const high = useGallery(s => effectiveQuality(s) === 'high');
  // Once per mount (first visit, or back from a scene), before any child effect reads it:
  // decide whether the camera starts outside the ring or inside the portal it just left.
  useState(() => { startTransition(); return 0; });

  return (
    <>
      {/* flat = no tone mapping: everything here is a photograph, and drei's portal shaders would
          otherwise tone-map the posters (lifted, desaturated) on the card and during the dive. */}
      <Canvas
        flat
        frameloop="demand"
        dpr={high ? [1, 2] : 1}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: FOV, near: 0.05, far: 60, position: [0, CAM_Y, radiusFor(works.length) + CAM_DIST] }}
      >
        <color attach="background" args={['#f0f0f0']} />
        <Suspense fallback={null}>
          <Rig count={works.length}>
            {works.map((w, i) => <Card key={w.id} work={w} index={i} count={works.length} />)}
          </Rig>
          <FirstFrame />
        </Suspense>
        <FrameBudget />
        <CardMetrics />
      </Canvas>
      <Loader />
    </>
  );
}
