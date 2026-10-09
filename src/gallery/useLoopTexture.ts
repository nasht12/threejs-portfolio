import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { SRGBColorSpace, VideoTexture } from 'three';

/**
 * A looping, muted video as a texture, created only while `active` and torn down completely
 * when it is not: the element is unloaded and the texture disposed, so walking past seven
 * frames never leaves seven decoders and seven GPU textures alive.
 *
 * Returns null until the first frame is decoded, so callers keep showing the poster meanwhile.
 * With frameloop="demand", each decoded video frame requests exactly one render.
 */
export function useLoopTexture(src: string | undefined, active: boolean): VideoTexture | null {
  const invalidate = useThree(s => s.invalidate);
  const [texture, setTexture] = useState<VideoTexture | null>(null);

  useEffect(() => {
    if (!src || !active) return;
    const video = document.createElement('video');
    Object.assign(video, { src, muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
    const tex = new VideoTexture(video);
    tex.colorSpace = SRGBColorSpace;

    let alive = true;
    let handle = 0;
    const onFrame = () => {
      if (!alive) return;
      invalidate();
      handle = video.requestVideoFrameCallback(onFrame);
    };
    const onPlaying = () => alive && setTexture(tex);
    video.addEventListener('playing', onPlaying, { once: true });
    handle = video.requestVideoFrameCallback(onFrame);
    video.play().catch(() => { /* autoplay refused: the poster stays up */ });

    return () => {
      alive = false;
      video.cancelVideoFrameCallback(handle);
      video.removeEventListener('playing', onPlaying);
      video.pause();
      video.removeAttribute('src');
      video.load();
      tex.dispose();
      setTexture(null);
      invalidate();
    };
  }, [src, active, invalidate]);

  return texture;
}
