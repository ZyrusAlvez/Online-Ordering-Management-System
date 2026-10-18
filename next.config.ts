import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Menu images and the logo are served from Supabase Storage.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
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
