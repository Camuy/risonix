import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Gestisce la modalità schermo intero su un elemento (di norma l'app shell). */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void ref.current?.requestFullscreen();
  }, [ref]);

  return { isFullscreen, toggle };
}
