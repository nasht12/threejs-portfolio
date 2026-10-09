import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';

/** Shown until every texture of the first load has arrived; never again after that. */
export function Loader() {
  const { active, progress } = useProgress();
  const [done, setDone] = useState(false);
  useEffect(() => { if (!active && progress >= 100) setDone(true); }, [active, progress]);
  if (done) return null;
  return <p className="loader">Hanging the pictures… {Math.round(progress)}%</p>;
}
