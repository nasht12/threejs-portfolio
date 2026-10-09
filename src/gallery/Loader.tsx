import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { useGallery } from '../state/store';

/** If the first load takes longer than this, the connection can't carry the preview videos well. */
const SLOW_LOAD_MS = 6000;
/** Only the first load says anything about bandwidth; the gallery remounts (from cache) after every scene. */
let firstLoadJudged = false;

/** Shown until every texture of the first load has arrived; never again after that. */
export function Loader() {
  const { active, progress } = useProgress();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (active || progress < 100 || done) return;
    setDone(true);
    if (!firstLoadJudged && performance.now() > SLOW_LOAD_MS) useGallery.getState().declineQuality();
    firstLoadJudged = true;
  }, [active, progress, done]);
  if (done) return null;
  return <p className="loader">Hanging the pictures… {Math.round(progress)}%</p>;
}
