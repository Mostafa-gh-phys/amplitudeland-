import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { resolveAppAssetUrl } from '../lib/appearance.ts';

interface PlateImageProps {
  src?: string;
  alt: string;
  caption?: string;
  aspectClass?: string;
  className?: string;
}

export function PlateImage({
  src,
  alt,
  caption,
  aspectClass = 'aspect-video',
  className = '',
}: PlateImageProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = resolveAppAssetUrl(src);

  return (
    <figure className={`m-0 flex flex-col ${className}`}>
      <div
        className={`relative overflow-hidden rounded-md border border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-900 ${aspectClass}`}
      >
        {resolvedSrc && !failed ? (
          <img
            src={resolvedSrc}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-stone-100 via-stone-50 to-stone-200 p-6 text-center dark:from-stone-900 dark:via-stone-900 dark:to-stone-800">
            <BookOpen className="h-7 w-7 text-stone-400 dark:text-stone-600" aria-hidden="true" />
            <span className="max-w-xs text-xs font-medium text-stone-500 dark:text-stone-400">
              {alt}
            </span>
          </div>
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 font-editorial text-xs italic text-stone-500 dark:text-stone-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
