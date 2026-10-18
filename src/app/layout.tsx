import type { Metadata, Viewport } from 'next';
import { Kaushan_Script, Poppins } from 'next/font/google';
import Providers from './providers';
import './globals.css';

export const metadata: Metadata = {
  // Each page sets its own title ("Menu", "Cashier"...), shown as "Menu · 3K Kitchen".
  title: { default: '3K Kitchen', template: '%s · 3K Kitchen' },
  description: 'Order from 3K Kitchen in Cavite: delivery, take-out or dine-in.',
  icons: { icon: '/brand/logo.jpg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#E8202A',
};

// Downloaded at build time and served from this site: no request to Google from visitors'
// browsers (faster, and it does not share their IP address with Google), no render-blocking CSS.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-poppins', display: 'swap' });
const kaushan = Kaushan_Script({ subsets: ['latin'], weight: '400', variable: '--font-kaushan', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${kaushan.variable}`}>
      <head>
        {/* Start the connection to the database while the app's code is still loading. */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
