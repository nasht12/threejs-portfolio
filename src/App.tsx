import { lazy, Suspense } from 'react';
import { useGallery } from './state/store';
import { Announcer, Caption, Header, StatsPanel, WorkNav } from './ui/Overlay';
import { SceneViewer } from './ui/SceneViewer';
import { useFocusReturn, useGalleryKeys, useReducedMotionSync, useRouteSync } from './ui/hooks';

// three.js, R3F and drei are the bulk of the bundle; the interface paints before they arrive.
const Carousel = lazy(() => import('./carousel/Carousel'));

export default function App() {
  const mode = useGallery(s => s.mode);
  useRouteSync();
  useGalleryKeys();
  useReducedMotionSync();
  useFocusReturn();

  const inScene = mode === 'scene';
  return (
    <>
      {/* Moves focus without touching location.hash, which holds the route. */}
      <a className="skip" href="#works" onClick={e => { e.preventDefault(); document.querySelector<HTMLElement>('#works [aria-current="true"]')?.focus(); }}>
        Skip to the list of works
      </a>
      <div className="app" inert={inScene}>
        {/* The canvas is decorative for assistive tech: everything it shows is in the list and caption. */}
        <div className="stage" aria-hidden="true">
          {!inScene && <Suspense fallback={<p className="loader">Opening the gallery…</p>}><Carousel /></Suspense>}
        </div>
        <Header />
        <main className="panel">
          <Caption />
        </main>
        <WorkNav />
        <StatsPanel />
      </div>
      <Announcer />
      {inScene && <SceneViewer />}
    </>
  );
}
