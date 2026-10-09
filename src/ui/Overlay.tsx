import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useGallery } from '../state/store';
import { statsSink } from '../perf/statsSink';
import { SITE } from '../config';

export function Header() {
  const mode = useGallery(s => s.mode);
  const showStats = useGallery(s => s.showStats);
  const toggleStats = useGallery(s => s.toggleStats);

  return (
    <header className="bar">
      <div className="brand">
        <p className="title">Three.js Scenes</p>
        <p className="hint" aria-hidden="true">
          {mode === 'focus' ? 'Click the picture again or press Enter to go in · Esc steps back' : 'Drag or ← → to walk · click a picture to step closer'}
        </p>
      </div>
      <div className="tools">
        <button type="button" className="chip" aria-pressed={showStats} onClick={toggleStats}>Frame stats</button>
        <a className="chip" href={SITE.repo} target="_blank" rel="noopener">Source</a>
      </div>
    </header>
  );
}

export function Caption() {
  const work = useGallery(s => s.works[s.index]);
  const index = useGallery(s => s.index);
  const n = useGallery(s => s.works.length);
  const mode = useGallery(s => s.mode);
  const { focus, unfocus, openScene } = useGallery.getState();

  return (
    <section className="caption" aria-labelledby="cap-title">
      <p className="count">{index + 1} / {n}</p>
      <h1 id="cap-title">{work.title}</h1>
      {work.after && <p className="after">{work.after}</p>}
      <p className="blurb">{work.blurb}</p>
      <ul className="tech">{work.tech.map(t => <li key={t}>{t}</li>)}</ul>
      <div className="actions">
        {mode === 'focus' ? (
          <>
            <button type="button" className="primary" onClick={openScene}>Enter the scene</button>
            <button type="button" onClick={unfocus}>Back to the wall</button>
          </>
        ) : (
          <button type="button" className="primary" onClick={() => focus()}>Step closer</button>
        )}
        <span className="size">Live scene {work.size}</span>
      </div>
    </section>
  );
}

/** The list of works: the keyboard and screen-reader route through everything the canvas shows. */
export function WorkNav() {
  const works = useGallery(s => s.works);
  const index = useGallery(s => s.index);
  const mode = useGallery(s => s.mode);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (to: number) => {
    const i = (to + works.length) % works.length;
    useGallery.getState().select(i);
    refs.current[i]?.focus();
  };
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: works.length - 1 };
    if (e.key in keys) { e.preventDefault(); e.stopPropagation(); move(keys[e.key]); }
  };
  const activate = (i: number) => {
    const s = useGallery.getState();
    if (s.mode === 'focus' && s.index === i) s.openScene();
    else s.focus(i);
  };

  return (
    <nav id="works" className="works" aria-label="Works in the gallery" tabIndex={-1}>
      <ol>
        {works.map((w, i) => (
          <li key={w.id}>
            <button
              type="button"
              ref={el => { refs.current[i] = el; }}
              tabIndex={i === index ? 0 : -1}
              aria-current={i === index ? 'true' : undefined}
              aria-describedby="works-help"
              onKeyDown={onKeyDown(i)}
              onClick={() => activate(i)}
            >
              <span className="n">{i + 1}</span>
              <span className="t">{w.title}</span>
              {i === index && mode === 'focus' && <span className="sr-only"> (standing here)</span>}
            </button>
          </li>
        ))}
      </ol>
      <p id="works-help" className="sr-only">Arrow keys move along the wall. Enter steps closer; Enter again opens the live scene.</p>
    </nav>
  );
}

/** Polite live region describing where the visitor is. */
export function Announcer() {
  const [message, setMessage] = useState('');
  useEffect(() => useGallery.subscribe((s, prev) => {
    const w = s.works[s.index];
    const where = `${w.title}, ${s.index + 1} of ${s.works.length}${w.after ? `. ${w.after}` : ''}.`;
    if (s.mode !== prev.mode) {
      if (s.mode === 'focus' && prev.mode === 'walk') setMessage(`Standing at ${where} Press Enter to open the live scene, Escape to step back.`);
      else if (s.mode === 'scene') setMessage(`Opened ${w.title}. ${w.controls}.`);
      else if (prev.mode === 'scene') setMessage(`Back in the gallery at ${w.title}.`);
      else if (s.mode === 'walk') setMessage('Back at the wall.');
    } else if (s.index !== prev.index) {
      setMessage(where);
    } else if (s.autoQuality !== prev.autoQuality && s.qualitySetting === 'auto') {
      setMessage('Frames were running long, so the gallery switched to the light quality tier.');
    }
  }), []);
  return <p className="sr-only" role="status" aria-live="polite">{message}</p>;
}

export function StatsPanel() {
  const show = useGallery(s => s.showStats);
  if (!show) return null;
  return <pre className="stats" ref={el => { statsSink.el = el; }} aria-label="Renderer statistics">measuring…</pre>;
}

