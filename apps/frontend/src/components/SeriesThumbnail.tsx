import { imageLoader, type Types } from '@cornerstonejs/core';
import { useEffect, useRef, useState } from 'react';

import { fetchSeriesInstances } from '../api/client';
import { imageIdForInstance, isImageInstance } from '../api/stack';
import { ensureCornerstone } from '../cornerstone/init';

interface SeriesThumbnailProps {
  seriesId: number;
  alt: string;
}

type ThumbStatus = 'idle' | 'loading' | 'ready' | 'error';

function windowToCanvas(canvas: HTMLCanvasElement, image: Types.IImage): void {
  const { columns, rows } = image;
  const canvas2d = canvas.getContext('2d');
  if (!canvas2d) throw new Error('Contesto 2D non disponibile');

  const pixelData = image.getPixelData();
  const windowCenter = Array.isArray(image.windowCenter)
    ? image.windowCenter[0]
    : image.windowCenter;
  const windowWidth = Array.isArray(image.windowWidth) ? image.windowWidth[0] : image.windowWidth;

  const center = Number.isFinite(windowCenter)
    ? windowCenter
    : (image.minPixelValue + image.maxPixelValue) / 2;
  const width =
    Number.isFinite(windowWidth) && windowWidth > 0
      ? windowWidth
      : image.maxPixelValue - image.minPixelValue || 1;
  const lower = center - width / 2;

  canvas.width = columns;
  canvas.height = rows;
  const output = canvas2d.createImageData(columns, rows);
  const target = output.data;
  for (let index = 0; index < columns * rows; index += 1) {
    const scaled = ((Number(pixelData[index]) - lower) / width) * 255;
    const value = scaled < 0 ? 0 : scaled > 255 ? 255 : scaled;
    const offset = index * 4;
    target[offset] = value;
    target[offset + 1] = value;
    target[offset + 2] = value;
    target[offset + 3] = 255;
  }
  canvas2d.putImageData(output, 0, 0);
}

/**
 * Miniatura di una serie (P2-03): carica pigramente la slice centrale quando
 * entra nel viewport del pannello e la finestra in scala di grigi.
 */
export function SeriesThumbnail({ seriesId, alt }: SeriesThumbnailProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<ThumbStatus>('idle');

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    let disposed = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setStatus('loading');

        void (async () => {
          await ensureCornerstone();
          const instances = await fetchSeriesInstances(seriesId);
          if (disposed) return;
          const images = instances.filter(isImageInstance);
          const middle = images[Math.floor(images.length / 2)];
          if (!middle) throw new Error('Serie senza immagini');

          const image = await imageLoader.loadImage(imageIdForInstance(middle.id));
          if (disposed) return;
          windowToCanvas(canvas, image);
          setStatus('ready');
        })().catch(() => {
          if (!disposed) setStatus('error');
        });
      },
      { rootMargin: '64px' },
    );

    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [seriesId]);

  return (
    <span ref={hostRef} className="series-thumbnail" data-status={status}>
      <canvas ref={canvasRef} className="series-thumbnail__canvas" aria-label={alt} />
    </span>
  );
}
