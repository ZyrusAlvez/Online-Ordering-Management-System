import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Menu images and the logo are served from Supabase Storage.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

export default nextConfig;
