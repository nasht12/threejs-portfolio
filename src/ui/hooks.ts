import { useEffect } from 'react';
import { useGallery } from '../state/store';
import { parseHash, toHash } from '../state/route';

/** URL ⇄ store. Opening a scene pushes a history entry, so the browser's Back button closes it. */
export function useRouteSync() {
  useEffect(() => {
    const ids = useGallery.getState().works.map(w => w.id);
    const apply = () => {
      const route = parseHash(location.hash, ids);
      const s = useGallery.getState();
      if (route.mode === 'walk') {
        if (s.mode === 'scene') s.closeScene();
        useGallery.getState().unfocus();
        return;
      }
      const i = ids.indexOf(route.id!);
      if (s.mode === 'scene' && route.mode !== 'scene') s.closeScene();
      useGallery.getState().focus(i);
      if (route.mode === 'scene') useGallery.getState().openScene();
    };
    apply();
    const unsub = useGallery.subscribe((s, prev) => {
      if (s.mode === prev.mode && s.index === prev.index) return;
      const hash = toHash(s.mode, s.works[s.index].id);
      if (hash === location.hash || (hash === '#/' && !location.hash)) return;
      if (s.mode === 'scene') history.pushState(null, '', hash);
      else history.replaceState(null, '', hash);
    });
    addEventListener('popstate', apply);
    return () => { unsub(); removeEventListener('popstate', apply); };
  }, []);
}

/** Arrow keys walk, Enter steps closer / goes in, Escape steps back — when focus isn't in a control that owns those keys. */
export function useGalleryKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGallery.getState();
      if (s.mode === 'scene' || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement;
      const owned = t.closest('input, select, textarea, button, a, [contenteditable]');
      if (e.key === 'Escape') { s.unfocus(); return; }
      if (owned) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); s.step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); s.step(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (s.mode === 'focus') s.openScene(); else s.focus(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}

/** Follows the OS reduced-motion setting live. */
export function useReducedMotionSync() {
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => useGallery.getState().setReducedMotion(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
}

/** Returns focus to whatever had it before a scene opened. */
export function useFocusReturn() {
  useEffect(() => {
    let before: HTMLElement | null = null;
    return useGallery.subscribe((s, prev) => {
      if (s.mode === 'scene' && prev.mode !== 'scene') before = document.activeElement as HTMLElement | null;
      if (prev.mode === 'scene' && s.mode !== 'scene') {
        requestAnimationFrame(() => {
          const target = before && document.contains(before) ? before : document.querySelector<HTMLElement>('#works [aria-current="true"]');
          target?.focus();
        });
      }
    });
  }, []);
}
