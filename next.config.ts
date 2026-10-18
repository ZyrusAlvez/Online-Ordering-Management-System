import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Menu photos are served resized by the image optimizer (src/view/components/MenuPhoto.tsx).
  // Only this project's public menu folder is allowed, so the optimizer cannot be used to fetch
  // and resize images from anywhere else.
  images: {
    remotePatterns: [new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/menu-images/**`)],
    // Every upload gets a new file name, so a resized photo never goes out of date.
    minimumCacheTTL: 31536000,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Other sites (OpenStreetMap's tiles and address search) get only our origin, never a full
          // address such as /orders/<id>.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Location is asked for by our own pages only (nearest branch, delivery pin); nothing else.
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=()' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        // The bundled logo and GCash QR: cache for a day, refresh in the background for a week.
        source: '/brand/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
};

export default nextConfig;
