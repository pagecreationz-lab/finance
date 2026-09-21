import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'RMV Finance — Lending & Collections',
  description: 'Role-based lending, repayment collection and portfolio management.',
  applicationName: 'RMV Finance',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'RMV Finance' },
  formatDetection: { telephone: false },
  icons: { icon: '/pwa-192.png', apple: '/pwa-192.png' },
  openGraph: {
    title: 'RMV Finance — Lending & Collections',
    description: 'Lending and collections, in one flow.',
    images: [{ url: '/rmv-finance-logo.jpeg', width: 1254, height: 1254, alt: 'RMV Finance finance operations portal' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RMV Finance — Lending & Collections',
    description: 'Lending and collections, in one flow.',
    images: ['/rmv-finance-logo.jpeg'],
  },
};

export const viewport: Viewport = {
  themeColor: '#0c3327',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
