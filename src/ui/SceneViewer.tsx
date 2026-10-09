import { useEffect, useRef, useState } from 'react';
import { useGallery } from '../state/store';
import { LOOK_GROUPS, useSceneLink, type SceneLook } from '../state/sceneLink';
import { asset } from '../config';

/**
 * The live scene, full screen. The gallery canvas is unmounted while this is open (see App),
 * so only one WebGL context exists at a time — which matters on a 4 GB Chromebook.
 *
 * Scenes that speak the scene-link protocol (see state/sceneLink.ts) get their look controls drawn here, in the
 * page's own DOM, where they're keyboard- and screen-reader-accessible, and report live stats for Frame stats.
 */
export function SceneViewer() {
  const work = useGallery(s => s.works[s.index]);
  const close = useGallery(s => s.closeScene);
  const showStats = useGallery(s => s.showStats);
  const toggleStats = useGallery(s => s.toggleStats);
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

  // the bridge: only messages from this iframe, on this origin, reach the store
  useEffect(() => {
    const link = useSceneLink.getState();
    link.reset();
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== location.origin) return;
      useSceneLink.getState().receive(e.data);
    };
    window.addEventListener('message', onMessage);
    return () => { window.removeEventListener('message', onMessage); useSceneLink.getState().reset(); };
  }, [work.id]);

  const send = (msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ to: 'scene', ...msg }, location.origin);

  // Same origin, so Escape can still close the viewer while the scene has keyboard focus.
  const onLoad = () => {
    setLoaded(true);
    send({ type: 'hello' }); // in case the scene announced itself before we were listening
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
        <button type="button" aria-pressed={showStats} onClick={toggleStats}>Frame stats</button>
        <a href={url} target="_blank" rel="noopener">Open in a new tab ↗</a>
      </div>
      <SceneControls onChange={look => send({ type: 'set-look', look })} />
      {showStats && <SceneStats />}
      {!loaded && <p className="viewer-loading" role="status">Loading {work.title} ({work.size})…</p>}
      <iframe ref={frame} src={url} title={`${work.title}, interactive Three.js scene`} onLoad={onLoad} allow="fullscreen; autoplay" />
    </div>
  );
}

/** The scene's look as ordinary toggle buttons. Drawn only once the scene has said what it offers. */
function SceneControls({ onChange }: { onChange: (look: SceneLook) => void }) {
  const options = useSceneLink(s => s.options);
  const look = useSceneLink(s => s.look);
  if (!options) return null;
  return (
    <div className="scene-controls">
      {LOOK_GROUPS.map(([key, label]) => {
        const opts = options[key];
        if (!opts?.length) return null;
        return (
          <div key={key} className="scene-group" role="group" aria-label={label}>
            <span className="scene-group-label" aria-hidden="true">{label}</span>
            {opts.map(o => (
              <button key={o.id} type="button" aria-pressed={look?.[key] === o.id} onClick={() => onChange({ [key]: o.id })}>
                {o.label}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Live numbers from inside the scene: its own frame rate and where its quality ladder has settled. */
function SceneStats() {
  const perf = useSceneLink(s => s.perf);
  return (
    <pre className="scene-stats" aria-label="Scene statistics">
      {perf
        ? [`fps     ${perf.fps.toFixed(1)}`, perf.rung && `quality rung ${perf.rung}`, perf.scale && `scale   ${perf.scale}`, perf.grass && `grass   ${perf.grass}`].filter(Boolean).join('\n')
        : 'this scene does not report stats yet'}
    </pre>
  );
}
