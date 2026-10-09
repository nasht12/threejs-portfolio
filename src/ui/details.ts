import { useGallery } from '../state/store';

/*
 * The details panel opens while the pointer is on the front card or on the panel itself, and while keyboard
 * focus is in the list or the panel. Moving from the card to the panel crosses a gap, so closing waits a moment.
 */
let timer: ReturnType<typeof setTimeout> | undefined;

export function showDetails() {
  clearTimeout(timer);
  useGallery.getState().setDetails(true);
}

export function hideDetailsSoon(ms = 260) {
  clearTimeout(timer);
  timer = setTimeout(() => useGallery.getState().setDetails(false), ms);
}
