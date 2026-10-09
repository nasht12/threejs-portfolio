import { useEffect, useRef, useState } from 'react';
import { useGallery } from '../state/store';
import { asset } from '../config';

/**
 * The live scene, full screen. The gallery canvas is unmounted while this is open (see App),
 * so only one WebGL context exists at a time — which matters on a 4 GB Chromebook.
 */
export function SceneViewer() {
  const work = useGallery(s => s.works[s.index]);
  const close = useGallery(s => s.closeScene);
  const back = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const url = asset(work.scene);

  useEffect(() => { back.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Same origin, so Escape can still close the viewer while the scene has keyboard focus.
  const onLoad = () => {
    setLoaded(true);
    try {
      frame.current?.contentWindow?.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    } catch { /* not reachable: the back button still works */ }
  };

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-labelledby="viewer-title">
      <div className="viewer-bar">
        <button ref={back} type="button" onClick={close}>← Gallery</button>
        <h2 id="viewer-title">{work.title}</h2>
        <p className="controls">{work.controls}</p>
        <a href={url} target="_blank" rel="noopener">Open in a new tab ↗</a>
      </div>
      {!loaded && <p className="viewer-loading" role="status">Loading {work.title} ({work.size})…</p>}
      <iframe ref={frame} src={url} title={`${work.title}, interactive Three.js scene`} onLoad={onLoad} allow="fullscreen; autoplay" />
    </div>
  );
}
