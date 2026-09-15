import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'FundFlow Finance OS',
    short_name: 'FundFlow',
    description: 'Secure lending, assigned collections and portfolio reporting.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f3f7f5',
    theme_color: '#0c3327',
    orientation: 'any',
    categories: ['finance', 'business', 'productivity'],
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}