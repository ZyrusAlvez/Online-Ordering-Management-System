'use client';

import Image from 'next/image';

// Uploaded menu photos live here. next.config.ts allows the optimizer to fetch from this path only.
const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/`;

/**
 * A menu photo, served resized to the size it is drawn at (and as WebP) by Next.js's image
 * optimizer instead of the full upload. Fills its parent, which must be `relative` with a size.
 * `sizes` tells the browser how wide it is drawn, as in <img sizes>.
 * Any other URL (e.g. a photo linked from elsewhere) is shown as it is.
 */
export default function MenuPhoto({ src, alt = '', sizes }: { src: string; alt?: string; sizes: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={!src.startsWith(STORAGE)}
      className="object-cover"
    />
  );
}
