import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useGallery } from '../state/store';
import { statsSink } from '../perf/statsSink';
import { SITE } from '../config';
import { hideDetailsSoon, showDetails } from './details';

export function Header() {
  return (
    <header className="bar">
      <p className="title">Three.js Scenes</p>
    </header>
  );
}

export function Tools() {
  const showStats = useGallery(s => s.showStats);
  const toggleStats = useGallery(s => s.toggleStats);
  return (
    <div className="tools">
      <button type="button" className="chip" aria-pressed={showStats} onClick={toggleStats}>Frame stats</button>
      <a className="chip" href={SITE.repo} target="_blank" rel="noopener">Source</a>
    </div>
  );
}

export function Hint() {
  return <p className="hint" aria-hidden="true">Drag, scroll or ← → to turn · click the front card to go in</p>;
}

export function Caption() {
  const work = useGallery(s => s.works[s.index]);
  const index = useGallery(s => s.index);
  const n = useGallery(s => s.works.length);
  const mode = useGallery(s => s.mode);
  const open = useGallery(s => s.details);
  const { focus } = useGallery.getState();

  return (
    <div
      className="panel"
      data-open={open}
      onMouseEnter={showDetails}
      onMouseLeave={() => hideDetailsSoon()}
      onFocus={showDetails}
      onBlur={() => hideDetailsSoon()}
    >
    <section className="caption" aria-labelledby="cap-title">
      <p className="count">{index + 1} / {n}</p>
      <h1 id="cap-title">{work.title}</h1>
      {work.after && <p className="after">{work.after}</p>}
      <p className="blurb">{work.blurb}</p>
      <ul className="tech">{work.tech.map(t => <li key={t}>{t}</li>)}</ul>
      <div className="actions">
        <button type="button" className="primary" disabled={mode === 'focus'} onClick={() => focus()}>
          {mode === 'focus' ? 'Entering…' : 'Enter the scene'}
        </button>
        <span className="size">Live scene {work.size}</span>
      </div>
    </section>
    </div>
  );
}

/** The list of works: the keyboard and screen-reader route through everything the canvas shows. */
export function WorkNav() {
  const works = useGallery(s => s.works);
  const index = useGallery(s => s.index);
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
    if (s.index === i) s.focus(i);
    else s.select(i);
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
              onFocus={showDetails}
              onBlur={() => hideDetailsSoon()}
              onKeyDown={onKeyDown(i)}
              onClick={() => activate(i)}
            >
              <span className="n">{i + 1}</span>
              <span className="t">{w.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <p id="works-help" className="sr-only">Arrow keys turn the ring. Enter on the front card goes through its portal into the live scene.</p>
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
      if (s.mode === 'focus') setMessage(`Entering ${w.title}…`);
      else if (s.mode === 'scene') setMessage(`Opened ${w.title}. ${w.controls}.`);
      else if (prev.mode === 'scene') setMessage(`Back at ${w.title}, ${s.index + 1} of ${s.works.length}.`);
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

